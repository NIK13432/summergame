import { Bot, InlineKeyboard, GrammyError } from "grammy";
import { config } from "./config.js";
import { content } from "./content.js";
import { db, track, trackOnce } from "./db.js";
import { ensureUser, grant, revoke } from "./game.js";

export const bot = new Bot(config.botToken || "0:dev");

const playButton = (label = "🌊 Играть") => new InlineKeyboard().webApp(label, config.webAppUrl);

// ---------- Onboarding ----------
bot.command("start", async (ctx) => {
  if (!ctx.from) return;
  // Deep links like t.me/<bot>?start=ads_tiktok let you see which source converts best.
  const source = ctx.match || undefined;
  const { isNew } = ensureUser(ctx.from, source);
  track(ctx.from.id, "bot_start", { source, isNew });
  const heroes = content.characters.slice(0, 3).map((c) => `${c.emoji} ${c.name}`).join(", ");
  await ctx.reply(
    `Привет, ${ctx.from.first_name}! ☀️\n\n` +
      `Лето, море и маленький городок, где ты никого не знаешь. Пока что.\n\n` +
      `• Подрабатывай и копи на новые главы\n• Знакомься: ${heroes}\n• Делай выборы — они помнят каждый твой шаг\n\n` +
      `Первые главы бесплатно 👇`,
    { reply_markup: playButton("🌊 Начать историю") },
  );
});

bot.command("help", (ctx) =>
  ctx.reply("Нажми «Играть», чтобы открыть игру. Вопросы по оплате: /paysupport. Условия: /terms", {
    reply_markup: playButton(),
  }),
);

// Telegram requires bots that accept payments to answer /terms and /paysupport.
bot.command("terms", (ctx) =>
  ctx.reply(
    "Условия: покупки дают внутриигровые бонусы (Premium, энергия, монеты, сообщения) и не подлежат обмену на деньги. " +
      "Все персонажи — вымышленные взрослые люди. Возврат возможен в течение 7 дней, если покупка не была использована. " +
      `Поддержка: ${config.supportContact}`,
  ),
);
bot.command("paysupport", (ctx) =>
  ctx.reply(`Проблема с оплатой? Напиши ${config.supportContact} и приложи номер операции из чека — разберёмся.`),
);

// ---------- Telegram Stars payments ----------
export interface InvoicePayload {
  u: number;
  p: string;
}

export async function createInvoice(userId: number, productId: string) {
  const p = content.products.find((x) => x.id === productId);
  if (!p) throw new Error("bad_product");
  const payload: InvoicePayload = { u: userId, p: p.id };
  track(userId, "invoice_created", { product: p.id });
  // Stars: currency XTR and an empty provider token.
  return bot.api.createInvoiceLink(p.title, p.description, JSON.stringify(payload), "", "XTR", [
    { label: p.title, amount: p.stars },
  ]);
}

bot.on("pre_checkout_query", async (ctx) => {
  const q = ctx.preCheckoutQuery;
  try {
    const payload = JSON.parse(q.invoice_payload) as InvoicePayload;
    const p = content.products.find((x) => x.id === payload.p);
    const ok = !!p && p.stars === q.total_amount && q.currency === "XTR" && payload.u === q.from.id;
    await ctx.answerPreCheckoutQuery(ok, ok ? undefined : { error_message: "Товар недоступен, попробуй ещё раз." });
  } catch {
    await ctx.answerPreCheckoutQuery(false, { error_message: "Ошибка оплаты" });
  }
});

bot.on("message:successful_payment", async (ctx) => {
  const sp = ctx.message.successful_payment;
  const payload = JSON.parse(sp.invoice_payload) as InvoicePayload;
  const p = content.products.find((x) => x.id === payload.p);
  if (!p) return;
  // Idempotent: the charge id is the primary key, so a redelivered update grants nothing twice.
  const res = db
    .prepare("INSERT OR IGNORE INTO purchases (charge_id, user_id, product, stars, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(sp.telegram_payment_charge_id, ctx.from.id, p.id, sp.total_amount, Date.now());
  if (res.changes === 0) return;
  grant(ctx.from.id, p.grant);
  track(ctx.from.id, "purchase", { product: p.id, stars: sp.total_amount });
  trackOnce(ctx.from.id, "first_purchase", { product: p.id });
  await ctx.reply(`Спасибо! «${p.title}» уже в игре ✨`, { reply_markup: playButton("Вернуться в игру") });
});

// ---------- Admin ----------
const isAdmin = (id?: number) => !!id && config.admins.includes(id);

bot.command("stats", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const steps = ["signup", "bot_start", "first_tap", "first_upgrade", "scene_done", "first_chat", "paywall_hit", "paywall_hit_chat", "invoice_created", "first_purchase"];
  const count = db.prepare("SELECT COUNT(DISTINCT user_id) AS n FROM events WHERE name = ?");
  const lines = steps.map((s) => `${s}: ${(count.get(s) as { n: number }).n}`);
  const rev = db.prepare("SELECT COALESCE(SUM(stars),0) AS s, COUNT(*) AS n FROM purchases WHERE refunded = 0").get() as { s: number; n: number };
  const src = db
    .prepare("SELECT COALESCE(source,'organic') AS s, COUNT(*) AS n FROM users GROUP BY s ORDER BY n DESC LIMIT 10")
    .all() as { s: string; n: number }[];
  const last = db
    .prepare("SELECT charge_id, user_id, product, stars, refunded FROM purchases ORDER BY created_at DESC LIMIT 5")
    .all() as { charge_id: string; user_id: number; product: string; stars: number; refunded: number }[];
  await ctx.reply(
    `📊 Воронка (уникальные игроки)\n${lines.join("\n")}\n\n⭐ Выручка: ${rev.s} Stars, покупок: ${rev.n}\n\n` +
      `Источники:\n${src.map((r) => `${r.s}: ${r.n}`).join("\n")}\n\n` +
      `Последние покупки (для /refund <id>):\n${last.map((r) => `${r.product} ${r.stars}⭐ user ${r.user_id}${r.refunded ? " (возврат)" : ""}\n${r.charge_id}`).join("\n") || "—"}`,
  );
});

bot.command("refund", async (ctx) => {
  if (!isAdmin(ctx.from?.id)) return;
  const chargeId = ctx.match.trim();
  const row = db.prepare("SELECT * FROM purchases WHERE charge_id = ?").get(chargeId) as
    | { user_id: number; product: string; refunded: number }
    | undefined;
  if (!row || row.refunded) return ctx.reply("Покупка не найдена или уже возвращена");
  await bot.api.refundStarPayment(row.user_id, chargeId);
  db.prepare("UPDATE purchases SET refunded = 1 WHERE charge_id = ?").run(chargeId);
  const p = content.products.find((x) => x.id === row.product);
  if (p) revoke(row.user_id, p.grant);
  track(row.user_id, "refund", { product: row.product });
  await ctx.reply("Возврат выполнен");
});

// ---------- Re-engagement ----------
// Once a day, nudge players who have been away 20+ hours (their energy is full by then).
export function startReminders() {
  const run = async () => {
    const now = Date.now();
    const users = db
      .prepare(
        `SELECT id, first_name FROM users WHERE bot_blocked = 0 AND last_seen < ? AND last_seen > ? AND reminded_at < ? LIMIT 200`,
      )
      .all(now - 20 * 3600_000, now - 7 * 86_400_000, now - 24 * 3600_000) as { id: number; first_name: string }[];
    for (const u of users) {
      const c = content.characters[Math.floor(Math.random() * content.characters.length)];
      try {
        await bot.api.sendMessage(u.id, `${c.emoji} ${c.name}: «${u.first_name ?? "Эй"}, ты куда пропал? Энергия уже полная 😉»`, {
          reply_markup: playButton("Вернуться"),
        });
        track(u.id, "reminder_sent");
      } catch (e) {
        if (e instanceof GrammyError && e.error_code === 403) db.prepare("UPDATE users SET bot_blocked = 1 WHERE id = ?").run(u.id);
      }
      db.prepare("UPDATE users SET reminded_at = ? WHERE id = ?").run(now, u.id);
      await new Promise((r) => setTimeout(r, 50)); // stay well under Telegram's broadcast limits
    }
  };
  setInterval(() => void run().catch(console.error), 3600_000);
}

export async function setupBot() {
  await bot.api.setMyCommands([
    { command: "start", description: "Начать игру" },
    { command: "help", description: "Помощь" },
    { command: "terms", description: "Условия" },
    { command: "paysupport", description: "Поддержка по оплате" },
  ]);
  if (config.webAppUrl) {
    await bot.api.setChatMenuButton({ menu_button: { type: "web_app", text: "Играть", web_app: { url: config.webAppUrl } } });
  }
}
