output "transactions_table_name" {
  value = module.dynamodb.transactions_table_name
}

output "wallet_buckets_table_name" {
  value = module.dynamodb.wallet_buckets_table_name
}

output "sns_topic_arn" {
  value = module.sns_alerts.topic_arn
}

output "http_api_endpoint" {
  value = module.api_gateway_ingest.invoke_url
}

output "ingest_lambda_role_arn" {
  value = module.lambda_ingest.role_arn
}

output "notifier_lambda_role_arn" {
  value = module.lambda_notifier.role_arn
}

output "webhook_manager_lambda_role_arn" {
  value = module.lambda_webhook_manager.role_arn
}

output "ingest_lambda_name" {
  value = module.lambda_ingest.lambda_function_name
}

output "notifier_lambda_name" {
  value = module.lambda_notifier.lambda_function_name
}

output "webhook_manager_lambda_name" {
  value = module.lambda_webhook_manager.lambda_function_name
}
