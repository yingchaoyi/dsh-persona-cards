/**
 * dsh-persona-cards —— 浏览器半端（设置里的「人设卡」）
 *
 * 一张卡 = 一套人格。列表里点「使用」，之后每一轮都按这张卡说话。
 * 卡可以新建、编辑、删掉；正文想写多长写多长（后端上限两万字）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-cards',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useCallback, useRef } = React

    const API = '/api/persona-cards'

    const parse = async (r) => {
      const text = await r.text()
      try { return JSON.parse(text) } catch { throw new Error('接口返回的不是 JSON：' + text.slice(0, 120)) }
    }
    const jget = async (path) => parse(await fetch(API + path, { credentials: 'same-origin' }))
    const jpost = async (path, body) => parse(await fetch(API + path, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body || {}),
    }))

    const stamp = (ms) => {
      const d = new Date(ms)
      const p = (n) => String(n).padStart(2, '0')
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
    }

    const CSS = `
.pc-wrap { display: flex; flex-direction: column; gap: 14px; }
.pc-note { color: color-mix(in oklab, currentColor 62%, transparent); font-size: 12.5px; line-height: 1.75; }
.pc-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 10px; }
.pc-card { border: 1px solid color-mix(in oklab, currentColor 16%, transparent); border-radius: 12px; padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; cursor: pointer; transition: border-color .15s, background .15s; }
.pc-card:hover { border-color: color-mix(in oklab, currentColor 34%, transparent); }
.pc-card.on { border-color: #4a7dff; background: color-mix(in oklab, #4a7dff 8%, transparent); }
.pc-card-head { display: flex; align-items: center; gap: 8px; }
.pc-name { font-weight: 600; font-size: 14.5px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pc-chip { font-size: 11px; padding: 1px 8px; border-radius: 999px; border: 1px solid color-mix(in oklab, #4a7dff 60%, transparent); color: #4a7dff; white-space: nowrap; }
.pc-meta { font-size: 11.5px; color: color-mix(in oklab, currentColor 48%, transparent); }
.pc-preview { font-size: 12px; line-height: 1.6; color: color-mix(in oklab, currentColor 66%, transparent); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word; }
.pc-ops { display: flex; gap: 6px; margin-top: 2px; }
.pc-btn { font: inherit; font-size: 12px; padding: 4px 12px; border-radius: 8px; border: 1px solid color-mix(in oklab, currentColor 20%, transparent); background: transparent; color: inherit; cursor: pointer; }
.pc-btn:hover { background: color-mix(in oklab, currentColor 8%, transparent); }
.pc-btn.primary { border-color: #4a7dff; background: #4a7dff; color: #fff; }
.pc-btn.primary:hover { filter: brightness(1.08); }
.pc-btn.danger { border-color: color-mix(in oklab, #e5484d 55%, transparent); color: #e5484d; }
.pc-btn.ghost { border-color: transparent; color: color-mix(in oklab, currentColor 55%, transparent); }
.pc-btn:disabled { opacity: .5; cursor: default; }
.pc-editor { border: 1px solid color-mix(in oklab, currentColor 16%, transparent); border-radius: 12px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
.pc-row { display: flex; align-items: center; gap: 10px; }
.pc-input { flex: 1; font: inherit; font-size: 13.5px; padding: 7px 11px; border-radius: 9px; border: 1px solid color-mix(in oklab, currentColor 20%, transparent); background: color-mix(in oklab, currentColor 4%, transparent); color: inherit; }
.pc-input:focus { outline: none; border-color: #4a7dff; }
.pc-area { font: inherit; font-size: 12.5px; line-height: 1.75; padding: 12px; border-radius: 10px; border: 1px solid color-mix(in oklab, currentColor 20%, transparent); background: color-mix(in oklab, currentColor 4%, transparent); color: inherit; min-height: 320px; resize: vertical; white-space: pre-wrap; }
.pc-area:focus { outline: none; border-color: #4a7dff; }
.pc-hint { font-size: 11.5px; color: color-mix(in oklab, currentColor 45%, transparent); }
.pc-toast { position: sticky; bottom: 0; align-self: flex-start; background: #4a7dff; color: #fff; padding: 7px 14px; border-radius: 999px; font-size: 12px; }
.pc-empty { padding: 18px; text-align: center; color: color-mix(in oklab, currentColor 50%, transparent); font-size: 13px; border: 1px dashed color-mix(in oklab, currentColor 20%, transparent); border-radius: 12px; }
`

    function Panel(props) {
      const [state, setState] = useState((props && props.initialState) || null)
      const [msg, setMsg] = useState('')
      const [busy, setBusy] = useState(false)
      // editing = { id, name, text } ；id 为空就是新建
      const [editing, setEditing] = useState(null)
      const alive = useRef(true)

      const refresh = useCallback(async () => {
        try {
          const s = await jget('/state')
          if (alive.current) setState(s)
        } catch (error) {
          if (alive.current) setMsg('读取失败：' + error.message)
        }
      }, [])

      useEffect(() => {
        alive.current = true
        refresh()
        return () => { alive.current = false }
      }, [refresh])

      const flash = (text) => {
        setMsg(text)
        setTimeout(() => { if (alive.current) setMsg('') }, 2800)
      }

      const cards = (state && state.cards) || []
      const activeId = (state && state.activeId) || ''

      const useCard = async (card) => {
        if (!card) return
        if (card.id === activeId) return
        setBusy(true)
        try {
          const r = await jpost('/use', { id: card.id })
          if (r && r.ok === false) throw new Error(r.message || '切换失败')
          setState(r)
          flash(`换上了：${card.name}。下一句就按这张卡说`)
        } catch (error) { flash('切换失败：' + error.message) }
        setBusy(false)
      }

      const stopUsing = async () => {
        setBusy(true)
        try {
          const r = await jpost('/use', { id: '' })
          if (r && r.ok === false) throw new Error(r.message || '取消失败')
          setState(r)
          flash('退回了，回到默认说话方式')
        } catch (error) { flash('取消失败：' + error.message) }
        setBusy(false)
      }

      const startNew = () => setEditing({ id: '', name: '', text: '' })
      const startEdit = (card) => setEditing({ id: card.id, name: card.name, text: card.text || '' })

      const saveCard = async () => {
        if (!editing) return
        const name = String(editing.name || '').trim()
        const text = String(editing.text || '').trim()
        if (!name) return flash('起个名字')
        if (!text) return flash('正文是空的')
        setBusy(true)
        try {
          const r = await jpost('/save', { id: editing.id || undefined, name, text })
          if (r && r.ok === false) throw new Error(r.message || '保存失败')
          setState(r)
          setEditing(null)
          flash(editing.id ? '改好了' : `建好了：${name}`)
        } catch (error) { flash('保存失败：' + error.message) }
        setBusy(false)
      }

      const removeCard = async (card) => {
        if (!window.confirm(`删掉「${card.name}」？删了找不回来。`)) return
        setBusy(true)
        try {
          const r = await jpost('/delete', { id: card.id })
          if (r && r.ok === false) throw new Error(r.message || '删除失败')
          setState(r)
          if (editing && editing.id === card.id) setEditing(null)
          flash('删了')
        } catch (error) { flash('删除失败：' + error.message) }
        setBusy(false)
      }

      const activeName = (cards.find((c) => c.id === activeId) || {}).name || ''

      return h('div', { className: 'pc-wrap', 'data-testid': 'persona-cards' }, [
        h('div', { key: 'note', className: 'pc-note' },
          '一张卡就是一套人格：名字 + 正文，正文随便写多长（分章节、写口癖、写底线都行）。点「使用」之后，每一轮都会把这卡原样塞进系统提示，换卡立刻生效，不用重启。'),
        h('div', { key: 'bar', className: 'pc-row' }, [
          h('span', { key: 's', className: 'pc-hint' },
            activeName ? `正在用：${activeName}` : '当前没有使用人设卡（按默认说话方式）'),
          h('span', { key: 'g', style: { flex: 1 } }),
          activeId ? h('button', { key: 'off', className: 'pc-btn ghost', onClick: stopUsing, disabled: busy }, '停用') : null,
          h('button', { key: 'add', className: 'pc-btn primary', onClick: startNew, disabled: busy }, '新建人设卡'),
        ]),

        editing ? h('div', { key: 'editor', className: 'pc-editor' }, [
          h('div', { key: 'r1', className: 'pc-row' }, [
            h('input', {
              key: 'name',
              className: 'pc-input',
              placeholder: '这张卡叫什么（比如：大肥鱼·孙吧版）',
              value: editing.name,
              maxLength: 40,
              onChange: (e) => setEditing(Object.assign({}, editing, { name: e.target.value })),
            }),
          ]),
          h('textarea', {
            key: 'text',
            className: 'pc-area',
            placeholder: '正文……可以按章节写：你是谁、怎么说话、常用词、攻击方式、红线。',
            value: editing.text,
            onChange: (e) => setEditing(Object.assign({}, editing, { text: e.target.value })),
          }),
          h('div', { key: 'r2', className: 'pc-row' }, [
            h('span', { key: 'n', className: 'pc-hint' }, `${(editing.text || '').length} 字`),
            h('span', { key: 'g', style: { flex: 1 } }),
            h('button', { key: 'cancel', className: 'pc-btn ghost', onClick: () => setEditing(null), disabled: busy }, '取消'),
            h('button', { key: 'save', className: 'pc-btn primary', onClick: saveCard, disabled: busy }, '保存'),
          ]),
        ]) : null,

        cards.length === 0
          ? h('div', { key: 'empty', className: 'pc-empty' }, '还没有人设卡。点右上角「新建人设卡」写一张。')
          : h('div', { key: 'grid', className: 'pc-grid' }, cards.map((c) => h('div', {
            key: c.id,
            className: 'pc-card' + (c.id === activeId ? ' on' : ''),
            onClick: () => useCard(c),
            title: c.id === activeId ? '正在使用' : '点一下就用这张',
          }, [
            h('div', { key: 'h', className: 'pc-card-head' }, [
              h('span', { key: 'n', className: 'pc-name' }, c.name),
              c.id === activeId ? h('span', { key: 'c', className: 'pc-chip' }, '使用中') : null,
            ]),
            h('div', { key: 'm', className: 'pc-meta' }, `${c.chars || 0} 字 · 改于 ${stamp(c.updatedAt)}`),
            c.preview ? h('div', { key: 'p', className: 'pc-preview' }, c.preview) : null,
            h('div', { key: 'o', className: 'pc-ops' }, [
              h('button', {
                key: 'use',
                className: 'pc-btn',
                disabled: busy || c.id === activeId,
                onClick: (e) => { e.stopPropagation(); useCard(c) },
              }, c.id === activeId ? '使用中' : '使用'),
              h('button', {
                key: 'edit',
                className: 'pc-btn',
                disabled: busy,
                onClick: (e) => { e.stopPropagation(); startEdit(c) },
              }, '编辑'),
              h('button', {
                key: 'del',
                className: 'pc-btn danger',
                disabled: busy,
                onClick: (e) => { e.stopPropagation(); removeCard(c) },
              }, '删除'),
            ]),
          ]))),

        msg ? h('div', { key: 'toast', className: 'pc-toast' }, msg) : null,
      ])
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.setAttribute('data-plugin-css', 'dsh-persona-cards')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-persona-cards: style')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'persona-cards', order: 33, label: '人设卡' },
          () => h(Panel),
        ))
      },
    }
  },
})
