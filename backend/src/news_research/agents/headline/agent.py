"""Headline Agent: neutral headline generation with source traceability."""

from __future__ import annotations

from dataclasses import dataclass

from news_research.agents.deep_research.models import RawCollectedItem
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
        raw_items: list[RawCollectedItem],
        max_headlines: int = 6,
    ) -> list[HeadlineCandidate]:
        by_item = {item.item_id: item for item in raw_items}
        headlines: list[HeadlineCandidate] = []

        for idx, src in enumerate(sources[:max_headlines], start=1):
            raw = by_item.get(src.item_id)
            if not raw:
                continue

            if raw.title:
                text = raw.title.strip()
            else:
                text = f"Verified reporting related to {query}"

            headlines.append(
                HeadlineCandidate(
                    headline_id=f"head_{idx:03d}",
                    text=self._normalize(text, query),
                    source_refs=[src.source_id],
                )
            )

        if headlines:
            return headlines

        refs = [s.source_id for s in sources[:3]]
        templates = [
            f"What validated sources say about {query}",
            f"Latest factual developments on {query}",
            f"Source-backed perspective: {query}",
        ]
        return [
            HeadlineCandidate(headline_id=f"head_{i:03d}", text=t, source_refs=refs)
            for i, t in enumerate(templates, start=1)
        ]

    @staticmethod
    def _normalize(text: str, query: str) -> str:
        cleaned = " ".join(text.split())
        if len(cleaned) > 120:
            cleaned = cleaned[:117].rstrip() + "..."
        if query.lower() in cleaned.lower():
            return cleaned
        return f"{cleaned} ({query})"
