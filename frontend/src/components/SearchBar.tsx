"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createResearch } from "@/lib/api";

export function SearchBar() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!query.trim()) return;
    setLoading(true);
    try {
      const created = await createResearch(query.trim());
      router.push(`/results/${created.request_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <input
        aria-label="Search topic"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search a topic"
      />
      <button type="submit" disabled={loading}>{loading ? "Loading..." : "Search"}</button>
      {error ? <p>{error}</p> : null}
    </form>
  );
}
