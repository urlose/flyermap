// Admin-only Overpass proxy with cache. The browser asks us, we ask the (busy) public Overpass servers from the
// server side with a proper User-Agent, try several mirrors, and remember the answers for 30 days.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
const UA = "FlyerMap/1.0 (+https://github.com/urlose/flyermap)";
const TTL_MS = 30 * 24 * 3600 * 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha(text: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// first mirror at once, the next after 8 s (or at once when one fails); first good answer wins
export function overpass(q: string, timeoutMs = 70000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let done = false, failed = 0, next = 0, lastErr = "";
    const timers: number[] = [], ctrls: AbortController[] = [];
    const finish = (fn: (v: unknown) => void, v: unknown) => {
      if (done) return; done = true;
      timers.forEach(clearTimeout); ctrls.forEach((c) => { try { c.abort(); } catch { /* ignore */ } }); fn(v);
    };
    const launch = () => {
      if (done || next >= MIRRORS.length) return;
      const url = MIRRORS[next++], t0 = Date.now();
      if (next < MIRRORS.length) timers.push(setTimeout(launch, 8000));
      const ctrl = new AbortController(); ctrls.push(ctrl); timers.push(setTimeout(() => ctrl.abort(), timeoutMs));
      (async () => {
        try {
          const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA, "Accept": "application/json" }, body: "data=" + encodeURIComponent(q), signal: ctrl.signal });
          if (!r.ok) throw new Error(`${r.status}`);
          const j = await r.json();
          if (j && j.remark && /runtime error|out of memory|timed out/i.test(j.remark)) throw new Error("remark: " + j.remark);
          console.log("overpass ok", url, Date.now() - t0, "ms", JSON.stringify(j).length, "bytes");
          finish(resolve, j);
        } catch (e) {
          lastErr = `${url}: ${(e as Error).message}`;
          console.log("overpass fail", lastErr, Date.now() - t0, "ms");
          failed++;
          if (failed >= MIRRORS.length) finish(reject, new Error(lastErr)); else launch();
        }
      })();
    };
    launch();
  });
}

export async function handler(req: Request, deps: { createClient: typeof createClient; env: (k: string) => string | undefined; overpass: typeof overpass } ): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = deps.env("SUPABASE_URL")!, ANON = deps.env("SUPABASE_ANON_KEY")!, SRV = deps.env("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  const user = deps.createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error: ae } = await user.rpc("is_admin");
  if (ae || isAdmin !== true) return json({ error: "forbidden" }, 403);

  let body: { queries?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const qs = body.queries;
  if (!Array.isArray(qs) || qs.length < 1 || qs.length > 3 || qs.some((q) => typeof q !== "string" || q.length > 4000 || !q.startsWith("[out:json]"))) return json({ error: "bad queries" }, 400);

  const db = deps.createClient(URL_, SRV);
  try {
    const results = await Promise.all((qs as string[]).map(async (q) => {
      const key = await sha(q);
      const { data: hit } = await db.from("osm_cache").select("payload,created_at").eq("key", key).maybeSingle();
      if (hit && Date.now() - new Date(hit.created_at).getTime() < TTL_MS) { console.log("cache hit", key.slice(0, 8)); return hit.payload; }
      const j = await deps.overpass(q);
      const size = JSON.stringify(j).length;
      if (size < 25_000_000) await db.from("osm_cache").upsert({ key, payload: j, created_at: new Date().toISOString() });
      return j;
    }));
    return json({ results });
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

if (typeof Deno !== "undefined" && (Deno as { serve?: unknown }).serve && !Deno.env.get("OSM_TEST")) {
  Deno.serve((req) => handler(req, { createClient, env: (k) => Deno.env.get(k), overpass }));
}
