variable "aws_region" {
  description = "AWS region to deploy to"
  type        = string
  default     = "us-east-1"
}

variable "transactions_table_name" {
  description = "DynamoDB Transactions table name"
  type        = string
  default     = "serverless-eth-transactions"
}

variable "wallet_buckets_table_name" {
  description = "DynamoDB Wallet Buckets table name"
  type        = string
  default     = "serverless-eth-wallet-buckets"
}

variable "sns_topic_name" {
  description = "SNS topic for alerts"
  type        = string
  default     = "serverless-eth-alerts"
}

variable "lambda_s3_bucket" {
  description = "S3 bucket containing Lambda deployment artifacts (optional)"
  type        = string
  default     = ""
}

variable "lambda_s3_key" {
  description = "S3 key for Lambda deployment artifact (optional)"
  type        = string
  default     = ""
}

