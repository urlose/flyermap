// Web Worker entry: runs the route planner off the main thread. Messages:
//   in : { type:'run', job, op:'load'|'plan', args } · { type:'answer', id, result }   (answers to cache requests)
//   out: { type:'stage', job, stage } · { type:'done', job, result } · { type:'error', job, message } · { type:'ask', id, op, payload }
import { createPlanService } from './plancore.js';

let seq = 0, latest = 0;
const waiting = new Map();
const ask = (op, payload) => new Promise(resolve => { const id = ++seq; waiting.set(id, resolve); postMessage({ type:'ask', id, op, payload }); });
// the shared map cache lives behind the admin's login on the main thread
const cache = {
  async get(queries){ const r = await ask('cacheGet', queries); if(!r) throw new Error('cache'); return r; },
  async put(items){ if(items.some(i => JSON.stringify(i.payload).length > 5e6)) return; await ask('cachePut', items); },   // too big for the cache: skip
};
const svc = createPlanService(cache);
let queue = Promise.resolve();

self.onmessage = e => {
  const m = e.data || {};
  if(m.type === 'answer'){ const r = waiting.get(m.id); waiting.delete(m.id); if(r) r(m.result); return; }
  if(m.type !== 'run') return;
  latest = Math.max(latest, m.job);
  // one job at a time (they share the street graph); a job that was overtaken by a newer one is skipped
  queue = queue.then(async () => {
    await new Promise(r => setTimeout(r, 15));   // let messages that are already waiting arrive first (quick taps → only the last one is planned)
    const stale = () => m.job < latest;
    if(stale()){ postMessage({ type:'done', job:m.job, result:{ skipped:true } }); return; }
    try{
      const stage = s => postMessage({ type:'stage', job:m.job, stage:s });
      const result = await svc[m.op](m.args, stage, stale);
      postMessage({ type:'done', job:m.job, result });
    }catch(err){ postMessage({ type:'error', job:m.job, message:(err && err.message) || String(err) }); }
  });
};
