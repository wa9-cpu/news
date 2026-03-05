from __future__ import annotations

from typing import Protocol

from .models import DeepResearchRequest, FailureRecord, RawCollectedItem, SourceScope


# Boundary: adapters may read external sources, but they must return raw content only.
class SourceAdapter(Protocol):
    def collect(
        self,
        request: DeepResearchRequest,
        source_scope: SourceScope,
    ) -> tuple[list[RawCollectedItem], list[FailureRecord]]:
        """Collect raw items for one source scope without summarization or inference."""
