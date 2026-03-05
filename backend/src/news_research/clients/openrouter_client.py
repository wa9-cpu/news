"""OpenRouter API client (backend-only)."""

from __future__ import annotations

from typing import Any

import httpx


class OpenRouterClient:
    def __init__(self, api_key: str, base_url: str, model: str) -> None:
        self._api_key = api_key
        self._base_url = base_url.rstrip("/")
        self._model = model

    def available(self) -> bool:
        return bool(self._api_key)

    async def chat(self, system_prompt: str, user_prompt: str) -> str:
        if not self._api_key:
            raise RuntimeError("OPENROUTER_API_KEY missing")

        payload: dict[str, Any] = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        }
        headers = {"Authorization": f"Bearer {self._api_key}"}
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(
                f"{self._base_url}/chat/completions",
                json=payload,
                headers=headers,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
