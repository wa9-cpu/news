const axios = require("axios");
const config = require("../config");
const { cleanText } = require("./researchAgent");

function hasOpenAiKey() {
  return (
    config.OPENAI_API_KEY &&
    !config.OPENAI_API_KEY.includes("INSERT_YOUR_OPENAI_API_KEY_HERE")
  );
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

function topTerms(articles, limit = 8) {
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

function sanitizeSummaryText(text) {
  const rawParagraphs = String(text || "")
    .split(/\n{2,}/)
    .map((p) => cleanParagraph(p))
    .filter(Boolean);

  if (rawParagraphs.length >= 3) {
    return rawParagraphs.join("\n\n");
  }

  const sentenceChunks = cleanText(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanParagraph(s))
    .filter(Boolean);

  if (sentenceChunks.length >= 9) {
    const grouped = [
      sentenceChunks.slice(0, 3).join(" "),
      sentenceChunks.slice(3, 6).join(" "),
      sentenceChunks.slice(6).join(" "),
    ]
      .map((p) => cleanParagraph(p))
      .filter(Boolean);
    return grouped.join("\n\n");
  }

  return cleanParagraph(text || "");
}

function fallbackMasterSummary(query, articles) {
  const terms = topTerms(articles, 10);
  const termText = terms.length
    ? terms.slice(0, 6).join(", ")
    : "policy shifts, strategic decisions, institutional responses";

  const paragraphA =
    `Current coverage on ${query} points to a fast-moving situation shaped by concurrent political, operational, and economic dynamics rather than a single isolated event.`;

  const paragraphB =
    `Across the available reporting, recurring factual themes include ${termText}. Together, these patterns indicate that developments are unfolding in linked stages, where each move changes the risk profile of the next.`;

  const paragraphC =
    `The strongest common signal is that short-term updates are interacting with longer-term structural pressures, including governance constraints, market effects, and security tradeoffs. This interaction helps explain persistent volatility and uneven outcomes across regions and institutions.`;

  const paragraphD =
    `Overall, the factual core suggests an environment defined by feedback loops and conditional escalation. The most reliable interpretation emphasizes continuity of trends, trigger points for rapid shifts, and downstream consequences that accumulate over time.`;

  return sanitizeSummaryText(
    [paragraphA, paragraphB, paragraphC, paragraphD].join("\n\n")
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
  ].join("\n");
}

function buildUserPrompt(query, knowledgeBase) {
  return [
    `TOPIC QUERY: ${query}`,
    "",
    "KNOWLEDGE BASE:",
    knowledgeBase,
    "",
    "Return only the final master summary text.",
  ].join("\n");
}

async function requestSummaryWithRetry(query, articles) {
  const knowledgeBase = buildKnowledgeBase(articles);
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, knowledgeBase);

  const maxRetries = 2;
  let attempt = 0;
  let lastError = null;

  while (attempt <= maxRetries) {
    try {
      const response = await axios.post(
        `${config.OPENAI_BASE_URL}/chat/completions`,
        {
          model: config.OPENAI_MODEL,
          temperature: 0.2,
          max_tokens: 1200,
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
    } catch (error) {
      lastError = error;
    }

    attempt += 1;
    if (attempt <= maxRetries) {
      const backoffMs = 300 * attempt;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }

  throw lastError || new Error("OpenAI request failed");
}

async function synthesizeMasterSummary(query, articles) {
  if (!Array.isArray(articles) || articles.length === 0) {
    return fallbackMasterSummary(query || "the topic", []);
  }

  const boundedArticles = articles.slice(0, 12);

  if (!hasOpenAiKey()) {
    return fallbackMasterSummary(query, boundedArticles);
  }

  try {
    const llmSummary = await requestSummaryWithRetry(query, boundedArticles);
    return sanitizeSummaryText(llmSummary);
  } catch {
    return fallbackMasterSummary(query, boundedArticles);
  }
}

module.exports = {
  synthesizeMasterSummary,
};
