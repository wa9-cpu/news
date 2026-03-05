"""In-memory storage for research runs and generated articles."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from news_research.schemas.contracts import ArticlePayload, ResearchResult


@dataclass
class RunRecord:
    result: ResearchResult
    stages: list[dict[str, Any]]
    raw: dict[str, Any]


class MemoryStore:
    def __init__(self) -> None:
        self._runs: dict[str, RunRecord] = {}
        self._articles: dict[str, ArticlePayload] = {}

    def put_run(self, request_id: str, record: RunRecord) -> None:
        self._runs[request_id] = record

    def get_run(self, request_id: str) -> RunRecord | None:
        return self._runs.get(request_id)

    def put_article(self, article: ArticlePayload) -> None:
        self._articles[article.article_id] = article

    def get_article(self, article_id: str) -> ArticlePayload | None:
        return self._articles.get(article_id)
