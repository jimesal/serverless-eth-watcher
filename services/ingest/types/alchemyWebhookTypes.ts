/**
 * Central definitions for the Alchemy address-activity webhook payload plus
 * runtime validators that the ingest Lambdas and tests can share.
 */

/* ---------------- Asset metadata ---------------- */

export const ASSETS = {
  USDC: 'USDC',
  ETH: 'ETH',
  DAI: 'DAI',
} as const;

export type AssetSymbol = (typeof ASSETS)[keyof typeof ASSETS];

const ASSET_VALUES: AssetSymbol[] = Object.values(ASSETS);

/* ---------------- Wallet fixtures ---------------- */

export const WALLET_ADDRESSES = {
  tracked: '0x1111111111111111111111111111111111111111',
  trackedSecondary: '0x4444444444444444444444444444444444444444',
  counterpartyA: '0x2222222222222222222222222222222222222222',
  counterpartyB: '0x3333333333333333333333333333333333333333',
} as const;

export type WalletAddress = (typeof WALLET_ADDRESSES)[keyof typeof WALLET_ADDRESSES];

export const TRACKED_WALLET = WALLET_ADDRESSES.tracked;
export const SECONDARY_TRACKED_WALLET = WALLET_ADDRESSES.trackedSecondary;

/* ---------------- Webhook payload shapes ---------------- */

export interface ActivityLog {
  address: string;
  blockHash: string;
  blockNumber: string;
  data: string;
  logIndex: string;
  removed: boolean;
  topics: string[];
  transactionHash: string;
  transactionIndex: string;
}

export interface RawContract {
  address: string;
  decimals: number;
  rawValue: string;
}

export interface AddressActivityEntry {
  asset: AssetSymbol;
  blockNum: string;
  category: string;
  erc1155Metadata: unknown;
  erc721TokenId: string | null;
  fromAddress: WalletAddress;
  hash: string;
  log: ActivityLog;
  rawContract: RawContract;
  toAddress: WalletAddress;
  typeTraceAddress: string | null;
  value: number;
}

export interface AddressActivityEvent {
  network: string;
  activity: AddressActivityEntry[];
}

export interface AddressActivityWebhook {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY';
  event: AddressActivityEvent;
}

/* ---------------- Runtime guards ---------------- */

export function isAddressActivityEntryPayload(value: unknown): value is AddressActivityEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<AddressActivityEntry>;

  return (
    typeof entry.hash === 'string' &&
    typeof entry.fromAddress === 'string' &&
    typeof entry.toAddress === 'string' &&
    typeof entry.value === 'number' &&
    typeof entry.asset === 'string' &&
    ASSET_VALUES.includes(entry.asset as AssetSymbol)
  );
}

export function isAddressActivityWebhookPayload(value: unknown): value is AddressActivityWebhook {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<AddressActivityWebhook>;

  if (
    typeof payload.webhookId !== 'string' ||
    typeof payload.id !== 'string' ||
    typeof payload.createdAt !== 'string' ||
    payload.type !== 'ADDRESS_ACTIVITY'
  ) {
    return false;
  }

  if (!payload.event || !Array.isArray(payload.event.activity)) {
    return false;
  }

  return payload.event.activity.every(isAddressActivityEntryPayload);
}
