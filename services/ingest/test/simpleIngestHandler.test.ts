import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mixedAssetsActivity, noETHAssetActivity } from '../mock_events/wrapped_mock_event';

describe('simple ingest handler runner converted to test', () => {
  let nonEthEvent: APIGatewayProxyEventV2;
  let ethEvent: APIGatewayProxyEventV2;
  let ethActivityCount: number;
  let handlerModule: typeof import('../src/simpleIngestHandler');
  let mockSend: jest.Mock;
  let insertedItems: Array<Record<string, unknown>>;
  let bucketUpdates: Array<Record<string, unknown>>;

  beforeAll(async () => {
    ethEvent = JSON.parse(JSON.stringify(mixedAssetsActivity));
    nonEthEvent = JSON.parse(JSON.stringify(noETHAssetActivity));

    const parsedEthBody = ethEvent.body ? JSON.parse(ethEvent.body) : null;
    const activities = parsedEthBody?.event?.activity ?? [];
    ethActivityCount = activities.filter((act: any) => act.asset === 'ETH').length;
    if (ethActivityCount === 0) {
      throw new Error('mixedAssetsActivity fixture must include at least one ETH transfer');
    }

    // env vars must exist before the handler module is evaluated
    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';

    handlerModule = await import('../src/simpleIngestHandler');
  });

  beforeEach(() => {
    insertedItems = [];
    bucketUpdates = [];

    mockSend = jest.fn().mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof PutCommand) {
        const snapshot = JSON.parse(JSON.stringify(cmd.input?.Item ?? {}));
        insertedItems.push(snapshot);
        console.log('Mock PutCommand item inserted:', snapshot);
      } else if (cmd instanceof UpdateCommand) {
        const snapshot = {
          key: cmd.input?.Key,
          expr: cmd.input?.UpdateExpression,
          values: cmd.input?.ExpressionAttributeValues
        };
        bucketUpdates.push(JSON.parse(JSON.stringify(snapshot)));
        console.log('Mock UpdateCommand payload:', snapshot);
      }

      return {};
    });
    handlerModule.setDdb({ send: mockSend });
  });

  test('ignores non-ETH assets and never touches DynamoDB', async () => {
    const res = await handlerModule.handler(nonEthEvent);

    expect(res).toBeDefined();
    if (typeof res === 'string') {
      throw new Error(`expected structured response, received string: ${res}`);
    }

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('ignored non-ETH asset');
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('processes ETH asset transactions and logs inserted items', async () => {
    const res = await handlerModule.handler(ethEvent);

    expect(res).toBeDefined();
    if (typeof res === 'string') {
      throw new Error(`expected structured response, received string: ${res}`);
    }

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('ok');

    const expectedRecords = ethActivityCount * 2; // from + to
    expect(insertedItems).toHaveLength(expectedRecords);
    expect(bucketUpdates).toHaveLength(expectedRecords);

    const directionCounts = insertedItems.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.direction);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    expect(directionCounts.from).toBe(ethActivityCount);
    expect(directionCounts.to).toBe(ethActivityCount);

    const uniqueTransactionDirections = new Set(insertedItems.map((i) => i.pk));
    expect(uniqueTransactionDirections.size).toBe(expectedRecords);

    expect(mockSend).toHaveBeenCalledTimes(expectedRecords * 2); // Put + Update for each direction
  });
});
