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

const buildDate = new Date().toISOString().slice(0, 10).replaceAll('-', '.');
export const buildVersion = `v${buildDate}+${commitHash()}`;

export function stampVersion(path, { landing = false } = {}) {
  const html = readFileSync(path, 'utf8');
  if (html.includes('id="flyermap-build-version"')) return;
  if (!html.includes('</head>') || !html.includes('</body>')) {
    throw new Error(`Cannot stamp version: invalid HTML in ${path}`);
  }
  const placement = landing
    ? 'bottom:calc(10px + env(safe-area-inset-bottom, 0px))'
    : 'bottom:calc(78px + env(safe-area-inset-bottom, 0px))';
  const style = `<style id="flyermap-build-style">
#flyermap-build-version{position:fixed;right:8px;${placement};z-index:1800;pointer-events:none;
padding:3px 6px;border-radius:6px;background:rgba(20,25,35,.70);color:#fff;
font:500 10px/1.3 system-ui,sans-serif;letter-spacing:.01em;white-space:nowrap;opacity:.72}
</style>`;
  const badge = `<div id="flyermap-build-version" aria-label="FlyerMap build ${buildVersion}">${buildVersion}</div>`;
  writeFileSync(path, html.replace('</head>', `${style}\n</head>`).replace('</body>', `${badge}\n</body>`));
  console.log(`Version ${buildVersion} stamped into ${path}`);
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('/stamp-version.mjs')) {
  const paths = process.argv.slice(2);
  if (!paths.length) throw new Error('Usage: node stamp-version.mjs <html-path> [other-html-paths...]');
  for (const path of paths) stampVersion(path, { landing: !path.replaceAll('\\', '/').includes('/app/') });
}
