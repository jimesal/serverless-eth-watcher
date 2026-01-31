#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TERRAFORM_DIR="$ROOT_DIR/infra/terraform"
TFVARS_PATH="${1:-$TERRAFORM_DIR/terraform.tfvars}"

if [[ ! -f "$TFVARS_PATH" ]]; then
  echo "terraform.tfvars not found at: $TFVARS_PATH"
  echo "Create it from terraform.tfvars.example first."
  exit 1
fi

build_service() {
  local service="$1"
  echo "==> Building $service"
  (cd "$ROOT_DIR/services/$service" && npm install && npm run build)
}

build_service "ingest"
build_service "notifier"
build_service "webhook-manager"

echo "==> Deploying Terraform"
cd "$TERRAFORM_DIR"
terraform init
terraform plan -var-file="$TFVARS_PATH"
terraform apply -var-file="$TFVARS_PATH"
