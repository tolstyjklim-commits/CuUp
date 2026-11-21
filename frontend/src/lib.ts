// Общие типы, ГСЧ и хранилище прогресса. Все «монеты» и «подарки» внутриигровые:
// их нельзя купить, вывести или обменять на реальные звёзды/подарки Telegram.

export const rnd = (): number => {
  const a = new Uint32Array(1)
  crypto.getRandomValues(a)
  return a[0] / 2 ** 32
}
export const rint = (n: number) => Math.floor(rnd() * n)
export const money = (n: number) => new Intl.NumberFormat('ru-RU').format(Math.round(n))
export const dateNow = () =>
  new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
export const todayKey = () => new Date().toISOString().slice(0, 10)

export function weighted<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = rnd() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]
    if (r < 0) return items[i]
  }
  return items[items.length - 1]
}

export type GiftKind = string
export type GiftDef = {
  name: string; rarity: string; base: number; c1: string; c2: string
  shape: 'hex' | 'heart' | 'ball' | 'star' | 'diamond'
  thumb?: string      // картинка подарка из импорта (public/gifts/…)
  anim?: string       // анимированный стикер (.tgs)
  nft?: boolean       // коллекционный подарок: цена следует за реальным флором
  retired?: boolean   // старый подарок: остаётся у игрока, но не продаётся и не выпадает
}
// Встроенный набор — запасной, пока настоящий каталог не импортирован.
export const FALLBACK_DEFS: Record<string, GiftDef> = {
  sota: { name: 'Сота', rarity: 'Обычный', base: 120, c1: '#FFD58A', c2: '#E8902B', shape: 'hex' },
  heart: { name: 'Сердце', rarity: 'Обычный', base: 200, c1: '#FF9AA6', c2: '#FF4D6A', shape: 'heart' },
  ball: { name: 'Шар', rarity: 'Редкий', base: 450, c1: '#D3C2FF', c2: '#8A5BFF', shape: 'ball' },
  star: { name: 'Звезда', rarity: 'Редкий', base: 800, c1: '#FFE08A', c2: '#F0A21B', shape: 'star' },
  diamond: { name: 'Алмаз', rarity: 'Эпический', base: 2000, c1: '#9FE8FF', c2: '#3D8BFF', shape: 'diamond' },
}
// Живой реестр: заполняется из сохранения (setCatalog), читается везде как раньше.
export const GIFTS: Record<string, GiftDef> = {}
export const GIFT_ORDER: string[] = []           // только активные, от дешёвых к дорогим
export const CASE = { price: 300, weights: [] as number[], pool: [] as string[] } // веса параллельны pool (обычные подарки, без NFT)
export const FLAGS = { demo: false } // true, если загружены демо-данные из public/gifts
export const STARS_TO_COINS = 8
export const COINS_PER_TON = 100 // 1 TON флора = 100 монет

export function setCatalog(defs: Record<string, GiftDef>) {
  for (const k of Object.keys(GIFTS)) delete GIFTS[k]
  Object.assign(GIFTS, defs)
  GIFT_ORDER.length = 0
  GIFT_ORDER.push(...Object.keys(defs).filter(k => !defs[k].retired).sort((a, b) => defs[a].base - defs[b].base))
  // Кейс: только обычные подарки; чем дороже, тем реже; цена даёт RTP ≈ 85%
  const pool = GIFT_ORDER.filter(k => !defs[k].nft)
  const w = pool.map(k => 1 / Math.pow(defs[k].base, 1.4))
  const tw = w.reduce((a, b) => a + b, 0) || 1
  const ev = pool.reduce((a, k, i) => a + (w[i] / tw) * defs[k].base, 0)
  CASE.pool = pool
  CASE.weights = w
  CASE.price = Math.max(50, Math.round(ev / 0.85 / 10) * 10)
}
export const caseChance = (i: number) => {
  const tw = CASE.weights.reduce((a, b) => a + b, 0) || 1
  return (CASE.weights[i] / tw) * 100
}

// ---- импорт настоящих подарков Telegram (public/gifts/catalog.json) ----
export type ImportedGift = { id: string; name?: string; stars: number; emoji?: string; total?: number | null; remaining?: number | null; thumb?: string | null; anim?: string | null }
const hue = (id: string) => { let h = 2166136261; for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0; return (h >>> 7) % 360 }
const SHAPES: GiftDef['shape'][] = ['heart', 'star', 'diamond', 'hex', 'ball']
export function defsFromImport(list: ImportedGift[]): Record<string, GiftDef> {
  const out: Record<string, GiftDef> = {}
  for (const g of list) {
    if (!g.id || !(g.stars > 0)) continue
    const h = hue(g.id)
    out[g.id] = {
      name: g.name || `${g.emoji || '🎁'} ${g.stars}★`,
      rarity: `${g.total ? 'Лимитированный' : g.stars <= 25 ? 'Обычный' : g.stars <= 100 ? 'Редкий' : 'Эпический'}${g.name ? ` · ${g.stars}★` : ''}`,
      base: Math.round(g.stars * STARS_TO_COINS),
      c1: `hsl(${h},85%,74%)`, c2: `hsl(${h},78%,54%)`,
      shape: SHAPES[h % SHAPES.length],
      thumb: g.thumb || undefined,
      anim: g.anim || undefined,
    }
  }
  return out
}
export const SELL_RATE = 0.95 // продажа на маркете: 95% от цены

export type Gift = { uid: string; kind: GiftKind; num: number }
export type Tx = { id: string; title: string; amount: number; date: string }
export type Save = {
  v: 3
  catalog: Record<string, GiftDef>
  balance: number
  gifts: Gift[]
  nextNum: number
  tx: Tx[]
  prices: Record<GiftKind, number>
  priceOpen: { date: string; prices: Record<GiftKind, number> }
  daily: { last: string; streak: number }
  tasks: Record<string, boolean>
  stats: Record<string, number>
}

const KEY = 'qcup-save-v2'
const basePrices = (defs: Record<string, GiftDef>): Record<GiftKind, number> =>
  Object.fromEntries(Object.keys(defs).map(k => [k, defs[k].base]))

export const uid = () => crypto.randomUUID()

export function defaultSave(): Save {
  const prices = basePrices(FALLBACK_DEFS)
  return {
    v: 3,
    catalog: { ...FALLBACK_DEFS },
    balance: 1000,
    gifts: [
      { uid: uid(), kind: 'heart', num: 482 },
      { uid: uid(), kind: 'sota', num: 3310 },
    ],
    nextNum: 5000,
    tx: [],
    prices,
    priceOpen: { date: todayKey(), prices: { ...prices } },
    daily: { last: '', streak: 0 },
    tasks: {},
    stats: {},
  }
}

export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw) as Save
      if ((s.v as number) === 2) { s.v = 3; s.catalog = { ...FALLBACK_DEFS } } // миграция старого сохранения
      if (s.v === 3) {
        if (s.priceOpen.date !== todayKey()) s.priceOpen = { date: todayKey(), prices: { ...s.prices } }
        return s
      }
    }
  } catch { /* повреждённые данные — начинаем заново */ }
  return defaultSave()
}
export const persist = (s: Save) => {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* переполнено/запрещено */ }
}

// Небольшое случайное блуждание цен вокруг базовой (коридор 70–140%).
export function walkPrices(p: Record<GiftKind, number>): Record<GiftKind, number> {
  const out = { ...p }
  for (const k of Object.keys(out)) {
    if (!GIFTS[k] || GIFTS[k].retired || GIFTS[k].nft) continue
    const b = GIFTS[k].base
    const next = out[k] * (1 + (rnd() - 0.5) * 0.06)
    out[k] = Math.round(Math.min(b * 1.4, Math.max(b * 0.7, next)))
  }
  return out
}

// ---- Платёжная математика (RTP указан в комментариях) ----
// Краш: точка вылета с «налогом» 3% (RTP 97%)
export const crashPoint = () => {
  const r = rnd()
  return Math.min(1000, Math.max(1, Math.floor(97 / (1 - r)) / 100))
}
export const SYMBOLS = ['💎', '7⭐', '🍀', '🔔', '🍇', '🍋', '⭐', '💰']
export const SYMBOL_WEIGHTS = [1, 1, 3, 4, 6, 8, 12, 20]
const BASE_PAY = [25, 15, 8, 5, 3, 2, 2, 1.5]
export const pickSymbol = () => weighted(SYMBOLS, SYMBOL_WEIGHTS)
// 5×3, 9 линий, ставка делится на линии: RTP ≈ 93%
export const STORM_PAY = (sym: string, run: number) => {
  const i = SYMBOLS.indexOf(sym)
  const mul = run === 3 ? 1 : run === 4 ? 3 : 10
  return 3.8 * BASE_PAY[i] * mul
}
// 3 барабана: три одинаковых, RTP ≈ 96%
export const SLOT3_PAY = (sym: string) => 9 * BASE_PAY[SYMBOLS.indexOf(sym)]
export const PAYLINES: number[][] = [
  [0, 0, 0, 0, 0], [1, 1, 1, 1, 1], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
]
// Plinko, 8 рядов: RTP ≈ 96%
export const PLINKO_MULTS = [9, 3, 1.3, 0.7, 0.4, 0.7, 1.3, 3, 9]
// Мины 4×4, 3 мины: коэффициент после k безопасных клеток, RTP 97%
export const MINES_TOTAL = 16
export const MINES_COUNT = 3
export const minesMult = (k: number) => {
  let m = 0.97
  for (let i = 0; i < k; i++) m *= (MINES_TOTAL - i) / (MINES_TOTAL - MINES_COUNT - i)
  return m
}
export const UPGRADE_RTP = 0.94
export const upgradeChance = (cur: number, target: number) => Math.min(0.9, (UPGRADE_RTP * cur) / target)

// Подмешивает импортированный каталог: новые подарки активны, остальные уходят в «архив».
export function mergeCatalog(save: Save, imported: Record<string, GiftDef>): Save {
  const ids = Object.keys(imported)
  if (!ids.length) return save
  const catalog: Record<string, GiftDef> = {}
  for (const k of Object.keys(save.catalog)) catalog[k] = { ...save.catalog[k], retired: true }
  Object.assign(catalog, imported)
  const prices = { ...save.prices }, open = { ...save.priceOpen.prices }
  for (const k of ids) { if (!prices[k]) prices[k] = imported[k].base; if (!open[k]) open[k] = prices[k] }
  return { ...save, catalog, prices, priceOpen: { ...save.priceOpen, prices: open } }
}

// ---- NFT-подарки (коллекции) с флор-ценами в TON ----
export type NftCollection = { id: string; name: string; floorTon: number; image?: string | null }
export function defsFromNft(list: NftCollection[]): Record<string, GiftDef> {
  const out: Record<string, GiftDef> = {}
  for (const c of list) {
    if (!c.id || !(c.floorTon > 0)) continue
    const key = `nft:${c.id}`, h = hue(key)
    out[key] = {
      name: c.name, rarity: 'Коллекционный', base: Math.max(1, Math.round(c.floorTon * COINS_PER_TON)),
      c1: `hsl(${h},85%,74%)`, c2: `hsl(${h},78%,54%)`, shape: 'diamond', thumb: c.image || undefined, nft: true,
    }
  }
  return out
}
// Цена NFT в игре равна текущему флору (без случайного блуждания).
export function mergeNft(save: Save, defs: Record<string, GiftDef>): Save {
  const ids = Object.keys(defs)
  if (!ids.length) return save
  const prices = { ...save.prices }, open = { ...save.priceOpen.prices }
  for (const k of ids) { prices[k] = defs[k].base; if (!open[k]) open[k] = defs[k].base }
  return { ...save, catalog: { ...save.catalog, ...defs }, prices, priceOpen: { ...save.priceOpen, prices: open } }
}
