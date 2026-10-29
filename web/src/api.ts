import { tg } from './tg'

export interface Upgrade { id: string; name: string; emoji: string; desc: string; level: number; max: number; cost: number }
export interface Gift { id: string; name: string; emoji: string; cost: number; affection: number }
export interface ChapterInfo { id: string; title: string; cost: number; premium: boolean; status: 'done' | 'open' | 'buy' | 'premium' | 'locked' }
export interface MomentInfo { id: string; char: string; title: string; minAffection: number; premium: boolean; status: 'done' | 'open' | 'premium' | 'locked' | 'affection' }
export interface CharacterInfo { id: string; name: string; age: number; emoji: string; color: string; avatar?: string; short: string; likes: string[]; met: boolean; affection: number }
export interface Product { id: string; title: string; description: string; stars: number; badge?: string }
export interface State {
  user: { id: number; name: string | null }
  coins: number; energy: number; energyMax: number; energyRegenSeconds: number
  tapPower: number; passivePerHour: number; premium: boolean; premiumUntil: number
  chat: { freeLeft: number; daily: number; credits: number }
  upgrades: Upgrade[]; gifts: Gift[]; chapters: ChapterInfo[]; moments: MomentInfo[]
  characters: CharacterInfo[]; products: Product[]
}
export interface StoryNode { id: string; bg?: string; char?: string; speaker?: string; text: string; image?: string; next?: string; choices?: { text: string; next?: string }[] }
export interface Scene { id: string; title: string; nodes: StoryNode[] }
export interface ChatMsg { role: 'user' | 'assistant'; content: string }

export class ApiError extends Error {}

async function call<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(tg?.initData ? { authorization: `tma ${tg.initData}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error ?? `http_${res.status}`)
  return data as T
}

export const api = {
  state: () => call<State>('GET', '/state'),
  tap: (count: number) => call<{ accepted: number; state: State }>('POST', '/tap', { count }),
  upgrade: (id: string) => call<State>('POST', '/upgrade', { id }),
  unlock: (id: string) => call<State>('POST', '/chapter/unlock', { id }),
  scene: (id: string) => call<Scene>('GET', `/scene/${id}`),
  choice: (id: string, node: string, choice: number) => call('POST', `/scene/${id}/choice`, { node, choice }),
  complete: (id: string) => call<State>('POST', `/scene/${id}/complete`),
  gift: (char: string, gift: string) => call<{ liked: boolean; state: State }>('POST', '/gift', { char, gift }),
  chat: (char: string) => call<{ messages: ChatMsg[] }>('GET', `/chat/${char}`),
  send: (char: string, text: string) => call<{ reply: string; state: State }>('POST', `/chat/${char}`, { text }),
  invoice: (product: string) => call<{ link?: string; dev?: boolean }>('POST', '/invoice', { product }),
  event: (name: string, v?: string) => call('POST', '/event', { name, v }).catch(() => {}),
}

export const errorText: Record<string, string> = {
  not_enough_coins: 'Не хватает монет — поработай ещё немного 💪',
  premium_required: 'Эта сцена доступна с Летним пропуском',
  no_messages: 'Сообщения на сегодня закончились',
  max_level: 'Уже максимальный уровень',
  not_met: 'Вы ещё не знакомы',
  scene_locked: 'Сначала пройди предыдущую главу',
  scene_buy: 'Сначала открой главу за монеты',
  scene_affection: 'Нужно больше симпатии',
}
