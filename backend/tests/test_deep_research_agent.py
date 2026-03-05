from __future__ import annotations

from news_research.agents.deep_research.agent import DeepResearchAgent
from news_research.agents.deep_research.models import (
    AgentStatus,
    CollectionLimits,
    ComplianceRules,
    DeepResearchRequest,
    FailureCode,
    FailureRecord,
    RawCollectedItem,
    RawItemMetadata,
    SourceScope,
    TimeRange,
    utc_now_iso,
)


class FakeAdapter:
    def __init__(self, items=None, failures=None, raises: Exception | None = None):
        self._items = items or []
        self._failures = failures or []
        self._raises = raises

    def collect(self, request, source_scope):
        if self._raises:
            raise self._raises
        return self._items, self._failures


def _request() -> DeepResearchRequest:
    return DeepResearchRequest(
        request_id="req-1",
        task_id="task-1",
        query="test query",
        time_range=TimeRange(from_dt=None, to_dt=None),
        sources=[SourceScope(platform="news")],
        collection_limits=CollectionLimits(max_items=10, max_per_source=10),
        compliance=ComplianceRules(
            public_content_only=True,
            no_summarization=True,
            no_inference=True,
            no_filtering=True,
        ),
    )


def _item(item_id: str) -> RawCollectedItem:
    return RawCollectedItem(
        item_id=item_id,
        platform="news",
        url=f"https://example.com/{item_id}",
        canonical_url=None,
        title="Title",
        author="Author",
        published_at="2026-03-05T00:00:00Z",
        collected_at=utc_now_iso(),
        language="en",
        content_type="article",
        raw_text="verbatim text",
        raw_html=None,
        metadata=RawItemMetadata(
            engagement=None,
            tags=[],
            source_domain="example.com",
            platform_native_id=None,
        ),
    )


def test_success_when_items_and_no_failures():
    agent = DeepResearchAgent(adapters={"news": FakeAdapter(items=[_item("1")])})
    response = agent.execute(_request())
    assert response.status == AgentStatus.SUCCESS
    assert response.stats.items_collected == 1
    assert response.stats.items_failed == 0


def test_partial_success_when_items_and_failures():
    failure = FailureRecord(
        source_ref="news",
        error_code=FailureCode.TIMEOUT,
        error_message="timeout",
        retryable=True,
        failed_at=utc_now_iso(),
    )
    agent = DeepResearchAgent(
        adapters={"news": FakeAdapter(items=[_item("1")], failures=[failure])}
    )
    response = agent.execute(_request())
    assert response.status == AgentStatus.PARTIAL_SUCCESS
    assert response.stats.items_collected == 1
    assert response.stats.items_failed == 1


def test_failure_when_no_items():
    agent = DeepResearchAgent(adapters={"news": FakeAdapter(items=[])})
    response = agent.execute(_request())
    assert response.status == AgentStatus.FAILURE


def test_unsupported_source_failure_recorded():
    req = _request()
    req.sources = [SourceScope(platform="social")]
    agent = DeepResearchAgent(adapters={"news": FakeAdapter(items=[_item("1")])})
    response = agent.execute(req)
    assert response.status == AgentStatus.FAILURE
    assert response.failures[0].error_code == FailureCode.UNSUPPORTED_SOURCE


def test_compliance_rules_enforced():
    req = _request()
    req.compliance.no_inference = False
    agent = DeepResearchAgent(adapters={"news": FakeAdapter(items=[_item("1")])})
    try:
        agent.execute(req)
        assert False, "Expected ValueError"
    except ValueError as exc:
        assert "no summarization" in str(exc)


def test_global_limit_caps_items():
    req = _request()
    req.collection_limits.max_items = 1
    agent = DeepResearchAgent(
        adapters={"news": FakeAdapter(items=[_item("1"), _item("2")])}
    )
    response = agent.execute(req)
    assert response.stats.items_collected == 1
