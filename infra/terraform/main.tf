locals {
  tracked_wallets_csv = length(var.tracked_wallets) > 0 ? join(",", var.tracked_wallets) : ""
}

data "archive_file" "ingest" {
  type        = "zip"
  source_dir  = abspath("${path.module}/../../services/ingest/dist")
  output_path = "${path.module}/.terraform/ingest-handler.zip"
}

data "archive_file" "notifier" {
  type        = "zip"
  source_dir  = abspath("${path.module}/../../services/notifier/dist")
  output_path = "${path.module}/.terraform/notifier-handler.zip"
}

data "archive_file" "webhook_manager" {
  type        = "zip"
  source_dir  = abspath("${path.module}/../../services/webhook-manager/dist")
  output_path = "${path.module}/.terraform/webhook-manager-handler.zip"
}

module "dynamodb" {
  source                     = "./modules/dynamodb"
  transactions_table_name    = var.transactions_table_name
  wallet_buckets_table_name  = var.wallet_buckets_table_name
}

module "sns_alerts" {
  source     = "./modules/sns"
  topic_name = var.sns_topic_name
}

module "lambda_ingest" {
  source            = "./modules/lambda_function"
  function_name     = "serverless-eth-watcher-ingest"
  handler           = "handler.handler"
  role_name         = "serverless-eth-watcher-ingest"
  memory_size       = 256
  timeout           = 20
  filename          = data.archive_file.ingest.output_path
  source_code_hash  = data.archive_file.ingest.output_base64sha256
  environment_variables = {
    TRANSACTIONS_TABLE   = module.dynamodb.transactions_table_name
    WALLET_BUCKETS_TABLE = module.dynamodb.wallet_buckets_table_name
    SNS_TOPIC_ARN        = module.sns_alerts.topic_arn
    THRESHOLD_ETH        = tostring(var.threshold_eth)
    WINDOW_SECONDS       = tostring(var.window_seconds)
    COOLDOWN_SECONDS     = tostring(var.cooldown_seconds)
    BUCKET_SIZE_SECONDS  = tostring(var.bucket_size_seconds)
    TRACKED_WALLETS      = local.tracked_wallets_csv
  }
  policy_statements = [
    {
      Effect = "Allow"
      Action = [
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:GetItem",
        "dynamodb:Query"
      ]
      Resource = [
        module.dynamodb.transactions_table_arn,
        module.dynamodb.wallet_buckets_table_arn
      ]
    },
    {
      Effect = "Allow"
      Action = ["sns:Publish"]
      Resource = [module.sns_alerts.topic_arn]
    },
    {
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = ["*"]
    }
  ]
}

module "api_gateway_ingest" {
  source               = "./modules/api_gateway_http"
  api_name             = "serverless-eth-watcher-ingest"
  integration_uri      = module.lambda_ingest.lambda_function_invoke_arn
  lambda_function_name = module.lambda_ingest.lambda_function_name
  route_key            = "POST /webhook"
}

module "lambda_notifier" {
  source            = "./modules/lambda_function"
  function_name     = "serverless-eth-watcher-notifier"
  handler           = "handler.handler"
  role_name         = "serverless-eth-watcher-notifier"
  memory_size       = 128
  timeout           = 15
  filename          = data.archive_file.notifier.output_path
  source_code_hash  = data.archive_file.notifier.output_base64sha256
  environment_variables = {
    SLACK_WEBHOOK_URL = var.slack_webhook_url
    APP_NAME          = var.app_name
  }
  policy_statements = [
    {
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = ["*"]
    }
  ]
}

module "lambda_webhook_manager" {
  source            = "./modules/lambda_function"
  function_name     = "serverless-eth-watcher-webhook-manager"
  handler           = "handler.handler"
  role_name         = "serverless-eth-watcher-webhook-manager"
  memory_size       = 128
  timeout           = 60
  filename          = data.archive_file.webhook_manager.output_path
  source_code_hash  = data.archive_file.webhook_manager.output_base64sha256
  environment_variables = {
    ALCHEMY_ADMIN_API_KEY = var.alchemy_admin_api_key
    ALCHEMY_APP_ID        = var.alchemy_app_id
    ALCHEMY_DELIVERY_URL  = var.alchemy_delivery_url_override != "" ? var.alchemy_delivery_url_override : module.api_gateway_ingest.invoke_url
    ALCHEMY_API_BASE_URL  = var.alchemy_api_base_url
    TRACKED_WALLETS       = local.tracked_wallets_csv
  }
  policy_statements = [
    {
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents"
      ]
      Resource = ["*"]
    }
  ]
}

resource "aws_lambda_permission" "sns_invoke_notifier" {
  statement_id  = "AllowSnsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = module.lambda_notifier.lambda_function_name
  principal     = "sns.amazonaws.com"
  source_arn    = module.sns_alerts.topic_arn
}

resource "aws_sns_topic_subscription" "notifier" {
  topic_arn = module.sns_alerts.topic_arn
  protocol  = "lambda"
  endpoint  = module.lambda_notifier.lambda_function_arn
  depends_on = [aws_lambda_permission.sns_invoke_notifier]
}

# Placeholder to document TTL enablement from the console or separate resource.
resource "aws_dynamodb_table_item" "ttl_placeholder" {
  for_each   = {}
  table_name = "none"
  hash_key   = "none"
  item       = jsonencode({})
}
