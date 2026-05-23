const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { dbGet, dbRun } = require('../database');
const { sanitizeUsername } = require('../utils/sanitize');
const { authLimiter } = require('../middleware/rateLimit');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('JWT_SECRET not set — using development fallback. Set JWT_SECRET in production.');
}
const SECRET = JWT_SECRET || 'dev_only_change_in_production';

router.use(authLimiter);

router.post('/register', async (req, res) => {
  try {
    const username = sanitizeUsername(req.body.username);
    const { password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Valid username and password required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = dbGet('SELECT id FROM users WHERE username = ?', [username]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    dbRun('INSERT INTO users (username, password) VALUES (?, ?)', [username, hashedPassword]);

    const user = dbGet('SELECT id, username FROM users WHERE username = ?', [username]);
    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const username = sanitizeUsername(req.body.username);
    const { password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Valid username and password required' });
    }

    const user = dbGet('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: '7d' });

    res.json({ success: true, token, user: { id: user.id, username: user.username } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.get('/verify', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.json({ valid: false });

  try {
    const user = jwt.verify(token, SECRET);
    res.json({ valid: true, user: { id: user.id, username: user.username } });
  } catch {
    res.json({ valid: false });
  }
});

module.exports = router;
