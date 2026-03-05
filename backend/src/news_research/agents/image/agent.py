"""Image Agent: informational image selection/generation only."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote_plus

from news_research.agents.headline.agent import HeadlineCandidate
from news_research.clients.nanobanana_client import NanoBananaClient


@dataclass(slots=True)
class ImageResult:
    headline_id: str
    url: str


class ImageAgent:
    """Boundary: no misleading visuals; no unsupported claims."""

    def __init__(self, client: NanoBananaClient):
        self._client = client

    async def execute(self, headlines: list[HeadlineCandidate]) -> list[ImageResult]:
        results: list[ImageResult] = []
        for headline in headlines:
            prompt = self._build_prompt(headline.text)
            if self._client.available():
                try:
                    url = await self._client.generate_thumbnail(prompt)
                except Exception:
                    url = self._fallback_url(headline.text)
            else:
                url = self._fallback_url(headline.text)
            results.append(ImageResult(headline_id=headline.headline_id, url=url))
        return results

    @staticmethod
    def _build_prompt(headline: str) -> str:
        return (
            "Informational, neutral news thumbnail. "
            f"Topic: {headline}. "
            "No dramatic or misleading visual claims."
        )

    @staticmethod
    def _fallback_url(headline: str) -> str:
        return f"https://placehold.co/640x360?text={quote_plus(headline)}"
