const config = {
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || "INSERT_YOUR_OPENAI_API_KEY_HERE",
  OPENAI_MODEL: process.env.OPENAI_MODEL || "gpt-4.1",
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",

  NANOBANANA_API_KEY: process.env.NANOBANANA_API_KEY || "INSERT_YOUR_NANOBANANA_API_KEY_HERE",
  NANOBANANA_API_URL: process.env.NANOBANANA_API_URL || "https://api.nanobanana.ai/v1/images/generate",

  SEARCH_API_KEY: process.env.SEARCH_API_KEY || "INSERT_YOUR_SEARCH_API_KEY_HERE",
  SEARCH_API_PROVIDER: process.env.SEARCH_API_PROVIDER || "serper",
  SERPER_API_BASE: process.env.SERPER_API_BASE || "https://google.serper.dev",

  PORT: Number(process.env.PORT || 8080),
  CACHE_TTL_MS: Number(process.env.CACHE_TTL_MS || 30 * 60 * 1000),
  FETCH_TIMEOUT_MS: Number(process.env.FETCH_TIMEOUT_MS || 20000),
  MAX_CANDIDATES: Number(process.env.MAX_CANDIDATES || 45),
  USER_AGENT:
    process.env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

module.exports = config;
