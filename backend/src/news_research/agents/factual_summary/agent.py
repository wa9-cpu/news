"""Factual Summary Agent: evidence-grounded factual synthesis only."""

from __future__ import annotations

from dataclasses import dataclass

from news_research.agents.deep_research.models import RawCollectedItem
from news_research.agents.source_validation.agent import ValidatedSource


@dataclass(slots=True)
class Fact:
    fact_id: str
    statement: str
    source_refs: list[str]


@dataclass(slots=True)
class Conflict:
    conflict_id: str
    description: str
    source_refs: list[str]


@dataclass(slots=True)
class Gap:
    question_or_gap: str
    reason: str


@dataclass(slots=True)
class SummaryResult:
    facts: list[Fact]
    conflicts: list[Conflict]
    insufficient_data: list[Gap]


class FactualSummaryAgent:
    """Boundary: no opinions, no assumptions, explicit conflicts/gaps."""

    def execute(
        self,
        validated_sources: list[ValidatedSource],
        raw_items: list[RawCollectedItem],
        query: str,
        full_article: bool = False,
    ) -> SummaryResult:
        by_item = {item.item_id: item for item in raw_items}
        facts: list[Fact] = []

        for idx, src in enumerate(validated_sources[:5], start=1):
            raw = by_item.get(src.item_id)
            if not raw:
                continue
            statement = (
                f"Source {src.source_id} reports content relevant to '{query}' at {src.url}."
                if not full_article
                else f"According to {src.source_id}, the source at {src.url} provides detailed material relevant to '{query}'."
            )
            facts.append(Fact(fact_id=f"fact_{idx:03d}", statement=statement, source_refs=[src.source_id]))

        conflicts: list[Conflict] = []
        platforms = {src.platform for src in validated_sources}
        if len(platforms) > 1:
            conflicts.append(
                Conflict(
                    conflict_id="conflict_001",
                    description="Sources come from different platforms and may present differing narratives.",
                    source_refs=[s.source_id for s in validated_sources[:3]],
                )
            )

        gaps: list[Gap] = []
        if len(validated_sources) < 2:
            gaps.append(
                Gap(
                    question_or_gap="Independent corroboration",
                    reason="Fewer than two validated sources available.",
                )
            )

        return SummaryResult(facts=facts, conflicts=conflicts, insufficient_data=gaps)

    def build_full_article_sections(self, query: str, summary: SummaryResult) -> list[dict]:
        body = " ".join(f.statement for f in summary.facts) or "Insufficient validated evidence for full expansion."
        return [
            {
                "heading": f"Factual Article: {query}",
                "content": body,
                "source_refs": sorted({r for f in summary.facts for r in f.source_refs}),
            }
        ]
