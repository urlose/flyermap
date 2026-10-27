// Admin-only cache for Overpass answers. (Fetching from here does not work: overpass-api.de answers 406 to the
// data-centre addresses of this platform and the other mirrors time out.) The browser downloads the map data
// itself and stores it here, so the same area is instant the next time, for every admin.
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const TTL_MS = 30 * 24 * 3600 * 1000;
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function sha(text: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function handler(req: Request, deps: { createClient: typeof createClient; env: (k: string) => string | undefined }): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const URL_ = deps.env("SUPABASE_URL")!, ANON = deps.env("SUPABASE_ANON_KEY")!, SRV = deps.env("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = req.headers.get("Authorization") || "";
  const user = deps.createClient(URL_, ANON, { global: { headers: { Authorization: auth } } });
  const { data: isAdmin, error: ae } = await user.rpc("is_admin");
  if (ae || isAdmin !== true) return json({ error: "forbidden" }, 403);

  let body: { mode?: string; queries?: unknown; items?: unknown };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const okQ = (q: unknown) => typeof q === "string" && q.length <= 4000 && q.startsWith("[out:json]");
  const db = deps.createClient(URL_, SRV);
  try {
    if (body.mode === "get") {
      const qs = body.queries;
      if (!Array.isArray(qs) || qs.length < 1 || qs.length > 3 || !qs.every(okQ)) return json({ error: "bad queries" }, 400);
      const results = await Promise.all((qs as string[]).map(async (q) => {
        const key = await sha(q);
        const { data: hit } = await db.from("osm_cache").select("payload,created_at").eq("key", key).maybeSingle();
        return hit && Date.now() - new Date(hit.created_at).getTime() < TTL_MS ? hit.payload : null;
      }));
      return json({ results });
    }
    if (body.mode === "put") {
      const items = body.items as { q: unknown; payload: unknown }[];
      if (!Array.isArray(items) || items.length < 1 || items.length > 3 || !items.every((i) => okQ(i.q) && i.payload && typeof i.payload === "object" && Array.isArray((i.payload as { elements?: unknown }).elements))) return json({ error: "bad items" }, 400);
      for (const i of items) {
        const key = await sha(i.q as string);
        await db.from("osm_cache").upsert({ key, payload: i.payload, created_at: new Date().toISOString() });
      }
      return json({ ok: true });
    }
    return json({ error: "bad mode" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 502);
  }
}

if (typeof Deno !== "undefined" && (Deno as { serve?: unknown }).serve && !Deno.env.get("OSM_TEST")) {
  Deno.serve((req) => handler(req, { createClient, env: (k) => Deno.env.get(k) }));
}
