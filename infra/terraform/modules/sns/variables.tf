variable "topic_name" {
  description = "SNS topic name"
  type        = string
}

variable "tags" {
  description = "Tags applied to the topic"
  type        = map(string)
  default     = {}
}
