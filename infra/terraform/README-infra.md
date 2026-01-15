This folder contains a minimal Terraform skeleton to create the infra pieces
used by the project: DynamoDB tables, an SNS topic, and a minimal IAM role for
Lambda execution. Lambda and API Gateway resources are intentionally left as
placeholders because deployment artifacts are usually produced by CI and
referenced from S3.

Quick usage

1. Initialize Terraform

```bash
cd infra/terraform
terraform init
```

2. Preview the plan

```bash
terraform plan -var='aws_region=us-east-1'
```

3. Apply (creates resources in your AWS account)

```bash
terraform apply -var='aws_region=us-east-1'
```

Notes
- After apply, `transactions_table_name`, `wallet_buckets_table_name`, and
  `sns_topic_arn` are available as outputs.
- Enable TTL for the `wallet_buckets` table using the AWS Console or the
  `aws_dynamodb_table_time_to_live` resource (not all Terraform versions may
  support it directly depending on provider version).
- For Lambda deployment, build a CJS bundle (we recommend esbuild) and
  publish to S3 or deploy via CI; then reference the artifact from
  `aws_lambda_function` resource.
