variable "api_name" {
  description = "HTTP API name"
  type        = string
}

variable "integration_uri" {
  description = "Integration URI (usually Lambda invoke ARN)"
  type        = string
}

variable "lambda_function_name" {
  description = "Lambda function name receiving API Gateway invokes"
  type        = string
}

variable "route_key" {
  description = "Route key such as 'POST /webhook'"
  type        = string
}

variable "stage_name" {
  description = "Stage name"
  type        = string
  default     = "$default"
}

variable "payload_format_version" {
  description = "Payload format version"
  type        = string
  default     = "2.0"
}
