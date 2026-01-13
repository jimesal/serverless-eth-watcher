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
  ````

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
  G --> H[Notifier Lambda - SNS subscribers: Slack, Email, Webhook]
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

  Showcase goals (what this repo demonstrates)
  - Minimal‑cost serverless implementation suitable for a portfolio: the default design favors low ongoing cost while remaining production‑relevant.
  - Clear separation of concerns: persistent ingestion (container) vs serverless processing (Lambda + DynamoDB + SNS).
  - Infrastructure as Code with Terraform and a deployable example so reviewers can reproduce your work.
  - Emphasis on explainability: README documents design decisions, tradeoffs, and options for scaling/optimizing.

  Cost‑conscious defaults (how this keeps costs low)
  - Prefer webhook -> Lambda if Alchemy webhooks are available (fully serverless, avoids Fargate). This is the cheapest fully-managed option.
  - Use SQS (cheaper) rather than Kinesis for simple buffering when ordering is not critical.
  - Use DynamoDB On‑Demand for unpredictable/low traffic and enable TTL to purge old records.
  - Keep Lambda memory small (128–256 MB) for simple handlers and minimize logging retention.
  - Start resources only for demos; tear down stacks afterward with `terraform destroy` or `aws` commands.

  Advanced / Production optimizations (functionality-first — higher cost)
  If you later want to prioritize functionality, latency, durability, or scale over minimal cost, consider these upgrades:

  - ElastiCache (Redis) for sliding‑window aggregation: use sorted sets (ZADD/ZRANGEBYSCORE) to maintain exact time windows with very low latency. This is ideal for sub‑second detection but requires managing a cache cluster (higher cost and operational overhead).

  - DynamoDB Streams + Lambda (async aggregation): write raw transactions to DynamoDB and let Streams trigger aggregation Lambdas. This decouples ingestion and aggregation for higher throughput and operational resilience.

  - Kinesis Data Streams (with enhanced fan‑out) for high throughput / ordering: if you expect a high event rate or need ordering guarantees across many consumers, Kinesis is a better fit than SQS but more expensive.

  - SQS FIFO for ordered delivery with deduplication: if ordering per wallet matters and throughput is moderate, SQS FIFO provides ordering guarantees and dedupe.

  - Provisioned Concurrency for Lambda: reduces cold‑start latency for latency‑sensitive alerting paths (costly if kept hot).

  - Aurora Serverless or RDS for complex analytical queries: if you need relational queries, joins, or complex reporting, a serverless relational DB may be preferable to DynamoDB for those workloads (higher cost and schema management).

  - EKS or ECS EC2 for large-scale ingestion fleets: if you need massive scaling or advanced orchestration, Kubernetes (EKS) provides richer scheduling and control but increases operational complexity.

  - Cross‑region DynamoDB Global Tables for geo‑redundancy and low-latency reads across regions (adds replication cost).

  - AWS Lambda@Edge / CloudFront for global low-latency webhook ingestion and geolocation-based routing (advanced, adds complexity & cost).

  For each of these, the tradeoff is clear: improved functionality, lower latency, stronger guarantees — at the price of higher monetary cost and/or more operational work.

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
