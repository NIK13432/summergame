import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

// Everything the player sees (story, girls, prices, economy) lives in CONTENT_DIR as JSON,
// so the game can be re-skinned or extended without touching code.

export interface Choice {
  text: string;
  next?: string;
  affection?: Record<string, number>;
}
export interface StoryNode {
  id: string;
  bg?: string; // CSS color/gradient or "assets/<file>" image path
  char?: string; // character shown on screen
  image?: string; // optional illustration "assets/<file>" shown over the background
  speaker?: string; // "me" for the player's inner voice, or a character id
  text: string;
  choices?: Choice[];
  next?: string;
}
export interface Chapter {
  id: string;
  title: string;
  cost: number; // in-game coins to unlock
  premium?: boolean; // needs Premium pass
  meets?: string[]; // characters that become available after this chapter
  nodes: StoryNode[];
}
export interface Moment {
  id: string;
  char: string;
  title: string;
  minAffection: number;
  premium?: boolean;
  nodes: StoryNode[];
}
export interface Character {
  id: string;
  name: string;
  age: number;
  emoji: string;
  color: string;
  avatar?: string;
  short: string;
  persona: string;
  greeting: string;
  likes: string[];
}
export interface Upgrade {
  id: string;
  name: string;
  emoji: string;
  desc: string;
  baseCost: number;
  mult: number;
  tap?: number;
  passive?: number;
  max: number;
}
export interface Gift {
  id: string;
  name: string;
  emoji: string;
  cost: number;
  affection: number;
}
export interface GameConfig {
  startCoins: number;
  energy: { max: number; regenSeconds: number };
  offlineHoursCap: number;
  upgrades: Upgrade[];
  gifts: Gift[];
  chat: { freePerDay: number; premiumPerDay: number };
}
export interface Product {
  id: string;
  title: string;
  description: string;
  stars: number;
  badge?: string;
  grant: { premiumDays?: number; energyRefill?: boolean; coins?: number; msgCredits?: number };
}

export interface Content {
  game: GameConfig;
  characters: Character[];
  chapters: Chapter[];
  moments: Moment[];
  products: Product[];
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}

export function loadContent(dir = config.contentDir): Content {
  const game = readJson<GameConfig>(path.join(dir, "game.json"));
  const characters = readJson<Character[]>(path.join(dir, "characters.json"));
  const story = readJson<{ chapters: Chapter[]; moments?: Moment[] }>(path.join(dir, "story.json"));
  const products = readJson<Product[]>(path.join(dir, "products.json"));
  const chapters = [...story.chapters];
  const moments = [...(story.moments ?? [])];

  // Scene packs: drop any *.json into content/scenes/ to add chapters, moments or characters.
  const packDir = path.join(dir, "scenes");
  if (fs.existsSync(packDir)) {
    for (const f of fs.readdirSync(packDir).filter((f) => f.endsWith(".json")).sort()) {
      const pack = readJson<{ chapters?: Chapter[]; moments?: Moment[]; characters?: Character[] }>(
        path.join(packDir, f),
      );
      chapters.push(...(pack.chapters ?? []));
      moments.push(...(pack.moments ?? []));
      characters.push(...(pack.characters ?? []));
    }
  }

  for (const c of characters) {
    if (!(c.age >= 18)) throw new Error(`Character ${c.id} must be an adult (age >= 18)`);
  }
  const ids = new Set<string>();
  for (const ch of [...chapters, ...moments]) {
    if (ids.has(ch.id)) throw new Error(`Duplicate chapter/moment id: ${ch.id}`);
    ids.add(ch.id);
  }
  return { game, characters, chapters, moments, products };
}

export let content = loadContent();
export function reloadContent() {
  content = loadContent();
}
