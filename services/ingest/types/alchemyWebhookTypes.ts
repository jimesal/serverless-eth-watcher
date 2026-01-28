export interface AddressActivityWebhook {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY';
  event: AddressActivityEvent;
}

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

export const ASSETS = {
  USDC: 'USDC',
  ETH: 'ETH',
  DAI: 'DAI',
} as const;

export type AssetSymbol = (typeof ASSETS)[keyof typeof ASSETS];

export const WALLET_ADDRESSES = {
  tracked: '0x1111111111111111111111111111111111111111',
  trackedSecondary: '0x4444444444444444444444444444444444444444',
  counterpartyA: '0x2222222222222222222222222222222222222222',
  counterpartyB: '0x3333333333333333333333333333333333333333',
} as const;

export const TRACKED_WALLET = WALLET_ADDRESSES.tracked;
export const SECONDARY_TRACKED_WALLET = WALLET_ADDRESSES.trackedSecondary;

export type WalletAddress = (typeof WALLET_ADDRESSES)[keyof typeof WALLET_ADDRESSES];

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
