output "transactions_table_name" {
  value = aws_dynamodb_table.transactions.name
}

output "transactions_table_arn" {
  value = aws_dynamodb_table.transactions.arn
}

output "wallet_buckets_table_name" {
  value = aws_dynamodb_table.wallet_buckets.name
}

output "wallet_buckets_table_arn" {
  value = aws_dynamodb_table.wallet_buckets.arn
}
