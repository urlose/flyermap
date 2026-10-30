// Upload of the own map squares (tools/tiles/build.py) into the public storage bucket "tiles".
// No stored secret: only the GitHub workflow .github/workflows/tiles.yml of urlose/flyermap on main may upload.
// It proves that with its GitHub OIDC token (signed by GitHub, checked here against GitHub's public keys).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";

const JWKS = createRemoteJWKSet(new URL("https://token.actions.githubusercontent.com/.well-known/jwks"));
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const PATH = /^(\d{1,4}_-?\d{1,4}\.json\.gz|meta\.json)$/;

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const tok = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  try {
    const { payload } = await jwtVerify(tok, JWKS, { issuer: "https://token.actions.githubusercontent.com", audience: "flyermap-tiles" });
    if (payload.repository !== "urlose/flyermap" || payload.ref !== "refs/heads/main" || !String(payload.job_workflow_ref || payload.workflow_ref || "").startsWith("urlose/flyermap/.github/workflows/tiles.yml@")) return json({ error: "forbidden" }, 403);
  } catch (e) {
    return json({ error: "token: " + (e as Error).message }, 401);
  }
  let body: { files?: { path: string; b64: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
  const files = body.files;
  if (!Array.isArray(files) || !files.length || files.length > 200 || !files.every((f) => typeof f.path === "string" && PATH.test(f.path) && typeof f.b64 === "string")) return json({ error: "bad files" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const failed: string[] = [];
  await Promise.all(files.map(async (f) => {
    const bytes = Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0));
    const gz = f.path.endsWith(".gz");
    const { error } = await db.storage.from("tiles").upload("v4/" + f.path, bytes, { upsert: true, contentType: gz ? "application/gzip" : "application/json", cacheControl: gz ? "604800" : "3600" });
    if (error) failed.push(f.path + ": " + error.message);
  }));
  return json({ ok: failed.length === 0, stored: files.length - failed.length, failed: failed.slice(0, 5) }, failed.length ? 207 : 200);
});
