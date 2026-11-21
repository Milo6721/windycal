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

    def do_POST(self):
        if self.path != "/api/estimate":
            return self.send_json(404, {"error": "not_found"})
        key = api_key()
        if not key:
            return self.send_json(503, {"error": "no_key"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
        except ValueError:
            return self.send_json(400, {"error": "bad_json"})
        text = str(body.get("text", "")).strip()
        if not text:
            return self.send_json(400, {"error": "empty"})
        if len(text) > 240:
            return self.send_json(400, {"error": "too_long"})
        spec = json.load(open(os.path.join(ROOT, "lib", "spec.json"), encoding="utf-8"))
        payload = {
            "systemInstruction": {"parts": [{"text": spec["system"]}]},
            "contents": [{"role": "user", "parts": [{"text": text}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": spec["schema"],
                "temperature": 0.2,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        model = os.environ.get("GEMINI_MODEL", spec["model"])
        req = urllib.request.Request(
            "https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent" % model,
            data=json.dumps(payload).encode(),
            headers={"content-type": "application/json", "x-goog-api-key": key},
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                msg = json.load(r)
        except urllib.error.HTTPError as e:
            sys.stderr.write("Gemini API %s: %s\n" % (e.code, e.read().decode(errors="replace")[:400]))
            return self.send_json(429 if e.code == 429 else 502, {"error": "upstream", "status": e.code})
        except Exception as e:
            sys.stderr.write("Gemini API unreachable: %s\n" % e)
            return self.send_json(502, {"error": "unreachable"})
        cands = msg.get("candidates") or []
        if not cands or not cands[0].get("content"):
            return self.send_json(200, {"is_food": False, "items": []})
        try:
            data = json.loads("".join(p.get("text", "") for p in cands[0]["content"].get("parts", [])))
        except ValueError:
            return self.send_json(502, {"error": "bad_output"})
        self.send_json(200, {"is_food": data.get("is_food") is not False, "items": data.get("items", [])})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    print("Windy is running at http://localhost:%d  (AI key %s)" % (PORT, "found" if api_key() else "not set: using the built-in food table"))
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
