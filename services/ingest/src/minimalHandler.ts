import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";

export const handler = async (
  event: APIGatewayProxyEventV2
): Promise<APIGatewayProxyResultV2> => {
  // Try to parse JSON body if present, otherwise keep raw
  let parsed: unknown = event.body ?? null;
  if (typeof event.body === "string") {
    try {
      parsed = JSON.parse(event.body);
    } catch (e) {
      // keep as raw string if not valid JSON
      parsed = event.body;
    }
  }

  // Minimal logging for local inspection / ngrok delivery
  // Stringify the payload so nested arrays (e.g. activity) are fully visible in logs
  const payloadLog = {
    path: event.rawPath ?? event.requestContext?.http?.path,
    method: event.requestContext?.http?.method,
    body: parsed,
    headers: event.headers,
  };
  console.log("minimalHandler received:", JSON.stringify(payloadLog, null, 2));

  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: "ok",
  };
};
