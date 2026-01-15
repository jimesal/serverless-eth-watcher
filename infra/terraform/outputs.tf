output "transactions_table_name" {
  value = aws_dynamodb_table.transactions.name
}

output "wallet_buckets_table_name" {
  value = aws_dynamodb_table.wallet_buckets.name
}

output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "lambda_role_arn" {
  value = aws_iam_role.lambda_exec.arn
}
