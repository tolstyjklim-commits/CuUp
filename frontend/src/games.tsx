import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { GiftArt } from './art'
import { Burst, CrashScene } from './fx'
import { play } from './sfx'
import {
  CASE, GIFTS, GIFT_ORDER, MINES_COUNT, MINES_TOTAL, PAYLINES, PLINKO_MULTS, SLOT3_PAY,
  STORM_PAY, SYMBOLS, caseChance, crashPoint, minesMult, money, pickSymbol, rint, rnd, upgradeChance, weighted,
  type Gift, type GiftKind, type Save,
} from './lib'

export type Ctx = {
  save: Save
  charge: (cost: number, title: string, countRound?: boolean) => boolean
  pay: (amount: number, title: string) => void
  notify: (msg: string) => void
  addGift: (kind: GiftKind, title: string) => Gift
  removeGift: (uid: string) => void
  bump: (key: string) => void
}

// ---------- общие элементы ----------
export function StakeInput({ value, onChange, balance, disabled, presets = [10, 50, 100, 500] }:
  { value: number; onChange: (n: number) => void; balance: number; disabled?: boolean; presets?: number[] }) {
  const clamp = (n: number) => Math.max(1, Math.min(Math.floor(n) || 1, Math.max(1, balance)))
  return (
    <div className="stake-box">
      <label className="m small" htmlFor="stake">Ставка, монет</label>
      <div className="stake-line">
        <input id="stake" inputMode="numeric" value={value} disabled={disabled}
          onChange={e => onChange(clamp(Number(e.target.value.replace(/\D/g, ''))))} />
        <button disabled={disabled} onClick={() => onChange(clamp(value / 2))}>½</button>
        <button disabled={disabled} onClick={() => onChange(clamp(value * 2))}>×2</button>
      </div>
      <div className="stake-presets">
        {presets.map(p => <button key={p} disabled={disabled} className={p === value ? 'on' : ''} onClick={() => onChange(clamp(p))}>{p}</button>)}
        <button disabled={disabled} onClick={() => onChange(clamp(balance))}>Все</button>
      </div>
    </div>
  )
}
const Result = ({ children, good }: { children: React.ReactNode; good?: boolean }) =>
  <div className={`result ${good ? 'good' : ''}`}>{children}</div>

function useCount(target: number, ms = 700) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (!target) { setV(0); return }
    const t0 = performance.now(); let raf = 0
    const f = (now: number) => { const k = Math.min(1, (now - t0) / ms); setV(Math.round(target * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f) }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [target, ms])
  return v
}
// угол/сдвиг элемента из CSS-transform (для «тиков» во время анимации)
const matrixOf = (el: Element | null) => {
  if (!el) return null
  const t = getComputedStyle(el).transform
  if (!t || t === 'none') return null
  const m = t.match(/matrix\(([^)]+)\)/)
  return m ? m[1].split(',').map(Number) : null
}

// ---------- РАКЕТА ----------
export function Crash({ ctx }: { ctx: Ctx }) {
  const [stake, setStake] = useState(50)
  const [phase, setPhase] = useState<'idle' | 'fly' | 'crash' | 'cash'>('idle')
  const [mult, setMult] = useState(1)
  const [win, setWin] = useState(0)
  const [hist, setHist] = useState<number[]>([])
  const raf = useRef(0)
  const live = useRef({ crashAt: 1, stake: 0, t0: 0, phase: 'idle' as string, mult: 1 })
  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const finish = (kind: 'crash' | 'cash', m: number) => {
    cancelAnimationFrame(raf.current)
    live.current.phase = kind
    setPhase(kind); setMult(m)
    setHist(h => [live.current.crashAt, ...h].slice(0, 7))
  }
  const start = () => {
    if (phase === 'fly' || !ctx.charge(stake, 'Ракета — ставка')) return
    ctx.bump('crash'); play.whoosh()
    const L = live.current
    L.crashAt = crashPoint(); L.stake = stake; L.t0 = performance.now(); L.phase = 'fly'; L.mult = 1
    setPhase('fly'); setMult(1); setWin(0)
    const tick = (now: number) => {
      if (L.phase !== 'fly') return
      const m = Math.floor(Math.exp(0.16 * ((now - L.t0) / 1000)) * 100) / 100
      if (m >= L.crashAt) { finish('crash', L.crashAt); play.boom(); play.lose(); ctx.notify(`Ракета улетела на ×${L.crashAt.toFixed(2)}`); return }
      L.mult = m; setMult(m)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
  }
  const cash = () => {
    const L = live.current
    if (L.phase !== 'fly') return
    const w = Math.floor(L.stake * L.mult)
    finish('cash', L.mult); setWin(w)
    ctx.pay(w, 'Ракета — выигрыш')
  }
  const flying = phase === 'fly'
  return (
    <div className="crash">
      <div className="chips">{hist.length ? hist.map((h, i) => <span key={i} className={h >= 2 ? 'g' : 'r'}>{h.toFixed(2)}×</span>) : <span className="m small">Прошлые раунды появятся здесь</span>}</div>
      <div className={`stage ${phase}`}>
        <CrashScene phase={phase} mult={mult} />
        <div className={`big-mult ${phase}`} key={phase === 'fly' ? Math.floor(mult) : 'x'}>{mult.toFixed(2)}×</div>
        {phase === 'crash' && <div className="boom">Улетела</div>}
        {phase === 'cash' && <div className="boom ok">Забрано +{money(win)}</div>}
        {phase === 'idle' && <div className="boom m">Жми «Сделать ставку», ракета стартует сразу</div>}
      </div>
      <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} disabled={flying} />
      {flying
        ? <button className="cta green pulse" onClick={cash}>Забрать {money(Math.floor(live.current.stake * mult))}</button>
        : <button className="cta" onClick={start}>Сделать ставку · {money(stake)}</button>}
    </div>
  )
}

// ---------- АПГРЕЙД ПОДАРКОВ ----------
export function Upgrade({ ctx, seed }: { ctx: Ctx; seed: string | null }) {
  const gifts = ctx.save.gifts
  const prices = ctx.save.prices
  const [sel, setSel] = useState<string | null>(seed && gifts.some(g => g.uid === seed) ? seed : gifts[0]?.uid ?? null)
  const [target, setTarget] = useState<GiftKind | null>(null)
  const [rot, setRot] = useState(0)
  const [spinning, setSpinning] = useState(false)
  const [res, setRes] = useState<{ ok: boolean; text: string } | null>(null)
  const [fx, setFx] = useState<'win' | 'burn' | null>(null)
  const needle = useRef<SVGGElement>(null)
  const cur = gifts.find(g => g.uid === sel) ?? null
  const curPrice = cur ? prices[cur.kind] : 0

  const targets = useMemo(() =>
    cur ? GIFT_ORDER.filter(k => prices[k] > curPrice * 1.05 && upgradeChance(curPrice, prices[k]) >= 0.02).slice(0, 16) : [],
    [cur, curPrice, prices])
  useEffect(() => {
    if (!targets.length) setTarget(null)
    else if (!target || !targets.includes(target)) setTarget(targets[Math.min(1, targets.length - 1)])
  }, [targets, target])
  useEffect(() => { if (!cur && gifts.length) setSel(gifts[0].uid) }, [cur, gifts])

  // тики при прохождении стрелки через деления
  useEffect(() => {
    if (!spinning) return
    let raf = 0, lastTick = -1
    const f = () => {
      const m = matrixOf(needle.current)
      if (m) { const deg = ((Math.atan2(m[1], m[0]) * 180) / Math.PI + 360) % 360, idx = Math.floor(deg / 6); if (idx !== lastTick) { lastTick = idx; play.tick() } }
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [spinning])

  const chance = cur && target ? upgradeChance(curPrice, prices[target]) : 0
  const mult = cur && target ? prices[target] / curPrice : 0
  const R = 78, C = 2 * Math.PI * R

  const go = () => {
    if (!cur || !target || spinning) return
    const ok = rnd() < chance
    const zone = chance * 360
    const angle = ok ? zone * (0.06 + rnd() * 0.88) : zone + (360 - zone) * (0.06 + rnd() * 0.88)
    const next = rot - (rot % 360) + 360 * 5 + angle
    const gift = cur, tgt = target
    setSpinning(true); setRes(null); setFx(null); setRot(next); play.whoosh()
    window.setTimeout(() => {
      ctx.removeGift(gift.uid)
      ctx.bump('upgrades')
      if (ok) {
        const g = ctx.addGift(tgt, 'Апгрейд — успех')
        ctx.notify(`Апгрейд удался: ${GIFTS[tgt]?.name} #${g.num}`)
        setRes({ ok: true, text: `Получено: ${GIFTS[tgt]?.name} #${g.num}` })
        setSel(g.uid); setFx('win'); play.big()
      } else {
        ctx.notify('Не повезло, подарок сгорел')
        setRes({ ok: false, text: `${GIFTS[gift.kind]?.name} #${gift.num} сгорел` })
        setSel(null); setFx('burn'); play.lose(); play.boom()
      }
      setSpinning(false)
    }, 4200)
  }

  if (!gifts.length && !spinning) return (
    <div className="empty-up">
      <p>У тебя нет подарков для апгрейда.</p>
      <p className="m small">Купи подарок на маркете или выиграй его в кейсе.</p>
      {res && <Result good={res.ok}>{res.text}</Result>}
    </div>
  )
  const ticks = Array.from({ length: 60 }, (_, i) => i)
  return (
    <div className="upg">
      <div className="upg-pair">
        <div className={`upg-slot ${fx === 'burn' ? 'burn' : ''}`}>
          <span className="m small">Отдаёшь</span>
          {cur ? <><GiftArt kind={cur.kind} size={88} /><b>{GIFTS[cur.kind]?.name} #{cur.num}</b><span className="gold">{money(curPrice)} монет</span></> : <b className="m">{fx === 'burn' ? 'Сгорел' : 'Выбери подарок'}</b>}
          {fx === 'burn' && <Burst key="b" type="ember" n={60} />}
        </div>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#98A0C8" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 12h16M14 6l6 6-6 6" /></svg>
        <div className={`upg-slot ${fx === 'win' ? 'glow' : ''} ${spinning ? 'pending' : ''}`}>
          <span className="m small">Получаешь</span>
          {target ? <><GiftArt kind={target} size={88} /><b>{GIFTS[target]?.name}</b><span className="gold">≈ {money(prices[target])} монет</span></> : <b className="m">{cur ? 'Выше нет' : '—'}</b>}
          {fx === 'win' && <Burst key="w" type="gold" n={90} />}
        </div>
      </div>

      <div className="upg-targets">
        {targets.map(k => (
          <button key={k} disabled={spinning} className={k === target ? 'on' : ''} onClick={() => { setTarget(k); play.click() }} title={GIFTS[k]?.name}>
            <GiftArt kind={k} size={28} glow={false} />
            <b>×{(prices[k] / curPrice).toFixed(1).replace('.', ',')}</b>
          </button>
        ))}
      </div>

      <div className={`dial ${spinning ? 'spinning' : ''}`}>
        <svg width="220" height="220" viewBox="0 0 210 210" role="img" aria-label={`Шанс успеха ${Math.round(chance * 100)}%`}>
          <defs>
            <linearGradient id="arcg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3DDC97" /><stop offset="1" stopColor="#7CF0BC" /></linearGradient>
            <radialGradient id="disc"><stop offset="0" stopColor="#262d63" /><stop offset="1" stopColor="#161b3d" /></radialGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          <circle cx="105" cy="105" r="98" fill="url(#disc)" stroke="#2C3562" strokeWidth="2" />
          {ticks.map(i => <line key={i} x1="105" y1="9" x2="105" y2={i % 5 === 0 ? 17 : 13} stroke={i % 5 === 0 ? '#6E78B8' : '#3a4280'} strokeWidth={i % 5 === 0 ? 2 : 1} transform={`rotate(${i * 6} 105 105)`} />)}
          <circle cx="105" cy="105" r={R} fill="none" stroke="#4a1c2c" strokeWidth="16" />
          <circle cx="105" cy="105" r={R} fill="none" stroke="url(#arcg)" strokeWidth="16" filter="url(#glow)"
            strokeDasharray={`${C * chance} ${C}`} transform="rotate(-90 105 105)" />
          <g ref={needle} style={{ transform: `rotate(${rot}deg)`, transformOrigin: '105px 105px', transition: spinning ? 'transform 4.1s cubic-bezier(.1,.72,.08,1)' : 'none' }}>
            <path d="M105 6l-9 22h18z" fill="#fff" filter="url(#glow)" />
            <rect x="103.5" y="26" width="3" height="22" rx="1.5" fill="#fff" opacity=".7" />
          </g>
        </svg>
        <div className="dial-text"><b>{Math.round(chance * 100)}%</b><span className="m small">шанс успеха{mult ? ` · ×${mult.toFixed(1).replace('.', ',')}` : ''}</span></div>
      </div>

      {res && <Result good={res.ok}>{res.text}</Result>}
      <button className="cta" disabled={!cur || !target || spinning} onClick={go}>
        {spinning ? <><RotateCcw size={18} className="spin-icon" /> Крутится…</> : 'Апгрейд'}
      </button>
      <p className="m small center">Если не повезёт, подарок сгорит. Подарки существуют только внутри игры.</p>

      <h3 className="sub-title">Выбери подарок</h3>
      <div className="pick-row">
        {gifts.map(g => (
          <button key={g.uid} disabled={spinning} className={g.uid === sel ? 'on' : ''} onClick={() => { setSel(g.uid); setRes(null); setFx(null); play.click() }}>
            <GiftArt kind={g.kind} size={44} glow={false} /><span>#{g.num}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

// ---------- ШТОРМ (слот 5×3) ----------
const PITCH = 68
export function Storm({ ctx }: { ctx: Ctx }) {
  const [stake, setStake] = useState(90)
  const [cols, setCols] = useState<string[][]>(() => Array.from({ length: 5 }, () => [pickSymbol(), pickSymbol(), pickSymbol()]))
  const [strips, setStrips] = useState<string[][] | null>(null) // во время спина: длинные ленты
  const [spinId, setSpinId] = useState(0)
  const [busy, setBusy] = useState(false)
  const [hit, setHit] = useState<Set<string>>(new Set())
  const [win, setWin] = useState(0)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  const shown = useCount(win)

  const spin = () => {
    if (busy || !ctx.charge(stake, 'Шторм — ставка')) return
    ctx.bump('storm'); play.whoosh()
    setWin(0); setHit(new Set()); setBusy(true)
    const final = Array.from({ length: 5 }, () => Array.from({ length: 3 }, pickSymbol))
    setStrips(cols.map((cur, c) => [...cur, ...Array.from({ length: 12 }, pickSymbol), ...final[c]]))
    setSpinId(i => i + 1)
    for (let c = 0; c < 5; c++) timers.current.push(window.setTimeout(() => play.stop(), 900 + c * 280))
    timers.current.push(window.setTimeout(() => { setCols(final); setStrips(null); setBusy(false); settle(final) }, 900 + 4 * 280 + 120))
  }
  const settle = (f: string[][]) => {
    const cells = new Set<string>()
    let total = 0
    const lineBet = stake / PAYLINES.length
    for (const line of PAYLINES) {
      const s = f[0][line[0]]
      let run = 1
      while (run < 5 && f[run][line[run]] === s) run++
      if (run >= 3) { total += lineBet * STORM_PAY(s, run); for (let i = 0; i < run; i++) cells.add(`${i},${line[i]}`) }
    }
    total = Math.floor(total)
    setHit(cells); setWin(total)
    if (total > 0) { ctx.pay(total, 'Шторм — выигрыш'); if (total >= stake * 5) play.big() } else ctx.notify('Комбинация не собрана')
  }
  return (
    <div className="storm">
      <div className="reels5">
        {cols.map((col, c) => (
          <div key={c} className="reel-win">
            {strips ? (
              <div key={spinId} className="strip run" style={{ ['--end' as string]: `${-(strips[c].length - 3) * PITCH}px`, ['--dur' as string]: `${0.9 + c * 0.28}s` }}>
                {strips[c].map((s, i) => <div key={i} className="cell">{s}</div>)}
              </div>
            ) : (
              <div className="strip">{col.map((s, r) => <div key={r} className={`cell ${hit.has(`${c},${r}`) ? 'hit' : ''}`}>{s}</div>)}</div>
            )}
          </div>
        ))}
        {win > 0 && <Burst key={win} type="gold" n={80} />}
      </div>
      {win > 0 ? <Result good>Выигрыш +{money(shown)}</Result> : <p className="m small center">9 линий, выигрыш от 3 одинаковых символов слева направо. Ставка делится на линии.</p>}
      <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} disabled={busy} />
      <button className="cta" disabled={busy} onClick={spin}>{busy ? 'Барабаны крутятся…' : `Спин · ${money(stake)}`}</button>
    </div>
  )
}

// ---------- БЫСТРЫЕ СЛОТЫ (3 барабана) ----------
export function Slots({ ctx }: { ctx: Ctx }) {
  const [stake, setStake] = useState(20)
  const [reels, setReels] = useState(['💎', '7⭐', '🍀'])
  const [stopped, setStopped] = useState([true, true, true])
  const [busy, setBusy] = useState(false)
  const [win, setWin] = useState<number | null>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(t => { clearTimeout(t); clearInterval(t) }), [])
  const shown = useCount(win || 0)
  const spin = () => {
    if (busy || !ctx.charge(stake, 'Слоты — ставка')) return
    ctx.bump('slots'); play.whoosh()
    setBusy(true); setWin(null); setStopped([false, false, false])
    const final = [pickSymbol(), pickSymbol(), pickSymbol()]
    const st = [false, false, false]
    const iv = window.setInterval(() => setReels(r => r.map((s, i) => st[i] ? s : pickSymbol())), 60)
    timers.current.push(iv)
    final.forEach((s, i) => timers.current.push(window.setTimeout(() => {
      st[i] = true; play.stop()
      setReels(r => r.map((x, j) => j === i ? s : x)); setStopped([...st])
      if (i === 2) {
        clearInterval(iv)
        const w = final[0] === final[1] && final[1] === final[2] ? Math.floor(stake * SLOT3_PAY(final[0])) : 0
        setWin(w); setBusy(false)
        if (w > 0) { ctx.pay(w, 'Слоты — выигрыш'); play.big() } else ctx.notify('Комбинация не собрана')
      }
    }, 700 + i * 380)))
  }
  return (
    <div className="storm">
      <div className="reels three">
        {reels.map((s, i) => <div key={i} className={`cell big ${stopped[i] ? 'pop' : 'blur'} ${win ? 'hit' : ''}`}>{s}</div>)}
        {!!win && <Burst key={win} type="gold" n={90} />}
      </div>
      {win ? <Result good>Выигрыш +{money(shown)}</Result> : <p className="m small center">Три одинаковых символа дают выигрыш. Самый редкий — 💎.</p>}
      <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} disabled={busy} presets={[5, 20, 100, 500]} />
      <button className="cta" disabled={busy} onClick={spin}>{busy ? 'Крутится…' : `Спин · ${money(stake)}`}</button>
    </div>
  )
}

// ---------- КЕЙС (лента-рулетка) ----------
const CELL = 100
export function Cases({ ctx }: { ctx: Ctx }) {
  const [phase, setPhase] = useState<'idle' | 'shake' | 'roll' | 'done'>('idle')
  const [strip, setStrip] = useState<GiftKind[]>(() => Array.from({ length: 12 }, () => CASE.pool[rint(CASE.pool.length)]))
  const [x, setX] = useState(0)
  const [anim, setAnim] = useState(false)
  const [got, setGot] = useState<Gift | null>(null)
  const view = useRef<HTMLDivElement>(null)
  const track = useRef<HTMLDivElement>(null)
  const timers = useRef<number[]>([])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  useEffect(() => {
    if (phase !== 'roll') return
    let raf = 0, last = -1
    const f = () => {
      const m = matrixOf(track.current)
      if (m) { const idx = Math.floor((-m[4] + (view.current?.clientWidth || 0) / 2) / CELL); if (idx !== last) { last = idx; play.tick() } }
      raf = requestAnimationFrame(f)
    }
    raf = requestAnimationFrame(f)
    return () => cancelAnimationFrame(raf)
  }, [phase])

  const open = () => {
    if ((phase === 'shake' || phase === 'roll') || !ctx.charge(CASE.price, 'Кейс — открытие')) return
    ctx.bump('cases')
    const kind = weighted(CASE.pool, CASE.weights)
    const WIN = 36
    const s = Array.from({ length: 44 }, () => CASE.pool[rint(CASE.pool.length)])
    s[WIN] = kind
    setGot(null); setAnim(false); setX(0); setStrip(s); setPhase('shake'); play.whoosh()
    timers.current.push(window.setTimeout(() => {
      const vw = view.current?.clientWidth || 340
      const final = -(WIN * CELL + CELL / 2 - vw / 2 + (rnd() - 0.5) * (CELL * 0.6))
      setPhase('roll'); setAnim(true); setX(final)
    }, 700))
    timers.current.push(window.setTimeout(() => {
      setGot(ctx.addGift(kind, 'Кейс — подарок')); setPhase('done'); play.big()
    }, 700 + 5400))
  }
  const busy = phase === 'shake' || phase === 'roll'
  return (
    <div className="cases">
      <div className={`roll-view ${phase}`} ref={view}>
        <div className="roll-marker" />
        <div ref={track} className="roll-track" style={{ transform: `translateX(${x}px)`, transition: anim ? 'transform 5.2s cubic-bezier(.08,.6,.06,1)' : 'none' }}>
          {strip.map((k, i) => (
            <div key={i} className={`roll-cell ${phase === 'done' && i === 36 ? 'won' : ''}`} style={{ width: CELL }}>
              <GiftArt kind={k} size={76} />
            </div>
          ))}
        </div>
        {phase === 'done' && <Burst key="d" type="confetti" n={90} />}
      </div>
      {got
        ? <Result good>Выпало: {GIFTS[got.kind]?.name} #{got.num} · ≈{money(ctx.save.prices[got.kind])} монет</Result>
        : <p className="m small center">Внутри один из {CASE.pool.length} подарков. Чаще всего {GIFTS[CASE.pool[0]]?.name} ({caseChance(0).toFixed(0)}%), реже всего {GIFTS[CASE.pool[CASE.pool.length - 1]]?.name} ({caseChance(CASE.pool.length - 1).toFixed(2).replace('.', ',')}%).</p>}
      <button className="cta" disabled={busy} onClick={open}>{busy ? 'Открываем…' : `Открыть · ${CASE.price}`}</button>
    </div>
  )
}

// ---------- МИНЫ ----------
export function Mines({ ctx }: { ctx: Ctx }) {
  const [stake, setStake] = useState(50)
  const [bombs, setBombs] = useState<Set<number> | null>(null)
  const [open, setOpen] = useState<number[]>([])
  const [over, setOver] = useState<'none' | 'boom' | 'cash'>('none')
  const active = !!bombs && over === 'none'
  const mult = minesMult(open.length)
  const start = () => {
    if (!ctx.charge(stake, 'Мины — ставка')) return
    ctx.bump('mines'); play.click()
    const b = new Set<number>()
    while (b.size < MINES_COUNT) b.add(rint(MINES_TOTAL))
    setBombs(b); setOpen([]); setOver('none')
  }
  const tap = (i: number) => {
    if (!active || open.includes(i)) return
    setOpen(o => [...o, i])
    if (bombs!.has(i)) { setOver('boom'); play.boom(); play.lose(); ctx.notify('Мина! Ставка сгорела'); return }
    play.flip(); play.coin()
    if (open.length + 1 === MINES_TOTAL - MINES_COUNT) cashOut(open.length + 1)
  }
  const cashOut = (k = open.length) => {
    if (!active || k === 0) return
    setOver('cash'); ctx.pay(Math.floor(stake * minesMult(k)), 'Мины — выигрыш')
  }
  return (
    <div className="mines">
      <div className={`mgrid ${over === 'boom' ? 'shake-grid' : ''}`}>
        {Array.from({ length: MINES_TOTAL }, (_, i) => {
          const isOpen = open.includes(i), isBomb = !!bombs?.has(i), reveal = over !== 'none' && !isOpen
          const flipped = isOpen || reveal
          return (
            <button key={i} disabled={!active} onClick={() => tap(i)} className={`mcell ${flipped ? 'flip' : ''} ${reveal ? 'ghost' : ''}`} aria-label={`Клетка ${i + 1}`}>
              <span className="min">
                <span className="front" />
                <span className={`back ${isBomb ? 'bomb' : 'safe'}`}>{isBomb ? '💣' : '💎'}</span>
              </span>
            </button>
          )
        })}
        {over === 'boom' && <Burst key="boom" type="ember" n={80} />}
        {over === 'cash' && <Burst key="cash" type="gold" n={80} />}
      </div>
      <p className="m small center">Мин: {MINES_COUNT}. Сейчас ×{mult.toFixed(2)}{active && open.length ? ` · забрать ${money(Math.floor(stake * mult))}` : ''}</p>
      {over === 'cash' && <Result good>Забрано +{money(Math.floor(stake * mult))}</Result>}
      <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} disabled={active} />
      {active
        ? <button className="cta green" disabled={!open.length} onClick={() => cashOut()}>Забрать {money(Math.floor(stake * mult))}</button>
        : <button className="cta" onClick={start}>{bombs ? 'Новый раунд' : 'Начать'} · {money(stake)}</button>}
    </div>
  )
}

// ---------- PLINKO (отскоки по колышкам) ----------
export function Plinko({ ctx }: { ctx: Ctx }) {
  const ROWS = 8, W = 300, SX = 30, SY = 25, TOP = 28
  const [stake, setStake] = useState(50)
  const [ball, setBall] = useState<{ x: number; y: number; s: number } | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const [landed, setLanded] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const raf = useRef(0)
  useEffect(() => () => cancelAnimationFrame(raf.current), [])
  const pegX = (r: number, c: number) => W / 2 + (c - (r + 1) / 2) * SX   // ряд r содержит r+2 колышка
  const pegY = (r: number) => TOP + r * SY
  const drop = () => {
    if (busy || !ctx.charge(stake, 'Plinko — ставка')) return
    ctx.bump('plinko'); play.whoosh()
    setBusy(true); setLanded(null); setHot(null)
    const steps: (0 | 1)[] = Array.from({ length: ROWS }, () => (rnd() < 0.5 ? 0 : 1) as 0 | 1)
    const slot = steps.reduce<number>((a, b) => a + b, 0)
    // точки: старт сверху, затем между колышками каждого ряда
    const pts: { x: number; y: number }[] = [{ x: W / 2, y: 4 }]
    let k = 0
    for (let r = 0; r < ROWS; r++) { k += steps[r]; pts.push({ x: pegX(r, k) + (steps[r] ? 0 : 0), y: pegY(r) - 9 }) }
    pts.push({ x: W / 2 + (slot - ROWS / 2) * (W / (ROWS + 1)), y: pegY(ROWS - 1) + 24 })
    const HOP = 190
    const t0 = performance.now()
    const f = (now: number) => {
      const t = (now - t0) / HOP, i = Math.min(pts.length - 2, Math.floor(t)), u = Math.min(1, t - i)
      const a = pts[i], b = pts[i + 1]
      const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u - Math.sin(u * Math.PI) * 9
      if (i + 1 !== (ball?.s ?? -1)) { /* тик на каждый колышек */ }
      setBall({ x, y, s: i })
      if (u < 0.12 && i > 0 && i <= ROWS) { setHot(`${i - 1}`); play.tick() }
      if (t >= pts.length - 1) {
        setBall(null); setLanded(slot); setBusy(false)
        const w = Math.floor(stake * PLINKO_MULTS[slot])
        if (w > 0) { ctx.pay(w, 'Plinko — выигрыш'); if (PLINKO_MULTS[slot] >= 3) play.big() }
        return
      }
      raf.current = requestAnimationFrame(f)
    }
    raf.current = requestAnimationFrame(f)
  }
  return (
    <div className="plinko">
      <svg viewBox="0 0 300 250" className="pboard" aria-hidden="true">
        {Array.from({ length: ROWS }, (_, r) => Array.from({ length: r + 2 }, (_, c) =>
          <circle key={`${r}-${c}`} cx={pegX(r, c)} cy={pegY(r)} r={hot === `${r}` ? 5 : 3.2} fill={hot === `${r}` ? '#FFE08A' : '#7a85c8'} />))}
        {ball && <><circle cx={ball.x} cy={ball.y} r="9" fill="#FFC24B" opacity=".25" /><circle cx={ball.x} cy={ball.y} r="6.5" fill="url(#pb)" /></>}
        <defs><radialGradient id="pb" cx=".35" cy=".3"><stop offset="0" stopColor="#fff6d0" /><stop offset="1" stopColor="#f0a21b" /></radialGradient></defs>
      </svg>
      <div className="bins">{PLINKO_MULTS.map((m, i) => <span key={i} className={`${landed === i ? 'on' : ''} ${m >= 3 ? 'hi' : m < 1 ? 'lo' : ''}`}>{m}×</span>)}</div>
      {landed !== null && <Result good={PLINKO_MULTS[landed] >= 1}>×{PLINKO_MULTS[landed]} · {PLINKO_MULTS[landed] >= 1 ? '+' : ''}{money(Math.floor(stake * PLINKO_MULTS[landed]))}</Result>}
      <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} disabled={busy} />
      <button className="cta" disabled={busy} onClick={drop}>{busy ? 'Шар падает…' : `Бросить · ${money(stake)}`}</button>
    </div>
  )
}

// ---------- БЛЭКДЖЕК ----------
type Card = { r: string; v: number; s: string }
const mkDeck = (): Card[] => {
  const d: Card[] = []
  for (const s of ['♠', '♥', '♦', '♣']) for (const [r, v] of [['A', 11], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6], ['7', 7], ['8', 8], ['9', 9], ['10', 10], ['J', 10], ['Q', 10], ['K', 10]] as [string, number][]) d.push({ r, v, s })
  for (let i = d.length - 1; i > 0; i--) { const j = rint(i + 1); [d[i], d[j]] = [d[j], d[i]] }
  return d
}
const score = (h: Card[]) => {
  let t = h.reduce((a, c) => a + c.v, 0), aces = h.filter(c => c.r === 'A').length
  while (t > 21 && aces) { t -= 10; aces-- }
  return t
}
const CardView = ({ c, hidden, i }: { c: Card; hidden?: boolean; i: number }) =>
  <div className={`pcard deal ${hidden ? 'back' : c.s === '♥' || c.s === '♦' ? 'red' : ''}`} style={{ animationDelay: `${i * 0.12}s` }}>{hidden ? '' : <>{c.r}<small>{c.s}</small></>}</div>

export function Blackjack({ ctx }: { ctx: Ctx }) {
  const [stake, setStake] = useState(50)
  const [deck, setDeck] = useState<Card[]>([])
  const [pl, setPl] = useState<Card[]>([])
  const [de, setDe] = useState<Card[]>([])
  const [phase, setPhase] = useState<'bet' | 'play' | 'done'>('bet')
  const [msg, setMsg] = useState('')
  const [locked, setLocked] = useState(0)
  const finish = (p: Card[], d: Card[], bet: number, natural = false) => {
    const ps = score(p), ds = score(d)
    let pay = 0, text = ''
    if (ps > 21) text = 'Перебор'
    else if (natural && ds !== 21) { pay = Math.floor(bet * 2.5); text = 'Блэкджек!' }
    else if (ds > 21 || ps > ds) { pay = bet * 2; text = 'Победа' }
    else if (ps === ds) { pay = bet; text = 'Ничья, ставка возвращена' }
    else text = 'Проигрыш'
    setMsg(text); setPhase('done')
    if (pay > bet) play.big(); else if (pay === 0) play.lose()
    if (pay > 0) ctx.pay(pay, `Блэкджек — ${text.toLowerCase()}`)
  }
  const deal = () => {
    if (!ctx.charge(stake, 'Блэкджек — ставка')) return
    ctx.bump('blackjack'); play.flip()
    const d = mkDeck()
    const p = [d.pop()!, d.pop()!], dl = [d.pop()!, d.pop()!]
    setDeck(d); setPl(p); setDe(dl); setLocked(stake); setMsg(''); setPhase('play')
    if (score(p) === 21) finish(p, dl, stake, true)
  }
  const hit = () => {
    const d = [...deck], p = [...pl, d.pop()!]
    play.flip(); setDeck(d); setPl(p)
    if (score(p) >= 21) stand(p, d)
  }
  const stand = (p = pl, d0 = deck) => {
    const d = [...d0], dl = [...de]
    while (score(dl) < 17) dl.push(d.pop()!)
    setDe(dl); setDeck(d); finish(p, dl, locked)
  }
  return (
    <div className="bj">
      <div className="felt">
        <div className="hand"><span className="m small">Дилер {phase === 'play' ? '' : de.length ? score(de) : ''}</span>
          <div className="cards">{de.map((c, i) => <CardView key={`${phase === 'play' ? 'p' : 'r'}${i}${c.r}${c.s}`} c={c} hidden={phase === 'play' && i === 1} i={i} />)}</div></div>
        <div className="hand"><span className="m small">Ты {pl.length ? score(pl) : ''}</span>
          <div className="cards">{pl.map((c, i) => <CardView key={`${i}${c.r}${c.s}`} c={c} i={i} />)}</div></div>
      </div>
      {msg && <Result good={/Победа|Блэкджек/.test(msg)}>{msg}</Result>}
      {phase !== 'play' && <StakeInput value={stake} onChange={setStake} balance={ctx.save.balance} />}
      {phase === 'play'
        ? <div className="two"><button className="cta ghost" onClick={hit}>Ещё</button><button className="cta" onClick={() => stand()}>Хватит</button></div>
        : <button className="cta" onClick={deal}>Раздать · {money(stake)}</button>}
      <p className="m small center">Блэкджек платит 3:2, дилер берёт до 17.</p>
    </div>
  )
}

// ---------- ОСОБНЯК ----------
export function Mansion({ ctx }: { ctx: Ctx }) {
  const COST = 30, PRIZE = 85
  const [prize, setPrize] = useState<number | null>(null)
  const [picked, setPicked] = useState<number | null>(null)
  const start = useCallback(() => { setPrize(null); setPicked(null) }, [])
  const choose = (i: number) => {
    if (picked !== null) return
    if (!ctx.charge(COST, 'Особняк — попытка')) return
    ctx.bump('mansion'); play.click()
    const p = rint(3)
    setPrize(p); setPicked(i)
    window.setTimeout(() => { if (p === i) ctx.pay(PRIZE, 'Особняк — находка'); else { ctx.notify('За дверью пусто'); play.lose() } }, 500)
  }
  return (
    <div className="mansion">
      <p className="m small center">Попытка стоит {COST}. За одной из трёх дверей награда {PRIZE}.</p>
      <div className="doors">
        {[0, 1, 2].map(i => {
          const open = picked !== null
          return (
            <button key={i} disabled={open} onClick={() => choose(i)} className={`door ${open ? 'open' : ''} ${open && i === prize ? 'win' : ''} ${open && i === picked && i !== prize ? 'lose' : ''}`}>
              <span className="behind">{open ? (i === prize ? '💰' : '🕸️') : ''}</span>
              <span className="panel"><i className="knob" /></span>
              <small>Дверь {i + 1}</small>
              {open && i === prize && picked === prize && <Burst key="g" type="gold" n={60} />}
            </button>
          )
        })}
      </div>
      {picked !== null && <><Result good={picked === prize}>{picked === prize ? `Нашёл! +${PRIZE}` : 'Пусто. Попробуй ещё раз'}</Result><button className="cta" onClick={start}>Ещё раз</button></>}
    </div>
  )
}
export { SYMBOLS }
