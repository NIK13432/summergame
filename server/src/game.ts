import { db, track, trackOnce, type UserRow } from "./db.js";
import { content, type Chapter, type Moment } from "./content.js";

export class GameError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
  }
}

interface Story {
  done: string[];
  unlocked: string[];
}

const MAX_TAPS_PER_SEC = 20;

export function ensureUser(u: { id: number; first_name?: string; username?: string; language_code?: string }, source?: string) {
  const now = Date.now();
  const existing = db.prepare("SELECT * FROM users WHERE id = ?").get(u.id) as UserRow | undefined;
  if (existing) {
    db.prepare("UPDATE users SET first_name = ?, username = ?, lang = ?, last_seen = ?, bot_blocked = 0 WHERE id = ?").run(
      u.first_name ?? existing.first_name, u.username ?? existing.username, u.language_code ?? existing.lang, now, u.id,
    );
    return { user: getUser(u.id), isNew: false };
  }
  const g = content.game;
  db.prepare(
    `INSERT INTO users (id, first_name, username, lang, source, created_at, last_seen, coins, energy, energy_ts, passive_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(u.id, u.first_name ?? null, u.username ?? null, u.language_code ?? null, source ?? null, now, now, g.startCoins, g.energy.max, now, now);
  track(u.id, "signup", { source });
  return { user: getUser(u.id), isNew: true };
}

export function getUser(id: number): UserRow {
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
  if (!row) throw new GameError("no_user");
  return row;
}

function save(u: UserRow) {
  db.prepare(
    `UPDATE users SET coins=@coins, energy=@energy, energy_ts=@energy_ts, passive_ts=@passive_ts, upgrades=@upgrades,
     story=@story, affection=@affection, premium_until=@premium_until, msg_credits=@msg_credits,
     msgs_day=@msgs_day, msgs_today=@msgs_today, total_taps=@total_taps, last_seen=@last_seen WHERE id=@id`,
  ).run(u);
}

export const isPremium = (u: UserRow) => u.premium_until > Date.now();
const levels = (u: UserRow) => JSON.parse(u.upgrades) as Record<string, number>;
const story = (u: UserRow) => JSON.parse(u.story) as Story;
export const affection = (u: UserRow) => JSON.parse(u.affection) as Record<string, number>;

export function tapPower(u: UserRow) {
  const lv = levels(u);
  return 1 + content.game.upgrades.reduce((s, up) => s + (up.tap ?? 0) * (lv[up.id] ?? 0), 0);
}
export function passivePerHour(u: UserRow) {
  const lv = levels(u);
  return content.game.upgrades.reduce((s, up) => s + (up.passive ?? 0) * (lv[up.id] ?? 0), 0);
}
export function upgradeCost(id: string, level: number) {
  const up = content.game.upgrades.find((x) => x.id === id);
  if (!up) throw new GameError("bad_upgrade");
  return Math.round(up.baseCost * Math.pow(up.mult, level));
}
function energyMax(u: UserRow) {
  return content.game.energy.max * (isPremium(u) ? 2 : 1);
}

// Brings energy regen and passive (idle) income up to date.
function tick(u: UserRow) {
  const now = Date.now();
  const regen = (now - u.energy_ts) / 1000 / content.game.energy.regenSeconds;
  u.energy = Math.min(energyMax(u), u.energy + regen * (isPremium(u) ? 2 : 1));
  u.energy_ts = now;
  const hours = Math.min((now - u.passive_ts) / 3_600_000, content.game.offlineHoursCap);
  u.coins += hours * passivePerHour(u);
  u.passive_ts = now;
  u.last_seen = now;
}

function load(id: number) {
  const u = getUser(id);
  tick(u);
  return u;
}

function chapterStatus(u: UserRow, ch: Chapter, idx: number) {
  const s = story(u);
  if (s.done.includes(ch.id)) return "done";
  const prevDone = idx === 0 || s.done.includes(content.chapters[idx - 1].id);
  if (!prevDone) return "locked";
  if (ch.premium && !isPremium(u)) return "premium";
  if (ch.cost > 0 && !s.unlocked.includes(ch.id)) return "buy";
  return "open";
}

function metCharacters(u: UserRow) {
  const s = story(u);
  const met = new Set<string>();
  for (const ch of content.chapters) if (s.done.includes(ch.id)) ch.meets?.forEach((c) => met.add(c));
  return met;
}

function momentStatus(u: UserRow, m: Moment) {
  const s = story(u);
  if (s.done.includes(m.id)) return "done";
  if (!metCharacters(u).has(m.char)) return "locked";
  if ((affection(u)[m.char] ?? 0) < m.minAffection) return "affection";
  if (m.premium && !isPremium(u)) return "premium";
  return "open";
}

export function chatQuota(u: UserRow) {
  const today = new Date().toISOString().slice(0, 10);
  const used = u.msgs_day === today ? u.msgs_today : 0;
  const daily = isPremium(u) ? content.game.chat.premiumPerDay : content.game.chat.freePerDay;
  return { today, used, daily, freeLeft: Math.max(0, daily - used), credits: u.msg_credits };
}

export function publicState(id: number) {
  const u = load(id);
  save(u);
  const lv = levels(u);
  const met = metCharacters(u);
  const aff = affection(u);
  return {
    user: { id: u.id, name: u.first_name },
    coins: Math.floor(u.coins),
    energy: Math.floor(u.energy),
    energyMax: energyMax(u),
    energyRegenSeconds: content.game.energy.regenSeconds / (isPremium(u) ? 2 : 1),
    tapPower: tapPower(u),
    passivePerHour: passivePerHour(u),
    premiumUntil: u.premium_until,
    premium: isPremium(u),
    chat: chatQuota(u),
    upgrades: content.game.upgrades.map((up) => ({
      ...up, level: lv[up.id] ?? 0, cost: upgradeCost(up.id, lv[up.id] ?? 0),
    })),
    gifts: content.game.gifts,
    chapters: content.chapters.map((ch, i) => ({
      id: ch.id, title: ch.title, cost: ch.cost, premium: !!ch.premium, status: chapterStatus(u, ch, i),
    })),
    moments: content.moments.map((m) => ({
      id: m.id, char: m.char, title: m.title, minAffection: m.minAffection, premium: !!m.premium, status: momentStatus(u, m),
    })),
    characters: content.characters.map((c) => ({
      id: c.id, name: c.name, age: c.age, emoji: c.emoji, color: c.color, avatar: c.avatar, short: c.short,
      likes: c.likes, met: met.has(c.id), affection: aff[c.id] ?? 0,
    })),
    products: content.products,
  };
}

export function tap(id: number, count: number) {
  const lastSync = getUser(id).last_seen;
  const u = load(id);
  const elapsed = Math.max(1, (Date.now() - lastSync) / 1000);
  // Clients batch taps; cap them to what a human could plausibly do since the last sync.
  const allowed = Math.min(Math.floor(count), Math.ceil(elapsed * MAX_TAPS_PER_SEC), 500);
  const n = Math.max(0, Math.min(allowed, Math.floor(u.energy)));
  u.energy -= n;
  u.coins += n * tapPower(u);
  u.total_taps += n;
  save(u);
  if (n > 0) trackOnce(id, "first_tap");
  return n;
}

export function buyUpgrade(id: number, upgradeId: string) {
  const u = load(id);
  const lv = levels(u);
  const up = content.game.upgrades.find((x) => x.id === upgradeId);
  if (!up) throw new GameError("bad_upgrade");
  const cur = lv[up.id] ?? 0;
  if (cur >= up.max) throw new GameError("max_level");
  const cost = upgradeCost(up.id, cur);
  if (u.coins < cost) throw new GameError("not_enough_coins");
  u.coins -= cost;
  lv[up.id] = cur + 1;
  u.upgrades = JSON.stringify(lv);
  save(u);
  trackOnce(id, "first_upgrade");
}

function findScene(sceneId: string) {
  const idx = content.chapters.findIndex((c) => c.id === sceneId);
  if (idx >= 0) return { kind: "chapter" as const, scene: content.chapters[idx], idx };
  const m = content.moments.find((x) => x.id === sceneId);
  if (m) return { kind: "moment" as const, scene: m, idx: -1 };
  throw new GameError("bad_scene");
}

function assertPlayable(u: UserRow, sceneId: string) {
  const f = findScene(sceneId);
  const status = f.kind === "chapter" ? chapterStatus(u, f.scene, f.idx) : momentStatus(u, f.scene as Moment);
  if (status === "premium") {
    trackOnce(u.id, "paywall_hit", { scene: sceneId });
    throw new GameError("premium_required");
  }
  if (status !== "open" && status !== "done") throw new GameError(`scene_${status}`);
  return f;
}

export function unlockChapter(id: number, chapterId: string) {
  const u = load(id);
  const f = findScene(chapterId);
  if (f.kind !== "chapter") throw new GameError("bad_scene");
  const status = chapterStatus(u, f.scene, f.idx);
  if (status !== "buy") throw new GameError(`scene_${status}`);
  if (u.coins < f.scene.cost) throw new GameError("not_enough_coins");
  u.coins -= f.scene.cost;
  const s = story(u);
  s.unlocked.push(chapterId);
  u.story = JSON.stringify(s);
  save(u);
  track(id, "chapter_unlocked", { chapter: chapterId });
}

// Returns scene nodes only when the player may see them, so locked text never reaches the client.
export function getScene(id: number, sceneId: string) {
  const u = load(id);
  const f = assertPlayable(u, sceneId);
  track(id, "scene_open", { scene: sceneId });
  return f.scene;
}

export function choose(id: number, sceneId: string, nodeId: string, choiceIdx: number) {
  const u = load(id);
  const f = assertPlayable(u, sceneId);
  const node = f.scene.nodes.find((n) => n.id === nodeId);
  const choice = node?.choices?.[choiceIdx];
  if (!choice) throw new GameError("bad_choice");
  // Affection from choices only counts on the first playthrough.
  if (!story(u).done.includes(sceneId) && choice.affection) {
    const aff = affection(u);
    for (const [c, d] of Object.entries(choice.affection)) aff[c] = Math.max(0, (aff[c] ?? 0) + d);
    u.affection = JSON.stringify(aff);
    save(u);
  }
}

export function completeScene(id: number, sceneId: string) {
  const u = load(id);
  assertPlayable(u, sceneId);
  const s = story(u);
  if (!s.done.includes(sceneId)) {
    s.done.push(sceneId);
    u.story = JSON.stringify(s);
    save(u);
    track(id, "scene_done", { scene: sceneId });
  }
}

export function giveGift(id: number, charId: string, giftId: string) {
  const u = load(id);
  const gift = content.game.gifts.find((g) => g.id === giftId);
  const ch = content.characters.find((c) => c.id === charId);
  if (!gift || !ch) throw new GameError("bad_gift");
  if (!metCharacters(u).has(charId)) throw new GameError("not_met");
  if (u.coins < gift.cost) throw new GameError("not_enough_coins");
  u.coins -= gift.cost;
  const aff = affection(u);
  const bonus = ch.likes.includes(giftId) ? 2 : 1;
  aff[charId] = (aff[charId] ?? 0) + gift.affection * bonus;
  u.affection = JSON.stringify(aff);
  save(u);
  track(id, "gift", { char: charId, gift: giftId });
  return { liked: bonus > 1, affection: aff[charId] };
}

export function canMeet(u: UserRow, charId: string) {
  return metCharacters(u).has(charId);
}

// Consumes one chat message from the daily allowance, then from purchased credits.
export function spendChatMessage(id: number) {
  const u = load(id);
  const q = chatQuota(u);
  if (q.freeLeft > 0) {
    u.msgs_day = q.today;
    u.msgs_today = q.used + 1;
  } else if (u.msg_credits > 0) {
    u.msg_credits -= 1;
  } else {
    trackOnce(id, "paywall_hit_chat");
    throw new GameError("no_messages");
  }
  save(u);
}

export function grant(id: number, g: { premiumDays?: number; energyRefill?: boolean; coins?: number; msgCredits?: number }) {
  const u = load(id);
  if (g.premiumDays) u.premium_until = Math.max(Date.now(), u.premium_until) + g.premiumDays * 86_400_000;
  if (g.energyRefill) u.energy = energyMax(u);
  if (g.coins) u.coins += g.coins;
  if (g.msgCredits) u.msg_credits += g.msgCredits;
  save(u);
}

export function revoke(id: number, g: { premiumDays?: number; coins?: number; msgCredits?: number }) {
  const u = load(id);
  if (g.premiumDays) u.premium_until = Math.max(0, u.premium_until - g.premiumDays * 86_400_000);
  if (g.coins) u.coins = Math.max(0, u.coins - g.coins);
  if (g.msgCredits) u.msg_credits = Math.max(0, u.msg_credits - g.msgCredits);
  save(u);
}
