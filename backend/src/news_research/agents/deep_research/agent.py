from __future__ import annotations

from dataclasses import asdict

from .boundaries import SourceAdapter
from .models import (
    AgentStatus,
    ComplianceRules,
    DeepResearchRequest,
    DeepResearchResponse,
    FailureCode,
    FailureRecord,
    RawCollectedItem,
    Stats,
    utc_now_iso,
)


class DeepResearchAgent:
    """Deep research collector with strict role boundary enforcement.

    Boundary contract:
    - This agent only gathers raw content and metadata.
    - It never summarizes, infers, or filters conflicting viewpoints.
    """

    def __init__(self, adapters: dict[str, SourceAdapter]):
        self._adapters = adapters

    def execute(self, request: DeepResearchRequest) -> DeepResearchResponse:
        self._validate_compliance(request.compliance)

        collected_items: list[RawCollectedItem] = []
        failures: list[FailureRecord] = []
        successful_sources = 0

        for scope in request.sources:
            adapter = self._resolve_adapter(scope.platform)
            if adapter is None:
                failures.append(
                    FailureRecord(
                        source_ref=scope.platform,
                        error_code=FailureCode.UNSUPPORTED_SOURCE,
                        error_message=f"No adapter configured for platform '{scope.platform}'",
                        retryable=False,
                        failed_at=utc_now_iso(),
                    )
                )
                continue

            try:
                items, source_failures = adapter.collect(request=request, source_scope=scope)
                items = self._cap_items(items, request.collection_limits.max_per_source)
                collected_items.extend(items)
                failures.extend(source_failures)
                if items:
                    successful_sources += 1
            except Exception as exc:  # pragma: no cover - defensive catch
                failures.append(
                    FailureRecord(
                        source_ref=scope.platform,
                        error_code=FailureCode.UNKNOWN,
                        error_message=str(exc),
                        retryable=True,
                        failed_at=utc_now_iso(),
                    )
                )

        collected_items = self._cap_items(collected_items, request.collection_limits.max_items)

        status = self._derive_status(collected_items=collected_items, failures=failures)
        response = DeepResearchResponse(
            request_id=request.request_id,
            task_id=request.task_id,
            agent="deep_research_agent",
            status=status,
            collected_items=collected_items,
            failures=failures,
            stats=Stats(
                attempted_sources=len(request.sources),
                successful_sources=successful_sources,
                items_collected=len(collected_items),
                items_failed=len(failures),
            ),
        )
        return response

    @staticmethod
    def to_dict(response: DeepResearchResponse) -> dict:
        return asdict(response)

    def _resolve_adapter(self, platform: str) -> SourceAdapter | None:
        return self._adapters.get(platform) or self._adapters.get("web")

    @staticmethod
    def _validate_compliance(rules: ComplianceRules) -> None:
        if not (
            rules.public_content_only
            and rules.no_summarization
            and rules.no_inference
            and rules.no_filtering
        ):
            raise ValueError(
                "DeepResearchAgent requires public-only collection with no summarization, inference, or filtering."
            )

    @staticmethod
    def _cap_items(items: list[RawCollectedItem], max_items: int) -> list[RawCollectedItem]:
        return items[:max_items]

    @staticmethod
    def _derive_status(
        collected_items: list[RawCollectedItem], failures: list[FailureRecord]
    ) -> AgentStatus:
        if collected_items and not failures:
            return AgentStatus.SUCCESS
        if collected_items and failures:
            return AgentStatus.PARTIAL_SUCCESS
        return AgentStatus.FAILURE
