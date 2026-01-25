import type { SNSEvent } from "aws-lambda";

/**
 * Payload published by the ingest Lambda when a wallet breaches the threshold.
 */
type ThresholdMessage = {
  txHash: string;
  direction: "from" | "to";
  wallet: string;
  totalEth: number;
  windowSec: number;
  timestamp: number;
  source: "alchemy-webhook";
  requestId?: string;
};

const SLACK_WEBHOOK_URL = mustEnv("SLACK_WEBHOOK_URL");
const APP_NAME = process.env.APP_NAME ?? "serverless-eth-watcher";

export const handler = async (event: SNSEvent): Promise<void> => {
  if (!event.Records || event.Records.length === 0) {
    console.warn("received SNS event with no records");
    return;
  }

  const deliveries = event.Records.map(async (record, idx) => {
    const payload = safeParse(record.Sns?.Message);
    if (!payload) {
      console.warn("skipping record %d due to invalid JSON", idx);
      return;
    }

    if (!isThresholdMessage(payload)) {
      console.warn("skipping record %d due to unexpected shape", idx);
      return;
    }

    try {
      await postToSlack(payload);
    } catch (err) {
      console.error("failed to deliver Slack alert", err);
      throw err;
    }
  });

  await Promise.all(deliveries);
};

async function postToSlack(msg: ThresholdMessage): Promise<void> {
  const text = formatSlackText(msg);
  const response = await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "<unavailable>");
    throw new Error(`Slack webhook responded with ${response.status}: ${body}`);
  }
}

function formatSlackText(msg: ThresholdMessage): string {
  const direction = msg.direction === "from" ? "outbound" : "inbound";
  const eth = msg.totalEth.toFixed(4);
  const windowMin = (msg.windowSec / 60).toFixed(1);
  const timestamp = new Date(msg.timestamp * 1000).toISOString();

  return [
    `*${APP_NAME}* alert (${direction})`,
    `Wallet: ${msg.wallet}`,
    `Tx Hash: ${msg.txHash}`,
    `Rolling Total: ${eth} ETH in ${windowMin} min`,
    `Observed: ${timestamp}`,
    msg.requestId ? `Request ID: ${msg.requestId}` : undefined,
  ]
    .filter(Boolean)
    .join("\n");
}

function safeParse(raw?: string): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("unable to parse SNS message", err);
    return null;
  }
}

function isThresholdMessage(value: unknown): value is ThresholdMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as ThresholdMessage;
  return (
    typeof v.txHash === "string" &&
    (v.direction === "from" || v.direction === "to") &&
    typeof v.wallet === "string" &&
    typeof v.totalEth === "number" &&
    typeof v.windowSec === "number" &&
    typeof v.timestamp === "number" &&
    v.source === "alchemy-webhook"
  );
}

function mustEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }
  return value;
}
