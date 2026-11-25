const portal = 'https://serenity-fleet-dispatch.trustworthybiscuit.chatgpt.site';
const browserCookie = '__Host-serenity-work';
const day = 86400000;
const publicKeyBytes = 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEiYzgKBtNgqNVYCCWM7L6EiEs5kS83W7OGikJCCreyyBkA4AFKn1wmUbDHjFG1JYCSjnT6IN/Z2ej0YhGrg1zdA==';
const decode = encoded => Uint8Array.from(atob(encoded.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));

function seeOther(url, cookie) {
  const headers = new Headers({ Location: url, 'Cache-Control': 'no-store' });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

function sessionCookie(value, age) {
  return browserCookie + '=' + value + '; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=' + age;
}

async function verifyTicket(value, origin, action, windowMs) {
  if (typeof value !== 'string' || value.length > 512 || !/^[\w-]+\.[\w-]+$/.test(value)) return false;
  try {
    const [encoded, signature] = value.split('.');
    const payload = decode(encoded);
    const ticket = JSON.parse(new TextDecoder().decode(payload));
    const age = Date.now() - ticket.issued;
    if (ticket.audience !== origin || ticket.action !== action || !Number.isSafeInteger(ticket.issued) ||
        age < -30000 || age > windowMs) return false;
    const publicKey = await crypto.subtle.importKey('spki', decode(publicKeyBytes),
      { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, publicKey, decode(signature), payload);
  } catch { return false; }
}

export async function serveWorkSession(request, env, path) {
  const { origin } = new URL(request.url);
  if (path === '/api/work-driver') {
    if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
    const value = request.headers.get('Cookie')?.split(';').map(field => field.trim())
      .find(field => field.startsWith(browserCookie + '='))?.slice(browserCookie.length + 1);
    if (!await verifyTicket(value, origin, 'sign-in', day)) return seeOther(portal + '/work/start');
    const asset = await env.ASSETS.fetch(new Request(origin + '/', { method: request.method }));
    const headers = new Headers(asset.headers);
    headers.set('Cache-Control', 'no-store');
    return new Response(asset.body, { status: asset.status, headers });
  }
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  if (request.headers.get('Origin') !== portal) return new Response('Open Serenity Home to manage your work session.', { status: 403 });
  const action = path === '/api/work-login' ? 'sign-in' : 'sign-out';
  let value;
  try {
    const text = await request.text();
    if (text.length <= 1024) value = new URLSearchParams(text).get('handoff');
  } catch {}
  if (!await verifyTicket(value, origin, action, 120000)) {
    return seeOther(portal + (action === 'sign-in' ? '/work/start' : '/work/end'));
  }
  return action === 'sign-in'
    ? seeOther('/api/work-driver', sessionCookie(value, day / 1000))
    : seeOther(portal + '/work/signed-out', sessionCookie('', 0));
}
