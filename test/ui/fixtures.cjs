// Synthetic data for the UI preview (test/ui/preview.cjs) – invented people and orders, never shown in the real app.
const now = Date.now(), iso = ms => new Date(ms).toISOString(), day = n => new Date(now + n * 864e5).toISOString().slice(0, 10);
const CO = 'c0000000-0000-0000-0000-000000000001';
const box = (lat, lng, dy, dx) => [[lat - dy, lng - dx], [lat - dy, lng + dx], [lat + dy, lng + dx], [lat + dy, lng - dx]];
const zig = (lat, lng, dy, dx, n) => { const p = []; for(let i = 0; i < n; i++){ const y = lat - dy + 2 * dy * i / (n - 1); p.push([y, lng - dx], [y, lng + dx]); } return p.map(q => [+q[0].toFixed(6), +q[1].toFixed(6)]); };
const W = [
  ['w1', 'Anna Beispiel', 51.2105, 6.7810, true], ['w2', 'Boris Muster', 51.2065, 6.7700, true], ['w3', 'Clara Test', null, null, false],
  ['w4', 'Dmitri Probe', null, null, false], ['w5', 'Emil Demo', 51.2300, 6.7900, false], ['w6', 'Fatima Vorlage', null, null, false],
];
const workers = W.map(([id, name, lat, lng, live], i) => ({ id, name, phone:'+49 151 0000000' + i, cities:[{ name:i % 2 ? 'Düsseldorf' : 'Neuss', lat:i % 2 ? 51.2277 : 51.2042, lng:i % 2 ? 6.7735 : 6.6879 }],
  zone_minutes:60, notes:null, start_anywhere:false, last_lat:lat, last_lng:lng, last_seen:live ? iso(now - 60e3) : lat ? iso(now - 5 * 36e5) : iso(now - 3 * 864e5),
  nav_lat:null, nav_lng:null, nav_at:null, active_route_id:live ? 'r-live-' + id : null, created_at:iso(now - 30 * 864e5), company_id:CO, verified:i < 2 }));
const t1 = { id:'t1', title:'Bilk · Moorenstraße 18', city_name:'Düsseldorf', district:'Bilk', start_lat:51.2075, start_lng:6.7755, status:'open', flyers:6000, deadline:day(3), work_date:day(0),
  zone_polygon:box(51.2075, 6.7755, .008, .014), work_area:null, travel:'bus', created_at:iso(now - 2 * 864e5), company_id:CO, quota_m30:2500, work_hours:7, work_days:2, notes:'Bitte Hinterhöfe mitnehmen.', est_mailboxes:6100 };
const t2 = { id:'t2', title:'FITYES Weidenberg', city_name:'Weidenberg', district:null, start_lat:49.9424, start_lng:11.7290, status:'open', flyers:10000, deadline:day(6), work_date:null,
  zone_polygon:[], work_area:null, travel:'zones', created_at:iso(now - 864e5), company_id:CO, quota_m30:2500, work_hours:7, work_days:5, notes:null, est_mailboxes:10030 };
const t3 = { id:'t3', title:'Neuss Innenstadt', city_name:'Neuss', district:'Innenstadt', start_lat:51.2010, start_lng:6.6900, status:'done', flyers:4000, deadline:day(-4), work_date:day(-6),
  zone_polygon:box(51.2010, 6.6900, .006, .010), work_area:null, travel:'bus', created_at:iso(now - 9 * 864e5), company_id:CO, quota_m30:2500, work_hours:7, work_days:1, notes:null, est_mailboxes:3950, flyers_done:3980 };
const t4 = { id:'t4', title:'Oberkassel (gezeichnetes Gebiet)', city_name:'Düsseldorf', district:'Oberkassel', start_lat:51.2335, start_lng:6.7530, status:'open', flyers:3000, deadline:day(-1), work_date:null,
  zone_polygon:box(51.2335, 6.7530, .005, .009), work_area:[[51.238, 6.745], [51.239, 6.760], [51.229, 6.762], [51.228, 6.746]], travel:'bus', created_at:iso(now - 3 * 864e5), company_id:CO, quota_m30:2500, work_hours:7, work_days:2, notes:null, est_mailboxes:2950 };
const tasks = [t1, t2, t3, t4].map(t => ({ must_areas:null, side_towns:null, bike:false, split:null, no_quota:false, merged_into:null, cores:false, together:false, first_place:null, route_m:null, street_m:null, walk_minutes:15, ...t }));
const P = (id, task_id, idx, worker_id, status, path, mb, place) => ({ id, task_id, idx, worker_id, status, color:['#2563EB', '#16A34A', '#D97706', '#7C3AED'][idx % 4], path, mailboxes:mb, minutes:mb / 4,
  length_m:path.length * 120, street_m:path.length * 100, work_dates:status === 'accepted' || status === 'done' ? [day(0)] : [], days:[{ length_m:path.length * 120, minutes:mb / 4, mailboxes:mb, place }], steps:[], boxes:[], skipped:[], days_left:null, late_dates:false, late_ok:false, created_at:iso(now - 864e5), reserve:[] });
const task_plans = [
  P('p1', 't1', 0, 'w1', 'accepted', zig(51.2045, 6.7755, .004, .012, 8), 3050), P('p2', 't1', 1, 'w2', 'accepted', zig(51.2110, 6.7755, .004, .012, 8), 3000),
  P('p3', 't2', 0, 'w3', 'offered', zig(49.9410, 11.7190, .004, .006, 6), 760, 'Weidenberg'), P('p4', 't2', 1, null, 'open', zig(49.9440, 11.7180, .003, .005, 6), 770, 'Weidenberg'),
  P('p5', 't2', 2, 'w3', 'offered', zig(49.9460, 11.5750, .012, .020, 10), 4250, 'Bayreuth'), P('p6', 't2', 3, null, 'open', zig(49.9420, 11.5850, .012, .018, 10), 4250, 'Bayreuth'),
  P('p7', 't3', 0, 'w4', 'done', zig(51.2010, 6.6900, .005, .009, 8), 3980),
  P('p8', 't4', 0, null, 'open', zig(51.2335, 6.7530, .004, .008, 6), 2950),
];
const task_workers = task_plans.filter(p => p.worker_id).map(p => ({ task_id:p.task_id, worker_id:p.worker_id }));
const routes = [
  { id:'r-live-w1', worker_id:'w1', task_id:'t1', plan_id:'p1', paused_at:null, last30_m:1300, started_at:iso(now - 2 * 36e5), ended_at:null, break_s:0, distance_m:5200, place:'Bilk, Düsseldorf', adj_s:0, together_s:0 },
  { id:'r-live-w2', worker_id:'w2', task_id:'t1', plan_id:'p2', paused_at:iso(now - 5 * 60e3), last30_m:800, started_at:iso(now - 3 * 36e5), ended_at:null, break_s:600, distance_m:7400, place:'Bilk, Düsseldorf', adj_s:0, together_s:0 },
  { id:'r-old-1', worker_id:'w4', task_id:'t3', plan_id:'p7', paused_at:null, last30_m:0, started_at:iso(now - 6 * 864e5), ended_at:iso(now - 6 * 864e5 + 7 * 36e5), break_s:1800, distance_m:18000, place:'Neuss', adj_s:0, together_s:0 },
];
const help_requests = [{ id:'h1', worker_id:'w1', task_id:'t1', plan_id:'p1', reason:'blocked', text:'Straße gesperrt (Baustelle)', lat:51.2050, lng:6.7700, created_at:iso(now - 40 * 60e3), resolved_at:null, company_id:CO }];
const company = { id:CO, name:'Fityes', master:false, join_code:'DEMO1234', complete:true, avv_ok:true };
const worker_stats = workers.map((w, i) => ({ id:w.id, name:w.name, verified:i < 2, done:[3, 2, 1, 0, 0, 0][i], hours:[28.1, 14.7, 6.2, 0, 0, 0][i], days:[5, 3, 1, 0, 0, 0][i], pace:[145, 98, 79, null, null, null][i], cancels:0, late:0 }));
const company_stats = { tasks:[{ id:'t3', title:'Neuss Innenstadt', flyers:4000, hours:11.2, km:31, people:1, first:day(-6), status:'done' }, { id:'t1', title:'Bilk · Moorenstraße 18', flyers:6000, hours:5, km:12.6, people:2, first:day(0), status:'open' }],
  top:[{ id:'w4', name:'Dmitri Probe', hours:11.2, days:1 }, { id:'w1', name:'Anna Beispiel', hours:3, days:1 }],
  daily:Array.from({ length:14 }, (_, i) => ({ d:day(i - 13), hours:[0, 4, 6, 0, 7, 8, 0, 3, 5, 6, 0, 7, 4, 5][i], km:[0, 9, 14, 0, 18, 20, 0, 7, 12, 15, 0, 16, 10, 12][i], orders:i % 3 ? 1 : 0, people:i % 2 + 1 })) };
// a piece reported as not walkable (orange) on the first route, not decided yet
task_plans[0].skipped = [{ rep:true, why:'blocked', by:'Lena', at:new Date(Date.now() - 3600e3).toISOString(), pts:[[51.2040, 6.7645], [51.2042, 6.7680]] }];
module.exports = { CO, tables:{ workers, tasks, task_plans, task_workers, routes, help_requests, notifications:[], studios:[], companies:[{ id:CO, name:'Fityes' }], admin_phone_invites:[], route_points:[], route_together:[] },
  rpc:{ become_admin:true, my_company_info:company, worker_stats, company_stats, company_tracks:{ t1:[[51.2040, 6.7645], [51.2040, 6.7700], [51.2043, 6.7760], [51.2046, 6.7820]] }, wa_enabled:false, company_contract:{ cancel_hours:24, penalty_eur:50, version:1, text:null }, get_bot:null, master_overview:null } };
