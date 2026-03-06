const axios = require("axios");
const config = require("../config");

function hasNanoKey() {
  return (
    config.NANOBANANA_API_KEY &&
    !config.NANOBANANA_API_KEY.includes("INSERT_YOUR_NANOBANANA_API_KEY_HERE")
  );
}

function svgFallback(text) {
  const safe = String(text || "")
    .slice(0, 86)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='#dcdcdc'/><rect x='16' y='16' width='608' height='328' fill='none' stroke='#9b9b9b'/><text x='32' y='170' font-size='22' fill='#222' font-family='Arial, sans-serif'>${safe}</text><text x='32' y='205' font-size='14' fill='#555' font-family='Arial, sans-serif'>Informational visual placeholder</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function generateOneImage(headline) {
  const prompt = `Informational, realistic editorial illustration representing: ${headline}. Neutral tone. No sensationalism.`;

  if (!hasNanoKey()) {
    return svgFallback(headline);
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

    const url =
      response.data?.image_url ||
      response.data?.data?.[0]?.url ||
      response.data?.url;

    if (url && /^https?:\/\//i.test(url)) {
      return url;
    }

    return svgFallback(headline);
  } catch {
    return svgFallback(headline);
  }
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
