import type { SNSEvent } from "aws-lambda";
import { PutCommand, QueryCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import {
  buildWrappedEvent,
  cloneAddressActivityPayload,
} from "../../mock_events/wrappedMockEvent";
import { ASSETS, WALLET_ADDRESSES } from "../../types/alchemyWebhookTypes";
import { ensureStructuredResponse } from "../support/testUtils";

const TEST_TIME_SECONDS = 1_733_000_000;
const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

describe("ingest ↔ notifier integration", () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    jest.useRealTimers();
    if (ORIGINAL_FETCH) {
      (global as any).fetch = ORIGINAL_FETCH;
    } else {
      delete (global as any).fetch;
    }
  });

  test("pipes threshold breach alerts through SNS into Slack", async () => {
    jest.resetModules();
    jest.useFakeTimers();
    jest.setSystemTime(new Date(TEST_TIME_SECONDS * 1000));

    process.env = {
      ...ORIGINAL_ENV,
      TRANSACTIONS_TABLE: "integration_transactions",
      WALLET_BUCKETS_TABLE: "integration_buckets",
      SNS_TOPIC_ARN: "arn:aws:sns:us-east-1:000000000000:eth-watcher",
      THRESHOLD_ETH: "2",
      WINDOW_SECONDS: "300",
      COOLDOWN_SECONDS: "60",
      BUCKET_SIZE_SECONDS: "60",
      SLACK_WEBHOOK_URL: "https://hooks.slack.test/services/T000/B000/XXX",
      APP_NAME: "integration-watcher",
      TRACKED_WALLETS: WALLET_ADDRESSES.tracked,
    };

    const ingestModule: typeof import("../../src/handler") = await import(
      "../../src/handler"
    );
    const notifierModule: typeof import("../../../notifier/src/handler") =
      await import("../../../notifier/src/handler");

    const ddbStub = createDdbStub();
    ingestModule.setDdb({ send: ddbStub.send });

    const snsMessages: string[] = [];
    const snsSend = jest.fn(async (command: any) => {
      const message = command?.input?.Message;
      if (typeof message === "string") {
        snsMessages.push(message);
      }
      return {};
    });
    ingestModule.setSns({ send: snsSend });

    const fetchMock = jest
      .fn()
      .mockResolvedValue({ ok: true, text: async () => "" });
    (global as any).fetch = fetchMock;

    const webhookEvent = buildThresholdCrossingEvent();
    const ingestResponse = ensureStructuredResponse(await ingestModule.handler(webhookEvent));

    expect(ingestResponse.statusCode).toBe(200);
    expect(snsMessages).not.toHaveLength(0);

    const firstMessage = snsMessages[0];
    expect(firstMessage).toBeDefined();

    const snsEvent = buildNotifierEvent(
      firstMessage!,
      process.env.SNS_TOPIC_ARN!
    );
    await notifierModule.handler(snsEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(process.env.SLACK_WEBHOOK_URL);

    const body = JSON.parse(init?.body ?? "{}");
    expect(body.text).toContain(`Tracked Wallet #1: ${WALLET_ADDRESSES.tracked}`);
    expect(body.text).toContain(`Counterparty: ${WALLET_ADDRESSES.counterpartyA}`);
    expect(body.text).toContain("Rolling Total: 3.5000 ETH in 5.0 min");
  });
});

function buildThresholdCrossingEvent() {
  const payload = cloneAddressActivityPayload();
  payload.event.activity = [
    {
      ...payload.event.activity[0],
      asset: ASSETS.ETH,
      hash: "0xintegration",
      value: 3.5,
      fromAddress: WALLET_ADDRESSES.tracked,
      toAddress: WALLET_ADDRESSES.counterpartyA,
    },
  ];
  return buildWrappedEvent({ body: payload });
}

function buildNotifierEvent(message: string, topicArn: string): SNSEvent {
  const timestamp = new Date(TEST_TIME_SECONDS * 1000).toISOString();
  return {
    Records: [
      {
        EventSource: "aws:sns",
        EventVersion: "1.0",
        EventSubscriptionArn: `${topicArn}:subscription`,
        Sns: {
          Message: message,
          MessageAttributes: {},
          MessageId: "sns-message-1",
          Signature: "integration-signature",
          SignatureVersion: "1",
          SigningCertUrl: "https://sns.test/signing-cert.pem",
          Subject: "threshold-breach",
          Timestamp: timestamp,
          TopicArn: topicArn,
          Type: "Notification",
          UnsubscribeUrl: "https://sns.test/unsubscribe",
        },
      },
    ],
  };
}

function createDdbStub() {
  const seenTransactions = new Set<string>();
  const buckets = new Map<string, { pk: string; sk: number; sumEth: number }>();
  const cooldowns = new Map<string, number>();

  const send = jest.fn(async (command: unknown) => {
    if (isCommand(command, "PutCommand")) {
      const pk = String((command.input?.Item as Record<string, unknown>)?.pk);
      if (seenTransactions.has(pk)) {
        const err = new Error("duplicate transaction");
        (err as any).name = "ConditionalCheckFailedException";
        throw err;
      }
      seenTransactions.add(pk);
      return {};
    }

    if (isCommand(command, "UpdateCommand")) {
      const key = command.input?.Key as { pk: string; sk: number };
      if (key.sk === -1) {
        const now = Number(
          command.input?.ExpressionAttributeValues?.[":now"] ?? 0
        );
        const cutoff = Number(
          command.input?.ExpressionAttributeValues?.[":cutoff"] ?? 0
        );
        const last = cooldowns.get(key.pk);
        if (typeof last === "number" && !(last < cutoff)) {
          const err = new Error("cooldown active");
          (err as any).name = "ConditionalCheckFailedException";
          throw err;
        }
        cooldowns.set(key.pk, now);
        return {};
      }

      const inc = Number(
        command.input?.ExpressionAttributeValues?.[":inc"] ?? 0
      );
      const bucketKey = `${key.pk}#${key.sk}`;
      const current = buckets.get(bucketKey) ?? {
        pk: key.pk,
        sk: key.sk,
        sumEth: 0,
      };
      const updatedSum = round9(current.sumEth + inc);
      buckets.set(bucketKey, { ...current, sumEth: updatedSum });
      return {};
    }

    if (isCommand(command, "QueryCommand")) {
      const exprValues = command.input?.ExpressionAttributeValues ?? {};
      const pk = String(exprValues[":pk"] ?? "");
      const start = Number(exprValues[":a"] ?? 0);
      const end = Number(exprValues[":b"] ?? 0);

      const items = Array.from(buckets.values())
        .filter((item) => item.pk === pk && item.sk >= start && item.sk <= end)
        .map((item) => ({ pk: item.pk, sk: item.sk, sumEth: item.sumEth }));

      return { Items: items };
    }

    throw new Error(
      `Unsupported DynamoDB command: ${command && (command as any).constructor?.name}`
    );
  });

  return { send };
}

function round9(value: number): number {
  return Math.round(value * 1e9) / 1e9;
}

function isCommand(input: unknown, name: string): input is {
  input: Record<string, any>;
} {
  return Boolean(input && (input as any).constructor?.name === name);
}
