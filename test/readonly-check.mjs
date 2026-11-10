// 端到端验证：通过正在运行的插件扫描一个仓库，确认 .git/index 不被写。
import { execFile } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const API = 'http://127.0.0.1:8128/git-heat/api'
const run = (args, cwd) => new Promise((resolve) => {
  execFile('git', args, { cwd, windowsHide: true }, (error, stdout, stderr) => resolve({ ok: !error, stdout, stderr }))
})
const post = async (endpoint, body) => (await fetch(`${API}/${endpoint}`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body ?? {}),
})).json()

const base = await mkdtemp(path.join(os.tmpdir(), 'ghm-readonly-'))
const dir = path.join(base, 'repo')
await run(['init', '-q'], base) // 占位，真正仓库在 repo 子目录
await rm(dir, { recursive: true, force: true }).catch(() => {})
await run(['init', '-q', dir])
await writeFile(path.join(dir, 'a.txt'), 'hi\n')
await run(['add', 'a.txt'], dir)
await run(['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], dir)
// 制造一个未提交改动，让 status 真的有内容要算（这最容易触发索引刷新）
await writeFile(path.join(dir, 'a.txt'), 'hi\nchanged\n')

const indexBefore = await stat(path.join(dir, '.git', 'index'))
await new Promise((resolve) => setTimeout(resolve, 1200))

const added = await post('add', { input: dir })
if (!added.ok) throw new Error('add 失败: ' + JSON.stringify(added.error))
const view = added.value.state.repos.find((repo) => repo.id === added.value.repo.id)
console.log('扫描结果: dirty =', view.dirty, '| changedFiles =', JSON.stringify(view.changedFiles), '| ok =', view.ok)

await post('state', {})
await post('state', {})

const indexAfter = await stat(path.join(dir, '.git', 'index'))
console.log('index 大小:', indexBefore.size, '→', indexAfter.size, indexBefore.size === indexAfter.size ? '（未变）' : '（变了！）')
console.log('index mtime:', indexBefore.mtimeMs, '→', indexAfter.mtimeMs, indexBefore.mtimeMs === indexAfter.mtimeMs ? '（未变）' : '（变了！）')

await post('remove', { id: view.id })
const final = await post('state')
console.log('清理后 repos =', final.value.repos.length)
await rm(base, { recursive: true, force: true })
