const axios = require("axios");
const config = require("../config");
const { cleanText } = require("./researchAgent");

const OPENAI_KEY_PLACEHOLDER_PATTERNS = [
  /INSERT_YOUR_OPENAI_API_KEY_HERE/i,
  /^YOUR_OPENAI_API_KEY$/i,
  /^sk-svcacct-/i,
];

const OPENROUTER_KEY_PLACEHOLDER_PATTERNS = [
  /INSERT_YOUR_OPENROUTER_API_KEY_HERE/i,
  /^YOUR_OPENROUTER_API_KEY$/i,
  /^sk-or-v1-your/i,
];

const ALLOWED_OPENAI_MODELS = new Set(["gpt-4o", "gpt-4.1", "gpt-4o-mini"]);

function trimValue(value) {
  return String(value || "").trim();
}

function normalizeBaseUrl(baseUrl, fallback) {
  const base = trimValue(baseUrl) || fallback;
  return base.replace(/\/+$/, "");
}

function buildChatCompletionsUrl(baseUrl, fallback) {
  return `${normalizeBaseUrl(baseUrl, fallback)}/chat/completions`;
}

function hasUsableKey(value, placeholderPatterns) {
  const key = trimValue(value);
  if (!key) return false;
  if (placeholderPatterns.some((pattern) => pattern.test(key))) return false;
  return true;
}

function looksLikeOpenRouterKey(value) {
  return /^sk-or-v1-/i.test(trimValue(value));
}

function hasOpenAiKey() {
  return hasUsableKey(config.OPENAI_API_KEY, OPENAI_KEY_PLACEHOLDER_PATTERNS);
}

function hasOpenRouterKey() {
  return hasUsableKey(
    config.OPENROUTER_API_KEY,
    OPENROUTER_KEY_PLACEHOLDER_PATTERNS
  );
}

function resolveOpenAiModelName() {
  const configured = trimValue(config.OPENAI_MODEL);
  if (ALLOWED_OPENAI_MODELS.has(configured)) return configured;

  if (configured) {
    console.warn(
      `[Synthesizer] Unsupported OPENAI_MODEL='${configured}'. Falling back to 'gpt-4.1'.`
    );
  }

  return "gpt-4.1";
}

function resolveOpenRouterModelName() {
  const configured = trimValue(config.OPENROUTER_MODEL);
  if (configured) return configured;
  return "openai/gpt-4o-mini";
}

function resolveProvider() {
  if (hasOpenRouterKey()) {
    return {
      name: "openrouter",
      model: resolveOpenRouterModelName(),
      url: buildChatCompletionsUrl(
        config.OPENROUTER_BASE_URL,
        "https://openrouter.ai/api/v1"
      ),
      headers: {
        Authorization: `Bearer ${trimValue(config.OPENROUTER_API_KEY)}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          trimValue(config.OPENROUTER_HTTP_REFERER) || "http://localhost:8080",
        "X-Title":
          trimValue(config.OPENROUTER_APP_TITLE) || "Deep Factual Research Engine",
      },
    };
  }

  const openAiKey = trimValue(config.OPENAI_API_KEY);

  if (looksLikeOpenRouterKey(openAiKey)) {
    return {
      name: "openrouter",
      model: resolveOpenRouterModelName(),
      url: buildChatCompletionsUrl(
        config.OPENROUTER_BASE_URL,
        "https://openrouter.ai/api/v1"
      ),
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer":
          trimValue(config.OPENROUTER_HTTP_REFERER) || "http://localhost:8080",
        "X-Title":
          trimValue(config.OPENROUTER_APP_TITLE) || "Deep Factual Research Engine",
      },
    };
  }

  if (hasOpenAiKey()) {
    return {
      name: "openai",
      model: resolveOpenAiModelName(),
      url: buildChatCompletionsUrl(
        config.OPENAI_BASE_URL,
        "https://api.openai.com/v1"
      ),
      headers: {
        Authorization: `Bearer ${openAiKey}`,
        "Content-Type": "application/json",
      },
    };
  }

  return null;
}

function formatIsoDate(value) {
  const parsed = Date.parse(String(value || ""));
  if (Number.isNaN(parsed)) return "unknown";
  return new Date(parsed).toISOString().slice(0, 10);
}

function detectMode(query) {
  const q = cleanText(query).toLowerCase();
  if (/\b(explain|why|how|reason|causes?)\b/.test(q)) {
    return "EXPLANATION_MODE";
  }
  return "FACT_MODE";
}

function buildKnowledgeBase(articles) {
  return articles
    .map((article, idx) => {
      const clippedText = cleanText(article.full_text || "").slice(0, 3500);
      return [
        `[src_${String(idx + 1).padStart(3, "0")}]`,
        `TITLE: ${article.title || "Untitled"}`,
        `SOURCE: ${article.source || "unknown"}`,
        `PUBLISHED_DATE: ${article.published_date || "unknown"}`,
        `URL: ${article.original_url || "unknown"}`,
        `TEXT: ${clippedText}`,
      ].join("\n");
    })
    .join("\n\n=============================\n\n");
}

function confidenceLabel(count, total) {
  const safeTotal = Math.max(1, total);
  const ratio = count / safeTotal;
  if (count >= 5 || ratio >= 0.5) return "High";
  if (count >= 3 || ratio >= 0.3) return "Medium";
  return "Low";
}

function tokenCategory(token) {
  if (/\b[A-Z]{1,4}-\d{1,4}[A-Za-z0-9-]*\b/.test(token)) {
    return "Model/Technology";
  }
  if (/\b\d{4}\b/.test(token)) return "Date";
  if (/\b\d+(?:,\d{3})*(?:\.\d+)?%\b/.test(token)) return "Metric";
  if (/\b(ministry|agency|council|bank|company|corp|inc|ltd|group|command|forces?)\b/i.test(token)) {
    return "Organization";
  }
  if (/\b(city|province|state|gulf|sea|strait|capital)\b/i.test(token)) {
    return "Location";
  }
  return "Entity";
}

function normalizeToken(raw) {
  const token = cleanText(raw).replace(/[.,;:!?]+$/g, "").trim();
  if (!token) return "";
  if (token.length < 3) return "";
  if (/^(The|This|That|These|Those|And|But|For)$/i.test(token)) return "";
  return token;
}

function addToken(map, token, sourceKey) {
  const normalized = normalizeToken(token);
  if (!normalized) return;
  if (!map.has(normalized)) {
    map.set(normalized, new Set());
  }
  map.get(normalized).add(sourceKey);
}

function extractTokenStats(articles) {
  const map = new Map();

  articles.forEach((article, idx) => {
    const sourceKey = article.original_url || `${article.source || "source"}-${idx}`;
    const title = String(article.title || "");
    const textSample = cleanText(article.full_text || "").slice(0, 1800);

    const modelMatches = [
      ...title.matchAll(/\b[A-Z]{1,4}-\d{1,4}[A-Za-z0-9-]*\b/g),
      ...textSample.matchAll(/\b[A-Z]{1,4}-\d{1,4}[A-Za-z0-9-]*\b/g),
    ];
    for (const match of modelMatches) {
      addToken(map, match[0], sourceKey);
    }

    const titleEntities = title.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z0-9-]+){1,3}\b/g) || [];
    for (const token of titleEntities) {
      addToken(map, token, sourceKey);
    }

    const yearMatches = textSample.match(/\b(19|20)\d{2}\b/g) || [];
    for (const year of yearMatches) {
      addToken(map, year, sourceKey);
    }
  });

  return [...map.entries()]
    .map(([token, sourceSet]) => ({
      token,
      count: sourceSet.size,
      category: tokenCategory(token),
    }))
    .sort((a, b) => b.count - a.count || a.token.localeCompare(b.token));
}

function summarizeTimeline(articles) {
  const dates = articles
    .map((a) => formatIsoDate(a.published_date))
    .filter((d) => d !== "unknown")
    .sort();

  if (!dates.length) {
    return "Coverage spans multiple updates with no fully consistent publication timeline.";
  }

  return `Reporting window: ${dates[0]} to ${dates[dates.length - 1]}.`;
}

function buildExploreMore(query) {
  const q = cleanText(query || "the topic");
  return [
    `${q}: leaders and decision-makers`,
    `${q}: timeline and turning points`,
    `${q}: organizations and alliances`,
    `${q}: technologies and systems involved`,
    `${q}: economic and supply-chain impact`,
    `${q}: regional and global implications`,
  ];
}

function buildStructuredFallback(query, articles) {
  const total = Math.max(1, articles.length);
  const uniqueSources = new Set(
    articles.map((a) => cleanText(a.source || "")).filter(Boolean)
  ).size;
  const stats = extractTokenStats(articles).slice(0, 10);
  const timeline = summarizeTimeline(articles);

  const mainAnswer = [
    `- Intent interpreted as: factual extraction for \"${cleanText(query)}\".`,
    `- Evidence base: ${articles.length} full articles from ${uniqueSources || 1} unique outlets.`,
    `- ${timeline}`,
  ];

  const keyFacts = stats.length
    ? stats.map((row) => {
        const confidence = confidenceLabel(row.count, total);
        return `- ${row.token} -- Type: ${row.category} -- Confidence: ${confidence} (mentioned in ${row.count} of ${total} sources)`;
      })
    : [
        "- No repeated named entities detected above confidence thresholds in extracted text.",
      ];

  const sources = articles.slice(0, 10).map((article, idx) => {
    const id = `src_${String(idx + 1).padStart(3, "0")}`;
    const date = formatIsoDate(article.published_date);
    return `${idx + 1}. [${id}] ${cleanText(article.title || "Untitled")} | ${cleanText(
      article.source || "unknown"
    )} | ${date} | ${cleanText(article.original_url || "")}`;
  });

  const explore = buildExploreMore(query).map((item) => `- ${item}`);

  return [
    "Main Answer",
    ...mainAnswer,
    "",
    "Key Facts",
    ...keyFacts,
    "",
    "Sources",
    ...(sources.length ? sources : ["1. No sources available."]),
    "",
    "Explore More",
    ...explore,
  ].join("\n");
}

function parseStructuredSections(rawText) {
  const lines = String(rawText || "").replace(/\r\n/g, "\n").split("\n");
  const sections = {
    main: [],
    facts: [],
    sources: [],
    explore: [],
  };

  let active = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^Main Answer$/i.test(trimmed)) {
      active = "main";
      continue;
    }
    if (/^Key Facts$/i.test(trimmed)) {
      active = "facts";
      continue;
    }
    if (/^Sources$/i.test(trimmed)) {
      active = "sources";
      continue;
    }
    if (/^Explore More$/i.test(trimmed)) {
      active = "explore";
      continue;
    }

    if (active) {
      sections[active].push(trimmed);
    }
  }

  return sections;
}

function mergeUnique(primary, fallback, minItems) {
  const output = [];
  const seen = new Set();

  for (const item of primary || []) {
    const normalized = cleanText(item).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(item);
  }

  for (const item of fallback || []) {
    if (output.length >= minItems) break;
    const normalized = cleanText(item).toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(item);
  }

  return output;
}

function composeStructuredSections(sections) {
  return [
    "Main Answer",
    ...sections.main,
    "",
    "Key Facts",
    ...sections.facts,
    "",
    "Sources",
    ...sections.sources,
    "",
    "Explore More",
    ...sections.explore,
  ].join("\n");
}

function sanitizeStructuredText(text, query, articles) {
  let raw = String(text || "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\u2022/g, "-")
    .trim();

  raw = raw.replace(/\n{3,}/g, "\n\n");

  const primary = parseStructuredSections(raw);
  const fallback = parseStructuredSections(buildStructuredFallback(query, articles));

  const merged = {
    main: mergeUnique(primary.main, fallback.main, 2),
    facts: mergeUnique(primary.facts, fallback.facts, 6),
    sources: mergeUnique(primary.sources, fallback.sources, 4),
    explore: mergeUnique(primary.explore, fallback.explore, 5),
  };

  if (!merged.main.length || !merged.facts.length || !merged.sources.length) {
    return buildStructuredFallback(query, articles);
  }

  const normalized = {
    main: merged.main.map((line) => {
      if (/^[-*]\s/.test(line)) return line.replace(/^[-*]\s*/, "- ");
      return `- ${line}`;
    }),
    facts: merged.facts.map((line) => {
      if (/^[-*]\s/.test(line)) return line.replace(/^[-*]\s*/, "- ");
      return `- ${line}`;
    }),
    sources: merged.sources.map((line, idx) => {
      if (/^\d+\.\s/.test(line)) return line;
      return `${idx + 1}. ${line}`;
    }),
    explore: merged.explore.map((line) => {
      if (/^[-*]\s/.test(line)) return line.replace(/^[-*]\s*/, "- ");
      return `- ${line}`;
    }),
  };

  return composeStructuredSections(normalized);
}

function buildSystemPrompt() {
  return [
    "You are an advanced research reasoning engine, not a generic search summarizer.",
    "Think step-by-step internally, but do not reveal internal reasoning.",
    "Default behavior is FACT MODE unless the user explicitly asks to explain why/how.",
    "",
    "You receive a multi-source knowledge base of full article texts.",
    "Use multiple sources to extract precise facts, entities, models, numbers, dates, locations, organizations, and technologies.",
    "Do not output long narrative paragraphs.",
    "",
    "Output rules:",
    "1. Determine user intent first.",
    "2. Convert vague intent into structured research sub-questions internally.",
    "3. Compare facts across sources and assign confidence by cross-source repetition.",
    "4. Prefer names and concrete items over generic descriptions.",
    "5. If uncertainty remains, mark confidence low.",
    "6. Never rely on one source only.",
    "",
    "Return plain text in this exact structure:",
    "Main Answer",
    "- concise fact bullets",
    "",
    "Key Facts",
    "- Name/Item -- Type: <category> -- Confidence: High|Medium|Low (mentioned in X of N sources)",
    "",
    "Sources",
    "1. [src_id] title | source | date | url",
    "",
    "Explore More",
    "- related deeper topic",
  ].join("\n");
}

function buildUserPrompt(query, articles, knowledgeBase) {
  const mode = detectMode(query);
  return [
    `MODE: ${mode}`,
    `TOPIC QUERY: ${cleanText(query)}`,
    `TOTAL_ARTICLES: ${articles.length}`,
    "",
    "KNOWLEDGE BASE:",
    knowledgeBase,
    "",
    "Return only the final structured answer.",
  ].join("\n");
}

async function requestSummaryWithRetry(query, articles, provider) {
  const knowledgeBase = buildKnowledgeBase(articles);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, articles, knowledgeBase);

  const maxRetries = 2;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const response = await axios.post(
        provider.url,
        {
          model: provider.model,
          temperature: 0.15,
          max_tokens: 1800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        {
          timeout: config.FETCH_TIMEOUT_MS * 2,
          headers: provider.headers,
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (text && cleanText(text)) {
        return sanitizeStructuredText(text, query, articles);
      }

      lastError = new Error("Empty model response");
      console.warn(
        `[Synthesizer] ${provider.name} returned empty content (attempt ${attempt + 1}/${maxRetries + 1}).`
      );
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const message = error?.message || `Unknown ${provider.name} error`;
      console.error(
        `[Synthesizer] ${provider.name} request failed (attempt ${attempt + 1}/${maxRetries + 1})`,
        { status, message, data }
      );
      lastError = error;
    }

    attempt += 1;
    if (attempt <= maxRetries) {
      const backoffMs = 350 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError || new Error(`${provider.name} request failed`);
}

async function synthesizeMasterSummary(query, articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    console.log("Using fallback summary mode");
    return buildStructuredFallback(query || "the topic", []);
  }

  const boundedArticles = articles.slice(0, 12);
  const provider = resolveProvider();

  if (!provider) {
    console.log("Using fallback summary mode");
    return buildStructuredFallback(query, boundedArticles);
  }

  if (provider.name === "openrouter") {
    console.log("Using OpenRouter synthesis engine");
  } else {
    console.log("Using OpenAI synthesis engine");
  }

  try {
    return await requestSummaryWithRetry(query, boundedArticles, provider);
  } catch (error) {
    console.error(
      `[Synthesizer] Falling back after ${provider.name} failure:`,
      error?.message || "Unknown error"
    );
    console.log("Using fallback summary mode");
    return buildStructuredFallback(query, boundedArticles);
  }
}

module.exports = {
  synthesizeMasterSummary,
};

