"""Factual Summary Agent: evidence-grounded factual synthesis only."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

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

        for idx, src in enumerate(validated_sources[:6], start=1):
            raw = by_item.get(src.item_id)
            if not raw:
                continue

            domain = urlparse(src.url).netloc or "unknown-source"
            title = raw.title or "Untitled source item"
            excerpt = self._excerpt(raw.raw_text)
            date_text = raw.published_at or "date unavailable"

            if full_article:
                statement = (
                    f"{src.source_id} from {domain} lists title '{title}' and publication time '{date_text}'. "
                    f"Source excerpt: {excerpt}"
                )
            else:
                statement = (
                    f"{src.source_id}: '{title}' ({domain}, published {date_text}). "
                    f"Excerpt: {excerpt}"
                )
            facts.append(Fact(fact_id=f"fact_{idx:03d}", statement=statement, source_refs=[src.source_id]))

        conflicts = self._detect_conflicts(validated_sources, by_item)

        gaps: list[Gap] = []
        if len(validated_sources) < 2:
            gaps.append(
                Gap(
                    question_or_gap="Independent corroboration",
                    reason="Fewer than two validated sources available.",
                )
            )
        if not facts:
            gaps.append(
                Gap(
                    question_or_gap="Source evidence",
                    reason=f"No fact statements could be generated for query '{query}'.",
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

    @staticmethod
    def _excerpt(text: str, limit: int = 180) -> str:
        cleaned = " ".join((text or "").split())
        if len(cleaned) <= limit:
            return cleaned
        return cleaned[: limit - 3].rstrip() + "..."

    @staticmethod
    def _detect_conflicts(
        validated_sources: list[ValidatedSource],
        by_item: dict[str, RawCollectedItem],
    ) -> list[Conflict]:
        by_domain: dict[str, set[str]] = {}
        for src in validated_sources[:8]:
            raw = by_item.get(src.item_id)
            if not raw:
                continue
            domain = urlparse(src.url).netloc or "unknown-source"
            by_domain.setdefault(domain, set()).add((raw.title or "").strip())

        conflicts: list[Conflict] = []
        for domain, titles in by_domain.items():
            non_empty_titles = {t for t in titles if t}
            if len(non_empty_titles) > 1:
                refs = [s.source_id for s in validated_sources if (urlparse(s.url).netloc or "unknown-source") == domain][:3]
                conflicts.append(
                    Conflict(
                        conflict_id=f"conflict_{len(conflicts)+1:03d}",
                        description=(
                            f"Multiple differing titles were observed from {domain}; review source-level claims before drawing conclusions."
                        ),
                        source_refs=refs,
                    )
                )
        return conflicts
