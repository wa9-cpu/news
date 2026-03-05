"""Source Validation Agent: dedupe and credibility ranking only."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from news_research.agents.deep_research.models import RawCollectedItem


@dataclass(slots=True)
class ValidatedSource:
    source_id: str
    item_id: str
    url: str
    platform: str
    published_at: str | None
    credibility_score: float
    rank: int


class SourceValidationAgent:
    """Boundary: no rewriting and no conflict filtering."""

    def execute(self, items: list[RawCollectedItem]) -> list[ValidatedSource]:
        deduped: dict[str, RawCollectedItem] = {}
        for item in items:
            key = item.canonical_url or item.url
            if key not in deduped:
                deduped[key] = item

        validated: list[ValidatedSource] = []
        for i, item in enumerate(deduped.values(), start=1):
            domain = urlparse(item.url).netloc
            score = self._score(item.platform, domain, item.published_at)
            validated.append(
                ValidatedSource(
                    source_id=f"src_{i:03d}",
                    item_id=item.item_id,
                    url=item.url,
                    platform=item.platform,
                    published_at=item.published_at,
                    credibility_score=score,
                    rank=0,
                )
            )

        validated.sort(key=lambda s: s.credibility_score, reverse=True)
        for i, src in enumerate(validated, start=1):
            src.rank = i
        return validated

    @staticmethod
    def _score(platform: str, domain: str, published_at: str | None) -> float:
        base = 55.0
        if "news" in platform:
            base += 18
        if domain.count(".") >= 1:
            base += 10
        if published_at:
            base += 7
        return min(base, 100.0)
