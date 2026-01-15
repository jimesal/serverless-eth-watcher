import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";
let ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true }
});
function setDdb(client) {
  ddb = client;
}
const TRANSACTIONS_TABLE = mustEnv("TRANSACTIONS_TABLE");
const WALLET_BUCKETS_TABLE = mustEnv("WALLET_BUCKETS_TABLE");
const BUCKET_SIZE_SECONDS = envInt("BUCKET_SIZE_SECONDS", 60);
const handler = async (event) => {
  let body;
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (e) {
    return resp(400, `invalid json: ${e.message}`);
  }
  const parsed = parseWebhook(body);
  if (!parsed.ok) return resp(400, parsed.error);
  const { txHash, from, to, amountEth, raw } = parsed.data;
  const now = Math.floor(Date.now() / 1e3);
  const bucketStart = bucketStartEpoch(now, BUCKET_SIZE_SECONDS);
  const targets = [
    { direction: "from", wallet: from },
    { direction: "to", wallet: to }
  ];
  for (const t of targets) {
    const alreadyProcessed = await putTransactionIfNew({
      txHash,
      direction: t.direction,
      wallet: t.wallet,
      amountEth,
      ts: now,
      raw
    });
    if (alreadyProcessed) {
      continue;
    }
    await addToWalletBucket({
      direction: t.direction,
      wallet: t.wallet,
      bucketStart,
      amountEth,
      now
    });
  }
  return resp(200, "ok");
};
function parseWebhook(input) {
  if (!input || typeof input !== "object") return { ok: false, error: "body must be an object" };
  const maybe = input;
  const act = maybe?.event?.activity && Array.isArray(maybe.event.activity) && maybe.event.activity.length > 0 ? maybe.event.activity[0] : null;
  if (act) {
    const txHash2 = normAddr(act.hash, false);
    const from2 = normAddr(act.fromAddress, true);
    const to2 = normAddr(act.toAddress, true);
    if (!txHash2) return { ok: false, error: "missing activity.hash" };
    if (!from2) return { ok: false, error: "missing activity.fromAddress" };
    if (!to2) return { ok: false, error: "missing activity.toAddress" };
    let amount = 0;
    if (typeof act.value === "number") {
      amount = act.value;
    } else if (act.rawContract && typeof act.rawContract.rawValue === "string") {
      const rawVal = act.rawContract.rawValue.toLowerCase();
      const decimals = typeof act.rawContract.decimals === "number" ? act.rawContract.decimals : 18;
      try {
        const hex = rawVal.startsWith("0x") ? rawVal.slice(2) : rawVal;
        const bi = BigInt("0x" + hex);
        const denom = 10n ** BigInt(decimals);
        const whole = bi / denom;
        const frac = bi % denom;
        amount = Number(whole) + Number(frac) / Number(denom);
      } catch {
        amount = 0;
      }
    }
    return { ok: true, data: { txHash: txHash2, from: from2, to: to2, amountEth: amount, raw: maybe } };
  }
  const raw = input;
  const tx = raw.transaction;
  if (!tx) return { ok: false, error: "missing transaction" };
  const txHash = normAddr(tx.hash, false);
  const from = normAddr(tx.from, true);
  const to = normAddr(tx.to, true);
  const value = typeof tx.value === "string" ? tx.value.trim() : "";
  if (!txHash) return { ok: false, error: "missing transaction.hash" };
  if (!from) return { ok: false, error: "missing transaction.from" };
  if (!to) return { ok: false, error: "missing transaction.to" };
  if (!value) return { ok: false, error: "missing transaction.value" };
  const amountEth = parseEthFromHexWei(value);
  return { ok: true, data: { txHash, from, to, amountEth, raw } };
}
function normAddr(v, isAddr) {
  if (typeof v !== "string") return "";
  const s = v.trim().toLowerCase();
  if (!s) return "";
  if (isAddr && !s.startsWith("0x")) return "";
  return s;
}
function parseEthFromHexWei(hexWei) {
  const cleaned = hexWei.toLowerCase().startsWith("0x") ? hexWei.slice(2) : hexWei;
  if (!cleaned) return 0;
  let wei;
  try {
    wei = BigInt("0x" + cleaned);
  } catch {
    return 0;
  }
  const weiPerEth = 1000000000000000000n;
  const whole = wei / weiPerEth;
  const frac = wei % weiPerEth;
  const fracNum = Number(frac) / 1e18;
  return Number(whole) + fracNum;
}
async function putTransactionIfNew(args) {
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
          ts: args.ts
          // optionally store raw payload (can increase cost):
          // raw: JSON.stringify(args.raw),
        },
        ConditionExpression: "attribute_not_exists(pk)"
      })
    );
    return false;
  } catch (e) {
    if (e?.name === "ConditionalCheckFailedException") return true;
    throw e;
  }
}
async function addToWalletBucket(args) {
  const pk = `${args.direction}#${args.wallet}`;
  const sk = args.bucketStart;
  const expiresAt = args.now + BUCKET_SIZE_SECONDS * 10;
  await ddb.send(
    new UpdateCommand({
      TableName: WALLET_BUCKETS_TABLE,
      Key: { pk, sk },
      UpdateExpression: "ADD sumEth :inc SET updatedAt = :u, expiresAt = :e",
      ExpressionAttributeValues: {
        ":inc": round9(args.amountEth),
        ":u": args.now,
        ":e": expiresAt
      }
    })
  );
}
function bucketStartEpoch(epochSec, bucketSizeSec) {
  return Math.floor(epochSec / bucketSizeSec) * bucketSizeSec;
}
function round9(n) {
  return Math.round(n * 1e9) / 1e9;
}
function resp(code, body) {
  return {
    statusCode: code,
    headers: { "content-type": "text/plain" },
    body
  };
}
function mustEnv(k) {
  const v = (process.env[k] ?? "").trim();
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
}
function envInt(k, def) {
  const raw = (process.env[k] ?? "").trim();
  if (!raw) return def;
  const v = Number(raw);
  if (!Number.isInteger(v)) throw new Error(`Invalid int env ${k}`);
  return v;
}
export {
  handler,
  setDdb
};
