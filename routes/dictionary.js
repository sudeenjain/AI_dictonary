const express = require('express');
const router = express.Router();
const { lookupWord, getWordOfTheDay } = require('../utils/aiLookup');
const { authenticateToken, optionalAuth } = require('../middleware/auth');
const { dbGet, dbAll, dbRun } = require('../database');
const { sanitizeWord } = require('../utils/sanitize');
const { lookupLimiter } = require('../middleware/rateLimit');

const CACHE_HOURS = 168;

async function resolveLookup(word, res) {
  const cached = dbGet('SELECT data, cached_at FROM dictionary_cache WHERE word = ?', [word]);
  let wordData;

  if (cached) {
    const cachedAt = new Date(cached.cached_at);
    const hoursSince = (Date.now() - cachedAt.getTime()) / 3600000;
    if (hoursSince < CACHE_HOURS) {
      wordData = JSON.parse(cached.data);
      wordData._cached = true;
    }
  }

  if (!wordData) {
    wordData = await lookupWord(word);
    dbRun(
      'INSERT OR REPLACE INTO dictionary_cache (word, data, cached_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
      [word, JSON.stringify(wordData)]
    );
  }

  return wordData;
}

function logSearch(userId, word) {
  dbRun('INSERT INTO search_history (user_id, word) VALUES (?, ?)', [userId, word]);
}

router.use(lookupLimiter);

router.get('/lookup/:word', optionalAuth, async (req, res) => {
  try {
    const word = sanitizeWord(req.params.word);
    if (!word) return res.status(400).json({ error: 'Invalid word' });

    const wordData = await resolveLookup(word, res);
    const userId = req.user ? req.user.id : null;
    logSearch(userId, word);

    res.json({ success: true, data: wordData });
  } catch (err) {
    console.error('Lookup error:', err.message);
    const status = err.message.includes('Invalid word') ? 404 : 500;
    res.status(status).json({ error: err.message || 'Failed to lookup word' });
  }
});

router.post('/lookup', optionalAuth, async (req, res) => {
  try {
    const word = sanitizeWord(req.body.word);
    if (!word) return res.status(400).json({ error: 'Invalid word' });

    const wordData = await resolveLookup(word, res);
    const userId = req.user ? req.user.id : null;
    logSearch(userId, word);

    res.json({ success: true, data: wordData });
  } catch (err) {
    console.error('Lookup error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to lookup word' });
  }
});

router.get('/word-of-the-day', async (req, res) => {
  try {
    const { word, date } = await getWordOfTheDay();
    const cached = dbGet('SELECT data FROM dictionary_cache WHERE word = ?', [word]);
    let wordData = cached ? JSON.parse(cached.data) : await lookupWord(word);

    if (!cached) {
      dbRun(
        'INSERT OR REPLACE INTO dictionary_cache (word, data, cached_at) VALUES (?, ?, CURRENT_TIMESTAMP)',
        [word, JSON.stringify(wordData)]
      );
    }

    res.json({ success: true, data: wordData, date });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get word of the day' });
  }
});

router.get('/history', optionalAuth, (req, res) => {
  try {
    let history;
    if (req.user) {
      history = dbAll(
        'SELECT word, timestamp FROM search_history WHERE user_id = ? ORDER BY timestamp DESC LIMIT 50',
        [req.user.id]
      );
    } else {
      history = dbAll(
        `SELECT word, MAX(timestamp) as timestamp FROM search_history
         WHERE user_id IS NULL GROUP BY word ORDER BY timestamp DESC LIMIT 15`
      );
    }
    res.json({ success: true, history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get history' });
  }
});

router.delete('/history', authenticateToken, (req, res) => {
  try {
    dbRun('DELETE FROM search_history WHERE user_id = ?', [req.user.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear history' });
  }
});

router.get('/favorites', authenticateToken, (req, res) => {
  try {
    const favorites = dbAll(
      `SELECT f.word, f.timestamp, d.data FROM favorites f
       LEFT JOIN dictionary_cache d ON f.word = d.word
       WHERE f.user_id = ? ORDER BY f.timestamp DESC`,
      [req.user.id]
    );

    res.json({
      success: true,
      favorites: favorites.map((f) => ({
        word: f.word,
        timestamp: f.timestamp,
        data: f.data ? JSON.parse(f.data) : null
      }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get favorites' });
  }
});

router.post('/favorites/:word', authenticateToken, (req, res) => {
  try {
    const word = sanitizeWord(req.params.word);
    if (!word) return res.status(400).json({ error: 'Invalid word' });

    const existing = dbGet('SELECT id FROM favorites WHERE user_id = ? AND word = ?', [
      req.user.id,
      word
    ]);

    if (!existing) {
      dbRun('INSERT INTO favorites (user_id, word) VALUES (?, ?)', [req.user.id, word]);
    }

    res.json({ success: true, message: 'Added to favorites' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add favorite' });
  }
});

router.delete('/favorites/:word', authenticateToken, (req, res) => {
  try {
    const word = sanitizeWord(req.params.word);
    if (!word) return res.status(400).json({ error: 'Invalid word' });

    dbRun('DELETE FROM favorites WHERE user_id = ? AND word = ?', [req.user.id, word]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove favorite' });
  }
});

router.get('/favorites/check/:word', authenticateToken, (req, res) => {
  try {
    const word = sanitizeWord(req.params.word);
    if (!word) return res.json({ isFavorite: false });

    const fav = dbGet('SELECT id FROM favorites WHERE user_id = ? AND word = ?', [
      req.user.id,
      word
    ]);
    res.json({ isFavorite: Boolean(fav) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check favorite' });
  }
});

router.get('/popular', (req, res) => {
  try {
    const popular = dbAll(
      'SELECT word, COUNT(*) as count FROM search_history GROUP BY word ORDER BY count DESC LIMIT 10'
    );
    res.json({ success: true, popular });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get popular words' });
  }
});

module.exports = router;
