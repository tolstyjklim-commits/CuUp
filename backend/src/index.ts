import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { PrismaClient } from '@prisma/client'
import { requireTelegramAuth } from './telegram.js'

const app = express()
const prisma = new PrismaClient()
app.use(cors({ origin: process.env.FRONTEND_ORIGIN?.split(',') || true }))
app.use(express.json({ limit: '32kb' }))

app.get('/health', (_req, res) => res.json({ ok: true, service: 'qcup-api' }))

app.get('/api/me', requireTelegramAuth, async (req, res) => {
  const tg = req.telegramUser!
  const user = await prisma.user.upsert({
    where: { telegramId: String(tg.id) },
    update: { username: tg.username, firstName: tg.first_name, photoUrl: tg.photo_url },
    create: {
      telegramId: String(tg.id), username: tg.username, firstName: tg.first_name,
      photoUrl: tg.photo_url, wallet: { create: { balance: 1000n } },
    },
    include: { wallet: true },
  })
  res.json({
    id: user.id, telegramId: user.telegramId, username: user.username,
    firstName: user.firstName, balance: user.wallet?.balance.toString() ?? '0',
    currency: user.wallet?.currency ?? 'QCP',
  })
})

// Каталог настоящих подарков Telegram (справочные цены в звёздах). Кэш 5 минут.
let giftCache: { at: number; gifts: { id: string; stars: number; total?: number; remaining?: number }[] } | null = null
app.get('/api/gifts/catalog', async (_req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token || token === 'replace_me') return res.status(503).json({ error: 'TELEGRAM_BOT_TOKEN is not set' })
  if (giftCache && Date.now() - giftCache.at < 5 * 60_000) return res.json({ gifts: giftCache.gifts, cached: true })
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/getAvailableGifts`)
    const j = (await r.json()) as { ok: boolean; result?: { gifts: { id: string; star_count: number; total_count?: number; remaining_count?: number }[] } }
    if (!j.ok || !j.result) return res.status(502).json({ error: 'Telegram API error' })
    const gifts = j.result.gifts.map(g => ({ id: g.id, stars: g.star_count, total: g.total_count, remaining: g.remaining_count }))
      .sort((a, b) => a.stars - b.stars)
    giftCache = { at: Date.now(), gifts }
    res.json({ gifts, cached: false })
  } catch { res.status(502).json({ error: 'Telegram API unreachable' }) }
})

// NFT-подарки: флор-цены коллекций в TON из Gift Asset API (нужен GIFTASSET_API_KEY). Кэш 5 минут.
// Формат ответа GiftAsset: collection_floors[коллекция] = { getgems, mrkt, portals, tonnel, last_update }.
let nftCache: { at: number; body: { updated: string; collections: unknown[] } } | null = null
app.get('/api/nft/floors', async (_req, res) => {
  const key = process.env.GIFTASSET_API_KEY
  if (!key) return res.status(503).json({ error: 'GIFTASSET_API_KEY is not set' })
  if (nftCache && Date.now() - nftCache.at < 5 * 60_000) return res.json({ ...nftCache.body, cached: true })
  try {
    const r = await fetch('https://giftasset.gifts/api/v1/gifts/get_gifts_price_list', { headers: { 'X-API-Key': key } })
    if (!r.ok) return res.status(502).json({ error: `GiftAsset responded ${r.status}` })
    const j = (await r.json()) as { collection_floors?: Record<string, Record<string, unknown>> }
    const tmpl = process.env.NFT_IMAGE_TEMPLATE || '' // например https://nft.fragment.com/gift/{slug}-1.webp
    const collections = Object.entries(j.collection_floors || {}).flatMap(([name, v]) => {
      const prices = ['getgems', 'mrkt', 'portals', 'tonnel'].map(p => v?.[p]).filter((n): n is number => typeof n === 'number' && n > 0).sort((a, b) => a - b)
      if (!prices.length) return []
      const floorTon = prices[Math.floor(prices.length / 2)] // медиана по площадкам
      const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '')
      return [{ id: slug, name, floorTon, providers: v, image: tmpl ? tmpl.replace('{slug}', slug) : null }]
    }).sort((a, b) => a.floorTon - b.floorTon)
    const body = { updated: new Date().toISOString(), collections }
    nftCache = { at: Date.now(), body }
    res.json({ ...body, cached: false })
  } catch { res.status(502).json({ error: 'GiftAsset unreachable' }) }
})


const asBigInt = (v: unknown) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const n = Number(v)
  if (!Number.isSafeInteger(n) || n <= 0) return null
  return BigInt(n)
}
const adminOnly = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const expected = process.env.ADMIN_API_TOKEN || ''
  if (!expected || req.header('x-admin-token') !== expected) return res.status(403).json({ error: 'Admin access denied' })
  next()
}

// Котировка: 1 QCP = 1 RUB. Курсы задаются только на сервере.
app.get('/api/economy/quote', (_req, res) => {
  const qcpRub = Number(process.env.QCP_RUB_RATE || 1)
  const tonRub = Number(process.env.TON_RUB_RATE || 0)
  const starsRub = Number(process.env.STARS_RUB_RATE || 0)
  res.json({ qcpRub, tonRub, starsRub, tonEnabled: tonRub > 0 && process.env.PAYMENTS_ENABLED === 'true', starsEnabled: starsRub > 0 && process.env.PAYMENTS_ENABLED === 'true', paymentsEnabled: process.env.PAYMENTS_ENABLED === 'true' })
})

// Платёжные адаптеры подключаются отдельно. Никогда не начисляем QCP по ответу браузера.
app.post('/api/payments/intents', requireTelegramAuth, async (req, res) => {
  if (process.env.PAYMENTS_ENABLED !== 'true') return res.status(503).json({ error: 'Payments are disabled until a verified provider adapter is configured' })
  const amount = asBigInt(req.body?.amountQcp)
  const provider = req.body?.provider
  if (!amount || !['stars', 'ton'].includes(provider)) return res.status(400).json({ error: 'Invalid amount or provider' })
  const rates = { stars: Number(process.env.STARS_RUB_RATE || 0), ton: Number(process.env.TON_RUB_RATE || 0) }
  if (!(rates[provider as keyof typeof rates] > 0)) return res.status(503).json({ error: 'Provider exchange rate is not configured' })
  // Создаём только намерение; подтверждение и зачисление выполняет серверный webhook адаптера.
  const tg = req.telegramUser!
  const user = await prisma.user.findUnique({ where: { telegramId: String(tg.id) } })
  if (!user) return res.status(404).json({ error: 'User not found; call /api/me first' })
  const rub = amount * BigInt(Math.round(Number(process.env.QCP_RUB_RATE || 1) * 100)) / 100n
  const intent = await prisma.paymentIntent.create({ data: { userId: user.id, provider, amountQcp: amount, amountFiatRub: rub, providerAmount: 'pending-provider-adapter' } })
  res.status(202).json({ id: intent.id, status: intent.status, message: 'Intent created; provider adapter and signed webhook are required before payment can complete' })
})

app.post('/api/withdrawals', requireTelegramAuth, async (req, res) => {
  if (process.env.WITHDRAWALS_ENABLED !== 'true') return res.status(503).json({ error: 'Withdrawals are disabled pending compliance and payout-provider setup' })
  const amount = asBigInt(req.body?.amountQcp)
  const method = String(req.body?.method || '')
  const destination = String(req.body?.destination || '').trim()
  if (!amount || !['ton', 'bank', 'other'].includes(method) || destination.length < 4 || destination.length > 256) return res.status(400).json({ error: 'Invalid withdrawal request' })
  const tg = req.telegramUser!
  const user = await prisma.user.findUnique({ where: { telegramId: String(tg.id) }, include: { wallet: true } })
  if (!user?.wallet) return res.status(404).json({ error: 'Wallet not found' })
  try {
    const result = await prisma.$transaction(async tx => {
      const changed = await tx.wallet.updateMany({ where: { userId: user.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } })
      if (changed.count !== 1) throw new Error('INSUFFICIENT_FUNDS')
      const request = await tx.withdrawalRequest.create({ data: { userId: user.id, amount, method, destination } })
      await tx.transaction.create({ data: { userId: user.id, amount: -amount, type: 'withdrawal_hold', status: 'pending', description: `Withdrawal request ${request.id}` } })
      return request
    })
    res.status(201).json({ id: result.id, amount: result.amount.toString(), status: result.status })
  } catch (e) {
    if (e instanceof Error && e.message === 'INSUFFICIENT_FUNDS') return res.status(409).json({ error: 'Insufficient balance' })
    throw e
  }
})

app.get('/api/withdrawals', requireTelegramAuth, async (req, res) => {
  const tg = req.telegramUser!
  const user = await prisma.user.findUnique({ where: { telegramId: String(tg.id) } })
  if (!user) return res.status(404).json({ error: 'User not found' })
  const rows = await prisma.withdrawalRequest.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 })
  res.json({ requests: rows.map(x => ({ id: x.id, amount: x.amount.toString(), method: x.method, status: x.status, createdAt: x.createdAt })) })
})

app.get('/api/admin/withdrawals', adminOnly, async (_req, res) => {
  const rows = await prisma.withdrawalRequest.findMany({ where: { status: 'pending' }, include: { user: true }, orderBy: { createdAt: 'asc' }, take: 100 })
  res.json({ requests: rows.map(x => ({ id: x.id, telegramId: x.user.telegramId, username: x.user.username, amount: x.amount.toString(), method: x.method, destination: x.destination, createdAt: x.createdAt })) })
})

app.post('/api/admin/withdrawals/:id/decision', adminOnly, async (req, res) => {
  const decision = req.body?.decision
  if (!['paid', 'rejected'].includes(decision)) return res.status(400).json({ error: 'decision must be paid or rejected' })
  const result = await prisma.$transaction(async tx => {
    const row = await tx.withdrawalRequest.findUnique({ where: { id: req.params.id } })
    if (!row || row.status !== 'pending') throw new Error('REQUEST_NOT_PENDING')
    const updated = await tx.withdrawalRequest.update({ where: { id: row.id }, data: { status: decision, adminNote: String(req.body?.note || '').slice(0, 500) } })
    if (decision === 'rejected') {
      await tx.wallet.update({ where: { userId: row.userId }, data: { balance: { increment: row.amount } } })
      await tx.transaction.create({ data: { userId: row.userId, amount: row.amount, type: 'withdrawal_release', status: 'completed', description: `Rejected withdrawal ${row.id}; funds returned` } })
    } else {
      await tx.transaction.updateMany({ where: { userId: row.userId, type: 'withdrawal_hold', description: `Withdrawal request ${row.id}` }, data: { status: 'completed' } })
    }
    return updated
  }).catch(e => { if (e instanceof Error && e.message === 'REQUEST_NOT_PENDING') return null; throw e })
  if (!result) return res.status(409).json({ error: 'Request not found or already processed' })
  res.json({ id: result.id, status: result.status })
})

const port = Number(process.env.API_PORT || 4000)
app.listen(port, () => console.log(`QcUp API listening on :${port}`))
