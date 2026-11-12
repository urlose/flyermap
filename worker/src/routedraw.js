// The planned route on the walker's maps, tidy: every street once, in colours that say what is left
// (green done · blue still to do today · orange left behind · pale other days), the checkpoints in their order
// (the next one big), and the route of one checkpoint on a tap.
import L from 'leaflet';
import { t } from './i18n.js';
import { esc, css, fmtDist, hav } from './core.js';
import { routePieces, checkpoints } from './nav.js';

export const ROUTE_C = { today:'#2563EB', missed:'#EA580C', later:'#64748B', cp:'#7C3AED' };
const GREEN = () => css('--color-map-route-completed') || '#16A34A';

// group: a layer group that is cleared and filled; cur: the working day; dim: the next steps are drawn bright on top (guidance)
export function drawPieces(group, plan, tracker, cur, dim){
  group.clearLayers();
  const p = routePieces(plan, tracker, cur), base = { lineJoin:'round', lineCap:'round', interactive:false, smoothFactor:1.2 };
  const line = (pts, o) => L.polyline(pts, { ...base, ...o }).addTo(group);
  p.later.forEach(x => line(x, { color:ROUTE_C.later, weight:3, opacity:.5 }));
  // a white edge under the coloured lines: they stay readable on every map background and where they meet
  [...p.done, ...p.today, ...p.missed].forEach(x => line(x, { color:'#fff', weight:dim ? 7 : 8, opacity:.85 }));
  p.done.forEach(x => line(x, { color:GREEN(), weight:dim ? 4 : 5, opacity:1 }));
  p.today.forEach(x => line(x, { color:ROUTE_C.today, weight:dim ? 4 : 5, opacity:1 }));
  p.missed.forEach(x => line(x, { color:ROUTE_C.missed, weight:dim ? 5 : 6, opacity:1 }));
  return p;
}

// what the colours mean – shown under the map (and behind the "?" button while walking)
export function legendHtml(p, hasDays){
  const row = (k, show) => show ? `<span><i class="rl rl-${k}"></i>${esc(t('lg_' + k))}</span>` : '';
  return `<div class="rt-legend">${row('today', true)}${row('done', true)}${row('missed', true)}${row('later', hasDays)}${row('cp', true)}</div>`;
}

// small arrows along a line (direction of walking), one every `every` metres
export function arrowsAlong(group, pts, every, color, placed){
  let acc = every / 2; placed = placed || [];   // a street walked up and down gets its arrows once (the way there)
  for(let i = 1; i < pts.length; i++){
    const a = pts[i - 1], b = pts[i], d = hav(a[0], a[1], b[0], b[1]); if(d < 1) continue;
    const deg = Math.atan2((b[1] - a[1]) * Math.cos(a[0] * Math.PI / 180), b[0] - a[0]) * 180 / Math.PI;
    while(acc <= d){
      const f = acc / d, at = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
      if(placed.some(q => hav(q[0], q[1], at[0], at[1]) < 25)){ acc += every; continue; }
      placed.push(at);
      L.marker(at, { interactive:false, keyboard:false, zIndexOffset:300,
        icon:L.divIcon({ className:'', iconSize:[16, 16], iconAnchor:[8, 8], html:`<div class="rt-arrow" style="transform:rotate(${Math.round(deg)}deg);--c:${esc(color)}"><svg viewBox="0 0 16 16"><path d="M8 2.5 13 12 8 9.6 3 12z"/></svg></div>` }) }).addTo(group);
      acc += every;
    }
    acc -= d;
  }
}

// Checkpoints of the working day in their order: done ones small with a tick, the next one big, the ones after it small.
// A tap shows the whole route of that checkpoint. state: remembers what is drawn, so the markers are only rebuilt when
// something changed (a marker that is replaced under the finger would swallow the tap).
export function drawCps(group, plan, tracker, cur, onTap, state){
  const cps = checkpoints(plan, i => tracker.isDone(i)).filter(c => c.day === (cur || 0)), next = cps.find(c => !c.done);
  const sig = cps.map(c => c.done ? 1 : 0).join('') + '|' + (cur || 0);
  if(state) state.cps = cps;   // a tap shows the numbers of now, also when the markers are older
  if(state && state.sig === sig) return { cps, next };
  if(state) state.sig = sig;
  group.clearLayers();
  cps.forEach(c => {
    const kind = c.done ? 'ok' : c === next ? 'next' : 'wait', size = kind === 'next' ? 36 : kind === 'ok' ? 20 : 24;
    L.marker(c.at, { keyboard:false, zIndexOffset:kind === 'next' ? 800 : kind === 'wait' ? 500 : 400, title:t('cpName', { n:c.n, k:cps.length }),
      icon:L.divIcon({ className:'', iconSize:[size, size], iconAnchor:[size / 2, size / 2], html:`<div class="wcp ${kind}">${c.done ? '✓' : c.n}</div>` }) })
      .on('click', () => { const now = (state && state.cps) || cps; onTap && onTap(now.find(x => x.n === c.n) || c, now.length); }).addTo(group);
  });
  return { cps, next };
}

// the route of one checkpoint: its streets thick with arrows, the map moves there, a small window says how much is done
export function showCp(m, layer, c, total, isNext){
  layer.clearLayers();
  let len = 0; const b = L.latLngBounds([]), placed = [];
  c.runs.forEach(r => {
    L.polyline(r, { color:'#fff', weight:12, opacity:.9, lineJoin:'round', lineCap:'round', interactive:false }).addTo(layer);
    L.polyline(r, { color:ROUTE_C.cp, weight:7, opacity:.95, lineJoin:'round', lineCap:'round', interactive:false }).addTo(layer);
    arrowsAlong(layer, r, 90, '#fff', placed);
    for(let i = 1; i < r.length; i++) len += hav(r[i - 1][0], r[i - 1][1], r[i][0], r[i][1]); r.forEach(q => b.extend(q));
  });
  const pop = L.popup({ className:'cp-pop', autoPan:false, closeButton:true, offset:[0, -12] }).setLatLng(c.at)
    .setContent(`<b>${esc(t('cpName', { n:c.n, k:total }))}</b><br>${esc(t(c.done ? 'cpInfoDone' : 'cpInfo', { p:c.pct, d:fmtDist(len) }))}${isNext ? '<br>' + esc(t('cpIsNext')) : ''}`);
  pop.on('remove', () => layer.clearLayers());
  if(b.isValid()) try{ m.fitBounds(b, { paddingTopLeft:[40, 96], paddingBottomRight:[40, 40], maxZoom:18 }); }catch{}
  pop.openOn(m);
}
