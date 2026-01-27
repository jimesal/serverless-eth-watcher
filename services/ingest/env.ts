export const TRANSACTIONS_TABLE = process.env.TRANSACTIONS_TABLE ?? "";
export const WALLET_BUCKETS_TABLE = process.env.WALLET_BUCKETS_TABLE ?? "";
export const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN ?? "";

export const THRESHOLD_ETH = Number(process.env.THRESHOLD_ETH);
export const WINDOW_SECONDS = Number(process.env.WINDOW_SECONDS);
export const COOLDOWN_SECONDS = Number(process.env.COOLDOWN_SECONDS);
export const BUCKET_SIZE_SECONDS = Number(process.env.BUCKET_SIZE_SECONDS ?? 60);
