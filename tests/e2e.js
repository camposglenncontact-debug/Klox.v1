const { chromium } = require('playwright'); const { execSync } = require('child_process');
const URL0 = 'http://127.0.0.1:5173/?emu=1', FS = 'http://127.0.0.1:8080/v1/projects/demo-klox/databases/(default)/documents';
const res = []; const ok = (name, cond, extra) => { res.push((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); };
const adminGet = async path => (await fetch(`${FS}/${path}`, { headers: { Authorization: 'Bearer owner' } })).json();
async function open(b, email, name, opts = {}) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: opts.dark ? 'dark' : 'light' });
  const p = await ctx.newPage(); p.logs = [];
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') p.logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  p.on('pageerror', e => p.logs.push('PAGEERR ' + e.message));
  await p.goto(URL0); await p.waitForSelector('#appGate button', { timeout: 15000 });
  if (opts.shot) await p.screenshot({ path: __dirname + `/out/${opts.shot}` });
  await p.evaluate(([e, n]) => window.__emuSignIn(e, n), [email, name]);
  return p;
}
(async () => {
  execSync('sh ' + __dirname + '/seed.sh');
  const b = await chromium.launch();
  /* Carlos signs in on an empty board */
  const c = await open(b, 'carlos@test.com', 'Carlos', { shot: 'gate-light.png' });
  await c.waitForFunction(() => document.querySelector('#appGate')?.hidden, null, { timeout: 15000 });
  await c.waitForTimeout(4000);
  const wins = await c.$$eval('.appb', a => a.length);
  ok('Carlos entra y ve el escritorio', wins > 0, wins + ' ventanas');
  await c.screenshot({ path: __dirname + '/out/desk-carlos.png' });
  const team = await adminGet('team/uCARLOS'), prof = await adminGet('profiles/uCARLOS'), board = await adminGet('meta/board');
  ok('se guarda en team/uCARLOS', !!team.fields, JSON.stringify(team.fields || team.error).slice(0, 80));
  ok('perfil con nombre', prof.fields?.name?.stringValue === 'Carlos');
  ok('Carlos queda como dueño del tablero', board.fields?.owner?.stringValue === 'uCARLOS');
  const notes = await adminGet('notes'); ok('notas de inicio creadas', (notes.documents || []).length > 0, (notes.documents || []).length + ' notas');
  /* private data rules */
  const priv = await c.evaluate(async () => { const db = await claude.use('db');
    const out = {}; try { await db.collection('data/users/uCARLOS').doc('desk').set({ bubbles: {}, at: 1 }); out.own = 'ok'; } catch (e) { out.own = e.code; }
    try { await db.collection('data/users/uANA').doc('desk').get(); out.other = 'read'; } catch (e) { out.other = e.code; }
    try { await db.collection('members').doc('x@test.com').set({ id: 'x', owner: true }); out.memberWrite = 'ok (owner)'; } catch (e) { out.memberWrite = e.code; }
    try { await db.collection('tickets').doc('t1').update({ title: 'Prueba', deep: { a: 1, b: 2 } }); await db.collection('tickets').doc('t1').update({ deep: { a: null } }); out.merge = JSON.stringify((await db.collection('tickets').doc('t1').get()).data()); } catch (e) { out.merge = e.code; }
    return out; });
  ok('escribe en sus datos privados', priv.own === 'ok', priv.own);
  ok('no puede leer los privados de otra persona', priv.other === 'permission_denied', priv.other);
  ok('el dueño puede agregar miembros', priv.memberWrite === 'ok (owner)', priv.memberWrite);
  ok('update con null quita el campo', priv.merge === '{"title":"Prueba","deep":{"b":2}}', priv.merge);
  /* pictures through the service worker */
  const pic = await c.evaluate(async () => { const a = await claude.use('assets');
    const cv = Object.assign(document.createElement('canvas'), { width: 40, height: 30 }); const g = cv.getContext('2d'); g.fillStyle = '#e33'; g.fillRect(0, 0, 40, 30);
    const blob = await new Promise(r => cv.toBlob(r, 'image/png')); const up = await a.upload(blob);
    const im = new Image(); im.src = up.url; await im.decode().catch(() => {});
    const r = await fetch(up.url, { headers: { Range: 'bytes=0-3' } });
    return { id: up.id, url: up.url, w: im.naturalWidth, h: im.naturalHeight, range: r.status, rangeLen: (await r.arrayBuffer()).byteLength, sw: !!navigator.serviceWorker.controller }; });
  ok('sube imagen y se ve por el service worker', pic.w === 40 && pic.h === 30, JSON.stringify(pic));
  ok('pedazos de video (Range) funcionan', pic.range === 206 && pic.rangeLen === 4);
  /* Ana sees the same board, live */
  const a = await open(b, 'ana@test.com', 'Ana', { dark: true, shot: 'gate-dark.png' });
  await a.waitForFunction(() => document.querySelector('#appGate')?.hidden, null, { timeout: 15000 }); await a.waitForTimeout(3000);
  ok('Ana ve las mismas ventanas', (await a.$$eval('.appb', x => x.length)) === wins);
  const anaPic = await a.evaluate(async id => { const im = new Image(); im.src = '_blob/' + id; await im.decode().catch(() => {}); return im.naturalWidth; }, pic.id);
  ok('Ana ve la imagen de Carlos', anaPic === 40);
  const anaMember = await a.evaluate(async () => { const db = await claude.use('db'); try { await db.collection('members').doc('y@test.com').set({ id: 'y' }); return 'ok'; } catch (e) { return e.code; } });
  ok('Ana no puede agregar miembros', anaMember === 'permission_denied', anaMember);
  await c.evaluate(async () => { const db = await claude.use('db'); window.__live = 'waiting'; db.collection('tickets').onSnapshot(s => { if (s.docs.some(d => d.data().title === 'Desde Ana')) window.__live = 'ok'; }); });
  await a.evaluate(async () => { const db = await claude.use('db'); await db.collection('tickets').add({ title: 'Desde Ana', at: Date.now() }); });
  const live = await c.waitForFunction(() => window.__live === 'ok', null, { timeout: 8000 }).then(() => 'ok', () => 'timeout');
  ok('Carlos recibe en vivo lo que escribe Ana', live === 'ok');
  await a.screenshot({ path: __dirname + '/out/desk-ana-dark.png' });
  /* someone not on the team */
  const m = await open(b, 'mallory@test.com', 'Mallory');
  await m.waitForFunction(() => /todavía no tiene acceso/.test(document.querySelector('#appGate')?.textContent || ''), null, { timeout: 15000 }).then(() => ok('quien no es del equipo ve "sin acceso"', true), () => ok('quien no es del equipo ve "sin acceso"', false));
  await m.screenshot({ path: __dirname + '/out/gate-noaccess.png' });
  const tok = await (await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=fake-api-key', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ postBody: 'id_token=' + encodeURIComponent(JSON.stringify({ sub: 'g-mallory@test.com', email: 'mallory@test.com', email_verified: true })) + '&providerId=google.com', requestUri: 'http://localhost', returnSecureToken: true }) })).json();
  const r1 = await fetch(`${FS}/notes`, { headers: { Authorization: 'Bearer ' + tok.idToken } });
  ok('quien no es del equipo no puede leer notas (API directa)', r1.status === 403, String(r1.status));
  const r2 = await fetch('http://127.0.0.1:9199/storage/v1/object/authenticated/archivos/' + pic.id, { headers: { Authorization: 'Bearer ' + tok.idToken, apikey: 'sb_publishable_TEST' } });
  ok('quien no es del equipo no puede ver imágenes', r2.status !== 200, String(r2.status));
  /* sign out from Personalizar */
  await c.evaluate(() => document.querySelector('#rCustom').click()); await c.waitForTimeout(500);
  const hasOut = await c.$('text=Cerrar sesión'); ok('Personalizar muestra Cerrar sesión', !!hasOut, await c.evaluate(() => [...document.querySelectorAll('.pop .hint')].map(x => x.textContent).find(t => t.startsWith('Entraste')) || ''));
  await c.screenshot({ path: __dirname + '/out/custom-cuenta.png' });
  if (hasOut) { await hasOut.click(); await c.waitForFunction(() => /Entrar con Google/.test(document.querySelector('#appGate')?.textContent || '') && !document.querySelector('#appGate').hidden, null, { timeout: 15000 }).then(() => ok('cerrar sesión regresa a la pantalla de entrar', true), () => ok('cerrar sesión regresa a la pantalla de entrar', false)); }
  for (const [n, p] of [['carlos', c], ['ana', a], ['mallory', m]]) if (p.logs.length) res.push(`  logs ${n}: ` + p.logs.filter(l => !/fondo-bosque|ERR_TUNNEL|fonts\.g/.test(l)).slice(0, 8).join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e => { console.log(res.join('\n')); console.error(e); process.exit(1); });
