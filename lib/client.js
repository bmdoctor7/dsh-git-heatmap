/**
 * dsh-git-heatmap —— 浏览器半侧。
 *
 * 两个注册点：
 *   - `sidebar.panellist`：左侧栏「Git 热力图」入口（一个独立的图标位，不和别的
 *     插件的 footer action 抢宽度）；
 *   - `main`：左侧栏入口点开的整页面板（key 与侧栏 id 相同）。
 * 数据全部来自宿主半侧注册的 /git-heat/api 前缀路由，用文档相对路径访问。
 *
 * 这里刻意不写 JSX：插件随包发布的是纯 JS（无构建步骤），组件用
 * React.createElement 组织。
 */
window.__ModuleLoader__.load({
  id: 'dsh-git-heatmap',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const PANEL_ID = 'git-heatmap'
    const PANEL_ORDER = 40
    const NS = 'gitHeatmap'
    const STYLE_ID = 'dsh-git-heatmap-style'

    // ── 文案 ────────────────────────────────────────────────
    const zh = {
      nav: 'Git 热力图',
      title: 'Git 热力图',
      subtitle: '汇总多个本地 / 远程仓库的提交记录，按日、月、年查看',
      refresh: '刷新',
      refreshHint: '刷新：拉取远程仓库，本地仓库只重扫历史',
      refreshing: '刷新中…',
      scanning: '正在扫描仓库…',
      addPlaceholder: '本地仓库路径，或远程地址（https://… / git@…）',
      add: '添加',
      adding: '添加中…',
      all: '全部',
      commits: '提交',
      totalCommits: '总提交',
      lastCommit: '最近一次提交',
      noCommit: '还没有提交记录',
      streak: '连续提交',
      currentStreak: '当前',
      longestStreak: '最长',
      pending: '待处理',
      dirtyFiles: '未提交文件',
      aheadCommits: '未推送',
      clean: '干净',
      day: '日',
      month: '月',
      year: '年',
      repos: '仓库',
      local: '本地',
      remote: '远程',
      branch: '分支',
      upstream: '上游',
      behind: '落后',
      changedFiles: '改动文件',
      moreFiles: '还有 {n} 个文件…',
      commitMessage: '提交信息',
      commitMessagePlaceholder: '描述这次改动（提交时必填）',
      doCommit: '提交',
      doCommitPush: '提交并推送',
      doPush: '推送',
      remove: '移除',
      removeConfirm: '从列表移除这个仓库？（不会删除仓库本身）',
      empty: '还没有添加仓库',
      emptyHint: '在上面的输入框里填本地仓库路径或远程地址，添加后就能看到热力图。',
      errorPrefix: '操作失败：',
      noChanges: '工作区没有改动',
      remoteReadonly: '远程仓库是只读的裸克隆，不能在这里提交',
      commitDone: '已提交',
      pushDone: '已推送',
      commitsUnit: '次提交',
      dataDir: '数据目录',
      legendLess: '少',
      legendMore: '多',
      clonedNote: '已完成首次克隆',
      days: '天',
      since: '起始于',
      lastScan: '扫描于',
      history: '提交历史',
      loadHistory: '查看提交历史',
      reloadHistory: '重新加载',
      loadMore: '加载更多',
      loading: '加载中…',
      noCommits: '这个仓库还没有提交',
      commitsTotal: '共 {n} 条',
      noSubject: '（无提交信息）',
      refreshed: '已刷新',
      added: '已添加',
      removed: '已移除',
      done: '完成',
      monthSuffix: '月',
      weekdays: '一二三四五六日',
    }

    const en = {
      nav: 'Git heatmap',
      title: 'Git heatmap',
      subtitle: 'Commits from several local and remote repositories in one GitHub-style heatmap',
      refresh: 'Refresh',
      refreshHint: 'Refresh: fetch remote entries; local repositories are only re-scanned',
      refreshing: 'Refreshing…',
      scanning: 'Scanning repositories…',
      addPlaceholder: 'Local repository path, or remote URL (https://… / git@…)',
      add: 'Add',
      adding: 'Adding…',
      all: 'All',
      commits: 'commits',
      totalCommits: 'Total commits',
      lastCommit: 'Latest commit',
      noCommit: 'No commits yet',
      streak: 'Streak',
      currentStreak: 'Current',
      longestStreak: 'Longest',
      pending: 'Pending',
      dirtyFiles: 'uncommitted',
      aheadCommits: 'unpushed',
      clean: 'clean',
      day: 'Day',
      month: 'Month',
      year: 'Year',
      repos: 'Repositories',
      local: 'local',
      remote: 'remote',
      branch: 'branch',
      upstream: 'upstream',
      behind: 'behind',
      changedFiles: 'Changed files',
      moreFiles: '{n} more files…',
      commitMessage: 'Commit message',
      commitMessagePlaceholder: 'Describe this change (required to commit)',
      doCommit: 'Commit',
      doCommitPush: 'Commit & push',
      doPush: 'Push',
      remove: 'Remove',
      removeConfirm: 'Remove this repository from the list? The repository itself stays untouched.',
      empty: 'No repositories yet',
      emptyHint: 'Paste a local repository path or a remote URL above to start the heatmap.',
      errorPrefix: 'Failed: ',
      noChanges: 'Working tree is clean',
      remoteReadonly: 'Remote entries are read-only bare clones; commit from a local repository',
      commitDone: 'Committed',
      pushDone: 'Pushed',
      commitsUnit: 'commits',
      dataDir: 'Data dir',
      legendLess: 'Less',
      legendMore: 'More',
      clonedNote: 'first clone finished',
      days: 'days',
      since: 'since',
      lastScan: 'scanned',
      history: 'Commit history',
      loadHistory: 'Show commit history',
      reloadHistory: 'Reload',
      loadMore: 'Load more',
      loading: 'Loading…',
      noCommits: 'No commits yet',
      commitsTotal: '{n} commits',
      noSubject: '(no message)',
      refreshed: 'Refreshed',
      added: 'Added',
      removed: 'Removed',
      done: 'done',
      monthSuffix: '',
      weekdays: 'MTWTFSS',
    }

    const dicts = { zh, en, 'zh-TW': zh }

    // ── 样式 ────────────────────────────────────────────────
    const CSS = `
.ghm-page{display:flex;flex-direction:column;height:100%;overflow:auto;box-sizing:border-box;
  padding:0 clamp(20px,3vw,40px) 40px;color:var(--dsw-alias-label-primary);
  /* 热力图格子的唯一尺寸来源：星期标签、日期行、格子三处都读这两个变量，
     任何一处改动都不会再让点阵和日期错位。 */
  --ghm-cell:11px;--ghm-gap:3px;}
.ghm-inner{display:flex;flex-direction:column;gap:16px;width:100%;max-width:1080px;margin:0 auto;padding-top:28px;}
.ghm-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;}
.ghm-headline{display:flex;align-items:center;gap:12px;min-width:0;}
.ghm-mark{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:10px;
  background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);flex:none;}
.ghm-title{margin:0;font-size:20px;font-weight:600;line-height:1.3;letter-spacing:.2px;}
.ghm-sub{margin:4px 0 0;font-size:12px;color:var(--dsw-alias-label-secondary);}
.ghm-actions{display:flex;align-items:center;gap:8px;}
.ghm-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:30px;padding:0 12px;
  border-radius:8px;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;cursor:pointer;white-space:nowrap;
  transition:background .15s,border-color .15s,opacity .15s;}
.ghm-btn:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);}
.ghm-btn:disabled{opacity:.45;cursor:not-allowed;}
.ghm-btn-ghost{background:transparent;}
/* 右上角的刷新：一个圆形图标按钮，箭头自身就是动画（刷新时整圈转）。 */
.ghm-refresh{width:34px;height:34px;padding:0;border-radius:50%;display:inline-flex;align-items:center;
  justify-content:center;flex:none;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background .15s,color .15s,border-color .15s;}
.ghm-refresh:hover:not(:disabled){background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-brand-primary);
  border-color:var(--dsw-alias-brand-primary);}
.ghm-refresh:disabled{cursor:default;opacity:.55;}
.ghm-refresh.is-spinning{color:var(--dsw-alias-brand-primary);}
.ghm-refresh.is-spinning svg{animation:ghm-spin .9s linear infinite;}
.ghm-btn-danger{color:var(--dsw-alias-state-error-primary);}
.ghm-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);border-radius:12px;}
.ghm-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;}
.ghm-stat{padding:12px 14px;display:flex;flex-direction:column;gap:4px;min-width:0;}
.ghm-stat-label{font-size:11px;color:var(--dsw-alias-label-tertiary);letter-spacing:.3px;}
.ghm-stat-value{font-size:20px;font-weight:600;line-height:1.25;display:flex;align-items:baseline;gap:6px;min-width:0;}
.ghm-stat-unit{font-size:11px;font-weight:400;color:var(--dsw-alias-label-tertiary);}
.ghm-stat-sub{font-size:11px;color:var(--dsw-alias-label-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.ghm-banner{display:flex;align-items:flex-start;gap:8px;padding:9px 12px;border-radius:9px;font-size:12px;line-height:1.5;}
.ghm-banner-error{background:rgba(214,69,69,.12);color:var(--dsw-alias-state-error-primary);}
.ghm-banner-ok{background:rgba(64,160,110,.12);color:var(--dsw-alias-state-success-primary);}
.ghm-repo-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 12px;}
.ghm-chips{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;}
.ghm-chip{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 10px;border-radius:999px;
  border:1px solid var(--dsw-alias-border-l1);background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;font-family:inherit;cursor:pointer;max-width:220px;}
.ghm-chip:hover{background:var(--dsw-alias-bg-layer-2);}
.ghm-chip.is-active{border-color:var(--dsw-alias-brand-primary);color:var(--dsw-alias-label-primary);
  background:rgba(77,107,254,.1);}
.ghm-dot{width:8px;height:8px;border-radius:50%;flex:none;}
.ghm-chip-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ghm-chip-count{color:var(--dsw-alias-label-tertiary);font-size:11px;font-variant-numeric:tabular-nums;}
.ghm-add{display:flex;align-items:center;gap:6px;flex:1;min-width:260px;justify-content:flex-end;}
.ghm-input{height:30px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;
  min-width:0;flex:1;max-width:420px;box-sizing:border-box;}
.ghm-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}
.ghm-section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 0;flex-wrap:wrap;}
.ghm-section-title{font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px;}
.ghm-tabs{display:inline-flex;align-items:center;gap:2px;padding:2px;border-radius:8px;background:var(--dsw-alias-bg-layer-2);}
.ghm-tab{height:24px;padding:0 10px;border:none;border-radius:6px;background:transparent;color:var(--dsw-alias-label-secondary);
  font-size:12px;font-family:inherit;cursor:pointer;}
.ghm-tab.is-active{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);box-shadow:0 1px 2px rgba(0,0,0,.08);}
.ghm-select{height:26px;padding:0 6px;border-radius:7px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-size:12px;font-family:inherit;cursor:pointer;}
.ghm-heat{padding:12px 14px 14px;overflow:hidden;}
.ghm-scroll{overflow-x:auto;padding-bottom:2px;}
.ghm-day-months{display:grid;grid-auto-flow:column;grid-auto-columns:var(--ghm-cell,11px);
  grid-template-rows:14px;gap:var(--ghm-gap,3px);margin-left:20px;font-size:9px;
  color:var(--dsw-alias-label-tertiary);margin-bottom:2px;}
/* 每列正好一格宽，月份文字向右溢出（和 GitHub 贡献图一致），但起点永远对齐列。 */
.ghm-day-months>span{white-space:nowrap;overflow:visible;line-height:14px;}
/* 行号字形在 11px 行高里居中，看起来才和点阵同一行。 */
.ghm-day-labels>span{display:flex;align-items:center;justify-content:flex-end;line-height:1;}
.ghm-day-body{display:flex;align-items:flex-start;gap:6px;}
.ghm-day-labels{display:grid;grid-template-rows:repeat(7,var(--ghm-cell,11px));gap:var(--ghm-gap,3px);
  font-size:9px;line-height:var(--ghm-cell,11px);color:var(--dsw-alias-label-tertiary);width:14px;
  text-align:right;flex:none;}
.ghm-day-grid{display:grid;grid-auto-flow:column;grid-template-rows:repeat(7,var(--ghm-cell,11px));gap:var(--ghm-gap,3px);}
.ghm-cell{width:var(--ghm-cell,11px);height:var(--ghm-cell,11px);border-radius:2.5px;box-sizing:border-box;}
.ghm-cell.is-empty{box-shadow:inset 0 0 0 1px rgba(127,127,127,.12);}
.ghm-cell.is-out{opacity:.35;}
.ghm-month-grid{display:flex;flex-direction:column;gap:4px;padding-top:2px;}
.ghm-month-row{display:flex;align-items:center;gap:6px;}
.ghm-month-year{width:38px;flex:none;font-size:10px;color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;}
.ghm-month-cells{display:grid;grid-template-columns:repeat(12,1fr);gap:4px;flex:1;min-width:0;}
.ghm-mcell{height:26px;border-radius:4px;display:flex;align-items:center;justify-content:center;
  font-size:10px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-primary);}
.ghm-year-row{display:flex;align-items:center;gap:4px;flex-wrap:wrap;padding:4px 0 2px;}
.ghm-ycell{width:56px;height:30px;border-radius:6px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;font-size:10px;font-variant-numeric:tabular-nums;gap:1px;}
.ghm-legend{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--dsw-alias-label-tertiary);margin-left:auto;}
.ghm-legend .ghm-cell{width:9px;height:9px;}
.ghm-foot{display:flex;align-items:center;gap:8px;font-size:10px;color:var(--dsw-alias-label-tertiary);
  padding:2px 4px 0;flex-wrap:wrap;}
.ghm-mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;}
.ghm-repo-list{display:flex;flex-direction:column;}
.ghm-repo-row{border-top:1px solid var(--dsw-alias-border-l1);}
.ghm-repo-row:first-child{border-top:none;}
.ghm-repo-line{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;}
.ghm-repo-line:hover{background:var(--dsw-alias-bg-layer-2);}
.ghm-repo-name{display:flex;align-items:center;gap:8px;min-width:0;flex:1;}
.ghm-repo-label{font-size:13px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ghm-badge{font-size:10px;padding:1px 6px;border-radius:999px;background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-tertiary);flex:none;}
.ghm-repo-meta{display:flex;align-items:center;gap:10px;font-size:11px;color:var(--dsw-alias-label-tertiary);
  flex-wrap:wrap;justify-content:flex-end;}
.ghm-tag{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-size:10px;}
.ghm-tag-warn{background:rgba(214,155,46,.16);color:var(--dsw-alias-state-warn-primary);}
.ghm-tag-info{background:rgba(77,107,254,.14);color:var(--dsw-alias-brand-primary);}
.ghm-tag-error{background:rgba(214,69,69,.14);color:var(--dsw-alias-state-error-primary);}
.ghm-tag-ok{background:rgba(64,160,110,.14);color:var(--dsw-alias-state-success-primary);}
.ghm-repo-body{padding:0 14px 12px 32px;display:flex;flex-direction:column;gap:8px;}
.ghm-kv{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--dsw-alias-label-secondary);flex-wrap:wrap;}
.ghm-kv code{background:var(--dsw-alias-bg-layer-2);padding:1px 5px;border-radius:4px;font-size:10px;}
.ghm-files{display:flex;flex-direction:column;gap:2px;max-height:132px;overflow:auto;}
.ghm-file{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--dsw-alias-label-secondary);}
.ghm-file-code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;color:var(--dsw-alias-label-tertiary);
  background:var(--dsw-alias-bg-layer-2);border-radius:4px;padding:1px 4px;flex:none;}
.ghm-file-path{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ghm-history{display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--dsw-alias-border-l1);
  padding-top:8px;margin-top:2px;}
.ghm-history-head{display:flex;align-items:center;gap:8px;font-size:12px;}
.ghm-history-title{font-weight:600;}
.ghm-history-list{display:flex;flex-direction:column;max-height:280px;overflow:auto;
  border:1px solid var(--dsw-alias-border-l1);border-radius:8px;}
.ghm-commit{display:flex;align-items:center;gap:8px;padding:5px 9px;font-size:11px;
  border-top:1px solid var(--dsw-alias-border-l1);}
.ghm-commit:first-child{border-top:none;}
.ghm-commit:hover{background:var(--dsw-alias-bg-layer-2);}
.ghm-commit-date{color:var(--dsw-alias-label-tertiary);font-variant-numeric:tabular-nums;white-space:nowrap;flex:none;}
.ghm-commit-hash{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:10px;
  color:var(--dsw-alias-brand-primary);flex:none;}
.ghm-commit-subject{flex:1;min-width:0;color:var(--dsw-alias-label-primary);overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
.ghm-commit-refs{display:inline-flex;gap:3px;flex-wrap:wrap;flex:none;max-width:180px;overflow:hidden;}
.ghm-ref{font-size:9px;padding:0 4px;border-radius:3px;background:rgba(77,107,254,.14);
  color:var(--dsw-alias-brand-primary);white-space:nowrap;}
.ghm-commit-author{color:var(--dsw-alias-label-tertiary);font-size:10px;flex:none;max-width:120px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.ghm-textarea{width:100%;min-height:56px;resize:vertical;padding:7px 9px;border-radius:8px;
  border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  font-size:12px;font-family:inherit;box-sizing:border-box;}
.ghm-textarea:focus{outline:none;border-color:var(--dsw-alias-brand-primary);}
.ghm-row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
.ghm-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 16px;text-align:center;}
.ghm-empty-title{font-size:13px;font-weight:500;}
.ghm-empty-hint{font-size:12px;color:var(--dsw-alias-label-tertiary);max-width:420px;line-height:1.6;}
.ghm-spinner{width:12px;height:12px;border-radius:50%;border:2px solid currentColor;border-right-color:transparent;
  display:inline-block;animation:ghm-spin .8s linear infinite;}
@keyframes ghm-spin{to{transform:rotate(360deg)}}
.ghm-notice{color:var(--dsw-alias-state-success-primary);}
`

    // ── 小工具 ──────────────────────────────────────────────
    const pad2 = (n) => String(n).padStart(2, '0')
    const dayKey = (date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    const shiftDay = (date, delta) => {
      const next = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      next.setDate(next.getDate() + delta)
      return next
    }
    const parseDay = (key) => {
      const [y, m, d] = String(key).split('-').map(Number)
      return new Date(y, (m ?? 1) - 1, d ?? 1)
    }
    const isNextDay = (prevKey, key) => dayKey(shiftDay(parseDay(prevKey), 1)) === key

    /** "2026-11-04T12:34:56+08:00" → 本年显示 "11-04 12:34"，跨年显示完整日期。 */
    function formatCommitDate(iso) {
      const text = String(iso || '')
      if (text.length < 16) return text
      const day = text.slice(0, 10)
      const time = text.slice(11, 16)
      return day.slice(0, 4) === String(new Date().getFullYear()) ? `${day.slice(5)} ${time}` : `${day} ${time}`
    }

    const REPO_COLORS = ['#4D6BFE', '#E0A15A', '#5FB98F', '#C4708F', '#8E7EF2', '#5FA8D3', '#C5A253', '#7C8B99']

    function colorOf(index) {
      return REPO_COLORS[Math.max(0, index) % REPO_COLORS.length]
    }

    /** GitHub 风格的五档：0 是空格，1..4 依次加深（按绝对值分档）。 */
    function levelAbsolute(count) {
      if (!count || count <= 0) return 0
      if (count === 1) return 1
      if (count <= 3) return 2
      if (count <= 6) return 3
      return 4
    }

    /** 月 / 年视图：单元格数量级差太大，按当前最大值做相对分档。 */
    function levelRelative(count, max) {
      if (!count || count <= 0) return 0
      const ratio = max > 0 ? count / max : 1
      if (ratio <= 0.25) return 1
      if (ratio <= 0.5) return 2
      if (ratio <= 0.75) return 3
      return 4
    }

    const EMPTY_FILL = 'var(--dsw-alias-bg-layer-2)'
    const LEVEL_ALPHA = ['', '0.22', '0.45', '0.7', '1']

    function cellStyle(level) {
      if (level <= 0) return { background: EMPTY_FILL }
      if (level >= 4) return { background: '#4D6BFE' }
      return { background: `rgba(77,107,254,${LEVEL_ALPHA[level]})` }
    }

    function computeStreaks(days) {
      const keys = Object.keys(days).filter((key) => (days[key] ?? 0) > 0).sort()
      let longest = 0
      let run = 0
      let prev = null
      for (const key of keys) {
        run = prev !== null && isNextDay(prev, key) ? run + 1 : 1
        if (run > longest) longest = run
        prev = key
      }
      let current = 0
      let cursor = new Date()
      if (!((days[dayKey(cursor)] ?? 0) > 0)) cursor = shiftDay(cursor, -1)
      while ((days[dayKey(cursor)] ?? 0) > 0) {
        current += 1
        cursor = shiftDay(cursor, -1)
      }
      return { longest, current }
    }

    function sumDays(days) {
      let total = 0
      for (const key of Object.keys(days)) total += days[key] ?? 0
      return total
    }

    function yearsWithData(days, fallbackCount = 8) {
      const current = new Date().getFullYear()
      const keys = Object.keys(days)
      if (keys.length === 0) {
        const list = []
        for (let i = 0; i < fallbackCount; i += 1) list.push(current - i)
        return list
      }
      let min = current
      for (const key of keys) {
        const year = Number(key.slice(0, 4))
        if (year < min) min = year
      }
      const list = []
      for (let year = current; year >= min; year -= 1) list.push(year)
      return list
    }

    async function api(endpoint, body) {
      let res
      try {
        res = await fetch(`git-heat/api/${endpoint}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        })
      } catch (err) {
        throw new Error(err instanceof Error ? err.message : String(err))
      }
      let payload = null
      try {
        payload = await res.json()
      } catch {
        payload = null
      }
      if (!payload || payload.ok !== true) {
        const message = payload && payload.error && payload.error.message
          ? payload.error.message
          : `HTTP ${res.status}`
        throw new Error(message)
      }
      return payload.value
    }

    // ── 图标 ────────────────────────────────────────────────
    function HeatIcon(props) {
      const size = props.size ?? 18
      const cells = [
        [0, 0, 0.35], [1, 0, 0.6], [2, 0, 0.35],
        [0, 1, 0.6], [1, 1, 1], [2, 1, 0.35],
        [0, 2, 0.35], [1, 2, 0.6], [2, 2, 0.85],
      ]
      return h(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' },
        cells.map(([cx, cy, opacity], index) => h('rect', {
          key: `c${index}`,
          x: 4 + cx * 6,
          y: 4 + cy * 6,
          width: 4.6,
          height: 4.6,
          rx: 1.2,
          fill: 'currentColor',
          opacity,
        })),
      )
    }

    function RefreshIcon(props) {
      const size = props.size ?? 16
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 2,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': 'true',
        },
        h('path', { d: 'M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8' }),
        h('path', { d: 'M21 3v5h-5' }),
      )
    }

    function PanelIcon(props) {
      return h(HeatIcon, { size: props.size ?? 18 })
    }

    // ── 热力图 ──────────────────────────────────────────────
    function DayHeatmap(props) {
      const { days, year, t } = props
      const weeks = useMemo(() => {
        const start = new Date(year, 0, 1)
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7))
        const end = new Date(year, 11, 31)
        const out = []
        let cursor = start
        while (cursor <= end) {
          const week = []
          for (let i = 0; i < 7; i += 1) {
            week.push(new Date(cursor))
            cursor = shiftDay(cursor, 1)
          }
          out.push(week)
        }
        return out
      }, [year])

      const months = useMemo(() => {
        const labels = []
        let lastMonth = -1
        for (const week of weeks) {
          let label = ''
          for (const day of week) {
            if (day.getFullYear() === year && day.getMonth() !== lastMonth && day.getDate() <= 7) {
              lastMonth = day.getMonth()
              label = `${day.getMonth() + 1}${t('monthSuffix')}`
              break
            }
          }
          labels.push(label)
        }
        return labels
      }, [weeks, year])

      const total = sumDays(days)

      return h(
        'div',
        { className: 'ghm-scroll' },
        h('div', { className: 'ghm-day-months' }, months.map((label, index) => h('span', { key: `m${index}` }, label))),
        h(
          'div',
          { className: 'ghm-day-body' },
          h('div', { className: 'ghm-day-labels' }, (t('weekdays') || '一二三四五六日').split('').map((label, index) =>
            h('span', { key: `w${index}` }, index === 0 || index === 2 || index === 4 ? label : ''))),
          h(
            'div',
            { className: 'ghm-day-grid' },
            weeks.flatMap((week, wi) => week.map((day, di) => {
              const key = dayKey(day)
              const count = days[key] ?? 0
              const outOfYear = day.getFullYear() !== year
              return h('div', {
                key: `${wi}-${di}`,
                className: `ghm-cell${count > 0 ? '' : ' is-empty'}${outOfYear ? ' is-out' : ''}`,
                style: cellStyle(levelAbsolute(count)),
                title: `${key} · ${count} ${t('commitsUnit')}`,
              })
            })),
          ),
        ),
        h('div', { className: 'ghm-foot' },
          h('span', null, `${total} ${t('commitsUnit')}`),
          h(Legend, { t })),
      )
    }

    function MonthHeatmap(props) {
      const { days, years, t } = props
      const rows = useMemo(() => years.map((year) => {
        const cells = []
        for (let month = 0; month < 12; month += 1) {
          const key = `${year}-${pad2(month + 1)}`
          let count = 0
          for (const day of Object.keys(days)) {
            if (day.startsWith(key)) count += days[day] ?? 0
          }
          cells.push({ key, count })
        }
        return { year, cells }
      }), [days, years])
      const max = rows.reduce((acc, row) => row.cells.reduce((m, cell) => Math.max(m, cell.count), acc), 0)

      return h(
        'div',
        { className: 'ghm-month-grid' },
        rows.map((row) => h(
          'div',
          { className: 'ghm-month-row', key: `y${row.year}` },
          h('span', { className: 'ghm-month-year' }, row.year),
          h('div', { className: 'ghm-month-cells' }, row.cells.map((cell) => h('div', {
            key: cell.key,
            className: `ghm-mcell${cell.count > 0 ? '' : ' is-empty'}`,
            style: cellStyle(levelRelative(cell.count, max)),
            title: `${cell.key} · ${cell.count} ${t('commitsUnit')}`,
          }, cell.count > 0 ? String(cell.count) : ''))),
        )),
        h('div', { className: 'ghm-foot' },
          h('span', null, `${sumDays(days)} ${t('commitsUnit')}`),
          h(Legend, { t })),
      )
    }

    function YearHeatmap(props) {
      const { days, years, t } = props
      const cells = useMemo(() => years.map((year) => {
        let count = 0
        for (const day of Object.keys(days)) {
          if (day.startsWith(String(year))) count += days[day] ?? 0
        }
        return { year, count }
      }), [days, years])
      const max = cells.reduce((m, cell) => Math.max(m, cell.count), 0)

      return h(
        'div',
        null,
        h('div', { className: 'ghm-year-row' }, cells.map((cell) => h('div', {
          key: `y${cell.year}`,
          className: `ghm-ycell${cell.count > 0 ? '' : ' is-empty'}`,
          style: cellStyle(levelRelative(cell.count, max)),
          title: `${cell.year} · ${cell.count} ${t('commitsUnit')}`,
        },
        h('span', { style: { opacity: 0.8 } }, String(cell.year)),
        h('span', { style: { fontWeight: 600 } }, String(cell.count))))),
        h('div', { className: 'ghm-foot' },
          h('span', null, `${sumDays(days)} ${t('commitsUnit')}`),
          h(Legend, { t })),
      )
    }

    function Legend(props) {
      const { t } = props
      return h(
        'div',
        { className: 'ghm-legend' },
        h('span', null, t('legendLess')),
        [0, 1, 2, 3, 4].map((level) => h('span', { key: `l${level}`, className: 'ghm-cell is-empty', style: cellStyle(level) })),
        h('span', null, t('legendMore')),
      )
    }

    // ── 统计卡 ──────────────────────────────────────────────
    function StatCard(props) {
      return h(
        'div',
        { className: 'ghm-card ghm-stat' },
        h('span', { className: 'ghm-stat-label' }, props.label),
        h('span', { className: 'ghm-stat-value' }, props.value, props.unit ? h('span', { className: 'ghm-stat-unit' }, props.unit) : null),
        props.sub ? h('span', { className: 'ghm-stat-sub', title: props.sub }, props.sub) : null,
      )
    }

    // ── 仓库行 ──────────────────────────────────────────────
    function RepoRow(props) {
      const { repo, index, expanded, t, onToggle, onRemove, onCommit, busy, history, onLoadHistory } = props
      const [message, setMessage] = useState('')
      const dirty = repo.dirty ?? 0
      const ahead = repo.ahead ?? 0
      const canCommit = repo.kind === 'local' && dirty > 0 && message.trim().length > 0
      const canCommitPush = repo.kind === 'local' && message.trim().length > 0 && (dirty > 0 || ahead > 0)
      const canPush = repo.kind === 'local' && ahead > 0

      const tags = []
      if (!repo.ok) tags.push(h('span', { key: 'err', className: 'ghm-tag ghm-tag-error' }, repo.error ?? '不可用'))
      else {
        if (repo.kind === 'remote' && repo.bare) tags.push(h('span', { key: 'bare', className: 'ghm-tag' }, t('remote')))
        if (dirty > 0) tags.push(h('span', { key: 'dirty', className: 'ghm-tag ghm-tag-warn' }, `${t('dirtyFiles')} ${dirty}`))
        if (ahead > 0) tags.push(h('span', { key: 'ahead', className: 'ghm-tag ghm-tag-info' }, `${t('aheadCommits')} ${ahead}`))
        if (dirty === 0 && ahead === 0) tags.push(h('span', { key: 'clean', className: 'ghm-tag ghm-tag-ok' }, t('clean')))
      }

      return h(
        'div',
        { className: 'ghm-repo-row' },
        h(
          'div',
          { className: 'ghm-repo-line', onClick: onToggle, role: 'button', tabIndex: 0 },
          h('div', { className: 'ghm-repo-name' },
            h('span', { className: 'ghm-dot', style: { background: colorOf(index) } }),
            h('span', { className: 'ghm-repo-label', title: repo.source }, repo.label),
            h('span', { className: 'ghm-badge' }, repo.kind === 'remote' ? t('remote') : t('local'))),
          h('div', { className: 'ghm-repo-meta' },
            tags,
            h('span', null, repo.totalCommits ? `${repo.totalCommits} ${t('commitsUnit')}` : t('noCommit'))),
        ),
        expanded ? h(
          'div',
          { className: 'ghm-repo-body' },
          h('div', { className: 'ghm-kv' },
            h('span', { className: 'ghm-mono' }, repo.dir),
            repo.branch ? h('span', null, `${t('branch')}:`, h('code', null, repo.branch)) : null,
            repo.upstream ? h('span', null, `${t('upstream')}:`, h('code', null, repo.upstream)) : null,
            repo.behind > 0 ? h('span', null, `${t('behind')} ${repo.behind}`) : null),
          repo.lastCommit
            ? h('div', { className: 'ghm-kv' },
              h('span', null, `${t('lastCommit')}:`),
              h('code', null, repo.lastCommit.date),
              h('span', { className: 'ghm-file-path' }, repo.lastCommit.subject))
            : null,
          repo.kind === 'local' && dirty > 0 ? h('div', { className: 'ghm-files' },
            (repo.changedFiles ?? []).slice(0, 8).map((file, fileIndex) => h('div', { className: 'ghm-file', key: `f${fileIndex}` },
              h('span', { className: 'ghm-file-code' }, file.code.trim() || '·'),
              h('span', { className: 'ghm-file-path', title: file.path }, file.path))),
            dirty > 8 ? h('div', { className: 'ghm-file', key: 'more' }, h('span', { className: 'ghm-file-path' }, t('moreFiles').replace('{n}', String(dirty - 8)))) : null,
          ) : null,
          repo.kind === 'local' && dirty === 0 ? h('div', { className: 'ghm-kv' }, t('noChanges')) : null,
          repo.kind === 'remote' ? h('div', { className: 'ghm-kv' }, t('remoteReadonly')) : null,
          h('div', { className: 'ghm-history' },
            h('div', { className: 'ghm-history-head' },
              h('span', { className: 'ghm-history-title' }, t('history')),
              history && history.total != null
                ? h('span', { className: 'ghm-badge' }, t('commitsTotal').replace('{n}', String(history.total)))
                : null,
              h('span', { style: { flex: 1 } }),
              h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost',
                disabled: !!(history && history.loading),
                onClick: () => onLoadHistory(repo, true),
              }, history && history.loading
                ? t('loading')
                : (history && history.commits && history.commits.length ? t('reloadHistory') : t('loadHistory')))),
            history && history.error
              ? h('div', { className: 'ghm-kv', style: { color: 'var(--dsw-alias-state-error-primary)' } }, history.error)
              : null,
            history && history.commits && history.commits.length > 0
              ? h('div', { className: 'ghm-history-list' },
                history.commits.map((commit) => h('div', {
                  key: commit.hash,
                  className: 'ghm-commit',
                  title: `${commit.hash}
${commit.author}
${commit.date}`,
                },
                h('span', { className: 'ghm-commit-date' }, formatCommitDate(commit.date)),
                h('span', { className: 'ghm-commit-hash' }, commit.short),
                h('span', { className: 'ghm-commit-subject' }, commit.subject || t('noSubject')),
                commit.refs
                  ? h('span', { className: 'ghm-commit-refs' }, commit.refs.split(',').slice(0, 2).map((ref, refIndex) => h('span', { key: `r${refIndex}`, className: 'ghm-ref' }, ref.trim())))
                  : null,
                h('span', { className: 'ghm-commit-author' }, commit.author))))
              : null,
            history && history.commits && history.commits.length === 0 && !history.loading && !history.error
              ? h('div', { className: 'ghm-kv' }, t('noCommits'))
              : null,
            history && history.hasMore
              ? h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost',
                disabled: !!history.loading,
                onClick: () => onLoadHistory(repo, false),
              }, history.loading ? t('loading') : t('loadMore'))
              : null,
          ),
          repo.kind === 'local' ? h('div', { className: 'ghm-row-actions', style: { flexDirection: 'column', alignItems: 'stretch' } },
            h('textarea', {
              className: 'ghm-textarea',
              placeholder: t('commitMessagePlaceholder'),
              value: message,
              onChange: (event) => setMessage(event.target.value),
            }),
            h('div', { className: 'ghm-row-actions' },
              h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost',
                disabled: !canCommit || busy,
                onClick: () => onCommit(repo, message, false, () => setMessage('')),
              }, busy ? h('span', { className: 'ghm-spinner' }) : null, t('doCommit')),
              h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost',
                disabled: !canCommitPush || busy,
                onClick: () => onCommit(repo, message, true, () => setMessage('')),
              }, t('doCommitPush')),
              h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost',
                disabled: !canPush || busy,
                onClick: () => onCommit(repo, '', true),
              }, t('doPush')),
              h('button', {
                type: 'button',
                className: 'ghm-btn ghm-btn-ghost ghm-btn-danger',
                style: { marginLeft: 'auto' },
                disabled: busy,
                onClick: () => onRemove(repo),
              }, t('remove'))),
          ) : h('div', { className: 'ghm-row-actions' },
            h('button', {
              type: 'button',
              className: 'ghm-btn ghm-btn-ghost ghm-btn-danger',
              disabled: busy,
              onClick: () => onRemove(repo),
            }, t('remove'))),
        ) : null,
      )
    }

    // ── 主面板 ──────────────────────────────────────────────
    function GitHeatPanel(props) {
      const t = props.t ?? ((key) => key)
      const [data, setData] = useState(null)
      const [loading, setLoading] = useState(true)
      const [refreshing, setRefreshing] = useState(false)
      const [adding, setAdding] = useState(false)
      const [busyRepo, setBusyRepo] = useState(null)
      const [error, setError] = useState('')
      const [notice, setNotice] = useState('')
      const [input, setInput] = useState('')
      const [focus, setFocus] = useState(null)
      const [expanded, setExpanded] = useState(null)
      const [grain, setGrain] = useState('day')
      const [year, setYear] = useState(new Date().getFullYear())
      const [history, setHistory] = useState({})

      useEffect(() => {
        let alive = true
        setLoading(true)
        api('state')
          .then((value) => {
            if (!alive) return
            setData(value)
            setError('')
          })
          .catch((err) => {
            if (alive) setError(err instanceof Error ? err.message : String(err))
          })
          .finally(() => {
            if (alive) setLoading(false)
          })
        return () => {
          alive = false
        }
      }, [])

      const repos = data?.repos ?? []
      const allDays = data?.days ?? {}
      const focusIndex = focus === null ? -1 : repos.findIndex((repo) => repo.id === focus)
      const focusedRepo = focusIndex >= 0 ? repos[focusIndex] : null
      const days = focusedRepo ? (data?.byRepo?.[focusedRepo.id] ?? {}) : allDays
      const streaks = useMemo(() => computeStreaks(days), [days])
      const total = useMemo(() => sumDays(days), [days])
      const years = useMemo(() => yearsWithData(allDays), [allDays])
      const currentYear = new Date().getFullYear()

      useEffect(() => {
        if (!years.includes(year)) setYear(years[0] ?? currentYear)
      }, [years, year, currentYear])

      const lastCommit = focusedRepo ? (focusedRepo.lastCommit ? { ...focusedRepo.lastCommit, repoLabel: focusedRepo.label } : null) : data?.lastCommit
      const pendingDirty = repos.reduce((acc, repo) => acc + (repo.dirty ?? 0), 0)
      const pendingAhead = repos.reduce((acc, repo) => acc + (repo.ahead ?? 0), 0)

      const onRefresh = async () => {
        setRefreshing(true)
        setError('')
        setNotice('')
        try {
          const result = await api('refresh')
          if (result.state) setData(result.state)
          setHistory({})
          const problems = (result.notes ?? []).filter((note) => note.level !== 'ok')
          const done = (result.notes ?? []).filter((note) => note.level === 'ok')
          if (problems.length > 0) setError(problems.map((note) => note.message).join('；'))
          else if (done.length > 0) setNotice(done.map((note) => note.message).join('；'))
          else setNotice(t('refreshed'))
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setRefreshing(false)
        }
      }

      const onAdd = async () => {
        const value = input.trim()
        if (!value || adding) return
        setAdding(true)
        setError('')
        setNotice('')
        try {
          const result = await api('add', { input: value })
          if (result.state) setData(result.state)
          setInput('')
          setNotice(`${t('added')} ${result.repo?.label ?? value}`)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setAdding(false)
        }
      }

      const onRemove = async (repo) => {
        if (typeof window !== 'undefined' && typeof window.confirm === 'function' && !window.confirm(t('removeConfirm'))) return
        setBusyRepo(repo.id)
        setError('')
        setNotice('')
        try {
          const state = await api('remove', { id: repo.id })
          setData(state)
          if (focus === repo.id) setFocus(null)
          if (expanded === repo.id) setExpanded(null)
          setHistory((current) => {
            if (!current[repo.id]) return current
            const next = { ...current }
            delete next[repo.id]
            return next
          })
          setNotice(`${t('removed')} ${repo.label}`)
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusyRepo(null)
        }
      }

      const onCommit = async (repo, message, push, done) => {
        setBusyRepo(repo.id)
        setError('')
        setNotice('')
        try {
          const result = await api('commit', { id: repo.id, message, push })
          if (result.state) setData(result.state)
          const parts = []
          if (result.committed) parts.push(t('commitDone'))
          if (result.pushed) parts.push(t('pushDone'))
          setNotice(`${repo.label}：${parts.join(' + ') || t('done')}`)
          if (typeof done === 'function') done()
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err))
        } finally {
          setBusyRepo(null)
        }
      }

      const loadHistory = async (repo, reset) => {
        const previous = history[repo.id]
        const skip = reset || !previous ? 0 : (previous.commits ? previous.commits.length : 0)
        setHistory((current) => ({
          ...current,
          [repo.id]: { ...(current[repo.id] || { commits: [] }), loading: true, error: '' },
        }))
        try {
          const value = await api('log', { id: repo.id, skip, limit: 30 })
          setHistory((current) => {
            const prior = reset ? [] : ((current[repo.id] && current[repo.id].commits) || [])
            return {
              ...current,
              [repo.id]: {
                commits: prior.concat(value.commits || []),
                hasMore: !!value.hasMore,
                total: value.total,
                loading: false,
                error: '',
              },
            }
          })
        } catch (err) {
          setHistory((current) => ({
            ...current,
            [repo.id]: {
              ...(current[repo.id] || { commits: [] }),
              loading: false,
              error: err instanceof Error ? err.message : String(err),
            },
          }))
        }
      }

      /** 展开某个仓库；第一次展开时顺手拉一页提交历史。 */
      const openRepo = (repo) => {
        setExpanded(repo.id)
        setFocus(repo.id)
        if (!history[repo.id]) loadHistory(repo, true)
      }

      const toggleRepo = (repo) => {
        if (expanded === repo.id) {
          setExpanded(null)
          setFocus(null)
          return
        }
        openRepo(repo)
      }

      const tab = (id, label) => h('button', {
        key: id,
        type: 'button',
        className: `ghm-tab${grain === id ? ' is-active' : ''}`,
        onClick: () => setGrain(id),
      }, label)

      const heatBody = grain === 'day'
        ? h(DayHeatmap, { days, year, t })
        : grain === 'month'
          ? h(MonthHeatmap, { days, years, t })
          : h(YearHeatmap, { days, years, t })

      return h(
        'div',
        { className: 'ghm-page' },
        h(
          'div',
          { className: 'ghm-inner' },
          // 头部
          h(
            'div',
            { className: 'ghm-header' },
            h('div', { className: 'ghm-headline' },
              h('span', { className: 'ghm-mark' }, h(HeatIcon, { size: 22 })),
              h('div', { style: { minWidth: 0 } },
                h('h1', { className: 'ghm-title' }, t('title')),
                h('p', { className: 'ghm-sub' }, t('subtitle')))),
            h('div', { className: 'ghm-actions' },
              h('button', {
                type: 'button',
                className: `ghm-refresh${refreshing ? ' is-spinning' : ''}`,
                onClick: onRefresh,
                disabled: refreshing || loading,
                title: refreshing ? t('refreshing') : (t('refreshHint') || t('refresh')),
                'aria-label': refreshing ? t('refreshing') : t('refresh'),
              }, h(RefreshIcon, { size: 16 }))),
          ),

          error ? h('div', { className: 'ghm-banner ghm-banner-error' }, `${t('errorPrefix')}${error}`) : null,
          notice ? h('div', { className: 'ghm-banner ghm-banner-ok' }, notice) : null,

          // 统计卡
          h('div', { className: 'ghm-stats' },
            h(StatCard, {
              label: t('totalCommits'),
              value: String(total),
              unit: `${t('commitsUnit')} · ${repos.length} ${t('repos')}`,
            }),
            h(StatCard, {
              label: t('lastCommit'),
              value: lastCommit ? lastCommit.date : '—',
              sub: lastCommit ? `${lastCommit.repoLabel}：${lastCommit.subject}` : t('noCommit'),
            }),
            h(StatCard, {
              label: t('streak'),
              value: String(streaks.current),
              unit: t('days'),
              sub: `${t('currentStreak')} ${streaks.current} · ${t('longestStreak')} ${streaks.longest}`,
            }),
            h(StatCard, {
              label: t('pending'),
              value: String(pendingDirty + pendingAhead),
              sub: `${t('dirtyFiles')} ${pendingDirty} · ${t('aheadCommits')} ${pendingAhead}`,
            }),
          ),

          // 仓库筛选 + 添加
          h('div', { className: 'ghm-card ghm-repo-bar' },
            h('div', { className: 'ghm-chips' },
              h('button', {
                type: 'button',
                className: `ghm-chip${focus === null ? ' is-active' : ''}`,
                onClick: () => setFocus(null),
              }, h('span', { className: 'ghm-chip-label' }, t('all')),
              h('span', { className: 'ghm-chip-count' }, String(sumDays(allDays)))),
              repos.map((repo, index) => h('button', {
                key: repo.id,
                type: 'button',
                className: `ghm-chip${focus === repo.id ? ' is-active' : ''}`,
                onClick: () => openRepo(repo),
                title: repo.source,
              },
              h('span', { className: 'ghm-dot', style: { background: colorOf(index) } }),
              h('span', { className: 'ghm-chip-label' }, repo.label),
              h('span', { className: 'ghm-chip-count' }, String(repo.totalCommits ?? 0))))),
            h('div', { className: 'ghm-add' },
              h('input', {
                className: 'ghm-input',
                placeholder: t('addPlaceholder'),
                value: input,
                onChange: (event) => setInput(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Enter') onAdd()
                },
              }),
              h('button', {
                type: 'button',
                className: 'ghm-btn',
                onClick: onAdd,
                disabled: adding || input.trim() === '',
              }, adding ? t('adding') : t('add')))),

          // 热力图
          h('div', { className: 'ghm-card' },
            h('div', { className: 'ghm-section-head' },
              h('div', { className: 'ghm-section-title' },
                focusedRepo ? `${focusedRepo.label} · ${t('commits')}` : t('commits')),
              h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
                h('div', { className: 'ghm-tabs' }, tab('day', t('day')), tab('month', t('month')), tab('year', t('year'))),
                grain === 'day'
                  ? h('select', {
                    className: 'ghm-select',
                    value: String(year),
                    onChange: (event) => setYear(Number(event.target.value)),
                  }, years.map((item) => h('option', { key: item, value: String(item) }, String(item))))
                  : null)),
            h('div', { className: 'ghm-heat' },
              loading ? h('div', { className: 'ghm-empty' }, h('span', { className: 'ghm-spinner' }), h('span', { className: 'ghm-empty-hint' }, t('scanning'))) : heatBody),
          ),

          // 仓库状态
          h('div', { className: 'ghm-card' },
            h('div', { className: 'ghm-section-head' },
              h('div', { className: 'ghm-section-title' }, t('repos'), h('span', { className: 'ghm-badge' }, String(repos.length)))),
            repos.length === 0
              ? h('div', { className: 'ghm-empty' },
                h('span', { className: 'ghm-empty-title' }, t('empty')),
                h('span', { className: 'ghm-empty-hint' }, t('emptyHint')))
              : h('div', { className: 'ghm-repo-list' }, repos.map((repo, index) => h(RepoRow, {
                key: repo.id,
                repo,
                index,
                t,
                expanded: expanded === repo.id,
                busy: busyRepo === repo.id,
                onToggle: () => toggleRepo(repo),
                onRemove,
                onCommit,
                history: history[repo.id],
                onLoadHistory: loadHistory,
              }))),
          ),

          // 页脚
          h('div', { className: 'ghm-foot' },
            data?.dataDir ? h('span', null, `${t('dataDir')}:`, h('span', { className: 'ghm-mono' }, data.dataDir)) : null,
            data?.scannedAt ? h('span', null, `${t('lastScan')} ${new Date(data.scannedAt).toLocaleTimeString()}`) : null,
          ),
        ),
      )
    }

    // ── 插件入口 ────────────────────────────────────────────
    const inject = ['slots', 'locale']

    function apply(ctx) {
      ctx.effect(() => {
        const offs = []
        for (const [locale, dict] of Object.entries(dicts)) {
          offs.push(ctx.locale.register(NS, locale, dict))
        }
        return () => {
          for (const off of offs) off()
        }
      }, 'dsh-git-heatmap: dictionaries')

      ctx.effect(() => {
        if (typeof document === 'undefined') return () => {}
        let style = document.getElementById(STYLE_ID)
        const created = style === null
        if (!style) {
          style = document.createElement('style')
          style.id = STYLE_ID
          style.textContent = CSS
          document.head.appendChild(style)
        }
        return () => {
          if (created && style && style.parentNode) style.parentNode.removeChild(style)
        }
      }, 'dsh-git-heatmap: styles')

      // 主面板：左侧栏入口点开就是它。
      ctx.slots.inject('main', () => ctx.slots.register({
        name: 'main',
        key: PANEL_ID,
        locale: NS,
      }, GitHeatPanel))

      // 左侧栏入口（沿用 usage-stats 的做法：独立图标位，不和 footer action 抢宽度）。
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist',
        id: PANEL_ID,
        order: PANEL_ORDER,
        label: () => ctx.locale.bind(NS)('nav'),
        locale: NS,
      }, PanelIcon))
    }

    return {
      name: 'dsh-git-heatmap',
      inject,
      apply,
      PANEL_ID,
      /** 仅供本地渲染测试调用，运行时不使用。 */
      __internals: { GitHeatPanel, DayHeatmap, MonthHeatmap, YearHeatmap, RepoRow, computeStreaks },
    }
  },
})
