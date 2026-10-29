import { useEffect, useRef, useState } from 'react'
import { api, type ChatMsg } from './api'
import type { Ctx } from './App'

export default function Chat({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const c = ctx.state.characters.find((x) => x.id === id)!
  const [msgs, setMsgs] = useState<ChatMsg[]>([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    ctx.run(api.chat(id)).then((r) => r && setMsgs(r.messages))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs, typing])

  const q = ctx.state.chat
  const left = q.freeLeft + q.credits

  const send = async () => {
    const t = text.trim()
    if (!t || typing) return
    if (left <= 0) return ctx.openPaywall('chat')
    setText('')
    setMsgs((m) => [...m, { role: 'user', content: t }])
    setTyping(true)
    const r = await ctx.run(api.send(id, t))
    setTyping(false)
    if (r) {
      setMsgs((m) => [...m, { role: 'assistant', content: r.reply }])
      ctx.setState(r.state)
    } else {
      setMsgs((m) => m.slice(0, -1))
      setText(t)
    }
  }

  return (
    <div className="overlay chat">
      <div className="chat-head">
        <button className="link" onClick={onClose}>‹ Назад</button>
        <div className="avatar small" style={{ background: c.color }}>{c.emoji}</div>
        <div className="grow"><b>{c.name}</b><div className="muted small">{typing ? 'печатает…' : 'в сети'}</div></div>
        <div className="muted small">✉️ {left}</div>
      </div>
      <div className="chat-body">
        {msgs.map((m, i) => <div key={i} className={`bubble ${m.role}`}>{m.content}</div>)}
        {typing && <div className="bubble assistant typing">•••</div>}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={(e) => { e.preventDefault(); send() }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={left > 0 ? 'Сообщение…' : 'Сообщения закончились'} maxLength={500} />
        <button className="btn" type="submit" disabled={typing}>➤</button>
      </form>
    </div>
  )
}
