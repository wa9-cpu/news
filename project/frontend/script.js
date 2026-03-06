const state = {
  resultCache: new Map(),
  inFlight: new Map(),
  currentSources: [],
  typingTimer: null,
};

const body = document.body;
const form = document.getElementById("search-form");
const input = document.getElementById("query-input");
const searchShell = document.getElementById("search-shell");
const searchBtn = document.getElementById("search-btn");
const statusLine = document.getElementById("status-line");

const results = document.getElementById("results");
const summaryContent = document.getElementById("summary-content");
const metaContent = document.getElementById("meta-content");
const exploreGrid = document.getElementById("explore-grid");

const sourcesToggle = document.getElementById("sources-toggle");
const sourcesSidebar = document.getElementById("sources-sidebar");
const sourcesClose = document.getElementById("sources-close");
const sourcesList = document.getElementById("sources-list");
const overlay = document.getElementById("overlay");

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
  results.classList.remove("hidden");
  requestAnimationFrame(() => {
    results.classList.add("visible");
    body.classList.add("has-results");
  });
}

function hideResultsIfEmpty() {
  const hasSummary = cleanText(summaryContent.textContent).length > 0;
  const hasExplore = exploreGrid.children.length > 0;
  if (hasSummary || hasExplore) return;

  results.classList.remove("visible");
  results.classList.add("hidden");
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

  const targetParagraphs = Math.min(5, Math.max(3, Math.ceil(sentences.length / 4)));
  const paragraphSize = Math.ceil(sentences.length / targetParagraphs);
  const paragraphs = [];

  for (let i = 0; i < sentences.length; i += paragraphSize) {
    paragraphs.push(sentences.slice(i, i + paragraphSize).join(" "));
  }

  return paragraphs;
}

function renderSummary(summary) {
  summaryContent.innerHTML = "";
  const paragraphs = splitIntoParagraphs(summary);

  if (!paragraphs.length) {
    summaryContent.innerHTML = "<p>No summary was generated.</p>";
    return;
  }

  paragraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    summaryContent.appendChild(p);
  });
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

function buildFallbackImage(headline) {
  const label = encodeURIComponent(cleanText(headline).slice(0, 56) || "Explore Topic");
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='630'>
    <defs>
      <linearGradient id='g' x1='0' y1='0' x2='1' y2='1'>
        <stop offset='0%' stop-color='#1e3a8a'/>
        <stop offset='100%' stop-color='#2563eb'/>
      </linearGradient>
    </defs>
    <rect width='100%' height='100%' fill='url(#g)'/>
    <circle cx='1080' cy='-20' r='190' fill='rgba(255,255,255,0.15)'/>
    <text x='64' y='320' font-family='Segoe UI, Arial, sans-serif' font-size='58' fill='white' font-weight='700'>${label}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${svg}`;
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
    const imageUrl = cleanText(card.image_url) || buildFallbackImage(headline);

    const wrapper = document.createElement("article");
    wrapper.className = "explore-card";

    const button = document.createElement("button");
    button.className = "explore-card-btn";
    button.type = "button";
    button.setAttribute("aria-label", `Explore: ${headline}`);

    const img = document.createElement("img");
    img.src = imageUrl;
    img.alt = headline;

    const copy = document.createElement("div");
    copy.className = "explore-copy";
    const h3 = document.createElement("h3");
    h3.textContent = headline;
    copy.appendChild(h3);

    button.appendChild(img);
    button.appendChild(copy);
    button.addEventListener("click", () => runResearch(topic || headline, { forceRefresh: false }));

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

  if (!state.currentSources.length) {
    setSourcesEnabled(false);
    const li = document.createElement("li");
    li.textContent = "No sources available for this query.";
    sourcesList.appendChild(li);
    return;
  }

  setSourcesEnabled(true);

  state.currentSources.forEach((src) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${escapeHtml(src.title || "Untitled")}</strong>
      <span class="src-meta">${escapeHtml(src.source || "Unknown source")}</span>
      <span class="src-meta">${escapeHtml(src.publication_date || "Date unavailable")}</span>
      <a href="${escapeHtml(src.link || "#")}" target="_blank" rel="noopener noreferrer">Open original article</a>
    `;
    sourcesList.appendChild(li);
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
  renderSummary(payload.master_summary || "");
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
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runResearch(input.value, { forceRefresh: false });
});

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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSources();
  }
});

setSourcesEnabled(false);
setStatus("Search for any topic to begin.");
