import { ExploreMoreGrid } from "@/components/ExploreMoreGrid";
import { SourcesList } from "@/components/SourcesList";
import { SummaryPanel } from "@/components/SummaryPanel";
import { getResearch } from "@/lib/api";

export default async function ResultsPage({ params }: { params: { requestId: string } }) {
  const data = await getResearch(params.requestId);

  return (
    <main>
      <h1>Results</h1>
      <p>Status: {data.status}</p>
      <SummaryPanel
        facts={data.summary.facts}
        conflicts={data.summary.conflicts}
        insufficientData={data.summary.insufficient_data}
      />
      <SourcesList sources={data.sources} />
      <ExploreMoreGrid requestId={params.requestId} cards={data.explore_more_cards} />
    </main>
  );
}
