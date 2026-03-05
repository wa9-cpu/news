export type ResearchCreateResponse = { request_id: string };

export type FactItem = { fact_id: string; statement: string; source_refs: string[] };
export type ConflictItem = { conflict_id: string; description: string; source_refs: string[] };
export type GapItem = { question_or_gap: string; reason: string };

export type SourceItem = {
  source_id: string;
  url: string;
  platform: string;
  published_at?: string | null;
  credibility_score: number;
  rank: number;
};

export type ExploreCard = {
  card_id: string;
  headline_id: string;
  headline: string;
  image?: { url: string; position: "above_headline" };
  source_refs: string[];
};

export type ResearchResult = {
  request_id: string;
  status: "success" | "partial_success" | "failure";
  summary: {
    facts: FactItem[];
    conflicts: ConflictItem[];
    insufficient_data: GapItem[];
  };
  sources: SourceItem[];
  explore_more_cards: ExploreCard[];
};

export type ArticlePayload = {
  article_id: string;
  request_id: string;
  card_id: string;
  headline_id: string;
  headline: string;
  image_url?: string | null;
  body_sections: { heading: string; content: string; source_refs: string[] }[];
  conflicts: ConflictItem[];
  insufficient_data: GapItem[];
  source_refs: string[];
};

const BASE_URL = process.env.BACKEND_API_BASE_URL || "http://localhost:8000";

export async function createResearch(query: string): Promise<ResearchCreateResponse> {
  const res = await fetch(`${BASE_URL}/api/v1/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query })
  });
  if (!res.ok) throw new Error("Failed to create research");
  return res.json();
}

export async function getResearch(requestId: string): Promise<ResearchResult> {
  const res = await fetch(`${BASE_URL}/api/v1/research/${requestId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load research");
  return res.json();
}

export async function generateArticle(requestId: string, cardId: string, headlineId: string): Promise<ArticlePayload> {
  const res = await fetch(`${BASE_URL}/api/v1/article/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ request_id: requestId, card_id: cardId, headline_id: headlineId })
  });
  if (!res.ok) throw new Error("Failed to generate article");
  return res.json();
}

export async function getArticle(articleId: string): Promise<ArticlePayload> {
  const res = await fetch(`${BASE_URL}/api/v1/article/${articleId}`, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load article");
  return res.json();
}
