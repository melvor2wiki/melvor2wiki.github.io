"""Reconstruct the checked static release without network access or dependencies."""
import base64,hashlib,io,json,zipfile
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
