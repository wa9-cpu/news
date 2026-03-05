from __future__ import annotations

from datetime import UTC, datetime
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


class AgentStatus(str, Enum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


class FailureCode(str, Enum):
    NETWORK_ERROR = "NETWORK_ERROR"
    TIMEOUT = "TIMEOUT"
    ACCESS_DENIED = "ACCESS_DENIED"
    NOT_FOUND = "NOT_FOUND"
    PARSING_ERROR = "PARSING_ERROR"
    RATE_LIMIT = "RATE_LIMIT"
    UNSUPPORTED_SOURCE = "UNSUPPORTED_SOURCE"
    UNKNOWN = "UNKNOWN"


@dataclass(slots=True)
class TimeRange:
    from_dt: str | None
    to_dt: str | None


@dataclass(slots=True)
class SourceScope:
    platform: str
    seed_urls: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    handles_or_domains: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CollectionLimits:
    max_items: int
    max_per_source: int
    language: list[str] = field(default_factory=list)
    include_deleted_unavailable_stub: bool = False


@dataclass(slots=True)
class ComplianceRules:
    public_content_only: bool
    no_summarization: bool
    no_inference: bool
    no_filtering: bool


@dataclass(slots=True)
class DeepResearchRequest:
    request_id: str
    task_id: str
    query: str
    time_range: TimeRange
    sources: list[SourceScope]
    collection_limits: CollectionLimits
    compliance: ComplianceRules


@dataclass(slots=True)
class RawItemMetadata:
    engagement: dict[str, Any] | None
    tags: list[str]
    source_domain: str
    platform_native_id: str | None


@dataclass(slots=True)
class RawCollectedItem:
    item_id: str
    platform: str
    url: str
    canonical_url: str | None
    title: str | None
    author: str | None
    published_at: str | None
    collected_at: str
    language: str | None
    content_type: str
    raw_text: str
    raw_html: str | None
    metadata: RawItemMetadata


@dataclass(slots=True)
class FailureRecord:
    source_ref: str
    error_code: FailureCode
    error_message: str
    retryable: bool
    failed_at: str


@dataclass(slots=True)
class Stats:
    attempted_sources: int
    successful_sources: int
    items_collected: int
    items_failed: int


@dataclass(slots=True)
class DeepResearchResponse:
    request_id: str
    task_id: str
    agent: str
    status: AgentStatus
    collected_items: list[RawCollectedItem]
    failures: list[FailureRecord]
    stats: Stats


def utc_now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")
