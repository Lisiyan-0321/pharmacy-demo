const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const BUSY_ERROR =
  "The free-tier AI model is currently busy. Please wait a few seconds and try again.";

function copyCorsHeaders(sourceHeaders) {
  const headers = new Headers(sourceHeaders);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }
  return headers;
}

function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
  });
}

export async function onRequestPost(context) {
  const apiKey = String(context.env.ZAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return jsonResponse(
      { error: "Server configuration error: ZAI_API_KEY is not set." },
      500,
    );
  }

  let payload;
  try {
    payload = await context.request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return jsonResponse(
      { error: "Request body must contain a non-empty messages array." },
      400,
    );
  }

  const requestBody = JSON.stringify({
    model: String(context.env.ZAI_MODEL ?? "glm-5.3-flash").trim(),
    messages: payload.messages,
    stream: true,
    max_tokens: 500,
  });

  let upstream;
  try {
    upstream = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (compatible; PharmacyFAQBot/1.0)",
      },
      body: requestBody,
    });
  } catch {
    return jsonResponse({ error: BUSY_ERROR }, 503);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: copyCorsHeaders(upstream.headers),
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
