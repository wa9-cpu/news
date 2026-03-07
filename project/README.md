# Deep Factual Research Web Application

Full stack public web application using a multi-agent backend and vanilla frontend.

## Project Structure

```
project/
  frontend/
    index.html
    styles.css
    script.js
    logo.svg
    favicon.svg
  backend/
    .env.example
    server.js
    config.js
    package.json
    agents/
      researchAgent.js
      dedupeAgent.js
      synthesizerAgent.js
      exploreAgent.js
      headlineAgent.js
      imageAgent.js
```

## Multi-Agent Pipeline

1. Research Agent
- Searches web indexes (Serper if configured, fallback Bing News RSS + DuckDuckGo)
- Follows links to original publisher pages
- Extracts full article text with Readability
- Returns structured article dataset

2. Deduplication Agent
- Removes duplicate URLs
- Removes mirrored/syndicated/near-duplicate article texts

3. Knowledge Synthesizer Agent
- Uses OpenRouter (preferred) or OpenAI if keys are configured
- Falls back to deterministic multi-paragraph synthesis if model calls fail

4. Explore Topic Agent
- Generates 6 related topic angles

5. Headline Agent
- Converts topics into news-style headlines

6. Image Agent
- Generates topic images with Nanobanana if configured
- Falls back to local SVG thumbnails when key is unavailable

## API Endpoints

- `GET /api/health`
- `POST /api/research` with `{ "query": "..." }`
- `POST /api/explore` with `{ "query": "..." }`
- `POST /api/article` with `{ "topic": "..." }`

## Local Run

1. Install dependencies:

```powershell
cd D:\code\news\project\backend
"C:\Program Files\nodejs\npm.cmd" install
```

2. Configure environment values:

```powershell
cd D:\code\news\project\backend
Copy-Item .env.example .env
```

Fill `.env` with your keys (recommended):
- `OPENROUTER_API_KEY`
- `SEARCH_API_KEY` (optional but strongly recommended for stable source retrieval)
- `NANOBANANA_API_KEY`

3. Start server:

```powershell
cd D:\code\news\project\backend
"C:\Program Files\nodejs\node.exe" server.js
```

4. Open in browser:
- `http://localhost:8080`

## Public Deployment (Render)

1. Push repository to GitHub.
2. Create a new Render Web Service.
3. Root Directory: `project/backend`
4. Build command:

```bash
npm install
```

5. Start command:

```bash
node server.js
```

6. Set environment variables in Render dashboard:
- `OPENROUTER_API_KEY` (or `OPENAI_API_KEY`)
- `SEARCH_API_KEY`
- `NANOBANANA_API_KEY`
- optional: `OPENROUTER_MODEL`, `OPENAI_MODEL`, `PORT`

7. Deploy and open the generated public URL.

## Notes

- No secrets are committed.
- Backend caches results and prevents duplicate in-flight requests.
- Frontend uses a `SOURCES` sidebar so source links stay outside summary body.
