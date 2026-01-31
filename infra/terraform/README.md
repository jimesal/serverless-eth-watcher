# Serverless ETH Watcher - Terraform Infrastructure

This directory contains Terraform configuration to deploy the Serverless ETH Watcher infrastructure on AWS.

## Architecture

The infrastructure consists of:

- **Lambda Functions**:
  - `ingestionHandler` - Processes Alchemy webhook events, tracks wallet transactions
  - `notifierHandler` - Sends Slack notifications when alerts trigger
  - `webhookHandler` - Manages Alchemy webhook subscriptions

- **DynamoDB Tables**:
  - `eth-watcher-transactions-table` - Stores transaction records
  - `eth-watcher-buckets-table` - Time-bucketed wallet activity data

- **SNS Topic**: `eth-watcher-alerts` - Pub/sub for alert notifications

- **API Gateway**: `AlchemyClient` - HTTP API endpoint for Alchemy webhooks

- **IAM Roles**: Service roles with least-privilege policies for each Lambda

## Prerequisites

1. **Terraform** >= 1.5.0 installed
2. **AWS CLI** configured with appropriate credentials
3. **Node.js** 24.x for Lambda runtime
4. **Alchemy Account** with Admin API key
5. **Slack Webhook** URL for notifications

## Configuration

### 1. Copy the Example Variables

```bash
cp terraform.tfvars.example terraform.tfvars
```

### 2. Edit `terraform.tfvars`

Fill in your actual values:

```hcl
# Sensitive values - DO NOT COMMIT
slack_webhook_url     = "https://hooks.slack.com/services/..."
alchemy_admin_api_key = "your-alchemy-admin-api-key"
alchemy_app_id        = "your-alchemy-app-id"

# Wallet addresses to monitor
tracked_wallets = [
  "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
  "0xE592427A0AEce92De3Edee1F18E0157C05861564"
]

# Alert thresholds (adjust as needed)
threshold_eth    = 0.1    # Alert when > 0.1 ETH in window
window_seconds   = 300    # 5-minute rolling window
cooldown_seconds = 30     # 30-second cooldown between alerts
```

### 3. Build Lambda Artifacts

Before deploying, compile and package your Lambda functions:

```bash
# Build ingest handler
cd ../../services/ingest
npm install
npm run build
cd -

# Build notifier
cd ../../services/notifier  
npm install
npm run build
cd -

# Build webhook manager
cd ../../services/webhook-manager
npm install
npm run build
cd -
```

## Deployment

### Initialize Terraform

```bash
terraform init
```

### Plan Changes

```bash
terraform plan
```

Review the plan to ensure it matches your expectations.

### Apply Configuration

```bash
terraform apply
```

Type `yes` when prompted to create the resources.

### Outputs

After deployment, Terraform will output:

- API Gateway endpoint URL
- Lambda function names
- DynamoDB table names
- SNS topic ARN

## Modules

The configuration uses reusable modules:

- **`modules/dynamodb`** - DynamoDB table definitions
- **`modules/sns`** - SNS topic configuration
- **`modules/lambda_function`** - Lambda function with IAM role
- **`modules/api_gateway_http`** - HTTP API Gateway setup

## Important Notes

### Resource Names

Resource names match the deployed AWS configuration:
- Lambda: `ingestionHandler`, `notifierHandler`, `webhookHandler`
- Tables: `eth-watcher-transactions-table`, `eth-watcher-buckets-table`
- API: `AlchemyClient`

**Note**: This Terraform configuration was aligned with existing AWS resources using the `../export_aws_resources.sh` script, which exports deployed resource configurations to JSON files. This ensures the Terraform code matches the actual production infrastructure, making it safe for other developers to recreate or manage the same architecture.

### Sensitive Data

**Never commit these files:**
- `terraform.tfvars` (contains secrets)
- `*.tfstate` (contains resource IDs)
- `.terraform/` (cached providers)

### Remote State (Recommended)

For team environments, configure an S3 backend in `provider.tf`:

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "eth-watcher/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "terraform-state-lock"
    encrypt        = true
  }
}
```

## Maintenance

### Updating Configuration

1. Modify `terraform.tfvars` or `variables.tf`
2. Run `terraform plan` to preview changes
3. Run `terraform apply` to apply changes

### Destroying Resources

```bash
terraform destroy
```

**Warning**: This will delete all resources. Ensure you have backups of any important data.

## Troubleshooting

### Lambda Runtime Errors

Ensure you're building with Node.js 24.x:
```bash
node --version  # Should be v24.x
```

### IAM Permission Issues

The Lambda roles require:
- DynamoDB: `PutItem`, `UpdateItem`, `GetItem`, `Query`
- SNS: `Publish`
- CloudWatch: `CreateLogGroup`, `CreateLogStream`, `PutLogEvents`

### API Gateway 403 Errors

Ensure Lambda permissions allow API Gateway invocation:
```bash
aws lambda get-policy --function-name ingestionHandler
```

## Additional Resources

- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [Terraform AWS Provider](https://registry.terraform.io/providers/hashicorp/aws/latest/docs)
- [Alchemy Webhooks](https://docs.alchemy.com/docs/using-notify)
