"""FastAPI entrypoint for the multi-agent research platform."""

from __future__ import annotations

from fastapi import FastAPI, HTTPException

from news_research.agents.image.agent import ImageAgent
from news_research.clients.nanobanana_client import NanoBananaClient
from news_research.config import get_settings
from news_research.orchestration.pipeline import CrewOrchestrator
from news_research.schemas.contracts import (
    ArticleGenerateRequest,
    ArticlePayload,
    ResearchCreateResponse,
    ResearchRequest,
    ResearchResult,
    new_id,
)
from news_research.storage.memory_store import MemoryStore, RunRecord

settings = get_settings()
store = MemoryStore()
image_agent = ImageAgent(NanoBananaClient(settings.nanobanana_api_key, settings.nanobanana_base_url))
orchestrator = CrewOrchestrator(image_agent=image_agent)

app = FastAPI(title="Multi-Agent Research API", version="0.2.0")


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.post("/api/v1/research", response_model=ResearchCreateResponse)
async def create_research(request: ResearchRequest) -> ResearchCreateResponse:
    request_id = new_id("req")
    result, stages, raw = await orchestrator.run(request_id=request_id, query=request.query)
    store.put_run(request_id, RunRecord(result=result, stages=stages, raw=raw))
    return ResearchCreateResponse(request_id=request_id)


@app.get("/api/v1/research/{request_id}", response_model=ResearchResult)
def get_research(request_id: str) -> ResearchResult:
    record = store.get_run(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="request_id not found")
    return record.result


@app.get("/api/v1/research/{request_id}/sources")
def get_sources(request_id: str) -> dict:
    record = store.get_run(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="request_id not found")
    return {"request_id": request_id, "sources": record.result.sources}


@app.get("/api/v1/research/{request_id}/explore")
def get_explore(request_id: str) -> dict:
    record = store.get_run(request_id)
    if not record:
        raise HTTPException(status_code=404, detail="request_id not found")
    return {"request_id": request_id, "cards": record.result.explore_more_cards}


@app.post("/api/v1/article/generate", response_model=ArticlePayload)
def generate_article(payload: ArticleGenerateRequest) -> ArticlePayload:
    record = store.get_run(payload.request_id)
    if not record:
        raise HTTPException(status_code=404, detail="request_id not found")

    card = next((c for c in record.result.explore_more_cards if c.card_id == payload.card_id and c.headline_id == payload.headline_id), None)
    if not card:
        raise HTTPException(status_code=404, detail="card/headline not found")

    article = orchestrator.generate_article(
        request_id=payload.request_id,
        card_id=payload.card_id,
        headline_id=payload.headline_id,
        headline=card.headline,
        source_refs=card.source_refs,
        summary_payload=record.result.summary,
        image_url=card.image.url if card.image else None,
    )
    store.put_article(article)
    return article


@app.get("/api/v1/article/{article_id}", response_model=ArticlePayload)
def get_article(article_id: str) -> ArticlePayload:
    article = store.get_article(article_id)
    if not article:
        raise HTTPException(status_code=404, detail="article_id not found")
    return article
