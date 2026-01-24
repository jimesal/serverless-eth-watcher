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

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const sns = new SNSClient({});

const TRANSACTIONS_TABLE = mustEnv("TRANSACTIONS_TABLE");
const WALLET_BUCKETS_TABLE = mustEnv("WALLET_BUCKETS_TABLE");
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN ?? "";

const THRESHOLD_ETH = mustEnvNumber("THRESHOLD_ETH"); // e.g. 5
const WINDOW_SECONDS = mustEnvInt("WINDOW_SECONDS"); // e.g. 300
const COOLDOWN_SECONDS = mustEnvInt("COOLDOWN_SECONDS"); // e.g. 30
const BUCKET_SIZE_SECONDS = envInt("BUCKET_SIZE_SECONDS", 60);

type Direction = "from" | "to";

type AlchemyActivity = {
  hash?: string;
  fromAddress?: string;
  toAddress?: string;
  asset?: string;
  value?: number;
  rawContract?: { rawValue?: string; decimals?: number };
};

type WebhookEvent = {
  id?: string;
  type?: string;
  event?: {
    network?: string;
    activity?: Array<AlchemyActivity>;
  };
};

type ParsedActivity = {
  txHash: string;
  from: string;
  to: string;
  amountEth: number;
};

type ThresholdMessage = {
  txHash: string;
  direction: Direction;
  wallet: string;
  totalEth: number;
  windowSec: number;
  timestamp: number;
  source: "alchemy-webhook";
  requestId?: string;
};

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  let body: unknown;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return resp(400, `invalid json: ${(e as Error).message}`);
  }

  const parsed = parseWebhook(body);
  if (!parsed.ok) return resp(400, parsed.error);

  const { activities, raw } = parsed.data;
  if (activities.length === 0) return resp(200, "ignored non-ETH asset");

  const now = Math.floor(Date.now() / 1000);
  const bucketStart = bucketStartEpoch(now, BUCKET_SIZE_SECONDS);

  for (const tx of activities) {
    const targets: Array<{ direction: Direction; wallet: string }> = [
      { direction: "from", wallet: tx.from },
      { direction: "to", wallet: tx.to },
    ];

    for (const t of targets) {
      // 1) Idempotency: Put tx record only if new (txHash+direction)
      const alreadyProcessed = await putTransactionIfNew({
        txHash: tx.txHash,
        direction: t.direction,
        wallet: t.wallet,
        amountEth: tx.amountEth,
        ts: now,
        raw,
      });

      if (alreadyProcessed) {
        // This tx+direction was already counted; skip bucket update.
        continue;
      }

      // 2) Add to bucket sum (rolling window implemented as bucketed counters)
      await addToWalletBucket({
        direction: t.direction,
        wallet: t.wallet,
        bucketStart,
        amountEth: tx.amountEth,
        now,
      });

      // 3) Sum window and alert if exceeded + cooldown allows
      const total = await sumWindow({
        direction: t.direction,
        wallet: t.wallet,
        now,
      });

      if (SNS_TOPIC_ARN && total >= THRESHOLD_ETH) {
        const okToAlert = await checkAndSetCooldown({
          direction: t.direction,
          wallet: t.wallet,
          now,
        });

        if (okToAlert) {
          const msg: ThresholdMessage = {
            txHash: tx.txHash,
            direction: t.direction,
            wallet: t.wallet,
            totalEth: total,
            windowSec: WINDOW_SECONDS,
            timestamp: now,
            source: "alchemy-webhook",
            requestId: event.requestContext?.requestId,
          };
          // Don’t fail ingestion if SNS fails
          try {
            await sns.send(
              new PublishCommand({
                TopicArn: SNS_TOPIC_ARN,
                Message: JSON.stringify(msg),
              })
            );
          } catch (e) {
            console.warn("SNS publish failed:", e);
          }
        }
      }
    }
  }

  // Always 200 so webhook sender doesn't retry unnecessarily
  return resp(200, "ok");
};

/* ---------------- Parsing ---------------- */

function parseWebhook(input: unknown):
  | { ok: true; data: { raw: WebhookEvent; activities: ParsedActivity[] } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "body must be an object" };

  const raw = input as WebhookEvent;
  const activity = raw.event?.activity;
  if (!Array.isArray(activity)) return { ok: false, error: "event.activity must be an array" };

  const parsed: ParsedActivity[] = [];
  for (const act of activity) {
    if (!act || typeof act !== "object") continue;
    if (act.asset && act.asset !== "ETH") continue;

    const txHash = normAddr(act.hash, false);
    const from = normAddr(act.fromAddress, true);
    const to = normAddr(act.toAddress, true);
    const value = typeof act.value === "number" ? act.value : Number.NaN;

    if (!txHash) return { ok: false, error: "missing activity.hash" };
    if (!from) return { ok: false, error: "missing activity.fromAddress" };
    if (!to) return { ok: false, error: "missing activity.toAddress" };
    if (!Number.isFinite(value)) return { ok: false, error: "missing activity.value" };

    parsed.push({ txHash, from, to, amountEth: value });
  }

  return { ok: true, data: { raw, activities: parsed } };
}

function normAddr(v: unknown, isAddr: boolean): string {
  if (typeof v !== "string") return "";
  const s = v.trim().toLowerCase();
  if (!s) return "";
  if (isAddr && !s.startsWith("0x")) return "";
  return s;
}

/* ---------------- DynamoDB: Transactions (idempotency) ---------------- */

async function putTransactionIfNew(args: {
  txHash: string;
  direction: Direction;
  wallet: string;
  amountEth: number;
  ts: number;
  raw: WebhookEvent;
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
        UpdateExpression: "SET lastAlert = :now",
        ConditionExpression:
          "attribute_not_exists(lastAlert) OR :now - lastAlert > :cd",
        ExpressionAttributeValues: {
          ":now": args.now,
          ":cd": COOLDOWN_SECONDS,
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

function mustEnv(k: string): string {
  const v = (process.env[k] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
}
function mustEnvInt(k: string): number {
  const v = Number((process.env[k] ?? "").trim());
  if (!Number.isInteger(v)) throw new Error(`Invalid int env ${k}`);
  return v;
}
function mustEnvNumber(k: string): number {
  const v = Number((process.env[k] ?? "").trim());
  if (!Number.isFinite(v)) throw new Error(`Invalid number env ${k}`);
  return v;
}
function envInt(k: string, def: number): number {
  const raw = (process.env[k] ?? "").trim();
  if (!raw) return def;
  const v = Number(raw);
  if (!Number.isInteger(v)) throw new Error(`Invalid int env ${k}`);
  return v;
}
