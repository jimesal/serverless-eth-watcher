resource "aws_sns_topic" "this" {
  name = var.topic_name
  tags = merge({
    Service = "serverless-eth-watcher"
  }, var.tags)
}
