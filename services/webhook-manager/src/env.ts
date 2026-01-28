const DEFAULTS = {
  network: 'ETH_MAINNET',
  baseUrl: 'https://dashboard.alchemyapi.io/api',
} as const;

const FALLBACK_WALLETS = Object.freeze([
  '0xB0C259F488b1cc1cba3df3a1c2aa123456789abc',
  '0x1F873579b1af35Ba41ab78a51b710C0e98765432',
]);

export interface WebhookEnvConfig {
  apiKey: string;
  appId: string;
  deliveryUrl: string;
  network: string;
  baseUrl: string;
}

export const TRACKED_WALLETS: readonly string[] = Object.freeze(
  parseWallets(process.env.TRACKED_WALLETS) ?? FALLBACK_WALLETS,
);

export function loadWebhookEnvConfig(): WebhookEnvConfig {
  return {
    apiKey: requireEnv('ALCHEMY_ADMIN_API_KEY'),
    appId: requireEnv('ALCHEMY_APP_ID'),
    deliveryUrl: requireEnv('ALCHEMY_DELIVERY_URL'),
    network: DEFAULTS.network,
    baseUrl: process.env.ALCHEMY_API_BASE_URL ?? DEFAULTS.baseUrl,
  };
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function parseWallets(raw?: string): string[] | undefined {
  if (!raw) return undefined;
  const list = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}
