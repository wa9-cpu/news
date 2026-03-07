const fs = require("fs");
const path = require("path");

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return {};

  const parsed = {};
  const content = fs.readFileSync(envPath, "utf8");
  const lines = content.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) continue;

    const sepIndex = line.indexOf("=");
    if (sepIndex <= 0) continue;

    const key = line.slice(0, sepIndex).trim();
    let value = line.slice(sepIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) parsed[key] = value;
  }

  return parsed;
}

const env = {
  ...loadLocalEnv(),
  ...process.env,
};

const config = {
  OPENAI_API_KEY: env.OPENAI_API_KEY || "INSERT_YOUR_OPENAI_API_KEY_HERE",
  OPENAI_MODEL: env.OPENAI_MODEL || "gpt-4.1",
  OPENAI_BASE_URL: env.OPENAI_BASE_URL || "https://api.openai.com/v1",

  OPENROUTER_API_KEY:
    env.OPENROUTER_API_KEY || "INSERT_YOUR_OPENROUTER_API_KEY_HERE",
  OPENROUTER_MODEL: env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
  OPENROUTER_BASE_URL:
    env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
  OPENROUTER_APP_TITLE:
    env.OPENROUTER_APP_TITLE || "Deep Factual Research Engine",
  OPENROUTER_HTTP_REFERER:
    env.OPENROUTER_HTTP_REFERER || "http://localhost:8080",

  NANOBANANA_API_KEY:
    env.NANOBANANA_API_KEY || "INSERT_YOUR_NANOBANANA_API_KEY_HERE",
  NANOBANANA_API_URL:
    env.NANOBANANA_API_URL || "https://api.nanobanana.ai/v1/images/generate",

  SEARCH_API_KEY: env.SEARCH_API_KEY || "INSERT_YOUR_SEARCH_API_KEY_HERE",
  SEARCH_API_PROVIDER: env.SEARCH_API_PROVIDER || "serper",
  SERPER_API_BASE: env.SERPER_API_BASE || "https://google.serper.dev",

  PORT: Number(env.PORT || 8080),
  CACHE_TTL_MS: Number(env.CACHE_TTL_MS || 30 * 60 * 1000),
  FETCH_TIMEOUT_MS: Number(env.FETCH_TIMEOUT_MS || 20000),
  MAX_CANDIDATES: Number(env.MAX_CANDIDATES || 45),
  USER_AGENT:
    env.USER_AGENT ||
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
};

module.exports = config;
