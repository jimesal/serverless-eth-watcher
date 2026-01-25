import type { APIGatewayProxyEventV2 } from "aws-lambda";
import type { AddressActivityWebhook } from "../types/alchemy_webhook_types";
import { ASSETS } from "../types/alchemy_webhook_types";
import {
  mixedAssetEvent,
  mockAddressActivityEvent,
  roleShuffleEvent,
  singleTxEvent,
  stableBatchEvent,
} from "./alchemy_mock_events";

const baseEnvelope: APIGatewayProxyEventV2 = {
  version: "2.0",
  routeKey: "POST /webhook/alchemy",
  rawPath: "/webhook/alchemy",
  rawQueryString: "",
  headers: {
    "accept-encoding": "gzip,deflate",
    "content-length": "2399",
    "content-type": "application/json; charset=utf-8",
    host: "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    traceparent: "00-d627653b2dbd849d8049cb1dbbff1534-72af6eced5533b4f-01",
    "user-agent": "Apache-HttpClient/4.5.13 (Java/17.0.11)",
    "x-alchemy-signature": "e3b4cbbcb83e968a3558a71d111f1723caf90d9607fa147cd742dcec0cf4c599",
    "x-amzn-trace-id": "Root=1-696822fc-4b5070b362b840a303001c34",
    "x-api-key": "d601baa357e3f107e04c6d2a3d61d446fbe11d4ec4452e674f3ec37f6e415f54",
    "x-forwarded-for": "54.236.136.17",
    "x-forwarded-port": "443",
    "x-forwarded-proto": "https",
  },
  requestContext: {
    accountId: "547361936153",
    apiId: "nt9mhn1kvl",
    domainName: "nt9mhn1kvl.execute-api.us-east-1.amazonaws.com",
    domainPrefix: "nt9mhn1kvl",
    http: {
      method: "POST",
      path: "/webhook/alchemy",
      protocol: "HTTP/1.1",
      sourceIp: "54.236.136.17",
      userAgent: "Apache-HttpClient/4.5.13 (Java/17.0.11)",
    },
    requestId: "XMpnggBGIAMESEA=",
    routeKey: "POST /webhook/alchemy",
    stage: "$default",
    time: "14/Jan/2026:23:13:00 +0000",
    timeEpoch: 1768432380419,
  },
  body: "",
  isBase64Encoded: false,
};

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

export function cloneAddressActivityPayload(
  source: AddressActivityWebhook = mockAddressActivityEvent,
): AddressActivityWebhook {
  return deepClone(source);
}

export function buildWrappedEvent({
  body = mockAddressActivityEvent,
  overrides = {},
}: {
  body?: AddressActivityWebhook;
  overrides?: Partial<APIGatewayProxyEventV2>;
} = {}): APIGatewayProxyEventV2 {
  return {
    ...deepClone(baseEnvelope),
    ...overrides,
    body: JSON.stringify(body),
  };
}

export const singleTxActivity = buildWrappedEvent({ body: singleTxEvent });
export const stableBatchActivity = buildWrappedEvent({ body: stableBatchEvent });
export const mixedAssetsActivity = buildWrappedEvent({ body: mixedAssetEvent });
export const roleShuffleActivity = buildWrappedEvent({ body: roleShuffleEvent });

const noEthBody = cloneAddressActivityPayload();
noEthBody.event.activity = noEthBody.event.activity.map((activity) =>
  activity.asset === ASSETS.ETH
    ? { ...activity, asset: ASSETS.USDC }
    : activity,
);

export const noETHAssetActivity = buildWrappedEvent({ body: noEthBody });

const duplicatedTransactionsBody = cloneAddressActivityPayload();
duplicatedTransactionsBody.event.activity = duplicatedTransactionsBody.event.activity.flatMap(
  (activity) => [activity, deepClone(activity)],
);

export const duplicatedTransactionsActivity = buildWrappedEvent({
  body: duplicatedTransactionsBody,
});
