// services/ingest/src/minimalHandler.ts
var handler = async (event) => {
  let parsed = event.body ?? null;
  if (typeof event.body === "string") {
    try {
      parsed = JSON.parse(event.body);
    } catch (e) {
      parsed = event.body;
    }
  }
  const payloadLog = {
    path: event.rawPath ?? event.requestContext?.http?.path,
    method: event.requestContext?.http?.method,
    body: parsed,
    headers: event.headers
  };
  console.log("minimalHandler received:", JSON.stringify(payloadLog, null, 2));
  return {
    statusCode: 200,
    headers: { "content-type": "text/plain" },
    body: "ok"
  };
};
export {
  handler
};
