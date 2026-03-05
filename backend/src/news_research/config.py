"""Configuration loaded from environment variables only."""

from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    openrouter_api_key: str = os.getenv("OPENROUTER_API_KEY", "")
    openrouter_base_url: str = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    openrouter_model: str = os.getenv("OPENROUTER_MODEL", "openai/gpt-4o-mini")
    nanobanana_api_key: str = os.getenv("NANOBANANA_API_KEY", "")
    nanobanana_base_url: str = os.getenv("NANOBANANA_BASE_URL", "https://api.nanobanana.example/v1")
    frontend_base_url: str = os.getenv("FRONTEND_BASE_URL", "http://localhost:3000")


def get_settings() -> Settings:
    return Settings()
