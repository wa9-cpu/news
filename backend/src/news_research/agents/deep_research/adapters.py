"""Adapter implementations for deep research collection."""

from __future__ import annotations

from urllib.parse import urlparse

from .models import DeepResearchRequest, FailureCode, FailureRecord, RawCollectedItem, RawItemMetadata, SourceScope, utc_now_iso


class MockWebAdapter:
    """Boundary adapter that returns raw text only for public content scopes.

    This is a safe default adapter for local development where external crawling is not wired yet.
    """

    def collect(
        self,
        request: DeepResearchRequest,
        source_scope: SourceScope,
    ) -> tuple[list[RawCollectedItem], list[FailureRecord]]:
        urls = source_scope.seed_urls or [
            f"https://news.example.com/search?q={request.query.replace(' ', '+')}",
            f"https://blog.example.com/posts/{request.query.replace(' ', '-')}",
        ]

        items: list[RawCollectedItem] = []
        for idx, url in enumerate(urls, start=1):
            domain = urlparse(url).netloc or "unknown.example"
            items.append(
                RawCollectedItem(
                    item_id=f"raw_{idx}_{abs(hash(url)) % 100000}",
                    platform=source_scope.platform,
                    url=url,
                    canonical_url=url,
                    title=f"Raw content for {request.query}",
                    author=None,
                    published_at=request.time_range.from_dt,
                    collected_at=utc_now_iso(),
                    language=request.collection_limits.language[0] if request.collection_limits.language else "en",
                    content_type="article",
                    raw_text=(
                        f"Verbatim source text for query '{request.query}' from {domain}. "
                        "This content is preserved as raw material for downstream validation."
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
        if not items:
            failures.append(
                FailureRecord(
                    source_ref=source_scope.platform,
                    error_code=FailureCode.NOT_FOUND,
                    error_message="No public content found",
                    retryable=False,
                    failed_at=utc_now_iso(),
                )
            )
        return items, failures
