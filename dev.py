#!/usr/bin/env python3
"""Local preview server for Windy (no Node needed).

Serves the static site and mirrors api/estimate.js at POST /api/estimate,
using the same prompt and schema from lib/spec.json. The key is read from
.env.local (GEMINI_API=...), which is never committed.

    python3 dev.py            # http://localhost:5173
"""
import json, os, sys, urllib.request, urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", sys.argv[1] if len(sys.argv) > 1 else 5173))


def api_key():
    key = os.environ.get("GEMINI_API", "") or os.environ.get("GEMINI_API_KEY", "")
    path = os.path.join(ROOT, ".env.local")
    if not key and os.path.exists(path):
        for line in open(path, encoding="utf-8"):
            name, _, val = line.strip().partition("=")
            if name in ("GEMINI_API", "GEMINI_API_KEY") and val:
                key = val.strip().strip('"').strip("'")
    return key


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_json(self, code, obj):
        data = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.split("?")[0].startswith(("/.env", "/.git")):
            return self.send_json(404, {"error": "not_found"})
        super().do_GET()

    _known = None

    def pick_models(self, key, spec, smart):
        """Asks Google which models this key can use and prefers the newest Flash ones, like api/estimate.js."""
        if Handler._known is None:
            try:
                req = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000", headers={"x-goog-api-key": key})
                with urllib.request.urlopen(req, timeout=5) as r:
                    data = json.load(r)
                Handler._known = [m["name"].split("/", 1)[-1] for m in data.get("models", []) if "generateContent" in m.get("supportedGenerationMethods", [])]
            except Exception:
                Handler._known = []
        import re
        flash = [n for n in Handler._known if re.match(r"^gemini-(\d+(\.\d+)?-)?flash(-lite)?(-latest)?$", n)]
        ver = lambda n: float((re.match(r"^gemini-(\d+(?:\.\d+)?)", n) or [None, 0])[1] or 0)
        lite = sorted([n for n in flash if "-lite" in n], key=ver, reverse=True)
        full = sorted([n for n in flash if "-lite" not in n], key=ver, reverse=True)
        found = full + lite if smart else lite + full
        models = [os.environ.get("GEMINI_MODEL")] + found + spec["models_smart" if smart else "models_fast"]
        return [m for m in dict.fromkeys(models) if m][:6]

    @staticmethod
    def lower(n):
        if isinstance(n, list):
            return [Handler.lower(x) for x in n]
        if isinstance(n, dict):
            return {k: (v.lower() if k == "type" and isinstance(v, str) else Handler.lower(v)) for k, v in n.items()}
        return n

    def gemini(self, key, spec, system, text, config, smart=False):
        """Tries the available models; asks again more simply when a newer model rejects an option.
        Returns the text, or None after answering with an error."""
        errors, limited = [], None
        for model in self.pick_models(key, spec, smart):
            cfg = dict(config)
            if model.startswith("gemini-2.0"):
                cfg.pop("thinkingConfig", None)
            for step in range(3):
                payload = {
                    "systemInstruction": {"parts": [{"text": system}]},
                    "contents": [{"role": "user", "parts": text if isinstance(text, list) else [{"text": text}]}],
                    "generationConfig": cfg,
                }
                req = urllib.request.Request(
                    "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model,
                    data=json.dumps(payload).encode(),
                    headers={"content-type": "application/json", "x-goog-api-key": key},
                )
                try:
                    with urllib.request.urlopen(req, timeout=9) as r:
                        msg = json.load(r)
                except urllib.error.HTTPError as e:
                    raw = e.read().decode(errors="replace")
                    try:
                        detail = str(json.loads(raw)["error"]["message"]).split("\n")[0][:160]
                    except Exception:
                        detail = raw[:160]
                    sys.stderr.write("Gemini %s %s: %s\n" % (model, e.code, detail))
                    if e.code in (401, 403) or (e.code == 400 and "api key" in detail.lower()):
                        self.send_json(503, {"error": "bad_key", "detail": detail})
                        return None
                    if e.code == 400 and step == 0 and "thinkingConfig" in cfg:
                        cfg.pop("thinkingConfig"); continue
                    if e.code == 400 and step <= 1 and "responseSchema" in cfg:
                        cfg["responseJsonSchema"] = self.lower(cfg.pop("responseSchema")); cfg.pop("thinkingConfig", None); continue
                    if e.code == 429:
                        limited = {"error": "rate_limited", "detail": "%s: %s" % (model, detail)}
                    errors.append("%s: %s %s" % (model, e.code, detail))
                    break
                except Exception:
                    errors.append("%s: no answer" % model)
                    break
                cands = msg.get("candidates") or []
                if not cands or not cands[0].get("content"):
                    return ""
                return "".join(p.get("text", "") for p in cands[0]["content"].get("parts", []) if not p.get("thought"))
        if limited and all((" 429 " in e or " 404 " in e) for e in errors):
            self.send_json(429, limited)
        else:
            self.send_json(502, {"error": "upstream", "detail": (next((e for e in errors if " 404 " not in e), errors[0] if errors else "no model answered"))[:220]})
        return None

    _boxes = {}  # local stand-in for the sync database: id -> (data, rev)

    def sync(self):
        """Same answers as api/sync.js, kept in memory while dev.py runs."""
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "bad_json"})
        box_id = str(body.get("id", ""))
        if not (len(box_id) == 64 and all(c in "0123456789abcdef" for c in box_id)):
            return self.send_json(400, {"error": "bad_id"})
        data, rev = Handler._boxes.get(box_id, (None, "0"))
        if body.get("op") == "rev":
            return self.send_json(200, {"rev": rev})
        if body.get("op") == "get":
            return self.send_json(200, {"data": data, "rev": rev})
        if body.get("op") == "put":
            if str(body.get("rev", "0")) != rev:
                return self.send_json(409, {"error": "conflict", "rev": rev})
            new_rev = str(int(rev) + 1)
            Handler._boxes[box_id] = (str(body.get("data", "")), new_rev)
            return self.send_json(200, {"ok": True, "rev": new_rev})
        return self.send_json(400, {"error": "bad_op"})

    def do_POST(self):
        if self.path == "/api/sync":
            return self.sync()
        if self.path != "/api/estimate":
            return self.send_json(404, {"error": "not_found"})
        key = api_key()
        if not key:
            return self.send_json(503, {"error": "no_key"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "bad_json"})
        spec = json.load(open(os.path.join(ROOT, "lib", "spec.json"), encoding="utf-8"))

        num = lambda v: max(0, min(100000, int(round(float(v or 0)))))
        if body.get("tip"):
            tip = body["tip"]
            y, g = tip.get("yesterday") or {}, tip.get("goal") or {}
            if not y.get("foods"):
                return self.send_json(400, {"error": "empty"})
            payload = {
                "language": "Polish" if tip.get("lang") == "pl" else "American English",
                "goal": {k: num(g.get(k)) for k in ("kcal", "protein", "carbs", "fat", "water")},
                "yesterday": {**{k: num(y.get(k)) for k in ("kcal", "protein", "carbs", "fat", "water")}, "foods": [str(f)[:120] for f in y["foods"][:30]]},
            }
            text = self.gemini(key, spec, spec["tip_system"], json.dumps(payload, ensure_ascii=False), {"temperature": 0.7, "thinkingConfig": {"thinkingBudget": 0}})
            if text is None:
                return
            return self.send_json(200, {"text": text.strip()[:300]}) if text.strip() else self.send_json(502, {"error": "bad_output"})

        if body.get("image"):
            img = body["image"]
            language = "Polish" if body.get("lang") == "pl" else "American English"
            parts = [{"inlineData": {"mimeType": "image/jpeg", "data": str(img.get("data", ""))}},
                     {"text": "Estimate this meal. Write names, portions and the meal description in %s." % language}]
            out = self.gemini(key, spec, spec["system"] + spec["photo_extra"], parts, {
                "responseMimeType": "application/json", "responseSchema": spec["schema"], "temperature": 0.2, "thinkingConfig": {"thinkingBudget": 0}})
            if out is None:
                return
            try:
                data = json.loads(out or "{}")
            except ValueError:
                return self.send_json(502, {"error": "bad_output"})
            return self.send_json(200, {"is_food": data.get("is_food") is not False, "items": data.get("items", []), "meal": str(data.get("meal", ""))[:120]})

        if body.get("summary"):
            body = body["summary"]
            days = (body.get("days") or [])[:31]
            if not days:
                return self.send_json(400, {"error": "empty"})
            num = lambda v: max(0, min(100000, int(round(float(v or 0)))))
            g = body.get("goal") or {}
            payload = {
                "scope": "week" if body.get("scope") == "week" else "day",
                "language": "Polish" if body.get("lang") == "pl" else "American English",
                "goal": {k: num(g.get(k)) for k in ("kcal", "protein", "carbs", "fat")},
                "days": [{
                    "date": str(d.get("date", ""))[:10],
                    "kcal": num(d.get("kcal")), "protein": num(d.get("protein")), "carbs": num(d.get("carbs")), "fat": num(d.get("fat")),
                    "foods": [str(f)[:120] for f in (d.get("foods") or [])[:30]],
                } for d in days],
            }
            text = self.gemini(key, spec, spec["summary_system"], json.dumps(payload, ensure_ascii=False), {"temperature": 0.6, "thinkingConfig": {"thinkingBudget": 0}})
            if text is None:
                return
            if not text.strip():
                return self.send_json(502, {"error": "bad_output"})
            return self.send_json(200, {"text": text.strip()})

        text = str(body.get("text", "")).strip()
        if not text:
            return self.send_json(400, {"error": "empty"})
        if len(text) > 240:
            return self.send_json(400, {"error": "too_long"})
        deep = body.get("deep") is True
        out = self.gemini(key, spec, spec["system"] + (spec["deep_extra"] if deep else ""), text, {
            "responseMimeType": "application/json",
            "responseSchema": spec["schema"],
            "temperature": 0.2,
            "thinkingConfig": {"thinkingBudget": 1024 if deep else 0},
        })
        if out is None:
            return
        if not out:
            return self.send_json(200, {"is_food": False, "items": []})
        try:
            data = json.loads(out)
        except ValueError:
            return self.send_json(502, {"error": "bad_output"})
        self.send_json(200, {"is_food": data.get("is_food") is not False, "items": data.get("items", [])})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print("Windy is running at http://localhost:%d  (AI key %s)" % (PORT, "found" if api_key() else "not set: using the built-in food table"))
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
