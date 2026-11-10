// 宿主半侧冒烟测试：假 ctx + 本地 http 服务，验证 /git-heat/api 的 state / add / remove。
// 仓库是脚本自己建的临时仓库，不依赖本机任何真实项目。
import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const tmp = await mkdtemp(path.join(os.tmpdir(), 'git-heat-'))
process.env.DSH_GIT_HEATMAP_DIR = tmp

const git = (args, cwd) => new Promise((resolve) => {
  execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => resolve({
    ok: error === null, stdout: stdout ?? '', stderr: stderr ?? '',
  }))
})

// 建一个有两个提交、一个未提交改动的临时仓库
const repoDir = path.join(tmp, 'sample repo')
await git(['init', '-q', repoDir], undefined)
await git(['config', 'user.email', 'test@example.com'], repoDir)
await git(['config', 'user.name', 'test'], repoDir)
await writeFile(path.join(repoDir, 'a.txt'), 'a\n')
await git(['add', '.'], repoDir)
await git(['commit', '-qm', '第一个提交'], repoDir)
await writeFile(path.join(repoDir, 'b.txt'), 'b\n')
await git(['add', '.'], repoDir)
await git(['commit', '-qm', '第二个提交'], repoDir)
await writeFile(path.join(repoDir, 'a.txt'), 'a changed\n')

const mod = await import('../lib/index.js')

const routes = []
const ctx = {
  effect(fn) {
    const off = fn()
    return typeof off === 'function' ? off : () => {}
  },
  webServer: {
    host: '127.0.0.1',
    protocol: 'http:',
    register(route) {
      routes.push(route)
      return () => {
        const index = routes.indexOf(route)
        if (index >= 0) routes.splice(index, 1)
      }
    },
  },
  get() {
    return undefined
  },
  logger: { warn: (error) => console.warn('[warn]', error) },
}

mod.apply(ctx)
console.log('inject =', mod.inject, '| routes =', routes.map((route) => `${route.kind}:${route.path}`))
if (routes.length !== 1) throw new Error('路由数量不对')

const server = http.createServer((req, res) => {
  const route = routes.find((item) => req.url === item.path || req.url.startsWith(`${item.path}/`))
  if (!route) {
    res.statusCode = 404
    res.end('no route')
    return
  }
  route.handler(req, res)
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

async function call(endpoint, body) {
  const res = await fetch(`${origin}/git-heat/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json()
  if (json.ok !== true) throw new Error(`${endpoint} 失败: ${JSON.stringify(json.error)}`)
  return json.value
}

let state = await call('state')
console.log('初始 repos =', state.repos.length, '| days =', Object.keys(state.days).length)
if (state.repos.length !== 0) throw new Error('初始应为空')

const added = await call('add', { input: repoDir })
state = added.state
const view = state.repos[0]
console.log('扫描结果:', JSON.stringify({
  ok: view.ok,
  bare: view.bare,
  branch: view.branch,
  dirty: view.dirty,
  changedFiles: view.changedFiles,
  totalCommits: view.totalCommits,
  firstDay: view.firstDay,
  lastCommit: view.lastCommit,
}))
if (!view.ok) throw new Error('仓库扫描失败: ' + view.error)
if (view.totalCommits !== 2) throw new Error('提交数应为 2，实际 ' + view.totalCommits)
if (view.dirty !== 1) throw new Error('未提交文件应为 1，实际 ' + view.dirty)
if (state.lastCommit?.repoLabel !== 'sample repo') throw new Error('最近一次提交归属不对')

const bad = await fetch(`${origin}/git-heat/api/add`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ input: path.join(tmp, 'not-a-repo') }),
}).then((res) => res.json())
console.log('坏路径 ->', bad.ok, bad.error?.message)
if (bad.ok) throw new Error('坏路径不应成功')

const forbidden = await new Promise((resolve) => {
  const req = http.request({
    host: '127.0.0.1',
    port: server.address().port,
    path: '/git-heat/api/state',
    method: 'GET',
    headers: { host: 'evil.example.com' },
  }, (res) => {
    let body = ''
    res.on('data', (chunk) => { body += chunk })
    res.on('end', () => resolve({ status: res.statusCode, body }))
  })
  req.end()
})
console.log('非信任 Host ->', forbidden.status)
if (forbidden.status !== 403) throw new Error('非信任 Host 应返回 403')

await call('remove', { id: view.id })
state = await call('state')
console.log('remove 之后 repos =', state.repos.length)
if (state.repos.length !== 0) throw new Error('移除后应为空')

server.close()
console.log('OK')
