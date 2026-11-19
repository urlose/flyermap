// Integration: real Planner + the new service, synthetic street network, no backend/network.
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
// Synthetic roads must not be clipped by live census settlements at these coordinates.
globalThis.fetch = async () => { throw new Error('Network disabled for synthetic planner fixtures'); };

const start=[48.46,10.21], pts=[], edges=[], adj=[];
const latM=1/111320, lngM=1/(111320*Math.cos(start[0]*Math.PI/180));
for(let y=0;y<=6;y++)for(let x=0;x<=6;x++){pts.push([start[0]+y*90*latM,start[1]+x*90*lngM]);adj.push([]);}
const id=(x,y)=>y*7+x;
for(let y=0;y<=6;y++)for(let x=0;x<=6;x++)for(const [xx,yy] of [[x+1,y],[x,y+1]]){
  if(xx>6||yy>6)continue;
  const a=id(x,y), b=id(xx,yy), mb=x===0&&y===0?2:(x>=5?90:10);
  const e={a,b,len:90,coords:[pts[a],pts[b]],mb,boxes:[[(pts[a][0]+pts[b][0])/2,(pts[a][1]+pts[b][1])/2,mb]],name:'R'};
  const k=edges.push(e)-1;adj[a].push({e:k,to:b});adj[b].push({e:k,to:a});
}
const graph={pts,edges,adj,radius:1500,mailboxes:edges.reduce((a,e)=>a+e.mb,0),
  usable:edges.reduce((a,e)=>a+e.mb,0),street_m:edges.length*90};
// Regression for Leipheim/GZ4: nearest streets must not be silently replaced
// by a denser distant block during route construction.
const nearIds=[0,1]; // two low-mailbox branches next to the starting junction
const nearMb=nearIds.reduce((sum,i)=>sum+edges[i].mb,0);
const preserved=Planner.planFlyers(graph,start,nearMb+1,1,{
  days:1,hoursPerDay:7,selectedEdgeIds:nearIds
});
assert.deepEqual([...preserved.routes[0].part].sort((a,b)=>a-b),nearIds);
assert.equal(preserved.mailboxes,nearMb,'Near-first route must retain nearby mailbox count');
assert.equal(preserved.routes[0].mailboxes,nearMb,'Routing must serve the selected nearby streets');

Planner.loadForFlyers=async()=>graph;
const run=async (time,flyers)=>createPlanService(null).plan({
  start,flyers,n:2,days:3,hours:7,must:[],zone:null,side:[],
  quota:2500,bike:false,travel:'zones',split:'even',exact:true,mainAll:false,
  cores:false,together:false,near:false,mainName:'Hauptstadt',
  budget:{hours:time,strategy:'near-first',tolerance:0.05}
},()=>{},()=>false);
const a=(await run(4,1)).plan;
assert.equal(a.budget.strategy,'near-first');
assert.ok(a.mailboxes>1,'Flyer input of 1 must not limit the result');
assert.ok(a.routes.length>=1&&a.routes.length<=2);
assert.ok(a.budget.actual_minutes<=4*60*1.05+2,
  'Estimated time must respect total budget plus tolerance');
const b=(await run(9,1)).plan;
assert.ok(b.mailboxes>=a.mailboxes,'More time should expand coverage');
assert.ok(b.budget.actual_minutes<=9*60*1.05+2);
assert.ok(b.routes.every(r=>r.path.length>1));
// A second town consumes walking time AND explicitly supplied transfer minutes.
// A large separation also proves that maps cannot silently join the towns on foot.
const sideStart=[start[0]+0.12,start[1]+0.14];
const sideGraph={
  ...graph,
  pts:graph.pts.map(p=>[p[0]+0.12,p[1]+0.14]),
  edges:graph.edges.map(e=>({
    ...e,
    coords:e.coords.map(p=>[p[0]+0.12,p[1]+0.14]),
    boxes:e.boxes.map(b=>[b[0]+0.12,b[1]+0.14,b[2]])
  }))
};
Planner.loadForFlyers=async p=>p[0]>start[0]+0.05?sideGraph:graph;
const sideArgs={
  start,flyers:1,n:2,days:3,hours:7,must:[],zone:null,
  side:[{name:'Nebenort',lat:sideStart[0],lng:sideStart[1],flyers:300,auto:true}],
  quota:2500,bike:false,travel:'zones',split:'even',exact:true,mainAll:false,
  cores:false,together:false,near:false,mainName:'Hauptstadt',
  budget:{hours:10,strategy:'near-first',tolerance:.05,travelMin:30}
};
const multi=(await createPlanService(null).plan(sideArgs,()=>{},()=>false)).plan;
assert.ok(multi.split.some(x=>x.name==='Hauptstadt'&&x.flyers>0));
assert.ok(multi.split.some(x=>x.name==='Nebenort'&&x.flyers>0));
assert.ok(multi.budget.travel.moves>=1,'At least one town transfer must be counted');
assert.ok(multi.budget.travel.minutes>=30);
assert.ok(multi.budget.actual_minutes<=10*60*1.05+2);
assert.equal(multi.routes.length,2,'One row per worker');
assert.ok(multi.routes.some(r=>r.path.some(p=>p[2]===1)),'Inter-town jump markers must survive');
// 19.11.2026: no typed-in ride time needed any more – rides are computed by car (offline here: estimate, marked)
const auto=(await createPlanService(null).plan({...sideArgs,budget:{...sideArgs.budget,travelMin:null}},()=>{},()=>false)).plan;
assert.ok(auto.budget.travel.moves>=1 && auto.budget.travel.minutes>0 && auto.budget.travel.known===false,'automatic ride, marked as estimate offline');
assert.ok(auto.budget.travel.jumps.every(j=>j.geom.length>=2 && j.km>0),'every ride has a line and km');
assert.equal(auto.budget.actual_minutes,auto.budget.work_minutes+auto.budget.travel.minutes,'every ride counted once');
console.log('Near-first planner integration: time-only budget, outward growth and side-town travel OK');

const constrained=(await createPlanService(null).plan({...sideArgs,budget:{...sideArgs.budget,hours:4}},()=>{},()=>false)).plan;
const baseMainMinutes=a.routes.flatMap(r=>r.parts).filter(p=>p.place==='Hauptstadt').reduce((s,p)=>s+p.minutes,0);
const sideMainMinutes=constrained.routes.flatMap(r=>r.parts).filter(p=>p.place==='Hauptstadt').reduce((s,p)=>s+p.minutes,0);
assert.ok(sideMainMinutes<baseMainMinutes,'Side-town work and transfer must reduce the main-town time allocation');
assert.ok(constrained.budget.actual_minutes<=4*60*1.05+1);
assert.equal(constrained.per_worker.reduce((s,m)=>s+m,0),constrained.budget.actual_minutes);
