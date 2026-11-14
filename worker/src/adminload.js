// The admin part of the app (admin screens, statistics, route planner) is its own file: distributors never download it.
// loadAdmin() fetches it once, on the first admin screen. Hooks are set by app.js before that and handed over on load.
export const adminHooks = {};
let p = null;
export function loadAdmin(){
  if(!p) p = import('./admin.js').then(m => { Object.assign(m.A.hooks, adminHooks); return m; }, e => { p = null; throw e; });
  return p;
}
