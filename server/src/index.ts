import fs from "node:fs";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { webhookCallback } from "grammy";
import { config } from "./config.js";
import { content } from "./content.js";
import { requireAuth } from "./auth.js";
import { bot, createInvoice, setupBot, startReminders } from "./bot.js";
import { getChat, sendChat } from "./chat.js";
import { trackOnce, track } from "./db.js";
import * as game from "./game.js";

const app = express();
app.use(express.json({ limit: "32kb" }));

app.get("/api/health", (_req, res) => { res.json({ ok: true }); });

const api = express.Router();
api.use(requireAuth);

type Handler = (req: Request) => unknown;
const h = (fn: Handler) => async (req: Request, res: Response, next: NextFunction) => {
  try {
    res.json((await fn(req)) ?? { ok: true });
  } catch (e) {
    if (e instanceof game.GameError) res.status(400).json({ error: e.code });
    else next(e);
  }
};

api.get("/state", h((req) => {
  trackOnce(req.userId, "app_open");
  return game.publicState(req.userId);
}));
api.post("/tap", h((req) => {
  const accepted = game.tap(req.userId, Number(req.body.count) || 0);
  return { accepted, state: game.publicState(req.userId) };
}));
api.post("/upgrade", h((req) => {
  game.buyUpgrade(req.userId, String(req.body.id));
  return game.publicState(req.userId);
}));
api.post("/chapter/unlock", h((req) => {
  game.unlockChapter(req.userId, String(req.body.id));
  return game.publicState(req.userId);
}));
api.get("/scene/:id", h((req) => game.getScene(req.userId, String(req.params.id))));
api.post("/scene/:id/choice", h((req) => {
  game.choose(req.userId, String(req.params.id), String(req.body.node), Number(req.body.choice));
}));
api.post("/scene/:id/complete", h((req) => {
  game.completeScene(req.userId, String(req.params.id));
  return game.publicState(req.userId);
}));
api.post("/gift", h((req) => {
  const r = game.giveGift(req.userId, String(req.body.char), String(req.body.gift));
  return { ...r, state: game.publicState(req.userId) };
}));
api.get("/chat/:char", h((req) => getChat(req.userId, String(req.params.char))));
api.post("/chat/:char", h(async (req) => {
  const reply = await sendChat(req.userId, String(req.params.char), String(req.body.text ?? ""));
  return { reply, state: game.publicState(req.userId) };
}));
api.post("/invoice", h(async (req) => {
  if (config.devMode && !config.botToken) {
    // No bot token locally: simulate a successful purchase so the paywall can be tested end to end.
    const p = content.products.find((x) => x.id === req.body.product);
    if (!p) throw new game.GameError("bad_product");
    game.grant(req.userId, p.grant);
    track(req.userId, "purchase", { product: p.id, stars: p.stars, dev: true });
    return { dev: true };
  }
  return { link: await createInvoice(req.userId, String(req.body.product)) };
}));
api.post("/event", h((req) => {
  const allowed = ["paywall_view", "shop_open", "tab_open"];
  const name = String(req.body.name);
  if (allowed.includes(name)) track(req.userId, name, { v: String(req.body.v ?? "") });
}));

app.use("/api", api);
app.use("/content/assets", express.static(path.join(config.contentDir, "assets"), { maxAge: "1d" }));

if (config.useWebhook) {
  app.use(`/bot/${config.webhookSecret}`, webhookCallback(bot, "express"));
}

if (fs.existsSync(config.webDist)) {
  app.use(express.static(config.webDist));
  app.get(/^\/(?!api|bot|content).*/, (_req, res) => res.sendFile(path.join(config.webDist, "index.html")));
}

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: "server_error" });
});

app.listen(config.port, async () => {
  console.log(`Server on :${config.port} (LLM: ${config.llm.provider}, dev: ${config.devMode})`);
  if (!config.botToken) {
    console.warn("BOT_TOKEN is not set: bot and payments are disabled.");
    return;
  }
  await setupBot();
  startReminders();
  if (config.useWebhook) {
    await bot.api.setWebhook(`${config.webAppUrl}/bot/${config.webhookSecret}`, {
      allowed_updates: ["message", "pre_checkout_query"],
    });
    console.log("Bot webhook set");
  } else {
    await bot.api.deleteWebhook();
    void bot.start({ allowed_updates: ["message", "pre_checkout_query"] });
    console.log("Bot polling started");
  }
});
