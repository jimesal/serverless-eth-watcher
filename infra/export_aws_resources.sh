#!/bin/bash

# Export AWS resources - condensed format
# Extracts only relevant (non-default) configuration into concise files per resource type

set -e

OUTPUT_DIR="./aws_resource_exports"
mkdir -p "$OUTPUT_DIR"

echo "=== Exporting Relevant AWS Configuration ==="
echo "Output directory: $OUTPUT_DIR"
echo ""

if ! command -v aws &> /dev/null; then
    echo "Error: AWS CLI is not installed"
    exit 1
fi

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REGION=${AWS_REGION:-us-east-1}

echo "Account: $ACCOUNT_ID | Region: $REGION"
echo ""

# ============ LAMBDA FUNCTIONS ============
echo "Extracting Lambda configuration..."
LAMBDAS=("eth-watcher-ingest" "eth-watcher-notifier" "eth-watcher-webhook-manager")
jq -n '{functions: {}}' > "$OUTPUT_DIR/lambda-config.json"

for func_name in "${LAMBDAS[@]}"; do
  if CONFIG=$(aws lambda get-function-configuration --function-name "$func_name" --region "$REGION" 2>/dev/null); then
    echo "  ✓ $func_name"
    jq --arg name "$func_name" --argjson config "$CONFIG" \
      '.functions[$name] = {runtime: $config.Runtime, handler: $config.Handler, memory: $config.MemorySize, timeout: $config.Timeout, role_arn: $config.Role, env_variables: $config.Environment.Variables}' \
      "$OUTPUT_DIR/lambda-config.json" > "$OUTPUT_DIR/lambda-config.tmp" && \
    mv "$OUTPUT_DIR/lambda-config.tmp" "$OUTPUT_DIR/lambda-config.json"
  else
    echo "  ⚠️  $func_name not found"
  fi
done

# ============ DYNAMODB TABLES ============
echo "Extracting DynamoDB configuration..."
TABLES=("eth-watcher-transactions-table" "eth-watcher-buckets-table")
jq -n '{tables: {}}' > "$OUTPUT_DIR/dynamodb-config.json"

for table_name in "${TABLES[@]}"; do
  if TABLE=$(aws dynamodb describe-table --table-name "$table_name" --region "$REGION" 2>/dev/null); then
    echo "  ✓ $table_name"
    jq --arg name "$table_name" --argjson table "$TABLE" \
      '.tables[$name] = {billing_mode: $table.Table.BillingModeSummary.BillingMode, hash_key: ($table.Table.KeySchema[] | select(.KeyType=="HASH") | .AttributeName), range_key: ($table.Table.KeySchema[] | select(.KeyType=="RANGE") | .AttributeName), attributes: $table.Table.AttributeDefinitions, gsi: $table.Table.GlobalSecondaryIndexes, stream_spec: $table.Table.StreamSpecification}' \
      "$OUTPUT_DIR/dynamodb-config.json" > "$OUTPUT_DIR/dynamodb-config.tmp" && \
    mv "$OUTPUT_DIR/dynamodb-config.tmp" "$OUTPUT_DIR/dynamodb-config.json"
  else
    echo "  ⚠️  $table_name not found"
  fi
done

# ============ SNS TOPIC ============
echo "Extracting SNS configuration..."
TOPIC_ARN="arn:aws:sns:${REGION}:${ACCOUNT_ID}:eth-watcher-alerts"

if ATTRS=$(aws sns get-topic-attributes --topic-arn "$TOPIC_ARN" --region "$REGION" 2>/dev/null); then
  echo "  ✓ eth-watcher-alerts"
  SUBS=$(aws sns list-subscriptions-by-topic --topic-arn "$TOPIC_ARN" --region "$REGION" 2>/dev/null)
  jq -n --argjson attrs "$ATTRS" --argjson subs "$SUBS" \
    '{"eth-watcher-alerts": {arn: $attrs.Attributes.TopicArn, display_name: $attrs.Attributes.DisplayName, subscriptions: $subs.Subscriptions}}' \
    > "$OUTPUT_DIR/sns-config.json"
else
  echo "  ⚠️  SNS topic not found"
  echo '{"eth-watcher-alerts": {}}' > "$OUTPUT_DIR/sns-config.json"
fi

# ============ API GATEWAY ============
echo "Extracting API Gateway configuration..."
API_IDS=$(aws apigatewayv2 get-apis --region "$REGION" --query "Items[?Name=='AlchemyClient'].ApiId" --output text)

if [ -n "$API_IDS" ]; then
  for api_id in $API_IDS; do
    echo "  ✓ AlchemyClient ($api_id)"
    
    API=$(aws apigatewayv2 get-api --api-id "$api_id" --region "$REGION")
    STAGES=$(aws apigatewayv2 get-stages --api-id "$api_id" --region "$REGION")
    ROUTES=$(aws apigatewayv2 get-routes --api-id "$api_id" --region "$REGION")
    
    jq -n --arg api_id "$api_id" --argjson api "$API" --argjson stages "$STAGES" --argjson routes "$ROUTES" \
      '{"AlchemyClient": {api_id: $api_id, name: $api.Name, protocol_type: $api.ProtocolType, stages: ($stages.Items | map({name, auto_deploy})), routes: ($routes.Items | map({route_key, target}))}}' \
      > "$OUTPUT_DIR/apigw-config.json"
  done
else
  echo "  ⚠️  API Gateway not found"
  echo '{"AlchemyClient": {}}' > "$OUTPUT_DIR/apigw-config.json"
fi

# ============ IAM ROLES ============
echo "Extracting IAM role configuration..."
ROLES=("ingestionHandler-role-eqtsib5s" "notifierHandler-role-aluigv9p" "webhookHandler-role-ff7jge7h")
jq -n '{roles: {}}' > "$OUTPUT_DIR/iam-config.json"

for role_name in "${ROLES[@]}"; do
  if ROLE=$(aws iam get-role --role-name "$role_name" 2>/dev/null); then
    echo "  ✓ $role_name"
    
    # Start with the base role ARN
    jq --arg name "$role_name" --argjson role "$ROLE" \
      '.roles[$name] = {arn: $role.Role.Arn, inline_policies: {}}' \
      "$OUTPUT_DIR/iam-config.json" > "$OUTPUT_DIR/iam-config.tmp" && \
    mv "$OUTPUT_DIR/iam-config.tmp" "$OUTPUT_DIR/iam-config.json"
    
    # Get inline policies
    POLICIES=$(aws iam list-role-policies --role-name "$role_name" --query PolicyNames --output text 2>/dev/null)
    if [ -n "$POLICIES" ]; then
      for policy in $POLICIES; do
        POLICY_DOC=$(aws iam get-role-policy --role-name "$role_name" --policy-name "$policy" 2>/dev/null)
        jq --arg name "$role_name" --arg policy "$policy" --argjson doc "$POLICY_DOC" \
          '.roles[$name].inline_policies[$policy] = $doc.PolicyDocument' \
          "$OUTPUT_DIR/iam-config.json" > "$OUTPUT_DIR/iam-config.tmp" && \
        mv "$OUTPUT_DIR/iam-config.tmp" "$OUTPUT_DIR/iam-config.json"
      done
    fi
  else
    echo "  ⚠️  $role_name not found"
  fi
done

# ============ SUMMARY ============
echo ""
echo "=== Export Complete ==="
echo ""
echo "Output files:"
ls -lh "$OUTPUT_DIR"/*.json 2>/dev/null | awk '{print "  " $9 " (" $5 ")"}' || echo "  No files generated"

echo ""
echo "Generated files:"
echo "  • lambda-config.json      - Runtime, memory, timeout, env vars, handler (eth-watcher-ingest, eth-watcher-notifier, eth-watcher-webhook-manager)"
echo "  • dynamodb-config.json    - Table schemas, billing mode, keys, attributes (eth-watcher-transactions-table, eth-watcher-buckets-table)"
echo "  • sns-config.json         - Topic attributes and subscriptions (eth-watcher-alerts)"
echo "  • apigw-config.json       - API routes, integrations, stages (AlchemyClient)"
echo "  • iam-config.json         - IAM roles and inline policies"
echo ""
echo "Review these files and compare with your Terraform configuration."
