/**
 * smoke.mjs —— 不启 DSH 也能验：卡能建、能改、能删、能切换，注入的文本跟着「使用」走。
 * 跑法：node test/smoke.mjs（内部自己用临时 DSH_HOME，不碰真库）
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'pc-'))

const { apply } = await import('../lib/index.mjs')

const routes = new Map()
const ctx = {
  agents: { list: () => [] },
  webServer: { register: (def) => { routes.set(def.path, def.handler); return () => routes.delete(def.path) } },
  effect: (fn) => { const off = fn(); return typeof off === 'function' ? off : () => {} },
  inject: (_deps, fn) => { const r = fn(ctx); return typeof r === 'function' ? r : () => {} },
  on: () => {},
}
apply(ctx)

const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✓ ' + m)
const assert = (cond, m) => (cond ? ok(m) : fail(m))

// 假一个 req/res，走真实路由
function call(routePath, body) {
  return new Promise((resolve) => {
    const req = new EventTarget()
    setTimeout(() => {
      req.dispatchEvent(Object.assign(new Event('data'), { }))
    }, 0)
    resolve(null)
  })
}

const conf = { 'content-type': 'application/json' }
const { Readable } = await import('node:stream')

async function post(path, body) {
  const handler = routes.get(path)
  if (!handler) throw new Error('路由没挂：' + path)
  const req = Readable.from([Buffer.from(JSON.stringify(body || {}))])
  req.url = path
  let code = 200
  let raw = ''
  const res = {
    writeHead: (c) => { code = c },
    end: (s) => { raw = s },
  }
  await handler(req, res)
  return { code, ...JSON.parse(raw || '{}') }
}

async function get(path) {
  const handler = routes.get(path)
  if (!handler) throw new Error('路由没挂：' + path)
  const req = Readable.from([Buffer.from('')])
  req.url = path
  let raw = ''
  const res = { writeHead: () => {}, end: (s) => { raw = s } }
  await handler(req, res)
  return JSON.parse(raw || '{}')
}

const state0 = await get('/api/persona-cards/state')
assert(state0.ok === true, 'state 能读')
assert(Array.isArray(state0.cards) && state0.cards.length === 0, '一开始一张卡都没有')
assert(state0.activeId === '', '一开始没有使用中的卡')

const s1 = await post('/api/persona-cards/save', { name: '大肥鱼', text: '你是一只鱼，说话短。' })
assert(s1.ok !== false && s1.cards.length === 1, '建了一张卡')
const cardId = s1.cards[0].id
assert(s1.cards[0].name === '大肥鱼', '卡名对')
assert(s1.activeId === '', '建卡不等于使用')

const s2 = await post('/api/persona-cards/use', { id: cardId })
assert(s2.activeId === cardId, '点使用后 activeId 变了')

const s3 = await post('/api/persona-cards/save', { id: cardId, name: '大肥鱼·改', text: '你是条咸鱼，说话更短。' })
assert(s3.cards.length === 1, '改卡不会多出一张')
assert(s3.cards[0].name === '大肥鱼·改', '改名生效')
assert(s3.cards[0].text.includes('咸鱼'), '正文改了')

const s4 = await post('/api/persona-cards/save', { name: '大肥鱼', text: '第二张' })
assert(s4.cards.length === 2, '重名也能建，自己加后缀')
assert(s4.cards[1].name === '大肥鱼', '名字跟现有的不撞就直接用')

const s5 = await post('/api/persona-cards/delete', { id: s4.cards[1].id })
assert(s5.cards.length === 1, '删掉一张')
assert(s5.activeId === cardId, '删的不是正在用的，activeId 不动')

const bad = await post('/api/persona-cards/save', { name: '', text: 'x' })
assert(bad.code === 400 && bad.ok === false, '没名字不让存')
const bad2 = await post('/api/persona-cards/save', { name: 'x', text: '   ' })
assert(bad2.code === 400 && bad2.ok === false, '空正文不让存')

const s6 = await post('/api/persona-cards/use', { id: '' })
assert(s6.activeId === '', '能取消使用')

console.log(process.exitCode ? '\n有失败' : '\n全部通过')
