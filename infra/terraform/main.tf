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

# Enable TTL on wallet_buckets table using attribute `expiresAt`
resource "aws_dynamodb_table_item" "ttl_placeholder" {
  # This is a noop placeholder resource so the repo documents TTL setup.
  # TTL must be enabled via aws_dynamodb_table_time_to_live resource where supported.
  for_each = {}
  table_name = "none"
  hash_key = "none"
  item = jsonencode({})
}

resource "aws_sns_topic" "alerts" {
  name = var.sns_topic_name
  tags = {
    Service = "serverless-eth-watcher"
  }
}

/* IAM role & policy for Lambdas (minimal) */
resource "aws_iam_role" "lambda_exec" {
  name = "serverless-eth-watcher-lambda-exec"
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

resource "aws_iam_role_policy" "lambda_policy" {
  name = "serverless-eth-watcher-lambda-policy"
  role = aws_iam_role.lambda_exec.id
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

/* Lambda and API Gateway resources are intentionally left as placeholders.
   Typical deployment options:
   - Build a CJS bundle and upload to S3, then reference via `filename`/`s3_key` in aws_lambda_function
   - Use a deployment pipeline (CI) to publish artifacts and update function code

   Example (comment):
   resource "aws_lambda_function" "ingest" { ... }
   resource "aws_apigatewayv2_api" "http_api" { ... }
 */
