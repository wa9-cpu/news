const { collectResearchDataset, cleanText } = require("../project/backend/agents/researchAgent");
const { deduplicateArticles } = require("../project/backend/agents/dedupeAgent");
const { synthesizeMasterSummary } = require("../project/backend/agents/synthesizerAgent");
const { generateExploreTopics } = require("../project/backend/agents/exploreAgent");
const { generateHeadlines } = require("../project/backend/agents/headlineAgent");
const { generateImages } = require("../project/backend/agents/imageAgent");

const SOCIAL_SOURCE_DOMAINS = [
  "x.com",
  "twitter.com",
  "t.co",
  "reddit.com",
  "redd.it",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "instagr.am",
  "threads.net",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
];

function normalizeMasterSummary(summary) {
  const raw = String(summary || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "No summary could be generated.";

  const structured =
    /(^|\n)Main Answer\s*$/im.test(raw) &&
    /(^|\n)Key Facts\s*$/im.test(raw) &&
    /(^|\n)Sources\s*$/im.test(raw) &&
    /(^|\n)Explore More\s*$/im.test(raw);

  if (structured) return raw;

  const parts = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 3) return parts.join("\n\n");

  const sentences = cleanText(raw).split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length < 9) return raw;

  const grouped = [
    sentences.slice(0, 3).join(" "),
    sentences.slice(3, 6).join(" "),
    sentences.slice(6).join(" "),
  ];
  return grouped.join("\n\n");
}

function isSocialLink(url) {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return SOCIAL_SOURCE_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function buildSocialFallbackSources(query) {
  const encoded = encodeURIComponent(String(query || "").trim());
  if (!encoded) return [];

  return [
    {
      title: `X search results for "${query}"`,
      source: "x.com",
      publication_date: "",
      link: `https://x.com/search?q=${encoded}&src=typed_query`,
      author: "",
    },
    {
      title: `Reddit search results for "${query}"`,
      source: "reddit.com",
      publication_date: "",
      link: `https://www.reddit.com/search/?q=${encoded}`,
      author: "",
    },
    {
      title: `Instagram search results for "${query}"`,
      source: "instagram.com",
      publication_date: "",
      link: `https://www.instagram.com/explore/search/keyword/?q=${encoded}`,
      author: "",
    },
    {
      title: `Threads search results for "${query}"`,
      source: "threads.net",
      publication_date: "",
      link: `https://www.threads.net/search?q=${encoded}`,
      author: "",
    },
    {
      title: `LinkedIn search results for "${query}"`,
      source: "linkedin.com",
      publication_date: "",
      link: `https://www.linkedin.com/search/results/all/?keywords=${encoded}`,
      author: "",
    },
    {
      title: `TikTok search results for "${query}"`,
      source: "tiktok.com",
      publication_date: "",
      link: `https://www.tiktok.com/search?q=${encoded}`,
      author: "",
    },
    {
      title: `Facebook search results for "${query}"`,
      source: "facebook.com",
      publication_date: "",
      link: `https://www.facebook.com/search/top/?q=${encoded}`,
      author: "",
    },
  ];
}

const AGENT_REGISTRY = {
  research: async ({ query }) => {
    const cleanQuery = cleanText(query || "");
    if (!cleanQuery) throw new Error("Query is required.");
    return collectResearchDataset(cleanQuery);
  },
  dedupe: async ({ articles }) => {
    const list = Array.isArray(articles) ? articles : [];
    return { articles: deduplicateArticles(list) };
  },
  synthesizer: async ({ query, articles }) => {
    const cleanQuery = cleanText(query || "");
    const list = Array.isArray(articles) ? articles : [];
    if (!cleanQuery) throw new Error("Query is required.");
    if (!list.length) throw new Error("Articles are required.");
    const summary = await synthesizeMasterSummary(cleanQuery, list);
    return { master_summary: normalizeMasterSummary(summary) };
  },
  explore: async ({ query, articles, master_summary }) => {
    const cleanQuery = cleanText(query || "");
    const list = Array.isArray(articles) ? articles : [];
    if (!cleanQuery) throw new Error("Query is required.");
    const summary = cleanText(master_summary || "");
    return { topics: await generateExploreTopics(cleanQuery, list, summary) };
  },
  headline: async ({ query, topics }) => {
    const cleanQuery = cleanText(query || "");
    const list = Array.isArray(topics) ? topics : [];
    if (!cleanQuery) throw new Error("Query is required.");
    if (!list.length) throw new Error("Topics are required.");
    return { headlines: await generateHeadlines(cleanQuery, list) };
  },
  image: async ({ headlines }) => {
    const list = Array.isArray(headlines) ? headlines : [];
    if (!list.length) throw new Error("Headlines are required.");
    return { images: await generateImages(list) };
  },
};

function listAgents() {
  return Object.keys(AGENT_REGISTRY).map((name) => ({
    name,
    status: "ready",
  }));
}

async function runPipeline(query) {
  const dataset = await collectResearchDataset(query);
  const uniqueArticles = deduplicateArticles(dataset.articles || []);

  const masterSummary = normalizeMasterSummary(
    await synthesizeMasterSummary(query, uniqueArticles)
  );

  const exploreTopics = await generateExploreTopics(
    query,
    uniqueArticles,
    masterSummary
  );
  const headlines = await generateHeadlines(query, exploreTopics);
  const imageUrls = await generateImages(headlines);

  const explore = exploreTopics.slice(0, 6).map((topic, idx) => ({
    topic,
    headline: headlines[idx] || topic,
    image_url: imageUrls[idx] || "",
  }));

  const sources = uniqueArticles.map((article) => ({
    title: article.title,
    source: article.source,
    publication_date: article.published_date || "",
    link: article.original_url,
    author: article.author || "",
  }));

  const existing = new Set(sources.map((src) => src.link));
  const fallbackSocial = buildSocialFallbackSources(query);
  fallbackSocial.forEach((entry) => {
    if (!existing.has(entry.link)) sources.push(entry);
  });

  return {
    query,
    master_summary: masterSummary,
    sources,
    explore_more: explore,
    meta: {
      ...dataset.meta,
      deduplicated_articles: uniqueArticles.length,
      generated_at: new Date().toISOString(),
    },
  };
}

module.exports = {
  runPipeline,
  normalizeMasterSummary,
  buildSocialFallbackSources,
  isSocialLink,
  AGENT_REGISTRY,
  listAgents,
  cleanText,
};
