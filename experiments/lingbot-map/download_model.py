"""Download and verify the public, pinned checkpoint; resume interrupted transfers."""
import hashlib
import json
from pathlib import Path
import sys
import urllib.request

REPOSITORY='robbyant/lingbot-map'
REVISION='204754b'
NAME='lingbot-map.pt'

def download(target):
    with urllib.request.urlopen(f'https://huggingface.co/api/models/{REPOSITORY}/revision/{REVISION}?blobs=true',timeout=60) as response:
        metadata=json.load(response)
    entry=next(item for item in metadata['siblings'] if item['rfilename']==NAME)
    expected_size=entry['lfs']['size'];expected_hash=entry['lfs']['sha256']
    target=Path(target);target.parent.mkdir(parents=True,exist_ok=True)
    offset=target.stat().st_size if target.exists() else 0
    if offset>expected_size: raise RuntimeError('Existing checkpoint is larger than the pinned model.')
    if offset<expected_size:
        request=urllib.request.Request(f'https://huggingface.co/{REPOSITORY}/resolve/{REVISION}/{NAME}',headers={'Range':f'bytes={offset}-'})
        with urllib.request.urlopen(request,timeout=180) as response:
            resumed=response.status==206 and response.headers.get('Content-Range','').startswith(f'bytes {offset}-')
            if response.status==206 and not resumed: raise RuntimeError('Unexpected checkpoint byte range.')
            if not resumed: offset=0
            with target.open('ab' if resumed else 'wb') as output:
                last_report=offset//(128*1024*1024)
                while chunk:=response.read(4*1024*1024):
                    output.write(chunk);offset+=len(chunk)
                    if offset//(128*1024*1024)>last_report:
                        last_report=offset//(128*1024*1024)
                        print(f'Checkpoint download {offset/expected_size:.0%}',flush=True)
    if target.stat().st_size!=expected_size: raise RuntimeError('Checkpoint download is incomplete; rerun to resume.')
    digest=hashlib.sha256()
    with target.open('rb') as source:
        while chunk:=source.read(8*1024*1024): digest.update(chunk)
    if digest.hexdigest()!=expected_hash: raise RuntimeError('Checkpoint checksum differs from the pinned model; do not use this file.')
    print(f'Pinned checkpoint verified ({expected_size:,} bytes; SHA-256 {expected_hash}).')

if __name__=='__main__': download(sys.argv[1])
