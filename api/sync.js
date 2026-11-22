// Sync between your phone and computer. Each device encrypts everything with your sync code
// before sending it, so this function only ever stores a locked box it cannot open.
// Storage: an Upstash Redis database connected in Vercel (Storage → Upstash), which adds
// KV_REST_API_URL and KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) to the project.
//   { op: "rev", id }                → { rev }   (cheap check, asked every few seconds)
//   { op: "get", id }                → { data, rev }
//   { op: "put", id, data, rev }     → { ok: true, rev } or 409 { rev } when another device saved first

// Vercel names these with whatever prefix was chosen when connecting the database
// (KV_…, STORAGE_…, UPSTASH_REDIS_…), so any *_REST_API_URL / *_REST_API_TOKEN pair works.
function findStore() {
  const env = process.env;
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) return [env.KV_REST_API_URL, env.KV_REST_API_TOKEN];
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) return [env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN];
  for (const k of Object.keys(env)) {
    const m = k.match(/^(.*)_REST_API_URL$/) || k.match(/^(.*)_REDIS_REST_URL$/);
    if (!m) continue;
    const token = env[`${m[1]}_REST_API_TOKEN`] || env[`${m[1]}_REDIS_REST_TOKEN`];
    if (env[k] && token) return [env[k], token];
  }
  return [null, null];
}
const [URL_, TOKEN] = findStore();
const KEEP = 400 * 24 * 3600; // keep a box for 400 days after its last save

// Saves only if nobody else saved since this device last read it.
const PUT = `local r = redis.call('GET', KEYS[2]) or '0'
if r ~= ARGV[2] then return {0, r} end
local n = tostring(tonumber(r) + 1)
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[3])
redis.call('SET', KEYS[2], n, 'EX', ARGV[3])
return {1, n}`;

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
    signal: AbortSignal.timeout(8000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `redis ${r.status}`);
  return j.result;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "method_not_allowed" });
  const origin = req.headers.origin;
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch {}
    if (host !== req.headers.host) return res.status(403).json({ error: "forbidden" });
  }
  res.setHeader("Cache-Control", "no-store");
  if (!URL_ || !TOKEN) return res.status(503).json({ error: "no_store" });
  const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body) || {};
  const id = String(body.id || "");
  if (!/^[a-f0-9]{64}$/.test(id)) return res.status(400).json({ error: "bad_id" });
  const k = `windy:${id}`, kr = `windy:${id}:rev`;
  try {
    if (body.op === "rev") { // the cheap "anything new?" check
      const rev = await redis(["GET", kr]);
      return res.status(200).json({ rev: rev || "0" });
    }
    if (body.op === "get") {
      const [data, rev] = await redis(["MGET", k, kr]);
      return res.status(200).json({ data: data || null, rev: rev || "0" });
    }
    if (body.op === "put") {
      const data = String(body.data || "");
      if (!data || data.length > 3_500_000 || !/^[A-Za-z0-9+/=.]+$/.test(data)) return res.status(400).json({ error: "bad_data" });
      const [ok, rev] = await redis(["EVAL", PUT, "2", k, kr, data, String(body.rev || "0"), String(KEEP)]);
      return ok === 1 ? res.status(200).json({ ok: true, rev: String(rev) }) : res.status(409).json({ error: "conflict", rev: String(rev) });
    }
    return res.status(400).json({ error: "bad_op" });
  } catch (e) {
    console.error("sync", e.message);
    return res.status(502).json({ error: "store_failed" });
  }
}
