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

function ensureParagraphs(summary) {
  const raw = String(summary || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return "No summary could be generated.";

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

async function runPipeline(query) {
  const dataset = await collectResearchDataset(query);
  const uniqueArticles = deduplicateArticles(dataset.articles || []);

  const masterSummary = ensureParagraphs(
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

app.listen(config.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend running on http://localhost:${config.PORT}`);
});
