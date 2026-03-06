const axios = require("axios");
const config = require("../config");

function hasOpenAiKey() {
  return (
    config.OPENAI_API_KEY &&
    !config.OPENAI_API_KEY.includes("INSERT_YOUR_OPENAI_API_KEY_HERE")
  );
}

function fallbackTopics(query) {
  const q = query.trim();
  return [
    `${q}: geopolitical and diplomatic consequences`,
    `${q}: economic and market impact`,
    `${q}: security and military risk trajectory`,
    `${q}: legal, governance, and policy response`,
    `${q}: humanitarian and social effects`,
    `${q}: next-phase scenarios and decision triggers`,
  ];
}

function normalizeTopicList(items, query) {
  const output = [];
  const seen = new Set();

  for (const raw of items || []) {
    const topic = String(raw || "").replace(/^[-*\d.)\s]+/, "").trim();
    if (!topic) continue;
    const key = topic.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(topic);
    if (output.length >= 6) break;
  }

  while (output.length < 6) {
    output.push(fallbackTopics(query)[output.length]);
  }

  return output.slice(0, 6);
}

async function generateExploreTopics(query, articles = [], summary = "") {
  if (!hasOpenAiKey()) {
    return fallbackTopics(query);
  }

  const context = [
    summary.slice(0, 2000),
    ...articles.slice(0, 5).map((a) => `${a.title} | ${a.source}`),
  ]
    .filter(Boolean)
    .join("\n");

  const system =
    "Generate exactly 6 related but distinct research topics that expand a base query from different factual angles. Return only a JSON array of 6 short strings.";
  const user = [
    `Base query: ${query}`,
    "Context:",
    context,
  ].join("\n");

  try {
    const response = await axios.post(
      `${config.OPENAI_BASE_URL}/chat/completions`,
      {
        model: config.OPENAI_MODEL,
        temperature: 0.4,
        max_tokens: 400,
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
    return normalizeTopicList(Array.isArray(parsed) ? parsed : [], query);
  } catch {
    return fallbackTopics(query);
  }
}

module.exports = {
  generateExploreTopics,
};
