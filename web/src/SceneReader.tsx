import { useEffect, useState } from 'react'
import { api, type Scene } from './api'
import type { Ctx } from './App'
import { haptic } from './tg'

const BACKGROUNDS: Record<string, string> = {
  bus: 'linear-gradient(180deg,#f6d365 0%,#fda085 100%)',
  room: 'linear-gradient(180deg,#e0c3fc 0%,#8ec5fc 100%)',
  cafe: 'linear-gradient(180deg,#fbc2eb 0%,#a6c1ee 100%)',
  beach: 'linear-gradient(180deg,#89f7fe 0%,#66a6ff 100%)',
  sunset: 'linear-gradient(180deg,#ff9a8b 0%,#ff6a88 55%,#ff99ac 100%)',
  dawn: 'linear-gradient(180deg,#a1c4fd 0%,#ffd1a9 100%)',
  night: 'linear-gradient(180deg,#0f2027 0%,#203a43 50%,#2c5364 100%)',
  party: 'linear-gradient(180deg,#1a1033 0%,#6b2a59 60%,#f08a4b 100%)',
  storm: 'linear-gradient(180deg,#232526 0%,#414345 100%)',
}

const asset = (p: string) => `/content/${p}`
function bgStyle(bg?: string) {
  if (!bg) return { background: BACKGROUNDS.beach }
  if (bg.startsWith('assets/')) return { background: `center / cover no-repeat url(${asset(bg)})` }
  return { background: BACKGROUNDS[bg] ?? bg }
}

export default function SceneReader({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const [scene, setScene] = useState<Scene | null>(null)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    ctx.run(api.scene(id)).then((s) => (s ? setScene(s) : onClose()))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  if (!scene) return <div className="overlay center"><div className="spinner" /></div>
  const node = scene.nodes[idx]
  const character = ctx.state.characters.find((c) => c.id === node.char)
  const speaker = node.speaker === 'me'
    ? 'Я'
    : ctx.state.characters.find((c) => c.id === node.speaker)?.name ?? node.speaker

  const goTo = async (nextId?: string) => {
    const nextIdx = nextId ? scene.nodes.findIndex((n) => n.id === nextId) : idx + 1
    if (nextIdx < 0 || nextIdx >= scene.nodes.length) {
      const s = await ctx.run(api.complete(id))
      if (s) ctx.setState(s)
      onClose()
      return
    }
    setIdx(nextIdx)
  }

  return (
    <div className="overlay scene" style={bgStyle(node.bg)}>
      <button className="close" onClick={onClose}>✕</button>
      <div className="scene-title">{scene.title}</div>
      {node.image && <img className="scene-image" src={asset(node.image)} alt="" />}
      {character && !node.image && (
        <div className="portrait">
          {character.avatar ? <img src={asset(character.avatar)} alt={character.name} /> : <div className="portrait-emoji" style={{ background: character.color }}>{character.emoji}</div>}
        </div>
      )}
      <div className="dialog" onClick={() => !node.choices && goTo(node.next)}>
        {speaker && <div className="speaker">{speaker}</div>}
        <div className={node.speaker === 'me' ? 'thought' : ''}>{node.text}</div>
        {node.choices ? (
          <div className="choices">
            {node.choices.map((c, i) => (
              <button key={i} className="choice" onClick={async (e) => {
                e.stopPropagation()
                haptic('medium')
                await ctx.run(api.choice(id, node.id, i))
                goTo(c.next)
              }}>{c.text}</button>
            ))}
          </div>
        ) : <div className="muted small tapnext">нажми, чтобы продолжить ▸</div>}
      </div>
    </div>
  )
}
