const { runPipeline, normalizeMasterSummary, cleanText } = require("./_pipeline");
const { synthesizeMasterSummary } = require("../project/backend/agents/synthesizerAgent");

module.exports = async (req, res) => {
  console.log(`[API] ${req.method} ${req.url}`);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const query = cleanText(req.body?.query || "");
    const articles = Array.isArray(req.body?.articles) ? req.body.articles : [];

    if (articles.length && query) {
      const summary = await synthesizeMasterSummary(query, articles);
      return res.json({ query, master_summary: normalizeMasterSummary(summary) });
    }

    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }

    const result = await runPipeline(query);
    return res.json({ query, master_summary: result.master_summary || "" });
  } catch (error) {
    return res.status(500).json({
      error: "Summarization failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
};
