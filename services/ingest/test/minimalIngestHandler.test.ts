import fs from 'fs/promises';
import path from 'path';

describe('minimal handler runner converted to test', () => {
  let mockEvent: any;
  let handlerMod: any;

  beforeAll(async () => {
    const baseDir = path.resolve(process.cwd(), 'services', 'ingest');
    const mockPath = path.join(baseDir, './mock_events/wrapped_mock_event.json');
    mockEvent = JSON.parse(await fs.readFile(mockPath, 'utf8')) as any;

    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';

    // Import the source module (not compiled artifact) so ts-jest can map sourcemaps
    handlerMod = await import('../src/minimalIngestHandler');
  });

  test('logs received Alchemy payload and returns 200', async () => {
    const res = await handlerMod.handler(mockEvent);

    expect(res).toBeDefined();
    expect(res.statusCode).toBe(200);

    const body = JSON.parse(res.body ?? '{}');
    expect(body.message).toBe('ok');

    const expectedPayload =
      typeof mockEvent.body === 'string'
        ? JSON.parse(mockEvent.body)
        : mockEvent.body ?? null;

    expect(body.payload).toEqual(expectedPayload);
  });
});
