const axios = require("axios");
const config = require("../config");
const { cleanText } = require("./researchAgent");

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_KEY_PLACEHOLDER_PATTERNS = [
  /INSERT_YOUR_OPENAI_API_KEY_HERE/i,
  /^YOUR_OPENAI_API_KEY$/i,
];
const ALLOWED_MODELS = new Set(["gpt-4o", "gpt-4.1", "gpt-4o-mini"]);

function hasOpenAiKey() {
  const key = String(config.OPENAI_API_KEY || "").trim();
  if (!key) return false;
  if (OPENAI_KEY_PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(key))) {
    return false;
  }
  return true;
}

function resolveModelName() {
  const configured = String(config.OPENAI_MODEL || "").trim();
  if (ALLOWED_MODELS.has(configured)) return configured;

  if (configured) {
    console.warn(
      `[Synthesizer] Unsupported OPENAI_MODEL='${configured}'. Falling back to 'gpt-4.1'.`
    );
  }
  return "gpt-4.1";
}

function buildKnowledgeBase(articles) {
  return articles
    .map((article, idx) => {
      const clippedText = cleanText(article.full_text || "").slice(0, 3500);
      return [
        `ARTICLE ${idx + 1}`,
        `TITLE: ${article.title || "Untitled"}`,
        `SOURCE: ${article.source || "unknown"}`,
        `PUBLISHED_DATE: ${article.published_date || "unknown"}`,
        `TEXT: ${clippedText}`,
      ].join("\n");
    })
    .join("\n\n=============================\n\n");
}

function stopWords() {
  return new Set([
    "the",
    "and",
    "that",
    "with",
    "from",
    "have",
    "this",
    "were",
    "their",
    "about",
    "which",
    "into",
    "after",
    "while",
    "will",
    "also",
    "been",
    "over",
    "more",
    "than",
    "they",
    "them",
    "where",
    "when",
    "what",
    "your",
    "there",
    "because",
    "could",
    "would",
    "should",
    "said",
    "says",
    "according",
    "report",
    "reports",
    "news",
    "article",
    "articles",
    "source",
    "sources",
  ]);
}

function topTerms(articles, limit = 12) {
  const counts = new Map();
  const sw = stopWords();

  for (const article of articles) {
    const text = cleanText(article.full_text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ");

    for (const word of text.split(/\s+/)) {
      if (!word || word.length < 5 || sw.has(word)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word]) => word);
}

function cleanParagraph(text) {
  return cleanText(text)
    .replace(/\baccording to\b/gi, "")
    .replace(/\bthis article says\b/gi, "")
    .replace(/\bsources report\b/gi, "")
    .replace(/\bsource(s)?\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function ensureParagraphCount(text, minParagraphs = 6) {
  const rawParagraphs = String(text || "")
    .split(/\n{2,}/)
    .map((p) => cleanParagraph(p))
    .filter(Boolean);

  if (rawParagraphs.length >= minParagraphs) {
    return rawParagraphs.join("\n\n");
  }

  const sentences = cleanText(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanParagraph(s))
    .filter(Boolean);

  if (!sentences.length) return "";

  const chunkSize = Math.max(2, Math.ceil(sentences.length / minParagraphs));
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(" "));
  }

  while (chunks.length < minParagraphs && chunks.length > 0) {
    chunks.push(chunks[chunks.length - 1]);
  }

  return chunks.map(cleanParagraph).filter(Boolean).join("\n\n");
}

function sanitizeSummaryText(text) {
  const ensured = ensureParagraphCount(text, 6);
  const paragraphs = ensured
    .split(/\n{2,}/)
    .map((p) => cleanParagraph(p))
    .filter(Boolean);

  return paragraphs.join("\n\n");
}

function parseDateSafe(value) {
  const ts = Date.parse(String(value || ""));
  return Number.isNaN(ts) ? null : ts;
}

function summarizeTimeline(articles) {
  const timestamps = articles
    .map((a) => parseDateSafe(a.published_date))
    .filter((t) => t !== null)
    .sort((a, b) => a - b);

  if (!timestamps.length) {
    return "The available material spans multiple reporting windows with continued updates as conditions evolve.";
  }

  const first = new Date(timestamps[0]).toISOString().slice(0, 10);
  const last = new Date(timestamps[timestamps.length - 1]).toISOString().slice(0, 10);
  return `The collected reporting window runs from ${first} to ${last}, indicating sustained coverage over a period with repeated new developments.`;
}

function pickRepresentativeSentences(articles, keywords, maxSentences = 18) {
  const keywordSet = new Set((keywords || []).map((k) => k.toLowerCase()));
  const picked = [];
  const seen = new Set();

  for (const article of articles) {
    const text = cleanText(article.full_text || "");
    const sentences = text
      .split(/(?<=[.!?])\s+/)
      .map((s) => cleanParagraph(s))
      .filter((s) => s.length >= 80 && s.length <= 320);

    for (const sentence of sentences) {
      const key = sentence.toLowerCase().slice(0, 180);
      if (seen.has(key)) continue;
      seen.add(key);

      const words = sentence
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (keywordSet.has(word)) score += 1;
      }
      score += Math.min(3, Math.floor(sentence.length / 120));
      picked.push({ sentence, score });
    }
  }

  return picked
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .map((x) => x.sentence);
}

function fallbackMasterSummary(query, articles) {
  const terms = topTerms(articles, 12);
  const termText = terms.length
    ? terms.slice(0, 8).join(", ")
    : "policy shifts, strategic decisions, institutional responses";

  const domains = new Set(
    articles.map((a) => cleanText(a.source || "")).filter(Boolean)
  );
  const representative = pickRepresentativeSentences(articles, terms, 18);
  const timelineLine = summarizeTimeline(articles);

  const take = (start, count) => representative.slice(start, start + count).join(" ");

  const paragraphA =
    `Current coverage on ${query} reflects a broad and layered situation in which political decisions, operational choices, and economic pressures are unfolding at the same time. ` +
    `The evidence base spans ${articles.length} full-length articles across ${domains.size || 1} distinct outlets, creating a dense picture of both immediate events and structural drivers.`;

  const paragraphB =
    `${timelineLine} Recurring themes include ${termText}, which together suggest that the story is not a single incident but a sequence of linked developments in which each phase alters the next set of constraints.`;

  const paragraphC =
    (take(0, 3) ||
      "Strategic behavior appears increasingly shaped by deterrence logic, risk signaling, and rapid tactical adaptation under uncertainty.") +
    " This pattern indicates that operational tempo and political signaling are moving in parallel rather than in isolation.";

  const paragraphD =
    (take(3, 3) ||
      "Institutional and policy responses are being recalibrated as decision-makers balance short-term stabilization goals against medium-term strategic exposure.") +
    " The cumulative effect is a feedback loop between action, reaction, and revised policy posture.";

  const paragraphE =
    (take(6, 3) ||
      "Economic spillovers and social pressure points are increasingly visible, with market confidence, supply expectations, and public risk perception shifting as events evolve.") +
    " These secondary effects are now part of the core factual landscape, not peripheral observations.";

  const paragraphF =
    (take(9, 3) ||
      "The forward-looking signal remains mixed: some indicators point to temporary stabilization, while others imply further escalation risk if trigger conditions are met.") +
    " A prudent interpretation therefore emphasizes trajectory, trigger points, and measurable downstream consequences over single-day snapshots.";

  return sanitizeSummaryText(
    [
      paragraphA,
      paragraphB,
      paragraphC,
      paragraphD,
      paragraphE,
      paragraphF,
    ].join("\n\n")
  );
}

function buildSystemPrompt() {
  return [
    "You are an advanced multi-document reasoning engine that synthesizes information from full article texts to produce a unified factual report.",
    "",
    "You will receive a knowledge base containing multiple full-length articles about a topic.",
    "",
    "Your task is to extract the factual core information and synthesize ONE master summary.",
    "",
    "Rules:",
    "",
    "* Do not summarize each article individually.",
    "* Do not mention sources inside the summary body.",
    "* Do not use phrases such as 'according to', 'this article says', or 'sources report'.",
    "* Merge overlapping facts across articles.",
    "* Resolve contradictions when possible.",
    "* If contradictions remain, describe the uncertainty neutrally without referencing sources.",
    "* Write the output as a professional multi-paragraph analytical report.",
    "* Produce 6 to 8 substantial paragraphs.",
    "* Include more factual detail, temporal context, implications, and unresolved uncertainties.",
  ].join("\n");
}

function buildUserPrompt(query, knowledgeBase) {
  return [
    `TOPIC QUERY: ${query}`,
    "",
    "KNOWLEDGE BASE:",
    knowledgeBase,
    "",
    "Return only the final master summary text in 6-8 paragraphs.",
  ].join("\n");
}

async function requestSummaryWithRetry(query, articles) {
  const knowledgeBase = buildKnowledgeBase(articles);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, knowledgeBase);
  const model = resolveModelName();

  const maxRetries = 2;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const response = await axios.post(
        OPENAI_CHAT_COMPLETIONS_URL,
        {
          model,
          temperature: 0.2,
          max_tokens: 1800,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        },
        {
          timeout: config.FETCH_TIMEOUT_MS * 2,
          headers: {
            Authorization: `Bearer ${config.OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (text && cleanText(text)) {
        return sanitizeSummaryText(text);
      }

      lastError = new Error("Empty model response");
      console.warn(
        `[Synthesizer] OpenAI returned empty content (attempt ${attempt + 1}/${maxRetries + 1}).`
      );
    } catch (error) {
      const status = error?.response?.status;
      const data = error?.response?.data;
      const message = error?.message || "Unknown OpenAI error";
      console.error(
        `[Synthesizer] OpenAI request failed (attempt ${attempt + 1}/${maxRetries + 1})`,
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

  throw lastError || new Error("OpenAI request failed");
}

async function synthesizeMasterSummary(query, articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    console.log("Using fallback summary mode");
    return fallbackMasterSummary(query || "the topic", []);
  }

  const boundedArticles = articles.slice(0, 12);

  if (!hasOpenAiKey()) {
    console.log("Using fallback summary mode");
    return fallbackMasterSummary(query, boundedArticles);
  }

  console.log("Using OpenAI synthesis engine");
  try {
    const llmSummary = await requestSummaryWithRetry(query, boundedArticles);
    return sanitizeSummaryText(llmSummary);
  } catch (error) {
    console.error(
      "[Synthesizer] Falling back after OpenAI failure:",
      error?.message || "Unknown error"
    );
    console.log("Using fallback summary mode");
    return fallbackMasterSummary(query, boundedArticles);
  }
}

module.exports = {
  synthesizeMasterSummary,
};


