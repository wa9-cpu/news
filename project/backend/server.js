const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const { LRUCache } = require("lru-cache");

const config = require("./config");
const { collectResearchDataset, cleanText } = require("./agents/researchAgent");
const { deduplicateArticles } = require("./agents/dedupeAgent");
const { synthesizeMasterSummary } = require("./agents/synthesizerAgent");
const { generateExploreTopics } = require("./agents/exploreAgent");
const { generateHeadlines } = require("./agents/headlineAgent");
const { generateImages } = require("./agents/imageAgent");

const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(morgan("dev"));

const frontendDir = path.join(__dirname, "../frontend");
app.use(express.static(frontendDir));

const resultCache = new LRUCache({ max: 120, ttl: config.CACHE_TTL_MS });
const inFlight = new Map();

function cacheKey(query) {
  return cleanText(String(query || "")).toLowerCase();
}

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

async function getOrRunQuery(query, forceRefresh = false) {
  const key = cacheKey(query);
  if (!key) throw new Error("Query must not be empty.");

  if (!forceRefresh) {
    const cached = resultCache.get(key);
    if (cached) return cached;
  }

  if (inFlight.has(key)) {
    return inFlight.get(key);
  }

  const promise = runPipeline(query)
    .then((result) => {
      resultCache.set(key, result);
      inFlight.delete(key);
      return result;
    })
    .catch((error) => {
      inFlight.delete(key);
      throw error;
    });

  inFlight.set(key, promise);
  return promise;
}

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "deep-factual-research" });
});

app.post("/api/research", async (req, res) => {
  try {
    const query = cleanText(req.body?.query || "");
    const forceRefresh = Boolean(req.body?.forceRefresh);
    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }

    const result = await getOrRunQuery(query, forceRefresh);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Research pipeline failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
});

app.post("/api/explore", async (req, res) => {
  try {
    const query = cleanText(req.body?.query || "");
    if (!query) return res.status(400).json({ error: "Query is required." });

    const result = await getOrRunQuery(query, false);
    return res.json({ query, explore_more: result.explore_more });
  } catch (error) {
    return res.status(500).json({
      error: "Explore topic generation failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
});

app.post("/api/article", async (req, res) => {
  try {
    const topic = cleanText(req.body?.topic || "");
    if (!topic) return res.status(400).json({ error: "Topic is required." });

    const result = await getOrRunQuery(topic, false);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Article generation failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(frontendDir, "index.html"));
});

app.listen(config.PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://0.0.0.0:${config.PORT}`);
});








