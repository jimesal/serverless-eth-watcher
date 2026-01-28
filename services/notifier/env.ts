import { optionalEnv, requireEnv } from '../shared/env';

export const SLACK_WEBHOOK_URL = requireEnv('SLACK_WEBHOOK_URL');
export const APP_NAME = optionalEnv('APP_NAME', 'serverless-eth-watcher');
