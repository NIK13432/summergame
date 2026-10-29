import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");

function list(v: string | undefined): number[] {
  return (v ?? "").split(",").map((s) => Number(s.trim())).filter(Boolean);
}

export const config = {
  botToken: process.env.BOT_TOKEN ?? "",
  // Public HTTPS URL where the Mini App is served (same server). Required by Telegram.
  // Render and Railway provide the public URL automatically.
  webAppUrl:
    process.env.WEBAPP_URL ??
    process.env.RENDER_EXTERNAL_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : ""),
  // If set, the bot uses a webhook at `${WEBAPP_URL}/bot/<secret>` instead of long polling.
  useWebhook: process.env.USE_WEBHOOK === "1",
  webhookSecret: process.env.WEBHOOK_SECRET ?? "change-me",
  port: Number(process.env.PORT ?? 3000),
  dbPath: process.env.DB_PATH ?? path.join(root, "data", "game.db"),
  contentDir: process.env.CONTENT_DIR ?? path.join(root, "content"),
  webDist: process.env.WEB_DIST ?? path.join(root, "web", "dist"),
  admins: list(process.env.ADMIN_IDS),
  // Lets you open the app in a normal browser without Telegram (never enable in production).
  devMode: process.env.DEV_MODE === "1",
  llm: {
    provider: process.env.LLM_PROVIDER ?? (process.env.ANTHROPIC_API_KEY ? "anthropic" : "mock"),
    model: process.env.LLM_MODEL ?? "claude-opus-5-5",
    effort: (process.env.LLM_EFFORT ?? "low") as "low" | "medium" | "high",
  },
  supportContact: process.env.SUPPORT_CONTACT ?? "@your_support",
};
