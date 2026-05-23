if (!process.env.VERCEL) {
  require('dotenv').config();
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');
const { getDb } = require('./database');
const { apiLimiter } = require('./middleware/rateLimit');

const app = express();
const PORT = process.env.PORT || 3000;
const publicDir = path.join(__dirname, 'public');
let dbReady = false;

app.set('trust proxy', 1);

if (!process.env.VERCEL) {
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  app.use(compression());
}
app.use(cors({
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
}));
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: true, limit: '32kb' }));

async function ensureDb(req, res, next) {
  if (dbReady) return next();
  try {
    if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
      console.warn('Warning: JWT_SECRET is not set in production.');
    }
    await getDb();
    dbReady = true;
    console.log('Database initialized');
    next();
  } catch (err) {
    console.error('DB init failed:', err);
    res.status(503).json({ error: 'Database unavailable' });
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Lexis AI Dictionary',
    timestamp: new Date().toISOString(),
    db: dbReady
  });
});

app.use('/api', ensureDb, apiLimiter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dictionary', require('./routes/dictionary'));

app.use(express.static(publicDir, {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  etag: true
}));

app.get('/robots.txt', (req, res) => {
  res.type('text/plain').send('User-agent: *\nAllow: /\n');
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

async function start() {
  try {
    await getDb();
    dbReady = true;
    app.listen(PORT, () => {
      console.log(`Lexis AI Dictionary running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

module.exports = app;

if (!process.env.VERCEL && require.main === module) {
  start();
}
