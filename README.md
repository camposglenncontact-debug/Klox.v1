# Reporte de Incidencias

Tablero del equipo para reportar y seguir bugs: notas flotantes, tableros, calendario, canvas, hojas, métricas y burbujas. Es la misma página que vivía en claude.ai, pero con su propio inicio de sesión.

Web: https://camposglenncontact-debug.github.io/Klox.v1/

## Cómo funciona

| Qué | Dónde vive |
|---|---|
| Inicio de sesión | Google, con Firebase Authentication (proyecto `klox-3e982`) |
| Notas, eventos, hojas, canvas, hilos… | Firestore |
| Imágenes y videos | Supabase Storage, bucket privado `archivos` |
| Sincronizar con Google Sheets | La API de Google Sheets, con la cuenta de Google de cada persona |

- `web/shim.js` le da a la página las mismas funciones que tenía en claude.ai (`db`, `user`, `assets`, `mcp`), pero hechas con Firebase, Supabase y Google.
- `sw.js` sirve las imágenes (`_blob/<id>`) desde el bucket privado, con la sesión de quien está viendo.
- `web/config.js` solo dice a qué proyectos conectarse. No tiene nada secreto: quién ve qué lo deciden las reglas de Firestore y las políticas de Supabase.

## Quién puede entrar

Cada persona del equipo necesita dos cosas:

1. **Firestore** → colección `members` → un documento cuyo ID es su correo de Google, con:
   - `id` (string): su id en las notas. Para alguien nuevo, `u_` y 22 letras o números al azar.
   - `owner` (boolean): `true` solo para quien administra.
2. **Supabase** → SQL Editor: `insert into public.equipo (correo) values ('correo@gmail.com');`

Las reglas de Firestore están en `firestore.rules` (se pegan en Firestore → Reglas). Las políticas de Supabase no van en este repositorio porque llevan los correos del equipo.

## Pasar las notas de claude.ai

Abre la web con `#importar` al final (`…/Klox.v1/#importar`), elige el archivo `.klox` y dale a "Pasar todo". Solo quien tiene `owner: true` lo puede usar.

## Actualizar la web

La página se sigue haciendo en claude.ai. Para pasar una versión nueva:

```sh
python3 tools/standalone.py incidencias.html .   # incidencias.html = el HTML de la página en claude.ai
```

`web/fb.js` es Firebase empaquetado en un archivo (para no depender de otro sitio). Para rehacerlo: `cd tools && npm install && npm run build:fb`.

## Pruebas locales

Usan los emuladores de Firebase y un Supabase de mentira, así que no tocan los datos reales.

```sh
cd tools && npm install && npm run emulators   # en otra terminal
node tests/serve.js                            # en otra terminal
node tests/e2e.js
KLOX_FILE=archivo.klox KLOX_OWNER=<id dueño del archivo> node tests/imp.js
```
