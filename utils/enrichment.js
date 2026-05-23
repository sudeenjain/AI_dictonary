const fetch = require('node-fetch');

async function fetchDatamuse(relation, word, max = 5) {
  try {
    const res = await fetch(
      `https://api.datamuse.com/words?${relation}=${encodeURIComponent(word)}&max=${max}`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((item) => item.word).filter(Boolean);
  } catch {
    return [];
  }
}

async function fetchWikipediaSummary(word) {
  try {
    const res = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`
    );
    if (!res.ok) return {};
    const data = await res.json();
    return {
      wikiExtract: data.extract || null,
      wikiImage: data.thumbnail?.source || null,
      wikiUrl: data.content_urls?.desktop?.page || null
    };
  } catch {
    return {};
  }
}

async function enrichWordData(word, baseData) {
  const [rhymes, adjectives, wiki] = await Promise.all([
    fetchDatamuse('rel_rhy', word),
    fetchDatamuse('rel_jjb', word),
    fetchWikipediaSummary(word)
  ]);

  return {
    ...baseData,
    rhymes: rhymes.length ? rhymes : baseData.rhymes,
    adjectives: adjectives.length ? adjectives : baseData.adjectives,
    ...wiki
  };
}

module.exports = { enrichWordData };
