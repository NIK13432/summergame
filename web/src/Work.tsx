import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import type { Ctx } from './App'
import { haptic } from './tg'

interface Float { id: number; x: number; y: number; v: number }

export default function Work({ ctx }: { ctx: Ctx }) {
  const { state, setState, run } = ctx
  const pending = useRef(0)
  const [floats, setFloats] = useState<Float[]>([])
  const [local, setLocal] = useState({ coins: state.coins, energy: state.energy })

  useEffect(() => {
    setLocal({ coins: state.coins, energy: state.energy })
  }, [state.coins, state.energy])

  // Send batched taps once a second so we don't hit the server on every touch.
  useEffect(() => {
    const t = setInterval(async () => {
      const n = pending.current
      if (!n) return
      pending.current = 0
      const r = await api.tap(n).catch(() => null)
      if (r) setState(r.state)
    }, 1000)
    return () => clearInterval(t)
  }, [setState])

  // Local energy regen between syncs.
  useEffect(() => {
    const t = setInterval(() => setLocal((l) => ({ ...l, energy: Math.min(state.energyMax, l.energy + 1) })), state.energyRegenSeconds * 1000)
    return () => clearInterval(t)
  }, [state.energyMax, state.energyRegenSeconds])

  const onTap = (e: React.PointerEvent) => {
    if (local.energy < 1) {
      haptic('heavy')
      return
    }
    haptic('light')
    pending.current += 1
    setLocal((l) => ({ coins: l.coins + state.tapPower, energy: l.energy - 1 }))
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const f = { id: Math.random(), x: e.clientX - rect.left, y: e.clientY - rect.top, v: state.tapPower }
    setFloats((fs) => [...fs.slice(-15), f])
    setTimeout(() => setFloats((fs) => fs.filter((x) => x.id !== f.id)), 800)
  }

  const nextChapter = state.chapters.find((c) => c.status === 'buy' || c.status === 'open')

  return (
    <div className="work">
      <div className="balance">
        <div className="big">{Math.floor(local.coins).toLocaleString('ru')} 💰</div>
        <div className="muted">+{state.tapPower} за тап · +{state.passivePerHour}/час пассивно</div>
      </div>

      <div className="tapzone" onPointerDown={onTap}>
        <div className="tapcard">
          <div className="tapemoji">☕</div>
          <div>Смена в «Чайке»</div>
          <div className="muted small">тапай, чтобы обслуживать гостей</div>
        </div>
        {floats.map((f) => <span key={f.id} className="float" style={{ left: f.x, top: f.y }}>+{f.v}</span>)}
      </div>

      <div className="energy">
        <div className="bar"><div style={{ width: `${(local.energy / state.energyMax) * 100}%` }} /></div>
        <div className="row">
          <span className="muted">⚡ {local.energy}/{state.energyMax}</span>
          {local.energy < state.energyMax * 0.2 && <button className="link" onClick={() => ctx.openPaywall('energy')}>Восполнить ⭐</button>}
        </div>
      </div>

      {nextChapter && (
        <div className="hint" onClick={async () => {
          if (nextChapter.status === 'open') return ctx.openScene(nextChapter.id)
          const s = await run(api.unlock(nextChapter.id))
          if (s) { setState(s); ctx.openScene(nextChapter.id) }
        }}>
          📖 {nextChapter.title} {nextChapter.status === 'buy' ? `— откроется за ${nextChapter.cost.toLocaleString('ru')} 💰` : '— доступна!'}
        </div>
      )}

      <h3>Улучшения</h3>
      <div className="list">
        {state.upgrades.map((u) => (
          <div key={u.id} className="card row">
            <div className="emoji">{u.emoji}</div>
            <div className="grow">
              <div>{u.name} <span className="muted small">ур. {u.level}</span></div>
              <div className="muted small">{u.desc}</div>
            </div>
            <button className="btn" disabled={u.level >= u.max || local.coins < u.cost}
              onClick={async () => { const s = await run(api.upgrade(u.id)); if (s) { haptic('medium'); setState(s) } }}>
              {u.level >= u.max ? 'MAX' : `${u.cost.toLocaleString('ru')} 💰`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
