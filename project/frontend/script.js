const state = {
  resultCache: new Map(),
  inFlight: new Map(),
  currentSources: [],
  typingTimer: null,
  curiosityClicks: 0,
  curiosityLayers: [],
  revealedLayers: 0,
  popupTimer: null,
};

const CURIOSITY_MESSAGES = [
  "Curiosity is the engine of discovery.",
  "Great thinkers always ask for more context.",
  "You chose to learn more. That habit builds understanding.",
  "Exploring deeper layers of knowledge sharpens thinking.",
  "Nice curiosity. Keep going.",
  "Depth beats speed when understanding complex topics.",
  "Each extra layer reveals patterns others miss.",
  "Questions open doors that assumptions close.",
  "Learning deeply is a long-term advantage.",
  "You are building knowledge, not just collecting headlines.",
];

const body = document.body;
const form = document.getElementById("search-form");
const input = document.getElementById("query-input");
const searchShell = document.getElementById("search-shell");
const searchBtn = document.getElementById("search-btn");
const statusLine = document.getElementById("status-line");

const resultsLayout = document.getElementById("results-layout");
const summaryContent = document.getElementById("summary-content");
const keyInsightsList = document.getElementById("key-insights-list");
const metaContent = document.getElementById("meta-content");
const exploreGrid = document.getElementById("explore-grid");

const curiosityToggle = document.getElementById("curiosity-toggle");
const curiosityLayers = document.getElementById("curiosity-layers");
const curiosityArrow = document.getElementById("curiosity-arrow");
const curiosityPopup = document.getElementById("curiosity-popup");
const curiosityTracker = document.getElementById("curiosity-tracker");
const curiosityCount = document.getElementById("curiosity-count");
const curiosityLevel = document.getElementById("curiosity-level");

const sourcesToggle = document.getElementById("sources-toggle");
const sourcesSidebar = document.getElementById("sources-sidebar");
const sourcesClose = document.getElementById("sources-close");
const sourcesList = document.getElementById("sources-list");
const sourcesInline = document.getElementById("sources-inline");
const overlay = document.getElementById("overlay");

const readingProgressFill = document.getElementById("reading-progress-fill");
const articleRoot = document.getElementById("article-root");

const TYPING_IDLE_MS = 700;

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function cleanSeed(text) {
  return String(text || "research")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function scrollPageTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setStatus(text, stateName = "info") {
  statusLine.textContent = text || "";
  statusLine.dataset.state = stateName;
}

function setLoading(isLoading) {
  searchBtn.disabled = isLoading;
  searchShell.classList.toggle("loading", isLoading);
  if (!isLoading) {
    searchShell.classList.remove("typing");
  }
}

function activateSearchLayout() {
  body.classList.remove("pre-search");
  body.classList.add("search-active");
}

function showResults() {
  resultsLayout.classList.remove("hidden");
  requestAnimationFrame(() => {
    resultsLayout.classList.add("visible");
    body.classList.add("has-results");
    updateReadingProgress();
  });
}

function hideResultsIfEmpty() {
  const hasSummary = cleanText(summaryContent.textContent).length > 0;
  const hasExplore = exploreGrid.children.length > 0;
  if (hasSummary || hasExplore) return;

  resultsLayout.classList.remove("visible");
  resultsLayout.classList.add("hidden");
  readingProgressFill.style.width = "0%";
}

function splitIntoParagraphs(text) {
  const raw = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!raw) return [];

  const blocks = raw
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length >= 3) return blocks;

  const sentences = raw
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (sentences.length < 6) return blocks.length ? blocks : [raw];

  const targetParagraphs = Math.min(6, Math.max(3, Math.ceil(sentences.length / 4)));
  const paragraphSize = Math.ceil(sentences.length / targetParagraphs);
  const paragraphs = [];

  for (let i = 0; i < sentences.length; i += paragraphSize) {
    paragraphs.push(sentences.slice(i, i + paragraphSize).join(" "));
  }

  return paragraphs;
}

function renderMasterSummary(summary) {
  summaryContent.innerHTML = "";
  const paragraphs = splitIntoParagraphs(summary);

  if (!paragraphs.length) {
    summaryContent.innerHTML = "<p>No summary was generated.</p>";
    return [];
  }

  const visibleParagraphs = paragraphs.slice(0, 2);
  visibleParagraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    summaryContent.appendChild(p);
  });

  return paragraphs;
}

function generateKeyInsights(summaryText) {
  const sentences = cleanText(summaryText)
    .split(/(?<=[.!?])\s+/)
    .map((s) => cleanText(s))
    .filter((s) => s.length >= 45);

  const unique = [];
  for (const sentence of sentences) {
    const normalized = sentence.replace(/[.!?]+$/g, "");
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (unique.find((x) => x.toLowerCase() === key)) continue;
    unique.push(normalized);
    if (unique.length >= 3) break;
  }

  if (unique.length >= 3) return unique;

  const fallback = [
    "Core developments are unfolding in multiple linked stages.",
    "Short-term updates are interacting with longer-term structural pressures.",
    "The most reliable interpretation depends on cross-source consistency and trend direction.",
  ];

  return [...unique, ...fallback].slice(0, 3);
}

function renderKeyInsights(summaryText) {
  keyInsightsList.innerHTML = "";
  const insights = generateKeyInsights(summaryText);

  insights.forEach((insight) => {
    const li = document.createElement("li");
    li.textContent = insight;
    keyInsightsList.appendChild(li);
  });
}

function buildCuriosityLayers(query, allParagraphs, sourceCount) {
  const remaining = allParagraphs.slice(2);

  const layerOneText =
    remaining.slice(0, 2).join(" ") ||
    `Expanded context for ${query}: the topic is shaped by interconnected updates across institutions, policies, and operational realities.`;

  const layerTwoText =
    remaining.slice(2, 4).join(" ") ||
    `Detailed analysis indicates that multiple drivers are moving together, and the relationship between short-term events and structural conditions is central to understanding outcomes.`;

  const layerThreeText =
    remaining.slice(4).join(" ") ||
    `Broader implications point to medium-term effects on decision-making, risk, and public systems. This synthesis currently references ${sourceCount} sources for factual grounding.`;

  return [
    { title: "Layer 1 - Expanded Context", text: layerOneText },
    { title: "Layer 2 - Detailed Analysis", text: layerTwoText },
    { title: "Layer 3 - Broader Implications", text: layerThreeText },
  ];
}

function renderCuriosityLayers(query, allParagraphs, sourceCount) {
  curiosityLayers.innerHTML = "";
  state.curiosityLayers = buildCuriosityLayers(query, allParagraphs, sourceCount);
  state.revealedLayers = 0;

  state.curiosityLayers.forEach((layer, index) => {
    const card = document.createElement("article");
    card.className = "layer-card";
    card.dataset.layerIndex = String(index);

    const title = document.createElement("h4");
    title.textContent = layer.title;

    const body = document.createElement("p");
    body.textContent = layer.text;

    card.appendChild(title);
    card.appendChild(body);
    curiosityLayers.appendChild(card);
  });

  curiosityToggle.disabled = false;
  curiosityToggle.innerHTML = "Read more if you're curious <span id=\"curiosity-arrow\" aria-hidden=\"true\">&#8595;</span>";
}

function getCuriosityLevel(clicks) {
  if (clicks >= 6) return "Knowledge Seeker";
  if (clicks >= 3) return "Deep Thinker";
  return "Explorer";
}

function updateCuriosityTracker() {
  curiosityCount.textContent = `You explored deeper ${state.curiosityClicks} times.`;
  curiosityLevel.textContent = `Level: ${getCuriosityLevel(state.curiosityClicks)}`;

  curiosityTracker.classList.remove("tracker-highlight");
  requestAnimationFrame(() => {
    curiosityTracker.classList.add("tracker-highlight");
  });
}

function randomCuriosityMessage() {
  const idx = Math.floor(Math.random() * CURIOSITY_MESSAGES.length);
  return CURIOSITY_MESSAGES[idx];
}

function showCuriosityPopup() {
  curiosityPopup.textContent = randomCuriosityMessage();
  curiosityPopup.classList.add("show");

  if (state.popupTimer) {
    clearTimeout(state.popupTimer);
  }

  state.popupTimer = setTimeout(() => {
    curiosityPopup.classList.remove("show");
  }, 2400);
}

function revealNextCuriosityLayer() {
  if (state.revealedLayers >= state.curiosityLayers.length) {
    curiosityToggle.innerHTML = "You unlocked all layers";
    curiosityToggle.disabled = true;
    return;
  }

  const nextCard = curiosityLayers.querySelector(
    `[data-layer-index=\"${state.revealedLayers}\"]`
  );

  if (nextCard) {
    nextCard.classList.add("revealed");
  }

  state.revealedLayers += 1;
  state.curiosityClicks += 1;
  updateCuriosityTracker();
  showCuriosityPopup();

  if (state.revealedLayers >= state.curiosityLayers.length) {
    curiosityToggle.innerHTML = "You unlocked all layers";
    curiosityToggle.disabled = true;
  }
}

function renderMeta(meta) {
  if (!meta || typeof meta !== "object") {
    metaContent.textContent = "";
    return;
  }

  const chunks = [
    `Candidates: ${meta.candidates_found ?? 0}`,
    `Extracted full articles: ${meta.extracted_full_articles ?? 0}`,
    `Deduplicated: ${meta.deduplicated_articles ?? 0}`,
    `Selected: ${meta.selected_articles ?? 0}`,
  ];

  metaContent.textContent = chunks.join(" | ");
}

function buildPhotoFallback(headline) {
  const seed = encodeURIComponent(cleanSeed(headline) || "explore-topic");
  return `https://picsum.photos/seed/${seed}/640/360`;
}

function buildSvgFallback(headline) {
  const safeHeadline = escapeHtml(cleanText(headline).slice(0, 72) || "Explore Topic");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630' viewBox='0 0 1200 630'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='#1e3a8a'/><stop offset='100%' stop-color='#2563eb'/></linearGradient></defs><rect width='100%' height='100%' fill='url(#g)'/><circle cx='1080' cy='-20' r='190' fill='rgba(255,255,255,0.15)'/><text x='60' y='320' font-family='Segoe UI, Arial, sans-serif' font-size='48' fill='white' font-weight='700'>${safeHeadline}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function renderExplore(cards) {
  exploreGrid.innerHTML = "";
  const list = Array.isArray(cards) ? cards : [];

  if (!list.length) {
    const empty = document.createElement("p");
    empty.textContent = "No related topics were generated.";
    exploreGrid.appendChild(empty);
    return;
  }

  list.forEach((card) => {
    const topic = cleanText(card.topic || card.headline);
    const headline = cleanText(card.headline || card.topic || "Explore Topic");
    const imageUrl = cleanText(card.image_url) || buildPhotoFallback(headline);
    const description = cleanText(card.topic)
      ? `Investigate ${cleanText(card.topic)} through a full factual synthesis.`
      : "Open a deeper research path from this angle.";

    const wrapper = document.createElement("article");
    wrapper.className = "explore-card";

    const button = document.createElement("button");
    button.className = "explore-card-btn";
    button.type = "button";
    button.setAttribute("aria-label", `Explore: ${headline}`);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = headline;
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.addEventListener("error", () => {
      if (!img.dataset.photoFallbackApplied) {
        img.dataset.photoFallbackApplied = "1";
        img.src = buildPhotoFallback(`${headline}-fallback`);
        return;
      }

      if (!img.dataset.svgFallbackApplied) {
        img.dataset.svgFallbackApplied = "1";
        img.src = buildSvgFallback(headline);
      }
    });

    const copy = document.createElement("div");
    copy.className = "explore-copy";

    const h3 = document.createElement("h3");
    h3.textContent = headline;

    const p = document.createElement("p");
    p.textContent = description;

    copy.appendChild(h3);
    copy.appendChild(p);

    button.appendChild(img);
    button.appendChild(copy);
    button.addEventListener("click", () =>
      runResearch(topic || headline, {
        forceRefresh: false,
        scrollToTop: true,
      })
    );

    wrapper.appendChild(button);
    exploreGrid.appendChild(wrapper);
  });
}

function setSourcesEnabled(enabled) {
  sourcesToggle.disabled = !enabled;
}

function renderSources(sources) {
  state.currentSources = Array.isArray(sources) ? sources : [];
  sourcesList.innerHTML = "";
  sourcesInline.innerHTML = "";

  if (!state.currentSources.length) {
    setSourcesEnabled(false);

    const emptySidebar = document.createElement("li");
    emptySidebar.textContent = "No sources available for this query.";
    sourcesList.appendChild(emptySidebar);

    const emptyInline = document.createElement("li");
    emptyInline.textContent = "No sources available for this query.";
    sourcesInline.appendChild(emptyInline);
    return;
  }

  setSourcesEnabled(true);

  state.currentSources.forEach((src) => {
    const sourceHtml = `
      <strong>${escapeHtml(src.title || "Untitled")}</strong>
      <span class="src-meta">${escapeHtml(src.source || "Unknown source")}</span>
      <span class="src-meta">${escapeHtml(src.publication_date || "Date unavailable")}</span>
      <a href="${escapeHtml(src.link || "#")}" target="_blank" rel="noopener noreferrer">Open original article</a>
    `;

    const sidebarLi = document.createElement("li");
    sidebarLi.innerHTML = sourceHtml;
    sourcesList.appendChild(sidebarLi);

    const inlineLi = document.createElement("li");
    inlineLi.innerHTML = sourceHtml;
    sourcesInline.appendChild(inlineLi);
  });
}

function openSources() {
  if (!state.currentSources.length) return;
  sourcesSidebar.classList.add("open");
  sourcesSidebar.setAttribute("aria-hidden", "false");
  overlay.classList.remove("hidden");
}

function closeSources() {
  sourcesSidebar.classList.remove("open");
  sourcesSidebar.setAttribute("aria-hidden", "true");
  overlay.classList.add("hidden");
}

function onTyping() {
  const value = cleanText(input.value);
  if (!value) {
    clearTimeout(state.typingTimer);
    searchShell.classList.remove("typing");
    return;
  }

  searchShell.classList.add("typing");
  clearTimeout(state.typingTimer);
  state.typingTimer = setTimeout(() => {
    if (document.activeElement !== input) {
      searchShell.classList.remove("typing");
    }
  }, TYPING_IDLE_MS);
}

function bindNavigationLinks() {
  const navLinks = document.querySelectorAll(".nav-link");
  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const href = cleanText(link.getAttribute("href"));
      if (!href.startsWith("#")) return;

      event.preventDefault();

      if (href === "#" || href === "#home") {
        scrollPageTop();
        return;
      }

      const target = document.querySelector(href);
      if (!target) {
        scrollPageTop();
        return;
      }

      target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function updateReadingProgress() {
  if (resultsLayout.classList.contains("hidden")) {
    readingProgressFill.style.width = "0%";
    return;
  }

  const start = articleRoot.offsetTop - 120;
  const end = resultsLayout.offsetTop + resultsLayout.offsetHeight - window.innerHeight;
  const range = Math.max(1, end - start);
  const progress = Math.min(1, Math.max(0, (window.scrollY - start) / range));
  readingProgressFill.style.width = `${(progress * 100).toFixed(2)}%`;
}

async function parseJsonSafe(response) {
  try {
    return await response.json();
  } catch (_error) {
    return null;
  }
}

async function requestResearch(query, forceRefresh) {
  const key = cleanText(query).toLowerCase();

  if (!forceRefresh && state.resultCache.has(key)) {
    return state.resultCache.get(key);
  }

  if (state.inFlight.has(key)) {
    return state.inFlight.get(key);
  }

  const fetchPromise = fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, forceRefresh }),
  })
    .then(async (response) => {
      const payload = await parseJsonSafe(response);
      if (!response.ok) {
        const details = payload?.details || payload?.error || `HTTP ${response.status}`;
        throw new Error(details);
      }
      if (!payload) {
        throw new Error("The backend returned an empty response.");
      }

      state.resultCache.set(key, payload);
      state.inFlight.delete(key);
      return payload;
    })
    .catch((error) => {
      state.inFlight.delete(key);
      throw error;
    });

  state.inFlight.set(key, fetchPromise);
  return fetchPromise;
}

function renderResult(payload) {
  const allParagraphs = renderMasterSummary(payload.master_summary || "");
  renderKeyInsights(payload.master_summary || "");
  renderCuriosityLayers(payload.query || input.value || "topic", allParagraphs, (payload.sources || []).length);
  renderMeta(payload.meta || null);
  renderExplore(payload.explore_more || []);
  renderSources(payload.sources || []);
  showResults();

  const finishedFor = cleanText(payload.query || input.value || "topic");
  setStatus(`Completed: ${finishedFor}`, "success");
}

async function runResearch(query, options = {}) {
  const cleanQuery = cleanText(query);
  if (!cleanQuery) {
    setStatus("Enter a research topic before submitting.", "error");
    return;
  }

  if (options.scrollToTop !== false) {
    scrollPageTop();
  }

  activateSearchLayout();
  closeSources();
  setLoading(true);
  setStatus(`Researching: ${cleanQuery}`, "info");

  try {
    const payload = await requestResearch(cleanQuery, Boolean(options.forceRefresh));
    renderResult(payload);
  } catch (error) {
    const message = cleanText(error?.message) || "Failed to fetch data from backend.";
    setStatus(`Failed to fetch data: ${message}`, "error");
    hideResultsIfEmpty();
  } finally {
    setLoading(false);
    updateReadingProgress();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runResearch(input.value, { forceRefresh: false, scrollToTop: true });
});

curiosityToggle.addEventListener("click", revealNextCuriosityLayer);

input.addEventListener("focus", () => {
  searchShell.classList.add("focused");
});

input.addEventListener("blur", () => {
  searchShell.classList.remove("focused");
  clearTimeout(state.typingTimer);
  searchShell.classList.remove("typing");
});

input.addEventListener("input", onTyping);

sourcesToggle.addEventListener("click", openSources);
sourcesClose.addEventListener("click", closeSources);
overlay.addEventListener("click", closeSources);

bindNavigationLinks();
updateCuriosityTracker();

window.addEventListener("scroll", updateReadingProgress, { passive: true });
window.addEventListener("resize", updateReadingProgress);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSources();
  }
});

setSourcesEnabled(false);
setStatus("Search for any topic to begin.");
updateReadingProgress();
