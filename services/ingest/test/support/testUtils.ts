import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
  APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import { ASSETS } from '../../types/alchemyWebhookTypes';

export const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const cloneEvent = <T extends APIGatewayProxyEventV2>(event: T): T => deepClone(event);

export const getActivitiesFromEvent = (event: APIGatewayProxyEventV2): any[] => {
  if (!event.body) return [];
  try {
    const parsed = JSON.parse(event.body);
    return Array.isArray(parsed?.event?.activity) ? parsed.event.activity : [];
  } catch {
    return [];
  }
};

export const getEthActivities = (event: APIGatewayProxyEventV2): any[] =>
  getActivitiesFromEvent(event).filter((act) => act.asset === ASSETS.ETH);

export const getUniqueEthHashCount = (event: APIGatewayProxyEventV2): number =>
  new Set(getEthActivities(event).map((act) => act.hash)).size;

export type StructuredApiResponse = APIGatewayProxyStructuredResultV2 & {
  statusCode: number;
  body?: string | null;
};

export function assertStructuredResponse(res: unknown): asserts res is StructuredApiResponse {
  if (!res || typeof res !== 'object') {
    throw new Error(`expected structured response, received ${String(res)}`);
  }

  const candidate = res as Partial<StructuredApiResponse>;
  if (typeof candidate.statusCode !== 'number') {
    throw new Error('response missing statusCode');
  }

  if (
    candidate.body !== undefined &&
    candidate.body !== null &&
    typeof candidate.body !== 'string'
  ) {
    throw new Error('response body must be a string when present');
  }
}

export function ensureStructuredResponse(
  res: APIGatewayProxyResultV2 | APIGatewayProxyStructuredResultV2 | unknown,
): StructuredApiResponse {
  if (typeof res === 'string') {
    throw new Error('expected structured APIGateway response, received string');
  }
  assertStructuredResponse(res);
  return res as StructuredApiResponse;
}

export function expectOk(res: unknown, expectedBody: string) {
  const structured = ensureStructuredResponse(res);
  expect(structured.statusCode).toBe(200);
  expect(structured.body).toBe(expectedBody);
}

export function expectBadRequest(res: unknown, expectedBody: string | RegExp) {
  const structured = ensureStructuredResponse(res);
  expect(structured.statusCode).toBe(400);
  if (expectedBody instanceof RegExp) {
    expect(structured.body).toMatch(expectedBody);
  } else {
    expect(structured.body).toBe(expectedBody);
  }
}

export const expectResponse = expectOk;
export const expectError = expectBadRequest;
