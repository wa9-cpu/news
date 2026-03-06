const state = {
  resultCache: new Map(),
  inFlight: new Map(),
  currentSources: [],
};

const form = document.getElementById("search-form");
const input = document.getElementById("query-input");
const statusLine = document.getElementById("status-line");
const summarySection = document.getElementById("summary-section");
const summaryContent = document.getElementById("summary-content");
const metaContent = document.getElementById("meta-content");
const exploreSection = document.getElementById("explore-section");
const exploreGrid = document.getElementById("explore-grid");

const sourcesToggle = document.getElementById("sources-toggle");
const sourcesClose = document.getElementById("sources-close");
const sourcesSidebar = document.getElementById("sources-sidebar");
const sourcesList = document.getElementById("sources-list");
const overlay = document.getElementById("overlay");

function setStatus(text) {
  statusLine.textContent = text || "";
}

function setLoading(query) {
  setStatus(`Running multi-agent research for: ${query}`);
}

function setError(message) {
  setStatus(`Error: ${message}`);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function openSources() {
  sourcesSidebar.classList.add("open");
  sourcesSidebar.setAttribute("aria-hidden", "false");
  overlay.classList.remove("hidden");
}

function closeSources() {
  sourcesSidebar.classList.remove("open");
  sourcesSidebar.setAttribute("aria-hidden", "true");
  overlay.classList.add("hidden");
}

function renderSources(sources) {
  state.currentSources = Array.isArray(sources) ? sources : [];
  sourcesList.innerHTML = "";

  if (!state.currentSources.length) {
    sourcesList.innerHTML = "<li>No sources available.</li>";
    return;
  }

  for (const src of state.currentSources) {
    const li = document.createElement("li");
    li.innerHTML = `
      <strong>${escapeHtml(src.title || "Untitled")}</strong><br />
      <span>${escapeHtml(src.source || "Unknown source")}</span><br />
      <span>${escapeHtml(src.publication_date || "Date unavailable")}</span><br />
      <a href="${escapeHtml(src.link)}" target="_blank" rel="noopener noreferrer">Open original article</a>
    `;
    sourcesList.appendChild(li);
  }
}

function renderSummary(summary) {
  const paragraphs = String(summary || "")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  summaryContent.innerHTML = "";

  if (!paragraphs.length) {
    summaryContent.innerHTML = "<p>No summary generated.</p>";
    return;
  }

  for (const paragraph of paragraphs) {
    const p = document.createElement("p");
    p.textContent = paragraph;
    summaryContent.appendChild(p);
  }
}

function renderMeta(meta) {
  if (!meta) {
    metaContent.textContent = "";
    return;
  }

  const parts = [
    `Candidates: ${meta.candidates_found ?? 0}`,
    `Extracted full articles: ${meta.extracted_full_articles ?? 0}`,
    `Deduplicated: ${meta.deduplicated_articles ?? 0}`,
    `Selected: ${meta.selected_articles ?? 0}`,
  ];

  metaContent.textContent = parts.join(" | ");
}

async function runTopic(topic) {
  if (!topic) return;
  input.value = topic;
  await runResearch(topic, { forceRefresh: false });
}

function renderExplore(cards) {
  exploreGrid.innerHTML = "";
  const rows = Array.isArray(cards) ? cards : [];

  if (!rows.length) {
    exploreGrid.innerHTML = "<p>No explore topics generated.</p>";
    return;
  }

  rows.forEach((card) => {
    const cardEl = document.createElement("article");
    cardEl.className = "explore-card";

    const img = document.createElement("img");
    img.src = card.image_url || "";
    img.alt = card.headline || card.topic || "Explore topic";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = card.headline || card.topic || "Explore";
    button.addEventListener("click", () => runTopic(card.topic || card.headline));

    cardEl.appendChild(img);
    cardEl.appendChild(button);
    exploreGrid.appendChild(cardEl);
  });
}

async function requestResearch(query, forceRefresh = false) {
  const key = query.toLowerCase().trim();
  if (!forceRefresh && state.resultCache.has(key)) {
    return state.resultCache.get(key);
  }

  if (state.inFlight.has(key)) {
    return state.inFlight.get(key);
  }

  const promise = fetch("/api/research", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, forceRefresh }),
  })
    .then(async (res) => {
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Request failed");
      state.resultCache.set(key, payload);
      state.inFlight.delete(key);
      return payload;
    })
    .catch((err) => {
      state.inFlight.delete(key);
      throw err;
    });

  state.inFlight.set(key, promise);
  return promise;
}

function renderResult(payload) {
  summarySection.classList.remove("hidden");
  exploreSection.classList.remove("hidden");

  renderSummary(payload.master_summary || "");
  renderMeta(payload.meta || null);
  renderSources(payload.sources || []);
  renderExplore(payload.explore_more || []);

  setStatus(`Completed: ${payload.query}`);
}

async function runResearch(query, options = {}) {
  const cleanQuery = String(query || "").trim();
  if (!cleanQuery) return;

  try {
    setLoading(cleanQuery);
    const payload = await requestResearch(cleanQuery, Boolean(options.forceRefresh));
    renderResult(payload);
  } catch (error) {
    setError(error.message || "Unknown failure");
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  await runResearch(input.value, { forceRefresh: false });
});

sourcesToggle.addEventListener("click", openSources);
sourcesClose.addEventListener("click", closeSources);
overlay.addEventListener("click", closeSources);

runResearch("global energy transition", { forceRefresh: false });
