"""Image Agent: informational image selection/generation only."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
from urllib.parse import quote

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
        # Self-contained SVG placeholder avoids dependency on external image hosts.
        text = escape(headline[:80])
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'>"
            "<rect width='640' height='360' fill='#e6e6e6'/>"
            "<rect x='16' y='16' width='608' height='328' fill='none' stroke='#b0b0b0'/>"
            f"<text x='32' y='185' font-size='22' fill='#333' font-family='Arial, sans-serif'>{text}</text>"
            "</svg>"
        )
        return f"data:image/svg+xml;utf8,{quote(svg)}"
