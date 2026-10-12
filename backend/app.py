import json
import os

from dotenv import load_dotenv
from flask import Flask, Response, jsonify, request, stream_with_context
from flask_cors import CORS

load_dotenv()

from knowledge import Index, format_context  # noqa: E402
from prompts import SYSTEM_PROMPT  # noqa: E402
from providers import PROVIDERS, ProviderError, available_providers  # noqa: E402

app = Flask(__name__)
CORS(
    app,
    resources={r"/api/*": {"origins": os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")}},
)

INDEX = Index().load()
MAX_MESSAGES = 30
MAX_CHARS = 8000


def clean_messages(raw):
    """Garde les 30 derniers messages valides, commençant et finissant par l'utilisateur."""
    out = []
    for m in (raw or [])[-MAX_MESSAGES:]:
        role = m.get("role")
        content = (m.get("content") or "").strip()
        if role in ("user", "assistant") and content:
            out.append({"role": role, "content": content[:MAX_CHARS]})
    while out and out[0]["role"] != "user":
        out.pop(0)
    return out


def sse(payload):
    return f"data: {json.dumps(payload, ensure_ascii=False)}\n\n"


@app.get("/api/health")
def health():
    return jsonify(status="ok")


@app.get("/api/providers")
def providers():
    return jsonify(providers=available_providers())


@app.get("/api/knowledge")
def knowledge_status():
    return jsonify(INDEX.status())


@app.post("/api/chat")
def chat():
    body = request.get_json(silent=True) or {}
    messages = clean_messages(body.get("messages"))
    if not messages or messages[-1]["role"] != "user":
        return jsonify(error="Message vide ou invalide."), 400

    configured = available_providers()
    if not configured:
        return jsonify(error="Aucune clé API configurée dans backend/.env"), 503

    provider_id = body.get("provider") or os.getenv("DEFAULT_PROVIDER") or configured[0]["id"]
    if provider_id not in PROVIDERS or provider_id not in [p["id"] for p in configured]:
        provider_id = configured[0]["id"]
    stream_fn = PROVIDERS[provider_id]["stream"]

    # Recherche dans les textes officiels : dernière question + question précédente (suivis)
    user_turns = [m["content"] for m in messages if m["role"] == "user"]
    chunks = INDEX.search(" ".join(user_turns[-2:]), k=6)
    system = SYSTEM_PROMPT + format_context(chunks)
    sources, seen = [], set()
    for c in chunks:
        if (c.title, c.label) not in seen:
            seen.add((c.title, c.label))
            sources.append({"title": c.title, "article": c.label})

    @stream_with_context
    def generate():
        try:
            if sources:
                yield sse({"sources": sources})
            for text in stream_fn(messages, system):
                yield sse({"text": text})
        except ProviderError as e:
            yield sse({"error": str(e)})
        except Exception as e:  # erreur réseau, quota, modèle invalide...
            app.logger.exception("Erreur fournisseur")
            yield sse({"error": "Le service IA a échoué. Réessayez dans un instant."})
        yield "data: [DONE]\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT", 5000)), debug=os.getenv("FLASK_DEBUG") == "1")
