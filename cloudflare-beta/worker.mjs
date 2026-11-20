// Server foundation for the existing static application. Private credentials
// belong in Worker runtime secrets, never in assets or source configuration.
const VERSION = 'runtime-foundation-v1';

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...headers,
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/api/health') {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
      }
      const body = {
        service: 'Serenity Dispatch',
        version: VERSION,
        runtime: 'worker',
        googleRoutesKeyConfigured: Boolean(env.GOOGLE_MAPS_API_KEY),
        routingConnected: false,
      };
      const response = json(body);
      return request.method === 'HEAD'
        ? new Response(null, { status: response.status, headers: response.headers })
        : response;
    }
    if (pathname === '/api/routes') {
      // Fail closed until authenticated, usage-limited routing is integrated.
      // Adding a secret alone must never enable a public, billable API proxy.
      return json({ error: 'ROUTING_NOT_CONNECTED', routingConnected: false }, 503);
    }
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return json({ error: 'NOT_FOUND' }, 404);
    }
    return env.ASSETS.fetch(request);
  },
};
