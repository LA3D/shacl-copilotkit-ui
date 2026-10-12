#!/usr/bin/env python3
"""Download immutable public sources and verify bytes before extraction (Python 3.12+)."""
import hashlib
from pathlib import Path
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'node-experiment'
PINS = [
    ('shacl-engine', 'rdf-ext/shacl-engine', '1d111fc772a71ec2118eed2974709c2b04f47510', '87e36b7a30ac6aa396c87e170b41bfe649a29baf9db022194231683013c61c53'),
    ('data-shapes', 'w3c/data-shapes', '4f88f8c5398a87f7957260593f1f0742b5924a65', 'd34a3f28c04733b3753778cde3780e0cb75d3daccdfb4ad5d54f4d451c4119fa'),
]
for name, repo, commit, expected in PINS:
    archive = ROOT / 'sources' / (name + '.tar.gz')
    archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        url = f'https://codeload.github.com/{repo}/tar.gz/{commit}'
        with urllib.request.urlopen(url, timeout=60) as response:
            payload = response.read()
        if hashlib.sha256(payload).hexdigest() != expected:
            raise SystemExit(f'Hash mismatch: {name}')
        archive.write_bytes(payload)
    if hashlib.sha256(archive.read_bytes()).hexdigest() != expected:
        raise SystemExit(f'Hash mismatch: {archive}; remove it and retry')
    target = ROOT / 'upstream'
    target.mkdir(exist_ok=True)
    if not (target / f'{name}-{commit}').exists():
        with tarfile.open(archive) as source:
            source.extractall(target, filter='data')
    print(f'Verified {name}@{commit}')
