// Capture PUBLIC static map tiles with GET only, then replay entirely offline.
// node test/leipheim-readonly.mjs --capture /tmp/leipheim.json
// node test/leipheim-readonly.mjs /tmp/leipheim.json
// Snapshot coordinates are the existing budget fixture's Leipheim centre;
// they are not a claim to reproduce the owner's exact GZ 4 start point.
// OSM: © OpenStreetMap contributors, ODbL. Zensus: dl-de/by-2-0.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import Planner from '../admin/planner.js';
import {censusSource} from '../worker/src/zensus.js';
import {createPlanService} from '../worker/src/plancore.js';

const capture=process.argv[2]==='--capture', file=process.argv[capture?3:2];
if(!file)throw new Error('Supply a snapshot filename');
if(capture){
  const start=[48.4486,10.2186],radius=2000,keys=Planner.tilesFor(start,radius);
  const get=async url=>{
    if(!String(url).startsWith(Planner.TILES_URL))throw new Error('Only public static tile GETs allowed');
    return fetch(url,{method:'GET',signal:AbortSignal.timeout(20000)});
  };
  const tiles=[];
  for(const key of keys){
    const tile=await Planner.fetchOwnTile(Planner.TILES_URL,key,get);
    if(!tile)throw new Error('Missing static tile '+key+'; no cache/RPC/Overpass fallback');
    tiles.push(tile);
  }
  const merged=Planner.mergeTiles(tiles),dLat=radius/111320,dLng=radius/(111320*Math.cos(start[0]*Math.PI/180));
  const box=[[start[0]-dLat,start[1]-dLng],[start[0]-dLat,start[1]+dLng],
    [start[0]+dLat,start[1]+dLng],[start[0]+dLat,start[1]-dLng]];
  const g=Planner.largestComponent(Planner.buildGraph(merged.osm,box),start);
  const dir=new URL('../admin/zensus/',import.meta.url);
  const localCensus=async url=>{
    const path=new URL(String(url).split('/').pop(),dir);
    if(!existsSync(path))return {status:404,ok:false};
    return {status:200,ok:true,arrayBuffer:async()=>Uint8Array.from(readFileSync(path)).buffer};
  };
  const buildings=await Planner.censusFill(merged.buildings.filter(b=>
    Math.abs(b.lat-start[0])<=dLat&&Math.abs(b.lng-start[1])<=dLng),box,censusSource(localCensus));
  Planner.attachBuildings(g,buildings);
  g.radius=radius;g.street_m=Math.round(g.edges.reduce((s,e)=>s+e.len,0));g.usable=g.mailboxes;
  mkdirSync(dirname(file),{recursive:true});
  writeFileSync(file,JSON.stringify({start,radius,captured_at:new Date().toISOString(),tiles:keys,
    source:Planner.TILES_URL,graph:g}));
}
const bytes=readFileSync(file),snapshot=JSON.parse(bytes),g=snapshot.graph;
assert.ok(g.edges.length>0&&g.mailboxes>0,'Snapshot contains real streets and mailbox estimates');
const originalLoad=Planner.loadForFlyers,originalFetch=globalThis.fetch;
globalThis.fetch=async()=>{throw new Error('Network forbidden during replay');};
Planner.loadForFlyers=async()=>structuredClone(g);
const point=p=>p[0].toFixed(6)+','+p[1].toFixed(6);
const pair=(a,b)=>[point(a),point(b)].sort().join(';'),segments=new Set();
g.edges.forEach(e=>e.coords.slice(1).forEach((p,i)=>segments.add(pair(e.coords[i],p))));
try{
  const results=[];
  for(const n of [1,2]){
    const {plan}=await createPlanService(null).plan({start:snapshot.start,flyers:1,n,days:7,hours:7,
      quota:2500,travel:'zones',split:'even',exact:true,must:[],zone:null,side:[],
      mainName:'Leipheim snapshot',budget:{hours:32,strategy:'near-first',tolerance:0}},()=>{},()=>false);
    assert.ok(plan.mailboxes>0&&plan.routes.length<=n);
    assert.equal(plan.budget.target_minutes,1920);
    assert.ok(plan.budget.actual_minutes<=1920,'Strict 32 team hours');
    assert.equal(plan.budget.travel.minutes,0);
    assert.equal(plan.per_worker.reduce((s,m)=>s+m,0),plan.budget.actual_minutes);
    const seen=new Set();
    for(const r of plan.routes){
      assert.ok(r.path.length>1);
      for(let i=1;i<r.path.length;i++){
        assert.ok(r.path[i][2]!==1,'Single-town walk has no teleport');
        if(point(r.path[i-1])!==point(r.path[i]))
          assert.ok(segments.has(pair(r.path[i-1],r.path[i])),'Every walking step follows a loaded road');
      }
      for(const b of r.boxes){const key=point(b);assert.ok(!seen.has(key),'No mailbox served twice');seen.add(key);}
    }
    results.push({workers:n,mailboxes:plan.mailboxes,minutes:plan.budget.actual_minutes,
      per_worker:plan.per_worker,limit:plan.budget.limit});
  }
  console.log(JSON.stringify({snapshot_sha256:createHash('sha256').update(bytes).digest('hex'),
    start:snapshot.start,edges:g.edges.length,mailboxes:g.mailboxes,dropped_mailboxes:g.dropped_mb,
    gz4_names:[...new Set(g.edges.map(e=>e.name).filter(n=>/GZ\s*4\b/i.test(n)))],results},null,2));
}finally{Planner.loadForFlyers=originalLoad;globalThis.fetch=originalFetch;Planner.setPace(0);}
