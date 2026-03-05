# Multi-Agent Factual Research Platform

Public web application with a Next.js frontend and FastAPI backend.

## What is implemented

- Public-facing web app structure (search, results, explore cards, article page)
- Backend API routes for research and article generation
- Role-separated agents:
  - Deep Research Agent
  - Source Validation Agent
  - Factual Summary Agent
  - Headline Agent
  - Image Agent
- Crew-style orchestration pipeline
- OpenRouter and NanoBanana backend clients (env-driven)

## Security and API keys

Never commit secrets.

Use `.env.example` as template and replace placeholders:
- **INSERT YOUR OPENROUTER API KEY HERE**
- **INSERT YOUR NANOBANANA API KEY HERE**

Frontend env template:
- `frontend/.env.local.example`
- **INSERT YOUR API BASE URL HERE FOR DEPLOYMENTS**

## Local run (backend)

```powershell
cd D:\code\news
D:\code\news\.venv\Scripts\python.exe -m pip install -e .
D:\code\news\.venv\Scripts\python.exe -m uvicorn news_research.api.main:app --host 0.0.0.0 --port 8000 --reload
```

## Local run (frontend)

```powershell
cd D:\code\news\frontend
npm install
npm run dev
```

Open browser:
- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`

## Run tests

```powershell
cd D:\code\news
D:\code\news\.venv\Scripts\python.exe -m pytest -q
```

## Deployment plan

- Frontend deploy: Vercel (public URL)
- Backend deploy: Render/Fly.io/AWS/GCP (public API URL)
- Use platform environment variables for all secrets
- Set frontend `BACKEND_API_BASE_URL` to deployed backend URL

## Key API routes

- `POST /api/v1/research`
- `GET /api/v1/research/{request_id}`
- `GET /api/v1/research/{request_id}/sources`
- `GET /api/v1/research/{request_id}/explore`
- `POST /api/v1/article/generate`
- `GET /api/v1/article/{article_id}`
- `GET /health`
