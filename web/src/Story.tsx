import { api } from './api'
import type { Ctx } from './App'

export default function Story({ ctx }: { ctx: Ctx }) {
  const { state, run, setState } = ctx
  const charName = (id: string) => state.characters.find((c) => c.id === id)?.name ?? id

  return (
    <div>
      <h3>Главы</h3>
      <div className="list">
        {state.chapters.map((ch) => (
          <div key={ch.id} className={`card row ${ch.status === 'locked' ? 'dim' : ''}`}>
            <div className="emoji">{ch.status === 'done' ? '✅' : ch.status === 'locked' ? '🔒' : ch.premium ? '☀️' : '📖'}</div>
            <div className="grow">
              <div>{ch.title}</div>
              <div className="muted small">
                {ch.status === 'done' && 'Пройдена'}
                {ch.status === 'open' && 'Доступна'}
                {ch.status === 'buy' && `Открыть за ${ch.cost.toLocaleString('ru')} 💰`}
                {ch.status === 'premium' && 'Летний пропуск'}
                {ch.status === 'locked' && 'Пройди предыдущую главу'}
              </div>
            </div>
            {(ch.status === 'open' || ch.status === 'done') && <button className="btn" onClick={() => ctx.openScene(ch.id)}>{ch.status === 'done' ? 'Ещё раз' : 'Читать'}</button>}
            {ch.status === 'buy' && (
              <button className="btn" disabled={state.coins < ch.cost}
                onClick={async () => { const s = await run(api.unlock(ch.id)); if (s) { setState(s); ctx.openScene(ch.id) } }}>
                {ch.cost.toLocaleString('ru')} 💰
              </button>
            )}
            {ch.status === 'premium' && <button className="btn gold" onClick={() => ctx.openPaywall('chapter')}>Открыть</button>}
          </div>
        ))}
      </div>

      <h3>Свидания</h3>
      <div className="list">
        {state.moments.map((m) => (
          <div key={m.id} className={`card row ${m.status === 'locked' ? 'dim' : ''}`}>
            <div className="emoji">{m.status === 'done' ? '💖' : m.premium ? '☀️' : '💌'}</div>
            <div className="grow">
              <div>{m.title}</div>
              <div className="muted small">
                {charName(m.char)} ·{' '}
                {m.status === 'locked' && 'ещё не знакомы'}
                {m.status === 'affection' && `нужна симпатия ${m.minAffection}`}
                {m.status === 'premium' && 'Летний пропуск'}
                {(m.status === 'open' || m.status === 'done') && 'доступно'}
              </div>
            </div>
            {(m.status === 'open' || m.status === 'done') && <button className="btn" onClick={() => ctx.openScene(m.id)}>Смотреть</button>}
            {m.status === 'premium' && <button className="btn gold" onClick={() => ctx.openPaywall('moment')}>Открыть</button>}
          </div>
        ))}
      </div>
    </div>
  )
}
