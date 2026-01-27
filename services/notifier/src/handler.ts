import type { SNSEvent } from "aws-lambda";
import { APP_NAME, SLACK_WEBHOOK_URL } from "./../env";

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

export const handler = async (event: SNSEvent): Promise<void> => {
  const recordCount = event.Records?.length ?? 0;
  if (recordCount === 0) {
    console.warn("notifier.noRecords", { recordCount });
    return;
  }

  const deliveries = event.Records.map(async (record, idx) => {
    const meta = {
      recordIndex: idx,
      messageId: record.Sns?.MessageId,
      topicArn: record.Sns?.TopicArn,
    };

    const payload = safeParse(record.Sns?.Message, meta);
    if (!payload) {
      return;
    }

    if (!isThresholdMessage(payload)) {
      console.warn("notifier.invalidShape", meta);
      return;
    }

    try {
      console.info("notifier.deliverStart", {
        ...meta,
        wallet: payload.wallet,
        direction: payload.direction,
        txHash: payload.txHash,
      });
      await postToSlack(payload);
      console.info("notifier.deliverSuccess", {
        ...meta,
        wallet: payload.wallet,
        direction: payload.direction,
        txHash: payload.txHash,
      });
    } catch (err) {
      console.error("notifier.deliverFailed", {
        ...meta,
        wallet: payload.wallet,
        direction: payload.direction,
        txHash: payload.txHash,
        error: (err as Error).message,
      });
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

function safeParse(
  raw?: string,
  meta: { recordIndex: number; messageId?: string; topicArn?: string } = { recordIndex: -1 }
): unknown | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (err) {
    console.error("notifier.invalidJson", {
      ...meta,
      error: (err as Error).message,
    });
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
