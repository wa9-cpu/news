function hasValue(value) {
  return Boolean(value && !String(value).includes("INSERT_YOUR"));
}

module.exports = async (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "deep-factual-research",
    node: process.version,
    env: {
      OPENAI_API_KEY: hasValue(process.env.OPENAI_API_KEY),
      OPENROUTER_API_KEY: hasValue(process.env.OPENROUTER_API_KEY),
      SERPER_API_KEY: hasValue(process.env.SERPER_API_KEY || process.env.SEARCH_API_KEY),
      NANOBANANA_API_KEY: hasValue(process.env.NANOBANANA_API_KEY),
    },
  });
};
