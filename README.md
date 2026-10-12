# Assistant foncier RDC

Chat IA spécialisé en droit foncier congolais. Flask (API, streaming) + React (interface type ChatGPT).

## Lancer

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # puis renseigner GEMINI_API_KEY
python app.py               # http://localhost:5000

# 2. Frontend (autre terminal)
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

## Changer de fournisseur IA
Renseignez la clé dans `backend/.env` (Gemini, Anthropic, ou OpenAI-compatible : Mistral, DeepSeek, Groq, Ollama via `OPENAI_BASE_URL`).
Pour Anthropic ou OpenAI : `pip install anthropic` ou `pip install openai`. Un sélecteur apparaît dans l'interface dès que plusieurs clés sont configurées.

## Adapter l'expertise
Le comportement juridique est dans `backend/prompts.py`. Pour de meilleures réponses, ajoutez-y les textes officiels que vous maîtrisez (extraits de loi, procédures et frais par province), ou branchez un RAG sur le Journal officiel.

## Production
```bash
gunicorn -w 2 --threads 8 -b 0.0.0.0:5000 app:app
cd frontend && npm run build   # servir dist/ ; définir VITE_API_URL si l'API est sur un autre domaine
```
Derrière nginx, gardez `proxy_buffering off;` sur `/api/` pour le streaming.

## Mises à jour légales
Le prompt intègre la réforme de 2025 (loi n° 25/62 modifiant la loi de 1973). Les décrets d'application sortent progressivement : gardez `GEMINI_GROUNDING=1` (recherche Google) et mettez à jour la section « Réforme foncière récente » de `backend/prompts.py` dès qu'un décret ou un arrêté est publié. Vérifiez le texte officiel du Journal officiel avant de durcir les affirmations.

## Textes officiels (base de connaissances)
Déposez les lois dans `backend/knowledge/` (.txt, .md, .pdf) et redémarrez : l'assistant retrouve les articles pertinents pour chaque question, s'en sert pour répondre et affiche les textes consultés sous la réponse. Voir `backend/knowledge/README.md` pour la liste des textes et où les trouver.
