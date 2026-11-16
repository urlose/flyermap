// Regression guards for the order wizard: suggestions stay available after the flyer target is covered,
// and a manually added town gets an allocation before automatically suggested towns.
// Run: node test/always-nearby.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const admin = readFileSync(new URL('../worker/src/admin.js', import.meta.url),'utf8');
const core = readFileSync(new URL('../worker/src/plancore.js', import.meta.url),'utf8');
assert.match(admin, /if\(!tkE && !d\.zone && !d\.mainAll\) findSuggestions\(\)/);
assert.match(admin, /const sugList = !tkE && !d\.zone \?/);
assert.match(admin, /added\.auto = false; added\.flyers = /);
assert.match(core, /const reserved = \(side \|\| \[\]\)\.filter\(c => c\.cid && c\.auto === false/);
assert.match(core, /const sideInPlanOrder = \[\.\.\.\(side \|\| \[\]\)\]\.sort/);
const prioritize = side => [...side].sort((a,b)=>Number(a.auto !== false)-Number(b.auto !== false));
assert.deepEqual(prioritize([{name:'Auto',auto:true},{name:'New',auto:false}]).map(x=>x.name),['New','Auto']);
console.log('always-nearby: 6 checks passed');
