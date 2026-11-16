// Customer-safe GeoJSON export: ONLY the delivered area and estimated flyer count.
// No staff identities, work duration, GPS sessions, status, or internal quotas.
export function customerGeoJSON(task, plans = []){
  const tracks = [];
  for(const p of plans){
    let run=[];
    for(const pt of p.path || []){
      if(!Array.isArray(pt) || !Number.isFinite(+pt[0]) || !Number.isFinite(+pt[1]))continue;
      if(pt[2] === 1 && run.length>1)tracks.push(run);
      if(pt[2] === 1)run=[];
      run.push([+pt[1],+pt[0]]); // GeoJSON: [longitude, latitude]
    }
    if(run.length>1)tracks.push(run);
  }
  const count = plans.length
    ? plans.reduce((s,p)=>s+Math.round(Number(p.mailboxes)||0),0)
    : Math.round(Number(task.est_mailboxes)||0);
  return {type:'FeatureCollection',features:[{
    type:'Feature',
    properties:{
      title:String(task.title||'Verteilgebiet'),
      estimatedFlyers:Math.max(0,count),
      estimate:true
    },
    geometry:{type:'MultiLineString',coordinates:tracks}
  }]};
}
