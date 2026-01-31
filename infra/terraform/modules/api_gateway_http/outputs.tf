output "api_id" {
  value = aws_apigatewayv2_api.this.id
}

output "execution_arn" {
  value = aws_apigatewayv2_api.this.execution_arn
}

output "invoke_url" {
  value = aws_apigatewayv2_stage.this.invoke_url
}

output "delivery_url" {
  value = "${aws_apigatewayv2_stage.this.invoke_url}${trim(var.delivery_path, "/")}"
}
