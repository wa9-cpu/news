"""Crew-style orchestration pipeline for the multi-agent workflow."""

from __future__ import annotations

from dataclasses import asdict

from news_research.agents.deep_research.adapters import MockWebAdapter
from news_research.agents.deep_research.agent import DeepResearchAgent
from news_research.agents.deep_research.models import (
    CollectionLimits,
    ComplianceRules,
    DeepResearchRequest,
    SourceScope,
    TimeRange,
)
from news_research.agents.factual_summary.agent import FactualSummaryAgent
from news_research.agents.headline.agent import HeadlineAgent
from news_research.agents.image.agent import ImageAgent
from news_research.agents.source_validation.agent import SourceValidationAgent
from news_research.schemas.contracts import (
    ArticlePayload,
    ConflictItem,
    ExploreCard,
    FactItem,
    GapItem,
    ImageItem,
    ResearchResult,
    SourceItem,
    SummaryPayload,
    new_id,
)


class CrewOrchestrator:
    """Orchestrates role-separated agents in fixed execution order."""

    def __init__(self, image_agent: ImageAgent):
        self._deep = DeepResearchAgent(adapters={"web": MockWebAdapter(), "news": MockWebAdapter(), "blog": MockWebAdapter(), "social": MockWebAdapter()})
        self._validate = SourceValidationAgent()
        self._summary = FactualSummaryAgent()
        self._headline = HeadlineAgent()
        self._image = image_agent

    async def run(self, request_id: str, query: str) -> tuple[ResearchResult, list[dict], dict]:
        stages: list[dict] = []

        stages.append({"stage": "collect", "status": "in_progress"})
        deep_req = DeepResearchRequest(
            request_id=request_id,
            task_id="task_collect",
            query=query,
            time_range=TimeRange(from_dt=None, to_dt=None),
            sources=[
                SourceScope(platform="news", keywords=[query]),
                SourceScope(platform="blog", keywords=[query]),
                SourceScope(platform="social", keywords=[query]),
            ],
            collection_limits=CollectionLimits(max_items=20, max_per_source=8, language=["en"]),
            compliance=ComplianceRules(
                public_content_only=True,
                no_summarization=True,
                no_inference=True,
                no_filtering=True,
            ),
        )
        deep_resp = self._deep.execute(deep_req)
        stages[-1] = {"stage": "collect", "status": deep_resp.status.value}

        stages.append({"stage": "validate", "status": "in_progress"})
        validated = self._validate.execute(deep_resp.collected_items)
        stages[-1] = {"stage": "validate", "status": "success" if validated else "failure"}

        stages.append({"stage": "summary", "status": "in_progress"})
        summary = self._summary.execute(validated, deep_resp.collected_items, query)
        stages[-1] = {"stage": "summary", "status": "success" if summary.facts else "partial_success"}

        stages.append({"stage": "headline", "status": "in_progress"})
        headlines = self._headline.execute(query, summary, validated)
        stages[-1] = {"stage": "headline", "status": "success" if headlines else "failure"}

        stages.append({"stage": "image", "status": "in_progress"})
        images = await self._image.execute(headlines)
        image_by_headline = {img.headline_id: img.url for img in images}
        stages[-1] = {"stage": "image", "status": "success" if images else "partial_success"}

        cards: list[ExploreCard] = []
        for idx, h in enumerate(headlines, start=1):
            cards.append(
                ExploreCard(
                    card_id=f"card_{idx:03d}",
                    headline_id=h.headline_id,
                    headline=h.text,
                    image=ImageItem(url=image_by_headline.get(h.headline_id, "https://placehold.co/640x360")),
                    source_refs=h.source_refs,
                )
            )

        status = "success"
        if deep_resp.status.value == "failure":
            status = "failure"
        elif deep_resp.failures:
            status = "partial_success"

        result = ResearchResult(
            request_id=request_id,
            status=status,
            summary=SummaryPayload(
                facts=[FactItem(fact_id=f.fact_id, statement=f.statement, source_refs=f.source_refs) for f in summary.facts],
                conflicts=[ConflictItem(conflict_id=c.conflict_id, description=c.description, source_refs=c.source_refs) for c in summary.conflicts],
                insufficient_data=[GapItem(question_or_gap=g.question_or_gap, reason=g.reason) for g in summary.insufficient_data],
            ),
            sources=[
                SourceItem(
                    source_id=s.source_id,
                    url=s.url,
                    platform=s.platform,
                    published_at=s.published_at,
                    credibility_score=s.credibility_score,
                    rank=s.rank,
                )
                for s in validated
            ],
            explore_more_cards=cards,
        )

        raw = {
            "deep_response": asdict(deep_resp),
            "validated": [asdict(v) for v in validated],
        }
        return result, stages, raw

    def generate_article(self, request_id: str, card_id: str, headline_id: str, headline: str, source_refs: list[str], summary_payload: SummaryPayload, image_url: str | None) -> ArticlePayload:
        facts = summary_payload.facts
        content = " ".join(f.statement for f in facts if set(f.source_refs) & set(source_refs)) or "Insufficient source-backed details available."

        return ArticlePayload(
            article_id=new_id("article"),
            request_id=request_id,
            card_id=card_id,
            headline_id=headline_id,
            headline=headline,
            image_url=image_url,
            body_sections=[
                {
                    "heading": headline,
                    "content": content,
                    "source_refs": source_refs,
                }
            ],
            conflicts=summary_payload.conflicts,
            insufficient_data=summary_payload.insufficient_data,
            source_refs=source_refs,
        )
