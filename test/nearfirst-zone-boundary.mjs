// Delivery points decide polygon inclusion even when a compressed road crosses it.
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
const start=[48.4486,10.2186];
const pt=(x,y=0)=>[start[0]+y/111320,start[1]+x/(111320*Math.cos(start[0]*Math.PI/180))];
const zone=[pt(-50,-50),pt(100,-50),pt(100,50),pt(-50,50)];
const empty={pts:[],edges:[],adj:[],radius:Planner.MAX_R,usable:0,mailboxes:0,street_m:0};
const originalLoad=Planner.loadForFlyers,originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('No network in synthetic test');};
try{
  for(const end of [400,80]){
    const pts=[pt(0),pt(end)];
    // First case: street endpoint is outside, but the first building is inside.
    // Second case: endpoint is inside, but a nearby building lies outside.
    const outside=end===400?pt(175,10):pt(110,10);
    const side={pts,edges:[{a:0,b:1,len:end,coords:pts,mb:7,
      boxes:[[...pt(25,10),3],[...outside,4]],name:'Residential'}],
      adj:[[{e:0,to:1}],[{e:0,to:0}]],radius:Planner.MAX_R,usable:7,mailboxes:7,street_m:end};
    Planner.loadForFlyers=async p=>structuredClone(p[0]===start[0]?empty:side);
    const {plan}=await createPlanService(null).plan({start,flyers:1,n:1,days:7,hours:7,quota:2500,
      travel:'zones',split:'even',exact:true,must:[],zone:null,mainName:'Empty',
      side:[{name:'Drawn area',lat:start[0]+.00001,lng:start[1],zone}],
      budget:{hours:32,strategy:'near-first',tolerance:0,travelMin:30}},()=>{},()=>false);
    assert.equal(plan.mailboxes,3,'Only delivery points inside the chosen polygon count');
    assert.ok(plan.routes.flatMap(r=>r.boxes).every(b=>Planner.inPoly(b,zone)));
    assert.equal(side.edges[0].mb,7,'Do not mutate the cached source graph');
  }
}finally{Planner.loadForFlyers=originalLoad;globalThis.fetch=originalFetch;Planner.setPace(0);}
console.log('Near-first polygon boundary regressions passed');
