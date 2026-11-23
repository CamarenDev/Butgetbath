const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, 'app.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tokens (
      token_hash TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS requests (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      project_type TEXT NOT NULL,
      location TEXT NOT NULL,
      timeline TEXT NOT NULL DEFAULT '',
      budget TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      created_at TEXT NOT NULL,
      submitted_at TEXT
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL,
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      author_id INTEGER,
      author_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'message',
      internal INTEGER NOT NULL DEFAULT 0,
      body TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'web',
      email_id TEXT UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS messages_request ON messages (request_id, id);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  const addColumn = (table, column, definition) => {
    if (!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('users', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('requests', 'last_message_at', 'TEXT');
  addColumn('requests', 'last_author_role', "TEXT NOT NULL DEFAULT ''");
  addColumn('requests', 'customer_read_at', 'TEXT');
  addColumn('requests', 'staff_read_at', 'TEXT');
  addColumn('photos', 'message_id', 'INTEGER');
  addColumn('photos', 'caption', "TEXT NOT NULL DEFAULT ''");
  return db;
}

module.exports = { openDb };
