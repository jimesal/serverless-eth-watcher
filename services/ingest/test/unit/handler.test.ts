import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  duplicatedTransactionsActivity,
  mixedAssetsActivity,
  roleShuffleActivity,
  singleTxActivity,
  stableBatchActivity,
  dualTrackedWalletActivity,
} from '../../mock_events/wrappedMockEvent';
import { ASSETS, TRACKED_WALLET, WALLET_ADDRESSES } from '../../types/alchemyWebhookTypes';

const cloneEvent = (event: APIGatewayProxyEventV2): APIGatewayProxyEventV2 =>
  JSON.parse(JSON.stringify(event));

const uniqueTxEvent = (
  event: APIGatewayProxyEventV2,
  suffix: string,
): APIGatewayProxyEventV2 => {
  const cloned = cloneEvent(event);
  if (!cloned.body) return cloned;

  const parsed = JSON.parse(cloned.body);
  if (!parsed?.event?.activity) return cloned;

  parsed.event.activity = parsed.event.activity.map((activity: any, idx: number) => ({
    ...activity,
    hash: `${activity.hash}-${suffix}-${idx}`,
  }));
  cloned.body = JSON.stringify(parsed);
  return cloned;
};

const getActivitiesFromEvent = (event: APIGatewayProxyEventV2): any[] => {
  if (!event.body) return [];
  try {
    const parsed = JSON.parse(event.body);
    return Array.isArray(parsed?.event?.activity) ? parsed.event.activity : [];
  } catch {
    return [];
  }
};

const getEthActivities = (event: APIGatewayProxyEventV2): any[] =>
  getActivitiesFromEvent(event).filter((act) => act.asset === ASSETS.ETH);

const getUniqueEthHashCount = (event: APIGatewayProxyEventV2): number =>
  new Set(getEthActivities(event).map((act) => act.hash)).size;

const TEST_TRACKED_WALLETS = [TRACKED_WALLET, WALLET_ADDRESSES.trackedSecondary] as const;
const isTrackedAddress = (address: string): boolean =>
  TEST_TRACKED_WALLETS.includes(address as (typeof TEST_TRACKED_WALLETS)[number]);

const countTrackedDirections = (activities: any[]): number =>
  activities.reduce((count, activity) => {
    if (isTrackedAddress(activity.fromAddress)) count += 1;
    if (isTrackedAddress(activity.toAddress)) count += 1;
    return count;
  }, 0);

const buildTrackedDirectionHashes = (activities: any[]): Set<string> =>
  new Set(
    activities.flatMap((activity) => {
      const keys: string[] = [];
      if (isTrackedAddress(activity.fromAddress)) keys.push(`${activity.hash}-from-${activity.fromAddress}`);
      if (isTrackedAddress(activity.toAddress)) keys.push(`${activity.hash}-to-${activity.toAddress}`);
      return keys;
    }),
  );

type ApiResponse = APIGatewayProxyResultV2 & { statusCode: number; body: string };

function assertApiResponse(res: unknown): asserts res is ApiResponse {
  if (!res || typeof res !== 'object') {
    throw new Error(`expected structured response, received ${String(res)}`);
  }

  const candidate = res as Partial<ApiResponse>;
  if (typeof candidate.statusCode !== 'number') {
    throw new Error('response missing statusCode');
  }
  if (typeof candidate.body !== 'string') {
    throw new Error('response missing body');
  }
}

function expectOk(res: unknown, expectedBody: string) {
  assertApiResponse(res);
  expect(res.statusCode).toBe(200);
  expect(res.body).toBe(expectedBody);
}

function expectBadRequest(res: unknown, expectedBody: string | RegExp) {
  assertApiResponse(res);
  expect(res.statusCode).toBe(400);
  if (expectedBody instanceof RegExp) {
    expect(res.body).toMatch(expectedBody);
  } else {
    expect(res.body).toBe(expectedBody);
  }
}

describe('ingest handler (production variant)', () => {
  let handlerModule: typeof import('../../src/handler');
  let ddbSendMock: jest.Mock;
  let snsSendMock: jest.Mock;
  let insertedItems: Array<Record<string, unknown>>;
  let bucketUpdates: Array<Record<string, unknown>>;
  let snsMessages: Array<{ TopicArn?: string; Message?: string }>;
  let queryResponses: Array<{ Items: Array<{ sk: number; sumEth: number }> }>;
  let seenTransactionPks: Set<string>;
  let lastAlertTimestamps: Record<string, number>;
  let dateSpy: jest.SpyInstance<number, []>;
  let currentEpochSeconds: number;

  beforeAll(async () => {
    process.env.TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? 'test_transactions';
    process.env.WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? 'test_buckets';
    process.env.THRESHOLD_ETH = '1.5';
    process.env.WINDOW_SECONDS = '300';
    process.env.COOLDOWN_SECONDS = '30';
    process.env.BUCKET_SIZE_SECONDS = '60';
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:111111111111:eth-watcher';
    process.env.TRACKED_WALLETS = TEST_TRACKED_WALLETS.join(',');

    handlerModule = await import('../../src/handler');
  });

  beforeEach(() => {
    insertedItems = [];
    bucketUpdates = [];
    snsMessages = [];
    queryResponses = [];
    seenTransactionPks = new Set();
    lastAlertTimestamps = {};
    currentEpochSeconds = 1_700_000_000;
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => currentEpochSeconds * 1000);

    snsSendMock = jest.fn(async (cmd: any) => {
      snsMessages.push(cmd?.input ?? {});
      return {};
    });

    ddbSendMock = jest.fn(async (cmd: any) => {
      if (cmd instanceof PutCommand) {
        const pk = String((cmd.input?.Item as Record<string, unknown>)?.pk ?? '');
        if (pk && seenTransactionPks.has(pk)) {
          const err = new Error(`duplicate pk ${pk}`);
          (err as any).name = 'ConditionalCheckFailedException';
          throw err;
        }
        seenTransactionPks.add(pk);
        insertedItems.push(JSON.parse(JSON.stringify(cmd.input?.Item ?? {})));
        return {};
      }

      if (cmd instanceof UpdateCommand) {
        const expr = cmd.input?.UpdateExpression ?? '';
        if (expr.startsWith('ADD sumEth')) {
          bucketUpdates.push({
            key: cmd.input?.Key,
            expr,
            values: cmd.input?.ExpressionAttributeValues,
          });
          return {};
        }
        if (expr.startsWith('SET #lastAlert')) {
          const pk = String(cmd.input?.Key?.pk ?? '');
          const nowVal = cmd.input?.ExpressionAttributeValues?.[':now'] as number;
          const cutoff = cmd.input?.ExpressionAttributeValues?.[':cutoff'] as number;
          const last = lastAlertTimestamps[pk];
          if (last === undefined || last < cutoff) {
            lastAlertTimestamps[pk] = nowVal;
            return {};
          }
          const err = new Error('cooldown');
          (err as any).name = 'ConditionalCheckFailedException';
          throw err;
        }
      }

      if (cmd instanceof QueryCommand) {
        return queryResponses.shift() ?? { Items: [] };
      }

      return {};
    });

    handlerModule.setDdb({ send: ddbSendMock } as any);
    handlerModule.setSns({ send: snsSendMock } as any);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  const enqueueTotals = (...totals: number[]) => {
    totals.forEach((total) => {
      queryResponses.push({ Items: [{ sk: 123, sumEth: total }] });
    });
  };

  const advanceTime = (seconds: number) => {
    currentEpochSeconds += seconds;
  };

  describe('payload validation', () => {
    test('returns 400 when the webhook body contains invalid JSON', async () => {
      const brokenEvent = cloneEvent(singleTxActivity);
      brokenEvent.body = '{';

      const res = await handlerModule.handler(brokenEvent);

      expectBadRequest(res, /^invalid json:/);
      expect(ddbSendMock).not.toHaveBeenCalled();
      expect(snsSendMock).not.toHaveBeenCalled();
    });

    test('returns 400 when payload is missing required fields', async () => {
      const malformedEvent = cloneEvent(singleTxActivity);
      malformedEvent.body = JSON.stringify({ type: 'ADDRESS_ACTIVITY', event: { activity: [] } });

      const res = await handlerModule.handler(malformedEvent);

      expectBadRequest(res, 'payload does not match AddressActivityWebhook');
      expect(ddbSendMock).not.toHaveBeenCalled();
    });
  });

  describe('asset filtering', () => {
    test('handles single non-ETH transaction payloads', async () => {
      const res = await handlerModule.handler(cloneEvent(singleTxActivity));

      expectOk(res, 'ignored non-ETH asset');
      expect(insertedItems).toHaveLength(0);
      expect(bucketUpdates).toHaveLength(0);
      expect(ddbSendMock).not.toHaveBeenCalled();
    });

    test('ignores multi-transaction payloads with no ETH activity', async () => {
      const res = await handlerModule.handler(cloneEvent(stableBatchActivity));

      expectOk(res, 'ignored non-ETH asset');
      expect(insertedItems).toHaveLength(0);
      expect(bucketUpdates).toHaveLength(0);
    });
  });

  describe('dynamodb writes and aggregation', () => {
    test('processes ETH asset transactions from mixed payloads', async () => {
      const event = cloneEvent(mixedAssetsActivity);
      const ethActivities = getEthActivities(event);
      expect(ethActivities).not.toHaveLength(0);

      const res = await handlerModule.handler(event);

      expectOk(res, 'ok');

      const expectedRecords = countTrackedDirections(ethActivities);
      expect(insertedItems).toHaveLength(expectedRecords);
      expect(bucketUpdates).toHaveLength(expectedRecords);

      const directionCounts = insertedItems.reduce<Record<string, number>>((acc, item) => {
        const key = String(item.direction);
        acc[key] = (acc[key] ?? 0) + 1;
        return acc;
      }, {});

      const trackedFrom = ethActivities.filter((act) => act.fromAddress === TRACKED_WALLET).length;
      const trackedTo = ethActivities.filter((act) => act.toAddress === TRACKED_WALLET).length;

      expect(directionCounts.from).toBe(trackedFrom);
      expect(directionCounts.to).toBe(trackedTo);

      const uniqueTransactionDirections = new Set(insertedItems.map((i) => i.pk));
      expect(uniqueTransactionDirections.size).toBe(expectedRecords);
    });

    test('processes ETH txs when the tracked wallet swaps between source and target', async () => {
      const event = cloneEvent(roleShuffleActivity);
      const ethActivities = getEthActivities(event);
      expect(ethActivities).not.toHaveLength(0);

      const res = await handlerModule.handler(event);

      expectOk(res, 'ok');

      const expectedRecords = countTrackedDirections(ethActivities);
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
    });

    test('deduplicates duplicate ETH activities before updating buckets or counting twice', async () => {
      const duplicatedEvent = cloneEvent(duplicatedTransactionsActivity);
      const uniqueEthCount = getUniqueEthHashCount(duplicatedEvent);
      expect(uniqueEthCount).toBeGreaterThan(0);

      const res = await handlerModule.handler(duplicatedEvent);

      expectOk(res, 'ok');

      const trackedDirectionHashes = buildTrackedDirectionHashes(getEthActivities(duplicatedEvent));
      const expectedRecords = trackedDirectionHashes.size;
      expect(insertedItems).toHaveLength(expectedRecords);
      expect(bucketUpdates).toHaveLength(expectedRecords);

      const uniqueTransactionDirections = new Set(insertedItems.map((item) => item.pk));
      expect(uniqueTransactionDirections.size).toBe(expectedRecords);

      const putCalls = ddbSendMock.mock.calls.filter(([cmd]) => cmd instanceof PutCommand).length;
      const updateCalls = ddbSendMock.mock.calls.filter(([cmd]) =>
        cmd instanceof UpdateCommand && (cmd as UpdateCommand).input?.UpdateExpression?.startsWith('ADD sumEth'),
      ).length;

      expect(putCalls).toBeGreaterThanOrEqual(expectedRecords); // duplicates trigger retries
      expect(updateCalls).toBe(expectedRecords);
    });
  });

  describe('sns + cooldown gating', () => {
    test('publishes an SNS alert when the rolling sum crosses the threshold', async () => {
      enqueueTotals(0.5, 2.5);

      await handlerModule.handler(uniqueTxEvent(mixedAssetsActivity, 'alert-once'));

      expect(snsMessages).toHaveLength(1);
      const message = JSON.parse(snsMessages[0].Message ?? '{}');
      expect(message.direction).toBeDefined();
      expect(message.totalEth).toBe(2.5);
    });

    test('suppresses alerts while the cooldown window is active', async () => {
      enqueueTotals(0.5, 2.5);
      await handlerModule.handler(uniqueTxEvent(mixedAssetsActivity, 'cooldown-1'));
      expect(snsMessages).toHaveLength(1);

      enqueueTotals(0.5, 2.5);
      advanceTime(5);
      await handlerModule.handler(uniqueTxEvent(mixedAssetsActivity, 'cooldown-2'));

      expect(snsMessages).toHaveLength(1);
    });

    test('emits a new alert once the cooldown expires', async () => {
      enqueueTotals(0.5, 2.5);
      await handlerModule.handler(uniqueTxEvent(mixedAssetsActivity, 'cooldown-expire-1'));
      expect(snsMessages).toHaveLength(1);

      enqueueTotals(0.5, 2.5);
      advanceTime(45);
      await handlerModule.handler(uniqueTxEvent(mixedAssetsActivity, 'cooldown-expire-2'));

      expect(snsMessages).toHaveLength(2);
    });

    test('publishes counterparty details for multiple tracked wallets', async () => {
      enqueueTotals(2.0, 2.1, 2.2, 2.3);

      const event = cloneEvent(dualTrackedWalletActivity);
      const res = await handlerModule.handler(event);

      expectOk(res, 'ok');
      expect(snsMessages).toHaveLength(4);

      const parsed = snsMessages.map((entry) => JSON.parse(entry.Message ?? '{}'));

      const byWallet = parsed.reduce<Record<string, typeof parsed>>((acc, msg) => {
        const key = msg.wallet as string;
        acc[key] = acc[key] ?? [];
        acc[key].push(msg);
        return acc;
      }, {});

      const primary = byWallet[TRACKED_WALLET];
      const secondary = byWallet[WALLET_ADDRESSES.trackedSecondary];

      expect(primary).toHaveLength(2);
      expect(secondary).toHaveLength(2);

      const primaryDirections = primary.map((msg) => msg.direction).sort();
      expect(primaryDirections).toEqual(['from', 'to']);
      expect(primary.find((msg) => msg.direction === 'from')?.counterparty).toBe(WALLET_ADDRESSES.counterpartyA);
      expect(primary.find((msg) => msg.direction === 'to')?.counterparty).toBe(WALLET_ADDRESSES.counterpartyB);

      const secondaryDirections = secondary.map((msg) => msg.direction).sort();
      expect(secondaryDirections).toEqual(['from', 'to']);
      expect(secondary.find((msg) => msg.direction === 'from')?.counterparty).toBe(WALLET_ADDRESSES.counterpartyB);
      expect(secondary.find((msg) => msg.direction === 'to')?.counterparty).toBe(WALLET_ADDRESSES.counterpartyA);

      const trackedIndexes = new Set(parsed.map((msg) => msg.trackedWalletIndex));
      expect(trackedIndexes.has(0)).toBe(true);
      expect(trackedIndexes.has(1)).toBe(true);
    });
  });
});
