/**
 * dsh-persona-cards —— 人设卡
 *
 * 一套「人格」存成一张卡：名字 + 正文（随便多长，分章节写）。
 * 面板里点「使用」，之后每一轮对话都会把这卡原样注入系统提示，
 * 换卡立刻生效，不用重启、不用改插件。
 *
 * 为什么单独拆出来：人设和记忆是两件事——记忆天天在长，人设一改就是换个人。
 * 以前塞在三档记忆里，改人设得跟记忆参数挤一块，还容易被字数预算截断。
 * 这里给足篇幅（默认不截），并且只认「当前使用的那一张」。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'

export const name = 'persona-cards'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(DSH_HOME, 'persona-cards')
const STORE_PATH = join(DATA_DIR, 'store.json')

const MAX_NAME = 40
const MAX_TEXT = 20000       // 一张卡最多两万字，够写一整套角色设定
const MAX_CARDS = 200
const MAX_ACTIVE_LEN = 12000 // 注入时再长就截：太长的卡反而会盖住记忆和工具说明

const DEFAULT_CARD = { name: '新人设', text: '' }

let cache = null

function diag(msg) {
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(join(DATA_DIR, 'persona.log'), new Date().toISOString() + ' ' + msg + '\n', { flag: 'a' })
  } catch { /* ignore */ }
}

const cleanName = (v) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME)
const cleanText = (v) => String(v == null ? '' : v).replace(/\r\n/g, '\n').trim().slice(0, MAX_TEXT)

function normalizeCard(raw) {
  if (!raw || typeof raw !== 'object') return null
  const text = cleanText(raw.text)
  const card = {
    id: String(raw.id || randomUUID()),
    name: cleanName(raw.name) || DEFAULT_CARD.name,
    text,
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Date.now(),
  }
  return card
}

function emptyStore() {
  return { v: 1, activeId: '', cards: [], updatedAt: new Date().toISOString() }
}

function load() {
  if (cache) return cache
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8'))
    const base = emptyStore()
    base.cards = (Array.isArray(raw.cards) ? raw.cards : []).map(normalizeCard).filter(Boolean).slice(0, MAX_CARDS)
    const active = String(raw.activeId || '')
    base.activeId = base.cards.some((c) => c.id === active) ? active : ''
    cache = base
  } catch {
    cache = emptyStore()
  }
  return cache
}

function save() {
  const data = cache || emptyStore()
  data.updatedAt = new Date().toISOString()
  try {
    mkdirSync(DATA_DIR, { recursive: true })
    const tmp = STORE_PATH + '.tmp'
    writeFileSync(tmp, JSON.stringify(data, null, 1))
    renameSync(tmp, STORE_PATH)
  } catch (error) {
    diag('保存失败：' + (error && error.message))
  }
}

function activeCard() {
  const data = load()
  if (!data.activeId) return null
  return data.cards.find((c) => c.id === data.activeId) || null
}

/** 每轮注入的文本。没选卡就是空串，等于插件不存在。 */
function renderInjection() {
  const card = activeCard()
  if (!card || !card.text) return ''
  let body = card.text
  if (body.length > MAX_ACTIVE_LEN) body = body.slice(0, MAX_ACTIVE_LEN) + '\n（人设卡太长，后面的截了）'
  return '【人设卡·当前人格：' + card.name + '】（以下是你的人设，优先级高于你的默认说话方式）\n' + body
}

function publicState() {
  const data = load()
  return {
    ok: true,
    activeId: data.activeId,
    cards: data.cards.map((c) => ({
      id: c.id,
      name: c.name,
      chars: c.text.length,
      preview: c.text.replace(/\s+/g, ' ').slice(0, 90),
      text: c.text,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      active: c.id === data.activeId,
    })),
  }
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = ''
    req.on('data', (c) => { raw += c; if (raw.length > 2e6) req.destroy() })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(obj))
}

/** 给一张新卡起个不重名的名字：新人设 / 新人设 2 / 新人设 3 … */
function uniqueName(base) {
  const data = load()
  const names = new Set(data.cards.map((c) => c.name))
  if (!names.has(base)) return base
  for (let i = 2; i < 500; i++) {
    const candidate = base + ' ' + i
    if (!names.has(candidate)) return candidate
  }
  return base + ' ' + Date.now()
}

function sessionIdOf(session) {
  try {
    if (!session) return ''
    if (typeof session.id === 'string' && session.id) return session.id
    if (session.header && typeof session.header.id === 'string') return session.header.id
  } catch { /* ignore */ }
  return ''
}

export function apply(ctx) {
  // ---- 每轮注入：挂到每个 agent 的 systemPrompt 上 ----
  const mounted = new Map() // sid -> off()

  function mountFor(agent) {
    const sid = sessionIdOf(agent && agent.session)
    if (!sid || mounted.has(sid)) return
    if (!agent.ctx || !agent.ctx.systemPrompt || typeof agent.ctx.systemPrompt.context !== 'function') return
    try {
      const off = agent.ctx.systemPrompt.context({
        name: 'persona-cards',
        order: 900,           // 排在记忆（910）前面：先定是谁，再看记得什么
        interpolate: false,
        text: () => {
          try { return renderInjection() } catch (error) {
            diag('注入失败：' + (error && error.message))
            return ''
          }
        },
      })
      mounted.set(sid, typeof off === 'function' ? off : (off && off.off) || (() => {}))
      diag('注入挂上：' + sid)
    } catch (error) {
      const msg = String((error && error.message) || '')
      if (msg.includes('already registered')) {
        mounted.set(sid, () => {})  // 热重载时旧实例的注册还在，功能上没影响
      } else {
        diag('注入挂不上：' + msg)
      }
    }
  }

  ctx.inject(['agents'], (c) => {
    try {
      const tick = () => {
        try {
          const list = (c.agents && typeof c.agents.list === 'function') ? c.agents.list() : []
          for (const agent of list) mountFor(agent)
        } catch (error) {
          diag('扫 agent 失败：' + (error && error.message))
        }
      }
      tick()
      const timer = setInterval(tick, 2000)
      if (typeof timer.unref === 'function') timer.unref()  // 别为了这个插件让进程退不掉（测试里也一样）
      c.effect(() => () => clearInterval(timer))
    } catch (error) {
      diag('agents 挂载失败：' + (error && error.message))
    }
  })

  // ---- 设置页接口 ----
  ctx.inject(['webServer'], (c) => {
    try {
      const route = (path, handler) => {
        if (!c.webServer || typeof c.webServer.register !== 'function') return
        c.effect(() => c.webServer.register({
          kind: 'exact',
          path,
          handler: async (req, res) => {
            try { await handler(req, res) } catch (error) {
              try { sendJson(res, 500, { ok: false, error: String(error && error.message) }) } catch { /* ignore */ }
            }
          },
        }))
      }

      route('/api/persona-cards/state', async (req, res) => {
        sendJson(res, 200, publicState())
      })

      // 新建（不带 id）或保存（带 id）
      route('/api/persona-cards/save', async (req, res) => {
        const body = await readBody(req)
        const data = load()
        const name = cleanName(body.name)
        const text = cleanText(body.text)
        if (!name) return sendJson(res, 400, { ok: false, message: '起个名字' })
        if (!text) return sendJson(res, 400, { ok: false, message: '正文是空的' })

        const id = String(body.id || '')
        if (id) {
          const card = data.cards.find((c) => c.id === id)
          if (!card) return sendJson(res, 404, { ok: false, message: '这卡不见了' })
          card.name = name
          card.text = text
          card.updatedAt = Date.now()
        } else {
          if (data.cards.length >= MAX_CARDS) return sendJson(res, 400, { ok: false, message: '卡太多了，先删几张' })
          const card = normalizeCard({ id: randomUUID(), name, text, createdAt: Date.now(), updatedAt: Date.now() })
          card.name = uniqueName(name)
          data.cards.push(card)
        }
        save()
        sendJson(res, 200, publicState())
      })

      route('/api/persona-cards/delete', async (req, res) => {
        const body = await readBody(req)
        const id = String(body.id || '')
        const data = load()
        const before = data.cards.length
        data.cards = data.cards.filter((c) => c.id !== id)
        if (data.cards.length === before) return sendJson(res, 404, { ok: false, message: '这卡不见了' })
        if (data.activeId === id) data.activeId = ''
        save()
        sendJson(res, 200, publicState())
      })

      // 点「使用」：空 id = 谁都不用（回到默认说话方式）
      route('/api/persona-cards/use', async (req, res) => {
        const body = await readBody(req)
        const id = String(body.id || '')
        const data = load()
        if (id && !data.cards.some((c) => c.id === id)) return sendJson(res, 404, { ok: false, message: '这卡不见了' })
        data.activeId = id
        save()
        sendJson(res, 200, publicState())
      })
    } catch (error) {
      diag('webServer 挂载失败：' + (error && error.message))
    }
  })
}
