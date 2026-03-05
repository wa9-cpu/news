"use client";

import { useRouter } from "next/navigation";
import { ExploreCard, generateArticle } from "@/lib/api";
import { useState } from "react";

function Card(props: { requestId: string; card: ExploreCard }) {
  const { requestId, card } = props;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onClick() {
    setLoading(true);
    setError(null);
    try {
      const article = await generateArticle(requestId, card.card_id, card.headline_id);
      router.push(`/article/${article.article_id}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button type="button" onClick={onClick} disabled={loading}>
      {card.image?.url ? <img src={card.image.url} alt={card.headline} width={320} height={180} /> : null}
      <p>{card.headline}</p>
      {loading ? <p>Generating article...</p> : null}
      {error ? <p>{error}</p> : null}
    </button>
  );
}

export function ExploreMoreGrid(props: { requestId: string; cards: ExploreCard[] }) {
  return (
    <section>
      <h2>Explore More</h2>
      <div>
        {props.cards.map((card) => (
          <Card key={card.card_id} requestId={props.requestId} card={card} />
        ))}
      </div>
    </section>
  );
}
