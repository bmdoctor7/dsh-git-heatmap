// 浏览器半侧的离线渲染冒烟：用假 React（createElement + 迷你钩子/渲染器）把各组件
// 真跑一遍，抓未定义变量、错 props、条件分支里的语法级错误。
// 不是预览，不产出任何界面资源。
import fs from 'node:fs'
import vm from 'node:vm'

let captured = null
globalThis.window = {
  __ModuleLoader__: {
    load(spec) {
      captured = spec
    },
  },
}

const source = fs.readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8')
vm.runInThisContext(source, { filename: 'client.js' })
if (!captured) throw new Error('模块没有调用 window.__ModuleLoader__.load')

// ── 假 React ────────────────────────────────────────────────
let currentInstance = null
let nextSeed = null

const hookFns = {
  useState(initial) {
    const inst = currentInstance
    const index = inst.index++
    if (!(index in inst.state)) inst.state[index] = typeof initial === 'function' ? initial() : initial
    return [inst.state[index], (next) => {
      inst.state[index] = typeof next === 'function' ? next(inst.state[index]) : next
    }]
  },
  useMemo(factory, deps) {
    const inst = currentInstance
    const index = inst.index++
    const prev = inst.memo[index]
    const changed = !prev || !deps || !prev.deps || deps.length !== prev.deps.length
      || deps.some((dep, i) => dep !== prev.deps[i])
    if (changed) inst.memo[index] = { value: factory(), deps }
    return inst.memo[index].value
  },
  useEffect(fn, deps) {
    const inst = currentInstance
    const index = inst.index++
    const prev = inst.effects[index]
    const changed = !prev || !deps || !prev.deps || !prev.deps
      || deps.some((dep, i) => dep !== prev.deps[i])
    if (changed) {
      inst.effects[index] = { deps }
      const cleanup = fn()
      if (typeof cleanup === 'function') inst.cleanups.push(cleanup)
    }
  },
  useCallback(fn, deps) {
    return hookFns.useMemo(() => fn, deps)
  },
}

const React = {
  createElement(type, props, ...children) {
    return { type, props: props ?? {}, children }
  },
  ...hookFns,
}

const requireFn = (id) => {
  if (id === 'react') return React
  throw new Error(`测试里没有提供模块：${id}`)
}

const mod = captured.factory(requireFn)
console.log('module exports =', Object.keys(mod))

// ── 迷你渲染器 ──────────────────────────────────────────────
function render(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(render).join('')
  const { type, props, children } = node
  if (typeof type === 'function') {
    const previous = currentInstance
    const instance = { index: 0, state: {}, memo: {}, effects: {}, cleanups: [] }
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
  if (typeof type !== 'string') throw new Error(`无法渲染的类型：${String(type)}`)
  if (props.className !== undefined && typeof props.className !== 'string') {
    throw new Error(`<${type}> 的 className 不是字符串：${String(props.className)}`)
  }
  return `<${type}>${children.map(render).join('')}</${type}>`
}

const t = (key) => (key === 'weekdays' ? '一二三四五六日' : key)

// 合成数据
const days = {}
const start = new Date(2026, 0, 1)
for (let i = 0; i < 300; i += 1) {
  const date = new Date(start.getTime() + i * 86_400_000)
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  if (i % 3 === 0) days[key] = (i % 7) + 1
}

const years = [2026, 2025, 2024]

const localRepo = {
  id: 'r1', label: 'demo-repo', kind: 'local', source: 'D:\\x', dir: 'D:\\x',
  ok: true, branch: 'master', upstream: 'origin/master', behind: 1, dirty: 3, staged: 1,
  unstaged: 2, untracked: 0, ahead: 2, hasRemote: true, totalCommits: 70,
  changedFiles: [
    { code: ' M', path: 'a.cpp' }, { code: 'A ', path: 'b.cpp' }, { code: '??', path: 'c.md' },
  ],
  lastCommit: { date: '2026-11-02', subject: 'feat: 热力图', hash: 'abc' },
}
const remoteRepo = {
  id: 'r2', label: 'dsh', kind: 'remote', source: 'https://github.com/x/dsh', dir: 'C:\\cache',
  ok: true, bare: true, totalCommits: 1200, lastCommit: { date: '2026-10-01', subject: 'chore: bump' },
}

const state = {
  repos: [localRepo, remoteRepo],
  days,
  byRepo: { r1: days, r2: {} },
  lastCommit: { date: '2026-11-02', subject: 'feat: 热力图', repoId: 'r1', repoLabel: 'demo-repo' },
  scannedAt: Date.parse('2026-11-04T12:00:00+08:00'),
  dataDir: 'C:\\Users\\you\\.dsh\\storages\\git-heatmap',
}

const cases = [
  ['DayHeatmap', { days, year: 2026, t }],
  ['MonthHeatmap', { days, years, t }],
  ['YearHeatmap', { days, years, t }],
  ['RepoRow/local/dirty', { repo: localRepo, index: 0, t, expanded: true, busy: false, onToggle: () => {}, onRemove: () => {}, onCommit: () => {} }],
  ['RepoRow/local/history', {
    repo: localRepo, index: 0, t, expanded: true, busy: false,
    onToggle: () => {}, onRemove: () => {}, onCommit: () => {}, onLoadHistory: () => {},
    history: {
      commits: [
        { hash: 'abc1234def', short: 'abc1234', date: '2026-11-04T12:34:56+08:00', author: 'tester', refs: 'HEAD -> main, origin/main', subject: 'feat: 热力图' },
        { hash: 'def5678abc', short: 'def5678', date: '2026-10-01T08:00:00+08:00', author: 'tester', refs: '', subject: 'fix: 对齐' },
      ],
      hasMore: true, total: 42, loading: false, error: '',
    },
  }],
  ['RepoRow/remote/collapsed', { repo: remoteRepo, index: 1, t, expanded: false, busy: false, onToggle: () => {}, onRemove: () => {}, onCommit: () => {} }],
  ['GitHeatPanel/loading', { t }],
]

for (const [name, props] of cases) {
  const component = name.startsWith('GitHeatPanel')
    ? mod.__internals.GitHeatPanel
    : mod.__internals[name.split('/')[0]]
  const html = render(React.createElement(component, props))
  if (!html || html.length < 20) throw new Error(`${name} 渲染结果异常：${JSON.stringify(html)}`)
  console.log(`OK ${name} → ${html.length} 字符`)
}

// 带数据的面板：把 useState 的初值按顺序种进去（data / loading / refreshing / adding /
// busyRepo / error / notice / input / focus / expanded / grain / year）。
nextSeed = {
  type: mod.__internals.GitHeatPanel,
  seed: [state, false, false, false, null, '', '', '', null, 'r1', 'day', 2026],
}
const panelHtml = render(React.createElement(mod.__internals.GitHeatPanel, { t }))
if (panelHtml.length < 800) throw new Error(`数据态面板渲染过短：${panelHtml.length}`)
for (const needle of ['demo-repo', '<textarea', 'aheadCommits', 'streak']) {
  if (!panelHtml.includes(needle)) throw new Error(`数据态面板缺少 ${needle}`)
}
console.log(`OK GitHeatPanel/with-data → ${panelHtml.length} 字符`)

const streaks = mod.__internals.computeStreaks({ '2026-01-01': 1, '2026-01-02': 2, '2026-01-04': 1 })
console.log('streak sample =', streaks)
console.log('ALL OK')
