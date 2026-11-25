#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const USAGE = `Usage:
  node scripts/storage-backup.js backup --data-dir DIR --output DIR
  node scripts/storage-backup.js restore --backup DIR --data-dir EMPTY_DIR
  node scripts/storage-backup.js verify --backup DIR

Stop the application before restoring. The restore target must not contain app.db.`;

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function assertIntegrity(db) {
  const result = db.prepare('PRAGMA integrity_check').all();
  if (result.length !== 1 || result[0].integrity_check !== 'ok') throw new Error(`SQLite integrity check failed: ${JSON.stringify(result)}`);
}

function referencedFiles(db) {
  const refs = new Map();
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  for (const { name: table } of tables) {
    const quotedTable = `"${table.replaceAll('"', '""')}"`;
    const columns = db.prepare(`PRAGMA table_info(${quotedTable})`).all()
      .filter(column => column.name === 'file' || column.name.endsWith('_file'));
    for (const column of columns) {
      const quotedColumn = `"${column.name.replaceAll('"', '""')}"`;
      for (const row of db.prepare(`SELECT ${quotedColumn} AS file FROM ${quotedTable} WHERE ${quotedColumn} IS NOT NULL AND ${quotedColumn} != ''`).all()) {
        const file = String(row.file);
        if (path.basename(file) !== file || file.includes('\0')) throw new Error(`Unsafe stored upload name: ${file}`);
        const directory = table === 'media' ? 'media' : 'uploads';
        refs.set(`${directory}/${file}`, { directory, file });
      }
    }
  }
  return [...refs.keys()].sort().map(key => refs.get(key));
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function verifyBackup(backupDir) {
  const root = path.resolve(backupDir);
  const manifestPath = path.join(root, 'manifest.json');
  if (!fs.existsSync(path.join(root, 'app.db')) || !fs.existsSync(manifestPath)) throw new Error(`Incomplete backup: ${root}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== 1 || !Array.isArray(manifest.files)) throw new Error('Unsupported backup manifest');
  const db = new DatabaseSync(path.join(root, 'app.db'));
  try {
    assertIntegrity(db);
    const expected = referencedFiles(db).map(({ directory, file }) => `${directory}/${file}`).sort();
    const actual = manifest.files.map(item => item.path).sort();
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Backup manifest does not match database upload references');
  } finally { db.close(); }
  for (const item of manifest.files) {
    const file = path.resolve(root, item.path);
    if (path.dirname(file) !== path.join(root, item.path.split('/')[0]) || !fs.existsSync(file)) throw new Error(`Missing backup file: ${item.path}`);
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size !== item.size || sha256(file) !== item.sha256) throw new Error(`Backup file failed verification: ${item.path}`);
  }
  return manifest;
}

function backup({ dataDir, outputDir }) {
  const sourceDir = path.resolve(dataDir);
  const target = path.resolve(outputDir);
  const sourceDb = path.join(sourceDir, 'app.db');
  if (!fs.existsSync(sourceDb)) throw new Error(`Database not found: ${sourceDb}`);
  if (fs.existsSync(target)) throw new Error(`Backup target already exists: ${target}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = `${target}.partial-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  fs.mkdirSync(staging, { mode: 0o700 });
  let source = null, snapshot = null;
  try {
    const snapshotPath = path.join(staging, 'app.db');
    source = new DatabaseSync(sourceDb);
    source.prepare('PRAGMA busy_timeout = 5000').get();
    source.prepare(`VACUUM INTO ${sqlString(snapshotPath)}`).run();
    const checkpoint = source.prepare('PRAGMA wal_checkpoint(PASSIVE)').get();
    source.close();
    source = null;

    snapshot = new DatabaseSync(snapshotPath);
    assertIntegrity(snapshot);
    const refs = referencedFiles(snapshot);
    snapshot.close();
    snapshot = null;
    const files = [];
    for (const { directory, file } of refs) {
      const sourceFile = path.join(sourceDir, directory, file);
      const targetFile = path.join(staging, directory, file);
      const stat = fs.statSync(sourceFile);
      if (!stat.isFile()) throw new Error(`Referenced upload is not a file: ${directory}/${file}`);
      fs.mkdirSync(path.dirname(targetFile), { recursive: true, mode: 0o700 });
      fs.copyFileSync(sourceFile, targetFile, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(targetFile, 0o600);
      files.push({ path: `${directory}/${file}`, size: stat.size, sha256: sha256(targetFile) });
    }
    fs.chmodSync(snapshotPath, 0o600);
    const manifest = { version: 1, createdAt: new Date().toISOString(), database: { integrity: 'ok', checkpoint }, files };
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { mode: 0o600 });
    verifyBackup(staging);
    fs.renameSync(staging, target);
    return manifest;
  } catch (error) {
    if (snapshot) snapshot.close();
    if (source) source.close();
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function restore({ backupDir, dataDir }) {
  const backupRoot = path.resolve(backupDir);
  const target = path.resolve(dataDir);
  const manifest = verifyBackup(backupRoot);
  const targetDb = path.join(target, 'app.db');
  if (fs.existsSync(targetDb)) throw new Error(`Restore target already contains app.db: ${targetDb}`);
  for (const directory of ['uploads', 'media']) {
    const directoryPath = path.join(target, directory);
    if (fs.existsSync(directoryPath) && fs.readdirSync(directoryPath).length) throw new Error(`Restore target already contains ${directory} files: ${directoryPath}`);
  }
  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  fs.copyFileSync(path.join(backupRoot, 'app.db'), targetDb, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(targetDb, 0o600);
  try {
    fs.copyFileSync(path.join(backupRoot, 'manifest.json'), path.join(target, 'manifest.json'), fs.constants.COPYFILE_EXCL);
    fs.chmodSync(path.join(target, 'manifest.json'), 0o600);
    for (const item of manifest.files) {
      const source = path.join(backupRoot, item.path);
      const destination = path.join(target, item.path);
      fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
      fs.chmodSync(destination, 0o600);
    }
    const db = new DatabaseSync(targetDb);
    try { assertIntegrity(db); } finally { db.close(); }
    verifyBackup(target);
    return manifest;
  } catch (error) {
    fs.rmSync(targetDb, { force: true });
    fs.rmSync(path.join(target, 'manifest.json'), { force: true });
    for (const item of manifest.files) fs.rmSync(path.join(target, item.path), { force: true });
    throw error;
  }
}

function options(args) {
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    if (!args[i].startsWith('--') || !args[i + 1]) throw new Error(USAGE);
    result[args[i].slice(2).replaceAll('-', '')] = args[i + 1];
  }
  return result;
}

if (require.main === module) {
  try {
    const [command, ...args] = process.argv.slice(2);
    const opts = options(args);
    if (command === 'backup') console.log(JSON.stringify(backup({ dataDir: opts.datadir, outputDir: opts.output }), null, 2));
    else if (command === 'restore') console.log(JSON.stringify(restore({ backupDir: opts.backup, dataDir: opts.datadir }), null, 2));
    else if (command === 'verify') console.log(JSON.stringify(verifyBackup(opts.backup), null, 2));
    else throw new Error(USAGE);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { backup, restore, verifyBackup, referencedFiles };
