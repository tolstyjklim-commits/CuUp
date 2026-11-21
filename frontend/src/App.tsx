import { sfx, play } from './sfx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, Gamepad2, Gift, ListChecks, Package, UserRound, Volume2, VolumeX, X } from 'lucide-react'
import { Coin, GiftArt } from './art'
import {
  Blackjack, Cases, Crash, Mansion, Mines, Plinko, Slots, Storm, Upgrade, type Ctx,
} from './games'
import {
  CASE, FLAGS, GIFTS, GIFT_ORDER, COINS_PER_TON, SELL_RATE, STARS_TO_COINS, dateNow, defaultSave, defsFromImport, defsFromNft, loadSave, mergeCatalog, mergeNft, money, persist, setCatalog, todayKey, uid, walkPrices,
  type ImportedGift, type NftCollection,
  type Gift as GiftT, type GiftKind, type Save, type Tx,
} from './lib'

type Tab = 'Игры' | 'Кейсы' | 'Подарки' | 'Задания' | 'Профиль'
type GameId = 'upgrade' | 'storm' | 'rocket' | 'slots' | 'cases' | 'mansion' | 'mines' | 'blackjack' | 'plinko' | 'racing' | 'launch'
type GameDef = { id: GameId; name: string; image: string; players: string; tag?: string; desc: string; soon?: boolean }

const tabs: { label: Tab; icon: typeof Gamepad2 }[] = [
  { label: 'Игры', icon: Gamepad2 }, { label: 'Кейсы', icon: Package }, { label: 'Подарки', icon: Gift },
  { label: 'Задания', icon: ListChecks }, { label: 'Профиль', icon: UserRound },
]
const games: GameDef[] = [
  { id: 'upgrade', name: 'Апгрейд', image: 'upgrade', players: '1 240', tag: 'HOT', desc: 'Обменяй подарок на более редкий' },
  { id: 'storm', name: 'Шторм', image: 'storm', players: '3 410', tag: 'X500', desc: 'Слот 5×3, девять линий' },
  { id: 'rocket', name: 'Ракета', image: 'rocket', players: '2 080', tag: 'LIVE', desc: 'Забери множитель до вылета' },
  { id: 'cases', name: 'Кейсы', image: 'cases', players: '117', tag: 'NEW', desc: 'Открой кейс, получи подарок' },
  { id: 'slots', name: 'Быстрые слоты', image: 'cases', players: '284', desc: 'Три барабана, один спин' },
  { id: 'mines', name: 'Мины', image: 'mines', players: '29', desc: 'Открывай клетки, избегай мин' },
  { id: 'plinko', name: 'Plinko', image: 'storm', players: '15', desc: 'Шар падает на множитель' },
  { id: 'blackjack', name: 'Блэкджек', image: 'cases', players: '10', desc: 'Набери 21 очко' },
  { id: 'mansion', name: 'Особняк', image: 'mansion', players: '27', desc: 'Найди награду за дверью' },
  { id: 'racing', name: 'Гонки', image: 'racing', players: '42', desc: 'Скоро', soon: true },
  { id: 'launch', name: 'Запуск', image: 'launch', players: '63', desc: 'Скоро', soon: true },
]
const TITLES: Record<string, string> = Object.fromEntries(games.map(g => [g.id, g.name]))

const DAILY = [50, 60, 70, 80, 100, 120, 200]
const TASKS: { id: string; title: string; hint: () => string; stat: string; target: number; reward: number }[] = [
  { id: 'crash3', title: '3 раунда в Ракете', hint: () => 'Любая ставка', stat: 'crash', target: 3, reward: 80 },
  { id: 'rounds10', title: '10 раундов в играх', hint: () => 'Любые игры', stat: 'rounds', target: 10, reward: 150 },
  { id: 'case1', title: 'Открыть кейс', hint: () => `Стоит ${CASE.price}`, stat: 'cases', target: 1, reward: 100 },
  { id: 'upg1', title: 'Сделать апгрейд', hint: () => 'Успешный или нет', stat: 'upgrades', target: 1, reward: 120 },
  { id: 'trade1', title: 'Купить или продать подарок', hint: () => 'На маркете', stat: 'trades', target: 1, reward: 60 },
]

export default function App() {
  const [save, setSave] = useState<Save>(() => { const s = loadSave(); setCatalog(s.catalog); return s })
  const S = useRef(save)
  const [tab, setTab] = useState<Tab>('Игры')
  const [game, setGame] = useState<GameId | null>(null)
  const [seed, setSeed] = useState<string | null>(null)
  const [notice, setNotice] = useState('')
  const [sound, setSound] = useState(() => localStorage.getItem('qcup-sound') === '1')
  const [confetti, setConfetti] = useState(0)

  const commit = useCallback((f: (s: Save) => Save) => {
    const next = f(S.current)
    if (next.catalog !== S.current.catalog) setCatalog(next.catalog)
    S.current = next
    setSave(next)
    persist(next)
  }, [])

  // Импорт настоящих подарков Telegram: public/gifts/catalog.json (создаётся скриптом import-gifts)
  useEffect(() => {
    fetch('./gifts/catalog.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : null))
      .then((j: { gifts?: ImportedGift[]; updated?: string } | null) => {
        if (!j?.gifts?.length) return
        if ((j as { demo?: boolean }).demo) FLAGS.demo = true
        const defs = defsFromImport(j.gifts.map(g => ({ ...g, thumb: g.thumb ? `./gifts/${g.thumb}` : null, anim: g.anim ? `./gifts/${g.anim}` : null })))
        const ids = Object.keys(defs)
        if (!ids.length) return
        const sig = `${j.updated || ''}:${ids.length}`
        if (localStorage.getItem('qcup-catalog-sig') === sig && S.current.catalog[ids[0]]) return
        localStorage.setItem('qcup-catalog-sig', sig)
        commit(s => mergeCatalog(s, defs))
        setNotice(FLAGS.demo ? `Загружены демо-подарки: ${ids.length}` : `Импортировано подарков Telegram: ${ids.length}`)
      })
      .catch(() => { /* каталога нет — работаем со встроенным набором */ })
  }, [commit])

  // Автоподгрузка NFT-подарков с флор-ценами: бэкенд (/api/nft/floors) или статичный public/gifts/nft.json
  useEffect(() => {
    let dead = false
    const API = (import.meta as any).env?.VITE_API_URL as string | undefined
    const load = async () => {
      const sources = [API ? `${API}/api/nft/floors` : '', './gifts/nft.json'].filter(Boolean)
      for (const url of sources) {
        try {
          const r = await fetch(url, { cache: 'no-cache' })
          if (!r.ok) continue
          const j = (await r.json()) as { collections?: NftCollection[]; demo?: boolean }
          if (j.demo) FLAGS.demo = true
          const cols = (j.collections || []).map(c => (j.demo ? { ...c, floorTon: c.floorTon * (1 + (Math.random() - 0.5) * 0.08) } : c))
          const defs = defsFromNft(cols)
          if (dead || !Object.keys(defs).length) continue
          commit(s => mergeNft(s, defs))
          return
        } catch { /* пробуем следующий источник */ }
      }
    }
    load()
    const t = window.setInterval(load, FLAGS.demo ? 30_000 : 5 * 60_000)
    return () => { dead = true; clearInterval(t) }
  }, [commit])

  const user = (window as any).Telegram?.WebApp?.initDataUnsafe?.user
  const displayName: string = user?.first_name || 'Игрок'

  useEffect(() => { localStorage.setItem('qcup-sound', sound ? '1' : '0'); sfx.enabled = sound }, [sound])
  useEffect(() => {
    if (!notice) return
    const t = window.setTimeout(() => setNotice(''), 3200)
    return () => clearTimeout(t)
  }, [notice])
  // Цены на маркете плавно меняются раз в 20 секунд
  useEffect(() => {
    const t = window.setInterval(() => commit(s => ({ ...s, prices: walkPrices(s.prices) })), 20000)
    return () => clearInterval(t)
  }, [commit])

  const beep = useCallback((f: number, _ms?: number) => { if (f < 300) play.lose(); else if (f > 800) play.coin(); else play.click() }, [])

  const ctx: Ctx = useMemo(() => {
    const tx = (title: string, amount: number): Tx => ({ id: uid(), title, amount, date: dateNow() })
    return {
      save,
      notify: setNotice,
      charge: (cost, title, countRound = true) => {
        if (!(cost > 0) || !Number.isFinite(cost)) return false
        if (S.current.balance < cost) { setNotice('Не хватает монет'); beep(150, 200); return false }
        commit(s => ({
          ...s, balance: s.balance - cost,
          tx: [tx(title, -cost), ...s.tx].slice(0, 60),
          stats: { ...s.stats, rounds: (s.stats.rounds || 0) + (countRound ? 1 : 0) },
        }))
        beep(380, 80)
        return true
      },
      pay: (amount, title) => {
        if (!(amount > 0)) return
        commit(s => ({ ...s, balance: s.balance + amount, tx: [tx(title, amount), ...s.tx].slice(0, 60) }))
        setConfetti(c => c + 1); setNotice(`${title}: +${money(amount)}`); beep(880, 220)
      },
      addGift: (kind, title) => {
        const gift: GiftT = { uid: uid(), kind, num: S.current.nextNum }
        commit(s => ({ ...s, gifts: [...s.gifts, gift], nextNum: s.nextNum + 1 + Math.floor(Math.random() * 40), tx: [tx(`${title}: ${GIFTS[kind]?.name}`, 0), ...s.tx].slice(0, 60) }))
        setConfetti(c => c + 1); beep(988, 260)
        return gift
      },
      removeGift: id => commit(s => ({ ...s, gifts: s.gifts.filter(g => g.uid !== id) })),
      bump: key => commit(s => ({ ...s, stats: { ...s.stats, [key]: (s.stats[key] || 0) + 1 } })),
    }
  }, [save, commit, beep])

  const openGame = (id: GameId, seedUid: string | null = null) => { setSeed(seedUid); setGame(id) }
  const dailyReady = save.daily.last !== todayKey()

  // ---- маркет ----
  const buy = (k: GiftKind) => {
    const price = S.current.prices[k]
    if (S.current.balance < price) return setNotice('Не хватает монет')
    ctx.charge(price, `Покупка: ${GIFTS[k]?.name}`, false)
    ctx.bump('trades')
    const g = ctx.addGift(k, 'Покупка')
    setNotice(`Куплено: ${GIFTS[k]?.name} #${g.num}`)
  }
  const sell = (g: GiftT) => {
    const price = Math.floor(S.current.prices[g.kind] * SELL_RATE)
    ctx.removeGift(g.uid)
    ctx.bump('trades')
    ctx.pay(price, `Продажа: ${GIFTS[g.kind]?.name}`)
  }
  // ---- задания ----
  const claimDaily = () => {
    if (!dailyReady) return
    const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10)
    const streak = save.daily.last === yesterday ? (save.daily.streak % 7) + 1 : 1
    commit(s => ({ ...s, daily: { last: todayKey(), streak } }))
    ctx.pay(DAILY[streak - 1], `Награда дня (день ${streak})`)
  }
  const claimTask = (t: (typeof TASKS)[number]) => {
    if (save.tasks[t.id] || (save.stats[t.stat] || 0) < t.target) return
    commit(s => ({ ...s, tasks: { ...s.tasks, [t.id]: true } }))
    ctx.pay(t.reward, `Задание: ${t.title}`)
  }
  const reset = () => {
    if (!window.confirm('Сбросить весь прогресс?')) return
    const d = defaultSave(); S.current = d; setSave(d); persist(d); setNotice('Прогресс сброшен')
  }

  const view = (g: GameId) => {
    switch (g) {
      case 'rocket': return <Crash ctx={ctx} />
      case 'upgrade': return <Upgrade ctx={ctx} seed={seed} />
      case 'storm': return <Storm ctx={ctx} />
      case 'slots': return <Slots ctx={ctx} />
      case 'cases': return <Cases ctx={ctx} />
      case 'mines': return <Mines ctx={ctx} />
      case 'plinko': return <Plinko ctx={ctx} />
      case 'blackjack': return <Blackjack ctx={ctx} />
      case 'mansion': return <Mansion ctx={ctx} />
      default: return <p className="m center">Режим появится позже.</p>
    }
  }

  const header = (
    <header className="topbar">
      {game
        ? <button className="back-btn" onClick={() => setGame(null)} aria-label="Назад"><ChevronLeft size={20} /><span>{TITLES[game]}</span></button>
        : <button className="brand" onClick={() => setTab('Игры')}><span className="brand-word">Qc<span>Up</span></span></button>}
      <div className="top-actions">
        <button className="settings-btn" aria-label="Звук" onClick={() => setSound(s => !s)}>{sound ? <Volume2 size={16} /> : <VolumeX size={16} />}</button>
        <button className="balance-pill" onClick={() => { setGame(null); setTab('Профиль') }}><Coin /><b>{money(save.balance)}</b></button>
        <button className="avatar" onClick={() => { setGame(null); setTab('Профиль') }} aria-label="Профиль">
          {user?.photo_url ? <img src={user.photo_url} alt="" /> : displayName.slice(0, 1).toUpperCase()}
        </button>
      </div>
    </header>
  )

  return <main className="app-shell">
    <div className="bg-glow" />
    {header}

    {game ? <section className="game-view">{view(game)}</section> : <>
      {tab === 'Игры' && <>
        <button className={`daily-banner ${dailyReady ? 'ready' : ''}`} onClick={() => setTab('Задания')}>
          <div><b>Награда дня</b><span>{dailyReady ? 'Можно забрать' : 'Уже получена, приходи завтра'} · день {Math.max(1, save.daily.streak)} из 7</span></div>
          <i>{dailyReady ? 'Забрать' : '✓'}</i>
        </button>
        <section className="game-grid">
          {games.map(g => (
            <button className={`game-card${g.soon ? ' coming' : ''}`} key={g.id} onClick={() => g.soon ? setNotice('Этот режим скоро появится') : openGame(g.id)}>
              <div className="card-art-wrap"><img src={`./games/${g.image}.webp`} alt="" /><div className="card-glare" /></div>
              {!g.soon && <span className="players"><i /> {g.players} играют</span>}
              {g.tag && <span className={`game-tag ${g.tag}`}>{g.tag}</span>}
              <b>{g.name}</b><p className="card-desc">{g.desc}</p>
            </button>
          ))}
        </section>
      </>}

      {tab === 'Кейсы' && <section className="page-section">
        <h1>Кейсы</h1><p className="muted">Из кейса выпадает подарок. Его можно оставить, продать или улучшить.</p>
        <div className="feature-case"><img src="./games/cases.webp" alt="" />
          <div><span className="eyebrow">Кейс новичка</span><h2>{CASE.price} монет</h2><p>Шансы и средняя ценность указаны внутри.</p>
            <button className="primary-btn" onClick={() => openGame('cases')}>Открыть кейс</button></div></div>
      </section>}

      {tab === 'Подарки' && <GiftsTab save={save} ctx={ctx} onBuy={buy} onSell={sell} onUpgrade={uid => openGame('upgrade', uid)} />}

      {tab === 'Задания' && <section className="page-section">
        <h1>Задания</h1>
        <div className="daily-card">
          <div className="daily-top"><b>Награда дня</b><span className="m small">Серия: {save.daily.streak} из 7</span></div>
          <div className="daily-days">{DAILY.map((r, i) => <span key={i} className={i < save.daily.streak ? 'done' : ''}><small>{i + 1}</small>{r}</span>)}</div>
          <button className="primary-btn wide" disabled={!dailyReady} onClick={claimDaily}>{dailyReady ? 'Забрать награду' : 'Получено, приходи завтра'}</button>
        </div>
        <div className="week-note m small">Лучшие по рейтингу недели получают настоящие подарки Telegram. Монеты и подарки внутри игры вывести нельзя.</div>
        {TASKS.map(t => {
          const p = Math.min(t.target, save.stats[t.stat] || 0), done = !!save.tasks[t.id], ready = p >= t.target && !done
          return <div className="task-card" key={t.id}>
            <div><b>{t.title}</b><small>{t.hint()}</small>
              <div className="bar"><i style={{ width: `${(p / t.target) * 100}%` }} /></div></div>
            <strong>{p}/{t.target}</strong>
            <button disabled={!ready} onClick={() => claimTask(t)}>{done ? 'Готово' : `+${t.reward}`}</button>
          </div>
        })}
      </section>}

      {tab === 'Профиль' && <section className="page-section">
        <div className="profile-head"><div className="profile-avatar">{user?.photo_url ? <img src={user.photo_url} alt="" /> : displayName.slice(0, 1).toUpperCase()}</div>
          <div><h1>{displayName}</h1><p className="muted">{user?.username ? '@' + user.username : 'Гость'}</p></div></div>
        <div className="stats-row">
          <div><b>{money(save.balance)}</b><small>Монеты</small></div>
          <div><b>{save.gifts.length}</b><small>Подарков</small></div>
          <div><b>{save.stats.rounds || 0}</b><small>Раундов</small></div>
        </div>
        <h2 className="section-title">Операции</h2>
        <TransactionList items={save.tx.slice(0, 20)} />
        <p className="fine-print">Монеты и подарки существуют только внутри игры: их нельзя купить, вывести или обменять на деньги, звёзды или настоящие подарки Telegram. Прогресс хранится в этом браузере.</p>
        <button className="outline-btn" onClick={reset}>Сбросить прогресс</button>
      </section>}

      <nav className="bottom-nav">{tabs.map(({ label, icon: Icon }) =>
        <button key={label} className={tab === label ? 'nav-item active' : 'nav-item'} onClick={() => setTab(label)}>
          <Icon size={17} /><span>{label}</span>{label === 'Задания' && dailyReady && <em className="dot" />}
        </button>)}</nav>
    </>}

    {notice && <button className="toast" onClick={() => setNotice('')}>{notice}<X size={15} /></button>}
    <Confetti count={confetti} key={confetti} />
  </main>
}

function GiftsTab({ save, ctx, onBuy, onSell, onUpgrade }: { save: Save; ctx: Ctx; onBuy: (k: GiftKind) => void; onSell: (g: GiftT) => void; onUpgrade: (uid: string) => void }) {
  const [sub, setSub] = useState<'mine' | 'market'>('mine')
  const [kindF, setKindF] = useState<'gift' | 'nft'>('gift')
  const imported = GIFT_ORDER.some(k => !!GIFTS[k].thumb || /★/.test(GIFTS[k].name))
  const worth = save.gifts.reduce((a, g) => a + save.prices[g.kind], 0)
  return <section className="page-section">
    <h1>Подарки</h1>
    <div className="subtabs"><button className={sub === 'mine' ? 'on' : ''} onClick={() => setSub('mine')}>Мои</button><button className={sub === 'market' ? 'on' : ''} onClick={() => setSub('market')}>Маркет</button></div>
    {sub === 'mine' ? <>
      <div className="gift-sum"><span>{save.gifts.length} подарков</span><span>оценка {money(worth)}</span></div>
      {!save.gifts.length && <div className="empty-history">Пока пусто. Загляни на маркет или открой кейс.</div>}
      {save.gifts.map(g => <div className="gift-row" key={g.uid}>
        <GiftArt kind={g.kind} size={48} />
        <div><b>{GIFTS[g.kind]?.name} #{g.num}</b><small>{GIFTS[g.kind].rarity}</small></div>
        <div className="gift-act"><strong>{money(save.prices[g.kind])}</strong>
          <span><button onClick={() => onUpgrade(g.uid)}>Апгрейд</button><button onClick={() => onSell(g)}>Продать</button></span></div>
      </div>)}
    </> : <>
      <div className="gift-sum"><span>Цена в монетах</span><span>продажа −{Math.round((1 - SELL_RATE) * 100)}%</span></div>
      <div className="subtabs slim"><button className={kindF === 'gift' ? 'on' : ''} onClick={() => setKindF('gift')}>Подарки</button>
        <button className={kindF === 'nft' ? 'on' : ''} onClick={() => setKindF('nft')}>NFT{GIFT_ORDER.some(k => GIFTS[k].nft) ? '' : ' (нет данных)'}</button></div>
      {kindF === 'nft' && !GIFT_ORDER.some(k => GIFTS[k].nft) && <div className="empty-history">NFT пока не загружены. Подключи бэкенд с ключом Gift Asset (см. README) или положи nft.json в public/gifts.</div>}
      {GIFT_ORDER.filter(k => !!GIFTS[k].nft === (kindF === 'nft')).map(k => {
        const p = save.prices[k], o = save.priceOpen.prices[k], d = ((p - o) / o) * 100
        return <div className="gift-row" key={k}>
          <GiftArt kind={k} size={48} />
          <div><b>{GIFTS[k]?.name}</b><small>{GIFTS[k].rarity}</small></div>
          <div className="gift-act"><strong>{money(p)}</strong>{GIFTS[k].nft && <small>≈ {(p / COINS_PER_TON).toFixed(p / COINS_PER_TON < 10 ? 2 : 1).replace('.', ',')} TON</small>}<span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1).replace('.', ',')}% за день</span>
            <span><button disabled={save.balance < p} onClick={() => onBuy(k)}>Купить</button></span></div>
        </div>
      })}
      {FLAGS.demo && <p className="fine-print demo">Демо-данные: иконки, названия и цены NFT сгенерированы для тестов и колеблются случайно. Настоящие появятся после импорта и подключения Gift Asset.</p>}
      <p className="fine-print">{imported
        ? `Каталог импортирован из Telegram: ${GIFT_ORDER.length} подарков, цена в монетах = звёзды × ${STARS_TO_COINS}. Внутриигровые подарки на настоящие не обмениваются.`
        : 'Сейчас встроенный набор. Чтобы подтянуть настоящие подарки Telegram, запусти скрипт import-gifts (см. README).'}</p>
      <p className="fine-print">Цены внутри игры колеблются около базовых значений. {ctx.save.gifts.length ? '' : 'Купи подарок и попробуй апгрейд.'}</p>
    </>}
  </section>
}

function TransactionList({ items }: { items: Tx[] }) {
  if (!items.length) return <div className="empty-history">Пока нет операций</div>
  return <div className="tx-list">{items.map(tx => <div className="tx-row" key={tx.id}>
    <span className={tx.amount >= 0 ? 'tx-icon plus' : 'tx-icon'}>{tx.amount >= 0 ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}</span>
    <div><b>{tx.title}</b><small>{tx.date}</small></div>
    <strong className={tx.amount > 0 ? 'positive' : ''}>{tx.amount === 0 ? 'подарок' : `${tx.amount > 0 ? '+' : ''}${money(tx.amount)}`}</strong>
  </div>)}</div>
}

function Confetti({ count }: { count: number }) {
  const pieces = useMemo(() => count <= 0 ? [] : Array.from({ length: 26 }, () => ({
    x: 50 + (Math.random() - 0.5) * 70, c: `hsl(${Math.floor(Math.random() * 360)},80%,60%)`, s: Math.random() * 6 + 3, d: Math.random() * 0.4,
  })), [count])
  return <div className="confetti-layer">{pieces.map((p, i) => <div key={i} className="confetti-piece" style={{ left: `${p.x}%`, background: p.c, width: p.s, height: p.s, animationDelay: `${p.d}s` }} />)}</div>
}
