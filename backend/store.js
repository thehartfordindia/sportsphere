"use strict";

/**
 * Storage abstraction for SportSphere.
 * DATABASE_URL set -> PostgreSQL (optional `pg`). Otherwise -> local JSON files.
 * Stores user wallets (balance, transactions) and cashback/watch state.
 */

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "data");
const WALLETS_FILE = path.join(DATA_DIR, "wallets.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");

const DATABASE_URL = process.env.DATABASE_URL || "";
let pool = null;
let ready = null;

function usingDb() {
  return Boolean(DATABASE_URL);
}
function mode() {
  return usingDb() ? "postgres" : "file";
}
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}
function readJsonFile(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_e) {
    return fallback;
  }
}
function writeJsonFile(file, value) {
  ensureDataDir();
  fs.writeFileSync(file, JSON.stringify(value, null, 2), "utf8");
}

async function ensureReady() {
  if (ready) return ready;
  ready = (async () => {
    if (usingDb()) {
      const { Pool } = require("pg");
      const isLocal = /localhost|127\.0\.0\.1/.test(DATABASE_URL);
      pool = new Pool({
        connectionString: DATABASE_URL,
        ssl: isLocal ? false : { rejectUnauthorized: false },
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS wallets (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    } else {
      ensureDataDir();
      if (!fs.existsSync(WALLETS_FILE)) writeJsonFile(WALLETS_FILE, {});
      if (!fs.existsSync(USERS_FILE)) writeJsonFile(USERS_FILE, {});
    }
  })();
  return ready;
}

/** wallets is an object keyed by userId. */
async function getWallet(userId) {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM wallets WHERE id = $1", [userId]);
    return res.rows[0] ? res.rows[0].data : null;
  }
  const all = readJsonFile(WALLETS_FILE, {});
  return all[userId] || null;
}

async function saveWallet(userId, wallet) {
  await ensureReady();
  if (usingDb()) {
    await pool.query(
      "INSERT INTO wallets (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [userId, wallet]
    );
    return;
  }
  const all = readJsonFile(WALLETS_FILE, {});
  all[userId] = wallet;
  writeJsonFile(WALLETS_FILE, all);
}

/** users is an object keyed by lowercased username. */
async function getUser(id) {
  await ensureReady();
  if (usingDb()) {
    const res = await pool.query("SELECT data FROM users WHERE id = $1", [id]);
    return res.rows[0] ? res.rows[0].data : null;
  }
  const all = readJsonFile(USERS_FILE, {});
  return all[id] || null;
}

async function saveUser(id, user) {
  await ensureReady();
  if (usingDb()) {
    await pool.query(
      "INSERT INTO users (id, data, updated_at) VALUES ($1, $2, now()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()",
      [id, user]
    );
    return;
  }
  const all = readJsonFile(USERS_FILE, {});
  all[id] = user;
  writeJsonFile(USERS_FILE, all);
}

module.exports = { mode, ensureReady, getWallet, saveWallet, getUser, saveUser };
