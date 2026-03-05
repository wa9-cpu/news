"""Headline Agent: neutral headline generation with source traceability."""

from __future__ import annotations

from dataclasses import dataclass

from news_research.agents.factual_summary.agent import SummaryResult
from news_research.agents.source_validation.agent import ValidatedSource


@dataclass(slots=True)
class HeadlineCandidate:
    headline_id: str
    text: str
    source_refs: list[str]


class HeadlineAgent:
    """Boundary: no new claims, no sensational wording."""

    def execute(
        self,
        query: str,
        summary: SummaryResult,
        sources: list[ValidatedSource],
        max_headlines: int = 6,
    ) -> list[HeadlineCandidate]:
        refs = [s.source_id for s in sources[:3]]
        templates = [
            f"What validated sources say about {query}",
            f"Latest factual developments on {query}",
            f"Source-backed perspective: {query}",
            f"Documented reporting related to {query}",
            f"Evidence snapshot: {query}",
            f"Verified source overview of {query}",
        ]
        return [
            HeadlineCandidate(headline_id=f"head_{i:03d}", text=t, source_refs=refs)
            for i, t in enumerate(templates[:max_headlines], start=1)
        ]
