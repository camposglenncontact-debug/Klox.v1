/* Serves "_blob/<id>" (pictures and videos) from the private Supabase bucket, signed in as the person.
   The page sends the sign-in token; ids never change content, so a copy is kept in the browser. */
'use strict';
const CACHE = 'blobs-v1';
const ID = /\/_blob\/([0-9a-f]{32})$/;
let T = null;            // {token, url, key, bucket, at}
let waiting = [];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'token' && d.token){
    T = { token: d.token, url: d.url, key: d.key, bucket: d.bucket, at: Date.now() };
    waiting.splice(0).forEach(r => r(T));
  }
});

/* ask an open page for a fresh token; give up after 8 s */
async function token(fresh){
  if (T && !fresh && Date.now() - T.at < 50 * 60000) return T;
  const all = await self.clients.matchAll({ type: 'window' });
  all.forEach(c => c.postMessage({ type: 'need-token' }));
  return new Promise(res => {
    waiting.push(res);
    setTimeout(() => { const i = waiting.indexOf(res); if (i >= 0){ waiting.splice(i, 1); res(T); } }, 8000);
  });
}

async function fromStorage(id, range, fresh){
  const t = await token(fresh);
  if (!t) return new Response('Sin sesión', { status: 401 });
  const h = { Authorization: 'Bearer ' + t.token, apikey: t.key };
  if (range) h.Range = range;
  return fetch(`${t.url}/storage/v1/object/authenticated/${t.bucket}/${id}`, { headers: h, cache: 'no-store' });
}

/* answer a byte range from a full copy (videos ask for pieces) */
async function slice(full, range){
  const m = /bytes=(\d*)-(\d*)/.exec(range || '');
  const buf = await full.arrayBuffer(), size = buf.byteLength;
  let a = m && m[1] !== '' ? +m[1] : null, b = m && m[2] !== '' ? +m[2] : null;
  if (a === null && b !== null){ a = Math.max(0, size - b); b = size - 1; }
  if (a === null) a = 0;
  if (b === null || b >= size) b = size - 1;
  if (a >= size || a > b) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  return new Response(buf.slice(a, b + 1), { status: 206, headers: {
    'Content-Type': full.headers.get('Content-Type') || 'application/octet-stream',
    'Content-Range': `bytes ${a}-${b}/${size}`, 'Content-Length': String(b - a + 1), 'Accept-Ranges': 'bytes' } });
}

async function serve(req, id){
  const range = req.headers.get('Range');
  const cache = await caches.open(CACHE);
  const hit = await cache.match(id);
  if (hit) return range ? slice(hit, range) : hit;
  let r = await fromStorage(id, range, false);
  if (r.status === 400 || r.status === 401 || r.status === 403) r = await fromStorage(id, range, true); // token ran out
  if (r.status === 200 && !range){
    const body = await r.blob();
    const keep = new Response(body, { status: 200, headers: {
      'Content-Type': r.headers.get('Content-Type') || body.type || 'application/octet-stream',
      'Content-Length': String(body.size), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, max-age=31536000, immutable' } });
    cache.put(id, keep.clone()).catch(() => {});
    return keep;
  }
  return r;
}

self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || e.request.method !== 'GET') return;
  const m = ID.exec(u.pathname);
  if (!m || !u.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  e.respondWith(serve(e.request, m[1]).catch(() => new Response('Sin conexión', { status: 503 })));
});
