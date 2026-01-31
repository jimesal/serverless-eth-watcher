variable "function_name" {
  description = "Lambda function name"
  type        = string
}

variable "handler" {
  description = "Lambda handler"
  type        = string
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "role_name" {
  description = "IAM role name for the Lambda"
  type        = string
}

variable "memory_size" {
  description = "Allocated memory in MB"
  type        = number
  default     = 128
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 10
}

variable "filename" {
  description = "Path to the zipped Lambda artifact"
  type        = string
}

variable "source_code_hash" {
  description = "Base64-encoded hash of the Lambda artifact"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables for the Lambda"
  type        = map(string)
  default     = {}
}

variable "policy_statements" {
  description = "IAM policy statements attached to the Lambda role"
  type        = list(any)
  default     = []
}
