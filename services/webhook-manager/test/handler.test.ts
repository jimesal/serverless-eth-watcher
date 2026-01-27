import type { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('webhook manager handler', () => {
  const ORIGINAL_ENV = { ...process.env };
  const mockEvent = {} as APIGatewayProxyEventV2;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
    delete (globalThis as Partial<typeof globalThis>).fetch;
  });

  test('creates webhook when none exist', async () => {
    process.env.ALCHEMY_ADMIN_API_KEY = 'test-key';
    process.env.ALCHEMY_APP_ID = 'test-app';
    process.env.ALCHEMY_DELIVERY_URL = 'https://ingest.example.com/webhook';

    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => [],
        text: async () => '',
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'wh-123',
          appId: 'test-app',
          network: 'eth-mainnet',
          webhookUrl: 'https://ingest.example.com/webhook',
          webhookType: 'ADDRESS_ACTIVITY',
          addresses: [],
        }),
        text: async () => '',
      });

    (globalThis as any).fetch = fetchMock;

    const mod = await import('../src/handler');
    const res = await mod.handler(mockEvent);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.message).toContain('Alchemy webhook');
  });

  test('returns 500 when env vars missing', async () => {
    delete process.env.ALCHEMY_ADMIN_API_KEY;
    delete process.env.ALCHEMY_APP_ID;
    delete process.env.ALCHEMY_DELIVERY_URL;

    const mod = await import('../src/handler');
    const res = await mod.handler(mockEvent);

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.error).toMatch(/Missing required environment variable/);
  });
});
