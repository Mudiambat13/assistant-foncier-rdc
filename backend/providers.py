"""Fournisseurs LLM interchangeables. Chaque fonction est un générateur de texte (streaming)."""
import os


class ProviderError(Exception):
    pass


def _require(var: str) -> str:
    value = os.getenv(var)
    if not value:
        raise ProviderError(f"{var} est manquante dans backend/.env")
    return value


def gemini_stream(messages, system):
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=_require("GEMINI_API_KEY"))
    contents = [
        types.Content(
            role="user" if m["role"] == "user" else "model",
            parts=[types.Part(text=m["content"])],
        )
        for m in messages
    ]
    tools = None
    if os.getenv("GEMINI_GROUNDING", "0") == "1":
        # Recherche Google pour vérifier des textes récents
        tools = [types.Tool(google_search=types.GoogleSearch())]
    config = types.GenerateContentConfig(
        system_instruction=system, temperature=0.3, tools=tools
    )
    stream = client.models.generate_content_stream(
        model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
        contents=contents,
        config=config,
    )
    for chunk in stream:
        if chunk.text:
            yield chunk.text


def anthropic_stream(messages, system):
    import anthropic

    client = anthropic.Anthropic(api_key=_require("ANTHROPIC_API_KEY"))
    with client.messages.stream(
        model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
        max_tokens=2000,
        temperature=0.3,
        system=system,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            yield text


def openai_compatible_stream(messages, system):
    """OpenAI, Mistral, DeepSeek, Groq, Ollama... via OPENAI_BASE_URL."""
    from openai import OpenAI

    client = OpenAI(
        api_key=_require("OPENAI_API_KEY"),
        base_url=os.getenv("OPENAI_BASE_URL") or None,
    )
    stream = client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.3,
        stream=True,
        messages=[{"role": "system", "content": system}, *messages],
    )
    for chunk in stream:
        if chunk.choices and chunk.choices[0].delta.content:
            yield chunk.choices[0].delta.content


PROVIDERS = {
    "gemini": {"label": "Gemini", "env": "GEMINI_API_KEY", "stream": gemini_stream},
    "anthropic": {"label": "Claude", "env": "ANTHROPIC_API_KEY", "stream": anthropic_stream},
    "openai": {"label": "OpenAI-compatible", "env": "OPENAI_API_KEY", "stream": openai_compatible_stream},
}


def available_providers():
    return [
        {"id": pid, "label": p["label"]}
        for pid, p in PROVIDERS.items()
        if os.getenv(p["env"])
    ]
