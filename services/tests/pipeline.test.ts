import type { SNSEvent } from 'aws-lambda';
import { mixedAssetsActivity } from '../ingest/mock_events/wrappedMockEvent';

describe('ingest + notifier pipeline', () => {
  let ingestModule: typeof import('../ingest/src/handler');
  let notifierHandler: (event: SNSEvent) => Promise<void>;
  let ddbSendMock: jest.Mock;
  let snsSendMock: jest.Mock;
  let fetchMock: jest.Mock;
  let originalFetch: typeof fetch | undefined;
  let queryResponses: Array<{ Items: Array<{ sk: number; sumEth: number }> }>;
  let snsMessages: Array<{ TopicArn?: string; Message?: string }>;

  beforeAll(async () => {
    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions_pipeline';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets_pipeline';
    process.env.THRESHOLD_ETH = '1.5';
    process.env.WINDOW_SECONDS = '300';
    process.env.COOLDOWN_SECONDS = '30';
    process.env.BUCKET_SIZE_SECONDS = '60';
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:111111111111:pipeline';
    process.env.SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL ?? 'https://example.com/webhook';

    ingestModule = await import('../ingest/src/handler');
    notifierHandler = (await import('../notifier/src/handler')).handler;
  });

  beforeEach(() => {
    snsMessages = [];
    queryResponses = [{ Items: [{ sk: 123, sumEth: 2.5 }] }];

    snsSendMock = jest.fn(async (cmd: any) => {
      snsMessages.push(cmd?.input ?? {});
      return {};
    });

    ddbSendMock = jest.fn(async (cmd: any) => {
      const ctor = cmd?.constructor?.name;
      if (ctor === 'QueryCommand') {
        return queryResponses.shift() ?? { Items: [] };
      }
      if (ctor === 'PutCommand') {
        return {};
      }
      if (ctor === 'UpdateCommand') {
        return {};
      }
      return {};
    });

    ingestModule.setDdb({ send: ddbSendMock } as any);
    ingestModule.setSns({ send: snsSendMock } as any);

    originalFetch = globalThis.fetch;
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    } else {
      delete (globalThis as Partial<typeof globalThis>).fetch;
    }
  });

  test('pipes an SNS alert into the Slack notifier', async () => {
    await ingestModule.handler(cloneEvent(mixedAssetsActivity));

    expect(snsMessages).toHaveLength(1);

    const snsEvent = buildSnsEvent(snsMessages);
    await notifierHandler(snsEvent);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(process.env.SLACK_WEBHOOK_URL);
    const body = JSON.parse(init?.body ?? '{}');
    expect(body.text).toContain('Rolling Total: 2.5000 ETH');
    expect(body.text).toContain('Wallet:');
  });
});

function cloneEvent<T>(val: T): T {
  return JSON.parse(JSON.stringify(val));
}

function buildSnsEvent(messages: Array<{ TopicArn?: string; Message?: string }>): SNSEvent {
  return {
    Records: messages.map((msg, idx) => ({
      EventSource: 'aws:sns',
      EventVersion: '1.0',
      EventSubscriptionArn: `arn:aws:sns:local:123:subscription-${idx}`,
      Sns: {
        Message: msg.Message ?? '',
        MessageAttributes: {},
        MessageId: `mid-${idx}`,
        Signature: 'mock',
        SignatureVersion: '1',
        SigningCertUrl: 'https://example.com/cert',
        Timestamp: new Date().toISOString(),
        TopicArn: msg.TopicArn ?? 'arn:aws:sns:local:123:topic',
        Type: 'Notification',
        UnsubscribeUrl: 'https://example.com/unsub',
        Subject: null,
      },
    })),
  };
}
