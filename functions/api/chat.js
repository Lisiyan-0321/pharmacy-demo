const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

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
        model: String(context.env.ZAI_MODEL ?? "glm-5.3-flash").trim(),
        messages: payload.messages,
        stream: true,
      }),
    });
  } catch {
    return jsonResponse({ error: "Unable to reach the Z.AI API." }, 502);
  }

  const headers = new Headers(upstream.headers);
  for (const [name, value] of Object.entries(CORS_HEADERS)) {
    headers.set(name, value);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
