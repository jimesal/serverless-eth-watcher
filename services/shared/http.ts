import type {
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';

export type HeaderMap = Record<string, string>;

const TEXT_HEADERS = { 'content-type': 'text/plain' } as const;
const JSON_HEADERS = { 'content-type': 'application/json' } as const;

export function textResponse(
  statusCode: number,
  body: string,
  headers?: HeaderMap,
): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: mergeHeaders(TEXT_HEADERS, headers),
    body,
  };
}

export function jsonResponse<T>(
  statusCode: number,
  payload: T,
  headers?: HeaderMap,
): APIGatewayProxyStructuredResultV2 {
  return {
    statusCode,
    headers: mergeHeaders(JSON_HEADERS, headers),
    body: JSON.stringify(payload),
  };
}

function mergeHeaders<T extends HeaderMap>(base: T, overrides?: HeaderMap): HeaderMap {
  return overrides ? { ...base, ...overrides } : { ...base };
}
