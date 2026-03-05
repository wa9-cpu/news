"""Adapter implementations for deep research collection."""

from __future__ import annotations

import hashlib
import re
import xml.etree.ElementTree as ET
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx

from .models import (
    DeepResearchRequest,
    FailureCode,
    FailureRecord,
    RawCollectedItem,
    RawItemMetadata,
    SourceScope,
    utc_now_iso,
)


def _stable_item_id(platform: str, url: str, title: str | None) -> str:
    seed = f"{platform}|{url}|{title or ''}"
    digest = hashlib.sha1(seed.encode("utf-8"), usedforsecurity=False).hexdigest()[:12]
    return f"raw_{digest}"


def _to_iso(dt_value: str | None) -> str | None:
    if not dt_value:
        return None
    try:
        parsed = parsedate_to_datetime(dt_value)
        return parsed.astimezone(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    except Exception:
        return None


def _strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text or "").strip()


class MockWebAdapter:
    """Boundary adapter that returns raw text only for public content scopes.

    This adapter is used only as a last-resort fallback when live sources fail.
    """

    def collect(
        self,
        request: DeepResearchRequest,
        source_scope: SourceScope,
    ) -> tuple[list[RawCollectedItem], list[FailureRecord]]:
        urls = source_scope.seed_urls or [
            f"https://fallback.local/search?q={request.query.replace(' ', '+')}",
        ]

        items: list[RawCollectedItem] = []
        for url in urls:
            domain = urlparse(url).netloc or "fallback.local"
            items.append(
                RawCollectedItem(
                    item_id=_stable_item_id(source_scope.platform, url, request.query),
                    platform=source_scope.platform,
                    url=url,
                    canonical_url=url,
                    title=f"Fallback raw content for {request.query}",
                    author=None,
                    published_at=None,
                    collected_at=utc_now_iso(),
                    language=request.collection_limits.language[0] if request.collection_limits.language else "en",
                    content_type="article",
                    raw_text=(
                        "Fallback content generated because live source retrieval failed. "
                        "Replace with configured live connectors in production."
                    ),
                    raw_html=None,
                    metadata=RawItemMetadata(
                        engagement=None,
                        tags=source_scope.keywords,
                        source_domain=domain,
                        platform_native_id=None,
                    ),
                )
            )

        failures: list[FailureRecord] = []
        return items, failures


class GoogleNewsRSSAdapter:
    """Collect public news/blog entries from Google News RSS search."""

    def __init__(self, extra_terms: str = "") -> None:
        self._extra_terms = extra_terms.strip()

    def collect(
        self,
        request: DeepResearchRequest,
        source_scope: SourceScope,
    ) -> tuple[list[RawCollectedItem], list[FailureRecord]]:
        max_items = max(1, request.collection_limits.max_per_source)
        query_parts = [request.query]
        if self._extra_terms:
            query_parts.append(self._extra_terms)
        query_parts.extend(source_scope.keywords)
        query = " ".join(p for p in query_parts if p).strip()

        params = {
            "q": query,
            "hl": "en-US",
            "gl": "US",
            "ceid": "US:en",
        }
        rss_url = f"https://news.google.com/rss/search?{urlencode(params)}"

        items: list[RawCollectedItem] = []
        failures: list[FailureRecord] = []

        try:
            with httpx.Client(
                timeout=20,
                follow_redirects=True,
                headers={"User-Agent": "news-research-platform/0.2"},
            ) as client:
                response = client.get(rss_url)
                response.raise_for_status()
                root = ET.fromstring(response.text)

            for node in root.findall(".//item")[:max_items]:
                title = (node.findtext("title") or "").strip()
                link = (node.findtext("link") or "").strip()
                pub_date = _to_iso(node.findtext("pubDate"))
                description = _strip_html(node.findtext("description") or "")

                if not link:
                    continue
                domain = urlparse(link).netloc or "news.google.com"
                raw_text = " ".join(part for part in [title, description] if part).strip() or title

                items.append(
                    RawCollectedItem(
                        item_id=_stable_item_id(source_scope.platform, link, title),
                        platform=source_scope.platform,
                        url=link,
                        canonical_url=link,
                        title=title or None,
                        author=None,
                        published_at=pub_date,
                        collected_at=utc_now_iso(),
                        language=request.collection_limits.language[0] if request.collection_limits.language else "en",
                        content_type="article",
                        raw_text=raw_text,
                        raw_html=None,
                        metadata=RawItemMetadata(
                            engagement=None,
                            tags=source_scope.keywords,
                            source_domain=domain,
                            platform_native_id=None,
                        ),
                    )
                )
        except httpx.ReadTimeout as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.TIMEOUT,
                    error_message=f"RSS timeout: {exc}",
                    retryable=True,
                    failed_at=utc_now_iso(),
                )
            )
        except httpx.HTTPError as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.NETWORK_ERROR,
                    error_message=f"RSS network error: {exc}",
                    retryable=True,
                    failed_at=utc_now_iso(),
                )
            )
        except Exception as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.PARSING_ERROR,
                    error_message=f"RSS parse error: {exc}",
                    retryable=False,
                    failed_at=utc_now_iso(),
                )
            )

        return items, failures


class RedditPublicAdapter:
    """Collect public social posts from Reddit's public JSON search endpoint."""

    def collect(
        self,
        request: DeepResearchRequest,
        source_scope: SourceScope,
    ) -> tuple[list[RawCollectedItem], list[FailureRecord]]:
        max_items = max(1, request.collection_limits.max_per_source)
        params = {
            "q": request.query,
            "sort": "new",
            "limit": str(max_items),
            "restrict_sr": "false",
            "type": "link",
        }
        api_url = f"https://www.reddit.com/search.json?{urlencode(params)}"

        items: list[RawCollectedItem] = []
        failures: list[FailureRecord] = []

        try:
            with httpx.Client(
                timeout=20,
                follow_redirects=True,
                headers={"User-Agent": "news-research-platform/0.2"},
            ) as client:
                response = client.get(api_url)
                response.raise_for_status()
                payload: dict[str, Any] = response.json()

            children = payload.get("data", {}).get("children", [])
            for child in children[:max_items]:
                data: dict[str, Any] = child.get("data", {})
                permalink = data.get("permalink") or ""
                post_url = f"https://www.reddit.com{permalink}" if permalink else data.get("url")
                if not post_url:
                    continue

                title = (data.get("title") or "").strip()
                selftext = (data.get("selftext") or "").strip()
                created_utc = data.get("created_utc")
                published_at = None
                if created_utc is not None:
                    published_at = datetime.fromtimestamp(float(created_utc), tz=UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")

                raw_text = "\n\n".join(part for part in [title, selftext] if part).strip() or title
                items.append(
                    RawCollectedItem(
                        item_id=_stable_item_id(source_scope.platform, post_url, title),
                        platform=source_scope.platform,
                        url=post_url,
                        canonical_url=post_url,
                        title=title or None,
                        author=data.get("author") or None,
                        published_at=published_at,
                        collected_at=utc_now_iso(),
                        language=request.collection_limits.language[0] if request.collection_limits.language else "en",
                        content_type="post",
                        raw_text=raw_text,
                        raw_html=None,
                        metadata=RawItemMetadata(
                            engagement={
                                "score": data.get("score"),
                                "num_comments": data.get("num_comments"),
                            },
                            tags=source_scope.keywords,
                            source_domain="reddit.com",
                            platform_native_id=data.get("id"),
                        ),
                    )
                )
        except httpx.ReadTimeout as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.TIMEOUT,
                    error_message=f"Reddit timeout: {exc}",
                    retryable=True,
                    failed_at=utc_now_iso(),
                )
            )
        except httpx.HTTPError as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.NETWORK_ERROR,
                    error_message=f"Reddit network error: {exc}",
                    retryable=True,
                    failed_at=utc_now_iso(),
                )
            )
        except Exception as exc:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.PARSING_ERROR,
                    error_message=f"Reddit parse error: {exc}",
                    retryable=False,
                    failed_at=utc_now_iso(),
                )
            )

        return items, failures
