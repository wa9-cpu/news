import { FactItem, ConflictItem, GapItem } from "@/lib/api";

export function SummaryPanel(props: { facts: FactItem[]; conflicts: ConflictItem[]; insufficientData: GapItem[] }) {
  const { facts, conflicts, insufficientData } = props;
  return (
    <section>
      <h2>Factual Summary</h2>
      {facts.map((f) => (
        <p key={f.fact_id}>{f.statement} [{f.source_refs.join(", ")}]</p>
      ))}

      <h3>Conflicts</h3>
      {conflicts.length === 0 ? <p>None reported.</p> : conflicts.map((c) => <p key={c.conflict_id}>{c.description}</p>)}

      <h3>Insufficient Data</h3>
      {insufficientData.length === 0 ? <p>None reported.</p> : insufficientData.map((g) => <p key={g.question_or_gap}>{g.question_or_gap}: {g.reason}</p>)}
    </section>
  );
}
