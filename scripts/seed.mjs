/**
 * seed.mjs —— 把 presets/*.md 灌成人设卡（只补不覆盖）。
 *
 *   node scripts/seed.mjs                 # 有卡就不动
 *   node scripts/seed.mjs --force         # 同名卡按住 md 覆盖正文
 *
 * 第一次装插件、或者手滑把卡删了，跑一下就能把「大肥鱼」捡回来。
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs'
import { join, basename } from 'node:path'
import { homedir } from 'node:os'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const PRESETS = join(HERE, '..', 'presets')
const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const DATA_DIR = join(DSH_HOME, 'persona-cards')
const STORE = join(DATA_DIR, 'store.json')

const force = process.argv.includes('--force')

let store = { v: 1, activeId: '', cards: [] }
if (existsSync(STORE)) {
  try { store = JSON.parse(readFileSync(STORE, 'utf8')) } catch { /* 坏了就重来 */ }
  if (!Array.isArray(store.cards)) store.cards = []
}

const now = Date.now()
let added = 0
let updated = 0
for (const file of readdirSync(PRESETS).filter((f) => f.endsWith('.md'))) {
  const name = basename(file, '.md')
  const text = readFileSync(join(PRESETS, file), 'utf8').trim()
  const existing = store.cards.find((c) => c.name === name)
  if (existing) {
    if (force) { existing.text = text; existing.updatedAt = now; updated++ }
    continue
  }
  store.cards.push({ id: randomUUID(), name, text, createdAt: now, updatedAt: now })
  added++
}

// 第一张卡直接设成「使用中」，装完就能用
if (!store.activeId && store.cards.length) store.activeId = store.cards[0].id

mkdirSync(DATA_DIR, { recursive: true })
const tmp = STORE + '.tmp'
writeFileSync(tmp, JSON.stringify(store, null, 1))
renameSync(tmp, STORE)
console.log(`人设卡：新增 ${added}，覆盖 ${updated}，现在共 ${store.cards.length} 张；使用中：${(store.cards.find((c) => c.id === store.activeId) || {}).name || '无'}`)
