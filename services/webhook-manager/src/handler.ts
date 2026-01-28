import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { jsonResponse } from '../../shared/http';
import { TRACKED_WALLETS, loadWebhookEnvConfig } from './env';

const CREATE_WEBHOOK_ROUTE = '/create-webhook';

export interface AlchemyWebhookRecord {
  id: string;
  appId: string;
  network: string;
  webhookUrl: string;
  webhookType: string;
  addresses: string[];
  signingKey?: string;
}

export const handler = async (
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
  try {
    const config = loadWebhookEnvConfig();
    const payload = buildCreatePayload(config);
    const webhook = await createWebhook(config, payload);

    return jsonResponse(200, {
      message: 'Alchemy webhook created',
      webhookId: webhook.id,
      network: webhook.network,
      trackedWallets: payload.addresses.length,
    });
  } catch (error) {
    console.error('webhookManager.createFailed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return jsonResponse(500, {
      message: 'failed to create webhook',
      error: error instanceof Error ? error.message : 'unknown error',
    });
  }
};

interface CreateWebhookPayload {
  appId: string;
  network: string;
  webhook_url: string;
  webhook_type: 'ADDRESS_ACTIVITY';
  addresses: string[];
  name: string;
}

function buildCreatePayload(config: ReturnType<typeof loadWebhookEnvConfig>): CreateWebhookPayload {
  return {
    appId: config.appId,
    network: config.network,
    webhook_url: config.deliveryUrl,
    webhook_type: 'ADDRESS_ACTIVITY',
    addresses: Array.from(TRACKED_WALLETS),
    name: buildWebhookName(config),
  };
}

async function createWebhook(
  config: ReturnType<typeof loadWebhookEnvConfig>,
  payload: CreateWebhookPayload,
): Promise<AlchemyWebhookRecord> {
  const url = `${config.baseUrl}${CREATE_WEBHOOK_ROUTE}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Alchemy-Token': config.apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await readBody(res);
    throw new Error(`Alchemy API POST ${url} failed (${res.status}): ${text}`);
  }

  return (await res.json()) as AlchemyWebhookRecord;
}

function buildWebhookName(config: ReturnType<typeof loadWebhookEnvConfig>): string {
  try {
    const { hostname } = new URL(config.deliveryUrl);
    return `${config.appId}-${config.network}-${hostname.replace(/\./g, '-')}`;
  } catch {
    return `${config.appId}-${config.network}`;
  }
}

async function readBody(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch (error) {
    console.error('webhookManager.readBodyFailed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return '<unavailable>';
  }
}
