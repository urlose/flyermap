import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { budgetDays } from '../worker/src/budgetplan.js';
import { cellOf } from '../worker/src/zensus.js';
import { radiusKm, radiusFromPlans, circlePolygon, distanceM, insideCircle, clipDeliveryGraph, manualOutsideCircle } from '../worker/src/circlearea.js';
globalThis.fetch = async () => { throw new Error('No network in synthetic tests'); };
const start = [48.460716, 10.212487];
const point = metres => [start[0] + metres / 6371000 * 180 / Math.PI, start[1]];
assert.equal(radiusKm(null), null);
assert.equal(radiusFromPlans([{days:[{}]}]), null, 'Legacy orders stay unchanged');
for(const v of [0, -1, NaN, Infinity, 10.1, 'bad']) assert.throws(() => radiusKm(v));
for(const centre of [start, [0,0], [70,179.99]]){
  for(const p of circlePolygon(centre, 10)) assert.ok(Math.abs(distanceM(centre,p)-10000) < .001);
}
assert.ok(insideCircle(point(500),start,.5));
assert.ok(!insideCircle(point(500.1),start,.5));

// One street crosses the boundary. Clip buildings individually while retaining
// the original connecting road and its mailbox estimate proportionally.
const pts=[start,point(600)], edge={a:0,b:1,len:600,coords:pts,mb:10,boxes:[point(499).concat(3),point(501).concat(7)]};
const graph={pts,edges:[edge],adj:[[{e:0,to:1}],[{e:0,to:0}]],radius:1000,usable:10,mailboxes:10,street_m:600};
const before=JSON.stringify(graph), clipped=clipDeliveryGraph(graph,start,.5);
assert.equal(clipped.edges[0].mb,3);
assert.deepEqual(clipped.edges[0].boxes,[edge.boxes[0]]);
assert.equal(clipped.adj,graph.adj);
assert.equal(JSON.stringify(graph),before,'Cached graph must not be changed');
assert.equal(clipDeliveryGraph(graph,start,null),graph);
assert.equal(clipDeliveryGraph({...graph,edges:[{...edge,boxes:[]}]},start,.5).edges[0].mb,0,'No-location legacy estimates must not leak outside');

Planner.loadForFlyers=async()=>graph;
const args={start,flyers:1,n:1,days:3,hours:7,quota:2500,travel:'zones',split:'even',exact:true,mainName:'Main',budget:{hours:10,strategy:'near-first',tolerance:0,radiusKm:.5}};
const run=async extra=>(await createPlanService(null).plan({...args,...extra},()=>{},()=>false)).plan;
const base=await run({});
assert.equal(base.mailboxes,3);
assert.equal(base.zone.length,128);
assert.ok(base.routes.flatMap(r=>r.boxes).every(b=>insideCircle(b,start,.5)));
const saved=base.routes.map(r=>({days:budgetDays(r,base)}));
assert.equal(radiusFromPlans(JSON.parse(JSON.stringify(saved))),.5,'Radius survives actual row serialization');
const reopened=await run({budget:{...args.budget,radiusKm:radiusFromPlans(saved)}});
assert.equal(reopened.mailboxes,base.mailboxes);
const cachedService=createPlanService(null);
const cachedRun=async km=>(await cachedService.plan({...args,budget:{...args.budget,radiusKm:km}},()=>{},()=>false)).plan;
assert.equal((await cachedRun(.5)).mailboxes,3);
assert.equal((await cachedRun(.6)).mailboxes,10,'Increasing radius restores previously clipped buildings');
assert.equal((await cachedRun(.5)).mailboxes,3,'Shrinking radius clips cached maps again');
const legacy=await run({budget:{...args.budget,radiusKm:null}});
assert.equal(legacy.mailboxes,10,'Old mode still delivers outside a new circle');
assert.deepEqual(legacy.zone,[]);

// A town whose centre is outside is ignored only when auto:true. No fictitious
// travel time is needed for an automatically excluded place.
const outside={name:'Outside',lat:pts[1][0],lng:pts[1][1],flyers:10,auto:true};
const auto=await run({side:[outside]});
assert.equal(auto.mailboxes,3);
assert.equal(auto.budget.travel.moves,0);
assert.equal(auto.split.length,1);
const manual=await run({side:[{...outside,auto:false}],budget:{...args.budget,travelMin:30}});
assert.equal(manual.mailboxes,10,'Manual place is not clipped');
assert.ok(manual.budget.manualOutside);
assert.ok(manual.budget.actual_minutes <= 600);
assert.equal(manual.budget.travel.minutes,30);
assert.ok(manualOutsideCircle(start,.5,[{...outside,auto:false}]));
assert.ok(!manualOutsideCircle(start,.5,[outside]));
// An auto town with centre INSIDE still cannot add buildings outside the circle.
const inner=point(500);
const autoInner=await run({side:[{...outside,lat:inner[0],lng:inner[1]}],budget:{...args.budget,travelMin:30}});
assert.equal(autoInner.mailboxes,3);
assert.ok(autoInner.routes.flatMap(r=>r.boxes).every(b=>insideCircle(b,start,.5)));

// A hand-drawn area outside is an explicit exception, with a warning. A tiny
// rectangle encloses the entire fixture road without clipping its buildings.
const polygon=[[start[0]-.001,start[1]-.001],[pts[1][0]+.001,start[1]-.001],[pts[1][0]+.001,start[1]+.001],[start[0]-.001,start[1]+.001]];
const shape=await run({zone:polygon,budget:{...args.budget,travelMin:30}});
assert.equal(shape.mailboxes,10);
assert.ok(shape.budget.manualOutside);
assert.ok(manualOutsideCircle(start,.5,[],[],polygon));
assert.ok(!manualOutsideCircle(start,null,[],[],polygon));

// Exhausting the first map expands loading up to the requested circle rather
// than the historical 6 km ceiling; the output remains clipped.
const options=[];
Planner.loadForFlyers=async(s,f,o)=>{options.push(o);return {...graph,radius:options.length===1?1000:10000};};
const wider=await run({budget:{...args.budget,radiusKm:10}});
assert.equal(options.length,2);
assert.equal(options[1].zone.length,128);
assert.equal(wider.budget.radiusKm,10);
assert.equal(wider.mailboxes,10);
console.log('Circle regressions: boundary, manual exceptions, auto towns, budget, persistence and legacy compatibility OK');

// Smaller print run (18.11.2026): full plan 10 inside the circle, target 4 -> at most 4 planned, circle unchanged, report per place
const capped=await run({budget:{...args.budget,radiusKm:10,cap:{target:4,places:[]}}});
assert.ok(capped.mailboxes<=4 && capped.mailboxes>0,'planned total within the print run: '+capped.mailboxes);
assert.equal(capped.budget.radiusKm,10);
assert.equal(capped.budget.cap.full_planned,10);
assert.equal(capped.budget.cap.cut,true);
assert.equal(capped.budget.cap.places.reduce((a,x)=>a+x.planned,0),capped.mailboxes);
assert.ok(capped.budget.actual_minutes<=capped.budget.cap.full_minutes,'less working time');
const notCut=await run({budget:{...args.budget,radiusKm:10,cap:{target:50,places:[]}}});
assert.equal(notCut.mailboxes,10); assert.equal(notCut.budget.cap.cut,false);
console.log('Print run below the full plan OK');

// Connected street (18.11.2026): main town 50 at the start, village 1 km on: houses with 25 and 4. Print run 54 ->
// 50 + 4: the 25 house is skipped, the route still walks past it to the 4 house.
{
  const P=[start,point(100),point(1000),point(1100)];
  const E=[{a:0,b:1,len:100,coords:[P[0],P[1]],mb:50,boxes:[point(50).concat(50)]},
           {a:1,b:2,len:900,coords:[P[1],P[2]],mb:0,boxes:[]},
           {a:2,b:3,len:100,coords:[P[2],P[3]],mb:29,boxes:[point(1020).concat(25),point(1080).concat(4)]}];
  const g2={pts:P,edges:E,adj:[[{e:0,to:1}],[{e:0,to:0},{e:1,to:2}],[{e:1,to:1},{e:2,to:3}],[{e:2,to:2}]],radius:2000,usable:79,mailboxes:79,street_m:1100};
  Planner.loadForFlyers=async()=>g2;
  const cellsAt=m=>{ const [a,b]=cellOf(...point(m)); return [a,b]; };
  const places=[{id:'M',lat:point(50)[0],lng:start[1],cells:cellsAt(50)},{id:'V',lat:point(1050)[0],lng:start[1],cells:[...cellsAt(1020),...cellsAt(1080)]}];
  const fullC=await run({budget:{...args.budget,radiusKm:5}});
  assert.equal(fullC.mailboxes,79,'full plan: 50 + 25 + 4');
  const c54=await run({budget:{...args.budget,radiusKm:5,cap:{target:54,places}}});
  const by=Object.fromEntries(c54.budget.cap.places.map(x=>[x.id,x.planned]));
  assert.equal(c54.mailboxes,54,'50 + 4: '+c54.mailboxes);
  assert.deepEqual(by,{M:50,V:4});
  const far=Math.max(...c54.routes.flatMap(r=>r.path.map(p=>distanceM(start,p))));
  assert.ok(far>=1079,'the route reaches the second house: '+far);
  assert.ok(c54.routes.flatMap(r=>r.boxes).every(b=>b[2]!==25),'the 25 house is not delivered');
  console.log('Connected street: 50 + 4 with the route past the skipped house OK');
}
// Same, but the village street is a long sparse dead end (1,5 km, after the cut 4 mailboxes = 2,7 per km): the normal
// near-first filter skips such streets as isolated; in the print-run re-plan the kept house must still be delivered.
{
  const P=[start,point(100),point(1000),point(2500)];
  const E=[{a:0,b:1,len:100,coords:[P[0],P[1]],mb:50,boxes:[point(50).concat(50)]},
           {a:1,b:2,len:900,coords:[P[1],P[2]],mb:0,boxes:[]},
           {a:2,b:3,len:1500,coords:[P[2],P[3]],mb:29,boxes:[point(1020).concat(25),point(2480).concat(4)]}];
  Planner.loadForFlyers=async()=>({pts:P,edges:E,adj:[[{e:0,to:1}],[{e:0,to:0},{e:1,to:2}],[{e:1,to:1},{e:2,to:3}],[{e:2,to:2}]],radius:3000,usable:79,mailboxes:79,street_m:2500});
  const cellsAt=m=>{ const [a,b]=cellOf(...point(m)); return [a,b]; };
  const places=[{id:'M',lat:point(50)[0],lng:start[1],cells:cellsAt(50)},{id:'V',lat:point(1050)[0],lng:start[1],cells:[...cellsAt(1020),...cellsAt(2480)]}];
  const c=await run({budget:{...args.budget,radiusKm:5,cap:{target:54,places}}});
  assert.deepEqual(Object.fromEntries(c.budget.cap.places.map(x=>[x.id,x.planned])),{M:50,V:4},'kept house on a sparse dead end delivered');
  console.log('Sparse dead end in the print-run re-plan OK');
}
