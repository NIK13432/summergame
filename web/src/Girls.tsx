import { useState } from 'react'
import { api } from './api'
import type { Ctx } from './App'
import { alert, notify } from './tg'

export default function Girls({ ctx }: { ctx: Ctx }) {
  const { state, run, setState } = ctx
  const [giftFor, setGiftFor] = useState<string | null>(null)

  return (
    <div>
      <h3>Девушки</h3>
      <p className="muted small">Пиши им — они помнят ваши разговоры. Подарки и выборы в сюжете повышают симпатию и открывают свидания.</p>
      <div className="list">
        {state.characters.map((c) => (
          <div key={c.id} className={`card ${c.met ? '' : 'dim'}`}>
            <div className="row">
              <div className="avatar" style={{ background: c.color }}>
                {c.avatar ? <img src={`/content/${c.avatar}`} alt="" /> : c.emoji}
              </div>
              <div className="grow">
                <div><b>{c.met ? c.name : '???'}</b> {c.met && <span className="muted small">{c.age}</span>}</div>
                <div className="muted small">{c.met ? c.short : 'Встретишь дальше по сюжету'}</div>
                {c.met && <div className="small">💗 {c.affection}</div>}
              </div>
            </div>
            {c.met && (
              <div className="row gap">
                <button className="btn grow" onClick={() => ctx.openChat(c.id)}>💬 Написать</button>
                <button className="btn ghost grow" onClick={() => setGiftFor(giftFor === c.id ? null : c.id)}>🎁 Подарок</button>
              </div>
            )}
            {giftFor === c.id && (
              <div className="gifts">
                {state.gifts.map((g) => (
                  <button key={g.id} className="gift" disabled={state.coins < g.cost} onClick={async () => {
                    const r = await run(api.gift(c.id, g.id))
                    if (!r) return
                    notify('success')
                    setState(r.state)
                    if (r.liked) alert(`${c.name} в восторге! Это её любимое 😍`)
                  }}>
                    <span className="emoji">{g.emoji}</span>
                    <span className="small">{g.name}{c.likes.includes(g.id) ? ' ❤️' : ''}</span>
                    <span className="muted small">{g.cost.toLocaleString('ru')} 💰</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
