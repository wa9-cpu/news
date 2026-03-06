const axios = require("axios");
const config = require("../config");

function hasOpenAiKey() {
  return (
    config.OPENAI_API_KEY &&
    !config.OPENAI_API_KEY.includes("INSERT_YOUR_OPENAI_API_KEY_HERE")
  );
}

function toHeadline(topic) {
  const cleaned = String(topic || "").trim();
  if (!cleaned) return "Developing Story: New Factual Insights";

  if (/^the\s/i.test(cleaned)) return cleaned;
  if (/intensifies|widens|evolves|faces|reshapes|deepens/i.test(cleaned)) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  const compact = cleaned.replace(/\s+/g, " ");
  return `How ${compact} Is Reshaping the Debate`;
}

function normalizeHeadlines(items, topics) {
  const output = [];
  const seen = new Set();

  for (const raw of items || []) {
    const text = String(raw || "").replace(/^[-*\d.)\s]+/, "").trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(text);
    if (output.length >= 6) break;
  }

  while (output.length < 6) {
    output.push(toHeadline(topics[output.length] || ""));
  }

  return output.slice(0, 6);
}

async function generateHeadlines(query, topics) {
  const safeTopics = (topics || []).slice(0, 6);
  if (!safeTopics.length) {
    return [
      `The Global Debate Over ${query} Intensifies`,
      `New Evidence Changes the Conversation on ${query}`,
      `Why ${query} Is Entering a Critical Phase`,
      `${query}: The Policy Questions Now Driving Decisions`,
      `What the Latest Data Means for ${query}`,
      `${query} and the Next Strategic Turning Point`,
    ];
  }

  if (!hasOpenAiKey()) {
    return safeTopics.map((topic) => toHeadline(topic));
  }

  const system =
    "Convert 6 research topics into compelling neutral news-style headlines. Return only a JSON array of 6 strings.";
  const user = [
    `Base query: ${query}`,
    "Topics:",
    ...safeTopics.map((topic, idx) => `${idx + 1}. ${topic}`),
  ].join("\n");

  try {
    const response = await axios.post(
      `${config.OPENAI_BASE_URL}/chat/completions`,
      {
        model: config.OPENAI_MODEL,
        temperature: 0.5,
        max_tokens: 450,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
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

    const raw = response.data?.choices?.[0]?.message?.content || "[]";
    const parsed = JSON.parse(raw);
    return normalizeHeadlines(Array.isArray(parsed) ? parsed : [], safeTopics);
  } catch {
    return safeTopics.map((topic) => toHeadline(topic));
  }
}

module.exports = {
  generateHeadlines,
};
