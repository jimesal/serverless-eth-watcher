import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";

let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

// Exported for tests so we can inject a mock DynamoDBDocumentClient
export function setDdb(client: any) {
  ddb = client;
}

const TRANSACTIONS_TABLE = mustEnv("TRANSACTIONS_TABLE");
const WALLET_BUCKETS_TABLE = mustEnv("WALLET_BUCKETS_TABLE");
const BUCKET_SIZE_SECONDS = envInt("BUCKET_SIZE_SECONDS", 60);

type Direction = "from" | "to";

type ParsedActivity = {
  txHash: string;
  from: string;
  to: string;
  amountEth: number;
};

// Alchemy address-activity webhook shape (trimmed to fields we use)
type AlchemyActivityShape = {
  id?: string;
  type?: string;
  event: {
    activity: Array<{
      hash?: string;
      fromAddress?: string;
      toAddress?: string;
      asset?: string;
      // Alchemy may include a numeric `value` when normalized, or a rawContract
      value?: number;
      rawContract?: { rawValue?: string; decimals?: number };
    }>;
  };
};

type IncomingBody = AlchemyActivityShape;


export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  let body: IncomingBody;
  try {
    body = event.body ? (JSON.parse(event.body) as IncomingBody) : ({} as IncomingBody);
  } catch (e) {
    return resp(400, `invalid json: ${(e as Error).message}`);
  }

  const parsed = parseWebhook(body);
  if (!parsed.ok) {
    return resp(400, parsed.error);
  }

  const { activities, raw } = parsed.data;
  if (activities.length === 0) return resp(200, "ignored non-ETH asset");

  const now = Math.floor(Date.now() / 1000);
  const bucketStart = bucketStartEpoch(now, BUCKET_SIZE_SECONDS);

  for (const tx of activities) {
    // Track both directions for each ETH activity
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

      // no notification logic: only record transaction and update bucket
    }
  }

  // Always 200 so webhook sender doesn't retry unnecessarily
  return resp(200, "ok");
};

/* ---------------- Parsing ---------------- */

function parseWebhook(input: IncomingBody):
  | { ok: true; data: { raw: IncomingBody; activities: ParsedActivity[] } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") return { ok: false, error: "body must be an object" };

  const activity = input.event?.activity;
  if (!Array.isArray(activity)) {
    return { ok: false, error: "event.activity must be an array" };
  }

  const parsedActivities: ParsedActivity[] = [];
  for (const act of activity) {
    if (!act || typeof act !== "object") continue;
    if (act.asset && act.asset !== "ETH") continue;

    const txHash = typeof act.hash === "string" ? act.hash : "";
    const from = typeof act.fromAddress === "string" ? act.fromAddress : "";
    const to = typeof act.toAddress === "string" ? act.toAddress : "";
    const value = typeof act.value === "number" ? act.value : Number.NaN;

    if (!txHash) return { ok: false, error: "missing activity.hash" };
    if (!from) return { ok: false, error: "missing activity.fromAddress" };
    if (!to) return { ok: false, error: "missing activity.toAddress" };
    if (!Number.isFinite(value)) return { ok: false, error: "missing activity.value" };

    parsedActivities.push({ txHash, from, to, amountEth: value });
  }

  return { ok: true, data: { raw: input, activities: parsedActivities } };
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
  // keep buckets around for a few bucket intervals
  const expiresAt = args.now + BUCKET_SIZE_SECONDS * 10;

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

/* notification/windowing logic removed; this module only ingests transactions and updates bucketed counters */

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

function envInt(k: string, def: number): number {
  const raw = (process.env[k] ?? "").trim();
  if (!raw) return def;
  const v = Number(raw);
  if (!Number.isInteger(v)) throw new Error(`Invalid int env ${k}`);
  return v;
}
