// Shared build stamp for the web landing page, PWA and packaged mobile app.
// GITHUB_SHA is set in Actions; local builds fall back to the checked-out commit.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

function commitHash() {
  const sha = process.env.GITHUB_SHA || (() => {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
    catch { return ''; }
  })();
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7).toLowerCase() : 'local';
}

// The date is the COMMIT date (UTC), not the build date: the website, the APK and the iPhone build of one
// release show the same label even when they are built on different days. Without git: today's date.
function releaseDate() {
  try {
    const d = execFileSync('git', ['log', '-1', '--format=%cd', '--date=format-local:%Y.%m.%d'],
      { encoding: 'utf8', env: { ...process.env, TZ: 'UTC' }, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (/^\d{4}\.\d{2}\.\d{2}$/.test(d)) return d;
  } catch {}
  return new Date().toISOString().slice(0, 10).replaceAll('-', '.');
}

export const VERSION_RE = /^v\d{4}\.\d{2}\.\d{2}\+(?:[0-9a-f]{7}|local)$/;
export const buildVersion = `v${releaseDate()}+${commitHash()}`;

export function stampVersion(path, { landing = false } = {}) {
  const html = readFileSync(path, 'utf8');
  if (html.includes('id="flyermap-build-version"')) return;
  if (!html.includes('</head>') || !html.includes('</body>')) {
    throw new Error(`Cannot stamp version: invalid HTML in ${path}`);
  }
  // Landing page: small label bottom right. Inside the app a floating label always lies on something:
  // on phones on the round "+" button and on bottom sheets, on wide screens on the map's
  // OpenStreetMap attribution. So in the app the element stays in the page (hidden) as the single
  // source of the build label, and the app shows it as a line under the legal links
  // (login, settings, profile) - see buildLine() in src/legalview.js.
  const style = landing
    ? `<style id="flyermap-build-style">
#flyermap-build-version{position:fixed;right:8px;bottom:calc(10px + env(safe-area-inset-bottom, 0px));z-index:1800;pointer-events:none;
padding:3px 6px;border-radius:6px;background:rgba(20,25,35,.70);color:#fff;
font:500 10px/1.3 system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;opacity:.72}
</style>`
    : `<style id="flyermap-build-style">#flyermap-build-version{display:none}</style>`;
  const badge = `<div id="flyermap-build-version" aria-label="FlyerMap build ${buildVersion}">${buildVersion}</div>`;
  writeFileSync(path, html.replace('</head>', `${style}\n</head>`).replace('</body>', `${badge}\n</body>`));
  console.log(`Version ${buildVersion} stamped into ${path}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/stamp-version.mjs')) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error('Usage: node stamp-version.mjs <html-path> [other-html-paths...]');
  for (const path of paths) stampVersion(path, { landing: !path.replaceAll('\\', '/').includes('/app/') });
}
