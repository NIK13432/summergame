import { useCallback, useEffect, useState } from 'react'
import { api, ApiError, errorText, type State } from './api'
import { alert, initTelegram, notify, tg } from './tg'
import Work from './Work'
import Story from './Story'
import Girls from './Girls'
import Shop from './Shop'
import SceneReader from './SceneReader'
import Chat from './Chat'

type Tab = 'work' | 'story' | 'girls' | 'shop'

export interface Ctx {
  state: State
  setState: (s: State) => void
  refresh: () => Promise<void>
  run: <T>(p: Promise<T>) => Promise<T | undefined>
  openPaywall: (reason: string) => void
  openScene: (id: string) => void
  openChat: (id: string) => void
  buy: (productId: string) => Promise<void>
}

export default function App() {
  const [state, setState] = useState<State | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('work')
  const [paywall, setPaywall] = useState<string | null>(null)
  const [scene, setScene] = useState<string | null>(null)
  const [chat, setChat] = useState<string | null>(null)

  const refresh = useCallback(async () => setState(await api.state()), [])

  useEffect(() => {
    initTelegram()
    refresh().catch((e) => setError(e instanceof ApiError ? e.message : 'network'))
  }, [refresh])

  const openPaywall = (reason: string) => {
    setPaywall(reason)
    api.event('paywall_view', reason)
  }

  // Wraps an API call: shows friendly errors and routes premium-gated errors to the paywall.
  const run = async <T,>(p: Promise<T>) => {
    try {
      return await p
    } catch (e) {
      const code = e instanceof Error ? e.message : 'error'
      notify('error')
      if (code === 'premium_required') openPaywall('scene')
      else if (code === 'no_messages') openPaywall('chat')
      else alert(errorText[code] ?? 'Что-то пошло не так, попробуй ещё раз')
      return undefined
    }
  }

  const buy = async (productId: string) => {
    const r = await run(api.invoice(productId))
    if (!r) return
    if (r.dev) {
      notify('success')
      setPaywall(null)
      return refresh()
    }
    tg?.openInvoice(r.link!, async (status) => {
      if (status !== 'paid') return
      notify('success')
      setPaywall(null)
      // The bot grants the purchase when Telegram delivers successful_payment; give it a moment.
      for (const delay of [800, 2000, 4000]) {
        await new Promise((res) => setTimeout(res, delay))
        await refresh()
      }
    })
  }

  if (error) {
    return (
      <div className="center">
        <h2>Открой игру из Telegram</h2>
        <p className="muted">Не удалось авторизоваться ({error}). Запусти игру кнопкой «Играть» в боте.</p>
      </div>
    )
  }
  if (!state) return <div className="center"><div className="spinner" /></div>

  const ctx: Ctx = {
    state, setState, refresh, run, openPaywall, buy,
    openScene: setScene,
    openChat: setChat,
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="pill">💰 {state.coins.toLocaleString('ru')}</div>
        <div className="pill">⚡ {state.energy}/{state.energyMax}</div>
        {state.premium ? <div className="pill gold">☀️ Pass</div> : <button className="pill gold" onClick={() => openPaywall('topbar')}>☀️ Pass</button>}
      </header>

      <main className="content">
        {tab === 'work' && <Work ctx={ctx} />}
        {tab === 'story' && <Story ctx={ctx} />}
        {tab === 'girls' && <Girls ctx={ctx} />}
        {tab === 'shop' && <Shop ctx={ctx} />}
      </main>

      <nav className="tabs">
        {([['work', '💼', 'Работа'], ['story', '📖', 'История'], ['girls', '💞', 'Девушки'], ['shop', '⭐', 'Магазин']] as const).map(([id, icon, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => { setTab(id); api.event('tab_open', id) }}>
            <span>{icon}</span>{label}
          </button>
        ))}
      </nav>

      {scene && <SceneReader ctx={ctx} id={scene} onClose={() => setScene(null)} />}
      {chat && <Chat ctx={ctx} id={chat} onClose={() => setChat(null)} />}
      {paywall && <Shop ctx={ctx} modal reason={paywall} onClose={() => setPaywall(null)} />}
    </div>
  )
}
