import assert from 'node:assert/strict';
import { customerGeoJSON } from '../worker/src/customerexport.js';

const task={title:'Beispielauftrag',est_mailboxes:40,work_hours:7,created_by:'private'};
const routes=[
  {mailboxes:20.5,worker_id:'worker-secret',minutes:540,
   path:[[50,8],[50,8.001],[50.1,8.1,1],[50.11,8.11]]},
  {mailboxes:15,worker_id:'other-secret',minutes:470,
   path:[[50,9],[50,9.001]]}
];
const data=customerGeoJSON(task,routes);
assert.equal(data.type,'FeatureCollection');
assert.equal(data.features[0].properties.estimatedFlyers,36);
assert.equal(data.features[0].geometry.type,'MultiLineString');
assert.equal(data.features[0].geometry.coordinates.length,3);
assert.deepEqual(data.features[0].geometry.coordinates[0],[[8,50],[8.001,50]]);
const json=JSON.stringify(data);
for(const secret of ['worker-secret','other-secret','created_by','work_hours','minutes','540','470'])assert.ok(!json.includes(secret),secret);
assert.equal(customerGeoJSON(task,[]).features[0].properties.estimatedFlyers,40);
console.log('Customer export: area/estimated flyers only; no private staff or hours');
