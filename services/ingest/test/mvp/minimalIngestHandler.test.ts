import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mixedAssetsActivity } from '../../mock_events/wrappedMockEvent';

describe('minimal handler tests', () => {
  let mockEvent: APIGatewayProxyEventV2;
  let handlerMod: any;

  beforeAll(async () => {
    mockEvent = JSON.parse(JSON.stringify(mixedAssetsActivity));

    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';

    // Import the source module (not compiled artifact) so ts-jest can map sourcemaps
    handlerMod = await import('../../src/mvp/minimalIngestHandler');
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
