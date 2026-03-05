import { SourceItem } from "@/lib/api";

export function SourcesList({ sources }: { sources: SourceItem[] }) {
  return (
    <section>
      <h2>Sources</h2>
      <ul>
        {sources.map((s) => (
          <li key={s.source_id}>
            <a href={s.url} target="_blank" rel="noreferrer">{s.source_id}</a>
            <span> ({s.platform}) rank={s.rank} score={s.credibility_score.toFixed(1)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
