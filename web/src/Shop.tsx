import type { Ctx } from './App'

const REASONS: Record<string, string> = {
  scene: 'Эта сцена доступна с Летним пропуском',
  chapter: 'Продолжение истории — в Летнем пропуске',
  moment: 'Особое свидание — в Летнем пропуске',
  chat: 'Сообщения на сегодня закончились',
  energy: 'Энергия на нуле? Восполни её мгновенно',
  topbar: 'Летний пропуск',
}

interface Props { ctx: Ctx; modal?: boolean; reason?: string; onClose?: () => void }

export default function Shop({ ctx, modal, reason, onClose }: Props) {
  const { state } = ctx
  // Show the most relevant offer first for the paywall reason.
  const order = reason === 'chat' ? ['msgs_100', 'premium_30', 'premium_7']
    : reason === 'energy' ? ['energy', 'premium_7', 'premium_30']
    : ['premium_30', 'premium_7']
  const products = modal
    ? order.map((id) => state.products.find((p) => p.id === id)).filter((p) => !!p)
    : state.products

  const body = (
    <div>
      {modal && <h2 className="paywall-title">{REASONS[reason ?? ''] ?? 'Летний пропуск'}</h2>}
      {!modal && <h3>Магазин</h3>}
      {state.premium && <div className="card gold-card">☀️ Пропуск активен до {new Date(state.premiumUntil).toLocaleDateString('ru')}</div>}
      <ul className="perks">
        <li>📖 Все главы и свидания</li>
        <li>⚡ Энергия ×2 и восстановление ×2</li>
        <li>💬 200 сообщений в день вместо {state.chat.daily}</li>
      </ul>
      <div className="list">
        {products.map((p) => (
          <button key={p.id} className="card product" onClick={() => ctx.buy(p.id)}>
            <div className="grow left">
              <div><b>{p.title}</b> {p.badge && <span className="badge">{p.badge}</span>}</div>
              <div className="muted small">{p.description}</div>
            </div>
            <div className="price">⭐ {p.stars}</div>
          </button>
        ))}
      </div>
      <p className="muted small center-text">Оплата через Telegram Stars. Условия: /terms в боте.</p>
    </div>
  )

  if (!modal) return body
  return (
    <div className="overlay sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>✕</button>
        {body}
      </div>
    </div>
  )
}
