import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { config } from "./config.js";
import { ensureUser } from "./game.js";

export interface TgUser {
  id: number;
  first_name?: string;
  username?: string;
  language_code?: string;
}

const MAX_AGE_SEC = 24 * 3600;

// Validates Telegram.WebApp.initData as described in
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData: string): { user: TgUser; startParam?: string } | null {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheck = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(config.botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheck).digest("hex");
  if (expected.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(hash))) return null;
  if (Date.now() / 1000 - Number(params.get("auth_date")) > MAX_AGE_SEC) return null;
  const user = JSON.parse(params.get("user") ?? "null") as TgUser | null;
  if (!user?.id) return null;
  return { user, startParam: params.get("start_param") ?? undefined };
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId: number;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") ?? "";
  const initData = header.startsWith("tma ") ? header.slice(4) : "";
  let verified = initData ? verifyInitData(initData) : null;
  if (!verified && config.devMode) {
    // Browser testing without Telegram.
    verified = { user: { id: Number(req.header("x-dev-user") ?? 1), first_name: "Dev" } };
  }
  if (!verified) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }
  ensureUser(verified.user, verified.startParam);
  req.userId = verified.user.id;
  next();
}
