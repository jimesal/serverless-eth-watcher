import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

const TRACKED_WALLETS = Object.freeze([
  '0xB0C259F488b1cc1cba3df3a1c2aa123456789abc',
  '0x1F873579b1af35Ba41ab78a51b710C0e98765432',
]);

const DEFAULT_CONFIG: Readonly<Pick<EnsureWebhookConfig, 'network' | 'baseUrl'>> = {
  network: 'eth-mainnet',
  baseUrl: 'https://dashboard.alchemyapi.io/api',
};

const ROUTES = {
  list: (appId: string) => `/apps/${appId}/webhooks`,
  create: '/create-webhook',
  update: (webhookId: string) => `/update-webhook/${webhookId}`,
} as const;

export interface EnsureWebhookConfig {
  apiKey: string;
  appId: string;
  deliveryUrl: string;
  network: string;
  addresses: string[];
  baseUrl: string;
  name?: string;
}

export interface AlchemyWebhookRecord {
  id: string;
  appId: string;
  network: string;
  webhookUrl: string;
  webhookType: string;
  addresses: string[];
  signingKey?: string;
}

export interface EnsureWebhookResult {
  action: 'created' | 'updated' | 'noop';
  webhook: AlchemyWebhookRecord;
}

export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const config = loadConfig();
    const result = await ensureWebhook({
      ...config,
      addresses: TRACKED_WALLETS,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: `Alchemy webhook ${result.action}`,
        webhookId: result.webhook.id,
        network: result.webhook.network,
        trackedWallets: TRACKED_WALLETS.length,
      }),
    };
  } catch (error) {
    console.error('Failed to manage Alchemy webhook', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        message: 'failed to ensure webhook',
        error: error instanceof Error ? error.message : 'unknown error',
      }),
    };
  }
};

function loadConfig(): Omit<EnsureWebhookConfig, 'addresses'> {
  const apiKey = requireEnv('ALCHEMY_ADMIN_API_KEY');
  const appId = requireEnv('ALCHEMY_APP_ID');
  const deliveryUrl = requireEnv('ALCHEMY_DELIVERY_URL');
  return {
    apiKey,
    appId,
    deliveryUrl,
    network: process.env.ALCHEMY_NETWORK ?? DEFAULT_CONFIG.network,
    baseUrl: (process.env.ALCHEMY_API_BASE_URL ?? DEFAULT_CONFIG.baseUrl).replace(/\/$/, ''),
    name: process.env.ALCHEMY_WEBHOOK_NAME ?? 'serverless-eth-watcher',
  };
}

async function ensureWebhook(config: EnsureWebhookConfig): Promise<EnsureWebhookResult> {
  const headers = buildHeaders(config.apiKey);
  const candidates = await listWebhooks({
    baseUrl: config.baseUrl,
    appId: config.appId,
    headers,
  });

  const existing = candidates.find(
    (candidate) => normalize(candidate.webhookUrl) === normalize(config.deliveryUrl),
  );

  if (existing) {
    const webhook = await updateWebhook({ config, headers, webhookId: existing.id });
    return { action: 'updated', webhook };
  }

  const webhook = await createWebhook({ config, headers });
  return { action: 'created', webhook };
}

interface ListWebhooksInput {
  baseUrl: string;
  appId: string;
  headers: Record<string, string>;
}

async function listWebhooks(input: ListWebhooksInput): Promise<AlchemyWebhookRecord[]> {
  const response = await callAlchemy<AlchemyWebhookRecord[] | { data?: AlchemyWebhookRecord[] }>(
    'GET',
    `${input.baseUrl}${ROUTES.list(input.appId)}`,
    input.headers,
  );

  if (Array.isArray(response)) {
    return response;
  }
  return Array.isArray(response?.data) ? response.data : [];
}

interface CreateWebhookInput {
  config: EnsureWebhookConfig;
  headers: Record<string, string>;
}

async function createWebhook(input: CreateWebhookInput): Promise<AlchemyWebhookRecord> {
  const payload = {
    appId: input.config.appId,
    network: input.config.network,
    webhook_url: input.config.deliveryUrl,
    webhook_type: 'ADDRESS_ACTIVITY',
    address_activity: {
      addresses: input.config.addresses,
    },
    name: input.config.name,
  };

  return callAlchemy<AlchemyWebhookRecord>(
    'POST',
    `${input.config.baseUrl}${ROUTES.create}`,
    input.headers,
    payload,
  );
}

interface UpdateWebhookInput {
  config: EnsureWebhookConfig;
  headers: Record<string, string>;
  webhookId: string;
}

async function updateWebhook(input: UpdateWebhookInput): Promise<AlchemyWebhookRecord> {
  const payload = {
    webhook_id: input.webhookId,
    webhook_url: input.config.deliveryUrl,
    address_activity: {
      addresses: input.config.addresses,
    },
    network: input.config.network,
    name: input.config.name,
  };

  return callAlchemy<AlchemyWebhookRecord>(
    'PATCH',
    `${input.config.baseUrl}${ROUTES.update(input.webhookId)}`,
    input.headers,
    payload,
  );
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Alchemy-Token': apiKey,
  };
}

interface FetchLikeRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

interface FetchLikeResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

type FetchLike = (url: string, init?: FetchLikeRequestInit) => Promise<FetchLikeResponse>;

const fetchLike: FetchLike = (globalThis.fetch as FetchLike) ?? (async () => {
  throw new Error('globalThis.fetch is not available in this runtime. Use Node 18+ or polyfill fetch.');
});

async function callAlchemy<T>(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Record<string, unknown>,
): Promise<T> {
  const res = await fetchLike(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await safeRead(res);
    throw new Error(`Alchemy API ${method} ${url} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as T;
}

async function safeRead(res: FetchLikeResponse): Promise<string> {
  try {
    return await res.text();
  } catch (err) {
    console.error('Failed reading Alchemy error response', err);
    return '<unavailable>';
  }
}

function normalize(value: string): string {
  return value.replace(/\/$/, '').toLowerCase();
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export const __testables = {
  ensureWebhook,
  listWebhooks,
  createWebhook,
  updateWebhook,
  loadConfig,
  TRACKED_WALLETS,
};
