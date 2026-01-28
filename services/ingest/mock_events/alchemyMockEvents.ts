import {
  AddressActivityEntry,
  AddressActivityWebhook,
  ASSETS,
  TRACKED_WALLET,
  SECONDARY_TRACKED_WALLET,
  WALLET_ADDRESSES,
  WalletAddress,
  AssetSymbol,
} from '../types/alchemyWebhookTypes';

const BASE_BLOCK = '0xabc123';
const BASE_HASH = '0xblockhash';
const BASE_DATA = '0x01';
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const USDC_CONTRACT = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const BASE_CREATED_AT = '2024-09-25T13:52:47.561Z';

type ActivitySeed = {
  asset: AssetSymbol;
  hash: string;
  value: number;
  from: WalletAddress;
  to: WalletAddress;
  logIndex: number;
};

function toHexIndex(index: number): string {
  return `0x${index.toString(16)}`;
}

function createActivityEntry(seed: ActivitySeed): AddressActivityEntry {
  const isEth = seed.asset === ASSETS.ETH;
  const contractAddress = isEth ? ZERO_ADDRESS : USDC_CONTRACT;
  const decimals = isEth ? 18 : 6;
  const hexIndex = toHexIndex(seed.logIndex);

  return {
    asset: seed.asset,
    blockNum: BASE_BLOCK,
    category: isEth ? 'external' : 'token',
    erc1155Metadata: null,
    erc721TokenId: null,
    fromAddress: seed.from,
    hash: seed.hash,
    log: {
      address: contractAddress,
      blockHash: BASE_HASH,
      blockNumber: BASE_BLOCK,
      data: BASE_DATA,
      logIndex: hexIndex,
      removed: false,
      topics: ['0xtransfer', seed.from, seed.to],
      transactionHash: seed.hash,
      transactionIndex: hexIndex,
    },
    rawContract: {
      address: contractAddress,
      decimals,
      rawValue: BASE_DATA,
    },
    toAddress: seed.to,
    typeTraceAddress: null,
    value: seed.value,
  };
}

function buildWebhookEvent(label: string, activity: AddressActivityEntry[]): AddressActivityWebhook {
  return {
    webhookId: `wh_${label}`,
    id: `whevt_${label}`,
    createdAt: BASE_CREATED_AT,
    type: 'ADDRESS_ACTIVITY',
    event: {
      network: 'ETH_MAINNET',
      activity,
    },
  };
}

const { counterpartyA, counterpartyB } = WALLET_ADDRESSES;
const singleTxActivity = [
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xsingle-usdc',
    value: 25.5,
    from: TRACKED_WALLET,
    to: counterpartyA,
    logIndex: 1,
  }),
];

const stableBatchActivity = [
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xstable-1',
    value: 35.75,
    from: TRACKED_WALLET,
    to: counterpartyA,
    logIndex: 2,
  }),
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xstable-2',
    value: 41.1,
    from: counterpartyA,
    to: TRACKED_WALLET,
    logIndex: 3,
  }),
  createActivityEntry({
    asset: ASSETS.DAI,
    hash: '0xstable-3',
    value: 17.45,
    from: TRACKED_WALLET,
    to: counterpartyB,
    logIndex: 4,
  }),
];

const mixedAssetActivity = [
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xmix-eth-1',
    value: 1.2,
    from: TRACKED_WALLET,
    to: counterpartyB,
    logIndex: 5,
  }),
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xmix-usdc-1',
    value: 67.4,
    from: counterpartyB,
    to: TRACKED_WALLET,
    logIndex: 6,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xmix-eth-2',
    value: 0.85,
    from: counterpartyA,
    to: TRACKED_WALLET,
    logIndex: 7,
  }),
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xmix-usdc-2',
    value: 90.6,
    from: TRACKED_WALLET,
    to: counterpartyA,
    logIndex: 8,
  }),
];

const directionShuffleActivity = [
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xrole-1',
    value: 12.3,
    from: TRACKED_WALLET,
    to: counterpartyB,
    logIndex: 9,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xrole-2',
    value: 2.05,
    from: counterpartyA,
    to: TRACKED_WALLET,
    logIndex: 10,
  }),
  createActivityEntry({
    asset: ASSETS.USDC,
    hash: '0xrole-3',
    value: 77.7,
    from: counterpartyB,
    to: TRACKED_WALLET,
    logIndex: 11,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xrole-4',
    value: 0.6,
    from: TRACKED_WALLET,
    to: counterpartyA,
    logIndex: 12,
  }),
];

const dualTrackedWalletActivity = [
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xdual-eth-1',
    value: 1.8,
    from: TRACKED_WALLET,
    to: counterpartyA,
    logIndex: 13,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xdual-eth-2',
    value: 2.4,
    from: counterpartyB,
    to: TRACKED_WALLET,
    logIndex: 14,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xdual-eth-3',
    value: 1.3,
    from: SECONDARY_TRACKED_WALLET,
    to: counterpartyB,
    logIndex: 15,
  }),
  createActivityEntry({
    asset: ASSETS.ETH,
    hash: '0xdual-eth-4',
    value: 2.9,
    from: counterpartyA,
    to: SECONDARY_TRACKED_WALLET,
    logIndex: 16,
  }),
];

export const singleTxEvent = buildWebhookEvent('single_tx', singleTxActivity);
export const stableBatchEvent = buildWebhookEvent('stable_batch', stableBatchActivity);
export const mixedAssetEvent = buildWebhookEvent('mixed_asset', mixedAssetActivity);
export const roleShuffleEvent = buildWebhookEvent('role_shuffle', directionShuffleActivity);
export const dualTrackedWalletEvent = buildWebhookEvent('dual_tracked_wallet', dualTrackedWalletActivity);

export const mockAddressActivityEvent = mixedAssetEvent;

export const addressActivityWebhookMocks: AddressActivityWebhook[] = [
  singleTxEvent,
  stableBatchEvent,
  mixedAssetEvent,
  roleShuffleEvent,
  dualTrackedWalletEvent,
];
