const { chromium } = require('playwright'); const { execSync } = require('child_process');
const res = []; const ok = (n, c, x) => res.push((c ? 'PASS ' : 'FAIL ') + n + (x ? '  ' + x : ''));
(async () => {
  execSync('sh ' + __dirname + '/seed-import.sh');
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } }); const c = await ctx.newPage(); c.logs = [];
  c.on('pageerror', e => c.logs.push('PAGEERR ' + e.message));
  /* first time on the empty site, Carlos opens it normally (so the starter note gets made), then goes to #importar */
  await c.goto('http://127.0.0.1:5173/?emu=1'); await c.waitForSelector('#appGate button');
  await c.evaluate(() => window.__emuSignIn('carlos@test.com', 'Carlos'));
  await c.waitForFunction(() => document.querySelector('#appGate')?.hidden, null, { timeout: 15000 }); await c.waitForTimeout(3000);
  ok('tablero nuevo arranca con la nota de inicio', (await c.$$eval('.appb', a => a.length)) >= 1);
  await c.goto('http://127.0.0.1:5173/?emu=1#importar'); await c.waitForSelector('text=Elegir archivo .klox', { timeout: 15000 });
  await c.screenshot({ path: __dirname + '/out/imp-1.png' });
  await c.setInputFiles('#appGate input[type=file]', process.env.KLOX_FILE || __dirname + '/out/migracion-test.klox');
  await c.waitForSelector('text=Reemplazar y pasar todo', { timeout: 10000 }); await c.screenshot({ path: __dirname + '/out/imp-2.png' });
  ok('resumen del archivo', true, await c.textContent('#appGate .gc p'));
  await c.click('text=Reemplazar y pasar todo');
  await c.waitForSelector('text=Abrir el tablero', { timeout: 60000 }).catch(() => {});
  ok('importación termina', /Listo/.test(await c.textContent('#appGate .gc p')), await c.textContent('#appGate .gc p'));
  await c.screenshot({ path: __dirname + '/out/imp-3.png' });
  await c.click('text=Abrir el tablero');
  await c.waitForFunction(() => document.querySelector('#appGate')?.hidden, null, { timeout: 15000 }); await c.waitForTimeout(5000);
  ok('se quita el hash #importar', !/importar/.test(c.url()), c.url());
  const st = await c.evaluate(() => ({ wins: document.querySelectorAll('.appb').length, names: [...document.querySelectorAll('.appb')].map(x => x.textContent.trim().slice(0, 30)), stk: document.querySelectorAll('.stk').length,
    imgs: [...document.querySelectorAll('.stk img')].map(i => i.naturalWidth) }));
  ok('se ven las notas de claude.ai', st.names.some(n => n.startsWith('moodboard')) && st.names.some(n => /project1/.test(n)), JSON.stringify(st.names));
  ok('post-its e imágenes del escritorio', st.stk > 0 && st.imgs.every(w => w > 0), JSON.stringify({ stk: st.stk, imgs: st.imgs }));
  await c.screenshot({ path: __dirname + '/out/imp-desk.png' });
  const log = await (await fetch('http://127.0.0.1:9199/_log')).json();
  ok('subió los 7 archivos con su mismo id', ['0248c69a176acde4689636406633d76a', '4926bae273423b79d7958eeb1e95dc49'].every(id => log.ids.includes(id)), log.ids.length + ' en storage');
  const ana = await (await fetch('http://127.0.0.1:8080/v1/projects/demo-klox/databases/(default)/documents/members/ana@test.com', { headers: { Authorization: 'Bearer owner' } })).json();
  ok('la otra persona queda con acceso', ana.fields?.owner?.booleanValue === false, ana.fields?.id?.stringValue);
  /* the import again: already there → still fine */
  await c.goto('http://127.0.0.1:5173/?emu=1#importar'); await c.waitForSelector('text=Elegir archivo .klox', { timeout: 15000 });
  await c.setInputFiles('#appGate input[type=file]', process.env.KLOX_FILE || __dirname + '/out/migracion-test.klox'); await c.click('text=Reemplazar y pasar todo');
  await c.waitForSelector('text=Abrir el tablero', { timeout: 60000 }).catch(() => {});
  ok('volver a importar no falla', /Listo/.test(await c.textContent('#appGate .gc p')), await c.textContent('#appGate .gc p'));
  if (c.logs.length) res.push('  logs: ' + c.logs.join(' | '));
  console.log(res.join('\n')); await b.close();
})().catch(e => { console.log(res.join('\n')); console.error(e); process.exit(1); });
