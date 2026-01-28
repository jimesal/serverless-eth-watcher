import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  duplicatedTransactionsActivity,
  mixedAssetsActivity,
  roleShuffleActivity,
  singleTxActivity,
  stableBatchActivity,
} from '../../mock_events/wrappedMockEvent';
import { TRACKED_WALLET } from '../../types/alchemyWebhookTypes';
import {
  cloneEvent,
  expectError,
  expectResponse,
  getEthActivities,
  getUniqueEthHashCount,
} from '../support/testUtils';

describe('simple ingest handler tests', () => {
  let handlerModule: typeof import('../../src/mvp/simpleIngestHandler');
  let mockSend: jest.Mock;
  let insertedItems: Array<Record<string, unknown>>;
  let bucketUpdates: Array<Record<string, unknown>>;
  let seenTransactionPks: Set<string>;

  beforeAll(async () => {
    // env vars must exist before the handler module is evaluated
    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';
    process.env.THRESHOLD_ETH = process.env.THRESHOLD_ETH ?? '1.5';
    process.env.WINDOW_SECONDS = process.env.WINDOW_SECONDS ?? '300';
    process.env.COOLDOWN_SECONDS = process.env.COOLDOWN_SECONDS ?? '30';
    process.env.BUCKET_SIZE_SECONDS = process.env.BUCKET_SIZE_SECONDS ?? '60';

    handlerModule = await import('../../src/mvp/simpleIngestHandler');
  });

  beforeEach(() => {
    insertedItems = [];
    bucketUpdates = [];
    seenTransactionPks = new Set();

    mockSend = jest.fn().mockImplementation(async (cmd: unknown) => {
      if (cmd instanceof PutCommand) {
        const pk = String((cmd.input?.Item as Record<string, unknown>)?.pk ?? '');
        if (pk && seenTransactionPks.has(pk)) {
          const err = new Error(`duplicate pk ${pk}`);
          (err as any).name = 'ConditionalCheckFailedException';
          throw err;
        }
        seenTransactionPks.add(pk);
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

  test('returns 400 when the webhook body contains invalid JSON', async () => {
    const brokenEvent = cloneEvent(singleTxActivity);
    brokenEvent.body = '{';

    const res = await handlerModule.handler(brokenEvent);

    expectError(res, /^invalid json:/);
    expect(mockSend).not.toHaveBeenCalled();
    expect(insertedItems).toHaveLength(0);
    expect(bucketUpdates).toHaveLength(0);
  });

  test('returns 400 when payload is missing required fields', async () => {
    const malformedEvent = cloneEvent(singleTxActivity);
    malformedEvent.body = JSON.stringify({
      type: 'ADDRESS_ACTIVITY',
      event: { activity: [] },
    });

    const res = await handlerModule.handler(malformedEvent);

    expectError(res, 'payload does not match AddressActivityWebhook');
    expect(mockSend).not.toHaveBeenCalled();
    expect(insertedItems).toHaveLength(0);
    expect(bucketUpdates).toHaveLength(0);
  });

  test('handles single non-ETH transaction payloads', async () => {
    const res = await handlerModule.handler(cloneEvent(singleTxActivity));

    expectResponse(res, 'ignored non-ETH asset');
    expect(insertedItems).toHaveLength(0);
    expect(bucketUpdates).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('ignores multi-transaction payloads with no ETH activity', async () => {
    const res = await handlerModule.handler(cloneEvent(stableBatchActivity));

    expectResponse(res, 'ignored non-ETH asset');
    expect(insertedItems).toHaveLength(0);
    expect(bucketUpdates).toHaveLength(0);
    expect(mockSend).not.toHaveBeenCalled();
  });

  test('processes ETH asset transactions from mixed payloads', async () => {
    const event = cloneEvent(mixedAssetsActivity);
    const ethActivities = getEthActivities(event);
    expect(ethActivities).not.toHaveLength(0);

    const res = await handlerModule.handler(event);

    expectResponse(res, 'ok');

    const expectedRecords = ethActivities.length * 2; // from + to per ETH tx
    expect(insertedItems).toHaveLength(expectedRecords);
    expect(bucketUpdates).toHaveLength(expectedRecords);

    const directionCounts = insertedItems.reduce<Record<string, number>>((acc, item) => {
      const key = String(item.direction);
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});

    expect(directionCounts.from).toBe(ethActivities.length);
    expect(directionCounts.to).toBe(ethActivities.length);

    const uniqueTransactionDirections = new Set(insertedItems.map((i) => i.pk));
    expect(uniqueTransactionDirections.size).toBe(expectedRecords);

    expect(mockSend).toHaveBeenCalledTimes(expectedRecords * 2); // Put + Update for each direction
  });

  test('processes ETH txs when the tracked wallet swaps between source and target', async () => {
    const event = cloneEvent(roleShuffleActivity);
    const ethActivities = getEthActivities(event);
    expect(ethActivities).not.toHaveLength(0);

    const res = await handlerModule.handler(event);

    expectResponse(res, 'ok');

    const expectedRecords = ethActivities.length * 2;
    expect(insertedItems).toHaveLength(expectedRecords);
    expect(bucketUpdates).toHaveLength(expectedRecords);

    const hasTrackedAsSource = insertedItems.some(
      (item) => item.direction === 'from' && item.wallet === TRACKED_WALLET,
    );
    const hasTrackedAsTarget = insertedItems.some(
      (item) => item.direction === 'to' && item.wallet === TRACKED_WALLET,
    );

    expect(hasTrackedAsSource).toBe(true);
    expect(hasTrackedAsTarget).toBe(true);

    expect(mockSend).toHaveBeenCalledTimes(expectedRecords * 2);
  });

  test('deduplicates duplicate ETH activities before updating buckets or counting twice', async () => {
    const duplicatedEvent = cloneEvent(duplicatedTransactionsActivity);
    const uniqueEthCount = getUniqueEthHashCount(duplicatedEvent);
    expect(uniqueEthCount).toBeGreaterThan(0);

    const res = await handlerModule.handler(duplicatedEvent);

    expectResponse(res, 'ok');

    const expectedRecords = uniqueEthCount * 2;
    expect(insertedItems).toHaveLength(expectedRecords);
    expect(bucketUpdates).toHaveLength(expectedRecords);

    const uniqueTransactionDirections = new Set(insertedItems.map((item) => item.pk));
    expect(uniqueTransactionDirections.size).toBe(expectedRecords);

    const putCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof PutCommand).length;
    const updateCalls = mockSend.mock.calls.filter(([cmd]) => cmd instanceof UpdateCommand).length;

    expect(putCalls).toBe(expectedRecords * 2); // original + duplicate attempts
    expect(updateCalls).toBe(expectedRecords); // only new records reach bucket updates
    expect(mockSend).toHaveBeenCalledTimes(putCalls + updateCalls);
  });
});
