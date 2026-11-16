// Phase 1 "Hauptort zuerst": decision logic of the order wizard (worker/src/expand.js). Synthetic data (invented towns near
// Weidenberg / Bayreuth coordinates) – no maps, no network. Run: node test/expand.mjs
import { coverage, rankSuggestions, addSuggestion, startKey, placesApart } from '../worker/src/expand.js';
let fail = 0; const ok = (name, c, info) => { console.log((c ? 'ok   ' : 'FAIL ') + name + (info != null ? '  ' + info : '')); if(!c) fail++; };

const START = { lat:49.9424, lng:11.7290 };   // Weidenberg, Industriestraße 4
// census places around (as townsAround returns them): Bayreuth big and 11 km away, villages closer, a hamlet
const TOWNS = [
  { name:'Bayreuth', lat:49.9456, lng:11.5713, households:52271, dist:11300, dense:900 },
  { name:'Seybothenreuth', lat:49.8946, lng:11.7042, households:420, dist:5600, dense:140 },
  { name:'Emtmannsberg', lat:49.8930, lng:11.6480, households:380, dist:8000, dense:120 },
  { name:'Goldkronach', lat:50.0103, lng:11.6862, households:1300, dist:8300, dense:260 },
  { name:'Speichersdorf', lat:49.8710, lng:11.7820, households:2100, dist:8900, dense:300 },
  { name:'Weiler', lat:49.9500, lng:11.7600, households:40, dist:2400, dense:40 },
  { name:'weit weg', lat:50.3000, lng:11.9000, households:20000, dist:42000, dense:800 },
];

// A — Weidenberg 10.000, main place 1.528: missing shown, nothing added by itself, Bayreuth only as a suggestion
{ const c = coverage(10000, 1528);
  ok('A coverage: missing 8.472, not ok', c.missing === 8472 && !c.ok, JSON.stringify(c));
  const side = [];
  const sug = rankSuggestions(TOWNS, { start:START, side, missing:c.missing });
  ok('A suggestions exist, Bayreuth among them', sug.some(s => s.lat === 49.9456), sug.map(s => s.km).join(','));
  ok('A suggestions do not change the order (side stays empty)', side.length === 0);
  ok('A not only by density: a nearer place ranks before Bayreuth', sug.findIndex(s => s.lat === 49.9456) > 0, sug.map(s => s.households).join(','));
  // Phase 2A: small villages are no longer thrown out (was: hamlets < 300 households never suggested); the distance limit stays
  ok('A small place is suggested (Phase 2A); a far place (> 15 km) is not', sug.some(s => s.households === 40) && !sug.some(s => s.km > 15));
}
// B — the admin adds a suggestion: confirmed place, flyers recomputed by the caller
{ const sug = rankSuggestions(TOWNS, { start:START, side:[], missing:8472 }), b = sug.find(s => s.lat === 49.9456);
  let side = addSuggestion([], b, 'Bayreuth');
  ok('B added as confirmed Nebenstadt', side.length === 1 && side[0].confirmed && side[0].name === 'Bayreuth' && side[0].auto === true);
  const again = addSuggestion(side, b, 'Bayreuth');
  ok('B double click does not add twice', again === side && again.length === 1);
  const sug2 = rankSuggestions(TOWNS, { start:START, side, missing:1000 });
  ok('B a confirmed place is not suggested again', !sug2.some(s => s.lat === 49.9456));
  ok('B coverage after adding (planner result 10.030)', coverage(10000, 10030).ok && coverage(10000, 10030).missing === 0);
}
// C — removing a confirmed place: nothing comes back by itself (suggestions are only a list)
{ let side = addSuggestion([], { lat:49.9456, lng:11.5713, households:52271, km:11.3 }, 'Bayreuth'); side = side.filter(x => x.name !== 'Bayreuth');
  ok('C removed place stays removed', side.length === 0);
  ok('C coverage again with missing', coverage(10000, 1528).missing === 8472);
}
// E — enough in the main place: no warning, no search needed
{ const c = coverage(1500, 1528); ok('E enough: ok, missing 0', c.ok && c.missing === 0); }
// estimates above the order never give a negative shortfall; a broken result shows nothing as certain
{ ok('coverage never negative', coverage(1000, 1400).missing === 0);
  ok('coverage of a failed plan (NaN) is not a number shown as sure', coverage(1000, NaN).have === 0 || !isFinite(coverage(1000, NaN).have)); }
// F — start changed while searching: results for the old start are thrown away
{ const k1 = startKey(START), k2 = startKey({ lat:50.4215, lng:10.9105 });
  ok('F start keys differ (Weidenberg / Eisfeld)', k1 !== k2); }
// distant places: note for the admin
{ ok('places apart detected', placesApart(START, [{ lat:49.9456, lng:11.5713 }]) && !placesApart(START, [{ lat:49.9430, lng:11.7300 }])); }
console.log(fail ? fail + ' FAILED' : 'all ok'); process.exit(fail ? 1 : 0);
