// Selection policy for auto-filled nearby villages. Pure and offline.
// Run: node test/auto-nearby.mjs
import assert from 'node:assert/strict';
import { chooseNearbyPlaces, addSuggestion } from '../worker/src/expand.js';

const rows = [
  { id:'adj', lat:49.9, lng:11.7, households:300, km:0.8, adjacent:true },
  { id:'one', lat:49.91, lng:11.71, households:120, km:2, adjacent:false },
  { id:'two', lat:49.92, lng:11.72, households:220, km:3, adjacent:false },
  { id:'far', lat:49.95, lng:11.75, households:2000, km:17, adjacent:false },
  { id:'small', lat:49.93, lng:11.73, households:40, km:4, adjacent:false },
];
assert.deepEqual(chooseNearbyPlaces(rows, 0).map(x => x.id), []);
assert.deepEqual(chooseNearbyPlaces(rows, 300).map(x => x.id), ['one', 'two']);
assert.deepEqual(chooseNearbyPlaces(rows, 5000, { maxPlaces:1 }).map(x => x.id), ['one']);
assert.deepEqual(chooseNearbyPlaces(rows, 5000).map(x => x.id), ['one', 'two']);
assert.deepEqual(chooseNearbyPlaces([...rows, {...rows[1]}], 5000).map(x => x.id), ['one', 'two']);
const picked = chooseNearbyPlaces(rows, 300).reduce((side,x)=>addSuggestion(side,x,x.id), []);
assert.equal(picked.length,2);
assert.ok(picked.every(x => x.cid && x.confirmed && x.auto));
assert.equal(addSuggestion(picked,rows[1],'duplicate'),picked);
const edited = picked.map(x => ({...x})); edited[0].auto=false; edited[0].flyers=500;
assert.equal(edited[0].flyers,500);
assert.equal(edited[1].auto,true);
console.log('auto-nearby: 9 checks passed');
