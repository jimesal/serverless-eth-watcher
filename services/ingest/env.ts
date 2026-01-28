import {
	optionalEnv,
	optionalNumberEnv,
	parseWalletList,
	requireEnv,
	requireNumberEnv,
} from '../shared/env';

export const TRANSACTIONS_TABLE = requireEnv('TRANSACTIONS_TABLE');
export const WALLET_BUCKETS_TABLE = requireEnv('WALLET_BUCKETS_TABLE');
export const SNS_TOPIC_ARN = optionalEnv('SNS_TOPIC_ARN');

export const THRESHOLD_ETH = requireNumberEnv('THRESHOLD_ETH');
export const WINDOW_SECONDS = requireNumberEnv('WINDOW_SECONDS', { integer: true });
export const COOLDOWN_SECONDS = requireNumberEnv('COOLDOWN_SECONDS', { integer: true });
export const BUCKET_SIZE_SECONDS = optionalNumberEnv('BUCKET_SIZE_SECONDS', 60, { integer: true });

export const TRACKED_WALLETS: readonly string[] = Object.freeze(
	parseWalletList(process.env.TRACKED_WALLETS) ?? [],
);
