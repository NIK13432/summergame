import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { config } from "./config.js";

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
export const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  first_name TEXT, username TEXT, lang TEXT,
  source TEXT,
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  coins REAL NOT NULL DEFAULT 0,
  energy REAL NOT NULL DEFAULT 0,
  energy_ts INTEGER NOT NULL,
  passive_ts INTEGER NOT NULL,
  upgrades TEXT NOT NULL DEFAULT '{}',
  story TEXT NOT NULL DEFAULT '{"done":[],"unlocked":[]}',
  affection TEXT NOT NULL DEFAULT '{}',
  premium_until INTEGER NOT NULL DEFAULT 0,
  msg_credits INTEGER NOT NULL DEFAULT 0,
  msgs_day TEXT, msgs_today INTEGER NOT NULL DEFAULT 0,
  total_taps INTEGER NOT NULL DEFAULT 0,
  reminded_at INTEGER NOT NULL DEFAULT 0,
  bot_blocked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS purchases (
  charge_id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product TEXT NOT NULL,
  stars INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  refunded INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, name TEXT NOT NULL, props TEXT, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_name ON events(name, user_id);
CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, char_id TEXT NOT NULL,
  role TEXT NOT NULL, content TEXT NOT NULL, ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS chat_by_user ON chat_messages(user_id, char_id, id);
CREATE TABLE IF NOT EXISTS char_memory (
  user_id INTEGER NOT NULL, char_id TEXT NOT NULL,
  facts TEXT NOT NULL DEFAULT '[]',
  since_update INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, char_id)
);
`);

export interface UserRow {
  id: number;
  first_name: string | null;
  username: string | null;
  lang: string | null;
  source: string | null;
  created_at: number;
  last_seen: number;
  coins: number;
  energy: number;
  energy_ts: number;
  passive_ts: number;
  upgrades: string;
  story: string;
  affection: string;
  premium_until: number;
  msg_credits: number;
  msgs_day: string | null;
  msgs_today: number;
  total_taps: number;
  reminded_at: number;
  bot_blocked: number;
}

export function track(userId: number | null, name: string, props?: Record<string, unknown>) {
  db.prepare("INSERT INTO events (user_id, name, props, ts) VALUES (?, ?, ?, ?)").run(
    userId,
    name,
    props ? JSON.stringify(props) : null,
    Date.now(),
  );
}

// Fires only the first time a user reaches a funnel step.
export function trackOnce(userId: number, name: string, props?: Record<string, unknown>) {
  const seen = db.prepare("SELECT 1 FROM events WHERE user_id = ? AND name = ? LIMIT 1").get(userId, name);
  if (!seen) track(userId, name, props);
}
