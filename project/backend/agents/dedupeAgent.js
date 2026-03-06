const { normalizeUrl, cleanText } = require("./researchAgent");

function tokenize(text) {
  return new Set(
    cleanText(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 3)
      .slice(0, 220)
  );
}

function jaccard(aSet, bSet) {
  let intersection = 0;
  for (const value of aSet) {
    if (bSet.has(value)) intersection += 1;
  }
  const union = aSet.size + bSet.size - intersection;
  return union ? intersection / union : 0;
}

function fingerprint(article) {
  const title = cleanText(article.title || "").toLowerCase();
  const textHead = cleanText(article.full_text || "").slice(0, 1200).toLowerCase();
  return `${title}|${textHead.slice(0, 500)}`;
}

function deduplicateArticles(articles) {
  const output = [];
  const seenUrls = new Set();
  const seenFingerprints = new Set();

  for (const article of articles) {
    if (!article || !article.original_url || !article.full_text) continue;

    const canonicalUrl = normalizeUrl(article.original_url);
    if (seenUrls.has(canonicalUrl)) continue;

    const fp = fingerprint(article);
    if (seenFingerprints.has(fp)) continue;

    const tokens = tokenize(article.full_text);
    let nearDuplicate = false;

    for (const existing of output) {
      const similarity = jaccard(tokens, existing._tokens);
      if (similarity >= 0.82) {
        nearDuplicate = true;
        break;
      }
    }

    if (nearDuplicate) continue;

    const packaged = {
      ...article,
      original_url: canonicalUrl,
      full_text: cleanText(article.full_text),
      _tokens: tokens,
    };

    output.push(packaged);
    seenUrls.add(canonicalUrl);
    seenFingerprints.add(fp);
  }

  return output.map(({ _tokens, ...rest }) => rest);
}

module.exports = {
  deduplicateArticles,
};
