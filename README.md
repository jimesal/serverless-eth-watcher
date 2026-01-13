# Serverless ETH Watcher

A minimal, serverless rework of the `eth-watcher` project: an Ethereum transaction watcher that detects high-volume activity for configured wallets and sends alerts.

This repository contains the code, infrastructure templates, and demo assets to deploy a fully serverless pipeline on AWS using API Gateway → Lambda → DynamoDB → SNS → Lambda (notifier).

**Goals**
- Convert the local WebSocket watcher to a serverless pipeline (using Alchemy webhooks).
- Keep costs minimal (serverless, on-demand DynamoDB, HTTP API).
- Provide clear infra (SAM/Terraform), CI/CD, and demo assets for a portfolio.

**Architecture (high level)**

```mermaid
flowchart LR
  A[Alchemy Webhooks] -->|POST| B["API Gateway (HTTP API)"]
  B --> C[Ingest Lambda]

  C --> D[DynamoDB - Transactions]
  C --> E[DynamoDB - WalletBuckets]
  C -->|on threshold| F[SNS Topic]

  F --> G[Notifier Lambda]
  G --> H[Notification Channels]
  H --> H1[Telegram]
  H --> H2[Slack]
  H --> H3[Email / Webhook]

  subgraph Observability
    I[CloudWatch Logs & Metrics]
  end

  C --> I
  ````markdown
  # Serverless ETH Watcher

  A minimal, cloud-friendly rework of the `eth-watcher` project: an Ethereum transaction watcher that detects high-volume activity for configured wallets and sends alerts.

  This repository contains example code, infrastructure templates, and demo assets to deploy a hybrid serverless pipeline on AWS using a persistent Alchemy WebSocket client for ingestion plus serverless processing and storage. Terraform is used for infrastructure provisioning in this repo.

  **Goals**
  - Run a reliable ingest pipeline for Alchemy WebSocket events.
  - Keep downstream processing serverless and low-cost (Lambda + DynamoDB + SNS).
  - Provide clear infra (SAM/Terraform), CI/CD, and demo assets for a portfolio.

  **Architecture (high level)**

  ```mermaid
  flowchart LR
    subgraph Ingest
      A[Alchemy WebSocket] -->|ws| B[Fargate Ingestor]
      B -->|PutEvents| K[Kinesis / SQS]
    end
    K --> C[Ingest Lambda / Consumers]
    C --> D[DynamoDB - Transactions]
    C --> E[DynamoDB - WalletBuckets]
    C -->|on threshold| F[SNS Topic]
    F --> G[Notifier Lambda]
    G --> H[Notifier Lambda -> SNS subscribers (Slack / Email / Webhook)]
    subgraph Observability
      I[CloudWatch Logs & Metrics]
    end
    B & C & G --> I
  ```

  Why this approach
  - Use a hybrid design: keep a long‑lived WebSocket client in a small container (ECS/Fargate) while making downstream processing serverless.
  - The Fargate ingestor maintains the persistent Alchemy WebSocket connection and pushes events to a durable stream (Kinesis) or buffer (SQS) for reliable delivery.
  - Ingest Lambda(s) asynchronously consume events, write transaction and time‑bucket records to DynamoDB, and publish alerts to SNS when thresholds are exceeded.
  - DynamoDB time‑buckets allow cheap sliding‑window aggregation (you query a small number of bucket items instead of scanning many transactions).
  - This design balances operational simplicity, availability for long‑lived connections, and low cost for processing and storage.
  - If you prefer a fully serverless setup and Alchemy webhooks are available for your account, you can replace the Fargate ingestor with API Gateway -> Lambda.

  Repository layout
  - `cmd/` - application entry points (original watcher code)
  - `internal/` - packages: `aggregator`, `notifier`, `watcher`, `config`
  - `infra/` - SAM or Terraform templates (to be added)
  - `examples/` - sample payloads and demo scripts
  - `.github/workflows/` - CI/CD workflows

  Quick start (local development)
  1. Install prerequisites: Go, Terraform (for deploy), Docker (for running the Fargate task locally if needed).
  2. Local modes:

  - If using the Fargate ingestor (recommended for WebSocket): run the ingestor container locally (or in a small ECS task) and run consumer functions locally by invoking your Go handlers directly (`go run`) or with lightweight test harnesses.
  - If you need to emulate Lambda locally for quick handler tests, use tools like the AWS Lambda Runtime Interface Emulator (RIE) or run the handler as a normal Go program with test payloads.

  Example: run a local handler directly (for quick parsing/aggregation tests):

  ```bash
  # from project root
  go run ./cmd/handler main
  # or run unit tests
  go test ./... -v
  ```

  Deploy (high level)
  - Terraform: `terraform init` and `terraform apply` in `infra/terraform` (recommended for this repo). Configure required variables or use a `terraform.tfvars` file with environment-specific values.

  Example:

  ```bash
  cd infra/terraform
  terraform init
  terraform apply -auto-approve
  ```

  Security & secrets
  - Store any API keys or secrets in `AWS Secrets Manager` (do not commit them).
  - Protect the ingest endpoint or ingestor, and validate Alchemy signatures where supported. Use IAM roles with least privilege for Lambdas and the Fargate task.

  Cost control tips
  - Use serverless downstream (Lambda + on‑demand DynamoDB) to keep costs low for light usage.
  - Right‑size the Fargate ingest task (small vCPU/memory) since it only maintains a WebSocket and forwards events.
  - Use Kinesis/SQS to decouple spikes from processing and reduce throttling.

  Next steps (for this repo)
  - Add `infra/terraform` module and IAM roles (I can generate a starter Terraform configuration).
  - Implement Go handler(s) reusing `ParseValue` and publish alerts to SNS.
  - Add GitHub Actions for CI/CD and consider OIDC for AWS creds.

  License
  - This repository includes the original MIT license from the referenced project.

  Contact
  - If you want, I can generate the SAM template and Go Lambda skeleton next. Which would you prefer?

  **Based on**

  This project is a rework and adaptation of the original repository: https://github.com/yermakovsa/eth-watcher.  
  Credit to the original author; please refer to the original project's license and notices when reusing code.

  ````
