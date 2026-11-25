#!/usr/bin/env python3
"""Packs the claude.ai export (export/<collection>/<id>.json + export/assets/<id>.<ext>) into one file
the site's import screen reads. usage: pack.py <export dir> <owner id> <out file> [email=id ...]"""
import sys, json, pathlib, mimetypes, time, secrets, string
exp, owner, out = pathlib.Path(sys.argv[1]), sys.argv[2], pathlib.Path(sys.argv[3])
members = []
for a in sys.argv[4:]:
    email, _, mid = a.partition('=')
    members.append({'email': email.lower(), 'id': mid or 'u_' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(22)), 'owner': False})
docs = []
for f in sorted(exp.rglob('*.json')):
    rel = f.relative_to(exp)
    if rel.parts[0] == 'assets': continue
    parts = list(rel.parts); parts[-1] = parts[-1][:-5]
    if parts[:3] == ['data', 'users', 'me']: parts[2] = owner
    docs.append({'path': '/'.join(parts), 'data': json.loads(f.read_text())})
blobs, assets, off = [], [], 0
for f in sorted((exp / 'assets').iterdir()):
    b = f.read_bytes(); typ = mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
    assets.append({'id': f.stem, 'type': typ, 'offset': off, 'size': len(b)}); blobs.append(b); off += len(b)
head = json.dumps({'v': 1, 'from': 'claude.ai', 'at': int(time.time() * 1000), 'owner': owner, 'members': members, 'docs': docs, 'assets': assets}, ensure_ascii=False).encode()
with out.open('wb') as o:
    o.write(b'KLOX1\n' + str(len(head)).zfill(10).encode() + b'\n' + head)
    for b in blobs: o.write(b)
print(out, out.stat().st_size, 'bytes;', len(docs), 'docs;', len(assets), 'files;', members)
