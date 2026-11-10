const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://pharmacy-demo.pages.dev",
  "https://pharmacy-demo-b3l.pages.dev",
];

function normalizeOrigin(value) {
  return value.trim().replace(/\/+$/, "");
}

function getAllowedOrigins(env) {
  const configured = String(env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map(normalizeOrigin)
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

function isOriginAllowed(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin) return true;

  const normalizedOrigin = normalizeOrigin(origin);
  let parsedOrigin;
  try {
    parsedOrigin = new URL(normalizedOrigin);
  } catch {
    return false;
  }

  if (parsedOrigin.protocol !== "https:" && parsedOrigin.protocol !== "http:") {
    return false;
  }

  const hostname = parsedOrigin.hostname;
  const isPreviewDeployment =
    hostname === "pharmacy-demo-b3l.pages.dev" ||
    hostname.endsWith(".pharmacy-demo-b3l.pages.dev");

  return (
    normalizedOrigin === new URL(request.url).origin ||
    isPreviewDeployment ||
    getAllowedOrigins(env).has(normalizedOrigin)
  );
}

function getCorsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Cache-Control": "no-store",
  };

  if (origin && isOriginAllowed(request, env)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }

  return headers;
}

function jsonResponse(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function onRequestOptions(context) {
  const headers = getCorsHeaders(context.request, context.env);

  if (!isOriginAllowed(context.request, context.env)) {
    return new Response(null, { status: 403, headers });
  }

  return new Response(null, { status: 204, headers });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = getCorsHeaders(request, env);

  if (!isOriginAllowed(request, env)) {
    return jsonResponse({ error: "Origin is not allowed." }, 403, headers);
  }

  const apiKey = String(env.ZAI_API_KEY ?? "").trim();
  if (!apiKey) {
    return jsonResponse(
      { error: "Server configuration error: ZAI_API_KEY is not set." },
      500,
      headers,
    );
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400, headers);
  }

  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return jsonResponse(
      { error: "Request body must contain a non-empty messages array." },
      400,
      headers,
    );
  }

  let upstream;
  try {
    upstream = await fetch(ZAI_API_URL, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: String(env.ZAI_MODEL ?? "glm-5.3-flash").trim(),
        messages: payload.messages,
        stream: true,
      }),
    });
  } catch (error) {
    console.error("Z.AI request failed", error);
    return jsonResponse({ error: "Unable to reach the Z.AI API." }, 502, headers);
  }

  const responseHeaders = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(headers)) {
    responseHeaders.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
