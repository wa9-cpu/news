const { AGENT_REGISTRY, cleanText } = require("../_pipeline");

module.exports = async (req, res) => {
  console.log(`[API] ${req.method} ${req.url}`);
  const name = cleanText(req.query?.name || "").toLowerCase();
  const handler = AGENT_REGISTRY[name];

  if (!handler) {
    return res.status(404).json({ error: `Unknown agent: ${name || ""}` });
  }

  try {
    const result = await handler(req.body || {});
    return res.json({ agent: name, result });
  } catch (error) {
    return res.status(500).json({
      error: `Agent ${name} failed`,
      details: cleanText(error.message || "Unknown error"),
    });
  }
};
