This module now provisions the full serverless pipeline that matches the three
TypeScript services in the repo. Applying it creates:

- DynamoDB `transactions` and `wallet_buckets` tables (on-demand billing).
- SNS `alerts` topic plus a Lambda subscription for the notifier.
- HTTP API (API Gateway v2) fronting the ingest Lambda on `POST /webhook`.
- Lambda functions for ingest, notifier, and webhook-manager, each packaged
  straight from `services/*/dist` using the `archive_file` data source.
- IAM roles with scoped permissions for DynamoDB, SNS, and CloudWatch Logs.

## Prerequisites

1. Build the TypeScript bundles so `dist/handler.js` exists for every service:
   ```bash
   npm --prefix services/ingest run build
   npm --prefix services/notifier run build
   npm --prefix services/webhook-manager run build
   ```
2. Provide runtime secrets (Slack webhook, Alchemy credentials, etc.) via a
   `.tfvars` file or the CLI `-var` flag. Secrets are marked as `sensitive` in
   `variables.tf` but should still be stored securely.

## Key variables

- `tracked_wallets` – list of wallet addresses monitored across ingest and
  webhook-manager deployments.
- `threshold_eth`, `window_seconds`, `cooldown_seconds`, `bucket_size_seconds` –
  ingest rolling-window controls.
- `slack_webhook_url`, `app_name` – notifier configuration.
- `alchemy_admin_api_key`, `alchemy_app_id` – credentials for provisioning
  Address Activity webhooks.
- `alchemy_api_base_url` – optional override for non-production Alchemy hosts.
- `alchemy_delivery_url_override` – only set this if you need a custom delivery
  endpoint; by default the module wires the deployed HTTP API URL into the
  webhook manager Lambda so re-running it will create hooks pointing at your
  stack.

## Usage

```bash
cd infra/terraform
terraform init
terraform plan -var-file=secrets.auto.tfvars
terraform apply -var-file=secrets.auto.tfvars
```

## Outputs

- `http_api_endpoint` – invoke URL for Alchemy webhooks (`POST /webhook`).
- `transactions_table_name`, `wallet_buckets_table_name`, `sns_topic_arn` – core
  data-plane resource identifiers.
- `*_lambda_name` and `*_lambda_role_arn` – deployed Lambda metadata for quick
  inspection or CI wiring.

TTL on `wallet_buckets` is still documented via a placeholder resource; enable
it in the console or by adding `aws_dynamodb_table_time_to_live` once your AWS
provider version supports it in your environment.
