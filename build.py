"""Reconstruct the checked static release without network access or dependencies."""
import base64,hashlib,io,json,zipfile,os,re
from pathlib import Path
root=Path(__file__).resolve().parent
manifest=json.loads((root/'release-manifest.json').read_text())
parts=sorted((root/'release').glob('site-*.b64'))
assert len(parts)==manifest['parts'], 'Release part count mismatch'
data=base64.b64decode(''.join(p.read_text() for p in parts),validate=True)
assert len(data)==manifest['bytes'] and hashlib.sha256(data).hexdigest()==manifest['sha256'], 'Release integrity check failed'
out=root/'public';out.mkdir(exist_ok=True)
with zipfile.ZipFile(io.BytesIO(data)) as archive:
    for entry in archive.infolist():
        target=(out/entry.filename).resolve()
        assert target.is_relative_to(out.resolve()) and not entry.is_dir(), 'Invalid release path'
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_bytes(archive.read(entry))
print('Verified static release:',len(parts),'parts')

# Reader-facing form changes are maintained separately from the large game-data release.
app_path=out/'app.js'
app=app_path.read_text(encoding='utf-8')
start=app.index('function publicSuggest(')
end=app.index('function publicRoute(',start)
app=app[:start]+(root/'overrides/public-suggest.js').read_text(encoding='utf-8-sig')+app[end:]
app_path.write_text(app,encoding='utf-8')
style=out/'style.css'
style.write_text(style.read_text(encoding='utf-8')+'\n'+(root/'overrides/suggest.css').read_text(encoding='utf-8-sig'),encoding='utf-8')
html=out/'index.html'
html.write_text(html.read_text(encoding='utf-8').replace("connect-src 'none'",'connect-src https://ijmztvsjdzypvxnlicbf.supabase.co'),encoding='utf-8')
feedback=json.loads((root/'feedback-config.json').read_text(encoding='utf-8-sig'))
assert re.fullmatch(r'https://ijmztvsjdzypvxnlicbf\.supabase\.co/functions/v1/submit-feedback',feedback['suggestionEndpoint']), 'Invalid public form endpoint'
config={'issueRepository':os.environ.get('GITHUB_REPOSITORY','melvor2wiki/melvor2wiki.github.io'),**feedback}
(out/'config.js').write_text('window.WIKI_CONFIG = '+json.dumps(config)+';\n',encoding='utf-8')
print('Anonymous suggestion form configured; no email address or private key embedded')

# Refresh only changed browser files after a deployment; keep the large data cache.
html=out/'index.html'
markup=html.read_text(encoding='utf-8')
for filename in ['app.js','config.js','style.css']:
    version=hashlib.sha256((out/filename).read_bytes()).hexdigest()[:12]
    markup=markup.replace('"'+filename+'"','"'+filename+'?v='+version+'"')
html.write_text(markup,encoding='utf-8')
