import type { SNSEvent } from 'aws-lambda';

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

const baseMessage = {
  txHash: '0xabc',
  direction: 'from' as const,
  wallet: '0x111',
  trackedWalletIndex: 0,
  counterparty: '0x222',
  totalEth: 3.5,
  windowSec: 600,
  timestamp: 1_700_000_000,
  source: 'alchemy-webhook' as const,
  requestId: 'req-123',
};

describe('notifier handler', () => {
  let fetchMock: jest.Mock;
  let consoleInfoMock: jest.SpyInstance;
  let consoleWarnMock: jest.SpyInstance;
  let consoleErrorMock: jest.SpyInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      SLACK_WEBHOOK_URL: 'https://hooks.slack.test/services/T000/B000/XXX',
      APP_NAME: 'unit-notifier',
    };

    fetchMock = jest.fn().mockResolvedValue({ ok: true, text: async () => '' });
    (global as any).fetch = fetchMock;

    consoleInfoMock = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleInfoMock.mockRestore();
    consoleWarnMock.mockRestore();
    consoleErrorMock.mockRestore();

    if (ORIGINAL_FETCH) {
      (global as any).fetch = ORIGINAL_FETCH;
    } else {
      delete (global as any).fetch;
    }

    process.env = { ...ORIGINAL_ENV };
  });

  const importHandler = async () => (await import('../src/handler')).handler;

  test('returns early when there are no records', async () => {
    const handler = await importHandler();
    const event: SNSEvent = { Records: [] } as SNSEvent;

    await handler(event);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith('notifier.noRecords', { recordCount: 0 });
  });

  test('skips records with invalid JSON payloads', async () => {
    const handler = await importHandler();
    const event = buildEvent('{');

    await handler(event);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleErrorMock).toHaveBeenCalled();
  });

  test('skips records that do not match the threshold schema', async () => {
    const handler = await importHandler();
    const invalidMessage = { ...baseMessage, source: 'unknown' };
    const event = buildEvent(JSON.stringify(invalidMessage));

    await handler(event);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleWarnMock).toHaveBeenCalledWith('notifier.invalidShape', expect.any(Object));
  });

  test('sends Slack notifications for valid messages', async () => {
    const handler = await importHandler();
    const event = buildEvent(JSON.stringify(baseMessage));

    await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(process.env.SLACK_WEBHOOK_URL);
    const body = JSON.parse(init?.body ?? '{}');
    expect(body.text).toContain('*unit-notifier* alert (outbound)');
    expect(body.text).toContain('Tracked Wallet #1: 0x111');
    expect(body.text).toContain('Counterparty: 0x222');
    expect(body.text).toContain('Rolling Total: 3.5000 ETH in 10.0 min');
  });

  test('processes multiple records independently', async () => {
    const handler = await importHandler();
    const secondMessage = { ...baseMessage, direction: 'to', txHash: '0xdef' };
    const event: SNSEvent = {
      Records: [
        buildRecord(JSON.stringify(baseMessage)),
        buildRecord(JSON.stringify(secondMessage)),
      ],
    } as SNSEvent;

    await handler(event);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, secondCall] = fetchMock.mock.calls;
    const secondBody = JSON.parse(secondCall[1]?.body ?? '{}');
    expect(secondBody.text).toContain('alert (inbound)');
  });

  test('throws when Slack webhook responds with an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 429, text: async () => 'rate limited' });
    const handler = await importHandler();
    const event = buildEvent(JSON.stringify(baseMessage));

    await expect(handler(event)).rejects.toThrow('Slack webhook responded with 429: rate limited');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(consoleErrorMock).toHaveBeenCalled();
  });
});

function buildEvent(message: string): SNSEvent {
  return {
    Records: [buildRecord(message)],
  } as SNSEvent;
}

function buildRecord(message: string) {
  return {
    EventSource: 'aws:sns',
    EventVersion: '1.0',
    EventSubscriptionArn: 'arn:aws:sns:local:123:sub',
    Sns: {
      Message: message,
      MessageAttributes: {},
      MessageId: 'mid-1',
      Signature: 'sig',
      SignatureVersion: '1',
      SigningCertUrl: 'https://sns.test/cert',
      Subject: 'threshold',
      Timestamp: new Date().toISOString(),
      TopicArn: 'arn:aws:sns:local:123:topic',
      Type: 'Notification',
      UnsubscribeUrl: 'https://sns.test/unsub',
    },
  };
}
