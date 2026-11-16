// Customer-only GeoJSON of APPROXIMATE delivery areas and estimated flyers.
// No staff identities, routes in walking order, durations, GPS, or internal quotas.
function hull(points){
  const p=[...new Map(points.map(([x,y])=>[x.toFixed(6)+','+y.toFixed(6),[x,y]])).values()]
    .sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  if(p.length<3)return p;
  const low=[],high=[];
  for(const x of p){while(low.length>=2&&cross(low.at(-2),low.at(-1),x)<=0)low.pop();low.push(x);}
  for(let i=p.length-1;i>=0;i--){const x=p[i];while(high.length>=2&&cross(high.at(-2),high.at(-1),x)<=0)high.pop();high.push(x);}
  return low.slice(0,-1).concat(high.slice(0,-1));
}
function areaRing(points){
  if(!points.length)return null;
  const polygon=hull(points);
  if(polygon.length>=3)return [...polygon,polygon[0]];
  const lat=points.reduce((a,p)=>a+p[1],0)/points.length;
  const dx=25/(111320*Math.cos(lat*Math.PI/180)),dy=25/111320;
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
  const a=Math.min(...xs)-dx,b=Math.max(...xs)+dx,c=Math.min(...ys)-dy,d=Math.max(...ys)+dy;
  return [[a,c],[b,c],[b,d],[a,d],[a,c]];
}
export function customerGeoJSON(task, plans = []){
  const areas=[];
  for(const plan of plans){
    let segment=[];
    const close=()=>{if(segment.length>=2){const r=areaRing(segment);if(r)areas.push([r]);}segment=[];};
    for(const pt of plan.path || []){
      if(!Array.isArray(pt)||!Number.isFinite(+pt[0])||!Number.isFinite(+pt[1]))continue;
      if(pt[2]===1)close();
      segment.push([+pt[1],+pt[0]]); // GeoJSON [longitude, latitude]
    }
    close();
  }
  const n=plans.length?plans.reduce((s,p)=>s+Math.round(Number(p.mailboxes)||0),0)
    :Math.round(Number(task.est_mailboxes)||0);
  return {type:'FeatureCollection',features:[{
    type:'Feature',properties:{
      title:String(task.title||'Verteilgebiet'),
      estimatedFlyers:Math.max(0,n),
      approximateArea:true
    },
    geometry:{type:'MultiPolygon',coordinates:areas}
  }]};
}
