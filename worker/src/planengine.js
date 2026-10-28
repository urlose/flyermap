// Main-thread side of the route planner: sends jobs to the Web Worker and answers its cache requests.
// If a Web Worker cannot be started (old WebView), the same service runs on the main thread.
/* global __PLANWORKER__ */
import { createPlanService } from './plancore.js';

export function makePlanEngine(cache, allowWorker = true){
  let worker = null, job = 0, local = null;
  const jobs = new Map();   // job -> { resolve, reject, onStage }
  const useLocal = () => { if(!local) local = createPlanService(cache); return local; };
  try{
    const code = typeof __PLANWORKER__ === 'string' ? __PLANWORKER__ : null;
    if(allowWorker && code && typeof Worker !== 'undefined'){
      worker = new Worker(URL.createObjectURL(new Blob([code], { type:'text/javascript' })));
      worker.onmessage = async e => {
        const m = e.data || {};
        if(m.type === 'ask'){
          let result = null;
          try{ result = m.op === 'cacheGet' ? await cache.get(m.payload) : (await (cache.putChecked || cache.put)(m.payload), true); }catch{ result = null; }
          worker.postMessage({ type:'answer', id:m.id, result }); return;
        }
        const j = jobs.get(m.job); if(!j) return;
        if(m.type === 'stage'){ j.onStage && j.onStage(m.stage); return; }
        jobs.delete(m.job);
        if(m.type === 'done') j.resolve(m.result); else j.reject(new Error(m.message));
      };
      // the worker itself broke (not a planning error): finish the open jobs on the main thread
      worker.onerror = e => {
        e.preventDefault && e.preventDefault();
        const open = [...jobs.entries()]; jobs.clear(); try{ worker.terminate(); }catch{} worker = null;
        for(const [, j] of open) j.retry();
      };
    }
  }catch{ worker = null; }

  // runs op ('load' | 'plan'); a newer call makes older ones resolve with { skipped:true } as soon as possible
  function run(op, args, onStage){
    const my = ++job;
    return new Promise((resolve, reject) => {
      const inLocal = () => {
        const stale = () => my < job;
        setTimeout(() => useLocal()[op](args, s => onStage && onStage(s), stale).then(resolve, reject), 30);   // let the "calculating…" text paint first
      };
      if(!worker) return inLocal();
      jobs.set(my, { resolve, reject, onStage, retry:inLocal });
      worker.postMessage({ type:'run', job:my, op, args });
    });
  }
  return { run, get inWorker(){ return !!worker; } };
}
