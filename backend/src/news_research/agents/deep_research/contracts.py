from __future__ import annotations

from dataclasses import asdict

from .models import (
    CollectionLimits,
    ComplianceRules,
    DeepResearchRequest,
    SourceScope,
    TimeRange,
)


def parse_request(payload: dict) -> DeepResearchRequest:
    return DeepResearchRequest(
        request_id=payload["request_id"],
        task_id=payload["task_id"],
        query=payload["query"],
        time_range=TimeRange(
            from_dt=payload.get("time_range", {}).get("from"),
            to_dt=payload.get("time_range", {}).get("to"),
        ),
        sources=[
            SourceScope(
                platform=s["platform"],
                seed_urls=s.get("seed_urls", []),
                keywords=s.get("keywords", []),
                handles_or_domains=s.get("handles_or_domains", []),
            )
            for s in payload.get("sources", [])
        ],
        collection_limits=CollectionLimits(
            max_items=payload["collection_limits"]["max_items"],
            max_per_source=payload["collection_limits"]["max_per_source"],
            language=payload["collection_limits"].get("language", []),
            include_deleted_unavailable_stub=payload["collection_limits"].get(
                "include_deleted_unavailable_stub", False
            ),
        ),
        compliance=ComplianceRules(
            public_content_only=payload["compliance"]["public_content_only"],
            no_summarization=payload["compliance"]["no_summarization"],
            no_inference=payload["compliance"]["no_inference"],
            no_filtering=payload["compliance"]["no_filtering"],
        ),
    )


def request_to_dict(request: DeepResearchRequest) -> dict:
    return asdict(request)
