// Offline regression graphs: no Supabase, OSM or Zensus requests.
import assert from 'node:assert/strict';
import Planner from '../admin/planner.js';
import { createPlanService } from '../worker/src/plancore.js';

const start=[48.46,10.21], pt=(x,y)=>[start[0]+y/111320,start[1]+x/(111320*Math.cos(start[0]*Math.PI/180))];
function graph(spec){
  const pts=[pt(0,0),pt(200,0)], edges=spec.map(([y,mb])=>({
    a:0,b:1,len:300,coords:[pts[0],pt(100,y),pts[1]],mb,
    boxes:mb?[[...pt(100,y),mb]]:[],name:'Residential'
  })), adj=pts.map(()=>[]);
  edges.forEach((e,i)=>{adj[e.a].push({e:i,to:e.b});adj[e.b].push({e:i,to:e.a});});
  return {pts,edges,adj,radius:Planner.MAX_R,mailboxes:edges.reduce((s,e)=>s+e.mb,0),usable:20,street_m:600};
}
const args={start,flyers:1,n:1,days:7,hours:7,quota:2500,side:[],must:[],zone:null,
  travel:'zones',split:'even',exact:true,mainName:'Town',budget:{hours:32,strategy:'near-first',tolerance:0}};
const run=a=>createPlanService(null).plan(a,()=>{},()=>false).then(x=>x.plan);
const polygon=[pt(-1000,-1000),pt(1000,-1000),pt(1000,1000),pt(-1000,1000)];
const originalLoad=Planner.loadForFlyers;
const originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network forbidden in regression tests');};
try {
  // Curved parallel streets share endpoints and midpoint, but are not duplicates.
  const main=graph([[80,5],[-80,7]]), side=graph([[80,5],[-80,0]]);
  Planner.loadForFlyers=async p=>p[0]===start[0]?main:side;
  const p=await run({...args,side:[{name:'Side',lat:start[0]+.00001,lng:start[1],zone:polygon}],
    budget:{...args.budget,travelMin:30}});
  assert.equal(p.mailboxes,12,'Distinct streets sharing an endpoint midpoint must both survive');
  assert.equal(p.routes.flatMap(r=>r.boxes).reduce((s,b)=>s+b[2],0),12,'The shared street must still be served only once');

  // Place labels are not identities. Same labels must not erase a real transfer.
  const far=graph([[80,5]]);
  const offset=.1;
  far.pts=far.pts.map(p=>[p[0]+offset,p[1]]);
  far.edges=far.edges.map(e=>({...e,coords:e.coords.map(p=>[p[0]+offset,p[1]]),boxes:e.boxes.map(b=>[b[0]+offset,b[1],b[2]])}));
  Planner.loadForFlyers=async p=>p[0]===start[0]?main:far;
  const farZone=polygon.map(p=>[p[0]+offset,p[1]]);
  for(const label of ['Town','']){
    const p=await run({...args,side:[{name:label,lat:start[0]+offset,lng:start[1],zone:farZone}],
      budget:{...args.budget,travelMin:30}});
    assert.equal(p.budget.travel.moves,1,'A different place counts even with the same or empty name');
    assert.equal(p.budget.travel.minutes,30);
    assert.equal(p.budget.actual_minutes,p.budget.work_minutes+30,'Travel counted exactly once');
    assert.equal(p.routes[0].path.filter(q=>q[2]===1).length,1,'No straight walking line between places');
    assert.ok(Math.abs(p.routes[0].days.reduce((s,d)=>s+d.minutes,0)-p.routes[0].minutes)<=1,'Day and route time agree');
  }

  // An empty first map is exhausted too; it must not suppress map expansion.
  let loads=0;
  const empty={...graph([]),radius:1500,usable:0,mailboxes:0};
  Planner.loadForFlyers=async()=>++loads===1?empty:main;
  const expanded=await run(args);
  assert.equal(loads,2,'Expand an empty initial map before reporting no work');
  assert.equal(expanded.mailboxes,12);
  // No budget inflation from worker count. Both workers share the same 32 h.
  Planner.loadForFlyers=async()=>main;
  const team=await run({...args,n:2});
  assert.equal(team.budget.target_minutes,1920);
  assert.ok(team.budget.actual_minutes<=1920);
  assert.equal(team.per_worker.reduce((s,m)=>s+m,0),team.budget.actual_minutes);
  Planner.setPace(2500);
  assert.equal(Planner.routeMinutes(2500,0),30,'2500 m takes 30 minutes');
  assert.equal(Planner.routeMinutes(2500,120),40,'Mailbox handling is additional');

  // Zensus allows 110 m snapping. Exercise every position relative to the grid.
  for(let shift=0;shift<160;shift+=10){
    const a=pt(shift,0), b=pt(shift,20), g={pts:[a,b],edges:[{a:0,b:1,coords:[a,b],len:20}]};
    Planner.attachBuildings(g,[{lat:pt(shift+100,10)[0],lng:pt(shift+100,10)[1],n:3,snap:110}]);
    assert.equal(g.mailboxes,3,'100 m census point must snap independently of spatial-grid alignment');
    Planner.attachBuildings(g,[{lat:pt(shift+120,10)[0],lng:pt(shift+120,10)[1],n:3,snap:110}]);
    assert.equal(g.mailboxes,0,'Do not extend the permitted snapping distance');
  }
} finally {
  Planner.loadForFlyers=originalLoad;globalThis.fetch=originalFetch;Planner.setPace(0);
}
console.log('Routing quality regressions passed');
