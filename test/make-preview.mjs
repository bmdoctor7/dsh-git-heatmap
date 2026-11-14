// 用真实的组件输出（迷你渲染器） + client.js 里真实的 CSS 生成两张静态页，
// 再用 Chrome 截图检查「点阵与日期」的对齐。只用于调样式，不随插件发布。
import fs from 'node:fs'
import vm from 'node:vm'

const dir = new URL('..', import.meta.url)
const out = new URL('../.verify/', import.meta.url)
fs.mkdirSync(out, { recursive: true })

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
const cssMatch = /const CSS = `([\s\S]*?)`\n/.exec(source)
if (!cssMatch) throw new Error('没找到 CSS 常量')
const CSS = cssMatch[1]

let captured = null
globalThis.window = { __ModuleLoader__: { load: (spec) => { captured = spec } } }
vm.runInThisContext(source, { filename: 'client.js' })

let currentInstance = null
let nextSeed = null
const hookFns = {
  useState(initial) {
    const inst = currentInstance
    const index = inst.index++
    if (!(index in inst.state)) inst.state[index] = typeof initial === 'function' ? initial() : initial
    return [inst.state[index], () => {}]
  },
  useMemo(factory, deps) {
    const inst = currentInstance
    const index = inst.index++
    const prev = inst.memo[index]
    const changed = !prev || !deps
    if (changed) inst.memo[index] = { value: factory(), deps }
    return inst.memo[index].value
  },
  useEffect(fn, deps) {
    const inst = currentInstance
    const index = inst.index++
    if (!inst.effects[index]) inst.effects[index] = fn()
  },
  useCallback(fn) { return fn },
}
const React = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }), ...hookFns }
const mod = captured.factory((id) => {
  if (id === 'react') return React
  throw new Error(id)
})

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return escapeHtml(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const { type, props, children } = node
  if (typeof type === 'function') {
    const previous = currentInstance
    const instance = { index: 0, state: {}, memo: {}, effects: {} }
    if (nextSeed && nextSeed.type === type) {
      nextSeed.seed.forEach((value, index) => { instance.state[index] = value })
      nextSeed = null
    }
    currentInstance = instance
    let output
    try {
      output = type({ ...props })
    } finally {
      currentInstance = previous
    }
    return render(output)
  }
  const attrs = []
  const kebab = (name) => name.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'className') attrs.push(`class="${escapeHtml(value)}"`)
    else if (key === 'style') attrs.push(`style="${Object.entries(value).map(([k, v]) => `${kebab(k)}:${v}`).join(';')}"`)
    else if (key === 'title') attrs.push(`title="${escapeHtml(value)}"`)
    else if (typeof value === 'string' || typeof value === 'number') {
      attrs.push(`${/^(stroke|fill|font|text|clip|marker|stop|letter|word|dominant|alignment)/.test(key) ? kebab(key) : key}="${escapeHtml(value)}"`)
    }
  }
  return `<${type} ${attrs.join(' ')}>${children.map(render).join('')}</${type}>`
}

// 合成数据：2026 年逐日
const days = {}
const start = new Date(2026, 0, 1)
for (let i = 0; i < 308; i += 1) {
  const date = new Date(start.getTime() + i * 86_400_000)
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (i % 3 === 0) days[key] = (i % 7) + 1
}

// 直接取 client.js 里那份中文词典，截图里的文案才是真实的
const zhStart = source.indexOf('const zh = {')
const zhEnd = source.indexOf('    }', zhStart)
const ZH = zhStart >= 0 && zhEnd > zhStart ? eval(`(${source.slice(zhStart + 11, zhEnd + 5)})`) : {}
const t = (key) => ZH[key] ?? key

const localRepo = {
  id: 'r1', label: 'MyNotes', kind: 'local', source: 'D:/MyNotes', dir: 'D:/MyNotes',
  ok: true, branch: 'master', upstream: 'origin/master', behind: 0, dirty: 3, staged: 1,
  unstaged: 2, untracked: 0, ahead: 2, hasRemote: true, totalCommits: 75,
  changedFiles: [
    { code: ' M', path: 'Clippings/一些笔记.md' }, { code: 'A ', path: '学：UE5/GAS.md' }, { code: '??', path: 'tmp.md' },
  ],
  lastCommit: { date: '2026-11-04', subject: 'vault backup: 2026-11-04 00:06:12', hash: 'abc' },
}
const remoteRepo = {
  id: 'r2', label: 'Hello-World', kind: 'remote', source: 'https://github.com/octocat/Hello-World',
  dir: 'C:/cache', ok: true, bare: true, totalCommits: 5,
  lastCommit: { date: '2018-05-10', subject: 'sentence case' },
}

const state = {
  repos: [localRepo, remoteRepo],
  days,
  byRepo: { r1: days, r2: {} },
  lastCommit: { date: '2026-11-04', subject: 'vault backup: 2026-11-04 00:06:12', repoId: 'r1', repoLabel: 'MyNotes' },
  scannedAt: Date.parse('2026-11-04T13:00:00+08:00'),
  dataDir: 'C:\\Users\\you\\.dsh\\storages\\git-heatmap',
}

const dayHtml = render(React.createElement(mod.__internals.DayHeatmap, { days, year: 2026, t }))
nextSeed = { type: mod.__internals.GitHeatPanel, seed: [state, false, false, false, null, '', '', '', null, 'r1', 'day', 2026] }
const panelHtml = render(React.createElement(mod.__internals.GitHeatPanel, { t }))

const THEME = `
:root{
  --dsw-alias-bg-base:#ffffff;--dsw-alias-bg-layer-1:#ffffff;--dsw-alias-bg-layer-2:#f2f3f7;
  --dsw-alias-bg-overlay:#ffffff;--dsw-alias-border-l1:#e5e6eb;--dsw-alias-border-l2:#d0d3da;
  --dsw-alias-brand-primary:#4d6bfe;--dsw-alias-label-primary:#1d2129;--dsw-alias-label-secondary:#4e5969;
  --dsw-alias-label-tertiary:#86909c;--dsw-alias-state-error-primary:#d64545;
  --dsw-alias-state-success-primary:#40a06e;--dsw-alias-state-warn-primary:#d69b2e;
}
*{box-sizing:border-box}
body{margin:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  font-family:"Segoe UI",system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
`

const MEASURE = `
<script>
window.addEventListener('load', () => {
  const grid = document.querySelector('.ghm-day-grid')
  const cells = [...grid.children]
  const cols = cells.length / 7
  const cellRect = (col) => cells[col * 7].getBoundingClientRect()
  const rows = [0, 1, 2, 3, 4, 5, 6].map((row) => cells[row].getBoundingClientRect())
  const labels = [...document.querySelectorAll('.ghm-day-months > span')]
  const monthErrors = []
  for (const label of labels) {
    if (!label.textContent) continue
    const rect = label.getBoundingClientRect()
    let best = 0
    let bestErr = Infinity
    for (let col = 0; col < cols; col += 1) {
      const err = Math.abs(rect.left - cellRect(col).left)
      if (err < bestErr) { bestErr = err; best = col }
    }
    monthErrors.push({ text: label.textContent, col: best, dx: Number(bestErr.toFixed(2)) })
  }
  const weekLabels = [...document.querySelectorAll('.ghm-day-labels > span')]
  const weekErrors = weekLabels.map((span, i) => ({
    text: span.textContent,
    dy: Number((span.getBoundingClientRect().top - rows[i].top).toFixed(2)),
    dh: Number((span.getBoundingClientRect().height - rows[i].height).toFixed(2)),
  }))
  const out = { cols, cell: cells[0].getBoundingClientRect().width, rows: rows.length,
    monthErrors, maxMonthDx: Math.max(0, ...monthErrors.map((m) => m.dx)),
    weekErrors, maxWeekDy: Math.max(0, ...weekErrors.map((w) => Math.abs(w.dy))) }
  const pre = document.createElement('pre')
  pre.id = 'measure'
  pre.textContent = 'MEASURE=' + JSON.stringify(out)
  document.body.appendChild(pre)
})
</script>`

// 仓库行 + 提交历史（单独一页，用来检查历史列表的排版）
const SUBJECTS = [
  'feat：可拾取武器和血量道具',
  'feat：背包和快捷栏之间的 Add 和 Remove',
  'feat：背包 UI 新增快捷栏 Slot',
  'fix：热力图月份标签和点阵对不齐',
  'chore：把刷新改成只 fetch 远程条目',
  'docs：README 补截图与兼容性表',
  'refactor：扫描改用 --no-optional-locks',
  'test：补空仓库与中文路径用例',
]
const historyRows = {
  commits: SUBJECTS.map((subject, index) => ({
    hash: `abcdef${index}0123456789`,
    short: `abcdef${index}`,
    date: `2026-11-${String(10 - (index % 8)).padStart(2, '0')}T${String(9 + index).padStart(2, '0')}:24:00+08:00`,
    author: index % 3 === 0 ? 'you' : 'teammate',
    refs: index === 0 ? 'HEAD -> main, origin/main, origin/HEAD' : (index === 3 ? 'tag: v0.1.0' : ''),
    subject,
  })),
  hasMore: true,
  total: 46,
  loading: false,
  error: '',
}
const commitsHtml = render(React.createElement(mod.__internals.RepoRow, {
  repo: localRepo,
  index: 0,
  t,
  expanded: true,
  busy: false,
  onToggle: () => {},
  onRemove: () => {},
  onCommit: () => {},
  onLoadHistory: () => {},
  history: historyRows,
}))

const commitsPage = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>commits</title>
<style>${THEME}${CSS}</style></head><body style="padding:24px">
<div class="ghm-page" style="height:auto"><div class="ghm-inner"><div class="ghm-card"><div class="ghm-repo-list">${commitsHtml}</div></div></div></div>
</body></html>`

const dayPage = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>day</title>
<style>${THEME}${CSS}</style></head><body style="padding:24px">
<div class="ghm-page" style="height:auto"><div class="ghm-inner"><div class="ghm-card"><div class="ghm-heat">${dayHtml}</div></div></div></div>
${MEASURE}
</body></html>`

const panelPage = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>panel</title>
<style>${THEME}${CSS}</style></head><body style="height:1500px">${panelHtml}</body></html>`

fs.writeFileSync(new URL('day.html', out), dayPage)
fs.writeFileSync(new URL('panel.html', out), panelPage)
fs.writeFileSync(new URL('commits.html', out), commitsPage)
console.log('written', out.pathname)
