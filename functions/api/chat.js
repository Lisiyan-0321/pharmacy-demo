export async function onRequestPost(context) {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  const zaiApiUrl = 'https://api.z.ai/api/paas/v4/chat/completions';
  const modifiedRequest = new Request(zaiApiUrl, context.request);
  modifiedRequest.headers.set('Authorization', 'Bearer e44fecc53b62477dbfc90af9ffc42e05.7dS8abhR9Do7GoKk');

  const response = await fetch(modifiedRequest);
  const newResponse = new Response(response.body, response);
  Object.entries(corsHeaders).forEach(([k, v]) => newResponse.headers.set(k, v));
  return newResponse;
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}