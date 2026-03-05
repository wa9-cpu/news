import { getArticle } from "@/lib/api";

export default async function ArticlePage({ params }: { params: { articleId: string } }) {
  const article = await getArticle(params.articleId);

  return (
    <main>
      <h1>{article.headline}</h1>
      {article.image_url ? <img src={article.image_url} alt={article.headline} width={640} height={360} /> : null}

      <section>
        {article.body_sections.map((s, idx) => (
          <article key={`${s.heading}-${idx}`}>
            <h2>{s.heading}</h2>
            <p>{s.content}</p>
            <p>Sources: {s.source_refs.join(", ")}</p>
          </article>
        ))}
      </section>

      <section>
        <h2>Sources</h2>
        <p>{article.source_refs.join(", ")}</p>
      </section>
    </main>
  );
}
