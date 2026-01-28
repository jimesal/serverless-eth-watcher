import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";
import { AddressActivityEntry, AddressActivityWebhook, ASSETS } from "../types/alchemyWebhookTypes";
import {
  BUCKET_SIZE_SECONDS,
  COOLDOWN_SECONDS,
  SNS_TOPIC_ARN,
  THRESHOLD_ETH,
  TRACKED_WALLETS,
  TRANSACTIONS_TABLE,
  WALLET_BUCKETS_TABLE,
  WINDOW_SECONDS,
} from "./../env";

let ddb: Pick<DynamoDBDocumentClient, "send"> = DynamoDBDocumentClient.from(
  new DynamoDBClient({}),
  {
  marshallOptions: { removeUndefinedValues: true },
  }
);
let sns: Pick<SNSClient, "send"> = new SNSClient({});

// Exported for tests to inject mock clients
export function setDdb(client: Pick<DynamoDBDocumentClient, "send">) {
  ddb = client;
}

export function setSns(client: Pick<SNSClient, "send">) {
  sns = client;
}

type Direction = "from" | "to";

type ParsedActivity = {
  txHash: string;
  from: string;
  to: string;
  amountEth: number;
};

type IncomingBody = AddressActivityWebhook;

type BaseTarget = {
  direction: Direction;
  wallet: string;
  counterparty: string;
};

type TargetContext = BaseTarget & {
  trackedWallet?: string;
  trackedWalletIndex?: number;
};

type ThresholdMessage = {
  txHash: string;
  direction: Direction;
  wallet: string;
  trackedWalletIndex?: number;
  counterparty?: string;
  totalEth: number;
  windowSec: number;
  timestamp: number;
  source: "alchemy-webhook";
  requestId?: string;
};

const TRACKED_WALLET_LOOKUP = buildTrackedWalletLookup(TRACKED_WALLETS);
const HAS_TRACKED_WALLETS = TRACKED_WALLET_LOOKUP.size > 0;

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  let parsedBody: unknown;
  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    console.error('ingest.invalidJson', {
      requestId: event.requestContext?.requestId,
      error: (e as Error).message,
    });
    return resp(400, `invalid json: ${(e as Error).message}`);
  }

  if (!isAddressActivityWebhookPayload(parsedBody)) {
    console.warn('ingest.invalidShape', {
      requestId: event.requestContext?.requestId,
    });
    return resp(400, "payload does not match AddressActivityWebhook");
  }

  const raw = parsedBody;
  const activities = extractEthActivities(raw);
  if (activities.length === 0) {
    console.info('ingest.noEthActivity', {
      requestId: event.requestContext?.requestId,
      totalActivities: raw.event.activity.length,
    });
    return resp(200, "ignored non-ETH asset");
  }

  console.info('ingest.beginProcessing', {
    requestId: event.requestContext?.requestId,
    ethActivityCount: activities.length,
    trackedWalletsConfigured: TRACKED_WALLETS.length,
  });

  const now = Math.floor(Date.now() / 1000);
  const bucketStart = bucketStartEpoch(now, BUCKET_SIZE_SECONDS);
  const observedTrackedWallets = new Set<string>();

  for (const tx of activities) {
    const targets = selectTargets(tx);

    if (targets.length === 0) {
      console.debug('ingest.activitySkippedNoTrackedWallet', {
        requestId: event.requestContext?.requestId,
        txHash: tx.txHash,
        trackedWalletsConfigured: TRACKED_WALLETS.length,
      });
      continue;
    }

    for (const t of targets) {
      const walletAddress = t.trackedWallet ?? t.wallet;
      if (t.trackedWallet) {
        observedTrackedWallets.add(t.trackedWallet.toLowerCase());
      }

      // 1) Idempotency: Put tx record only if new (txHash+direction)
      const alreadyProcessed = await putTransactionIfNew({
        txHash: tx.txHash,
        direction: t.direction,
        wallet: walletAddress,
        amountEth: tx.amountEth,
        ts: now,
        raw,
      });

      if (alreadyProcessed) {
        console.debug('ingest.skippedDuplicate', {
          requestId: event.requestContext?.requestId,
          txHash: tx.txHash,
          direction: t.direction,
          trackedWallet: t.trackedWallet,
          trackedWalletIndex: t.trackedWalletIndex,
        });
        continue;
      }

      // 2) Add to bucket sum (rolling window implemented as bucketed counters)
      await addToWalletBucket({
        direction: t.direction,
        wallet: walletAddress,
        bucketStart,
        amountEth: tx.amountEth,
        now,
      });

      console.debug('ingest.bucketUpdated', {
        requestId: event.requestContext?.requestId,
        direction: t.direction,
        trackedWallet: t.trackedWallet,
        trackedWalletIndex: t.trackedWalletIndex,
        wallet: walletAddress,
        counterparty: t.counterparty,
        amountEth: tx.amountEth,
        bucketStart,
      });

      // 3) Sum window and alert if exceeded + cooldown allows
      const total = await sumWindow({
        direction: t.direction,
        wallet: walletAddress,
        now,
      });

      console.debug('ingest.windowTotal', {
        requestId: event.requestContext?.requestId,
        direction: t.direction,
        trackedWallet: t.trackedWallet,
        trackedWalletIndex: t.trackedWalletIndex,
        wallet: walletAddress,
        totalEth: total,
      });

      if (SNS_TOPIC_ARN && total >= THRESHOLD_ETH) {
        const okToAlert = await checkAndSetCooldown({
          direction: t.direction,
          wallet: walletAddress,
          now,
        });

        if (!okToAlert) {
          console.info('ingest.cooldownActive', {
            requestId: event.requestContext?.requestId,
            direction: t.direction,
            trackedWallet: t.trackedWallet,
            trackedWalletIndex: t.trackedWalletIndex,
            wallet: walletAddress,
            counterparty: t.counterparty,
            totalEth: total,
          });
        }

        if (okToAlert) {
          const msg: ThresholdMessage = {
            txHash: tx.txHash,
            direction: t.direction,
            wallet: walletAddress,
            trackedWalletIndex: t.trackedWalletIndex,
            counterparty: t.counterparty,
            totalEth: total,
            windowSec: WINDOW_SECONDS,
            timestamp: now,
            source: "alchemy-webhook",
            requestId: event.requestContext?.requestId,
          };
          // Don’t fail ingestion if SNS fails
          console.info('ingest.alertTriggered', {
            requestId: event.requestContext?.requestId,
            direction: t.direction,
            trackedWallet: t.trackedWallet,
            trackedWalletIndex: t.trackedWalletIndex,
            wallet: walletAddress,
            counterparty: t.counterparty,
            totalEth: total,
          });
          try {
            await sns.send(
              new PublishCommand({
                TopicArn: SNS_TOPIC_ARN,
                Message: JSON.stringify(msg),
              })
            );
            console.debug('ingest.snsPublishSuccess', {
              requestId: event.requestContext?.requestId,
              txHash: tx.txHash,
              direction: t.direction,
              trackedWallet: t.trackedWallet,
              trackedWalletIndex: t.trackedWalletIndex,
              wallet: walletAddress,
              counterparty: t.counterparty,
            });
          } catch (e) {
            console.error('ingest.snsPublishFailed', {
              requestId: event.requestContext?.requestId,
              txHash: tx.txHash,
              direction: t.direction,
              error: (e as Error).message,
              trackedWallet: t.trackedWallet,
              trackedWalletIndex: t.trackedWalletIndex,
              wallet: walletAddress,
              counterparty: t.counterparty,
            });
          }
        }
      }
    }
  }

  console.info('ingest.completed', {
    requestId: event.requestContext?.requestId,
    processedActivities: activities.length,
    trackedWalletMatches: observedTrackedWallets.size,
  });

  // Always 200 so webhook sender doesn't retry unnecessarily
  return resp(200, "ok");
};

/* ---------------- Parsing ---------------- */

function extractEthActivities(input: IncomingBody): ParsedActivity[] {
  return input.event.activity
    .filter((activity) => activity.asset === ASSETS.ETH)
    .map((activity) => ({
      txHash: activity.hash,
      from: activity.fromAddress,
      to: activity.toAddress,
      amountEth: activity.value,
    }));
}

function selectTargets(tx: ParsedActivity): TargetContext[] {
  const annotated = [
    annotateTarget({ direction: "from", wallet: tx.from, counterparty: tx.to }),
    annotateTarget({ direction: "to", wallet: tx.to, counterparty: tx.from }),
  ];

  if (!HAS_TRACKED_WALLETS) {
    return annotated;
  }

  return annotated.filter((target) => Boolean(target.trackedWallet));
}

function annotateTarget(target: BaseTarget): TargetContext {
  const normalized = normalizeAddress(target.wallet);
  const tracked = normalized ? TRACKED_WALLET_LOOKUP.get(normalized) : undefined;
  if (!tracked) {
    return target;
  }
  return {
    ...target,
    trackedWallet: tracked.address,
    trackedWalletIndex: tracked.index,
  };
}

/* ---------------- DynamoDB: Transactions (idempotency) ---------------- */

async function putTransactionIfNew(args: {
  txHash: string;
  direction: Direction;
  wallet: string;
  amountEth: number;
  ts: number;
  raw: IncomingBody;
}): Promise<boolean /* alreadyProcessed */> {
  const pk = `tx#${args.txHash}#${args.direction}`;

  try {
    await ddb.send(
      new PutCommand({
        TableName: TRANSACTIONS_TABLE,
        Item: {
          pk,
          txHash: args.txHash,
          direction: args.direction,
          wallet: args.wallet,
          amountEth: round9(args.amountEth),
          ts: args.ts,
          // optionally store raw payload (can increase cost):
          // raw: JSON.stringify(args.raw),
        },
        ConditionExpression: "attribute_not_exists(pk)",
      })
    );
    return false;
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") return true;
    throw e;
  }
}

/* ---------------- DynamoDB: WalletBuckets (rolling sum) ---------------- */

async function addToWalletBucket(args: {
  direction: Direction;
  wallet: string;
  bucketStart: number;
  amountEth: number;
  now: number;
}): Promise<void> {
  const pk = `${args.direction}#${args.wallet}`;
  const sk = args.bucketStart;

  // Keep buckets around a bit longer than the window
  const expiresAt = args.now + WINDOW_SECONDS + BUCKET_SIZE_SECONDS * 2;

  await ddb.send(
    new UpdateCommand({
      TableName: WALLET_BUCKETS_TABLE,
      Key: { pk, sk },
      UpdateExpression: "ADD sumEth :inc SET updatedAt = :u, expiresAt = :e",
      ExpressionAttributeValues: {
        ":inc": round9(args.amountEth),
        ":u": args.now,
        ":e": expiresAt,
      },
    })
  );
}

async function sumWindow(args: {
  direction: Direction;
  wallet: string;
  now: number;
}): Promise<number> {
  const pk = `${args.direction}#${args.wallet}`;

  const start = args.now - WINDOW_SECONDS;
  const startBucket = bucketStartEpoch(start, BUCKET_SIZE_SECONDS);
  const endBucket = bucketStartEpoch(args.now, BUCKET_SIZE_SECONDS);

  const out = await ddb.send(
    new QueryCommand({
      TableName: WALLET_BUCKETS_TABLE,
      KeyConditionExpression: "pk = :pk AND sk BETWEEN :a AND :b",
      ExpressionAttributeValues: {
        ":pk": pk,
        ":a": startBucket,
        ":b": endBucket,
      },
      ConsistentRead: false,
    })
  );

  const items = out.Items ?? [];
  let total = 0;
  for (const it of items) {
    // skip cooldown row (sk = -1)
    if (it.sk === -1) continue;
    const v = typeof it.sumEth === "number" ? it.sumEth : 0;
    total += v;
  }
  return round9(total);
}

/* ---------------- Cooldown gating ---------------- */
// Uses a special item in WalletBuckets table with sk = -1
async function checkAndSetCooldown(args: {
  direction: Direction;
  wallet: string;
  now: number;
}): Promise<boolean> {
  const pk = `${args.direction}#${args.wallet}`;
  const sk = -1;

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: WALLET_BUCKETS_TABLE,
        Key: { pk, sk },
        UpdateExpression: "SET #lastAlert = :now",
        ConditionExpression:
          "attribute_not_exists(#lastAlert) OR #lastAlert < :cutoff",
        ExpressionAttributeValues: {
          ":now": args.now,
          ":cutoff": args.now - COOLDOWN_SECONDS,
        },
        ExpressionAttributeNames: {
          "#lastAlert": "lastAlert",
        },
      })
    );
    return true;
  } catch (e: any) {
    if (e?.name === "ConditionalCheckFailedException") return false;
    throw e;
  }
}

/* ---------------- Helpers ---------------- */

function buildTrackedWalletLookup(list: readonly string[]) {
  const lookup = new Map<string, { address: string; index: number }>();
  list.forEach((address, index) => {
    const normalized = normalizeAddress(address);
    if (!normalized || lookup.has(normalized)) return;
    lookup.set(normalized, { address, index });
  });
  return lookup;
}

function normalizeAddress(value?: string): string | undefined {
  if (!value) return undefined;
  return value.trim().toLowerCase();
}

function bucketStartEpoch(epochSec: number, bucketSizeSec: number): number {
  return Math.floor(epochSec / bucketSizeSec) * bucketSizeSec;
}

function round9(n: number): number {
  return Math.round(n * 1e9) / 1e9;
}

function resp(code: number, body: string): APIGatewayProxyResultV2 {
  return {
    statusCode: code,
    headers: { "content-type": "text/plain" },
    body,
  };
}


function isAddressActivityWebhookPayload(value: unknown): value is AddressActivityWebhook {
  if (!value || typeof value !== "object") return false;
  const payload = value as AddressActivityWebhook;

  if (
    typeof payload.webhookId !== "string" ||
    typeof payload.id !== "string" ||
    typeof payload.createdAt !== "string" ||
    payload.type !== "ADDRESS_ACTIVITY"
  ) {
    return false;
  }

  if (!payload.event || !Array.isArray(payload.event.activity)) {
    return false;
  }

  return payload.event.activity.every(isAddressActivityEntryPayload);
}

function isAddressActivityEntryPayload(value: unknown): value is AddressActivityEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as AddressActivityEntry;
  const assetValues = Object.values(ASSETS);

  return (
    typeof entry.hash === "string" &&
    typeof entry.fromAddress === "string" &&
    typeof entry.toAddress === "string" &&
    typeof entry.value === "number" &&
    assetValues.includes(entry.asset as (typeof ASSETS)[keyof typeof ASSETS])
  );
}
