const fs = require('fs');
const path = require('path');

const isVercel = Boolean(process.env.VERCEL);
const dataDir = isVercel ? path.join('/tmp', 'lexis-data') : __dirname;
const DB_PATH = path.join(dataDir, 'database.sqlite');

let db = null;
let memoryMode = false;

const memory = {
  users: [],
  cache: new Map(),
  history: [],
  favorites: [],
  userId: 1,
  historyId: 1,
  favId: 1
};

async function loadSqlJs() {
  if (isVercel) {
    try {
      return require('sql.js/dist/sql-asm.js')();
    } catch (err) {
      console.warn('sql.js ASM unavailable, using in-memory store:', err.message);
      memoryMode = true;
      return null;
    }
  }

  const initSqlJs = require('sql.js');
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  return initSqlJs({ locateFile: () => wasmPath });
}

async function getDb() {
  if (memoryMode) return memory;
  if (db) return db;

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const SQL = await loadSqlJs();
  if (!SQL) {
    memoryMode = true;
    return memory;
  }

  if (fs.existsSync(DB_PATH)) {
    db = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    db = new SQL.Database();
  }

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS dictionary_cache (
    word TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS search_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    word TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    word TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, word)
  )`);

  saveDb();
  return db;
}

function saveDb() {
  if (!db || memoryMode) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (err) {
    console.error('Error saving database:', err.message);
  }
}

function memGet(query, params) {
  if (query.includes('FROM users WHERE username')) {
    return memory.users.find((u) => u.username === params[0]) || null;
  }
  if (query.includes('SELECT id FROM users WHERE username')) {
    return memory.users.find((u) => u.username === params[0]) ? { id: memory.users.find((u) => u.username === params[0]).id } : null;
  }
  if (query.includes('SELECT id, username FROM users WHERE username')) {
    const u = memory.users.find((x) => x.username === params[0]);
    return u ? { id: u.id, username: u.username } : null;
  }
  if (query.includes('FROM dictionary_cache WHERE word')) {
    const entry = memory.cache.get(params[0]);
    return entry ? { data: entry.data, cached_at: entry.cached_at } : null;
  }
  if (query.includes('SELECT word FROM dictionary_cache')) {
    return memory.cache.has(params[0]) ? { word: params[0] } : null;
  }
  if (query.includes('FROM favorites WHERE user_id') && query.includes('AND word')) {
    const fav = memory.favorites.find((f) => f.user_id === params[0] && f.word === params[1]);
    return fav ? { id: fav.id } : null;
  }
  if (query.includes('SELECT id FROM favorites WHERE user_id')) {
    const fav = memory.favorites.find((f) => f.user_id === params[0] && f.word === params[1]);
    return fav ? { id: fav.id } : null;
  }
  return null;
}

function memAll(query, params) {
  if (query.includes('search_history WHERE user_id')) {
    return memory.history
      .filter((h) => h.user_id === params[0])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 50);
  }
  if (query.includes('user_id IS NULL')) {
    const seen = new Set();
    return memory.history
      .filter((h) => h.user_id == null)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .filter((h) => {
        if (seen.has(h.word)) return false;
        seen.add(h.word);
        return true;
      })
      .slice(0, 15);
  }
  if (query.includes('FROM favorites f')) {
    return memory.favorites
      .filter((f) => f.user_id === params[0])
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .map((f) => ({
        word: f.word,
        timestamp: f.timestamp,
        data: memory.cache.get(f.word)?.data || null
      }));
  }
  if (query.includes('GROUP BY word ORDER BY count')) {
    const counts = {};
    memory.history.forEach((h) => {
      counts[h.word] = (counts[h.word] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }
  return [];
}

function memRun(query, params) {
  if (query.includes('INSERT INTO users')) {
    const user = { id: memory.userId++, username: params[0], password: params[1], created_at: new Date().toISOString() };
    memory.users.push(user);
    return;
  }
  if (query.includes('INSERT OR REPLACE INTO dictionary_cache') || query.includes('INSERT INTO dictionary_cache')) {
    memory.cache.set(params[0], { data: params[1], cached_at: new Date().toISOString() });
    return;
  }
  if (query.includes('INSERT INTO search_history')) {
    memory.history.push({ id: memory.historyId++, user_id: params[0], word: params[1], timestamp: new Date().toISOString() });
    return;
  }
  if (query.includes('INSERT INTO favorites')) {
    if (!memory.favorites.some((f) => f.user_id === params[0] && f.word === params[1])) {
      memory.favorites.push({ id: memory.favId++, user_id: params[0], word: params[1], timestamp: new Date().toISOString() });
    }
    return;
  }
  if (query.includes('DELETE FROM favorites')) {
    memory.favorites = memory.favorites.filter((f) => !(f.user_id === params[0] && f.word === params[1]));
    return;
  }
  if (query.includes('DELETE FROM search_history')) {
    memory.history = memory.history.filter((h) => h.user_id !== params[0]);
  }
}

function dbGet(query, params = []) {
  if (memoryMode) return memGet(query, params);
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(query);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

function dbAll(query, params = []) {
  if (memoryMode) return memAll(query, params);
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(query);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbRun(query, params = []) {
  if (memoryMode) {
    memRun(query, params);
    return;
  }
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(query);
  stmt.run(params);
  stmt.free();
  saveDb();
}

module.exports = { getDb, saveDb, dbGet, dbAll, dbRun };
