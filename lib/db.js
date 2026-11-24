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
    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      interest TEXT NOT NULL DEFAULT '',
      message TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      day TEXT NOT NULL,
      path TEXT NOT NULL,
      visitor TEXT NOT NULL,
      referrer TEXT NOT NULL DEFAULT '',
      device TEXT NOT NULL DEFAULT 'desktop'
    );
    CREATE INDEX IF NOT EXISTS visits_day ON visits (day);
    CREATE TABLE IF NOT EXISTS media (
      slot TEXT PRIMARY KEY,
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      alt TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '',
      county TEXT NOT NULL DEFAULT '',
      summary TEXT NOT NULL DEFAULT '',
      alt TEXT NOT NULL DEFAULT '',
      published INTEGER NOT NULL DEFAULT 1,
      sample INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      town TEXT NOT NULL DEFAULT '',
      rating INTEGER NOT NULL DEFAULT 5,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_categories (
      id INTEGER PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS forum_threads (
      id INTEGER PRIMARY KEY,
      category_id INTEGER NOT NULL REFERENCES forum_categories(id) ON DELETE CASCADE,
      user_id INTEGER,
      author TEXT NOT NULL,
      staff INTEGER NOT NULL DEFAULT 0,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      locked INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      views INTEGER NOT NULL DEFAULT 0,
      seed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      last_post_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS forum_posts (
      id INTEGER PRIMARY KEY,
      thread_id INTEGER NOT NULL REFERENCES forum_threads(id) ON DELETE CASCADE,
      user_id INTEGER,
      author TEXT NOT NULL,
      staff INTEGER NOT NULL DEFAULT 0,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS forum_posts_thread ON forum_posts (thread_id, id);
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY,
      uid TEXT NOT NULL UNIQUE,
      request_id INTEGER NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      starts_at TEXT NOT NULL,
      duration_min INTEGER NOT NULL,
      kind TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'scheduled',
      sequence INTEGER NOT NULL DEFAULT 0,
      google_event_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS appointments_request ON appointments (request_id);
    CREATE INDEX IF NOT EXISTS appointments_start ON appointments (starts_at);
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL DEFAULT '' COLLATE NOCASE,
      phone TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'lead',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customers_email ON customers (email);
    CREATE TABLE IF NOT EXISTS customer_files (
      id TEXT PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      category TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customer_files_customer ON customer_files (customer_id);
    CREATE TABLE IF NOT EXISTS customer_entries (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      kind TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      author TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS customer_entries_customer ON customer_entries (customer_id, id);
    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      role_title TEXT NOT NULL DEFAULT '',
      rate_cents INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      hired_on TEXT NOT NULL DEFAULT '',
      emergency_name TEXT NOT NULL DEFAULT '',
      emergency_phone TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      area TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'open',
      scheduled_at TEXT NOT NULL DEFAULT '',
      completed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS job_assignments (
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      PRIMARY KEY (job_id, employee_id)
    );
    CREATE TABLE IF NOT EXISTS job_updates (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS time_entries (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      work_date TEXT NOT NULL,
      minutes INTEGER NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      rate_cents INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS time_entries_employee ON time_entries (employee_id, work_date);
    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      paid_on TEXT NOT NULL,
      method TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      signed_name TEXT NOT NULL DEFAULT '',
      signed_at TEXT,
      body_hash TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS employee_requests (
      id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      response TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS employee_files (
      id TEXT PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      title TEXT NOT NULL DEFAULT '',
      file TEXT NOT NULL,
      mime TEXT NOT NULL,
      size INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estimate_catalog (
      id INTEGER PRIMARY KEY,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'material',
      unit TEXT NOT NULL DEFAULT 'ea',
      cost_cents INTEGER NOT NULL DEFAULT 0,
      waste_bp INTEGER NOT NULL DEFAULT 0,
      tier TEXT NOT NULL DEFAULT '',
      code TEXT NOT NULL DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estimate_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS estimates (
      id INTEGER PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'estimate',
      parent_id INTEGER REFERENCES estimates(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      scope TEXT NOT NULL DEFAULT '',
      exclusions TEXT NOT NULL DEFAULT '',
      terms TEXT NOT NULL DEFAULT '',
      internal_notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      display TEXT NOT NULL DEFAULT 'itemized',
      markup_bp INTEGER NOT NULL DEFAULT 0,
      tax_bp INTEGER NOT NULL DEFAULT 0,
      contingency_bp INTEGER NOT NULL DEFAULT 0,
      deposit_bp INTEGER NOT NULL DEFAULT 0,
      discount_cents INTEGER NOT NULL DEFAULT 0,
      valid_until TEXT NOT NULL DEFAULT '',
      signed_name TEXT NOT NULL DEFAULT '',
      signed_at TEXT,
      signed_total_cents INTEGER,
      signed_hash TEXT NOT NULL DEFAULT '',
      declined_reason TEXT NOT NULL DEFAULT '',
      sent_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estimate_items (
      id INTEGER PRIMARY KEY,
      estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      section TEXT NOT NULL DEFAULT 'General',
      kind TEXT NOT NULL DEFAULT 'material',
      name TEXT NOT NULL,
      qty REAL NOT NULL DEFAULT 1,
      unit TEXT NOT NULL DEFAULT 'ea',
      cost_cents INTEGER NOT NULL DEFAULT 0,
      waste_bp INTEGER NOT NULL DEFAULT 0,
      optional INTEGER NOT NULL DEFAULT 0,
      accepted INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS handyman_tasks (
      id INTEGER PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'ea',
      hrs REAL NOT NULL DEFAULT 1,
      mat_cents INTEGER NOT NULL DEFAULT 0,
      trade TEXT NOT NULL DEFAULT 'h',
      tags TEXT NOT NULL DEFAULT '[]',
      crew INTEGER NOT NULL DEFAULT 1,
      min_hrs REAL NOT NULL DEFAULT 0,
      permit_type TEXT NOT NULL DEFAULT '',
      permit_note TEXT NOT NULL DEFAULT '',
      lead_days INTEGER NOT NULL DEFAULT 0,
      sort INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS jurisdictions (
      id INTEGER PRIMARY KEY,
      city TEXT NOT NULL UNIQUE COLLATE NOCASE,
      dept TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '[]',
      verified INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS job_tools (
      id INTEGER PRIMARY KEY,
      job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      grp TEXT NOT NULL DEFAULT '',
      qty INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL DEFAULT 'own',
      note TEXT NOT NULL DEFAULT '',
      checked INTEGER NOT NULL DEFAULT 0,
      checked_by TEXT NOT NULL DEFAULT '',
      checked_at TEXT NOT NULL DEFAULT '',
      sort INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS job_tools_job ON job_tools(job_id);
    CREATE TABLE IF NOT EXISTS estimate_outcomes (
      id INTEGER PRIMARY KEY,
      estimate_id INTEGER NOT NULL UNIQUE REFERENCES estimates(id) ON DELETE CASCADE,
      base_cost_cents INTEGER NOT NULL,
      predicted_cost_cents INTEGER NOT NULL DEFAULT 0,
      actual_cost_cents INTEGER NOT NULL,
      actual_hours REAL NOT NULL DEFAULT 0,
      base_by_section TEXT NOT NULL DEFAULT '{}',
      actual_by_section TEXT NOT NULL DEFAULT '{}',
      features TEXT NOT NULL DEFAULT '{}',
      notes TEXT NOT NULL DEFAULT '',
      recorded_by TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estimate_payments (
      id INTEGER PRIMARY KEY,
      estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      amount_cents INTEGER NOT NULL,
      method TEXT NOT NULL DEFAULT '',
      memo TEXT NOT NULL DEFAULT '',
      paid_on TEXT NOT NULL,
      provider_ref TEXT UNIQUE,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS estimate_documents (
      id INTEGER PRIMARY KEY,
      estimate_id INTEGER NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      body_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      signed_name TEXT NOT NULL DEFAULT '',
      signed_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS kb_articles (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'General',
      summary TEXT NOT NULL DEFAULT '',
      body TEXT NOT NULL,
      published INTEGER NOT NULL DEFAULT 1,
      sort INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS applications (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL COLLATE NOCASE,
      phone TEXT NOT NULL,
      city TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
  `);
  const addColumn = (table, column, definition) => {
    if (!db.prepare(`SELECT 1 FROM pragma_table_info('${table}') WHERE name = ?`).get(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  };
  addColumn('estimates', 'wizard', "TEXT NOT NULL DEFAULT ''");
  addColumn('estimates', 'prediction', "TEXT NOT NULL DEFAULT ''");
  addColumn('users', 'notify_email', 'INTEGER NOT NULL DEFAULT 1');
  addColumn('requests', 'last_message_at', 'TEXT');
  addColumn('requests', 'last_author_role', "TEXT NOT NULL DEFAULT ''");
  addColumn('requests', 'customer_read_at', 'TEXT');
  addColumn('requests', 'staff_read_at', 'TEXT');
  addColumn('photos', 'message_id', 'INTEGER');
  addColumn('photos', 'caption', "TEXT NOT NULL DEFAULT ''");
  addColumn('photos', 'kind', "TEXT NOT NULL DEFAULT 'image'");
  addColumn('requests', 'priority', "TEXT NOT NULL DEFAULT 'normal'");
  for (const [table, cols] of [['estimates', ['signed_ip', 'signed_ua', 'signed_consent', 'sent_by']], ['estimate_documents', ['signed_ip', 'signed_ua', 'signed_consent', 'issued_by']]]) for (const c of cols) addColumn(table, c, "TEXT NOT NULL DEFAULT ''");
  addColumn('applications', 'rating', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('applications', 'interview_at', "TEXT NOT NULL DEFAULT ''");
  addColumn('applications', 'employee_id', 'INTEGER');
  addColumn('employees', 'can_estimate', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customer_files', 'shared', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customer_entries', 'shared', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('requests', 'category', "TEXT NOT NULL DEFAULT ''");
  return db;
}

module.exports = { openDb };
