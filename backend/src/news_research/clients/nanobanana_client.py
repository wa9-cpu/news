"""NanoBanana API client (backend-only)."""

from __future__ import annotations

import httpx


class NanoBananaClient:
    def __init__(self, api_key: str, base_url: str) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")

    def available(self) -> bool:
        return bool(self._api_key)

    async def generate_thumbnail(self, prompt: str) -> str:
        if not self._api_key:
            raise RuntimeError("NANOBANANA_API_KEY missing")

        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self._base_url}/images",
                headers={"Authorization": f"Bearer {self._api_key}"},
                json={"prompt": prompt, "aspect_ratio": "16:9", "size": "thumbnail"},
            )
            response.raise_for_status()
            data = response.json()
            return data["image_url"]
