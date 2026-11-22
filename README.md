# Windy

A calm calorie counter. Write what you ate, in plain words; AI works out the calories, protein, carbs and fat.
Sister app to Stickly. Plain HTML, CSS and JavaScript modules, no build step. The only server part is `api/estimate.js`.

## Run it locally

```bash
python3 dev.py
```

Then open http://localhost:5173. Without a key, Windy uses its small built-in food table (entries marked "rough estimate").
To use the real AI locally, copy `.env.example` to `.env.local` and paste your key after `GEMINI_API=`.

## Set up the AI (once)

1. Get a key: https://aistudio.google.com/apikey → **Create API key**. Copy it.
2. Put the project on GitHub, then in Vercel: **Add New → Project → Import** the repository. Framework preset: **Other**. No build command.
3. In Vercel: **Project → Settings → Environment Variables** → Name `GEMINI_API` (underscore, Vercel does not allow hyphens), Value: your key → **Save**.
4. **Deployments → Redeploy** so the function picks up the key.

The key lives only in Vercel. The browser talks to `/api/estimate`, never to Gemini directly.
To try another model, add a `GEMINI_MODEL` variable (default is in `lib/spec.json`).

## Set up sync between phone and computer (once)

Sync keeps a locked copy of your data on the server; only your devices can open it (it is encrypted with your sync code before it leaves the device).

1. In Vercel, open your project → **Storage** → **Create Database** → choose **Upstash for Redis** (free plan is plenty) → **Create**.
2. When asked, **Connect** it to this project (all environments). Vercel adds `KV_REST_API_URL` and `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`) by itself.
3. **Deployments → Redeploy**.
4. In Windy on your computer: **Settings → Sync between devices → Turn on sync → Copy link for your other device**, then open that link on your phone. Or type the code on the phone and tap **Join**.

Without the database, Settings says "Sync needs a database on the server first".

## Files

- `index.html`, `css/windy.css`, `js/*.js`: the site
- `api/estimate.js`: Gemini: food estimates (text and photos), the AI summary and the morning tip
- `api/sync.js`: stores the encrypted sync box in Upstash Redis
- `lib/spec.json`: the prompt and JSON schema, shared by the function and `dev.py`
- `sw.js`, `manifest.webmanifest`, `icons/`: installable, works offline
