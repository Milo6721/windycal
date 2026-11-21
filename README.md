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

## Files

- `index.html`, `css/windy.css`, `js/*.js`: the site
- `api/estimate.js`: the serverless function (Gemini, structured JSON output)
- `lib/spec.json`: the prompt and JSON schema, shared by the function and `dev.py`
- `sw.js`, `manifest.webmanifest`, `icons/`: installable, works offline
