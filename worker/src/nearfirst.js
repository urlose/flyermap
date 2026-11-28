// Pure road-network ranking for time-first planning. No flyer target is required.
// Street edges are ranked by shortest walking-network distance from the start,
// rather than mailbox density. A remote dead-end with almost no households can
// be skipped, but normal residential streets are not scored by density.
export function outwardStreetOrder(g, start, { isolatedGapM = 850, sparsePerKm = 3 } = {}){
  if(!g || !Array.isArray(g.pts) || !Array.isArray(g.edges) || !Array.isArray(g.adj)) throw new Error('Invalid street graph');
  const n = g.pts.length, dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1), parentEdge = new Int32Array(n).fill(-1);
  if(!n) return { root:-1, streets:[], unreachable:[], skipped:[] };
  const hav = (a, b) => {
    const r = Math.PI / 180, dLat = (b[0]-a[0])*r, dLon = (b[1]-a[1])*r;
    return 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.sin(dLat/2)**2 +
      Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dLon/2)**2)));
  };
  let root = -1, nearest = Infinity;
  for(let i = 0; i < n; i++) if(g.adj[i]?.length){
    const d = hav(g.pts[i], start);
    if(d < nearest){ nearest = d; root = i; }
  }
  if(root < 0) return { root:-1, streets:[], unreachable:g.edges.map((_, i) => i), skipped:[] };
  const heap = [], push = (d, v) => {
    let k = heap.length; heap.push([d,v]);
    while(k){ const p=(k-1)>>1; if(heap[p][0]<=d)break; heap[k]=heap[p]; k=p; } heap[k]=[d,v];
  };
  const pop = () => {
    const top=heap[0], last=heap.pop(); if(heap.length){
      let k=0; while(k*2+1<heap.length){let c=k*2+1;if(c+1<heap.length&&heap[c+1][0]<heap[c][0])c++;if(heap[c][0]>=last[0])break;heap[k]=heap[c];k=c;}
      heap[k]=last;
    }return top;
  };
  dist[root]=0;push(0,root);
  while(heap.length){
    const [d,v]=pop();if(d!==dist[v])continue;
    for(const arc of g.adj[v]||[]){
      const e=g.edges[arc.e];if(!e || !Number.isFinite(+e.len) || e.len<0)continue;
      const next=d+e.len;
      if(next<dist[arc.to]){dist[arc.to]=next;parent[arc.to]=v;parentEdge[arc.to]=arc.e;push(next,arc.to);}
    }
  }
  const streets=[], unreachable=[], skipped=[];
  // Empty land (27.11.2026): forest and field tracks with a lone farm used to be taken just because they were near – and the
  // time was then missing for a dense place a bit further away. Like the flyer planner (selectForFlyers) such streets are found:
  // 1. long roads far below the area's usual density, 2. roads out (branches of the walking tree) that bring too few mailboxes
  // per km. They are not thrown away but put at the END of the order: first every normal street in reach, the empty land only
  // with time left over. Not for areas the admin drew himself (g.zoned) and not for a kept selection (isolatedGapM = Infinity).
  const filterEmpty=!g.zoned&&Number.isFinite(isolatedGapM);
  let sm=0, sl=0; g.edges.forEach(e=>{ if(+e.mb>0&&Number.isFinite(Math.min(dist[e.a],dist[e.b]))){ sm+=+e.mb; sl+=+e.len||0; } });
  const D=sl?sm/sl*1000:0, minDens=Math.min(.5*D,Math.max(4,Math.min(15,.25*D))), thr=Math.min(.5*D,Math.max(6,Math.min(25,.3*D)));   // never below half the area's own density: in a thin area the thin roads are all there is
  const cand=[];
  g.edges.forEach((e,i)=>{
    const mb=+e.mb||0;
    if(mb<=0)return;  // roads without mailboxes can still connect two candidate streets
    const a=dist[e.a],b=dist[e.b];
    if(!Number.isFinite(Math.min(a,b))){unreachable.push(i);return;}
    const distance=Math.min(a,b), density=mb*1000/Math.max(1,e.len);
    // Skip only extraordinary, isolated dead ends; normal thin streets remain eligible.
    const deadEnd=(g.adj[e.a]?.length||0)<=1||(g.adj[e.b]?.length||0)<=1;
    if(deadEnd&&Math.max(a,b)>isolatedGapM&&e.len>=isolatedGapM&&density<sparsePerKm){
      skipped.push(i);return;
    }
    cand.push({ i, distance, mailboxes:mb, length_m:e.len, v:a<=b?e.b:e.a, thin:filterEmpty&&e.len>100&&density<minDens });
  });
  let keep=()=>true;
  if(filterEmpty&&cand.length){
    const order=[...Array(n).keys()].filter(v=>Number.isFinite(dist[v])).sort((x,y)=>dist[x]-dist[y]);
    const B=new Float64Array(n), L=new Float64Array(n), drop=new Uint8Array(n);
    cand.forEach(c=>{ const e=g.edges[c.i], u=c.v===e.a?e.b:e.a; B[c.v]+=c.mailboxes; if(parent[c.v]!==u)L[c.v]+=c.length_m; });   // a tree road is counted once (below), other streets on top
    for(let q=order.length-1;q>=0;q--){ const v=order[q], p=parent[v]; if(p<0)continue; L[v]+=dist[v]-dist[p]; B[p]+=B[v]; L[p]+=L[v]; }
    for(const v of order){ const p=parent[v]; if(p<0)continue; if(drop[p]||(dist[v]>300&&L[v]>0&&B[v]/L[v]*1000<thr))drop[v]=1; }
    keep=c=>!drop[c.v];
  }
  // Spurs (27.11.2026): a dead-end chain (from a dead end back to the first junction) that brings almost nothing for the way
  // there AND back – a road into the fields, a long drive to one house – goes to the end as well; the time goes to another street.
  if(filterEmpty){
    const deg=v=>(g.adj[v]||[]).length, candAt=new Map(cand.map(c=>[c.i,c]));
    for(let v=0;v<n;v++){ if(deg(v)!==1||v===root) continue;
      const chain=[]; let cur=v, prevE=-1, L=0, M=0, hitRoot=false;
      for(let guard=0;guard<200;guard++){
        const arc=(g.adj[cur]||[]).find(a=>a.e!==prevE); if(!arc) break;
        const e=g.edges[arc.e]; chain.push(arc.e); L+=+e.len||0; M+=+e.mb||0; prevE=arc.e; cur=arc.to;
        if(cur===root){ hitRoot=true; break; } if(deg(cur)!==2) break;
      }
      if(hitRoot||!chain.length) continue;
      const perWalk=M*100/Math.max(1,2*L);   // mailboxes per 100 m walked (there and back)
      if((M<=2&&L>60)||perWalk<1.2) for(const i of chain){ const c=candAt.get(i); if(c) c.thin=true; }
    }
  }
  // Islands behind an empty stretch (28.11.2026, Löhne/Ulenburg): a few houses reached only after ≥ 400 m of road without
  // mailboxes (forest, fields) – a castle and two farms behind 1.6 km of forest – bring far too little for the way there and
  // back. Their streets go to the end too; the time goes to the dense quarters at the edge of the area instead. Measured on the
  // walking tree: mailboxes behind the node per metre of (way there and back over the empty stretch + streets behind it).
  if(filterEmpty&&cand.length){
    const isCand=new Map(cand.filter(c=>!c.thin).map(c=>[c.i,c]));
    const order=[...Array(n).keys()].filter(v=>Number.isFinite(dist[v])).sort((x,y)=>dist[x]-dist[y]);
    const run=new Float64Array(n), B=new Float64Array(n), Ls=new Float64Array(n), drop=new Uint8Array(n);
    for(const v of order){ const p=parent[v]; if(p<0) continue; const e=parentEdge[v]; run[v]=isCand.has(e)?0:run[p]+(+g.edges[e].len||0); }
    for(const c of isCand.values()){ B[c.v]+=c.mailboxes; if(parentEdge[c.v]!==c.i) Ls[c.v]+=c.length_m; }
    for(let q=order.length-1;q>=0;q--){ const v=order[q], p=parent[v]; if(p<0) continue; if(isCand.has(parentEdge[v])) Ls[v]+=+g.edges[parentEdge[v]].len||0; B[p]+=B[v]; Ls[p]+=Ls[v]; }
    const ISLAND_GAP=400, islandMin=Math.max(8,Math.min(30,.35*D));   // Löhne: D ≈ 80 → 28 per km
    for(const v of order){ const p=parent[v]; if(p<0) continue;
      drop[v]=drop[p]||(run[v]>=ISLAND_GAP&&B[v]>0&&B[v]*1000/(2*run[v]+Ls[v])<islandMin&&(g.adj[v]||[]).some(a=>isCand.has(a.e))); }
    for(const c of isCand.values()) if(drop[c.v]) c.thin=true;
  }
  const later=[];
  cand.forEach(c=>{ const q={ i:c.i, distance:c.distance, mailboxes:c.mailboxes, length_m:c.length_m }; (!c.thin&&keep(c)?streets:later).push(q); });
  const near=(a,b)=>a.distance-b.distance||a.i-b.i;
  streets.sort(near); later.sort(near);
  const deferred=later.map(q=>q.i); streets.push(...later);
  return { root, streets, unreachable, skipped, deferred };
}

// Full geometry distinguishes parallel curves and loops with the same endpoints.
// Reversing an edge does not make it a new delivery street.
export function streetGeometryKey(g, i){
  const e=g.edges[i], coords=e.coords?.length?e.coords:[g.pts[e.a],g.pts[e.b]];
  const points=coords.map(p=>p[0].toFixed(6)+','+p[1].toFixed(6));
  const forward=points.join(';'), reverse=points.slice().reverse().join(';');
  return forward<reverse?forward:reverse;
}
