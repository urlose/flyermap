import { distanceM } from './circlearea.js';
import { cellOf } from './zensus.js';

export function censusAreaIndex(places){
  const exact = new Map(), nearby = new Map();
  for(const place of places){
    const cells = place.cells?.length ? place.cells : cellOf(place.lat, place.lng);
    for(let i = 0; i < cells.length; i += 2){
      const x = cells[i], y = cells[i + 1];
      exact.set(x + ',' + y, place);
      for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++){
        const key = (x + dx) + ',' + (y + dy), distance = Math.abs(dx) + Math.abs(dy);
        if(distance && (nearby.get(key)?.distance ?? Infinity) > distance) nearby.set(key, { place, distance });
      }
    }
  }
  return point => {
    const key = cellOf(point[0], point[1]).join(',');
    return exact.get(key) || nearby.get(key)?.place;
  };
}

// Uninhabited links are measured along the road network, even when split
// into several small graph edges. Census borders take precedence at ties.
export function splitWalkingAreas(graph, start, censusAt, gapM, perKm){
  const { pts, edges, adj } = graph;
  const owner = new Int32Array(pts.length).fill(-1);
  const distance = new Float64Array(pts.length).fill(Infinity);
  const heap = [], parent = [], places = [], seeds = [], joins = [];
  let skipped = 0;
  const root = id => {
    while(id !== parent[id]){ parent[id] = parent[parent[id]]; id = parent[id]; }
    return id;
  };
  function push(node, meters){
    let k = heap.length;
    heap.push([node, meters]);
    while(k){
      const above = (k - 1) >> 1;
      if(heap[above][1] <= meters) break;
      heap[k] = heap[above]; k = above;
    }
    heap[k] = [node, meters];
  }
  function pop(){
    const first = heap[0], last = heap.pop();
    if(!heap.length) return first;
    let k = 0;
    while(k * 2 + 1 < heap.length){
      let child = k * 2 + 1;
      if(child + 1 < heap.length && heap[child + 1][1] < heap[child][1]) child++;
      if(last[1] <= heap[child][1]) break;
      heap[k] = heap[child]; k = child;
    }
    heap[k] = last;
    return first;
  }
  edges.forEach((edge, i) => {
    if(!(edge.mb > 0)) return;
    if(edge.len >= gapM && edge.mb * 1000 < perKm * edge.len){ skipped += edge.mb; return; }
    const votes = new Map();
    for(const box of edge.boxes || []){
      const place = censusAt(box);
      if(place) votes.set(place, (votes.get(place) || 0) + (box[2] || 1));
    }
    let place, votesMax = 0;
    for(const [candidate, weight] of votes) if(weight > votesMax){ place = candidate; votesMax = weight; }
    const middle = edge.coords?.[Math.floor(edge.coords.length / 2)] || pts[edge.a];
    place ||= censusAt(middle);
    const id = seeds.length;
    seeds.push(i); places.push(place); parent.push(id);
    for(const node of [edge.a, edge.b]){
      if(owner[node] !== -1){ joins.push([0, owner[node], id]); continue; }
      owner[node] = id; distance[node] = 0; push(node, 0);
    }
  });
  while(heap.length){
    const [node, meters] = pop();
    if(meters !== distance[node]) continue;
    for(const arc of adj[node]){
      const next = meters + edges[arc.e].len;
      if(next > gapM || next >= distance[arc.to]) continue;
      owner[arc.to] = owner[node];
      distance[arc.to] = next;
      push(arc.to, next);
    }
  }
  for(const edge of edges){
    const a = owner[edge.a], b = owner[edge.b];
    const meters = distance[edge.a] + edge.len + distance[edge.b];
    if(a !== b && meters <= gapM) joins.push([meters, a, b]);
  }
  for(const [, left, right] of joins.sort((a, b) => a[0] - b[0])){
    const a = root(left), b = root(right);
    if(a === b || (places[a] && places[b] && places[a] !== places[b])) continue;
    parent[b] = a;
    places[a] ||= places[b];
  }

  const groups = new Map(), delivery = new Map();
  seeds.forEach((edge, id) => {
    const key = root(id);
    delivery.set(edge, key);
    if(!groups.has(key)) groups.set(key, { place:places[key], edgeIds:[], startDistance:Infinity, arrival:null });
  });
  // Keep local connecting roads in the same graph, including those with no
  // delivery points. Shared boundary junctions need no duplicated mailboxes.
  edges.forEach((edge, i) => {
    const a = owner[edge.a], b = owner[edge.b];
    const key = delivery.get(i) ?? (a >= 0 && b >= 0 && root(a) === root(b) ? root(a) : null);
    if(key == null) return;
    const group = groups.get(key);
    group.edgeIds.push(i);
    for(const node of [edge.a, edge.b]){
      const d = distanceM(start, pts[node]);
      if(d < group.startDistance){ group.startDistance = d; group.arrival = pts[node]; }
    }
  });
  const local = censusAt(start);
  const ordered = [...groups.values()].sort((a, b) => a.startDistance - b.startDistance);
  const main = ordered.find(x => (!local || x.place === local) && x.startDistance < 400);
  const areas = ordered.map(group => {
    const isMain = group === main, nodes = new Map(), points = [], links = [], streets = [];
    function node(id){
      if(!nodes.has(id)){ nodes.set(id, points.length); points.push(pts[id]); links.push([]); }
      return nodes.get(id);
    }
    for(const id of group.edgeIds){
      const edge = edges[id], a = node(edge.a), b = node(edge.b), index = streets.length;
      streets.push({ ...edge, a, b, mb:delivery.has(id) ? edge.mb : 0, boxes:delivery.has(id) ? edge.boxes || [] : [] });
      links[a].push({ e:index, to:b });
      if(a !== b) links[b].push({ e:index, to:a });
    }
    const place = group.place;
    const point = place ? [place.lat, place.lng] : group.arrival;
    return { isMain, place, start:isMain ? start : point, graph:{ pts:points, edges:streets, adj:links, zoned:true } };
  });
  return { areas, skipped };
}
