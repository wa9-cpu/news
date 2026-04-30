const { runPipeline, cleanText } = require("./_pipeline");

function readQuery(req) {
  const bodyQuery = req.body?.query;
  const directQuery = req.query?.query || req.query?.q;

  if (directQuery) return cleanText(directQuery);

  try {
    const parsed = new URL(req.url || "", "https://local.invalid");
    return cleanText(parsed.searchParams.get("query") || parsed.searchParams.get("q") || bodyQuery || "");
  } catch {
    return cleanText(bodyQuery || "");
  }
}

module.exports = async (req, res) => {
  console.log(`[API] ${req.method} ${req.url}`);

  res.setHeader("Allow", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed. Use POST or GET with ?query=..." });
  }

  try {
    const query = readQuery(req);
    if (!query) {
      return res.status(400).json({ error: "Query is required." });
    }

    const result = await runPipeline(query);
    return res.json(result);
  } catch (error) {
    return res.status(500).json({
      error: "Research pipeline failed",
      details: cleanText(error.message || "Unknown error"),
    });
  }
};
