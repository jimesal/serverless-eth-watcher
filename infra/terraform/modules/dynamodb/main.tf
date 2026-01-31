locals {
  transaction_tags = merge({
    Service = "serverless-eth-watcher"
    Role    = "transactions"
  }, var.common_tags)

  wallet_bucket_tags = merge({
    Service = "serverless-eth-watcher"
    Role    = "wallet_buckets"
  }, var.common_tags)
}

resource "aws_dynamodb_table" "transactions" {
  name         = var.transactions_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute {
    name = "pk"
    type = "S"
  }

  tags = local.transaction_tags
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

  tags = local.wallet_bucket_tags
}
