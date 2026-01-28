terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = ">= 2.4.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

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

resource "aws_dynamodb_table" "transactions" {
  name         = var.transactions_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = {
    Service = "serverless-eth-watcher"
    Role    = "transactions"
  }
}

resource "aws_dynamodb_table" "wallet_buckets" {
  name         = var.wallet_buckets_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"
  range_key    = "sk"

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "N"
  }

  tags = {
    Service = "serverless-eth-watcher"
    Role    = "wallet_buckets"
  }
}

resource "aws_sns_topic" "alerts" {
  name = var.sns_topic_name
  tags = {
    Service = "serverless-eth-watcher"
  }
}

resource "aws_iam_role" "ingest_lambda" {
  name = "serverless-eth-watcher-ingest"
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "ingest_lambda" {
  name = "serverless-eth-watcher-ingest-policy"
  role = aws_iam_role.ingest_lambda.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:GetItem",
          "dynamodb:Query"
        ],
        Resource = [
          aws_dynamodb_table.transactions.arn,
          aws_dynamodb_table.wallet_buckets.arn
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "sns:Publish"
        ],
        Resource = [
          aws_sns_topic.alerts.arn
        ]
      },
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "notifier_lambda" {
  name = "serverless-eth-watcher-notifier"
  assume_role_policy = aws_iam_role.ingest_lambda.assume_role_policy
}

resource "aws_iam_role_policy" "notifier_lambda" {
  name = "serverless-eth-watcher-notifier-policy"
  role = aws_iam_role.notifier_lambda.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role" "webhook_manager_lambda" {
  name = "serverless-eth-watcher-webhook-manager"
  assume_role_policy = aws_iam_role.ingest_lambda.assume_role_policy
}

resource "aws_iam_role_policy" "webhook_manager_lambda" {
  name = "serverless-eth-watcher-webhook-manager-policy"
  role = aws_iam_role.webhook_manager_lambda.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Effect = "Allow",
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "ingest" {
  function_name    = "serverless-eth-watcher-ingest"
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.ingest_lambda.arn
  memory_size      = 256
  timeout          = 20
  filename         = data.archive_file.ingest.output_path
  source_code_hash = data.archive_file.ingest.output_base64sha256

  environment {
    variables = {
      TRANSACTIONS_TABLE = aws_dynamodb_table.transactions.name
      WALLET_BUCKETS_TABLE = aws_dynamodb_table.wallet_buckets.name
      SNS_TOPIC_ARN        = aws_sns_topic.alerts.arn
      THRESHOLD_ETH        = tostring(var.threshold_eth)
      WINDOW_SECONDS       = tostring(var.window_seconds)
      COOLDOWN_SECONDS     = tostring(var.cooldown_seconds)
      BUCKET_SIZE_SECONDS  = tostring(var.bucket_size_seconds)
      TRACKED_WALLETS      = local.tracked_wallets_csv
    }
  }
}

resource "aws_lambda_function" "notifier" {
  function_name    = "serverless-eth-watcher-notifier"
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.notifier_lambda.arn
  memory_size      = 128
  timeout          = 15
  filename         = data.archive_file.notifier.output_path
  source_code_hash = data.archive_file.notifier.output_base64sha256

  environment {
    variables = {
      SLACK_WEBHOOK_URL = var.slack_webhook_url
      APP_NAME          = var.app_name
    }
  }
}

resource "aws_lambda_function" "webhook_manager" {
  function_name    = "serverless-eth-watcher-webhook-manager"
  handler          = "handler.handler"
  runtime          = "nodejs20.x"
  role             = aws_iam_role.webhook_manager_lambda.arn
  memory_size      = 128
  timeout          = 60
  filename         = data.archive_file.webhook_manager.output_path
  source_code_hash = data.archive_file.webhook_manager.output_base64sha256

  environment {
    variables = {
      ALCHEMY_ADMIN_API_KEY = var.alchemy_admin_api_key
      ALCHEMY_APP_ID        = var.alchemy_app_id
      ALCHEMY_DELIVERY_URL  = var.alchemy_delivery_url_override != "" ? var.alchemy_delivery_url_override : aws_apigatewayv2_stage.ingest.invoke_url
      ALCHEMY_API_BASE_URL  = var.alchemy_api_base_url
      TRACKED_WALLETS       = local.tracked_wallets_csv
    }
  }
}

resource "aws_apigatewayv2_api" "ingest" {
  name          = "serverless-eth-watcher-ingest"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "ingest" {
  api_id                 = aws_apigatewayv2_api.ingest.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.ingest.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "ingest" {
  api_id = aws_apigatewayv2_api.ingest.id
  route_key = "POST /webhook"
  target   = "integrations/${aws_apigatewayv2_integration.ingest.id}"
}

resource "aws_apigatewayv2_stage" "ingest" {
  api_id      = aws_apigatewayv2_api.ingest.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw_invoke_ingest" {
  statement_id  = "AllowInvokeByHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.ingest.execution_arn}/*/*"
}

resource "aws_sns_topic_subscription" "notifier" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "lambda"
  endpoint  = aws_lambda_function.notifier.arn
  depends_on = [aws_lambda_permission.sns_invoke_notifier]
}

resource "aws_lambda_permission" "sns_invoke_notifier" {
  statement_id  = "AllowSnsInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notifier.function_name
  principal     = "sns.amazonaws.com"
  source_arn    = aws_sns_topic.alerts.arn
}

# Placeholder to document TTL enablement from the console or separate resource.
resource "aws_dynamodb_table_item" "ttl_placeholder" {
  for_each   = {}
  table_name = "none"
  hash_key   = "none"
  item       = jsonencode({})
}
