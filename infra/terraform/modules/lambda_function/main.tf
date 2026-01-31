locals {
  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = "sts:AssumeRole",
        Effect = "Allow",
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role" "this" {
  name               = var.role_name
  assume_role_policy = local.assume_role_policy
}

resource "aws_iam_role_policy" "this" {
  name = "${var.role_name}-policy"
  role = aws_iam_role.this.id
  policy = jsonencode({
    Version = "2012-10-17",
    Statement = var.policy_statements
  })
}

resource "aws_lambda_function" "this" {
  function_name    = var.function_name
  handler          = var.handler
  runtime          = var.runtime
  role             = aws_iam_role.this.arn
  memory_size      = var.memory_size
  timeout          = var.timeout
  filename         = var.filename
  source_code_hash = var.source_code_hash

  environment {
    variables = var.environment_variables
  }
}
