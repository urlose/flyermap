// Partial overlapping maps and reassigned buildings; no network or backend.
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

const start=[48.4486,10.2186];
const pt=(x,y=0)=>[start[0]+y/111320,start[1]+x/(111320*Math.cos(start[0]*Math.PI/180))];
const box=(x,n)=>[...pt(x,10),n];
const A=box(25,3),B=box(175,4);
function graph(end,boxes,y=0){
  const pts=[pt(0,y),pt(end,y)],mb=boxes.reduce((s,b)=>s+b[2],0);
  return {pts,edges:[{a:0,b:1,len:end,coords:pts,mb,boxes,name:'Residential'}],
    adj:[[{e:0,to:1}],[{e:0,to:0}]],radius:Planner.MAX_R,usable:mb,mailboxes:mb,street_m:end};
}
const zone=[pt(-500,-500),pt(500,-500),pt(500,500),pt(-500,500)];
const args={start,flyers:1,n:1,days:7,hours:7,quota:2500,travel:'zones',split:'even',exact:true,
  must:[],zone:null,mainName:'Main',side:[{name:'Side',lat:start[0]+.00001,lng:start[1],zone}],
  budget:{hours:32,strategy:'near-first',tolerance:0,travelMin:30}};
const originalLoad=Planner.loadForFlyers,originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network forbidden');};
try{
  for(const [label,side] of [
    ['same street split at a map boundary',graph(100,[A])],
    ['same building assigned to another edge',graph(100,[A],20)],
    ['same geometry, additional building in the main map',graph(200,[A])]
  ]){
    const main=graph(200,[A,B]);
    Planner.loadForFlyers=async s=>structuredClone(s[0]===start[0]?main:side);
    const {plan}=await createPlanService(null).plan(args,()=>{},()=>false);
    assert.equal(plan.mailboxes,7,label+': every real mailbox exactly once');
    const boxes=plan.routes.flatMap(r=>r.boxes);
    assert.equal(boxes.length,2,label+': two unique delivery points');
    assert.equal(boxes.reduce((s,b)=>s+b[2],0),7);
    assert.equal(plan.split.find(p=>p.name==='Main').flyers,4,'Main keeps the unserved building');
    assert.equal(plan.budget.actual_minutes,plan.budget.work_minutes+plan.budget.travel.minutes,'rides counted once (areas next to each other: no ride)');
    assert.ok(plan.budget.actual_minutes<=32*60);
  }
}finally{Planner.loadForFlyers=originalLoad;globalThis.fetch=originalFetch;Planner.setPace(0);}
console.log('Near-first partial-map overlap regressions passed');
