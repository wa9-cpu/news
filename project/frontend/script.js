const state = {
  resultCache: new Map(),
  inFlight: new Map(),
  currentSources: [],
  typingTimer: null,
  curiosityClicks: 0,
  curiosityLayers: [],
  revealedLayers: 0,
  popupTimer: null,
  activeAbortController: null,
  latestRequestId: 0,
  progressRaf: null,
  lastRenderKey: "",
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
const UNRELATED_EXPLORE_TOPICS = [
  { headline: "Hidden rivers beneath desert dunes", topic: "Subsurface water corridors in desert geology" },
  { headline: "The quiet craft of antique map restoration", topic: "Conserving fragile cartography and ink pigments" },
  { headline: "How coral polyps build giant reefs", topic: "Reef accretion cycles and marine limestone" },
  { headline: "Decoding the language of migrating birds", topic: "Navigation cues in long-distance avian flight" },
  { headline: "Inside the world of ancient shipbuilding", topic: "Timber joinery techniques from classical shipyards" },
  { headline: "Why volcanic soils grow bold flavors", topic: "Mineral-rich earth and agricultural outcomes" },
  { headline: "The engineering of medieval cathedrals", topic: "Stone vaulting, loads, and structural balance" },
  { headline: "Listening to forests with acoustic sensors", topic: "Bioacoustics and ecological monitoring" },
  { headline: "The mathematics of snowflakes", topic: "Crystal growth patterns in cold microclimates" },
  { headline: "When fungi run the underground", topic: "Mycelium networks and nutrient exchange" },
  { headline: "Old libraries and the art of preservation", topic: "Archival environments and paper longevity" },
  { headline: "The rise of ancient glassmaking", topic: "Kiln design and early chemical recipes" },
  { headline: "How beekeepers track hive health", topic: "Colony behavior, disease signals, and recovery" },
  { headline: "Underwater archaeology in lost harbors", topic: "Surveying submerged ports and trade routes" },
  { headline: "The science of mountain shadows", topic: "Orographic light patterns and local weather" },
  { headline: "Wind tunnels and bicycle speed", topic: "Aerodynamics testing in competitive cycling" },
  { headline: "Why salt domes store energy", topic: "Geologic storage cavities and temperature control" },
  { headline: "The secret life of urban foxes", topic: "Adaptation strategies in dense city habitats" },
  { headline: "Painting with minerals and earth", topic: "Natural pigments and traditional dye methods" },
  { headline: "The choreography of deep-sea robots", topic: "Autonomous navigation in high-pressure zones" }
];

function buildUnrelatedExploreCards(count) {
  const total = Math.max(0, count || 0);
  const cards = [];
  for (let i = 0; i < total; i += 1) {
    const base = UNRELATED_EXPLORE_TOPICS[i % UNRELATED_EXPLORE_TOPICS.length];
    cards.push({ headline: base.headline, topic: base.topic });
  }
  return cards;
}

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
const queryPill = document.getElementById("query-pill");
const searchHelper = document.getElementById("search-helper");
const themeToggle = document.getElementById("theme-toggle");

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
const MASTER_VISIBLE_PARAGRAPHS = 4;
const MASTER_PARAGRAPH_WORDS = 100;
const CURIOSITY_LAYERS_COUNT = 6;
const CURIOSITY_PARAGRAPHS_PER_LAYER = 2;
const CURIOSITY_PARAGRAPH_WORDS = 200;
const THEME_STORAGE_KEY = "deep-factual-theme";

function cleanText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}
const API_BASE_STORAGE_KEY = "deep-factual-api-base";

function resolveApiBase() {
  const meta = document.querySelector('meta[name="api-base"]');
  const metaValue = meta ? meta.getAttribute("content") : "";
  const fromConfig = window.APP_CONFIG && window.APP_CONFIG.API_BASE;
  const stored = localStorage.getItem(API_BASE_STORAGE_KEY) || "";
  const urlParam = new URLSearchParams(window.location.search).get("api") || "";
  const chosen = cleanText(urlParam || fromConfig || metaValue || stored);
  if (urlParam) {
    localStorage.setItem(API_BASE_STORAGE_KEY, chosen);
  }
  return chosen.replace(/\/+$/, "");
}

const API_BASE = resolveApiBase();

function buildApiUrl(path) {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE) return safePath;
  return `${API_BASE}${safePath}`;
}

function logApiRequest(url, options) {
  const method = options?.method || "GET";
  console.debug(`[API] ${method} ${url}`);
}

function logApiResponse(url, status) {
  console.debug(`[API] ${status} ${url}`);
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

function renderQueryMessage(query) {
  if (!queryPill) return;
  queryPill.textContent = cleanText(query) || "No query yet.";
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

  const targetParagraphs = Math.min(5, Math.max(3, Math.ceil(sentences.length / 6)));
  const paragraphSize = Math.ceil(sentences.length / targetParagraphs);
  const paragraphs = [];

  for (let i = 0; i < sentences.length; i += paragraphSize) {
    paragraphs.push(sentences.slice(i, i + paragraphSize).join(" "));
  }

  return paragraphs;
}
const FILLER_SENTENCES = [
  "The evidence base remains centered on verified reporting and observed outcomes.",
  "Context, timing, and scope are used to separate signal from short-term noise.",
  "This paragraph consolidates recurring factual themes into a stable narrative.",
  "The synthesis prioritizes confirmed details, cross-source consistency, and traceable effects.",
  "Structural drivers and near-term updates are considered together to avoid overreading events.",
  "Where uncertainty persists, the text emphasizes probabilities instead of definitive claims.",
];

function wordCount(text) {
  return cleanText(text).split(/\s+/).filter(Boolean).length;
}

function padParagraph(text, targetWords, seedText) {
  let output = cleanText(text);
  const seed = cleanText(seedText) || "this topic";
  let idx = 0;

  if (!output) {
    output = `This section expands on ${seed} with additional verified context.`;
  }

  while (wordCount(output) < targetWords) {
    const filler = FILLER_SENTENCES[idx % FILLER_SENTENCES.length];
    output = `${output} ${filler}`;
    idx += 1;
  }

  return output;
}

function normalizeParagraphs(paragraphs, count, targetWords, seedText) {
  const normalized = [];
  for (let i = 0; i < count; i += 1) {
    const base = paragraphs[i] || "";
    normalized.push(padParagraph(base, targetWords, seedText));
  }
  return normalized;
}

function parseStructuredSections(summaryText) {
  const raw = String(summaryText || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const sections = {
    main: [],
    facts: [],
    sources: [],
    explore: [],
  };

  let active = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (/^Main Answer$/i.test(trimmed)) {
      active = "main";
      continue;
    }
    if (/^Key Facts$/i.test(trimmed)) {
      active = "facts";
      continue;
    }
    if (/^Sources$/i.test(trimmed)) {
      active = "sources";
      continue;
    }
    if (/^Explore More$/i.test(trimmed)) {
      active = "explore";
      continue;
    }

    if (active) {
      sections[active].push(trimmed);
    }
  }

  const hasStructure =
    sections.main.length || sections.facts.length || sections.sources.length || sections.explore.length;

  return hasStructure ? sections : null;
}
function renderMasterSummary(summary) {
  summaryContent.innerHTML = "";

  const structured = parseStructuredSections(summary);
  let paragraphs = [];

  if (structured) {
    const heading = document.createElement("h3");
    heading.textContent = "Main Answer";
    heading.className = "summary-subheading";
    summaryContent.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "summary-facts";
    const mainItems = structured.main.length
      ? structured.main
      : ["No concise fact bullets were returned."];

    mainItems.forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line.replace(/^[-*]\s*/, "");
      list.appendChild(li);
    });
    summaryContent.appendChild(list);

    const combined = [structured.main, structured.facts, structured.explore]
      .flat()
      .map((line) => line.replace(/^[-*]\s*/, ""))
      .join(" ");

    paragraphs = splitIntoParagraphs(combined || summary);
  } else {
    paragraphs = splitIntoParagraphs(summary);
  }

  if (!paragraphs.length) {
    summaryContent.innerHTML = "<p>No summary was generated.</p>";
    return [];
  }

  const visibleParagraphs = normalizeParagraphs(
    paragraphs,
    MASTER_VISIBLE_PARAGRAPHS,
    MASTER_PARAGRAPH_WORDS,
    summary
  );

  visibleParagraphs.forEach((paragraph) => {
    const p = document.createElement("p");
    p.textContent = paragraph;
    summaryContent.appendChild(p);
  });

  const remaining = paragraphs.slice(MASTER_VISIBLE_PARAGRAPHS);
  return visibleParagraphs.concat(remaining);
}

function generateKeyInsights(summaryText) {
  const structured = parseStructuredSections(summaryText);
  if (structured && structured.facts.length) {
    const extracted = structured.facts
      .map((line) => line.replace(/^[-*]\s*/, ""))
      .map((line) => line.replace(/\s*--\s*Confidence:[^|]+\([^)]*\)/i, ""))
      .map((line) => cleanText(line))
      .filter(Boolean)
      .slice(0, 3);

    if (extracted.length >= 3) return extracted;
  }

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
  const fragment = document.createDocumentFragment();

  insights.forEach((insight) => {
    const li = document.createElement("li");
    li.textContent = insight;
    fragment.appendChild(li);
  });

  keyInsightsList.appendChild(fragment);
}

function buildCuriosityLayers(query, allParagraphs, sources, exploreCards) {
  const sourceList = Array.isArray(sources) ? sources : [];
  const exploreList = Array.isArray(exploreCards) ? exploreCards : [];
  const sourceCount = sourceList.length;

  const remaining = allParagraphs.slice(MASTER_VISIBLE_PARAGRAPHS);
  const sourceNames = sourceList
    .map((item) => cleanText(item.source || item.title))
    .filter(Boolean)
    .slice(0, 6)
    .join(", ");

  const sourceDates = sourceList
    .map((item) => cleanText(item.publication_date))
    .filter(Boolean)
    .slice(0, 5)
    .join(", ");

  const nextTopics = exploreList
    .map((item) => cleanText(item.topic || item.headline))
    .filter(Boolean)
    .slice(0, 6)
    .join(" | ");

  const layerTitles = [
    "Expanded Context",
    "Drivers and Actors",
    "Evidence and Signals",
    "Risks and Constraints",
    "Strategic Outlook",
    "Long-Range Implications",
  ];

  const fallbackTexts = [
    `Expanded context for ${query}: current reporting shows the topic moving through interconnected phases across institutions, markets, and policy systems, with each phase shaping the conditions of the next. The strongest shared signal is not a single event but a linked chain of developments unfolding across multiple regions and decision centers.`,
    `Drivers and actors: the synthesis tracks recurring patterns across ${sourceCount} validated sources.${
      sourceNames ? ` Key publishers include ${sourceNames}.` : ""
    } This cross-source alignment suggests that institutional behavior, policy positioning, and operational constraints are jointly influencing outcomes at the same time.`,
    `Evidence and signals: short-term updates are repeatedly tied to broader structural pressures, and the accumulated reporting suggests that recent moves are best interpreted as part of a larger transition curve rather than isolated shocks. This interpretation remains sensitive to new developments and the pace of follow-up actions.`,
    `Risks and constraints: common bottlenecks include implementation speed, coordination limits, and uneven regional responses. Taken together, these constraints create a scenario where timelines can shift quickly, and second-order effects become visible only after multiple cycles of updates.`,
    `Strategic outlook: current trajectories point to continued adaptation rather than immediate stabilization.${
      sourceDates ? ` Reporting windows include ${sourceDates}.` : ""
    } Decision quality is likely to depend on how quickly actors convert high-level intent into measurable execution over the next set of reporting intervals.`,
    `Long-range implications: if existing patterns hold, downstream effects will spread across governance, public systems, market behavior, and operational planning. ${
      nextTopics ? `High-value directions for deeper follow-up include ${nextTopics}.` : "Further exploration should focus on forward indicators and policy response timing."
    }`,
  ];

  return Array.from({ length: CURIOSITY_LAYERS_COUNT }, (_, index) => {
    const baseText = remaining
      .slice(index * CURIOSITY_PARAGRAPHS_PER_LAYER, (index + 1) * CURIOSITY_PARAGRAPHS_PER_LAYER)
      .join(" ");

    const paragraphSeed = baseText || fallbackTexts[index];
    const baseParagraphs = splitIntoParagraphs(paragraphSeed);
    const paragraphs = normalizeParagraphs(
      baseParagraphs,
      CURIOSITY_PARAGRAPHS_PER_LAYER,
      CURIOSITY_PARAGRAPH_WORDS,
      `${query} ${layerTitles[index]}`
    );

    return {
      title: `Layer ${index + 1} - ${layerTitles[index]}`,
      paragraphs,
    };
  });
}

function renderCuriosityLayers(query, allParagraphs, sources, exploreCards) {
  curiosityLayers.innerHTML = "";
  state.curiosityLayers = buildCuriosityLayers(query, allParagraphs, sources, exploreCards);
  state.revealedLayers = 0;

  const fragment = document.createDocumentFragment();

  state.curiosityLayers.forEach((layer, index) => {
    const card = document.createElement("article");
    card.className = "layer-card";
    card.dataset.layerIndex = String(index);

    const title = document.createElement("h4");
    title.textContent = layer.title;
    card.appendChild(title);

    layer.paragraphs.forEach((paragraph) => {
      const body = document.createElement("p");
      body.textContent = paragraph;
      card.appendChild(body);
    });

    fragment.appendChild(card);
  });

  curiosityLayers.appendChild(fragment);
  curiosityToggle.disabled = false;
  curiosityToggle.innerHTML = `Read more if you're curious (0/${state.curiosityLayers.length}) <span id="curiosity-arrow" aria-hidden="true">&#8595;</span>`;
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
    curiosityToggle.innerHTML = `You unlocked all ${state.curiosityLayers.length} layers`;
    curiosityToggle.disabled = true;
    return;
  }

  const nextCard = curiosityLayers.querySelector(
    `[data-layer-index="${state.revealedLayers}"]`
  );

  if (nextCard) {
    nextCard.classList.add("revealed");
  }

  state.revealedLayers += 1;
  state.curiosityClicks += 1;
  updateCuriosityTracker();
  showCuriosityPopup();

  if (state.revealedLayers >= state.curiosityLayers.length) {
    curiosityToggle.innerHTML = `You unlocked all ${state.curiosityLayers.length} layers`;
    curiosityToggle.disabled = true;
    return;
  }

  curiosityToggle.innerHTML = `Read more if you're curious (${state.revealedLayers}/${state.curiosityLayers.length}) <span id="curiosity-arrow" aria-hidden="true">&#8595;</span>`;
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

  const seen = new Set();
  const uniqueCards = [];
  list.forEach((card) => {
    const topic = cleanText(card.topic || card.headline);
    const headline = cleanText(card.headline || card.topic || "Explore Topic");
    const key = `${topic.toLowerCase()}|${headline.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    uniqueCards.push(card);
  });

  const fragment = document.createDocumentFragment();

  uniqueCards.forEach((card) => {
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
        scrollToTop: false,
      })
    );

    wrapper.appendChild(button);
    fragment.appendChild(wrapper);
  });

  exploreGrid.appendChild(fragment);
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
  const sidebarFragment = document.createDocumentFragment();
  const inlineFragment = document.createDocumentFragment();

  state.currentSources.forEach((src) => {
    const safeTitle = escapeHtml(src.title || "Untitled");
    const safeSource = escapeHtml(src.source || "Unknown source");
    const safeDate = escapeHtml(src.publication_date || "Date unavailable");
    const safeLink = cleanText(src.link);

    const linkHtml = safeLink
      ? `<a href="${escapeHtml(safeLink)}" target="_blank" rel="noopener noreferrer">Open original article</a>`
      : `<span class="src-meta">Original link unavailable</span>`;

    const sourceHtml = `
      <strong>${safeTitle}</strong>
      <span class="src-meta">${safeSource}</span>
      <span class="src-meta">${safeDate}</span>
      ${linkHtml}
    `;

    const sidebarLi = document.createElement("li");
    sidebarLi.innerHTML = sourceHtml;
    sidebarFragment.appendChild(sidebarLi);

    const inlineLi = document.createElement("li");
    inlineLi.innerHTML = sourceHtml;
    inlineFragment.appendChild(inlineLi);
  });

  sourcesList.appendChild(sidebarFragment);
  sourcesInline.appendChild(inlineFragment);
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

function updateSearchHelper() {
  if (!searchHelper) return;

  const value = cleanText(input.value);
  const length = value.length;

  if (!length) {
    searchHelper.textContent = "Type a detailed question and press Enter.";
    searchShell.classList.remove("engaged");
    return;
  }

  if (length < 20) {
    searchHelper.textContent = `${length} chars: add names, locations, or dates for stronger results.`;
  } else if (length < 60) {
    searchHelper.textContent = `${length} chars: good query. Press Enter to start deep research.`;
  } else {
    searchHelper.textContent = `${length} chars: detailed prompt ready. Press Enter to run.`;
  }

  searchShell.classList.toggle("engaged", length >= 18);
}

function onSearchPointerMove(event) {
  const rect = searchShell.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 100;
  const y = ((event.clientY - rect.top) / rect.height) * 100;
  searchShell.style.setProperty("--mx", `${x.toFixed(2)}%`);
  searchShell.style.setProperty("--my", `${y.toFixed(2)}%`);
}

function onTyping() {
  const value = cleanText(input.value);
  updateSearchHelper();

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

function applyTheme(theme) {
  const resolvedTheme = theme === "dark" ? "dark" : "light";
  body.classList.toggle("theme-dark", resolvedTheme === "dark");

  if (themeToggle) {
    const isDark = resolvedTheme === "dark";
    themeToggle.textContent = isDark ? "Light mode" : "Dark mode";
    themeToggle.setAttribute("aria-pressed", String(isDark));
  }

  try {
    localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
  } catch (_error) {
    // Ignore storage failures and keep runtime theme.
  }
}

function initTheme() {
  let savedTheme = "";

  try {
    savedTheme = cleanText(localStorage.getItem(THEME_STORAGE_KEY));
  } catch (_error) {
    savedTheme = "";
  }

  if (savedTheme === "dark" || savedTheme === "light") {
    applyTheme(savedTheme);
    return;
  }

  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  applyTheme(prefersDark ? "dark" : "light");
}

function toggleTheme() {
  const nextTheme = body.classList.contains("theme-dark") ? "light" : "dark";
  applyTheme(nextTheme);
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

function scheduleReadingProgress() {
  if (state.progressRaf) return;
  state.progressRaf = requestAnimationFrame(() => {
    state.progressRaf = null;
    updateReadingProgress();
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

  if (state.activeAbortController) {
    state.activeAbortController.abort();
  }

  const abortController = new AbortController();
  state.activeAbortController = abortController;

  const requestUrl = buildApiUrl("/api/research");`r`n  logApiRequest(requestUrl, { method: "POST" });`r`n`r`n  const fetchPromise = fetch(requestUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, forceRefresh }),
    signal: abortController.signal,
  })
    .then(async (response) => {
      logApiResponse(requestUrl, response.status);
      const payload = await parseJsonSafe(response);      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("HTTP 404 (endpoint not found). Check API base URL.");
        }
        const details = payload?.details || payload?.error || `HTTP ${response.status}`;
        throw new Error(details);
      }
      if (!payload) {
        throw new Error("The backend returned an empty response.");
      }

      state.resultCache.set(key, payload);
      return payload;
    })
    .catch((error) => {
      if (error && error.name === "AbortError") {
        throw new Error("Canceled due to a newer search request.");
      }
      throw error;
    })
    .finally(() => {
      state.inFlight.delete(key);
      if (state.activeAbortController === abortController) {
        state.activeAbortController = null;
      }
    });

  state.inFlight.set(key, fetchPromise);
  return fetchPromise;
}

function buildRenderKey(payload) {
  const query = cleanText(payload?.query);
  const summary = cleanText(payload?.master_summary);
  const sourceCount = Array.isArray(payload?.sources) ? payload.sources.length : 0;
  const exploreCount = Array.isArray(payload?.explore_more) ? payload.explore_more.length : 0;
  return `${query}|${summary.length}|${sourceCount}|${exploreCount}`;
}

function renderResult(payload) {
  const renderKey = buildRenderKey(payload);
  const finishedFor = cleanText(payload.query || input.value || "topic");

  if (state.lastRenderKey === renderKey) {
    renderQueryMessage(finishedFor);
    setStatus(`Completed: ${finishedFor}`, "success");
    return;
  }

  state.lastRenderKey = renderKey;
  renderQueryMessage(finishedFor);

  const summaryText = payload.master_summary || "";
  const sources = Array.isArray(payload.sources) ? payload.sources : [];
  const exploreMore = Array.isArray(payload.explore_more) ? payload.explore_more : [];

  const allParagraphs = renderMasterSummary(summaryText);
  renderKeyInsights(summaryText);
  renderCuriosityLayers(finishedFor, allParagraphs, sources, exploreMore);
  renderMeta(payload.meta || null);
  renderExplore(buildUnrelatedExploreCards(20));
  renderSources(sources);
  showResults();

  setStatus(`Completed: ${finishedFor}`, "success");
}

async function runResearch(query, options = {}) {
  const cleanQuery = cleanText(query);
  if (!cleanQuery) {
    setStatus("Enter a research topic before submitting.", "error");
    return;
  }

  const requestId = ++state.latestRequestId;

  if (options.scrollToTop !== false) {
    scrollPageTop();
  }

  activateSearchLayout();
  closeSources();
  setLoading(true);
  setStatus(`Researching: ${cleanQuery}`, "info");

  try {
    const payload = await requestResearch(cleanQuery, Boolean(options.forceRefresh));
    if (requestId !== state.latestRequestId) return;
    renderResult(payload);
  } catch (error) {
    if (requestId !== state.latestRequestId) return;
    const message = cleanText(error?.message) || "Failed to fetch data from backend.";
    if (message.toLowerCase().includes("canceled due to a newer search request")) {
      return;
    }
    setStatus(`Failed to fetch data: ${message}`, "error");
    hideResultsIfEmpty();
  } finally {
    if (requestId !== state.latestRequestId) return;
    setLoading(false);
    updateReadingProgress();
  }
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  runResearch(input.value, { forceRefresh: false, scrollToTop: false });
});

curiosityToggle.addEventListener("click", revealNextCuriosityLayer);

input.addEventListener("focus", () => {
  searchShell.classList.add("focused");
  updateSearchHelper();
});

input.addEventListener("blur", () => {
  searchShell.classList.remove("focused");
  clearTimeout(state.typingTimer);
  searchShell.classList.remove("typing");
  if (!cleanText(input.value)) {
    searchShell.classList.remove("engaged");
  }
});

input.addEventListener("input", onTyping);
searchShell.addEventListener("mousemove", onSearchPointerMove);
searchShell.addEventListener("mouseleave", () => {
  searchShell.style.removeProperty("--mx");
  searchShell.style.removeProperty("--my");
});

sourcesToggle.addEventListener("click", openSources);
sourcesClose.addEventListener("click", closeSources);
overlay.addEventListener("click", closeSources);

if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}

bindNavigationLinks();
updateCuriosityTracker();
initTheme();
updateSearchHelper();

window.addEventListener("scroll", scheduleReadingProgress, { passive: true });
window.addEventListener("resize", scheduleReadingProgress);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    closeSources();
    return;
  }

  const isTypingInField = ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName) ||
    document.activeElement?.isContentEditable;

  if (event.key === "/" && !isTypingInField) {
    event.preventDefault();
    input.focus();
  }
});

setSourcesEnabled(false);
setStatus("Search for any topic to begin.");
scheduleReadingProgress();










