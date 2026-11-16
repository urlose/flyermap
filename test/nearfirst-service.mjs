// Integration: real Planner + the new service, synthetic street network, no backend/network.
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

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
console.log('Near-first planner integration: time-only budget, route shape, expansion OK');
