#!/usr/bin/env python3
"""Turns the claude.ai page (incidencias.html) into site/index.html for the team's own website.
usage: python3 standalone.py <incidencias.html> <site dir>"""
import sys, pathlib

src, site = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
s = src.read_text(encoding='utf-8')

def sub(old, new, count=1):
    global s
    n = s.count(old)
    assert n == count, f'expected {count}x, found {n}: {old[:90]!r}'
    s = s.replace(old, new)

# pictures and videos: relative, so the service worker of this folder serves them
sub("const blobUrl=id=>/^[0-9a-f]{32}$/.test(id||'')?'/_blob/'+id:'';",
    "const blobUrl=id=>/^[0-9a-f]{32}$/.test(id||'')?'_blob/'+id:'';")

sub("showNotice('Inicia sesión en claude.ai para ver y editar las notas del equipo.')",
    "showNotice('Entra con tu cuenta de Google para ver y editar las notas del equipo.')")

# Google Sheets: each person connects their own Google account from here
sub("const GS_PERM=['not_in_manifest','approval_required','consent_required'];",
    "const GS_PERM=['not_in_manifest','approval_required','consent_required','needs_reauth'];\n"
    "function gsConnErr(e){ const c=String(e?.code||''); if(/popup-closed|cancelled-popup/.test(c)) return 'No se conectó Google Sheets.'; if(/popup-blocked/.test(c)) return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes para este sitio.'; if(/user-mismatch/.test(c)) return 'Usa la misma cuenta de Google con la que entraste.'; return 'No se pudo conectar con Google: '+(e?.message||c); }")
sub("if(c==='needs_reauth') return 'Tu conexión con Google Sheets venció. Vuelve a conectarla en claude.ai, en Ajustes → Conectores.';",
    "if(c==='needs_reauth') return 'Falta conectar tu cuenta de Google para escribir en tus hojas. La conexión dura una hora; luego se vuelve a pedir con un click.';")
sub("  if(c==='tool_error') return 'Google Sheets no aceptó '",
    "  if(c==='tool_error'&&/SERVICE_DISABLED|has not been used|accessNotConfigured/.test(GS.err.msg)) return 'Falta activar la API de Google Sheets en el proyecto de Google Cloud de esta web.';\n  if(c==='tool_error') return 'Google Sheets no aceptó '")
sub("if(c==='selection_required') return 'Tienes más de una conexión de Google Sheets. Elige una en el aviso de claude.ai.';",
    "if(c==='selection_required') return 'Elige con qué cuenta de Google sincronizar.';")
sub("if(c==='not_granted'||c==='capability_disabled'||c==='capability_removed') return 'Desde aquí no se puede sincronizar con Google Sheets. Abre la página en claude.ai.';",
    "if(c==='not_granted'||c==='capability_disabled'||c==='capability_removed') return 'Desde aquí no se puede sincronizar con Google Sheets.';")
sub("chip('wait','En vivo (sin tu conexión)','Tus cambios llegan a Google Sheets cuando alguien con Google Sheets conectado abre esta hoja. Para mandarlos tú al momento, conecta Google Sheets en claude.ai, en Ajustes → Conectores.')",
    "chip('wait','En vivo (sin tu conexión)','Tus cambios llegan a Google Sheets cuando alguien con Google Sheets conectado abre esta hoja.')")
sub("    toast(GS.mcp?'Listo. Si claude.ai te pide permiso para usar Google Sheets, acéptalo.':'Listo. Para que tus cambios lleguen al momento, conecta Google Sheets en claude.ai, en Ajustes → Conectores.'); }},'Sincronizar');",
    "    if(window.APP_SITE?.standalone&&!APP_SITE.sheetsReady()) APP_SITE.connectSheets().then(()=>{ if(GS.bid===b.id) gsRetry(b); },e=>toast(gsConnErr(e)));\n"
    "    toast('Listo. Si Google te pide permiso para tus hojas, acéptalo.'); }},'Sincronizar');")
sub("function gsRetry(b){\n",
    "function gsRetry(b){\n"
    "  if(window.APP_SITE?.standalone&&!APP_SITE.sheetsReady()){ APP_SITE.connectSheets().then(()=>gsRetry(b),e=>toast(gsConnErr(e))); return; }\n")

# Personalizar: who is signed in, and sign out
sub("      h('div',{class:'field'},h('label',{class:'lbl',for:'c_alias',text:'Tu apodo en el equipo'}),alias));",
    "      h('div',{class:'field'},h('label',{class:'lbl',for:'c_alias',text:'Tu apodo en el equipo'}),alias),\n"
    "      window.APP_SITE?.standalone?h('div',{class:'block-sec'},h('span',{class:'lbl',text:'Tu cuenta'}),h('p',{class:'hint',text:'Entraste como '+(APP_SITE.email()||'')}),\n"
    "        h('button',{class:'btn',type:'button',style:'align-self:flex-start',onclick:()=>APP_SITE.signOut(),text:'Cerrar sesión'})):null);")

assert '/_blob/' not in s
head = ('<!doctype html><html lang="es"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
        '<meta name="theme-color" content="#2b3a4a">'
        '<link rel="icon" href="web/icon.svg" type="image/svg+xml">'
        '<link rel="apple-touch-icon" href="web/icon-192.png">'
        '<link rel="manifest" href="manifest.webmanifest">'
        '<style>html,body{margin:0;padding:0}</style>'
        '<script src="web/config.js"></script><script src="web/shim.js"></script>'
        '</head><body>')
out = head + s + '</body></html>\n'
(site / 'index.html').write_text(out, encoding='utf-8')
print('index.html', len(out.encode()), 'bytes')
