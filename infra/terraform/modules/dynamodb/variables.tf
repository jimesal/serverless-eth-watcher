variable "transactions_table_name" {
  description = "DynamoDB Transactions table name"
  type        = string
}

variable "wallet_buckets_table_name" {
  description = "DynamoDB Wallet Buckets table name"
  type        = string
}

variable "common_tags" {
  description = "Tags applied to both tables"
  type        = map(string)
  default     = {}
}
