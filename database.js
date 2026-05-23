const fs = require('fs');
const path = require('path');

const isVercel = Boolean(process.env.VERCEL);
const dataDir = isVercel
  ? path.join('/tmp', 'lexis-data')
  : __dirname;

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const DB_PATH = path.join(dataDir, 'database.sqlite');

let db = null;

async function loadSqlJs() {
  if (isVercel) {
    return require('sql.js/dist/sql-asm.js')();
  }

  const initSqlJs = require('sql.js');
  const wasmPath = path.join(__dirname, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
  return initSqlJs({ locateFile: () => wasmPath });
}

async function getDb() {
  if (db) return db;

  const SQL = await loadSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS dictionary_cache (
      word TEXT PRIMARY KEY,
      data TEXT NOT NULL,
      cached_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS search_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      word TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      word TEXT NOT NULL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, word)
    )
  `);

  saveDb();
  return db;
}

function saveDb() {
  if (!db) return;
  try {
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
  } catch (err) {
    console.error('Error saving database:', err.message);
  }
}

function dbGet(query, params = []) {
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
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(query);
  const rows = [];
  stmt.bind(params);
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function dbRun(query, params = []) {
  if (!db) throw new Error('Database not initialized');
  const stmt = db.prepare(query);
  stmt.run(params);
  stmt.free();
  saveDb();
}

module.exports = { getDb, saveDb, dbGet, dbAll, dbRun };
