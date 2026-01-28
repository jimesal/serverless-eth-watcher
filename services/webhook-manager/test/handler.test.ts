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

  test('creates webhook with tracked wallets payload', async () => {
    process.env.ALCHEMY_ADMIN_API_KEY = 'test-key';
    process.env.ALCHEMY_APP_ID = 'test-app';
    process.env.ALCHEMY_DELIVERY_URL = 'https://ingest.example.com/webhook';

    const fetchMock = jest.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'wh-123',
        appId: 'test-app',
        network: 'ETH_MAINNET',
        webhookUrl: 'https://ingest.example.com/webhook',
        webhookType: 'ADDRESS_ACTIVITY',
        addresses: ['0xabc'],
      }),
      text: async () => '',
    });

    (globalThis as any).fetch = fetchMock;

    const envMod = await import('../src/env');
    const mod = await import('../src/handler');
    const res = await mod.handler(mockEvent);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(res.body ?? '{}');
    expect(body.message).toContain('Alchemy webhook created');

    const [, init] = fetchMock.mock.calls[0];
    expect(init).toBeDefined();
    const payload = JSON.parse(init?.body ?? '{}');
    expect(payload.addresses).toEqual(envMod.TRACKED_WALLETS);
    expect(payload.name).toContain('test-app');
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
