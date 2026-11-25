/* Test server: the site on :5173 (with a test config.js) and a fake Supabase Storage on :9199 */
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg' };
const testConfig = `window.APP_CONFIG = {
  firebase: { apiKey: "fake-api-key", authDomain: "demo-klox.firebaseapp.com", projectId: "demo-klox", appId: "1:1:web:1" },
  supabase: { url: "http://127.0.0.1:9199", key: "sb_publishable_TEST", bucket: "archivos" },
  appName: "Reporte de Incidencias" };`;
http.createServer((q, r) => {
  let p = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (p === '/web/config.js') { r.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' }); return r.end(testConfig); }
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(f).pipe(r);
}).listen(5173, '127.0.0.1');

const STORE = new Map(); const LOG = [];
function claims(h) { // decode (not verify) the Firebase token, like Supabase would after checking it
  const m = /^Bearer (.+)$/.exec(h || ''); if (!m) return null;
  try { return JSON.parse(Buffer.from(m[1].split('.')[1], 'base64url').toString()); } catch { return null; }
}
const ALLOW = new Set((process.env.TEAM || 'carlos@test.com,ana@test.com').split(','));
http.createServer((q, r) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization,apikey,content-type,x-upsert,cache-control,range', 'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS', 'Access-Control-Expose-Headers': 'content-range,content-length' };
  if (q.method === 'OPTIONS') { r.writeHead(204, cors); return r.end(); }
  const u = new URL(q.url, 'http://x');
  if (u.pathname === '/_log') { r.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); return r.end(JSON.stringify({ log: LOG, ids: [...STORE.keys()] })); }
  const c = claims(q.headers.authorization); LOG.push({ m: q.method, p: u.pathname, email: c && c.email, key: q.headers.apikey, range: q.headers.range || null });
  const ok = c && ALLOW.has(c.email) && q.headers.apikey === 'sb_publishable_TEST';
  let m;
  if (q.method === 'POST' && (m = /^\/storage\/v1\/object\/archivos\/([0-9a-f]{32})$/.exec(u.pathname))) {
    if (!ok) { r.writeHead(403, { ...cors, 'Content-Type': 'application/json' }); return r.end('{"message":"new row violates row-level security policy"}'); }
    const parts = []; q.on('data', d => parts.push(d)); q.on('end', () => { STORE.set(m[1], { type: q.headers['content-type'], body: Buffer.concat(parts) }); r.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); r.end(JSON.stringify({ Key: 'archivos/' + m[1] })); });
    return;
  }
  if (q.method === 'GET' && (m = /^\/storage\/v1\/object\/authenticated\/archivos\/([0-9a-f]{32})$/.exec(u.pathname))) {
    if (!ok) { r.writeHead(400, { ...cors, 'Content-Type': 'application/json' }); return r.end('{"statusCode":"403","message":"not allowed"}'); }
    const o = STORE.get(m[1]); if (!o) { r.writeHead(400, cors); return r.end('{"statusCode":"404","message":"Object not found"}'); }
    const rg = /bytes=(\d+)-(\d*)/.exec(q.headers.range || '');
    if (rg) { const a = +rg[1], b = rg[2] ? Math.min(+rg[2], o.body.length - 1) : o.body.length - 1; r.writeHead(206, { ...cors, 'Content-Type': o.type, 'Content-Range': `bytes ${a}-${b}/${o.body.length}`, 'Content-Length': b - a + 1 }); return r.end(o.body.subarray(a, b + 1)); }
    r.writeHead(200, { ...cors, 'Content-Type': o.type, 'Content-Length': o.body.length }); return r.end(o.body);
  }
  r.writeHead(404, cors); r.end('{}');
}).listen(9199, '127.0.0.1');
console.log('ready');
