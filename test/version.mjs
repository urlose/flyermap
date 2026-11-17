// Build-label check. Usage: node test/version.mjs <built html> [more html files...]
// Every file must carry exactly one build label "vYYYY.MM.DD+abcdefg" whose hash is the built commit.
// Also checks the stamping function itself and, for the app, the service worker and the visible line.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampVersion, buildVersion, VERSION_RE } from '../worker/scripts/stamp-version.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = process.argv.slice(2);
if(!files.length) throw new Error('Usage: node test/version.mjs <built html> [more html files...]');

assert.match(buildVersion, VERSION_RE, 'label format: ' + buildVersion);
let head = process.env.GITHUB_SHA || '';
if(!head) try { head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd:root, encoding:'utf8' }).trim(); } catch {}
if(head) assert.equal(buildVersion.split('+')[1], head.slice(0, 7).toLowerCase(), 'label carries the built commit');
// the date belongs to the commit, so every build of one release shows the same label
try {
  const d = execFileSync('git', ['log', '-1', '--format=%cd', '--date=format-local:%Y.%m.%d'], { cwd:root, encoding:'utf8', env:{ ...process.env, TZ:'UTC' } }).trim();
  assert.equal(buildVersion.slice(1, 11), d, 'label date is the commit date (UTC)');
} catch(e) { if(e instanceof assert.AssertionError) throw e; }

for(const f of files){
  const html = readFileSync(f, 'utf8');
  const found = [...html.matchAll(/<div id="flyermap-build-version"[^>]*>([^<]*)<\/div>/g)];
  assert.equal(found.length, 1, f + ': exactly one build label, found ' + found.length);
  assert.equal(found[0][1], buildVersion, f + ': label is the current build');
  assert.equal((html.match(/id="flyermap-build-style"/g) || []).length, 1, f + ': one style block');
  assert.ok(html.indexOf('flyermap-build-version') < html.lastIndexOf('</body>'), f + ': label inside the page');
  const app = f.replaceAll('\\', '/').includes('/app/') || f.replaceAll('\\', '/').endsWith('www/index.html');
  if(app){
    assert.ok(html.includes('#flyermap-build-version{display:none}'), f + ': no floating label inside the app');
    const dir = dirname(f), sw = join(dir, 'sw.js');
    assert.ok(existsSync(sw), f + ': service worker next to the page');
    const swText = readFileSync(sw, 'utf8');
    assert.ok(/fetch\(r\.url,\s*\{\s*cache:\s*'no-store'/.test(swText), 'page is fetched without the browser cache');
    const appJs = (html.match(/src="(app\.js\?v=[0-9a-f]+)"/) || [])[1];
    assert.ok(appJs, f + ': app.js with a content hash');
    assert.ok(swText.includes(appJs), 'service worker caches exactly this app.js');
    const js = readFileSync(join(dir, 'app.js'), 'utf8');
    assert.ok(js.includes("updateViaCache"), 'service worker script itself is not taken from the browser cache');
    assert.ok(js.includes('flyermap-build-version') || execFileSync('grep', ['-rl', 'flyermap-build-version', dir], { encoding:'utf8' }).split('\n').some(x => x.endsWith('.js')),
      'the app shows the label under the legal links');
  }else{
    assert.ok(/#flyermap-build-version\{position:fixed/.test(html), f + ': visible label on the landing page');
  }
}

// the stamping function: adds once, never twice, refuses broken HTML
const dir = mkdtempSync(join(tmpdir(), 'fm-version-'));
const ok = join(dir, 'app', 'x.html'), bad = join(dir, 'bad.html');
execFileSync('mkdir', ['-p', join(dir, 'app')]);
writeFileSync(ok, '<!doctype html><html><head><title>x</title></head><body><main>x</main></body></html>');
stampVersion(ok); stampVersion(ok);
assert.equal((readFileSync(ok, 'utf8').match(/id="flyermap-build-version"/g) || []).length, 1, 'stamping twice keeps one label');
writeFileSync(bad, '<html><body>no head end');
assert.throws(() => stampVersion(bad), /invalid HTML/, 'broken HTML is refused, not silently skipped');
console.log('Build label ' + buildVersion + ' present once in ' + files.length + ' file(s); stamping, cache and in-app line checked');
