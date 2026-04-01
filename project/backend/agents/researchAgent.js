const axios = require("axios");
const cheerio = require("cheerio");
const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");
const { LRUCache } = require("lru-cache");

const config = require("../config");

const SOCIAL_DOMAINS = [
  "x.com",
  "twitter.com",
  "t.co",
  "reddit.com",
  "redd.it",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "instagr.am",
  "threads.net",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
];

const searchCache = new LRUCache({ max: 100, ttl: config.CACHE_TTL_MS });
const articleCache = new LRUCache({ max: 300, ttl: config.CACHE_TTL_MS });

function hasSearchApiKey() {
  return (
    config.SEARCH_API_KEY &&
    !config.SEARCH_API_KEY.includes("INSERT_YOUR_SEARCH_API_KEY_HERE")
  );
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function normalizeUrl(input) {
  try {
    const parsed = new URL(decodeHtmlEntities(input));
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_content",
      "utm_term",
      "gclid",
      "fbclid",
      "ocid",
      "ref",
      "ref_src",
      "guccounter",
      "guce_referrer",
      "guce_referrer_sig",
    ].forEach((key) => parsed.searchParams.delete(key));
    parsed.hash = "";
    let normalized = parsed.toString();
    if (normalized.endsWith("/")) normalized = normalized.slice(0, -1);
    return normalized;
  } catch {
    return String(input || "");
  }

}

function cleanText(text) {
  if (!text) return "";
  return decodeHtmlEntities(text)
    .replace(/\u00a0/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseRssItems(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml))) {
    const block = match[1];
    const title =
      (block.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/i) ||
        block.match(/<title>([\s\S]*?)<\/title>/i) ||
        [null, ""])[1] || "";
    const link = (block.match(/<link>([\s\S]*?)<\/link>/i) || [null, ""])[1] || "";
    const pubDate =
      (block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i) || [null, ""])[1] || "";

    if (cleanText(link)) {
      items.push({
        title: cleanText(title),
        link: cleanText(link),
        date: cleanText(pubDate),
      });
    }
  }

  return items;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "unknown";
  }
}

function isSocialDomain(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return SOCIAL_DOMAINS.some(
      (domain) => host === domain || host.endsWith(`.${domain}`)
    );
  } catch {
    return false;
  }
}

function classifyCandidateBucket(url, fallbackBucket) {
  if (!url) return fallbackBucket;
  return isSocialDomain(url) ? "social" : fallbackBucket;
}

function isRedditUrl(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
    return host === "reddit.com" || host.endsWith(".reddit.com") || host === "redd.it";
  } catch {
    return false;
  }
}

function extractSocialDescription($) {
  const selectors = [
    'meta[property="og:description"]',
    'meta[name="description"]',
    'meta[name="twitter:description"]',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (!el || !el.length) continue;
    const value = el.attr("content") || el.text();
    if (cleanText(value)) return cleanText(value);
  }

  return "";
}

async function fetchRedditJsonText(url) {
  try {
    const jsonUrl = url.endsWith(".json") ? url : `${url}.json`;
    const response = await axios.get(jsonUrl, {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: { "User-Agent": config.USER_AGENT },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const post = response.data?.[0]?.data?.children?.[0]?.data;
    if (!post) return "";
    const combined = [post.title, post.selftext].filter(Boolean).join("\n\n");
    return cleanText(combined);
  } catch {
    return "";
  }
}

function buildSocialStub(candidate, url) {
  const safeUrl = normalizeUrl(url || candidate.url || "");
  if (!safeUrl) return null;

  const title = cleanText(candidate.title || "Social post");
  const hint = cleanText(candidate.source_hint || "");
  const text = cleanText([title, hint].filter(Boolean).join(" "));

  return {
    title: title || "Social post",
    source: extractDomain(safeUrl),
    author: "",
    published_date: cleanText(candidate.published_date || ""),
    original_url: safeUrl,
    full_text: text || "Social post context unavailable.",
    bucket: "social",
  };
}

function isGoogleNewsUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.includes("news.google.com") || host === "google.com";
  } catch {
    return false;
  }
}

function unwrapBingNewsUrl(url) {
  try {
    const normalized = normalizeUrl(url);
    const parsed = new URL(normalized);
    const host = parsed.hostname.toLowerCase();
    if (!host.includes("bing.com")) return normalized;
    if (!parsed.pathname.toLowerCase().includes("/news/apiclick.aspx")) {
      return normalized;
    }
    const direct = parsed.searchParams.get("url");
    return direct ? normalizeUrl(decodeURIComponent(direct)) : normalized;
  } catch {
    return normalizeUrl(url);
  }
}

function extractHttpCandidates(text) {
  if (!text) return [];
  const matches = text.match(/https?:\/\/[^\s"'<>\\)]+/g) || [];
  return matches.map((m) => normalizeUrl(m));
}

async function resolveOriginalPublisherUrl(rawUrl) {
  const normalized = normalizeUrl(rawUrl);
  if (!isGoogleNewsUrl(normalized)) {
    return normalized;
  }

  try {
    const response = await axios.get(normalized, {
      timeout: config.FETCH_TIMEOUT_MS,
      maxRedirects: 10,
      headers: { "User-Agent": config.USER_AGENT },
      validateStatus: (status) => status >= 200 && status < 400,
    });

    const redirectedUrl = normalizeUrl(
      response.request?.res?.responseUrl || normalized
    );
    if (redirectedUrl && !isGoogleNewsUrl(redirectedUrl)) {
      return redirectedUrl;
    }

    const html = typeof response.data === "string" ? response.data : "";
    const $ = cheerio.load(html);
    const directCandidates = [
      $('meta[property="og:url"]').attr("content"),
      $('link[rel="canonical"]').attr("href"),
      $('a[href^="http"]').first().attr("href"),
    ]
      .map((value) => normalizeUrl(value || ""))
      .filter((value) => value && !isGoogleNewsUrl(value));

    if (directCandidates.length) return directCandidates[0];

    const regexCandidates = extractHttpCandidates(html).filter(
      (candidate) => !isGoogleNewsUrl(candidate)
    );
    if (regexCandidates.length) return regexCandidates[0];
  } catch {
    // Fall through.
  }

  return normalized;
}

async function serperSearch(query, endpoint, num, bucketHint) {
  const url = `${config.SERPER_API_BASE}/${endpoint}`;
  const response = await axios.post(
    url,
    { q: query, num },
    {
      timeout: config.FETCH_TIMEOUT_MS,
      headers: {
        "X-API-KEY": config.SEARCH_API_KEY,
        "Content-Type": "application/json",
      },
    }
  );

  const data = response.data || {};
  const rows = endpoint === "news" ? data.news || [] : data.organic || [];

  return rows
    .map((row) => {
      const url = normalizeUrl(row.link || row.url || "");
      return {
        title: cleanText(row.title || row.snippet || ""),
        url,
        published_date: cleanText(row.date || row.datePublished || ""),
        source_hint: cleanText(row.source || extractDomain(row.link || row.url || "")),
        bucket: classifyCandidateBucket(url, bucketHint),
      };
    })
    .filter((row) => row.url.startsWith("http"));
}

async function googleNewsFallback(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const response = await axios.get(rssUrl, {
    timeout: config.FETCH_TIMEOUT_MS,
    headers: { "User-Agent": config.USER_AGENT },
  });

  return parseRssItems(response.data).map((row) => ({
    title: row.title,
    url: normalizeUrl(row.link),
    published_date: row.date,
    source_hint: "google-news-index",
    bucket: classifyCandidateBucket(normalizeUrl(row.link), "news"),
  }));
}

async function bingNewsFallback(query) {
  const rssUrl = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
  const response = await axios.get(rssUrl, {
    timeout: config.FETCH_TIMEOUT_MS,
    headers: { "User-Agent": config.USER_AGENT },
  });

  return parseRssItems(response.data).map((row) => ({
    title: row.title,
    url: unwrapBingNewsUrl(row.link),
    published_date: row.date,
    source_hint: extractDomain(unwrapBingNewsUrl(row.link)),
    bucket: classifyCandidateBucket(unwrapBingNewsUrl(row.link), "news"),
  }));
}

async function duckDuckGoFallback(query, bucket) {
  const ddgUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const response = await axios.get(ddgUrl, {
    timeout: config.FETCH_TIMEOUT_MS,
    headers: { "User-Agent": config.USER_AGENT },
  });

  const $ = cheerio.load(response.data || "");
  const out = [];

  $(".result").each((_, el) => {
    const anchor = $(el).find("a.result__a").first();
    const title = cleanText(anchor.text());
    const href = cleanText(anchor.attr("href") || "");

    let url = href;
    if (href.includes("uddg=")) {
      const params = new URLSearchParams(href.split("?")[1] || "");
      url = decodeURIComponent(params.get("uddg") || "");
    }

    const normalizedUrl = normalizeUrl(url);
    if (!normalizedUrl.startsWith("http")) return;

    out.push({
      title,
      url: normalizedUrl,
      published_date: "",
      source_hint: extractDomain(normalizedUrl),
      bucket: classifyCandidateBucket(normalizedUrl, bucket),
    });
  });

  return out;
}

async function gatherCandidates(query) {
  const key = `candidates:${query.toLowerCase().trim()}`;
  const cached = searchCache.get(key);
  if (cached) return cached;

  let candidates = [];

  if (hasSearchApiKey()) {
    const socialQueries = [
      `${query} site:reddit.com`,
      `${query} site:redd.it`,
      `${query} site:x.com`,
      `${query} site:t.co`,
      `${query} site:twitter.com`,
      `${query} site:facebook.com`,
      `${query} site:fb.com`,
      `${query} site:instagram.com`,
      `${query} site:instagr.am`,
      `${query} site:threads.net`,
      `${query} site:linkedin.com`,
      `${query} site:tiktok.com`,
      `${query} site:youtube.com`,
      `${query} site:youtu.be`,
    ];

    const searchTasks = [
      serperSearch(query, "news", 24, "news"),
      serperSearch(`${query} in-depth analysis report`, "search", 20, "article"),
      serperSearch(`${query} expert blog analysis`, "search", 20, "blog"),
      ...socialQueries.map((q) => serperSearch(q, "search", 12, "social")),
    ];

    const [news, reports, blogs, ...social] = await Promise.allSettled(searchTasks);

    [news, reports, blogs, ...social].forEach((entry) => {
      if (entry.status === "fulfilled") candidates.push(...entry.value);
    });
  } else {
    const socialQueries = [
      `${query} site:reddit.com`,
      `${query} site:redd.it`,
      `${query} site:x.com`,
      `${query} site:t.co`,
      `${query} site:twitter.com`,
      `${query} site:facebook.com`,
      `${query} site:fb.com`,
      `${query} site:instagram.com`,
      `${query} site:instagr.am`,
      `${query} site:threads.net`,
      `${query} site:linkedin.com`,
      `${query} site:tiktok.com`,
      `${query} site:youtube.com`,
      `${query} site:youtu.be`,
    ];

    const fallbackTasks = [
      bingNewsFallback(query),
      googleNewsFallback(query),
      duckDuckGoFallback(`${query} investigation analysis`, "article"),
      duckDuckGoFallback(`${query} expert blog`, "blog"),
      ...socialQueries.map((q) => duckDuckGoFallback(q, "social")),
    ];

    const [bingNews, googleNews, reports, blogs, ...social] = await Promise.allSettled(
      fallbackTasks
    );

    [bingNews, googleNews, reports, blogs, ...social].forEach((entry) => {
      if (entry.status === "fulfilled") candidates.push(...entry.value);
    });
  }

  const deduped = [];
  const seen = new Set();

  for (const row of candidates) {
    const normalized = normalizeUrl(row.url);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    deduped.push({ ...row, url: normalized });
    if (deduped.length >= config.MAX_CANDIDATES) break;
  }

  searchCache.set(key, deduped);
  return deduped;
}

function extractPublishedDate($) {
  const dateSelectors = [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publish-date"]',
    'meta[name="date"]',
    "time[datetime]",
  ];

  for (const selector of dateSelectors) {
    const el = $(selector).first();
    if (!el || !el.length) continue;
    const value = el.attr("content") || el.attr("datetime") || el.text();
    if (cleanText(value)) return cleanText(value);
  }

  return "";
}

function extractAuthor($) {
  const authorSelectors = [
    'meta[name="author"]',
    'meta[property="article:author"]',
    '[rel="author"]',
    '.author',
    '.byline',
  ];

  for (const selector of authorSelectors) {
    const el = $(selector).first();
    if (!el || !el.length) continue;
    const value = el.attr("content") || el.text();
    if (cleanText(value)) return cleanText(value);
  }

  return "";
}

function fallbackParagraphText($) {
  const parts = [];
  $("article p, main p, p").each((_, p) => {
    const text = cleanText($(p).text());
    if (text.length > 60) parts.push(text);
  });
  return cleanText(parts.join("\n\n"));
}

async function fetchAndExtractArticle(candidate) {
  let resolvedInputUrl = candidate.url;
  if (isGoogleNewsUrl(candidate.url)) {
    resolvedInputUrl = await resolveOriginalPublisherUrl(candidate.url);
  }

  const normalized = normalizeUrl(resolvedInputUrl);
  if (!normalized || isGoogleNewsUrl(normalized)) return null;

  const fromCache = articleCache.get(normalized);
  if (fromCache) return fromCache;

  let response;
  try {
    response = await axios.get(normalized, {
      timeout: config.FETCH_TIMEOUT_MS,
      maxRedirects: 8,
      headers: { "User-Agent": config.USER_AGENT },
      validateStatus: (status) => status >= 200 && status < 500,
    });
  } catch {
    if (candidate.bucket === "social") {
      return buildSocialStub(candidate, normalized);
    }
    return null;
  }

  if (response.status >= 400) {
    if (candidate.bucket === "social") {
      return buildSocialStub(candidate, normalized);
    }
    return null;
  }

  const finalUrl = normalizeUrl(response.request?.res?.responseUrl || normalized);
  if (!finalUrl || isGoogleNewsUrl(finalUrl)) return null;

  const contentType = String(response.headers["content-type"] || "");
  if (!contentType.includes("text/html")) {
    if (candidate.bucket === "social") {
      return buildSocialStub(candidate, finalUrl);
    }
    return null;
  }

  const html = response.data;
  const dom = new JSDOM(html, { url: finalUrl });
  const reader = new Readability(dom.window.document);
  const parsed = reader.parse();

  const $ = cheerio.load(html);
  const title =
    cleanText(parsed?.title) ||
    cleanText($('meta[property="og:title"]').attr("content")) ||
    cleanText($("title").first().text()) ||
    cleanText(candidate.title) ||
    "Untitled";

  let fullText = cleanText(parsed?.textContent) || fallbackParagraphText($);
  let finalText = fullText;

  if (candidate.bucket === "social") {
    const socialDescription = extractSocialDescription($);
    let redditText = "";
    if (isRedditUrl(finalUrl)) {
      redditText = await fetchRedditJsonText(finalUrl);
    }

    if (!finalText || finalText.length < 120) {
      const combined = cleanText(
        [redditText, socialDescription].filter(Boolean).join("\\n\\n")
      );
      if (combined) finalText = combined;
    } else if (socialDescription && !finalText.includes(socialDescription)) {
      finalText = cleanText([finalText, socialDescription].join("\\n\\n"));
    }
  }

  const minLength = candidate.bucket === "social" ? 20 : 500;
  if (!finalText || finalText.length < minLength) return null;

  const article = {
    title,
    source: extractDomain(finalUrl),
    author: extractAuthor($),
    published_date: cleanText(candidate.published_date) || extractPublishedDate($),
    original_url: finalUrl,
    full_text: finalText,
    bucket: candidate.bucket,
  };

  articleCache.set(finalUrl, article);
  return article;
}

async function extractArticles(candidates) {
  const out = [];
  let index = 0;

  const workers = Array.from({ length: 6 }).map(async () => {
    while (index < candidates.length) {
      const currentIndex = index;
      index += 1;
      const candidate = candidates[currentIndex];
      try {
        const article = await fetchAndExtractArticle(candidate);
        if (article) out.push(article);
      } catch {
        // Continue processing remaining sources.
      }
    }
  });

  await Promise.all(workers);
  return out;
}

function enforceQuotas(articles) {
  const selected = [];
  const usedUrls = new Set();

  const pick = (filterFn, maxCount) => {
    for (const article of articles) {
      if (selected.length >= 40) break;
      if (usedUrls.has(article.original_url)) continue;
      if (!filterFn(article)) continue;
      selected.push(article);
      usedUrls.add(article.original_url);
      if (maxCount !== null && selected.filter(filterFn).length >= maxCount) break;
    }
  };

  pick((a) => a.bucket === "news", 5);

  pick((a) => a.bucket === "social", 3);

  const independentDomains = new Set(selected.map((a) => a.source));
  for (const article of articles) {
    if (selected.length >= 40) break;
    if (usedUrls.has(article.original_url)) continue;
    if (independentDomains.size >= 3) break;
    if (!independentDomains.has(article.source)) {
      selected.push(article);
      usedUrls.add(article.original_url);
      independentDomains.add(article.source);
    }
  }

  for (const article of articles) {
    if (selected.length >= 11) break;
    if (usedUrls.has(article.original_url)) continue;
    selected.push(article);
    usedUrls.add(article.original_url);
  }

  for (const article of articles) {
    if (selected.length >= Math.min(20, articles.length)) break;
    if (usedUrls.has(article.original_url)) continue;
    selected.push(article);
    usedUrls.add(article.original_url);
  }

  return selected;
}

async function collectResearchDataset(query) {
  if (!query || !query.trim()) {
    return { articles: [], meta: { reason: "empty_query" } };
  }

  const candidates = await gatherCandidates(query);
  const extracted = await extractArticles(candidates);

  let addedSocial = 0;
  const seenExtracted = new Set(extracted.map((article) => normalizeUrl(article.original_url)));
  for (const candidate of candidates) {
    if (addedSocial >= 8) break;
    if (candidate.bucket !== "social") continue;
    const normalizedUrl = normalizeUrl(candidate.url);
    if (!normalizedUrl || seenExtracted.has(normalizedUrl)) continue;
    const stub = buildSocialStub(candidate, normalizedUrl);
    if (!stub) continue;
    extracted.push(stub);
    seenExtracted.add(normalizedUrl);
    addedSocial += 1;
  }

  const selected = enforceQuotas(extracted).map(({ bucket, ...rest }) => rest);

  return {
    articles: selected,
    meta: {
      candidates_found: candidates.length,
      extracted_full_articles: extracted.length,
      selected_articles: selected.length,
      required_minimum_target: 11,
    },
  };
}

module.exports = {
  collectResearchDataset,
  normalizeUrl,
  cleanText,
};





























