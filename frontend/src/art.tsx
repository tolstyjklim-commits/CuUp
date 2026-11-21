import { useEffect, useId, useRef, useState } from 'react'
import { GIFTS, type GiftKind } from './lib'

const SHAPES: Record<string, string> = {
  heart: 'M60 104C16 72 12 42 30 28c13-10 25-4 30 8 5-12 17-18 30-8 18 14 14 44-30 76z',
  star: 'M60 12l14 30 33 4-24 23 6 33-29-16-29 16 6-33-24-23 33-4z',
  diamond: 'M60 12l38 30-38 66L22 42z',
  hex: 'M60 12l38 22v52L60 108 22 86V34z',
}

// Анимированные стикеры Telegram (.tgs = gzip + Lottie JSON). Грузится лениво, только для крупных иконок.
function LottieArt({ src, size, onFail }: { src: string; size: number; onFail: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    let anim: { destroy: () => void } | null = null, dead = false
    ;(async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer()
        const u8 = new Uint8Array(buf)
        let text: string
        if (u8[0] === 0x1f && u8[1] === 0x8b) {
          const ds = new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip')))
          text = await ds.text()
        } else text = new TextDecoder().decode(u8)
        const lottie = (await import('lottie-web')).default
        if (dead || !box.current) return
        anim = lottie.loadAnimation({ container: box.current, renderer: 'svg', loop: true, autoplay: true, animationData: JSON.parse(text) })
      } catch { if (!dead) onFail() }
    })()
    return () => { dead = true; anim?.destroy() }
  }, [src, onFail])
  return <div ref={box} style={{ width: size, height: size }} />
}

export function GiftArt({ kind, size = 64, glow = true }: { kind: GiftKind; size?: number; glow?: boolean }) {
  const id = useId().replace(/:/g, '')
  const g = GIFTS[kind]
  const [imgBad, setImgBad] = useState(false)
  const [animBad, setAnimBad] = useState(false)
  if (!g) return <span style={{ width: size, height: size, display: 'inline-block' }} />
  if (g.anim && size >= 80 && !animBad) return <LottieArt src={g.anim} size={size} onFail={() => setAnimBad(true)} />
  if (g.thumb && !imgBad) return (
    <span style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center', borderRadius: size * 0.25,
      background: glow ? `radial-gradient(circle,${g.c1}55,transparent 70%)` : 'none' }}>
      <img src={g.thumb} alt="" loading="lazy" onError={() => setImgBad(true)} width={size * 0.86} height={size * 0.86} style={{ objectFit: 'contain' }} />
    </span>)
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <linearGradient id={`a${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={g.c1} /><stop offset="1" stopColor={g.c2} /></linearGradient>
        <radialGradient id={`b${id}`}><stop offset="0" stopColor={g.c1} stopOpacity=".45" /><stop offset="1" stopColor={g.c1} stopOpacity="0" /></radialGradient>
      </defs>
      {glow && <circle cx="60" cy="60" r="58" fill={`url(#b${id})`} />}
      <g fill={`url(#a${id})`} stroke="rgba(255,255,255,.55)" strokeWidth="2" strokeLinejoin="round">
        {g.shape === 'ball' ? <circle cx="60" cy="60" r="44" /> : <path d={SHAPES[g.shape]} />}
      </g>
      <path d="M38 34l12-8" stroke="rgba(255,255,255,.8)" strokeWidth="4" strokeLinecap="round" />
      <path d="M96 22l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#fff" opacity=".85" />
    </svg>
  )
}

export function RocketArt({ size = 120, flame = true }: { size?: number; flame?: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" aria-hidden="true">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#F0A21B" /></linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" /><stop offset="1" stopColor="#C8D0FF" /></linearGradient>
      </defs>
      <g transform="rotate(45 100 100)">
        <path d="M100 14c26 22 34 58 28 100H72c-6-42 2-78 28-100z" fill={`url(#h${id})`} stroke="#2C3562" strokeWidth="3" />
        <circle cx="100" cy="64" r="13" fill="#1D2447" stroke={`url(#g${id})`} strokeWidth="5" />
        <path d="M72 114l-26 30 6 12 22-12zM128 114l26 30-6 12-22-12z" fill={`url(#g${id})`} stroke="#2C3562" strokeWidth="3" strokeLinejoin="round" />
        <rect x="84" y="114" width="32" height="12" fill="#F0A21B" />
        {flame && <><path d="M86 128h28l-14 52z" fill="#FF8A3D" /><path d="M92 128h16l-8 30z" fill="#FFE08A" /></>}
      </g>
    </svg>
  )
}

export const Coin = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="11" fill="#F6B73C" /><circle cx="12" cy="12" r="7" fill="none" stroke="#B87A12" strokeWidth="2" />
  </svg>
)
