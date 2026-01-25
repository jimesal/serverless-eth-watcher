# Serverless ETH Watcher

A minimal, cost-efficient serverless Ethereum transaction watcher.
It detects high-volume activity for configured wallets and sends alerts when thresholds are exceeded.

This project showcases a portfolio-ready AWS architecture with clear tradeoffs and upgrade paths.

**Goals**
- Track a wallet’s ETH flow in both directions—what it sends **and** what it receives—without caring who the counterparty is
- Replace a local WebSocket watcher with a serverless ingestion pipeline
- Minimize cost using managed, on-demand AWS services
- Keep the architecture simple, explainable, and production-relevant
- Provide Infrastructure as Code and demo-ready assets

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
  
**Why this architecture**
This is the cheapest fully managed design:
- Alchemy Webhooks replace long-lived WebSocket connections
- API Gateway (HTTP API) is cheaper and lower-latency than REST API
- Lambda handles ingestion, aggregation, and alerting
- DynamoDB (On-Demand) stores transactions and time buckets with no capacity planning
- SNS decouples alert generation from notification delivery
- CloudWatch provides built-in logs and metrics

This setup has:
- No always-on compute
- No servers to manage
- Costs that scale only with usage

It is ideal for low to moderate traffic, demos, and early production workloads.

**How it works (end-to-end)**

1. Alchemy sends transaction events via webhook
2. API Gateway receives and forwards the request
3. Ingest Lambda parses and stores transactions
4. DynamoDB time buckets track activity per wallet
5. Threshold breaches publish events to SNS
6. Notifier Lambda sends alerts to configured channels

**Data handling assumptions**
- Only ETH transfers are persisted. Non-ETH assets (USDC, ERC20s, NFTs, etc.) are explicitly ignored so that DynamoDB stores exclusively ETH activity.
- Payload normalization (addresses, values, decimals, hashes) is assumed to be handled by the Alchemy webhook service. Additional normalization or schema validation is out of scope for this project to keep the ingestion path lean.
- The tracked wallet is the only entity of interest. We do not attempt to annotate or classify counterparties; volume is aggregated per wallet/direction pair so we can answer “how much ETH did this address move (in or out) over the rolling window?”

**Alchemy webhook contract**
- The payload shape follows Alchemy's Address Activity webhook spec; see their docs for the latest schema: https://www.alchemy.com/docs/reference/address-activity-webhook. The generated TypeScript interfaces live in [services/ingest/types/alchemyWebhookTypes.ts](services/ingest/types/alchemyWebhookTypes.ts) and are consumed by the ingest Lambda.
- The main handler validates incoming events with lightweight runtime guards (see [services/ingest/src/handler.ts](services/ingest/src/handler.ts)) before touching DynamoDB/SNS. This keeps ingestion resilient against non-Alchemy callers or malformed replay payloads without adding another hop in front of API Gateway.
- Each tracked wallet can appear as the origin (`from`) or destination (`to`) of a transaction. The handler therefore records and aggregates both directions per hash so ETH volume limits remain accurate regardless of who initiates the transfer.

**Alternative architecture (more expensive, more robust)**

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

When this makes sense
- This version trades higher cost for better control and scalability:
- Fargate maintains a persistent WebSocket connection
- SQS or Kinesis buffers events and absorbs spikes

Better suited for:
- High event rates
- Strict ordering or durability requirements
- Long-running WebSocket ingestion

This is not the default because:
- Fargate runs continuously
- Kinesis adds cost and operational complexity

**Design philosophy**
- Start cheap and simple
- Prefer serverless and managed services
- Add complexity only when requirements justify it
- This mirrors real-world cloud decision making.

**Repository layout**
  - `README.md` - project overview and instructions
  - `services/` - serverless services (each with its own `package.json`, `src/`, `test/`, and `dist/`)
    - `services/ingest/` - ingestion Lambda (source, tests, mock payloads, build output)
    - `services/notifier/` - notifier Lambda (notification delivery logic)
  - `infra/terraform/` - Terraform configuration for API Gateway, DynamoDB, SNS, Lambdas
  - `test/` - shared integration tests and `mock_payloads/` for end-to-end testing
  - `.github/workflows/` - CI (build, test, terraform plan)
  - `scripts/` - helper scripts (build, package, deploy)
  - `env.example` - documented environment variable names and example values

**Who this project is for**

This project is designed as a learning-focused, portfolio-ready example for:
- Junior developers exploring AWS serverless architectures
- Developers transitioning from local scripts to cloud-native designs
- Develop architectural thinking without over-engineering

**Scope and non-goals**

This project intentionally does NOT aim to:
- Provide real-time, sub-second blockchain monitoring
- Handle very high throughput or enterprise-scale workloads
- Implement complex analytics or historical querying

> **Note:** The ingest Lambda evaluates each tracked wallet for both outgoing and incoming ETH, regardless of counterparty, so alerting is symmetric by design.

Those concerns are discussed in the alternative architecture section but are out of scope for the default implementation.

**Relationship to the original project**
Inspired by (but not dependent on) the original `eth-watcher` repo: https://github.com/yermakovsa/eth-watcher . We borrowed a few ideas—basic parsing, aggregation concepts, some config naming—but rebuilt the solution for a different problem: tracking a single wallet’s ETH flow in both directions on a fully serverless stack. This codebase is intentionally standalone, uses typed Alchemy webhooks instead of WebSockets, and makes different architectural trade-offs (API Gateway + Lambda + DynamoDB + SNS versus a persistent worker).
  ````
