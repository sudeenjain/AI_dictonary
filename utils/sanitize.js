const WORD_REGEX = /^[a-zA-Z][a-zA-Z\-']{0,98}[a-zA-Z]?$/;

function sanitizeWord(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const word = raw.toLowerCase().trim().replace(/\s+/g, '');
  if (!word || word.length > 100 || !WORD_REGEX.test(word)) return null;
  return word;
}

function sanitizeUsername(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const username = raw.trim();
  if (!/^[a-zA-Z0-9_]{3,32}$/.test(username)) return null;
  return username;
}

module.exports = { sanitizeWord, sanitizeUsername };
