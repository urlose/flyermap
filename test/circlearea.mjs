import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';
import { budgetDays } from '../worker/src/budgetplan.js';
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
