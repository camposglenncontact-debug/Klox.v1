/* Runs the page outside claude.ai: the same window.claude.use(...) the page already calls, but backed by
   Google sign-in + Firestore (data), Supabase Storage (pictures and videos) and the Google Sheets API.
   Classic script, loaded before the page so `window.claude` exists when the page starts. */
(function(){
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const EMU = /[?&]emu=1\b/.test(location.search);
  const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
  const base = new URL('.', document.baseURI);
  let FB = null, AUTH = null, FS = null, ME = null; // ME = {uid, email, id, owner, name, photo}

  /* ---------- small helpers ---------- */
  const err = (code, message, extra) => Object.assign(new Error(message || code), { code }, extra || {});
  function mapErr(e){
    const c = String(e && e.code || '');
    if (c.includes('permission-denied')) return err('permission_denied', 'No tienes permiso para esto.');
    if (c.includes('resource-exhausted')) return err('quota_exceeded', 'Se llegó al límite gratis de hoy.');
    if (c.includes('invalid-argument')) return err('invalid_argument', e.message);
    if (c.includes('unauthenticated')) return err('unauthenticated', 'Tu sesión terminó. Vuelve a entrar.');
    return err('unavailable', (e && e.message) || 'Sin conexión.', { retryable: true });
  }
  const isPlain = v => v && typeof v === 'object' && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
  /* the page writes null to say "take this away" when it merges; Firestore needs deleteField() for that */
  function forMerge(v){
    if (v === null) return FB.deleteField();
    if (!isPlain(v)) return v;
    const o = {}; for (const k in v) if (v[k] !== undefined) o[k] = forMerge(v[k]); return o;
  }
  const hex32 = () => [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  const colorOf = s => { let h = 0; for (const ch of String(s || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0; return `hsl(${h % 360} 55% 48%)`; };
  function initialAvatar(name, color){
    const ch = ([...String(name || '?').trim()][0] || '?').toUpperCase().replace(/[<&>"']/g, '');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="${color}"/><text x="32" y="41" font-family="system-ui,sans-serif" font-size="28" font-weight="600" fill="#fff" text-anchor="middle">${ch}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  /* ---------- sign-in screen ---------- */
  let gate = null, gateWant = null;
  function showGate(kind, detail){
    if (!document.body){ // before the page is parsed: show only the latest state once it is
      if (!gateWant) document.addEventListener('DOMContentLoaded', () => { const w = gateWant; gateWant = null; if (w) showGate(...w); }, { once: true });
      gateWant = [kind, detail]; return;
    }
    gateWant = null;
    if (!gate){
      gate = document.createElement('div'); gate.id = 'appGate';
      const st = document.createElement('style');
      st.textContent = `#appGate{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;padding:16px;background:rgba(12,14,18,.38);-webkit-backdrop-filter:blur(18px) saturate(140%);backdrop-filter:blur(18px) saturate(140%);font:15px/1.45 Ubuntu,system-ui,sans-serif;color:#1d2126}
#appGate .gc{width:min(380px,100%);border-radius:24px;padding:26px 24px 22px;background:rgba(250,251,250,.86);border:1px solid rgba(255,255,255,.7);box-shadow:0 30px 70px rgba(0,0,0,.35);text-align:center}
#appGate h1{margin:0 0 6px;font-size:21px;font-weight:600}
#appGate p{margin:0 0 18px;color:#4b5259}
#appGate button{display:inline-flex;align-items:center;justify-content:center;gap:10px;width:100%;height:46px;border-radius:14px;border:1px solid rgba(0,0,0,.12);background:#fff;color:#1d2126;font:600 15px Ubuntu,system-ui,sans-serif;cursor:pointer}
#appGate button:hover{background:#f3f5f4}
#appGate button:focus-visible{outline:2px solid #3b82f6;outline-offset:2px}
#appGate .alt{margin-top:10px;background:transparent;border-color:transparent;color:#4b5259;font-weight:500;height:36px}
#appGate .who{font-size:13px;color:#6b7177;margin-top:14px;word-break:break-all}
@media (prefers-color-scheme:dark){#appGate .gc{background:rgba(30,33,37,.9);border-color:rgba(255,255,255,.12);color:#eef0f1}#appGate p,#appGate .alt,#appGate .who{color:#b5bcc2}#appGate button{background:#2a2e33;color:#eef0f1;border-color:rgba(255,255,255,.14)}#appGate button:hover{background:#33383e}}`;
      gate.append(st, Object.assign(document.createElement('div'), { className: 'gc' }));
      document.body.append(gate);
    }
    const card = gate.querySelector('.gc'); card.replaceChildren();
    const h1 = Object.assign(document.createElement('h1'), { textContent: CFG.appName || 'Reporte de Incidencias' });
    const p = document.createElement('p');
    const btn = document.createElement('button'); btn.type = 'button';
    const g = '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>';
    if (kind === 'signin'){
      p.textContent = 'Entra con tu cuenta de Google para ver y editar las notas del equipo.';
      btn.innerHTML = g; btn.append(document.createTextNode('Entrar con Google'));
      btn.onclick = () => signIn().catch(e => showGate('signin-error', e));
      card.append(h1, p, btn);
      if (detail) card.append(Object.assign(document.createElement('div'), { className: 'who', textContent: detail }));
    } else if (kind === 'signin-error'){
      const c = String(detail && detail.code || '');
      showGate('signin', c.includes('popup-closed') || c.includes('cancelled-popup') ? '' : c.includes('popup-blocked') ? 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio e inténtalo otra vez.' : 'No se pudo entrar: ' + (detail && detail.message || c));
      return;
    } else if (kind === 'loading'){
      p.textContent = 'Cargando…'; card.append(h1, p);
    } else if (kind === 'no-access'){
      p.textContent = 'Tu cuenta todavía no tiene acceso a este tablero. Pídele a quien lo administra que te agregue con este correo:';
      const who = Object.assign(document.createElement('div'), { className: 'who', textContent: detail || '' });
      btn.textContent = 'Entrar con otra cuenta'; btn.onclick = () => FB.signOut(AUTH);
      card.append(h1, p, who, btn);
    } else if (kind === 'offline'){
      p.textContent = 'No se pudo conectar. Revisa tu internet y vuelve a intentarlo.';
      btn.textContent = 'Reintentar'; btn.onclick = () => location.reload();
      card.append(h1, p, btn);
      if (detail) card.append(Object.assign(document.createElement('div'), { className: 'who', textContent: String(detail) }));
    }
    gate.hidden = false;
    setTimeout(() => card.querySelector('button')?.focus(), 30);
  }
  const hideGate = () => { gateWant = null; if (gate) gate.hidden = true; };

  /* ---------- Firebase ---------- */
  let fbP = null;
  function loadFirebase(){
    return fbP || (fbP = import(new URL('web/fb.js', base).href).then(fb => {
      FB = fb;
      const app = fb.initializeApp(CFG.firebase);
      AUTH = fb.getAuth(app);
      let cache;
      try { cache = fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }); } catch { cache = fb.memoryLocalCache(); }
      FS = fb.initializeFirestore(app, { localCache: cache, ignoreUndefinedProperties: true });
      if (EMU){ fb.connectAuthEmulator(AUTH, 'http://127.0.0.1:9099', { disableWarnings: true }); fb.connectFirestoreEmulator(FS, '127.0.0.1', 8080); }
      return fb;
    }));
  }
  function googleProvider(withSheets){
    const p = new FB.GoogleAuthProvider();
    p.setCustomParameters({ prompt: 'select_account' });
    if (withSheets) p.addScope(SHEETS_SCOPE);
    return p;
  }
  async function signIn(){
    if (!FB) await loadFirebase(); // no extra wait when ready, so the browser lets the Google window open
    await FB.signInWithPopup(AUTH, googleProvider(false));
  }

  /* who is signed in, and are they on the team */
  let sessionResolve, sessionP = new Promise(r => sessionResolve = r);
  async function startSession(user){
    showGate('loading');
    const email = String(user.email || '').toLowerCase();
    let entry;
    try {
      const snap = await FB.getDoc(FB.doc(FS, 'members', email));
      entry = snap.exists() ? snap.data() : null;
    } catch (e){
      if (String(e.code || '').includes('permission-denied')) entry = null;
      else { showGate('offline', e.message); return; }
    }
    if (!entry || typeof entry.id !== 'string' || !entry.id){ showGate('no-access', email); return; }
    ME = { uid: user.uid, email, id: entry.id, owner: entry.owner === true, name: user.displayName || email.split('@')[0], photo: user.photoURL || '' };
    /* keep my name and photo up to date for the others */
    FB.setDoc(FB.doc(FS, 'profiles', ME.id), { name: ME.name, avatarUrl: ME.photo, at: Date.now() }, { merge: true }).catch(() => {});
    watchProfiles();
    await blobWorker();
    if (/^#importar\b/.test(location.hash)){ importer(); return; } // the board waits until the import is done
    hideGate();
    sessionResolve(ME);
  }

  /* ---------- profiles (names and photos), read live ---------- */
  const PROFILES = new Map(); let profUnsub = null, profReady = null;
  function watchProfiles(){
    if (profUnsub) return;
    let first; profReady = Promise.race([new Promise(r => first = r), new Promise(r => setTimeout(r, 4000))]);
    profUnsub = FB.onSnapshot(FB.collection(FS, 'profiles'), s => { s.docs.forEach(d => PROFILES.set(d.id, d.data())); first(); }, () => first());
  }

  /* ---------- pictures and videos: a service worker serves "_blob/<id>" from the private Supabase bucket ---------- */
  let swReg = null;
  async function blobWorker(){
    if (!('serviceWorker' in navigator)) return;
    try {
      swReg = await navigator.serviceWorker.register(new URL('sw.js', base).href);
      await navigator.serviceWorker.ready;
      if (!navigator.serviceWorker.controller)
        await Promise.race([new Promise(r => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true })), new Promise(r => setTimeout(r, 4000))]);
      await sendToken();
    } catch (e){ console.warn('Sin service worker; las imágenes no van a cargar.', e); }
  }
  async function sendToken(){
    const sw = navigator.serviceWorker && (navigator.serviceWorker.controller || swReg?.active);
    if (!sw || !AUTH.currentUser) return;
    const token = await AUTH.currentUser.getIdToken();
    sw.postMessage({ type: 'token', token, url: CFG.supabase.url, key: CFG.supabase.key, bucket: CFG.supabase.bucket, emu: EMU ? (CFG.storageEmu || '') : '' });
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'need-token') sendToken(); });

  /* ---------- the namespaces the page asks for ---------- */
  function snapOf(d){ const data = d.data(); return { id: d.id, exists: d.exists(), data: () => data }; }
  function docApi(ref){
    return {
      id: ref.id, path: ref.path,
      get: () => FB.getDoc(ref).then(snapOf, e => { throw mapErr(e); }),
      set: data => FB.setDoc(ref, JSON.parse(JSON.stringify(data))).catch(e => { throw mapErr(e); }),
      update: data => FB.setDoc(ref, forMerge(data), { merge: true }).catch(e => { throw mapErr(e); }),
      delete: () => FB.deleteDoc(ref).catch(e => { throw mapErr(e); }),
      onSnapshot: (next, fail) => FB.onSnapshot(ref, s => next(snapOf(s)), e => fail && fail(mapErr(e)))
    };
  }
  function colApi(path){
    const ref = FB.collection(FS, path);
    return {
      id: ref.id, path,
      doc: id => docApi(id ? FB.doc(FS, path, id) : FB.doc(ref)),
      add: async data => docApi(await FB.addDoc(ref, JSON.parse(JSON.stringify(data))).catch(e => { throw mapErr(e); })),
      get: () => FB.getDocs(ref).then(s => ({ docs: s.docs.map(snapOf), size: s.size, empty: s.empty }), e => { throw mapErr(e); }),
      onSnapshot: (next, fail) => FB.onSnapshot(ref, s => next({ docs: s.docs.map(snapOf), size: s.size, empty: s.empty }), e => fail && fail(mapErr(e)))
    };
  }
  const db = { collection: colApi, doc: path => docApi(FB.doc(FS, path)) };

  const user = {
    me: async () => ({ id: ME.id, name: ME.name, avatarUrl: ME.photo || initialAvatar(ME.name, colorOf(ME.id)), color: colorOf(ME.id), email: ME.email, isOwner: ME.owner, canEdit: ME.owner }),
    id: async () => ME.id,
    isOwner: async () => ME.owner,
    canEdit: async () => ME.owner,
    can: async cap => cap === 'data.write' ? true : null,
    profiles: async ids => {
      if (profReady) await profReady;
      const out = {};
      for (const id of ids || []){
        const p = PROFILES.get(id) || (id === ME.id ? { name: ME.name, avatarUrl: ME.photo } : null);
        const color = colorOf(id), name = (p && p.name) || '';
        out[id] = { id, name, avatarUrl: (p && p.avatarUrl) || initialAvatar(name || '?', color), color, email: null, isMe: id === ME.id, guest: false };
      }
      return out;
    },
    search: async () => []
  };

  const SB = () => CFG.supabase || {};
  async function sbFetch(path, init){
    const token = await AUTH.currentUser.getIdToken();
    const r = await fetch(SB().url + '/storage/v1/' + path, { ...init, headers: { ...(init && init.headers || {}), Authorization: 'Bearer ' + token, apikey: SB().key } });
    if (!r.ok){
      let m = '', sc = ''; try { const j = await r.json(); m = j.message || j.error || ''; sc = String(j.statusCode || ''); } catch {}
      const code = r.status === 409 || sc === '409' || /already exists|Duplicate/i.test(m) ? 'already_exists'
        : r.status === 413 || sc === '413' ? 'too_large' : r.status === 403 || r.status === 401 || sc === '403' ? 'permission_denied' : 'upstream_error';
      throw err(code, m || ('Supabase ' + r.status));
    }
    return r;
  }
  async function putBlob(id, blob, type){
    await sbFetch(`object/${SB().bucket}/${id}`, { method: 'POST', body: blob, headers: { 'Content-Type': type, 'cache-control': '31536000', 'x-upsert': 'false' } });
  }
  const assets = {
    upload: async (blob, opts) => {
      const id = hex32(), type = blob.type || 'application/octet-stream';
      await putBlob(id, blob, type);
      return { id, url: '_blob/' + id, sizeBytes: blob.size, contentType: type };
    },
    delete: async id => { await sbFetch(`object/${SB().bucket}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [id] }) }); },
    list: async () => ({ assets: [], usage: {} })
  };

  /* Google Sheets with the person's own Google account (asked only when they turn on live sync) */
  const GT = { token: '', exp: 0 };
  try { const s = JSON.parse(sessionStorage.getItem('gsheets') || 'null'); if (s && s.exp > Date.now() + 60000) Object.assign(GT, s); } catch {}
  async function connectSheets(){
    if (!FB) await loadFirebase();
    const res = await FB.reauthenticateWithPopup(AUTH.currentUser, googleProvider(true));
    const cred = FB.GoogleAuthProvider.credentialFromResult(res);
    if (!cred || !cred.accessToken) throw err('consent_required', 'Google no dio permiso para tus hojas.');
    GT.token = cred.accessToken; GT.exp = Date.now() + 55 * 60000;
    try { sessionStorage.setItem('gsheets', JSON.stringify(GT)); } catch {}
    return true;
  }
  async function sheets(path, init){
    if (!GT.token || GT.exp < Date.now()) throw err('needs_reauth', 'Conecta tu cuenta de Google para sincronizar.');
    const r = await fetch('https://sheets.googleapis.com/v4/spreadsheets/' + path, { ...init, headers: { ...(init && init.headers || {}), Authorization: 'Bearer ' + GT.token, 'Content-Type': 'application/json' } });
    if (r.status === 401){ GT.token = ''; throw err('needs_reauth', 'Tu conexión con Google venció.'); }
    if (!r.ok){ let m = ''; try { m = JSON.stringify((await r.json()).error || {}); } catch {} throw err(r.status >= 500 ? 'server_unavailable' : 'tool_error', `${r.status} ${m}`, { retryable: r.status >= 500 }); }
    return r.json();
  }
  const enc = s => encodeURIComponent(s);
  const TOOLS = {
    get_spreadsheet: i => sheets(`${enc(i.spreadsheetId)}?fields=${enc('sheets.properties(sheetId,title,index)')}`),
    get_values: i => sheets(`${enc(i.spreadsheetId)}/values/${enc(i.range)}?valueRenderOption=FORMATTED_VALUE`),
    update_values: i => sheets(`${enc(i.spreadsheetId)}/values/${enc(i.range)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ range: i.range, majorDimension: 'ROWS', values: i.values }) }),
    update_formulas: i => sheets(`${enc(i.spreadsheetId)}/values/${enc(i.range)}?valueInputOption=USER_ENTERED`, { method: 'PUT', body: JSON.stringify({ range: i.range, majorDimension: 'ROWS', values: i.formulas }) })
  };
  async function callTool(server, tool, input){
    const f = TOOLS[tool]; if (!f) throw err('tool_not_found', tool);
    return { payload: await f(input || {}) };
  }
  function watchTool(server, tool, input, handler, opts){
    let stop = false, t = 0;
    const every = Math.max(10000, (opts && opts.refetchInterval) || 30000);
    const tick = async () => {
      if (stop) return;
      try { const result = await callTool(server, tool, input); if (!stop) handler({ type: 'data', result }); }
      catch (e){ if (!stop) handler({ type: 'error', error: e }); }
      if (!stop) t = setTimeout(tick, every);
    };
    tick();
    return () => { stop = true; clearTimeout(t); };
  }
  const mcp = { callTool, watchTool, server: async () => ({}) };

  /* ---------- window.claude ---------- */
  const NS = { db: () => db, user: () => user, assets: () => (SB().key ? assets : null), mcp: () => mcp };
  window.claude = Object.freeze({
    use(name){ const f = NS[name]; return f ? sessionP.then(f) : Promise.resolve(null); }
  });
  /* for the page's own buttons (sign out, connect Google Sheets) */
  window.APP_SITE = Object.freeze({
    standalone: true,
    signOut: async () => { await loadFirebase(); try { sessionStorage.removeItem('gsheets'); } catch {} await FB.signOut(AUTH); location.reload(); },
    connectSheets,
    sheetsReady: () => !!GT.token && GT.exp > Date.now(),
    email: () => ME && ME.email
  });

  /* ---------- import: one-time move of the board from claude.ai (open the site with #importar) ---------- */
  const SHARED = ['tickets','comments','links','events','meta','requests','messages','sheets','canvas','venns','ties','groups','notes','blocks','team'];
  const MB = n => (n / 1048576).toFixed(n < 10485760 ? 1 : 0) + ' MB';
  async function importer(){
    if (!document.body) await new Promise(r => document.addEventListener('DOMContentLoaded', r, { once: true }));
    showGate('loading'); const card = gate.querySelector('.gc'); card.replaceChildren();
    const el = (tag, props, ...kids) => { const e = Object.assign(document.createElement(tag), props || {}); e.append(...kids.filter(Boolean)); return e; };
    const title = el('h1', { textContent: 'Pasar notas de claude.ai' });
    const say = el('p'), list = el('div', { className: 'who' }), bar = el('progress', { max: 1, value: 0, hidden: true });
    bar.style.cssText = 'width:100%;height:8px;margin:4px 0 14px;accent-color:#3b82f6';
    const done = () => { history.replaceState(null, '', location.pathname + location.search); location.reload(); };
    const back = el('button', { type: 'button', className: 'alt', textContent: 'Ir al tablero', onclick: done });
    card.append(title, say, bar, list);
    if (!ME.owner){ say.textContent = 'Solo quien administra el tablero puede pasar las notas.'; card.append(back); return; }
    const file = el('input', { type: 'file', accept: '.klox', hidden: true });
    const pick = el('button', { type: 'button', textContent: 'Elegir archivo .klox', onclick: () => file.click() });
    say.textContent = 'Elige el archivo de migración (.klox). Trae notas, ventanas, eventos, hojas, canvas, post-its, imágenes y videos.';
    card.append(file, pick, back);
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      let head, base;
      try {
        const top = await f.slice(0, 17).text();
        if (!top.startsWith('KLOX1\n')) throw new Error('no es un archivo .klox');
        const n = parseInt(top.slice(6, 16), 10); head = JSON.parse(await f.slice(17, 17 + n).text()); base = 17 + n;
      } catch (e){ say.textContent = 'No pude leer ese archivo: ' + e.message; return; }
      if (head.owner !== ME.id){ say.textContent = 'Este archivo es de otra cuenta: sus datos personales son de ' + head.owner + ' y tu acceso usa ' + ME.id + '. Revisa el id en members/' + ME.email + '.'; return; }
      const NAMES = { notes: 'notas', blocks: 'pestañas', tickets: 'reportes', comments: 'comentarios', links: 'enlaces', events: 'eventos', meta: 'ajustes', requests: 'permisos', messages: 'mensajes', sheets: 'hojas', canvas: 'canvas', venns: 'diagramas de Venn', ties: 'hilos', groups: 'grupos', team: 'equipo' };
      const per = {}; head.docs.forEach(d => { const c = d.path.startsWith('data/users/') ? 'tus cosas personales' : NAMES[d.path.split('/')[0]] || d.path.split('/')[0]; per[c] = (per[c] || 0) + 1; });
      const bytes = head.assets.reduce((a, x) => a + x.size, 0);
      let existing = 0;
      try { existing = (await FB.getDocs(FB.collection(FS, 'notes'))).size; } catch {}
      say.textContent = `${head.docs.length} documentos y ${head.assets.length} archivos (${MB(bytes)}).` + (existing ? ` La web nueva ya tiene ${existing} nota${existing === 1 ? '' : 's'}: se quitan antes de pasar las de claude.ai.` : '');
      list.textContent = Object.entries(per).map(([k, v]) => `${k}: ${v}`).join(' · ');
      const go = el('button', { type: 'button', textContent: existing ? 'Reemplazar y pasar todo' : 'Pasar todo' });
      pick.replaceWith(go); back.hidden = true;
      go.onclick = async () => {
        go.disabled = true; bar.hidden = false; const steps = head.docs.length + bytes / 65536 + (existing ? 20 : 0) + head.members.length; let at = 0;
        const tick = (n, text) => { at += n; bar.value = Math.min(1, at / steps); if (text) say.textContent = text; };
        try {
          if (existing){
            tick(0, 'Quitando lo que había en la web nueva…');
            for (const c of [...SHARED, 'data/users/' + ME.id]){
              const s = await FB.getDocs(FB.collection(FS, c));
              for (let i = 0; i < s.docs.length; i += 400){ const b = FB.writeBatch(FS); s.docs.slice(i, i + 400).forEach(d => b.delete(d.ref)); await b.commit(); }
              tick(20 / 16);
            }
          }
          for (const m of head.members){
            const ref = FB.doc(FS, 'members', String(m.email).toLowerCase());
            if (!(await FB.getDoc(ref)).exists()) await FB.setDoc(ref, { id: m.id, owner: m.owner === true });
            tick(1, 'Dando acceso al equipo…');
          }
          for (let i = 0; i < head.docs.length; i += 400){
            const b = FB.writeBatch(FS), part = head.docs.slice(i, i + 400);
            part.forEach(d => b.set(FB.doc(FS, d.path), d.data)); await b.commit();
            tick(part.length, `Notas y datos: ${Math.min(i + 400, head.docs.length)} de ${head.docs.length}`);
          }
          let k = 0;
          for (const a of head.assets){
            k++; tick(0, `Imágenes y videos: ${k} de ${head.assets.length} (${MB(a.size)})`);
            const blob = f.slice(base + a.offset, base + a.offset + a.size, a.type);
            for (let t = 0; ; t++){
              try { await putBlob(a.id, blob, a.type); break; }
              catch (e){ if (e.code === 'already_exists') break; if (t >= 2 || e.code === 'permission_denied' || e.code === 'too_large') throw Object.assign(e, { file: a.id }); await new Promise(r => setTimeout(r, 1500 * (t + 1))); }
            }
            tick(a.size / 65536);
          }
          bar.value = 1; say.textContent = `Listo: pasaron ${head.docs.length} documentos y ${head.assets.length} archivos.`; list.textContent = '';
          go.replaceWith(el('button', { type: 'button', textContent: 'Abrir el tablero', onclick: done }));
        } catch (e){
          go.disabled = false; go.textContent = 'Reintentar';
          say.textContent = (e.file ? 'Se detuvo en el archivo ' + e.file + ': ' : 'Se detuvo: ') + (e.code === 'permission_denied' ? 'no hay permiso (revisa las reglas de ' + (e.file ? 'Supabase' : 'Firebase') + ').' : e.message || e.code);
        }
      };
    };
  }

  /* tests only: with ?emu=1 the page talks to local emulators, where a made-up Google account can sign in */
  if (EMU) window.__emuSignIn = async (email, name) => { await loadFirebase(); return FB.signInWithCredential(AUTH, FB.GoogleAuthProvider.credential(JSON.stringify({ sub: 'g-' + email, email, email_verified: true, name: name || email.split('@')[0] }))); };

  /* ---------- start ---------- */
  addEventListener('hashchange', () => { if (/^#importar\b/.test(location.hash) && ME) location.reload(); });
  showGate('loading');
  loadFirebase().then(fb => {
    let first = true;
    fb.onAuthStateChanged(AUTH, u => {
      if (u){ if (!ME) startSession(u); else if (u.uid !== ME.uid) location.reload(); }
      else { if (ME) { location.reload(); return; } showGate('signin'); }
      first = false;
    });
    fb.onIdTokenChanged(AUTH, () => { if (ME) sendToken(); });
  }, e => showGate('offline', e && e.message));
})();
