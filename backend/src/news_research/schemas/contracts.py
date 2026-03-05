"""Shared API contracts for frontend/backend exchange."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, Field


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


class TimeRange(BaseModel):
    from_dt: str | None = Field(default=None, alias="from")
    to_dt: str | None = Field(default=None, alias="to")


class ResearchRequest(BaseModel):
    query: str = Field(min_length=2)
    time_range: TimeRange | None = None


class SourceItem(BaseModel):
    source_id: str
    url: str
    platform: str
    published_at: str | None = None
    credibility_score: float = Field(ge=0, le=100)
    rank: int = Field(ge=1)


class FactItem(BaseModel):
    fact_id: str
    statement: str
    source_refs: list[str]


class ConflictItem(BaseModel):
    conflict_id: str
    description: str
    source_refs: list[str]


class GapItem(BaseModel):
    question_or_gap: str
    reason: str


class ImageItem(BaseModel):
    url: str
    position: Literal["above_headline"] = "above_headline"


class ExploreCard(BaseModel):
    card_id: str
    headline_id: str
    headline: str
    image: ImageItem | None = None
    source_refs: list[str]


class SummaryPayload(BaseModel):
    facts: list[FactItem]
    conflicts: list[ConflictItem]
    insufficient_data: list[GapItem]


class ResearchResult(BaseModel):
    request_id: str
    status: Literal["success", "partial_success", "failure"]
    summary: SummaryPayload
    sources: list[SourceItem]
    explore_more_cards: list[ExploreCard]


class ResearchCreateResponse(BaseModel):
    request_id: str


class ArticleGenerateRequest(BaseModel):
    request_id: str
    card_id: str
    headline_id: str


class ArticleSection(BaseModel):
    heading: str
    content: str
    source_refs: list[str]


class ArticlePayload(BaseModel):
    article_id: str
    request_id: str
    card_id: str
    headline_id: str
    headline: str
    image_url: str | None = None
    body_sections: list[ArticleSection]
    conflicts: list[ConflictItem]
    insufficient_data: list[GapItem]
    source_refs: list[str]


class StageStatus(BaseModel):
    stage: str
    status: Literal["pending", "in_progress", "success", "partial_success", "failure"]
    message: str | None = None
