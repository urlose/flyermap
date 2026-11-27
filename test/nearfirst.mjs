import assert from 'node:assert/strict';
import { outwardStreetOrder } from '../worker/src/nearfirst.js';

// Four streets: the nearest residential street has few boxes; distant one
// is much denser. Distance must dominate density.
const pts = [[50,8],[50,8.001],[50,8.002],[50,8.003],[50,8.004],[51,9],[51,9.001]];
const edges = [
  {a:0,b:1,len:100,mb:2},
  {a:1,b:2,len:100,mb:100},
  {a:2,b:3,len:100,mb:20},
  {a:3,b:4,len:100,mb:5},
  {a:5,b:6,len:100,mb:50}
];
const adj=pts.map(()=>[]);
edges.forEach((e,i)=>{adj[e.a].push({e:i,to:e.b});adj[e.b].push({e:i,to:e.a});});
const plan=outwardStreetOrder({pts,edges,adj},pts[0]);
assert.equal(plan.root,0);
assert.deepEqual(plan.streets.map(x=>x.i),[0,1,2,3]);
assert.deepEqual(plan.unreachable,[4]);
assert.equal(plan.streets[0].mailboxes,2);
assert.deepEqual(outwardStreetOrder({pts:[],edges:[],adj:[]},pts[0]).streets,[]);
const spurEdges=[{a:0,b:1,len:900,mb:1},{a:1,b:2,len:100,mb:12}];
const spurAdj=[ [{e:0,to:1}], [{e:0,to:0},{e:1,to:2}], [{e:1,to:1}] ];
const spur=outwardStreetOrder({pts:pts.slice(0,3),edges:spurEdges,adj:spurAdj},pts[0]);
assert.deepEqual(spur.skipped,[0]);
assert.deepEqual(spur.streets.map(x=>x.i),[1]);

// Empty land (27.11.2026): a near long field road with one farm comes AFTER a dense street further away; nothing is lost.
{
  const P=[[50,8],[50,8.001],[50,8.01],[50,8.02],[50,8.021]];
  const E=[{a:0,b:1,len:100,mb:30},{a:1,b:2,len:700,mb:1},{a:1,b:3,len:1400,mb:0},{a:3,b:4,len:100,mb:40}];
  const A=P.map(()=>[]); E.forEach((e,i)=>{A[e.a].push({e:i,to:e.b});A[e.b].push({e:i,to:e.a});});
  const o=outwardStreetOrder({pts:P,edges:E,adj:A},P[0]);
  assert.deepEqual(o.streets.map(x=>x.i),[0,3,1],'dense far street before the near empty road');
  assert.deepEqual(o.deferred,[1]);
  assert.deepEqual(outwardStreetOrder({pts:P,edges:E,adj:A,zoned:true},P[0]).streets.map(x=>x.i),[0,1,3],'drawn area: plain distance order');
}
console.log('near-first ordering: 8 checks passed');
