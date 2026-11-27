export const DEFAULT_REFRESH_INTERVAL_MS = 60000;
export const REFRESH_INTERVAL_OPTIONS = Object.freeze([
  { value: 10000, label: '자동 10초' },
  { value: 30000, label: '자동 30초' },
  { value: 60000, label: '자동 1분' },
  { value: 300000, label: '자동 5분' },
  { value: 0, label: '수동' }
]);
const REFRESH_INTERVAL_STORAGE_KEY = 'ai-native-harness.dashboard.refreshInterval';
const phaseOrder = ['discover', 'plan', 'implement', 'verify', 'release'];
const phaseLabels = {
  discover: 'Discover',
  plan: 'Plan',
  publish: 'Plan',
  implement: 'Implement',
  verify: 'Verify',
  release: 'Release',
  done: 'Complete',
  unknown: 'Unknown'
};
const outcomeLabels = {
  passed: '통과',
  failed: '실패',
  pending: '대기',
  unknown: '미확인',
  none: '기록됨'
};
const hostLabels = { copilot: 'GitHub Copilot', claude: 'Claude Code', codex: 'Codex' };
const state = {
  snapshot: null,
  workspaceId: null,
  sessionKey: null,
  activityKey: null,
  hostFilter: 'all',
  attentionFilter: 'all',
  sortOrder: 'attention',
  groupByRun: false,
  visibleCount: 8,
  expandedLanes: new Set(),
  associationRunId: null,
  refreshing: false,
  refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS,
  refreshTimer: null,
  snapshotAlertsOpen: false
};
const $ = id => document.getElementById(id);

export function getDashboardRegion(documentRef, name) {
  return documentRef.querySelector(`[data-region="${name}"]`);
}

export function createVscodeWorkspaceUri(cwd) {
  if (typeof cwd !== 'string' || !cwd || cwd.includes('\0')) return null;
  const path = cwd.replaceAll('\\', '/');
  const isWindowsDrivePath = /^[A-Za-z]:\//.test(path);
  const isUncPath = path.startsWith('//') && !path.startsWith('///') &&
    path.split('/').filter(Boolean).length >= 2;
  if (!path.startsWith('/') && !isWindowsDrivePath) return null;
  if (path.startsWith('//') && !isUncPath) return null;

  const uriPath = isWindowsDrivePath ? `/${path}` : path;
  const encodedPath = uriPath.split('/').map((segment, index) =>
    index === 1 && /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment)
  ).join('/');
  return `vscode://file${encodedPath}`;
}

// VS Code imports a Copilot CLI session into chat only when its agent host can adopt it;
// Claude and Codex CLI sessions have no import path, so their links open the folder only.
export function createVscodeSessionLink(host, cwd, sessionId) {
  const workspaceUri = createVscodeWorkspaceUri(cwd);
  if (!workspaceUri) return null;
  const opensSession = host === 'copilot' && typeof sessionId === 'string' && /^[A-Za-z0-9_-]{1,256}$/.test(sessionId);
  const query = opensSession ? `copilotCliSession=${sessionId}&windowId=_blank` : 'windowId=_blank';
  return { href: `${workspaceUri}?${query}`, opensSession };
}

export function createSessionResumeCommand(host, sessionId) {
  const commands = { copilot: 'copilot --resume', claude: 'claude --resume', codex: 'codex resume' };
  const prefix = Object.hasOwn(commands, host) ? commands[host] : null;
  if (!prefix || typeof sessionId !== 'string' || !/^[A-Za-z0-9._-]+$/.test(sessionId)) return null;
  return `${prefix} ${sessionId}`;
}

export function getRelatedIds(item) {
  return Array.isArray(item.relatedTo) ? item.relatedTo : [];
}

export function preserveAssociationSelection(selectedRunId, currentRunId, availableRunIds) {
  const preferred = selectedRunId || currentRunId || '';
  return availableRunIds.includes(preferred)
    ? preferred
    : availableRunIds.includes(currentRunId) ? currentRunId : '';
}

export function normalizeRefreshInterval(value) {
  const parsed = Number(value);
  const option = REFRESH_INTERVAL_OPTIONS.find(item => item.value === parsed);
  return value === undefined || value === null || value === '' || !option ? DEFAULT_REFRESH_INTERVAL_MS : option.value;
}

function refreshIntervalLabel(intervalMs) {
  return REFRESH_INTERVAL_OPTIONS.find(item => item.value === intervalMs)?.label ?? '';
}

export function setConnectedStatus(statusNode, now = new Date(), intervalMs = DEFAULT_REFRESH_INTERVAL_MS) {
  const time = now.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  setText(statusNode, `로컬 데이터 · ${time} 갱신 · ${refreshIntervalLabel(normalizeRefreshInterval(intervalMs))}`);
}

export function setText(node, value) {
  node.textContent = value === null || value === undefined ? '' : String(value);
  return node;
}

function node(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (value !== undefined) setText(element, value);
  return element;
}

function button(className, value, onClick) {
  const element = node('button', className, value);
  element.type = 'button';
  element.addEventListener('click', onClick);
  return element;
}

function sessionKey(session) {
  return `${session.host}\0${session.id}`;
}

function sessionRun(workspace, session) {
  return session?.runId ? workspace.runs.find(run => run.id === session.runId) ?? null : null;
}

// Gates pass in order, so only the first unpassed gate can be waiting; later human gates are
// merely future work, and a finished run (including a completed spike) waits for nobody.
export function getAwaitingApprovalGate(run) {
  if (!run || run.phase === 'done') return null;
  const next = (run.gates ?? []).find(gate => gate.status !== 'passed');
  return next?.owner === 'human' && next.status === 'pending' ? next : null;
}

function isApprovalWaiting(run) {
  return getAwaitingApprovalGate(run) !== null;
}

function isSessionFailed(session, run) {
  return (session.events ?? []).some(event => event.outcome === 'failed')
    || ['gates', 'reviews', 'verification'].some(key =>
      (run?.[key] ?? []).some(item => item.status === 'failed' || item.outcome === 'failed')
    );
}

function sessionAttentionRank(session, run) {
  if (isApprovalWaiting(run)) return 0;
  if ((session.pendingQuestions ?? []).length) return 1;
  if (isSessionFailed(session, run)) return 2;
  return run ? 3 : 4;
}

function activityTime(session) {
  const timestamp = Date.parse(session.lastActivityAt ?? '');
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

export function getSessionGridItems(snapshot, {
  workspaceId = null,
  host = 'all',
  filter = 'all',
  sort = 'attention'
} = {}) {
  const items = (snapshot?.workspaces ?? [])
    .filter(workspace => workspaceId === null || workspace.id === workspaceId)
    .flatMap(workspace => workspace.sessions.map(session => ({
      workspace,
      session,
      run: sessionRun(workspace, session)
    })))
    .filter(({ session }) => host === 'all' || session.host === host)
    .filter(({ session, run }) => {
      if (filter === 'approval') return isApprovalWaiting(run);
      if (filter === 'question') return (session.pendingQuestions ?? []).length > 0;
      if (filter === 'failed') return isSessionFailed(session, run);
      if (filter === 'unlinked') return !run;
      return filter === 'all';
    });

  return items
    .map((item, index) => ({ ...item, index }))
    .sort((a, b) => {
      const byAttention = sort === 'attention'
        ? sessionAttentionRank(a.session, a.run) - sessionAttentionRank(b.session, b.run)
        : 0;
      return byAttention
        || activityTime(b.session) - activityTime(a.session)
        || a.index - b.index;
    })
    .map(({ index, ...item }) => item);
}

export function getSessionGridPage(items, visibleCount, pageSize = 8) {
  const count = Math.max(0, Math.floor(visibleCount));
  const size = Math.max(1, Math.floor(pageSize));
  const shown = items.slice(0, count);
  const remaining = Math.max(0, items.length - shown.length);
  return {
    items: shown,
    total: items.length,
    hasMore: remaining > 0,
    nextCount: Math.min(size, remaining)
  };
}

export function getAdjacentSessionKey(items, currentKey, delta) {
  if (!items.length) return null;
  const index = items.findIndex(item => sessionKey(item.session) === currentKey);
  if (index < 0) return null;
  const direction = Math.sign(delta);
  if (!direction) return currentKey;
  const nextIndex = (index + direction + items.length) % items.length;
  return sessionKey(items[nextIndex].session);
}

export function parseSessionHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#')) return null;
  const params = new URLSearchParams(hash.slice(1));
  const hosts = params.getAll('host');
  const sessions = params.getAll('session');
  if (hosts.length !== 1 || sessions.length !== 1 || !Object.hasOwn(hostLabels, hosts[0]) || !sessions[0]) return null;
  return `${hosts[0]}\0${sessions[0]}`;
}

export function formatSessionHash(session) {
  const params = new URLSearchParams({ host: session.host, session: session.id });
  return `#${params.toString()}`;
}

export function preserveDrawerSelection(current, nextSessionKey) {
  if (current.sessionKey === nextSessionKey) return current;
  return {
    sessionKey: nextSessionKey,
    activityKey: null,
    associationRunId: null
  };
}

export function getVisibleCountForSession(items, visibleCount, key, pageSize = 8) {
  const index = items.findIndex(item => sessionKey(item.session) === key);
  if (index < 0) return visibleCount;
  const size = Math.max(1, Math.floor(pageSize));
  return Math.max(visibleCount, Math.ceil((index + 1) / size) * size);
}

function shortPath(path) {
  if (typeof path !== 'string' || !path) return '경로 정보 없음';
  return path.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function formatTime(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return '시간 정보 없음';
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function statusLabel(status) {
  return outcomeLabels[status] ?? '미확인';
}

function gateCounts(workspace) {
  const approvals = workspace.runs.filter(isApprovalWaiting).length;
  const questions = workspace.sessions.reduce((count, session) => count + (session.pendingQuestions?.length ?? 0), 0);
  return { approvals, questions };
}

function currentWorkspace() {
  return state.snapshot?.workspaces.find(item => item.id === state.workspaceId) ?? null;
}

function currentSessionEntry() {
  return getSessionGridItems(state.snapshot, { workspaceId: state.workspaceId })
    .find(item => sessionKey(item.session) === state.sessionKey) ?? null;
}

function currentSession() {
  return currentSessionEntry()?.session ?? null;
}

function currentRun(workspace, session) {
  return session?.runId ? workspace?.runs.find(item => item.id === session.runId) ?? null : null;
}

function setHidden(id, hidden) {
  $(id).hidden = hidden;
}

function renderWorkspaceList() {
  const list = getDashboardRegion(document, 'workspace-list');
  const workspaces = state.snapshot?.workspaces ?? [];
  list.replaceChildren();
  $('workspace-count').textContent = String(workspaces.length);
  $('workspace-empty').hidden = workspaces.length > 0;
  const entries = [
    { id: null, path: '모든 워크스페이스', workspaces },
    ...workspaces.map(workspace => ({ id: workspace.id, path: workspace.path, workspaces: [workspace] }))
  ];
  for (const entry of entries) {
    const selected = entry.id === state.workspaceId;
    const counts = entry.workspaces.reduce((total, workspace) => {
      const current = gateCounts(workspace);
      return { approvals: total.approvals + current.approvals, questions: total.questions + current.questions };
    }, { approvals: 0, questions: 0 });
    const row = button(`workspace-row${selected ? ' is-selected' : ''}`, '', () => {
      writeSessionHash(null);
      state.workspaceId = entry.id;
      state.sessionKey = null;
      state.activityKey = null;
      state.associationRunId = null;
      state.visibleCount = 8;
      render();
    });
    row.setAttribute('aria-pressed', String(selected));
    const icon = node('span', entry.id === null ? 'workspace-all-icon' : 'folder-icon', entry.id === null ? '▦' : '');
    icon.setAttribute('aria-hidden', 'true');
    const copy = node('span', 'workspace-copy');
    copy.append(node('span', 'workspace-name', entry.id === null ? entry.path : shortPath(entry.path)));
    if (entry.id !== null) copy.append(node('span', 'workspace-path', entry.path));
    row.append(icon, copy);
    const count = counts.approvals + counts.questions;
    if (count) {
      const badge = node('span', `workspace-alert${counts.approvals ? ' has-approval' : ''}`, String(count));
      badge.setAttribute('aria-label', `${counts.approvals}개 승인 대기, ${counts.questions}개 질문`);
      row.append(badge);
    }
    const chevron = node('span', 'workspace-chevron', selected ? '›' : '');
    chevron.setAttribute('aria-hidden', 'true');
    row.append(chevron);
    list.append(row);
  }
}

function attentionType(session, run) {
  if (isApprovalWaiting(run)) return 'approval';
  if ((session.pendingQuestions ?? []).length) return 'question';
  if (isSessionFailed(session, run)) return 'failed';
  return run ? 'normal' : 'unlinked';
}

function renderCardPhases(run) {
  const phases = node('div', `card-phases${run ? '' : ' is-unlinked'}`);
  phases.setAttribute('aria-label', run ? `현재 단계: ${phaseLabels[run.phase] ?? run.phase}` : '연결된 run 없음');
  const current = run ? phaseIndex(run.phase) : -1;
  for (const [index, phase] of phaseOrder.entries()) {
    const status = !run || current < 0 ? 'is-unknown'
      : index < current ? 'is-complete'
        : index === current ? 'is-current' : '';
    const step = node('span', `card-phase ${status}`);
    step.title = phaseLabels[phase];
    step.setAttribute('aria-label', phaseLabels[phase]);
    phases.append(step);
  }
  return phases;
}

function renderCardGates(run) {
  const summary = node('div', 'card-gates');
  const gates = run?.gates ?? [];
  summary.setAttribute('aria-label', gates.length ? '승인 및 검증 게이트' : '게이트 정보 없음');
  if (!gates.length) {
    summary.append(node('span', 'card-muted', '게이트 정보 없음'));
    return summary;
  }
  for (const gate of gates) {
    const chip = node('span', `card-gate gate-${gate.status}`, `${gate.id} ${statusLabel(gate.status)}`);
    chip.title = `${gate.id}: ${statusLabel(gate.status)}${gate.owner === 'human' ? ' · 사람 승인' : ''}`;
    summary.append(chip);
  }
  return summary;
}

function renderCardVerification(run) {
  const summary = node('div', 'card-verifications');
  const checks = summarizeActivity(run).lanes.find(lane => lane.id === 'verification')?.nodes ?? [];
  summary.setAttribute('aria-label', '검증 유형 및 결과');
  if (!checks.length) {
    summary.append(node('span', 'card-muted', '검증 기록 없음'));
    return summary;
  }
  for (const check of checks.slice(0, 4)) {
    summary.append(node('span', `card-verification status-${check.outcome}`, `${check.title} · ${statusLabel(check.outcome)}`));
  }
  if (checks.length > 4) summary.append(node('span', 'card-muted', `+${checks.length - 4}`));
  return summary;
}

function renderSessionCard(item) {
  const { workspace, session, run } = item;
  const selected = sessionKey(session) === state.sessionKey;
  const attention = attentionType(session, run);
  const card = node('article', `session-card attention-${attention}${selected ? ' is-selected' : ''}`);
  const header = node('div', 'session-card-header');
  const hostMark = node('span', `host-mark host-${session.host}`, session.host === 'copilot' ? 'C' : session.host === 'claude' ? 'Cl' : 'X');
  hostMark.setAttribute('aria-hidden', 'true');
  const identity = node('div', 'session-card-identity');
  identity.append(node('span', 'session-host', hostLabels[session.host] ?? 'Unknown host'));
  identity.append(node('code', 'session-id', session.id));
  header.append(hostMark, identity, node('span', 'session-activity', formatTime(session.lastActivityAt)));
  card.append(header);

  const runTitle = run ? run.title : 'run 미연결';
  card.append(node('div', `session-card-run${run ? '' : ' is-unlinked'}`, runTitle));
  card.append(renderCardPhases(run));

  const reviewCount = run?.reviews?.length ?? 0;
  const blockers = (run?.reviews ?? []).reduce((total, review) => total + (Number.isFinite(review.blocking) ? review.blocking : 0), 0);
  const reviewSummary = node('div', 'card-review-summary', `리뷰 ${reviewCount}건 · 차단 지적 ${blockers}건`);
  card.append(reviewSummary, renderCardGates(run), renderCardVerification(run));

  const lastEvent = latestFirst(session.events ?? [])[0];
  const eventText = lastEvent
    ? lastEvent.excerpt || lastEvent.command || lastEvent.label || lastEvent.kind || '최근 이벤트'
    : '세션 이벤트 정보 없음';
  const activity = node('div', 'session-card-event');
  activity.append(node('span', 'card-section-label', '최근 세션 이벤트'));
  activity.append(node('span', 'session-card-event-text', eventText));
  card.append(activity);

  const attentionLabel = attention === 'approval' ? '사람 승인 대기'
    : attention === 'question' ? `${session.pendingQuestions.length}개 응답 대기 질문`
      : attention === 'failed' ? '실패 기록 있음'
        : attention === 'unlinked' ? 'run 미연결' : '주의 사항 없음';
  card.append(node('span', 'session-card-attention-label', attentionLabel));

  const actions = node('div', 'session-card-actions');
  const vscodeLink = createVscodeSessionLink(session.host, session.cwd, session.id);
  if (vscodeLink) {
    const openInVscode = node('a', 'button button-quiet session-card-open-vscode',
      vscodeLink.opensSession ? 'VS Code에서 세션 열기' : 'VS Code 폴더 열기');
    openInVscode.href = vscodeLink.href;
    openInVscode.setAttribute('aria-label', vscodeLink.opensSession
      ? `VS Code 채팅에서 ${session.id} 세션 열기`
      : `VS Code에서 ${session.cwd} 폴더 열기`);
    openInVscode.title = vscodeLink.opensSession
      ? 'VS Code 에이전트 호스트가 인식한 Copilot CLI 세션을 채팅으로 엽니다. 열리지 않으면 명령 복사로 터미널에서 이어 가세요.'
      : 'VS Code는 이 CLI 세션을 가져오지 못해 폴더만 엽니다. 세션은 명령 복사로 터미널에서 이어 가세요.';
    actions.append(openInVscode);
  }
  const resumeCommand = createSessionResumeCommand(session.host, session.id);
  if (resumeCommand) {
    const status = node('span', 'session-action-status');
    status.hidden = true;
    status.setAttribute('aria-live', 'polite');
    const copyCommand = button('button button-quiet session-card-copy-command', '명령 복사', async () => {
      try {
        const clipboard = globalThis.navigator?.clipboard;
        if (!clipboard?.writeText) throw new Error('이 브라우저에서 클립보드 복사를 지원하지 않습니다.');
        await clipboard.writeText(resumeCommand);
        status.hidden = false;
        status.className = 'session-action-status';
        setText(status, '이어 하기 명령을 복사했습니다.');
      } catch (error) {
        status.hidden = false;
        status.className = 'session-action-status is-error';
        setText(status, `복사 실패: ${error instanceof Error ? error.message : String(error)}`);
      }
    });
    copyCommand.setAttribute('aria-label', `${session.host} 세션 이어 하기 명령 복사`);
    actions.append(copyCommand, status);
  }
  const details = button('button button-quiet session-card-details', '자세히보기', () => {
    openSession(session);
  });
  details.setAttribute('aria-label', `${session.id} 세션 자세히보기`);
  details.dataset.sessionHost = session.host;
  details.dataset.sessionId = session.id;
  actions.append(details);
  card.append(actions);
  return card;
}

function renderHostFilters() {
  const container = $('host-filters');
  container.replaceChildren();
  const options = [['all', '전체'], ['copilot', 'Copilot'], ['claude', 'Claude'], ['codex', 'Codex']];
  for (const [value, label] of options) {
    const control = button(`filter-chip${state.hostFilter === value ? ' is-active' : ''}`, label, () => {
      state.hostFilter = value;
      state.visibleCount = 8;
      render();
    });
    control.setAttribute('aria-pressed', String(state.hostFilter === value));
    container.append(control);
  }
}

function renderAttentionFilters() {
  const container = $('attention-filters');
  container.replaceChildren();
  const options = [
    ['all', '전체'],
    ['approval', '승인 대기'],
    ['question', '질문'],
    ['failed', '실패'],
    ['unlinked', 'run 미연결']
  ];
  for (const [value, label] of options) {
    const count = getSessionGridItems(state.snapshot, {
      workspaceId: state.workspaceId,
      host: state.hostFilter,
      filter: value
    }).length;
    if (value !== 'all' && count === 0 && state.attentionFilter !== value) continue;
    const control = button(`attention-filter attention-filter-${value}${state.attentionFilter === value ? ' is-active' : ''}`, `${label} ${count}`, () => {
      state.attentionFilter = value;
      state.visibleCount = 8;
      render();
    });
    control.setAttribute('aria-pressed', String(state.attentionFilter === value));
    container.append(control);
  }
}

function renderSessionGrid() {
  const grid = getDashboardRegion(document, 'session-grid');
  const workspaces = state.snapshot?.workspaces ?? [];
  const workspace = currentWorkspace();
  const availableItems = getSessionGridItems(state.snapshot, { workspaceId: state.workspaceId });
  const items = getSessionGridItems(state.snapshot, {
    workspaceId: state.workspaceId,
    host: state.hostFilter,
    filter: state.attentionFilter,
    sort: state.sortOrder
  });
  const page = getSessionGridPage(items, state.visibleCount);
  grid.replaceChildren();
  $('session-count').textContent = String(items.length);
  $('session-empty').hidden = items.length > 0;
  setText($('workspace-caption'), workspace
    ? workspace.path
    : `모든 워크스페이스 · ${workspaces.length}개`);
  setText($('grid-summary'), `${items.length}개 세션 · ${page.items.length}개 표시`);
  renderHostFilters();
  renderAttentionFilters();
  $('grid-sort').value = state.sortOrder;
  $('group-mode').setAttribute('aria-pressed', String(state.groupByRun));
  $('group-mode').textContent = state.groupByRun ? 'run별 묶기 켬' : 'run별 묶기';

  if (state.groupByRun) {
    const groups = new Map();
    for (const item of page.items) {
      const key = `${item.workspace.id}\0${item.run?.id ?? 'unlinked'}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    for (const groupItems of groups.values()) {
      const first = groupItems[0];
      const section = node('section', 'session-run-group');
      const heading = node('div', 'session-run-heading');
      const title = first.run ? first.run.title : 'run 미연결 세션';
      heading.append(node('strong', 'session-run-title', title));
      heading.append(node('span', 'session-run-meta', `${first.workspace.path} · ${groupItems.length}개 세션`));
      if (first.run) heading.append(node('span', 'session-run-phase', phaseLabels[first.run.phase] ?? first.run.phase ?? '단계 미확인'));
      section.append(heading);
      const groupGrid = node('div', 'session-grid session-grid-group');
      for (const item of groupItems) groupGrid.append(renderSessionCard(item));
      section.append(groupGrid);
      grid.append(section);
    }
  } else {
    for (const item of page.items) grid.append(renderSessionCard(item));
  }

  const loadMore = $('load-more');
  loadMore.hidden = !page.hasMore;
  setText(loadMore, `더 보기 (+${page.nextCount})`);
  $('session-empty').querySelector('p').textContent = availableItems.length && !items.length
    ? '조건에 맞는 세션이 없습니다.'
    : '세션이 없습니다.';
}

function visibleSessionItems() {
  const items = getSessionGridItems(state.snapshot, {
    workspaceId: state.workspaceId,
    host: state.hostFilter,
    filter: state.attentionFilter,
    sort: state.sortOrder
  });
  return getSessionGridPage(items, state.visibleCount).items;
}

function writeSessionHash(session, replace = false) {
  const hash = session ? formatSessionHash(session) : '';
  if (window.location.hash === hash) return;
  const url = `${window.location.pathname}${window.location.search}${hash}`;
  window.history[replace ? 'replaceState' : 'pushState']({}, '', url);
}

function openSession(session) {
  state.sessionKey = sessionKey(session);
  state.activityKey = null;
  state.associationRunId = null;
  writeSessionHash(session);
  render();
  $('detail-heading').focus();
}

function focusSessionDetails(sessionKeyToFocus) {
  const [host, id] = sessionKeyToFocus.split('\0');
  const target = [...document.querySelectorAll('.session-card-details')]
    .find(item => item.dataset.sessionHost === host && item.dataset.sessionId === id);
  (target ?? getDashboardRegion(document, 'session-grid')).focus();
}

function closeSession({ updateHistory = true, restoreFocus = true } = {}) {
  const previousKey = state.sessionKey;
  state.sessionKey = null;
  state.activityKey = null;
  state.associationRunId = null;
  if (updateHistory) writeSessionHash(null);
  render();
  if (restoreFocus && previousKey) focusSessionDetails(previousKey);
}

function renderDrawerNavigation() {
  const items = visibleSessionItems();
  const index = items.findIndex(item => sessionKey(item.session) === state.sessionKey);
  const canNavigate = index >= 0 && items.length > 1;
  $('drawer-previous').disabled = !canNavigate;
  $('drawer-next').disabled = !canNavigate;
  setText($('drawer-position'), index >= 0 ? `${index + 1} / ${items.length}` : '현재 필터 외 세션');
}

function navigateDrawer(delta) {
  const nextKey = getAdjacentSessionKey(visibleSessionItems(), state.sessionKey, delta);
  if (!nextKey) return;
  const next = getSessionGridItems(state.snapshot, { workspaceId: state.workspaceId })
    .find(item => sessionKey(item.session) === nextKey);
  if (!next) return;
  state.sessionKey = nextKey;
  state.activityKey = null;
  state.associationRunId = null;
  writeSessionHash(next.session);
  render();
}

function applyLocationHash() {
  const key = parseSessionHash(window.location.hash);
  if (!key) {
    closeSession({ updateHistory: false });
    return;
  }
  const entry = getSessionGridItems(state.snapshot)
    .find(item => sessionKey(item.session) === key);
  if (!entry) {
    closeSession({ updateHistory: false, restoreFocus: false });
    return;
  }
  if (state.workspaceId !== null && state.workspaceId !== entry.workspace.id) {
    state.workspaceId = entry.workspace.id;
  }
  const selection = preserveDrawerSelection(state, key);
  state.sessionKey = selection.sessionKey;
  state.activityKey = selection.activityKey;
  state.associationRunId = selection.associationRunId;
  state.visibleCount = getVisibleCountForSession(
    getSessionGridItems(state.snapshot, {
      workspaceId: state.workspaceId,
      host: state.hostFilter,
      filter: state.attentionFilter,
      sort: state.sortOrder
    }),
    state.visibleCount,
    key
  );
  render();
}

function handleDrawerKeydown(event) {
  if ($('session-drawer').hidden || event.target.isContentEditable
    || ['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeSession();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    navigateDrawer(-1);
  } else if (event.key === 'ArrowRight') {
    event.preventDefault();
    navigateDrawer(1);
  }
}

function renderWarnings(id, warnings, limit = 4) {
  const list = $(id);
  list.replaceChildren();
  for (const warning of warnings.slice(0, limit)) list.append(node('div', 'warning-item', warning));
  return list;
}

// Fatal errors stay above the grid; snapshot warnings collapse bottom-left so they never push the grid down.
function syncGlobalStatus() {
  setHidden('global-status', $('dashboard-error').hidden);
}

function setSnapshotAlertsOpen(open) {
  state.snapshotAlertsOpen = open;
  setHidden('snapshot-alerts-panel', !open);
  $('snapshot-alerts-toggle').setAttribute('aria-expanded', String(open));
}

function renderSnapshotWarnings() {
  const warnings = state.snapshot?.warnings ?? [];
  renderWarnings('snapshot-warnings', warnings, warnings.length);
  setText($('snapshot-alerts-label'), `알림 ${warnings.length}건`);
  setHidden('snapshot-alerts', warnings.length === 0);
  setSnapshotAlertsOpen(warnings.length > 0 && state.snapshotAlertsOpen);
  syncGlobalStatus();
}

function renderAttention(workspace, session, run) {
  const awaiting = getAwaitingApprovalGate(run);
  const pendingGates = awaiting ? [awaiting] : [];
  const question = [...(session?.pendingQuestions ?? [])].sort((a, b) => Date.parse(b.at ?? '') - Date.parse(a.at ?? ''))[0];
  setHidden('approval-banner', pendingGates.length === 0);
  if (pendingGates.length) {
    setText($('approval-copy'), `${pendingGates.map(gate => gate.id).join(', ')} 게이트의 사람 승인이 필요합니다. 대시보드는 승인을 수행하지 않습니다.`);
  }
  setHidden('question-banner', !question);
  if (question) {
    setText($('question-copy'), question.excerpt || question.label || '응답이 필요한 질문이 있습니다.');
  }
  $('approval-banner').setAttribute('aria-label', pendingGates.length ? `사람 승인 대기: ${pendingGates.map(gate => gate.id).join(', ')}` : '');
  $('question-banner').setAttribute('aria-label', question ? `대화 질문: ${question.excerpt || question.label || ''}` : '');
}

function renderAssociationPanel(workspace, session, run) {
  const panel = $('association-panel');
  if (!workspace || !session) {
    panel.hidden = true;
    return;
  }
  const needsChoice = !run || workspace.runs.length > 1 || session.associationSource === 'override';
  panel.hidden = !needsChoice;
  if (!needsChoice) return;

  setText($('association-title'), run
    ? `현재 연결: ${run.title}`
    : '이 세션은 run에 연결되지 않았습니다.');
  const visitedRuns = (session.runIds ?? []).filter(id => id !== run?.id);
  setText($('association-copy'), !run
    ? '세션의 하네스 명령·경로 기록에서 run을 찾지 못했습니다. 연결할 run을 직접 선택할 수 있습니다.'
    : session.associationSource === 'override'
      ? '수동으로 연결한 run입니다. 다른 run으로 변경하거나 연결을 제거할 수 있습니다.'
      : `하네스 명령·경로 기록으로 자동 연결했습니다.${visitedRuns.length ? ` 이 세션은 ${visitedRuns.join(', ')}도 다뤘습니다.` : ''} 필요하면 다른 run으로 변경할 수 있습니다.`);
  const select = $('run-select');
  select.replaceChildren();
  const placeholder = node('option', '', workspace.runs.length ? '연결할 run 선택' : '연결할 run 없음');
  placeholder.value = '';
  select.append(placeholder);
  for (const candidate of workspace.runs) {
    const option = node('option', '', `${candidate.title} · ${phaseLabels[candidate.phase] ?? candidate.phase}`);
    option.value = candidate.id;
    select.append(option);
  }
  select.value = preserveAssociationSelection(
    state.associationRunId,
    run?.id,
    workspace.runs.map(candidate => candidate.id)
  );
  $('link-run-button').disabled = workspace.runs.length === 0;
  $('unlink-run-button').hidden = session.associationSource !== 'override';
}

function phaseIndex(phase) {
  if (phase === 'done') return phaseOrder.length;
  const normalized = phase === 'publish' ? 'plan' : phase;
  return phaseOrder.indexOf(normalized);
}

function renderPhaseTrack(run) {
  const track = $('phase-track');
  track.replaceChildren();
  const current = phaseIndex(run.phase);
  phaseOrder.forEach((phase, index) => {
    const status = current < 0 ? 'is-unknown' : index < current ? 'is-complete' : index === current ? 'is-current' : '';
    const step = node('div', `phase-step ${status}`);
    const marker = node('span', 'phase-marker', index < current ? '✓' : String(index + 1).padStart(2, '0'));
    marker.setAttribute('aria-hidden', 'true');
    step.append(marker, node('span', 'phase-label', phaseLabels[phase]));
    track.append(step);
  });
}

function renderGates(run) {
  const list = $('gate-list');
  list.replaceChildren();
  for (const gate of run.gates ?? []) {
    const card = node('div', `gate-card gate-${gate.status}`);
    const top = node('div', 'gate-card-top');
    top.append(node('strong', 'gate-id', gate.id));
    top.append(node('span', `gate-status status-${gate.status}`, statusLabel(gate.status)));
    card.append(top, node('span', 'gate-owner', gate.owner === 'human' ? '사람 승인' : '시스템 검증'));
    const evidenceCount = gate.evidencePaths?.length ?? 0;
    if (evidenceCount) card.append(node('span', 'gate-evidence', `${evidenceCount}개 근거`));
    list.append(card);
  }
}

const PACKAGE_SCRIPT = '(?:npm|pnpm|yarn|bun)\\s+(?:--prefix\\s+\\S+\\s+)?(?:run\\s+)?';
const TEST_RUNNER = new RegExp(`(?:^|\\s)(?:${PACKAGE_SCRIPT}test\\b|node\\s+--test\\b|npx\\s+playwright\\b|playwright\\s+test\\b|cypress\\s+run\\b|pytest\\b|go\\s+test\\b|vitest\\b|jest\\b|cargo\\s+test\\b|\\S*(?:mvnw?|gradlew?)\\b.*\\btest\\b|dotnet\\s+test\\b|newman\\b|hurl\\b)`, 'i');
const BUILD_CHECK = new RegExp(`(?:^|\\s)(?:${PACKAGE_SCRIPT}(?:build|lint|typecheck|validate)\\b|eslint\\b|tsc\\b)`, 'i');
const INSPECTION_COMMAND = /^(?:rg|grep|egrep|ag|cat|sed|head|tail|less|awk|ls|find|ps|lsof|echo|printf|git|kill|wc|tee|sort|uniq|jq|xargs)\b/;
const commandChecks = [
  { id: 'unit', title: '단위 테스트' },
  { id: 'api', title: 'API 테스트' },
  { id: 'e2e', title: 'E2E 테스트' },
  { id: 'build', title: '빌드 · 검사' }
];
const reviewTitles = { plan: '계획 리뷰', slice: 'Slice 리뷰', final: '최종 리뷰' };
const reviewRank = { plan: 0, slice: 1, final: 3 };

function eventTime(value) {
  const time = Date.parse(value ?? '');
  return Number.isFinite(time) ? time : 0;
}

// Equal timestamps keep record order, so the later record counts as the more recent one.
function latestFirst(items) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => eventTime(b.item.at) - eventTime(a.item.at) || b.index - a.index)
    .map(({ item }) => item);
}

// The newest run decides; an older result never stands in for a run that has none yet.
function definitiveOutcome(occurrences) {
  const outcome = latestFirst(occurrences)[0]?.outcome;
  return outcome === 'passed' || outcome === 'failed' ? outcome : 'unknown';
}

function combinedOutcome(outcomes) {
  if (outcomes.includes('failed')) return 'failed';
  return outcomes.length && outcomes.every(outcome => outcome === 'passed') ? 'passed' : 'unknown';
}

// `;`, `||`, `|`, a background `&` and newlines let the shell's exit status come from another
// command; redirections such as `2>&1`, `>&2` and `&>` do not.
const OPAQUE_STATUS = /;|\|\||\||\n|(?<![&>])&(?![&>])/;

const unquoted = command => command.replace(/'[^']*(?:'|$)|"[^"]*(?:"|$)/g, ' ');

function commandSegments(command) {
  return unquoted(command)
    .split(/;|&&|\|\||\||\n|(?<![&>])&(?![&>])/)
    .map(segment => segment.replace(/^[\s(]+/, '').replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, '').trim())
    .filter(Boolean);
}

function segmentCheck(segment) {
  if (INSPECTION_COMMAND.test(segment)) return null;
  if (TEST_RUNNER.test(segment)) return /e2e|playwright|cypress/i.test(segment) ? 'e2e' : /api|newman|hurl/i.test(segment) ? 'api' : 'unit';
  return BUILD_CHECK.test(segment) ? 'build' : null;
}

function classifyCommand(command) {
  if (typeof command !== 'string') return [];
  return [...new Set(commandSegments(command).map(segmentCheck).filter(Boolean))];
}

// An `&&` chain's success proves every step passed; its failure cannot identify the failed
// step, even when the other steps are setup commands such as cd, pushd or export.
function checkOutcomes(command, outcome) {
  const checks = classifyCommand(command);
  const proven = new Map(checks.map(check => [check, 'unknown']));
  if (!checks.length || OPAQUE_STATUS.test(unquoted(command))) return proven;
  if (outcome === 'passed') for (const check of checks) proven.set(check, 'passed');
  if (outcome === 'failed') {
    const steps = commandSegments(command);
    if (steps.length === 1 && checks.length === 1) proven.set(checks[0], 'failed');
  }
  return proven;
}

function makeNode(lane, id, title, occurrences, extra = {}) {
  const recent = latestFirst(occurrences);
  return {
    key: `${lane}:${id}`,
    lane,
    title,
    count: occurrences.length,
    outcome: 'unknown',
    lastAt: recent.find(item => item.at)?.at ?? null,
    occurrences: recent.slice(0, 5),
    evidencePaths: [],
    detail: '',
    ...extra
  };
}

function skillNodes(events) {
  const groups = new Map();
  for (const event of events) {
    if (event.kind !== 'skill' || getRelatedIds(event).length) continue;
    const name = String(event.label || 'skill').split(':').pop();
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push({ at: event.at ?? null, outcome: 'none', label: event.command || event.label || name, source: event.source });
  }
  return [...groups.entries()]
    .sort(([, a], [, b]) => Math.min(...a.map(item => eventTime(item.at))) - Math.min(...b.map(item => eventTime(item.at))))
    .map(([name, occurrences]) => makeNode('skill', name, name, occurrences, { outcome: 'none', detail: `${occurrences.length}회 호출` }));
}

// Snapshots without a stage predate it; their axis named the stage, or `slice-<id>` for slices.
function reviewStage(review) {
  if (typeof review.stage === 'string') return review.stage;
  const axis = String(review.axis ?? 'review');
  if (axis.startsWith('slice-') || axis === 'spec' || axis === 'standards') return 'slice';
  return axis;
}

function reviewNodes(reviews) {
  const groups = new Map();
  for (const review of reviews) {
    const group = reviewStage(review);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(review);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (reviewRank[a] ?? 2) - (reviewRank[b] ?? 2))
    .map(([group, entries]) => {
      const known = entries.filter(review => Number.isInteger(review.blocking));
      const blocking = known.reduce((total, review) => total + review.blocking, 0);
      return makeNode('review', group, reviewTitles[group] ?? `${group} 리뷰`, entries.map(review => ({
        at: null,
        outcome: review.status ?? 'unknown',
        label: [
          review.sliceId !== null && review.sliceId !== undefined ? `Slice ${review.sliceId}` : null,
          review.axis,
          review.reviewerType ?? 'unknown',
          Number.isInteger(review.blocking) ? `차단 ${review.blocking}${review.accepted ? ' (사람 수용)' : ''}` : null
        ].filter(Boolean).join(' · ')
      })), {
        outcome: combinedOutcome(entries.map(review => review.status ?? 'unknown')),
        blocking,
        detail: known.length ? `차단 지적 ${blocking}건` : '차단 지적 미확인',
        evidencePaths: entries.flatMap(review => review.evidencePaths ?? [])
      });
    });
}

function verificationNodes(events, verification) {
  const nodes = [];
  const tdd = verification.filter(check => /^Slice .+ (?:TDD RED evidence|GREEN verification|baseline evidence)$/.test(check.name ?? ''));
  if (tdd.length) {
    const slices = new Set(tdd.map(check => check.name.replace(/^Slice (.+) (?:TDD RED evidence|GREEN verification|baseline evidence)$/, '$1')));
    const red = tdd.filter(check => check.name.endsWith('TDD RED evidence'));
    const green = tdd.filter(check => check.name.endsWith('GREEN verification'));
    nodes.push(makeNode('verification', 'tdd', 'TDD RED→GREEN', [...slices].map(slice => ({
      at: null,
      outcome: green.find(check => check.name === `Slice ${slice} GREEN verification`)?.outcome ?? 'unknown',
      label: `Slice ${slice}`
    })), {
      outcome: green.length === slices.size && green.every(check => check.outcome === 'passed') ? 'passed' : 'unknown',
      detail: `RED ${red.length} · GREEN ${green.length}`,
      evidencePaths: tdd.flatMap(check => check.evidencePaths ?? [])
    }));
  }
  const results = new Map();
  for (const event of events) {
    for (const id of getRelatedIds(event)) results.set(id, event);
  }
  const groups = new Map(commandChecks.map(check => [check.id, []]));
  for (const event of events) {
    if (event.kind !== 'tool' || getRelatedIds(event).length) continue;
    const result = results.get(event.id);
    const outcome = result?.outcome && result.outcome !== 'unknown' ? result.outcome : event.outcome ?? 'unknown';
    for (const [check, checkOutcome] of checkOutcomes(event.command, outcome)) {
      groups.get(check).push({
        at: event.at ?? null,
        outcome: checkOutcome,
        label: event.command,
        source: event.source
      });
    }
  }
  for (const check of commandChecks) {
    const occurrences = groups.get(check.id);
    if (!occurrences.length) continue;
    const failed = occurrences.filter(item => item.outcome === 'failed').length;
    nodes.push(makeNode('verification', check.id, check.title, occurrences, {
      outcome: definitiveOutcome(occurrences),
      detail: `${occurrences.length}회 실행${failed ? ` · 실패 ${failed}회` : ''}`
    }));
  }
  for (const check of verification.filter(item => /^G[34] verification$/.test(item.name ?? ''))) {
    const gate = check.name.slice(0, 2);
    nodes.push(makeNode('verification', gate, `${gate} 검증`, [{ at: null, outcome: check.outcome ?? 'unknown', label: check.name }], {
      outcome: check.outcome ?? 'unknown',
      detail: `근거 ${check.evidencePaths?.length ?? 0}개`,
      evidencePaths: check.evidencePaths ?? []
    }));
  }
  return nodes;
}

export function summarizeActivity(run) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const reviews = Array.isArray(run?.reviews) ? run.reviews : [];
  const verification = Array.isArray(run?.verification) ? run.verification : [];
  const skills = skillNodes(events);
  const reviewLane = reviewNodes(reviews);
  const checks = verificationNodes(events, verification);
  const omittedTools = events.filter(event => event.kind === 'tool' && !getRelatedIds(event).length && !classifyCommand(event.command).length).length;
  const blocking = reviewLane.reduce((total, item) => total + item.blocking, 0);
  return {
    headline: `스킬 ${skills.length}종 · 리뷰 ${reviews.length}건(차단 ${blocking}) · 검증 ${checks.length}종 · 일반 도구 ${omittedTools}건 생략`,
    lanes: [
      { id: 'skill', label: '스킬', nodes: skills },
      { id: 'review', label: '리뷰', nodes: reviewLane },
      { id: 'verification', label: '검증', nodes: checks }
    ]
  };
}

const laneLabels = { skill: '스킬', review: '리뷰', verification: '검증' };
const outcomeIcons = { passed: '✓', failed: '✕', pending: '…', unknown: '?', none: '•' };
const LANE_CHIP_LIMIT = 8;

function renderInspector(nodes) {
  const selected = nodes.find(item => item.key === state.activityKey) ?? null;
  setHidden('inspector-empty', Boolean(selected));
  setHidden('inspector-content', !selected);
  if (!selected) {
    setText($('inspector-source'), '—');
    return;
  }
  setText($('inspector-title'), selected.title);
  setText($('inspector-source'), laneLabels[selected.lane] ?? selected.lane);
  const meta = $('inspector-meta');
  meta.replaceChildren();
  meta.append(node('span', `outcome-pill outcome-${selected.outcome}`, statusLabel(selected.outcome)));
  meta.append(node('span', 'meta-value', `${selected.count}건`));
  meta.append(node('span', 'meta-value', selected.lastAt ? `최근 ${formatTime(selected.lastAt)}` : '시간 정보 없음'));
  setText($('inspector-excerpt'), selected.detail || '기록된 상세 설명이 없습니다.');
  const extra = $('inspector-extra');
  extra.replaceChildren();
  if (selected.occurrences.length) {
    extra.append(node('span', 'inspector-label', selected.count > selected.occurrences.length
      ? `최근 기록 ${selected.occurrences.length}/${selected.count}`
      : '기록'));
    const list = node('ul', 'occurrence-list');
    for (const occurrence of selected.occurrences) {
      const item = node('li', 'occurrence-item');
      item.append(node('span', `occurrence-status outcome-${occurrence.outcome}`, outcomeIcons[occurrence.outcome] ?? '?'));
      if (occurrence.at) item.append(node('span', 'occurrence-time', formatTime(occurrence.at)));
      item.append(node('code', 'occurrence-label', occurrence.label));
      list.append(item);
    }
    extra.append(list);
  }
  if (selected.evidencePaths.length) {
    extra.append(node('span', 'inspector-label', 'Run 근거 파일'));
    const evidence = node('ul', 'evidence-list');
    for (const path of selected.evidencePaths) evidence.append(node('li', '', path));
    extra.append(evidence);
  }
}

function renderActivity(run) {
  const graph = $('activity-graph');
  graph.replaceChildren();
  const summary = summarizeActivity(run);
  const nodes = summary.lanes.flatMap(lane => lane.nodes);
  setText($('activity-headline'), summary.headline);
  if (!nodes.some(item => item.key === state.activityKey)) state.activityKey = nodes[0]?.key ?? null;
  for (const lane of summary.lanes) {
    const row = node('div', `activity-lane lane-${lane.id}`);
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', lane.label);
    row.append(node('span', 'lane-label', lane.label));
    const chips = node('div', 'lane-chips');
    if (!lane.nodes.length) chips.append(node('span', 'lane-empty', '기록 없음'));
    const expanded = state.expandedLanes.has(lane.id) || lane.nodes.length <= LANE_CHIP_LIMIT;
    const selectedIndex = lane.nodes.findIndex(item => item.key === state.activityKey);
    const visible = expanded
      ? lane.nodes
      : lane.nodes.filter((item, index) => index < LANE_CHIP_LIMIT - 1 || index === selectedIndex);
    visible.forEach((item, index) => {
      if (lane.id === 'verification' && index) {
        const arrow = node('span', 'chip-arrow', '→');
        arrow.setAttribute('aria-hidden', 'true');
        chips.append(arrow);
      }
      const chip = button(`activity-chip chip-${lane.id}${item.key === state.activityKey ? ' is-selected' : ''}`, '', () => {
        state.activityKey = item.key;
        renderActivity(run);
      });
      chip.setAttribute('aria-pressed', String(item.key === state.activityKey));
      chip.setAttribute('aria-label', `${lane.label}: ${item.title}, ${item.count}건, ${statusLabel(item.outcome)}`);
      chip.title = item.detail || item.title;
      const icon = node('span', `chip-status outcome-${item.outcome}`, outcomeIcons[item.outcome] ?? '?');
      icon.setAttribute('aria-hidden', 'true');
      chip.append(icon, node('span', 'chip-title', item.title));
      if (item.count > 1) chip.append(node('span', 'chip-count', `×${item.count}`));
      chips.append(chip);
    });
    if (lane.nodes.length > LANE_CHIP_LIMIT) {
      const toggle = button('lane-toggle', expanded ? '접기' : `+${lane.nodes.length - visible.length}`, () => {
        if (expanded) state.expandedLanes.delete(lane.id);
        else state.expandedLanes.add(lane.id);
        renderActivity(run);
      });
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.setAttribute('aria-label', expanded ? `${lane.label} 접기` : `${lane.label} ${lane.nodes.length - visible.length}개 더 보기`);
      chips.append(toggle);
    }
    row.append(chips);
    graph.append(row);
  }
  renderInspector(nodes);
}

function renderRun(workspace, session, run) {
  const hasSession = Boolean(session);
  setHidden('session-drawer', !hasSession);
  const sessionWarnings = hasSession ? session.warnings ?? [] : [];
  renderWarnings('session-warnings', sessionWarnings).hidden = sessionWarnings.length === 0;
  setHidden('detail-empty', Boolean(run));
  setHidden('run-content', !run);
  setHidden('phase-chip', !run);
  if (!hasSession) {
    $('association-panel').hidden = true;
    $('approval-banner').hidden = true;
    $('question-banner').hidden = true;
    setText($('detail-heading'), 'SDLC 실행');
    setText($('run-subtitle'), '세션을 선택하면 연결된 run의 진행 상태를 표시합니다.');
    setText($('detail-empty').querySelector('p'), '세션을 선택해 SDLC 실행을 확인하세요.');
    setText($('detail-empty').querySelector('span:last-child'), '각 run의 승인 게이트, 크로스리뷰, TDD 및 테스트 근거를 한곳에 모읍니다.');
    renderInspector([]);
    return;
  }
  renderAssociationPanel(workspace, session, run);
  renderAttention(workspace, session, run);
  if (!run) {
    setHidden('detail-empty', false);
    setText($('detail-heading'), 'SDLC 실행');
    setText($('run-subtitle'), `${hostLabels[session.host] ?? '세션'} · ${session.id}`);
    setText($('detail-empty').querySelector('p'), '연결된 run이 없습니다.');
    setText($('detail-empty').querySelector('span:last-child'), '위에서 현재 워크스페이스의 run을 선택해 연결하세요.');
    renderInspector([]);
    return;
  }
  setText($('detail-heading'), 'SDLC 실행');
  setText($('run-title'), run.title);
  setText($('run-subtitle'), `${hostLabels[session.host] ?? '세션'} · ${session.id} · ${run.id}`);
  setText($('phase-chip'), phaseLabels[run.phase] ?? run.phase ?? 'Unknown');
  setText($('run-validity'), run.valid ? '근거 유효' : '근거 확인 필요');
  $('run-validity').className = `validity-chip ${run.valid ? 'is-valid' : 'is-invalid'}`;
  renderPhaseTrack(run);
  renderGates(run);
  renderActivity(run);
  const warnings = $('run-warnings');
  warnings.replaceChildren();
  for (const warning of (run.warnings ?? []).slice(0, 4)) warnings.append(node('div', 'warning-item', warning));
}

function renderError(message) {
  const banner = $('dashboard-error');
  setText(banner, message ?? '');
  banner.hidden = !message;
  syncGlobalStatus();
  if (message) setText($('refresh-status'), '데이터를 불러오지 못했습니다');
}

function render() {
  const workspaces = state.snapshot?.workspaces ?? [];
  if (state.workspaceId !== null && !workspaces.some(item => item.id === state.workspaceId)) state.workspaceId = null;
  const entries = getSessionGridItems(state.snapshot, { workspaceId: state.workspaceId });
  if (!entries.some(item => sessionKey(item.session) === state.sessionKey)) {
    state.sessionKey = null;
    state.activityKey = null;
  }
  const selected = entries.find(item => sessionKey(item.session) === state.sessionKey);
  const workspace = selected?.workspace ?? currentWorkspace();
  const session = selected?.session ?? null;
  const run = currentRun(workspace, session);
  $('dashboard-grid').classList.toggle('is-drawer-open', Boolean(session));
  renderWorkspaceList();
  renderSessionGrid();
  renderSnapshotWarnings();
  renderRun(workspace, session, run);
  renderDrawerNavigation();
  if (!state.refreshing) setConnectedStatus($('refresh-status'), new Date(), state.refreshIntervalMs);
}

async function refreshDashboard() {
  if (state.refreshing) return;
  state.refreshing = true;
  $('refresh-button').disabled = true;
  try {
    const response = await fetch('/api/dashboard', { cache: 'no-store' });
    if (!response.ok) throw new Error(`대시보드 API 응답 오류 (${response.status})`);
    const snapshot = await response.json();
    if (!snapshot || !Array.isArray(snapshot.workspaces) || !Array.isArray(snapshot.warnings)) {
      throw new Error('대시보드 API 데이터 형식이 올바르지 않습니다.');
    }
    state.snapshot = snapshot;
    if (parseSessionHash(window.location.hash)) applyLocationHash();
    renderError('');
    render();
  } catch (error) {
    renderError(error instanceof Error ? error.message : '대시보드 데이터를 불러오지 못했습니다.');
  } finally {
    state.refreshing = false;
    $('refresh-button').disabled = false;
    if (state.snapshot && $('dashboard-error').hidden) setConnectedStatus($('refresh-status'), new Date(), state.refreshIntervalMs);
    scheduleRefresh();
  }
}

function scheduleRefresh() {
  window.clearTimeout(state.refreshTimer);
  state.refreshTimer = null;
  if (state.refreshIntervalMs > 0) state.refreshTimer = window.setTimeout(refreshDashboard, state.refreshIntervalMs);
}

function readStoredRefreshInterval() {
  try {
    return normalizeRefreshInterval(window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY));
  } catch {
    return DEFAULT_REFRESH_INTERVAL_MS;
  }
}

function setRefreshInterval(value) {
  state.refreshIntervalMs = normalizeRefreshInterval(value);
  try {
    window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(state.refreshIntervalMs));
  } catch {
    // Storage can be unavailable in private windows; the choice still applies to this page.
  }
  if (state.snapshot && $('dashboard-error').hidden) setConnectedStatus($('refresh-status'), new Date(), state.refreshIntervalMs);
  scheduleRefresh();
}

async function submitAssociation(remove = false) {
  const entry = currentSessionEntry();
  const workspace = entry?.workspace ?? null;
  const session = entry?.session ?? null;
  if (!workspace || !session) return;
  const buttonId = remove ? 'unlink-run-button' : 'link-run-button';
  const actionButton = $(buttonId);
  actionButton.disabled = true;
  try {
    let response;
    if (remove) {
      const query = new URLSearchParams({ host: session.host, sessionId: session.id });
      response = await fetch(`/api/associations?${query}`, { method: 'DELETE' });
    } else {
      const runId = $('run-select').value;
      if (!runId) throw new Error('먼저 연결할 run을 선택하세요.');
      response = await fetch('/api/associations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ host: session.host, sessionId: session.id, runId })
      });
    }
    if (!response.ok) throw new Error(`세션 연결을 저장하지 못했습니다 (${response.status}).`);
    renderError('');
    await refreshDashboard();
  } catch (error) {
    renderError(error instanceof Error ? error.message : '세션 연결을 저장하지 못했습니다.');
  } finally {
    actionButton.disabled = false;
  }
}

function initialize() {
  const intervalSelect = $('refresh-interval');
  intervalSelect.replaceChildren(...REFRESH_INTERVAL_OPTIONS.map(option => {
    const node = document.createElement('option');
    node.value = String(option.value);
    setText(node, option.label);
    return node;
  }));
  state.refreshIntervalMs = readStoredRefreshInterval();
  intervalSelect.value = String(state.refreshIntervalMs);
  intervalSelect.addEventListener('change', event => setRefreshInterval(event.currentTarget.value));
  $('refresh-button').addEventListener('click', refreshDashboard);
  $('drawer-close').addEventListener('click', () => closeSession());
  $('drawer-previous').addEventListener('click', () => navigateDrawer(-1));
  $('drawer-next').addEventListener('click', () => navigateDrawer(1));
  $('grid-sort').addEventListener('change', event => {
    state.sortOrder = event.currentTarget.value;
    state.visibleCount = 8;
    render();
  });
  $('group-mode').addEventListener('click', () => {
    state.groupByRun = !state.groupByRun;
    render();
  });
  $('load-more').addEventListener('click', () => {
    state.visibleCount += 8;
    render();
  });
  $('run-select').addEventListener('change', event => {
    state.associationRunId = event.currentTarget.value;
  });
  $('link-run-button').addEventListener('click', () => submitAssociation(false));
  $('unlink-run-button').addEventListener('click', () => submitAssociation(true));
  $('snapshot-alerts-toggle').addEventListener('click', () => setSnapshotAlertsOpen(!state.snapshotAlertsOpen));
  $('snapshot-alerts-close').addEventListener('click', () => {
    setSnapshotAlertsOpen(false);
    $('snapshot-alerts-toggle').focus();
  });
  $('snapshot-alerts').addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !state.snapshotAlertsOpen) return;
    event.preventDefault();
    event.stopPropagation();
    setSnapshotAlertsOpen(false);
    $('snapshot-alerts-toggle').focus();
  });
  window.addEventListener('keydown', handleDrawerKeydown);
  window.addEventListener('hashchange', applyLocationHash);
  window.addEventListener('popstate', applyLocationHash);
  window.addEventListener('resize', () => {
    const entry = currentSessionEntry();
    if (entry?.run) renderActivity(entry.run);
  });
  void refreshDashboard();
}

if (typeof document !== 'undefined') initialize();
