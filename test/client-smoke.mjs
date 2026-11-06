/**
 * client-smoke.mjs —— 不开浏览器也能验渲染：假 React + 假 slots，
 * 把「人设卡」面板整棵树跑一遍，看有没有炸、该有的字在不在。
 */
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../client.js', import.meta.url), 'utf8')

const React = {
  createElement(type, props, ...children) {
    return { type, props: props || {}, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) }
  },
  useState(v) { return [typeof v === 'function' ? v() : v, () => {}] },
  useEffect() {},
  useCallback(f) { return f },
  useRef(v) { return { current: v } },
  Fragment: 'Fragment',
}

let captured = null
const documentStub = {
  head: { appendChild() {} },
  createElement() { return { setAttribute() {}, textContent: '', remove() {} } },
}

globalThis.window = {
  __ModuleLoader__: { load: ({ id, factory }) => { captured = { id, factory } } },
  confirm: () => false,
}
globalThis.document = documentStub

new Function('window', 'document', src)(globalThis.window, documentStub)

const fail = (m) => { console.error('✗ ' + m); process.exitCode = 1 }
const ok = (m) => console.log('✓ ' + m)
const assert = (c, m) => (c ? ok(m) : fail(m))

assert(captured && captured.id === 'dsh-persona-cards', '模块 id 正确')

const mod = captured.factory(() => React)
assert(typeof mod.apply === 'function', 'factory 返回 apply')

const registered = []
const slots = {
  inject(name, fn) { fn() },
  register(def, render) { registered.push({ def, render }); return () => {} },
}
const ctx = { get: () => slots, effect: (fn) => { const off = fn(); return off }, slots }
mod.apply(ctx)

assert(registered.length === 1, '注册了 1 个设置分区')
const def = registered[0].def
assert(def.name === 'settings.section' && def.label === '人设卡', '分区名与标题：' + def.label)

function walk(node, out) {
  if (node === null || node === undefined || node === false) return
  if (Array.isArray(node)) { for (const n of node) walk(n, out); return }
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return }
  if (typeof node.type === 'function') { walk(node.type(node.props), out); return }
  if (node.props && typeof node.props.placeholder === 'string') out.push(node.props.placeholder)
  for (const c of node.children) walk(c, out)
}

// 有卡的场景：一张正在用，一张没用
const state = {
  ok: true,
  activeId: 'a1',
  cards: [
    { id: 'a1', name: '大肥鱼·孙吧版', chars: 3200, preview: '你混迹互联网多年，贴吧老资历', text: '……', active: true, updatedAt: Date.now() },
    { id: 'a2', name: '温柔客服', chars: 800, preview: '你好，请问有什么可以帮您', text: '……', active: false, updatedAt: Date.now() },
  ],
}

const tree = registered[0].render()
if (tree && tree.props) tree.props.initialState = state
const out = []
try {
  walk(tree, out)
} catch (error) {
  fail('渲染炸了：' + error.message)
}
const text = out.join(' ')
const has = (s) => text.includes(s)

assert(has('大肥鱼·孙吧版'), '渲染出卡名')
assert(has('温柔客服'), '第二张卡也在')
assert(has('正在用：大肥鱼·孙吧版'), '顶部显示当前在用哪张')
assert(has('使用中'), '正在用的卡有「使用中」标记')
assert(has('3200 字'), '显示字数')
assert(has('新建人设卡'), '有新建按钮')
assert(has('停用'), '有停用按钮')
assert(has('编辑') && has('删除'), '每张卡有编辑和删除')
assert(has('点「使用」'), '有说明文字')

// 空场景
const empty = registered[0].render()
if (empty && empty.props) empty.props.initialState = { ok: true, activeId: '', cards: [] }
const out2 = []
walk(empty, out2)
const text2 = out2.join(' ')
assert(text2.includes('还没有人设卡'), '没卡时显示空提示')
assert(text2.includes('当前没有使用人设卡'), '没卡时顶部说明对')

console.log(process.exitCode ? '\n有失败' : '\n全部通过')
