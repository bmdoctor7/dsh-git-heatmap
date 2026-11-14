/**
 * dsh-git-heatmap —— 宿主半侧。
 *
 * 只做两件事：
 *   1. 维护“选中的仓库清单”（本地路径 / 远程地址），存成 JSON 配置；
 *   2. 在 /git-heat/api 前缀路由上提供 git 扫描（逐日提交数、最近一次提交、
 *      工作区脏文件、未推送提交数）以及「提交 / 推送」两个动作。
 *
 * 设计取舍：
 *   - 远程仓库不依赖任何托管平台的 REST API，统一用 `git clone --bare
 *     --filter=blob:none` 落到插件自己的缓存目录再读 `git log`。这样 GitHub /
 *     Gitee / 自建 GitLab / ssh 地址都走同一条路，也不需要用户配 token；
 *     代价是首次要拉一次历史（无 blob，通常几 MB）。
 *   - 提交 / 推送走 `git add -A` + `git commit` + `git push`，只对本地仓库开放；
 *     永远不 force，参数一律走 execFile 数组，不拼 shell 字符串。
 *   - 扫描结果内存缓存 15s，避免面板反复挂载时把大仓库翻来覆去地扫。
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const name = 'dsh-git-heatmap'

/** 需要 webServer 才能挂 /git-heat/api 路由。 */
export const inject = ['webServer']

/** 路由前缀。浏览器半侧用文档相对路径 `git-heat/api/...` 访问。 */
const API_PATH = '/git-heat/api'

/** 扫描缓存有效期。 */
const SCAN_TTL_MS = 15_000

/** 请求体上限。 */
const MAX_BODY_BYTES = 256 * 1024

/** 仓库配置里最多保留的条数，防止误操作把面板拖垮。 */
const MAX_REPOS = 40

// ─────────────────────────────────────────────────────────────
// 进程工具
// ─────────────────────────────────────────────────────────────

let gitBinPromise = null

/** 找 git 可执行文件：先试 PATH，再试 Windows 上常见的安装位置。 */
function resolveGit() {
  if (gitBinPromise) return gitBinPromise
  const candidates = [
    process.env.GIT_EXE,
    'git',
    'C:\\Program Files\\Git\\cmd\\git.exe',
    'C:\\Program Files\\Git\\bin\\git.exe',
    'C:\\Program Files (x86)\\Git\\cmd\\git.exe',
    'C:\\Program Files (x86)\\Git\\bin\\git.exe',
  ].filter(Boolean)
  gitBinPromise = (async () => {
    for (const candidate of candidates) {
      const probe = await runRaw(candidate, ['--version'], { timeout: 8000 })
      if (probe.ok) return candidate
    }
    throw new Error('找不到 git 可执行文件（请确认 git 已安装并在 PATH 中）')
  })()
  return gitBinPromise
}

function runRaw(bin, args, opts = {}) {
  return new Promise((resolve) => {
    execFile(
      bin,
      args,
      {
        cwd: opts.cwd,
        timeout: opts.timeout ?? 120_000,
        maxBuffer: 256 * 1024 * 1024,
        windowsHide: true,
        encoding: 'utf8',
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_PAGER: 'cat',
          GIT_ASKPASS: 'echo',
        },
      },
      (error, stdout, stderr) => {
        resolve({
          ok: error === null,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          error,
        })
      },
    )
  })
}

/** 跑一条 git 命令；core.quotepath=false 让中文 / 空格路径保持可读。 */
async function git(cwd, args, opts = {}) {
  const bin = await resolveGit()
  return runRaw(bin, ['-c', 'core.quotepath=false', ...args], { ...opts, cwd })
}

/** 把 git 的 stderr 收拾成一句话。 */
function cleanGitError(stderr) {
  const text = String(stderr || '').trim()
  if (!text) return '未知错误'
  const first = text.split('\n').map((line) => line.replace(/^(fatal|error|warning):\s*/i, '').trim()).filter(Boolean)[0]
  return first || text
}

// ─────────────────────────────────────────────────────────────
// 数据目录与配置
// ─────────────────────────────────────────────────────────────

function dshHome() {
  return process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
}

function dataDir() {
  return process.env.DSH_GIT_HEATMAP_DIR || path.join(dshHome(), 'storages', 'git-heatmap')
}

function configPath() {
  return path.join(dataDir(), 'config.json')
}

function cloneDir(id) {
  return path.join(dataDir(), 'repos', id)
}

function repoId(kind, source) {
  return 'r' + createHash('sha1').update(`${kind}::${source}`).digest('hex').slice(0, 12)
}

async function dirExists(target) {
  try {
    const stat = await fs.stat(target)
    return stat.isDirectory()
  } catch {
    return false
  }
}

/** 配置里的一条仓库记录：只保留可序列化的四个字段。 */
function normalizeRepo(value) {
  if (!value || typeof value !== 'object') return null
  const kind = value.kind === 'remote' ? 'remote' : 'local'
  const source = String(value.source ?? '').trim()
  if (!source) return null
  const id = typeof value.id === 'string' && /^r[0-9a-f]{12}$/.test(value.id) ? value.id : repoId(kind, source)
  const label = String(value.label ?? '').trim() || (kind === 'local' ? path.basename(source) || source : source)
  return { id, kind, source, label }
}

let writeChain = Promise.resolve()

function saveRepos(repos) {
  const payload = JSON.stringify({ version: 1, repos }, null, 2)
  const task = writeChain.then(async () => {
    await fs.mkdir(dataDir(), { recursive: true })
    const tmp = `${configPath()}.tmp`
    await fs.writeFile(tmp, payload, 'utf8')
    await fs.rename(tmp, configPath())
  })
  writeChain = task.catch(() => {})
  return task
}

async function loadRepos() {
  let text
  try {
    text = await fs.readFile(configPath(), 'utf8')
  } catch {
    return []
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return []
  }
  const list = Array.isArray(parsed?.repos) ? parsed.repos : []
  const out = []
  const seen = new Set()
  for (const item of list) {
    const repo = normalizeRepo(item)
    if (!repo || seen.has(repo.id)) continue
    seen.add(repo.id)
    out.push(repo)
  }
  return out.slice(0, MAX_REPOS)
}

// ─────────────────────────────────────────────────────────────
// 扫描：一个仓库 → 逐日提交数 + 状态
// ─────────────────────────────────────────────────────────────

async function scanRepo(repo) {
  const dir = repo.kind === 'local' ? repo.source : cloneDir(repo.id)
  const view = {
    id: repo.id,
    label: repo.label,
    kind: repo.kind,
    source: repo.source,
    dir,
    ok: false,
    error: null,
    bare: repo.kind === 'remote',
    branch: null,
    upstream: null,
    hasRemote: false,
    dirty: 0,
    staged: 0,
    unstaged: 0,
    untracked: 0,
    changedFiles: [],
    ahead: null,
    behind: null,
    lastCommit: null,
    totalCommits: 0,
    firstDay: null,
  }

  if (!(await dirExists(dir))) {
    view.error = repo.kind === 'remote' ? '尚未克隆，点「刷新」拉取' : '目录不存在'
    return view
  }

  const isRepo = await git(dir, ['rev-parse', '--git-dir'])
  if (!isRepo.ok) {
    view.error = '不是一个 git 仓库'
    return view
  }

  const bareProbe = await git(dir, ['rev-parse', '--is-bare-repository'])
  view.bare = bareProbe.ok && bareProbe.stdout.trim() === 'true'

  // 逐日提交数：--all 覆盖所有本地分支与已取回的远端分支，一个提交只出现一次。
  const log = await git(dir, ['log', '--all', '--date=short', '--pretty=format:%ad'], { timeout: 240_000 })
  if (!log.ok && !view.bare && /does not have any commits|unknown revision/i.test(log.stderr)) {
    view.ok = true
    return view
  }
  if (!log.ok) {
    view.error = cleanGitError(log.stderr)
    return view
  }

  const days = Object.create(null)
  let total = 0
  let firstDay = null
  for (const raw of log.stdout.split('\n')) {
    const day = raw.trim()
    if (!day) continue
    days[day] = (days[day] ?? 0) + 1
    total += 1
    if (firstDay === null || day < firstDay) firstDay = day
  }
  view.totalCommits = total
  view.days = days
  view.firstDay = firstDay

  const last = await git(dir, ['log', '--all', '-1', '--date=short', '--pretty=format:%H%x09%ad%x09%s'], { timeout: 60_000 })
  if (last.ok && last.stdout.trim()) {
    const [hash, date, ...rest] = last.stdout.split('\t')
    view.lastCommit = { hash: (hash ?? '').trim(), date: (date ?? '').trim(), subject: rest.join('\t').trim() }
  }

  if (view.bare) {
    view.ok = true
    return view
  }

  // 工作区状态（仅工作树仓库有意义）。
  //
  // `--no-optional-locks` 是这里的重点：普通 `git status` 会顺手刷新
  // .git/index 的 stat 缓存（实测 index 350→458 字节，mtime 也变），
  // 那是扫描唯一会写进用户仓库的地方。加上这个全局开关后 git 放弃
  // 这类"可选锁/可选写入"，扫描就是纯只读的。老版本 git 不认这个
  // 开关（<2.15）时退回普通 status，功能不受影响。
  let status = await git(dir, ['--no-optional-locks', 'status', '--porcelain'], { timeout: 120_000 })
  if (!status.ok && /unknown option|unrecognized/i.test(status.stderr)) {
    status = await git(dir, ['status', '--porcelain'], { timeout: 120_000 })
  }
  if (status.ok) {
    for (const line of status.stdout.split('\n')) {
      if (!line.trim()) continue
      const x = line[0]
      const y = line[1]
      const filePath = line.slice(3).trim()
      if (x === '?' && y === '?') {
        view.untracked += 1
      } else {
        if (x !== ' ') view.staged += 1
        if (y !== ' ') view.unstaged += 1
      }
      if (view.changedFiles.length < 300) view.changedFiles.push({ code: line.slice(0, 2), path: filePath })
    }
    view.dirty = view.changedFiles.length
  }

  const branch = await git(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  if (branch.ok && branch.stdout.trim()) view.branch = branch.stdout.trim()

  const upstream = await git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  let compareRef = null
  if (upstream.ok && upstream.stdout.trim()) {
    view.upstream = upstream.stdout.trim()
    compareRef = '@{u}'
  } else if (view.branch) {
    const remoteBranch = `refs/remotes/origin/${view.branch}`
    const existsRemote = await git(dir, ['rev-parse', '--verify', '--quiet', remoteBranch])
    if (existsRemote.ok) {
      view.upstream = `origin/${view.branch}`
      compareRef = remoteBranch
    }
  }
  if (compareRef) {
    const counts = await git(dir, ['rev-list', '--left-right', '--count', `HEAD...${compareRef}`])
    if (counts.ok) {
      const [ahead, behind] = counts.stdout.trim().split(/\s+/)
      view.ahead = Number(ahead) || 0
      view.behind = Number(behind) || 0
    }
  }

  const remotes = await git(dir, ['remote'])
  view.hasRemote = remotes.ok && remotes.stdout.trim() !== ''
  view.ok = true
  return view
}

/** 扫描全部仓库，并顺带把逐日数据聚合成「全部」视图。 */
async function scanAll(repos) {
  const views = await Promise.all(repos.map((repo) => scanRepo(repo).catch((err) => ({
    id: repo.id,
    label: repo.label,
    kind: repo.kind,
    source: repo.source,
    dir: repo.kind === 'local' ? repo.source : cloneDir(repo.id),
    ok: false,
    error: err instanceof Error ? err.message : String(err),
    dirty: 0,
    changedFiles: [],
    totalCommits: 0,
  }))))

  const days = Object.create(null)
  const byRepo = Object.create(null)
  let lastCommit = null
  for (const view of views) {
    byRepo[view.id] = view.days ?? {}
    for (const [day, count] of Object.entries(view.days ?? {})) days[day] = (days[day] ?? 0) + count
    const candidate = view.lastCommit
    if (candidate && (!lastCommit || candidate.date > lastCommit.date)) {
      lastCommit = { ...candidate, repoId: view.id, repoLabel: view.label }
    }
  }

  return {
    repos: views.map(({ days: _days, ...rest }) => rest),
    days,
    byRepo,
    lastCommit,
    scannedAt: Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────
// 动作：添加 / 移除 / 刷新 / 提交
// ─────────────────────────────────────────────────────────────

function httpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function cloneArgs(source, dir) {
  return ['clone', '--bare', '--filter=blob:none', '--quiet', source, dir]
}

async function cloneRemote(repo, dir) {
  const bin = await resolveGit()
  await fs.mkdir(path.dirname(dir), { recursive: true })
  await fs.rm(dir, { recursive: true, force: true })
  let result = await runRaw(bin, cloneArgs(repo.source, dir), { timeout: 900_000 })
  if (!result.ok) {
    // 老服务器 / 某些私有实现不支持 partial clone，退回完整 bare 克隆。
    await fs.rm(dir, { recursive: true, force: true })
    result = await runRaw(bin, ['clone', '--bare', '--quiet', repo.source, dir], { timeout: 900_000 })
  }
  if (!result.ok) {
    await fs.rm(dir, { recursive: true, force: true })
    throw httpError(400, `克隆失败：${cleanGitError(result.stderr)}`)
  }
}

async function addRepo(input) {
  const raw = String(input ?? '').trim().replace(/^["']|["']$/g, '')
  if (!raw) throw httpError(400, '请输入本地仓库路径或远程仓库地址')

  let kind
  let source
  if (await dirExists(raw)) {
    const real = await fs.realpath(raw)
    const probe = await git(real, ['rev-parse', '--git-dir'])
    if (!probe.ok) throw httpError(400, '该目录不是一个 git 仓库')
    kind = 'local'
    source = real
  } else if (/^(https?:\/\/|git@|ssh:\/\/|git:\/\/)/i.test(raw)) {
    kind = 'remote'
    source = raw
  } else {
    throw httpError(400, '路径不存在，也不是可识别的远程仓库地址（需以 http(s):// 或 git@ 开头）')
  }

  const repos = await loadRepos()
  const id = repoId(kind, source)
  if (repos.some((repo) => repo.id === id)) throw httpError(409, '这个仓库已经添加过了')
  if (repos.length >= MAX_REPOS) throw httpError(400, `最多只能添加 ${MAX_REPOS} 个仓库`)

  const repo = {
    id,
    kind,
    source,
    label: kind === 'local' ? path.basename(source) || source : source.replace(/\/+$/, '').split('/').pop()?.replace(/\.git$/i, '') || source,
  }
  if (kind === 'remote') await cloneRemote(repo, cloneDir(id))
  await saveRepos([...repos, repo])
  return repo
}

async function removeRepo(id) {
  const repos = await loadRepos()
  const target = repos.find((repo) => repo.id === id)
  if (!target) throw httpError(404, '仓库不在列表里')
  await saveRepos(repos.filter((repo) => repo.id !== id))
  if (target.kind === 'remote') {
    // 远端仓库的克隆是我们自己的缓存，移除时一并清掉，避免 D 盘里留一堆裸库。
    await fs.rm(cloneDir(id), { recursive: true, force: true }).catch(() => {})
  }
  return target
}

/** 刷新：只对「远程条目」fetch（没有克隆就先克隆）。
 *
 *  本地仓库一律不 fetch —— 插件对本地仓库只重扫已有的历史，不往用户仓库里
 *  拉对象、不动 refs/remotes。想让本地仓库看到远端新提交，由用户自己在终端
 *  （或其它客户端）fetch，之后再点一次刷新即可。 */
async function refreshRemotes(repos) {
  const notes = []
  await Promise.all(repos.filter((repo) => repo.kind === 'remote').map(async (repo) => {
    try {
      const dir = cloneDir(repo.id)
      if (!(await dirExists(dir))) {
        await cloneRemote(repo, dir)
        notes.push({ id: repo.id, level: 'ok', message: `${repo.label}：已完成首次克隆` })
        return
      }
      const fetched = await git(dir, ['fetch', '--all', '--prune', '--quiet'], { timeout: 600_000 })
      if (!fetched.ok) notes.push({ id: repo.id, level: 'error', message: `${repo.label}：拉取失败（${cleanGitError(fetched.stderr)}）` })
    } catch (err) {
      notes.push({ id: repo.id, level: 'error', message: `${repo.label}：${err instanceof Error ? err.message : String(err)}` })
    }
  }))
  return notes
}

async function commitRepo(id, message, push) {
  const repos = await loadRepos()
  const repo = repos.find((item) => item.id === id)
  if (!repo) throw httpError(404, '仓库不在列表里')
  if (repo.kind !== 'local') throw httpError(400, '远程仓库是只读的裸克隆，不能在这里提交')

  const text = String(message ?? '').trim()
  const current = await scanRepo(repo)
  if (!current.ok) throw httpError(400, current.error ?? '仓库状态不可用')

  const output = []
  let committed = false
  if (current.dirty > 0) {
    if (!text) throw httpError(400, '有未提交的改动，请填写提交信息')
    const staged = await git(repo.source, ['add', '-A'])
    if (!staged.ok) throw httpError(400, `暂存失败：${cleanGitError(staged.stderr)}`)
    const commit = await git(repo.source, ['commit', '-m', text], { timeout: 120_000 })
    if (!commit.ok) throw httpError(400, `提交失败：${cleanGitError(commit.stderr)}`)
    output.push(commit.stdout.trim() || commit.stderr.trim())
    committed = true
  }

  let pushed = false
  if (push) {
    if (current.ahead === 0 && !committed) throw httpError(400, '没有需要推送的提交')
    const hasUpstream = typeof current.upstream === 'string' && current.upstream !== ''
    const pushArgs = hasUpstream ? ['push'] : ['push', '-u', 'origin', 'HEAD']
    if (!hasUpstream && !current.hasRemote) throw httpError(400, '这个仓库没有配置远端，无法推送')
    const result = await git(repo.source, pushArgs, { timeout: 300_000 })
    if (!result.ok) throw httpError(400, `推送失败：${cleanGitError(result.stderr)}`)
    output.push(result.stdout.trim() || result.stderr.trim())
    pushed = true
  }

  if (!committed && !pushed) throw httpError(400, '没有需要提交或推送的改动')
  return { ok: true, committed, pushed, output: output.filter(Boolean).join('\n') }
}

/** 读某个仓库的提交历史（只读，不含 diff）。
 *
 *  `git log --all --decorate=short` 按提交时间倒序输出；每个字段用  分隔、
 *  每条记录用  结尾，这样 commit message 里出现制表符/换行也不会把解析搞乱。
 *  `--skip` 做分页，`-n limit+1` 用来判断还有没有下一页。 */
async function logCommits(id, options) {
  const repos = await loadRepos()
  const repo = repos.find((item) => item.id === id)
  if (!repo) throw httpError(404, '仓库不在列表里')

  const dir = repo.kind === 'local' ? repo.source : cloneDir(repo.id)
  if (!(await dirExists(dir))) {
    throw httpError(400, repo.kind === 'remote' ? '尚未克隆，点刷新拉取' : '目录不存在')
  }

  const limit = Math.min(200, Math.max(1, Number(options?.limit) || 40))
  const skip = Math.min(200_000, Math.max(0, Number(options?.skip) || 0))
  const format = ['%H', '%h', '%ad', '%an', '%D', '%s'].join('%x1f') + '%x1e'

  const result = await git(dir, [
    '--no-optional-locks',
    'log',
    '--all',
    '--decorate=short',
    '--date=iso-strict',
    `--pretty=format:${format}`,
    '-n', String(limit + 1),
    '--skip', String(skip),
  ], { timeout: 120_000 })

  if (!result.ok) {
    if (/does not have any commits|unknown revision|bad default revision/i.test(result.stderr)) {
      return { repo: { id: repo.id, label: repo.label }, commits: [], hasMore: false, total: 0 }
    }
    throw httpError(400, cleanGitError(result.stderr))
  }

  const records = result.stdout.split('').map((chunk) => chunk.trim()).filter(Boolean)
  const commits = records.slice(0, limit).map((record) => {
    const [hash, short, date, author, refs, ...rest] = record.split('')
    return {
      hash: hash ?? '',
      short: short ?? '',
      date: date ?? '',
      author: author ?? '',
      refs: (refs ?? '').trim(),
      subject: rest.join('').trim(),
    }
  })

  const countResult = await git(dir, ['rev-list', '--count', '--all'], { timeout: 60_000 })
  const total = countResult.ok ? (Number(countResult.stdout.trim()) || 0) : null

  return {
    repo: { id: repo.id, label: repo.label },
    commits,
    hasMore: records.length > limit,
    total,
  }
}

// ─────────────────────────────────────────────────────────────
// 浏览器信任栅栏（与官方 /api 网关同样的三道检查）
// ─────────────────────────────────────────────────────────────

function loopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]') return true
  const parts = hostname.split('.')
  return parts.length === 4 && parts[0] === '127' && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

function parseAuthority(value) {
  try {
    return new URL(`http://${value}`)
  } catch {
    return undefined
  }
}

function isTrustedRequest(ctx, req) {
  const header = req.headers.host
  const host = String(Array.isArray(header) ? header[0] : header ?? '').trim().toLowerCase()
  if (!host) return false
  const hostUrl = parseAuthority(host)
  if (!hostUrl) return false

  const bindHost = String(ctx.webServer?.host ?? '').replace(/%.*$/, '').toLowerCase()
  let trusted = loopbackHostname(hostUrl.hostname)
  if (!trusted && bindHost && !['0.0.0.0', '::', '::ffff:0.0.0.0'].includes(bindHost)) {
    const bindUrl = parseAuthority(bindHost.includes(':') ? `[${bindHost}]` : bindHost)
    trusted = bindUrl !== undefined && bindUrl.hostname === hostUrl.hostname
  }
  if (!trusted) {
    for (const service of ['webStartup', 'webRuntime']) {
      let list
      try {
        list = ctx.get(service)?.trustedHosts
      } catch {
        list = undefined
      }
      if (!Array.isArray(list)) continue
      trusted = list.some((entry) => {
        const entryUrl = parseAuthority(String(entry))
        return entryUrl !== undefined && entryUrl.hostname === hostUrl.hostname
      })
      if (trusted) break
    }
  }
  if (!trusted) return false

  const site = req.headers['sec-fetch-site']
  if ((Array.isArray(site) ? site[0] : site) === 'cross-site') return false

  const origin = req.headers.origin
  const originValue = Array.isArray(origin) ? origin[0] : origin
  if (originValue === undefined) return true
  try {
    const originUrl = new URL(originValue)
    if (originUrl.protocol !== 'http:' && originUrl.protocol !== 'https:') return false
    return originUrl.host === hostUrl.host
  } catch {
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// HTTP 层
// ─────────────────────────────────────────────────────────────

function writeJson(res, value, status = 200) {
  res.statusCode = status
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(value))
}

function writeOk(res, value) {
  writeJson(res, { ok: true, value })
}

function writeFail(res, status, message, code = 'git_heatmap_error') {
  writeJson(res, { ok: false, error: { code, message } }, status)
}

async function readBody(req) {
  let text = ''
  let bytes = 0
  for await (const chunk of req) {
    bytes += typeof chunk === 'string' ? Buffer.byteLength(chunk) : chunk.byteLength
    if (bytes > MAX_BODY_BYTES) throw httpError(413, '请求体过大')
    text += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8')
  }
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw httpError(400, '请求体不是合法 JSON')
  }
}

function createApi(ctx) {
  let cache = null

  const invalidate = () => {
    cache = null
  }

  const state = async (force) => {
    if (!force && cache && Date.now() - cache.scannedAt < SCAN_TTL_MS) return cache
    const repos = await loadRepos()
    const value = await scanAll(repos)
    value.dataDir = dataDir()
    cache = value
    return value
  }

  return async function handle(req, res) {
    if (!isTrustedRequest(ctx, req)) {
      writeFail(res, 403, 'untrusted host')
      return
    }
    const url = String(req.url ?? '')
    const pathname = url.split(/[?#]/, 1)[0] ?? ''
    const method = String(req.method ?? 'GET').toUpperCase()
    const endpoint = pathname.startsWith(`${API_PATH}/`) ? pathname.slice(API_PATH.length + 1) : ''

    try {
      // 面板挂载走缓存：15s 内重复打开、或刚点完增删改，直接复用上次扫描结果。
      // 真正的"去看现在什么状态"由 refresh 负责，它跑 state(true) 强制重扫。
      if (endpoint === 'state' && (method === 'GET' || method === 'POST')) {
        writeOk(res, await state(false))
        return
      }
      if (endpoint === 'add' && method === 'POST') {
        const body = await readBody(req)
        const repo = await addRepo(body.input)
        invalidate()
        writeOk(res, { repo, state: await state(true) })
        return
      }
      if (endpoint === 'remove' && method === 'POST') {
        const body = await readBody(req)
        await removeRepo(String(body.id ?? ''))
        invalidate()
        writeOk(res, await state(true))
        return
      }
      if (endpoint === 'refresh' && method === 'POST') {
        const repos = await loadRepos()
        const notes = await refreshRemotes(repos)
        invalidate()
        writeOk(res, { notes, state: await state(true) })
        return
      }
      if (endpoint === 'log' && method === 'POST') {
        const body = await readBody(req)
        writeOk(res, await logCommits(String(body.id ?? ''), body))
        return
      }
      if (endpoint === 'commit' && method === 'POST') {
        const body = await readBody(req)
        const result = await commitRepo(String(body.id ?? ''), body.message, body.push === true)
        invalidate()
        writeOk(res, { ...result, state: await state(true) })
        return
      }
      writeFail(res, 404, `未知接口 ${pathname}`, 'not_found')
    } catch (err) {
      const status = typeof err?.status === 'number' ? err.status : 500
      if (status >= 500) {
        try {
          ctx.logger?.warn(err instanceof Error ? err : new Error(String(err)))
        } catch {
          /* logger 不是必须的 */
        }
      }
      writeFail(res, status, status >= 500 ? '内部错误' : (err instanceof Error ? err.message : String(err)))
    }
  }
}

export function apply(ctx) {
  const api = createApi(ctx)
  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: API_PATH, handler: api }),
    'dsh-git-heatmap: routes',
  )
}
