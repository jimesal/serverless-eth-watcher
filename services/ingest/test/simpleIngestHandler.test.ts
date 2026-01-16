import fs from 'fs/promises';
import path from 'path';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

describe('simple ingest handler runner converted to test', () => {
  let nonEthEvent: APIGatewayProxyEventV2;
  let ethEvent: APIGatewayProxyEventV2;
  let handlerModule: typeof import('../src/simpleIngestHandler');
  let mockSend: jest.Mock;
  let insertedItems: Array<Record<string, unknown>>;
  let bucketUpdates: Array<Record<string, unknown>>;

  beforeAll(async () => {
    const baseDir = path.resolve(process.cwd(), 'services', 'ingest');
    const mockPath = path.join(baseDir, 'mock_events', 'wrapped_mock_event.json');
    nonEthEvent = JSON.parse(await fs.readFile(mockPath, 'utf8')) as APIGatewayProxyEventV2;

    if (!nonEthEvent.body) throw new Error('wrapped mock event is missing body');
    const parsedPayload = JSON.parse(nonEthEvent.body);

    const ethActivity = parsedPayload.event.activity.find((a: any) => a.asset === 'ETH');
    if (!ethActivity) throw new Error('expected ETH activity in wrapped mock event');

    const ethPayload = {
      ...parsedPayload,
      event: {
        ...parsedPayload.event,
        activity: [ethActivity]
      }
    };

    ethEvent = {
      ...nonEthEvent,
      body: JSON.stringify(ethPayload)
    };

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

    // two directions -> two PutCommands and two UpdateCommands
    expect(insertedItems).toHaveLength(2);
    expect(bucketUpdates).toHaveLength(2);
    const directions = insertedItems.map((i) => i.direction).sort();
    expect(directions).toEqual(['from', 'to']);
    expect(mockSend).toHaveBeenCalledTimes(4);
  });
});
