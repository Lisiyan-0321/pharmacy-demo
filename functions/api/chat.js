const ZAI_API_URL = "https://api.z.ai/api/paas/v4/chat/completions";
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};
const REQUEST_TIMEOUT_MS = 20_000;
const RETRY_DELAY_MS = 1_000;
const MAX_ATTEMPTS = 3;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

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
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let upstream;

    try {
      upstream = await fetch(ZAI_API_URL, {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: requestBody,
        signal: controller.signal,
      });
    } catch {
      if (attempt < MAX_ATTEMPTS) {
        await delay(RETRY_DELAY_MS);
        continue;
      }

      if (controller.signal.aborted) {
        return jsonResponse({ error: "The Z.AI API request timed out." }, 504);
      }
      return jsonResponse({ error: "Unable to reach the Z.AI API." }, 502);
    } finally {
      clearTimeout(timeoutId);
    }

    if (upstream.ok) {
      return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: copyCorsHeaders(upstream.headers),
      });
    }

    const errorBody = await upstream.text();
    let errorCode;
    try {
      const parsedError = JSON.parse(errorBody);
      errorCode = parsedError?.error?.code ?? parsedError?.code;
    } catch {
      errorCode = undefined;
    }

    const shouldRetry =
      upstream.status === 429 || String(errorCode ?? "") === "1305";

    if (!shouldRetry) {
      return new Response(errorBody, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: copyCorsHeaders(upstream.headers),
      });
    }

    if (attempt < MAX_ATTEMPTS) {
      await delay(RETRY_DELAY_MS);
      continue;
    }

    return new Response(errorBody, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: copyCorsHeaders(upstream.headers),
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}
