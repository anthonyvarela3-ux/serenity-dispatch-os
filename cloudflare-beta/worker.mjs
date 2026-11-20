const VERSION = 'google-routing-beta-v1';
const COOKIE = '__Host-serenity-routing', SESSION_SECONDS = 18 * 3600;
const encoder = new TextEncoder();
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers },
});
const hex = buffer => Array.from(new Uint8Array(buffer), b => b.toString(16).padStart(2, '0')).join('');
async function digest(value) { return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function signature(secret, value) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, encoder.encode(value)));
}
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
async function authorized(request, env) {
  if (!env.GOOGLE_MAPS_API_KEY) return false;
  const cookie = request.headers.get('Cookie')?.split(';').map(v => v.trim()).find(v => v.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 200) return false;
  const [expiry, nonce, supplied, extra] = cookie.split('.');
  if (extra || !/^\d{10}$/.test(expiry) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(supplied)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (+expiry <= now || +expiry > now + SESSION_SECONDS) return false;
  return equal(supplied, await signature(env.GOOGLE_MAPS_API_KEY, new URL(request.url).host + '.' + expiry + '.' + nonce));
}
function ownOrigin(request) {
  return request.headers.get('Origin') === new URL(request.url).origin && request.headers.get('Sec-Fetch-Site') !== 'cross-site';
}
async function readBody(request) {
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new Error('JSON_REQUIRED');
  if (+(request.headers.get('Content-Length') || 0) > 6000) throw new Error('BODY_TOO_LARGE');
  const text = await request.text();
  if (encoder.encode(text).length > 6000) throw new Error('BODY_TOO_LARGE');
  return JSON.parse(text);
}
function waypoint(value) {
  if (typeof value === 'string' && value.trim().length >= 3 && value.length <= 350) return { address: value.trim() };
  if (value && Number.isFinite(value.latitude) && Number.isFinite(value.longitude) && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180)
    return { location: { latLng: { latitude: value.latitude, longitude: value.longitude } } };
  throw new Error('INVALID_LOCATION');
}
export class RoutingBudget {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(request) {
    const consume = new URL(request.url).pathname === '/consume';
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const minute = Math.floor(Date.now() / 60000);
    const result = await this.ctx.storage.transaction(async tx => {
      let counts = await tx.get('counts');
      if (counts?.date !== date) counts = { date, used: 0, minute, minuteUsed: 0 };
      if (counts.minute !== minute) { counts.minute = minute; counts.minuteUsed = 0; }
      if (consume && counts.used >= 150) return { error: 'DAILY_ROUTE_LIMIT', used: counts.used, limit: 150 };
      if (consume && counts.minuteUsed >= 20) return { error: 'ROUTE_RATE_LIMIT', used: counts.used, limit: 150 };
      if (consume) { counts.used++; counts.minuteUsed++; await tx.put('counts', counts); }
      return { used: counts.used, limit: 150, remaining: 150 - counts.used };
    });
    return json(result, result.error ? 429 : 200);
  }
}
async function budget(env, consume = false) {
  if (!env.ROUTING_BUDGET) return json({ error: 'BUDGET_NOT_CONFIGURED' }, 503);
  return env.ROUTING_BUDGET.getByName('single-driver-routing-budget-v1').fetch(
    new Request('https://budget.internal/' + (consume ? 'consume' : 'status'), { method: consume ? 'POST' : 'GET' }));
}
async function googleRoute(body, env) {
  const origin = waypoint(body.origin), destination = waypoint(body.destination);
  const depart = body.departureTime == null ? Date.now() + 2000 : Date.parse(body.departureTime);
  if (!Number.isFinite(depart) || depart < Date.now() - 60000 || depart > Date.now() + 7 * 86400000) return json({ error: 'INVALID_DEPARTURE' }, 400);
  const allowance = await budget(env, true);
  if (!allowance.ok) return allowance;
  const usage = await allowance.json();
  let upstream;
  try {
    upstream = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
      method: 'POST', signal: AbortSignal.timeout(15000), headers: {
        'Content-Type': 'application/json', 'X-Goog-Api-Key': env.GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters,fallbackInfo',
      }, body: JSON.stringify({ origin, destination, travelMode: 'DRIVE', routingPreference: 'TRAFFIC_AWARE_OPTIMAL',
        departureTime: new Date(Math.max(Date.now() + 2000, depart)).toISOString(),
        computeAlternativeRoutes: false, units: 'IMPERIAL', regionCode: 'US', languageCode: 'en-US' }),
    });
  } catch { return json({ error: 'GOOGLE_UNAVAILABLE', usage }, 502); }
  if (!upstream.ok) {
    const error = upstream.status === 429 ? 'GOOGLE_QUOTA_EXCEEDED' : [401,403].includes(upstream.status) ? 'GOOGLE_ACCESS_DENIED' : 'GOOGLE_ROUTE_FAILED';
    return json({ error, upstreamStatus: upstream.status, usage }, 502);
  }
  let data;
  try { data = await upstream.json(); } catch { return json({ error: 'GOOGLE_INVALID_RESPONSE', usage }, 502); }
  const route = data.routes?.[0], seconds = Number(String(route?.duration ?? '').replace(/s$/, ''));
  if (!route || !/^\d+(?:\.\d+)?s$/.test(route.duration ?? '') || !Number.isFinite(seconds) || seconds < 0 || seconds > 86400 || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)
    return json({ error: 'GOOGLE_NO_ROUTE', usage }, 502);
  return json({ minutes: Math.ceil(seconds / 60), miles: route.distanceMeters / 1609.344,
    fetchedAt: Date.now(), trafficAware: !data.fallbackInfo, source: 'Google Routes', usage });
}
export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/api/health') {
      if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'GET, HEAD' });
      const response = json({ service: 'Serenity Dispatch', version: VERSION, runtime: 'worker',
        googleRoutesKeyConfigured: Boolean(env.GOOGLE_MAPS_API_KEY), googleValidationPending: true,
        routingAvailable: Boolean(env.GOOGLE_MAPS_API_KEY && env.ROUTING_BUDGET), authenticationRequired: true });
      return request.method === 'HEAD' ? new Response(null, {status: response.status, headers: response.headers}) : response;
    }
    if (path === '/api/routing/status' && request.method === 'GET') {
      const unlocked = await authorized(request, env);
      let usage = null;
      if (unlocked) { const r = await budget(env); usage = r.ok ? await r.json() : null; }
      return json({ configured: Boolean(env.GOOGLE_MAPS_API_KEY && env.ROUTING_BUDGET), unlocked, usage });
    }
    if (path === '/api/routing/unlock') {
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
      if (!ownOrigin(request)) return json({ error: 'ORIGIN_DENIED' }, 403);
      if (!env.GOOGLE_MAPS_API_KEY) return json({ error: 'KEY_NOT_CONFIGURED' }, 503);
      try {
        const body = await readBody(request);
        if (typeof body.key !== 'string' || body.key.length > 256 || !equal(await digest(body.key.trim()), await digest(env.GOOGLE_MAPS_API_KEY)))
          return json({ error: 'KEY_NOT_MATCHED' }, 401);
        const expiry = String(Math.floor(Date.now() / 1000) + SESSION_SECONDS);
        const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
        const value = expiry + '.' + nonce + '.' + await signature(env.GOOGLE_MAPS_API_KEY, new URL(request.url).host + '.' + expiry + '.' + nonce);
        return json({ unlocked: true }, 200, { 'Set-Cookie': COOKIE + '=' + value + '; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=' + SESSION_SECONDS });
      } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
    }
    if (path === '/api/routes' || path === '/api/routing/probe') {
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405);
      if (!ownOrigin(request)) return json({ error: 'ORIGIN_DENIED' }, 403);
      if (!await authorized(request, env)) return json({ error: 'ROUTING_LOCKED' }, 401);
      try {
        const body = path.endsWith('/probe')
          ? { origin: 'Bay Shore LIRR Station, Bay Shore, NY', destination: 'Central Islip LIRR Station, Central Islip, NY' }
          : await readBody(request);
        return await googleRoute(body, env);
      } catch { return json({ error: 'INVALID_REQUEST' }, 400); }
    }
    if (path === '/api' || path.startsWith('/api/')) return json({ error: 'NOT_FOUND' }, 404);
    return env.ASSETS.fetch(request);
  },
};

