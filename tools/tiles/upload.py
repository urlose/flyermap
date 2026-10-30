#!/usr/bin/env python3
"""Uploads the squares from build.py to the storage bucket "tiles" through the edge function tiles-upload.
Runs only inside the GitHub workflow tiles.yml: it authenticates with the workflow's GitHub OIDC token (no stored secret).
  python3 upload.py <dir>"""
import base64, json, os, sys, time, urllib.request
from concurrent.futures import ThreadPoolExecutor

URL = 'https://xobrvfkwqessbkdwiavu.supabase.co/functions/v1/tiles-upload'
_tok = [None, 0]

def token():
    if _tok[0] and time.time() - _tok[1] < 120: return _tok[0]
    req = urllib.request.Request(os.environ['ACTIONS_ID_TOKEN_REQUEST_URL'] + '&audience=flyermap-tiles', headers={'Authorization': 'Bearer ' + os.environ['ACTIONS_ID_TOKEN_REQUEST_TOKEN']})
    _tok[0] = json.load(urllib.request.urlopen(req, timeout=30))['value']; _tok[1] = time.time()
    return _tok[0]

def send(batch, d):
    """uploads the files; on a partial failure only the failed ones are sent again"""
    todo = list(batch)
    for attempt in range(8):
        body = json.dumps({'files': [{'path': f, 'b64': base64.b64encode(open(os.path.join(d, f), 'rb').read()).decode()} for f in todo]}).encode()
        try:
            req = urllib.request.Request(URL, data=body, method='POST', headers={'Authorization': 'Bearer ' + token(), 'Content-Type': 'application/json'})
            r = json.load(urllib.request.urlopen(req, timeout=180))
            if r.get('ok'): return len(batch)
            todo = [f for f in todo if f in set(r.get('failed') or todo)]
            print('partial', len(todo), r.get('errors'), flush=True)
        except Exception as e:
            msg = e.read().decode()[:300] if hasattr(e, 'read') else str(e)
            print('retry', attempt, msg, flush=True)
            if 'forbidden' in msg: raise
        time.sleep(4 * (attempt + 1))
    print('::error::upload failed for %d files, e.g. %s' % (len(todo), todo[0]))
    raise RuntimeError('upload failed: ' + todo[0])

def main():
    d = sys.argv[1]
    files = sorted(f for f in os.listdir(d) if f.endswith('.json.gz'))
    batches, cur, size = [], [], 0
    for f in files:
        s = os.path.getsize(os.path.join(d, f))
        if cur and (size + s > 1_000_000 or len(cur) >= 60): batches.append(cur); cur, size = [], 0
        cur.append(f); size += s
    if cur: batches.append(cur)
    done, t0 = 0, time.time()
    with ThreadPoolExecutor(3) as ex:
        for n in ex.map(lambda b: send(b, d), batches):
            done += n
            if done % 2000 < n: print('uploaded %d/%d · %d s' % (done, len(files), time.time() - t0), flush=True)
    if os.path.exists(os.path.join(d, 'meta.json')): send(['meta.json'], d)   # last: marks the set as complete
    print('::notice::uploaded %d squares in %d s' % (done, time.time() - t0))

if __name__ == '__main__': main()
