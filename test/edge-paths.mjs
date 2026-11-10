// 兼容性边界测试：带空格/中文的路径、空仓库（无提交）。
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const API = 'http://127.0.0.1:8128/git-heat/api'
const run = (args, cwd) => new Promise((resolve) => {
  execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }))
})
const post = async (endpoint, body) => {
  const res = await fetch(`${API}/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return res.json()
}

const base = await mkdtemp(path.join(os.tmpdir(), 'ghm-edge-'))
const spaced = path.join(base, '测试 目录', 'repo a')
const empty = path.join(base, '空 仓库')

await mkdir(spaced, { recursive: true })
await mkdir(empty, { recursive: true })
await run(['init', '-q'], spaced)
await run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', '第一个提交'], spaced)
await run(['init', '-q'], empty)

const ids = []
for (const [label, dir] of [['带空格+中文路径', spaced], ['空仓库', empty]]) {
  const added = await post('add', { input: dir })
  if (!added.ok) {
    console.log(`${label}: 添加失败 ->`, added.error.message)
    continue
  }
  ids.push(added.value.repo.id)
  const view = added.value.state.repos.find((repo) => repo.id === added.value.repo.id)
  console.log(`${label}: ok=${view.ok} error=${view.error} total=${view.totalCommits} days=${Object.keys(added.value.repo.days ?? {})} 路径回读=${view.dir === dir}`)
}

for (const id of ids) await post('remove', { id })
const final = await post('state')
console.log('清理后 repos =', final.value.repos.length)
await writeFile(path.join(os.tmpdir(), 'ghm-edge-done.txt'), 'ok')
await rm(base, { recursive: true, force: true })
