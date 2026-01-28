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

variable "tracked_wallets" {
  description = "List of wallet addresses monitored by ingest + provisioning helpers"
  type        = list(string)
  default     = []
}

variable "threshold_eth" {
  description = "Rolling window threshold (in ETH) that triggers alerts"
  type        = number
  default     = 10
}

variable "window_seconds" {
  description = "Rolling window duration used by the ingest Lambda"
  type        = number
  default     = 900
}

variable "cooldown_seconds" {
  description = "Cooldown period applied after an alert fires"
  type        = number
  default     = 300
}

variable "bucket_size_seconds" {
  description = "Ingest Lambda bucket granularity"
  type        = number
  default     = 60
}

variable "slack_webhook_url" {
  description = "Incoming Slack webhook URL for the notifier Lambda"
  type        = string
  sensitive   = true
}

variable "app_name" {
  description = "Label used inside Slack notifications"
  type        = string
  default     = "serverless-eth-watcher"
}

variable "alchemy_admin_api_key" {
  description = "Alchemy dashboard admin API key used by the webhook manager"
  type        = string
  sensitive   = true
}

variable "alchemy_app_id" {
  description = "Alchemy App ID that receives Address Activity events"
  type        = string
}

variable "alchemy_delivery_url_override" {
  description = "Optional HTTPS endpoint override for Address Activity delivery"
  type        = string
  default     = ""
}

variable "alchemy_api_base_url" {
  description = "Override for the Alchemy Admin API base URL"
  type        = string
  default     = "https://dashboard.alchemyapi.io/api"
}

