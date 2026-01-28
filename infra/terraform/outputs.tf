output "transactions_table_name" {
  value = aws_dynamodb_table.transactions.name
}

output "wallet_buckets_table_name" {
  value = aws_dynamodb_table.wallet_buckets.name
}

output "sns_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "http_api_endpoint" {
  value = aws_apigatewayv2_stage.ingest.invoke_url
}

output "ingest_lambda_role_arn" {
  value = aws_iam_role.ingest_lambda.arn
}

output "notifier_lambda_role_arn" {
  value = aws_iam_role.notifier_lambda.arn
}

output "webhook_manager_lambda_role_arn" {
  value = aws_iam_role.webhook_manager_lambda.arn
}

output "ingest_lambda_name" {
  value = aws_lambda_function.ingest.function_name
}

output "notifier_lambda_name" {
  value = aws_lambda_function.notifier.function_name
}

output "webhook_manager_lambda_name" {
  value = aws_lambda_function.webhook_manager.function_name
}
