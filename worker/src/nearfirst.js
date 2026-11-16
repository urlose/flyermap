// Pure road-network ranking for time-first planning. No flyer target is required.
// Street edges are ranked by shortest walking-network distance from the start,
// rather than mailbox density. A remote dead-end with almost no households can
// be skipped, but normal residential streets are not scored by density.
export function outwardStreetOrder(g, start, { isolatedGapM = 850, sparsePerKm = 3 } = {}){
  if(!g || !Array.isArray(g.pts) || !Array.isArray(g.edges) || !Array.isArray(g.adj)) throw new Error('Invalid street graph');
  const n = g.pts.length, dist = new Float64Array(n).fill(Infinity), parent = new Int32Array(n).fill(-1);
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
      if(next<dist[arc.to]){dist[arc.to]=next;parent[arc.to]=v;push(next,arc.to);}
    }
  }
  const streets=[], unreachable=[], skipped=[];
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
    streets.push({ i, distance, mailboxes:mb, length_m:e.len });
  });
  streets.sort((a,b)=>a.distance-b.distance||a.i-b.i);
  return { root, streets, unreachable, skipped };
}
