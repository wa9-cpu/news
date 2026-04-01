const { runPipeline, cleanText } = require("./_pipeline");

module.exports = async (req, res) => {
  console.log(`[API] ${req.method} ${req.url}`);
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const query = cleanText(req.body?.query || "");
    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }

    const result = await runPipeline(query);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Chat pipeline failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
};
