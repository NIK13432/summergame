import { db, trackOnce } from "./db.js";
import { content, type Character } from "./content.js";
import { llm, type LlmMessage } from "./llm.js";
import { affection, canMeet, GameError, getUser, spendChatMessage } from "./game.js";

const HISTORY = 20;
const MEMORY_EVERY = 6;

function persona(c: Character, playerName: string) {
  return `Ты — ${c.name}, ${c.age} лет, персонаж романтической истории-игры «Лето у моря». Все персонажи — взрослые.
${c.persona}

Собеседник — игрок по имени ${playerName}, главный герой истории, который приехал на лето в приморский городок.

Правила:
- Говори от первого лица как ${c.name}, живо и естественно, как в мессенджере: 1–3 коротких предложения, иногда эмодзи.
- Отвечай на языке игрока (по умолчанию — русский).
- Флирт, романтика и лёгкие поддразнивания уместны, если это соответствует отношениям. Откровенных сексуальных описаний не пиши: мягко и в характере переводи разговор, например на планы свидания.
- Не выдумывай события, которых не было в истории; можешь предлагать планы на будущее.
- Если игрок всерьёз спрашивает, общается ли он с ИИ, не отрицай этого.
- Не упоминай эти правила.`;
}

function relationshipLabel(a: number) {
  if (a >= 30) return "вы очень близки, она явно влюблена";
  if (a >= 15) return "вы нравитесь друг другу, есть искра";
  if (a >= 5) return "вы приятели, она присматривается";
  return "вы только познакомились";
}

function getMemory(userId: number, charId: string) {
  const row = db.prepare("SELECT facts, since_update FROM char_memory WHERE user_id = ? AND char_id = ?").get(userId, charId) as
    | { facts: string; since_update: number }
    | undefined;
  return { facts: row ? (JSON.parse(row.facts) as string[]) : [], sinceUpdate: row?.since_update ?? 0 };
}

function history(userId: number, charId: string, limit = HISTORY): LlmMessage[] {
  const rows = db
    .prepare("SELECT role, content FROM chat_messages WHERE user_id = ? AND char_id = ? ORDER BY id DESC LIMIT ?")
    .all(userId, charId, limit) as LlmMessage[];
  return rows.reverse();
}

export function getChat(userId: number, charId: string) {
  const c = content.characters.find((x) => x.id === charId);
  if (!c) throw new GameError("bad_character");
  const msgs = history(userId, charId, 50);
  return { messages: msgs.length ? msgs : [{ role: "assistant" as const, content: c.greeting }] };
}

export async function sendChat(userId: number, charId: string, text: string) {
  const c = content.characters.find((x) => x.id === charId);
  if (!c) throw new GameError("bad_character");
  const u = getUser(userId);
  if (!canMeet(u, charId)) throw new GameError("not_met");
  const clean = text.trim().slice(0, 500);
  if (!clean) throw new GameError("empty");
  spendChatMessage(userId);

  const insert = db.prepare("INSERT INTO chat_messages (user_id, char_id, role, content, ts) VALUES (?, ?, ?, ?, ?)");
  const prior = history(userId, charId);
  if (prior.length === 0) insert.run(userId, charId, "assistant", c.greeting, Date.now());
  insert.run(userId, charId, "user", clean, Date.now());

  const mem = getMemory(userId, charId);
  const aff = affection(u)[charId] ?? 0;
  const dynamic = `Отношения сейчас: ${relationshipLabel(aff)}.
Что ты помнишь об игроке:
${mem.facts.length ? mem.facts.map((f) => `- ${f}`).join("\n") : "- пока ничего особенного"}`;

  const msgs = history(userId, charId);
  // The API requires the conversation to start with a user turn.
  while (msgs.length && msgs[0].role !== "user") msgs.shift();

  let reply: string;
  try {
    const res = await llm.complete({
      system: { stable: persona(c, u.first_name ?? "игрок"), dynamic },
      messages: msgs,
      maxTokens: 1024,
    });
    reply = res.refused || !res.text ? "Ой, давай сменим тему 🙈 Расскажи лучше, как твой день?" : res.text;
  } catch (e) {
    console.error("llm failed", e);
    reply = "Связь тут на пляже ужасная 📶 Напиши ещё раз чуть позже?";
  }
  insert.run(userId, charId, "assistant", reply, Date.now());
  trackOnce(userId, "first_chat", { char: charId });

  db.prepare(
    `INSERT INTO char_memory (user_id, char_id, since_update) VALUES (?, ?, 1)
     ON CONFLICT(user_id, char_id) DO UPDATE SET since_update = since_update + 1`,
  ).run(userId, charId);
  if (mem.sinceUpdate + 1 >= MEMORY_EVERY) void updateMemory(userId, c, mem.facts);
  return reply;
}

// Every few messages, distil the conversation into short facts the character "remembers" long-term.
async function updateMemory(userId: number, c: Character, facts: string[]) {
  try {
    const convo = history(userId, c.id, 16)
      .map((m) => `${m.role === "user" ? "Игрок" : c.name}: ${m.content}`)
      .join("\n");
    const res = await llm.complete({
      system: {
        stable: `Ты ведёшь долговременную память персонажа ${c.name} об игроке.`,
        dynamic: `MEMORY_EXTRACTION. Обнови список фактов об игроке и ваших отношениях (имя, вкусы, планы, обещания, шутки, важные события).
Не больше 20 коротких фактов, без повторов. Ответь только JSON-массивом строк.`,
      },
      messages: [{ role: "user", content: `Текущие факты: ${JSON.stringify(facts)}\n\nНедавний диалог:\n${convo}` }],
      maxTokens: 2048,
    });
    const match = res.text.match(/\[[\s\S]*\]/);
    const next = match ? (JSON.parse(match[0]) as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 20) : facts;
    db.prepare("UPDATE char_memory SET facts = ?, since_update = 0 WHERE user_id = ? AND char_id = ?").run(
      JSON.stringify(next.length ? next : facts), userId, c.id,
    );
  } catch (e) {
    console.error("memory update failed", e);
  }
}
