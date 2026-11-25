#!/usr/bin/env node
// Creates the admin and developer accounts with random temporary passwords.
// Usage: node scripts/create-accounts.js --admin-email a@x.com --dev-email d@x.com [--data-dir DIR] [--out FILE]
// Accounts that already exist are left untouched. New ones are verified and must pick a new password at first sign-in.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { openDb } = require('../lib/db');
const { hashPassword } = require('../lib/auth');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const tempPassword = (groups = 3, size = 5) => Array.from({ length: groups }, () => Array.from({ length: size }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('')).join('-');

async function createAccounts(db, accounts) {
  const created = [], existing = [];
  for (const { email, name, role } of accounts) {
    if (!email) continue;
    const address = email.trim().toLowerCase();
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(address)) { existing.push({ role, email: address }); continue; }
    const password = tempPassword();
    db.prepare('INSERT INTO users (email, name, phone, password_hash, verified, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, 1, ?)')
      .run(address, name, '', await hashPassword(password), new Date().toISOString());
    created.push({ role, email: address, password });
  }
  return { created, existing };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = name => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : ''; };
  const dataDir = opt('data-dir') || process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const db = openDb(dataDir);
  const { created, existing } = await createAccounts(db, [
    { email: opt('admin-email'), name: 'Administrator', role: 'admin' },
    { email: opt('dev-email'), name: 'Developer', role: 'developer' }
  ]);
  const out = opt('out');
  if (out && created.length) {
    const lines = created.map(a => `${a.role}: ${a.email}  temporary password: ${a.password}`);
    fs.writeFileSync(out, `Budget Bath Solutions first-login credentials (change the passwords at first sign-in, then delete this file)\n${lines.join('\n')}\n`, { mode: 0o600 });
  }
  for (const a of created) console.log(`CREATED\t${a.role}\t${a.email}\t${a.password}`);
  for (const a of existing) console.log(`EXISTS\t${a.role}\t${a.email}`);
  db.close();
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exit(1); });
module.exports = { createAccounts, tempPassword };
