// 验证：① 刷新不 fetch 本地仓库（远端跟踪分支不动，提交数不变）；
//       ② /state 15s 内复用缓存，/refresh 强制重扫。
import { execFile } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const API = 'http://127.0.0.1:8128/git-heat/api'
const run = (args, cwd) => new Promise((resolve) => {
  execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => resolve({ ok: !error, stdout: stdout.trim(), stderr: stderr.trim() }))
})
const post = async (endpoint, body) => (await fetch(`${API}/${endpoint}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})).json()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const base = await mkdtemp(path.join(os.tmpdir(), 'ghm-refresh-'))
const upstream = path.join(base, 'upstream')
const local = path.join(base, 'local')

await run(['init', '-q', upstream])
await writeFile(path.join(upstream, 'a.txt'), 'a\n')
await run(['add', '.'], upstream)
await run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c1'], upstream)
await run(['clone', '-q', upstream, local], base)
await run(['config', 'user.email', 't@t'], local)
await run(['config', 'user.name', 't'], local)

const added = await post('add', { input: local })
if (!added.ok) throw new Error('add 失败: ' + JSON.stringify(added.error))
const id = added.value.repo.id
const before = added.value.state.repos.find((repo) => repo.id === id)
console.log('添加后: 提交数 =', before.totalCommits, '| 远端跟踪 =', (await run(['rev-parse', 'refs/remotes/origin/master'], local)).stdout.slice(0, 8))

// 上游新增一个提交
await writeFile(path.join(upstream, 'b.txt'), 'b\n')
await run(['add', '.'], upstream)
await run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'c2'], upstream)

// 缓存：15s 内 /state 应复用同一份扫描结果
const s1 = await post('state', {})
await sleep(300)
const s2 = await post('state', {})
console.log('两次 state 的 scannedAt 相同（缓存命中）:', s1.value.scannedAt === s2.value.scannedAt)

// 刷新后：本地仓库不该被 fetch
const refreshed = await post('refresh', {})
const afterRefresh = refreshed.value.state.repos.find((repo) => repo.id === id)
const trackingAfter = (await run(['rev-parse', 'refs/remotes/origin/master'], local)).stdout.slice(0, 8)
console.log('刷新后: 提交数 =', afterRefresh.totalCommits, '| 远端跟踪 =', trackingAfter, '| notes =', JSON.stringify(refreshed.value.notes))
console.log('刷新后 scannedAt 是否更新:', refreshed.value.state.scannedAt > s2.value.scannedAt)

// 用户自己 fetch 后，刷新能读到新提交
await run(['fetch', '-q', 'origin'], local)
const afterUserFetch = await post('refresh', {})
const view = afterUserFetch.value.state.repos.find((repo) => repo.id === id)
console.log('用户手动 fetch 后刷新: 提交数 =', view.totalCommits, '| 远端跟踪 =', (await run(['rev-parse', 'refs/remotes/origin/master'], local)).stdout.slice(0, 8))

await post('remove', { id })
const final = await post('state')
console.log('清理后 repos =', final.value.repos.length)
await rm(base, { recursive: true, force: true })
