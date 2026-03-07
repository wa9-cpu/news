const axios = require("axios");
const config = require("../config");

function hasNanoKey() {
  return (
    config.NANOBANANA_API_KEY &&
    !config.NANOBANANA_API_KEY.includes("INSERT_YOUR_NANOBANANA_API_KEY_HERE")
  );
}

function cleanSeed(text) {
  return String(text || "research")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function photoFallback(text) {
  const seed = encodeURIComponent(cleanSeed(text) || "research");
  return `https://picsum.photos/seed/${seed}/640/360`;
}

function normalizeImageUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (/^https?:\/\//i.test(raw)) {
    if (/\.svg(\?|$)/i.test(raw)) return "";
    return raw;
  }

  if (/^data:image\/svg\+xml/i.test(raw)) return "";
  if (/^data:image\//i.test(raw)) return raw;
  return "";
}

function imageFromPayload(data) {
  const url =
    data?.image_url ||
    data?.url ||
    data?.data?.[0]?.url ||
    data?.images?.[0]?.url ||
    data?.output?.[0]?.url;

  const normalizedUrl = normalizeImageUrl(url);
  if (normalizedUrl) return normalizedUrl;

  const b64 =
    data?.b64_json ||
    data?.image_base64 ||
    data?.data?.[0]?.b64_json ||
    data?.output?.[0]?.b64_json;

  if (b64 && String(b64).trim()) {
    return `data:image/png;base64,${String(b64).trim()}`;
  }

  return "";
}

async function generateOneImage(headline) {
  const prompt = `Informational, realistic editorial illustration representing: ${headline}. Neutral tone. No sensationalism.`;

  if (!hasNanoKey()) {
    return photoFallback(headline);
  }

  try {
    const response = await axios.post(
      config.NANOBANANA_API_URL,
      {
        prompt,
        size: "1024x576",
      },
      {
        timeout: config.FETCH_TIMEOUT_MS * 2,
        headers: {
          Authorization: `Bearer ${config.NANOBANANA_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const resolved = imageFromPayload(response.data || {});
    if (resolved) return resolved;
  } catch (error) {
    console.error(
      "[ImageAgent] Image API failed, using photo fallback:",
      error?.message || "Unknown error"
    );
  }

  return photoFallback(headline);
}

async function generateImages(headlines) {
  const tasks = (headlines || [])
    .slice(0, 6)
    .map((headline) => generateOneImage(headline));

  return Promise.all(tasks);
}

module.exports = {
  generateImages,
};
