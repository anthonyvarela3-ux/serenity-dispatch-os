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
    const path = new URL(request.url).pathname;
    const fuel = path === '/consume-fuel';
    const consume = fuel || path === '/consume';
    const now = Date.now();
    // Allow one extra production lookup for the November 23 fuel test.
    const fuelTestEnds = Date.parse('2026-11-24T00:00:00-05:00');
    const dailyFuelLimit = now < fuelTestEnds ? 3 : 2;
    const limit = fuel ? dailyFuelLimit : 150;
    const minuteLimit = fuel ? 3 : 20;
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    const minute = Math.floor(now / 60000);
    const result = await this.ctx.storage.transaction(async tx => {
      let counts = await tx.get('counts');
      if (counts?.date !== date) counts = { date, used: 0, minute, minuteUsed: 0 };
      if (counts.minute !== minute) { counts.minute = minute; counts.minuteUsed = 0; }
      if (consume && counts.used >= limit) return { error: fuel ? 'FUEL_DAILY_LIMIT' : 'DAILY_ROUTE_LIMIT', used: counts.used, limit };
      if (consume && counts.minuteUsed >= minuteLimit) return { error: fuel ? 'FUEL_RATE_LIMIT' : 'ROUTE_RATE_LIMIT', used: counts.used, limit };
      if (consume) { counts.used++; counts.minuteUsed++; await tx.put('counts', counts); }
      return { used: counts.used, limit, remaining: limit - counts.used };
    });
    return json(result, result.error ? 429 : 200);
  }
}
async function budget(env, consume = false) {
  if (!env.ROUTING_BUDGET) return json({ error: 'BUDGET_NOT_CONFIGURED' }, 503);
  return env.ROUTING_BUDGET.getByName('single-driver-routing-budget-v1').fetch(
    new Request('https://budget.internal/' + (consume ? 'consume' : 'status'), { method: consume ? 'POST' : 'GET' }));
}
async function googleDiagnostic(response) {
  // Return only known codes and field names. Provider messages and metadata can
  // contain credentials or addresses, so they must never reach the browser.
  let payload;
  try { payload = await response.json(); } catch { return {}; }
  const error = payload?.error, details = Array.isArray(error?.details) ? error.details : [];
  const reasons = new Set(['API_KEY_INVALID', 'API_KEY_EXPIRED', 'API_KEY_NOT_FOUND',
    'API_KEY_SERVICE_BLOCKED', 'API_KEY_HTTP_REFERRER_BLOCKED', 'API_KEY_IP_ADDRESS_BLOCKED',
    'API_KEY_ANDROID_APP_BLOCKED', 'API_KEY_IOS_APP_BLOCKED', 'SERVICE_DISABLED',
    'BILLING_DISABLED', 'PROJECT_DELETED', 'CONSUMER_INVALID', 'RATE_LIMIT_EXCEEDED', 'QUOTA_EXCEEDED']);
  const statuses = new Set(['INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED',
    'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'NOT_FOUND', 'INTERNAL', 'UNAVAILABLE', 'DEADLINE_EXCEEDED']);
  const reason = details.find(d => d?.['@type'] === 'type.googleapis.com/google.rpc.ErrorInfo' && reasons.has(d.reason))?.reason;
  const result = {};
  if (reason) result.reason = reason;
  if (statuses.has(error?.status)) result.status = error.status;
  const fields = ['departureTime', 'origin', 'destination', 'routingPreference', 'travelMode', 'languageCode', 'regionCode', 'units'];
  const violations = details.filter(d => d?.['@type'] === 'type.googleapis.com/google.rpc.BadRequest')
    .flatMap(d => Array.isArray(d.fieldViolations) ? d.fieldViolations : []);
  const field = fields.find(f => violations.some(v => v?.field === f || v?.field?.startsWith(f + '.')));
  if (field) result.field = field;
  else if (typeof error?.message === 'string' && /field.?mask|fields.*parameter/i.test(error.message)) result.field = 'fieldMask';
  return result;
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
    return json({ error, upstreamStatus: upstream.status, diagnostic: await googleDiagnostic(upstream), usage }, 502);
  }
  let data;
  try { data = await upstream.json(); } catch { return json({ error: 'GOOGLE_INVALID_RESPONSE', usage }, 502); }
  const route = data.routes?.[0], seconds = Number(String(route?.duration ?? '').replace(/s$/, ''));
  if (!route || !/^\d+(?:\.\d+)?s$/.test(route.duration ?? '') || !Number.isFinite(seconds) || seconds < 0 || seconds > 86400 || !Number.isFinite(route.distanceMeters) || route.distanceMeters < 0)
    return json({ error: 'GOOGLE_NO_ROUTE', usage }, 502);
  return json({ minutes: Math.ceil(seconds / 60), miles: route.distanceMeters / 1609.344,
    fetchedAt: Date.now(), trafficAware: !data.fallbackInfo, source: 'Google Routes', usage });
}
const FUEL_GRADES = new Set(['REGULAR_UNLEADED', 'MIDGRADE', 'PREMIUM', 'DIESEL']);
const METERS_PER_MILE = 1609.344;
function distanceMiles(from, to) {
  const radians = degrees => degrees * Math.PI / 180;
  const h = Math.sin(radians(to.latitude - from.latitude) / 2) ** 2 +
    Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) *
    Math.sin(radians(to.longitude - from.longitude) / 2) ** 2;
  return 6371008.8 * 2 * Math.asin(Math.sqrt(Math.min(1, h))) / METERS_PER_MILE;
}
function fuelStation(place, center) {
  const location = place?.location;
  if (place?.postalAddress?.regionCode !== 'US' || !Number.isFinite(location?.latitude) ||
      !Number.isFinite(location?.longitude) || !place.displayName?.text) return null;
  const miles = distanceMiles(center, location);
  if (miles > 10) return null;
  const prices = {};
  for (const report of place.fuelOptions?.fuelPrices ?? []) {
    const price = report.price;
    if (!FUEL_GRADES.has(report.type) || price?.currencyCode !== 'USD') continue;
    const amount = Number(price.units ?? 0) + Number(price.nanos ?? 0) / 1e9;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    prices[report.type] = { amount, updatedAt: Number.isFinite(Date.parse(report.updateTime)) ? report.updateTime : null };
  }
  const directions = new URL('https://www.google.com/maps/dir/');
  directions.search = new URLSearchParams({ api: '1', travelmode: 'driving',
    destination: place.formattedAddress || location.latitude + ',' + location.longitude });
  if (place.id) directions.searchParams.set('destination_place_id', place.id);
  return { name: place.displayName.text, address: place.formattedAddress, miles, prices, directions: directions.href };
}
async function nearbyFuel(request, env) {
  const apiKey = env.GOOGLE_PLACES_API_KEY?.trim();
  if (!apiKey || !env.ROUTING_BUDGET) return json({ error: 'FUEL_NOT_CONFIGURED' }, 503);
  if (!await authorized(request, env)) return json({ error: 'ROUTING_LOCKED' }, 401);
  let center;
  try {
    const body = await readBody(request);
    center = waypoint(body).location?.latLng;
    if (!center) throw new Error('INVALID_LOCATION');
  } catch { return json({ error: 'INVALID_LOCATION' }, 400); }
  try {
    // A separate object keeps fuel searches outside the Routes request budget.
    const allowance = await env.ROUTING_BUDGET.getByName('single-driver-fuel-budget-v1')
      .fetch(new Request('https://budget.internal/consume-fuel', { method: 'POST' }));
    if (!allowance.ok) return allowance;
    const response = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.location,places.displayName,places.formattedAddress,places.postalAddress,places.fuelOptions,places.attributions',
      },
      body: JSON.stringify({ includedTypes: ['gas_station'], rankPreference: 'DISTANCE', maxResultCount: 20,
        locationRestriction: { circle: { center, radius: 10 * METERS_PER_MILE } }, regionCode: 'US' }),
    });
    if (!response.ok) return json({ error: 'FUEL_PROVIDER_REJECTED',
      upstreamStatus: response.status, diagnostic: await googleDiagnostic(response) }, 502);
    const data = await response.json();
    const matched = (data.places ?? []).map(place => ({ place, station: fuelStation(place, center) }))
      .filter(match => match.station);
    const attributions = [...new Set(matched.flatMap(({ place }) =>
      (place.attributions ?? []).map(attribution => attribution.provider).filter(Boolean)))];
    const stations = matched.map(({ station }) => station).sort((a, b) => a.miles - b.miles);
    return json({ stations, attributions, checkedAt: Date.now() });
  } catch { return json({ error: 'FUEL_PROVIDER_UNAVAILABLE' }, 502); }
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
    if (path === '/api/fuel') {
      if (request.method !== 'POST') return json({ error: 'METHOD_NOT_ALLOWED' }, 405, { Allow: 'POST' });
      if (!ownOrigin(request)) return json({ error: 'ORIGIN_DENIED' }, 403);
      return nearbyFuel(request, env);
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

