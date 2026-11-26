import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const root = new URL('../dashboard/', import.meta.url);
const repositoryRoot = new URL('../', import.meta.url);
const readAsset = name => readFile(new URL(name, root), 'utf8');
const readRepositoryFile = name => readFile(new URL(name, repositoryRoot), 'utf8');

test('dashboard page exposes workspace, session grid, drawer, SDLC, and separate alerts', async () => {
  const html = await readAsset('index.html');
  for (const label of ['워크스페이스', '세션', 'SDLC 실행', '상세 정보', '사람 승인 대기', '대화 질문']) {
    assert.ok(html.includes(label), `missing UI label: ${label}`);
  }
  for (const region of ['workspace-list', 'session-grid', 'session-drawer', 'sdlc-detail', 'event-detail']) {
    assert.ok(html.includes(`data-region="${region}"`), `missing region: ${region}`);
  }
  assert.ok(!html.includes('data-region="session-list"'), 'standalone session list is removed');
});

test('session grid orders attention before recent activity', async () => {
  const app = await readAsset('app.js');
  const { getSessionGridItems } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  const workspace = {
    id: '/work/alpha',
    path: '/work/alpha',
    sessions: [
      { host: 'copilot', id: 'approval', runId: 'deploy', lastActivityAt: '2026-11-26T10:00:00Z' },
      { host: 'claude', id: 'question', runId: 'design', lastActivityAt: '2026-11-26T10:30:00Z', pendingQuestions: [{ id: 'q1' }] },
      { host: 'codex', id: 'failed', runId: 'tests', lastActivityAt: '2026-11-26T10:40:00Z', events: [{ outcome: 'failed' }] },
      { host: 'claude', id: 'linked-recent', runId: 'active', lastActivityAt: '2026-11-26T10:50:00Z' },
      { host: 'copilot', id: 'unlinked', runId: null, lastActivityAt: '2026-11-26T11:00:00Z' }
    ],
    runs: [
      { id: 'deploy', gates: [{ id: 'G5b', owner: 'human', status: 'pending' }] },
      { id: 'design', gates: [], reviews: [], verification: [] },
      { id: 'tests', gates: [], reviews: [], verification: [] },
      { id: 'active', gates: [], reviews: [], verification: [] }
    ]
  };
  const items = getSessionGridItems({ workspaces: [workspace] });
  assert.deepEqual(items.map(({ session }) => `${session.host}:${session.id}`), [
    'copilot:approval',
    'claude:question',
    'codex:failed',
    'claude:linked-recent',
    'copilot:unlinked'
  ]);
});

test('session grid filters by workspace host and attention', async () => {
  const app = await readAsset('app.js');
  const { getSessionGridItems } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  const alpha = {
    id: 'alpha',
    path: '/work/alpha',
    sessions: [
      { host: 'copilot', id: 'same-id', runId: 'deploy', lastActivityAt: '2026-11-26T10:00:00Z' },
      { host: 'claude', id: 'question', runId: 'design', pendingQuestions: [{ id: 'q1' }] },
      { host: 'codex', id: 'failed', runId: 'tests', events: [{ outcome: 'failed' }] },
      { host: 'copilot', id: 'unlinked', runId: null }
    ],
    runs: [
      { id: 'deploy', gates: [{ owner: 'human', status: 'pending' }] },
      { id: 'design', gates: [] },
      { id: 'tests', verification: [{ outcome: 'failed' }] }
    ]
  };
  const beta = {
    id: 'beta',
    path: '/work/beta',
    sessions: [{ host: 'codex', id: 'same-id', runId: null }],
    runs: []
  };
  const snapshot = { workspaces: [alpha, beta] };
  const ids = options => getSessionGridItems(snapshot, options).map(({ session }) => `${session.host}:${session.id}`);

  assert.deepEqual(ids({ workspaceId: 'alpha' }), [
    'copilot:same-id',
    'claude:question',
    'codex:failed',
    'copilot:unlinked'
  ]);
  assert.deepEqual(ids({ host: 'claude' }), ['claude:question']);
  assert.deepEqual(ids({ filter: 'approval' }), ['copilot:same-id']);
  assert.deepEqual(ids({ filter: 'question' }), ['claude:question']);
  assert.deepEqual(ids({ filter: 'failed' }), ['codex:failed']);
  assert.deepEqual(ids({ filter: 'unlinked' }), ['copilot:unlinked', 'codex:same-id']);
});

test('session grid paginates eight items without losing the total', async () => {
  const app = await readAsset('app.js');
  const { getSessionGridPage } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  const items = Array.from({ length: 11 }, (_, index) => ({ id: `session-${index + 1}` }));
  const firstPage = getSessionGridPage(items, 8);
  assert.deepEqual(firstPage, {
    items: items.slice(0, 8),
    total: 11,
    hasMore: true,
    nextCount: 3
  });
  assert.deepEqual(getSessionGridPage(items, 16), {
    items,
    total: 11,
    hasMore: false,
    nextCount: 0
  });
});

test('session overview replaces the separate list with a grid and load-more controls', async () => {
  const [html, app] = await Promise.all([readAsset('index.html'), readAsset('app.js')]);
  assert.ok(html.includes('data-region="workspace-list"'), 'workspace rail remains available');
  assert.ok(html.includes('data-region="session-grid"'), 'session grid region is present');
  assert.ok(!html.includes('data-region="session-list"'), 'separate session list is removed');
  assert.ok(html.includes('data-region="session-drawer"'), 'session detail drawer is present');
  assert.ok(html.includes('data-region="sdlc-detail"'), 'SDLC details remain available');
  assert.ok(html.includes('data-region="event-detail"'), 'event evidence remains available');
  for (const control of ['attention-filters', 'host-filters', 'grid-sort', 'group-mode', 'load-more']) {
    assert.ok(html.includes(`id="${control}"`), `missing session-grid control: ${control}`);
  }
  for (const content of ['모든 워크스페이스', '더 보기', 'run별 묶기', '자세히보기']) {
    assert.ok(app.includes(content) || html.includes(content), `missing session-grid content: ${content}`);
  }
});

test('session details open in an accessible drawer', async () => {
  const [html, app, styles] = await Promise.all([
    readAsset('index.html'),
    readAsset('app.js'),
    readAsset('styles.css')
  ]);
  assert.match(html, /aria-label="세션 상세"/);
  for (const control of ['drawer-close', 'drawer-previous', 'drawer-next']) {
    assert.ok(html.includes(`id="${control}"`), `missing drawer control: ${control}`);
  }
  for (const interaction of ["'Escape'", "'ArrowLeft'", "'ArrowRight'", "'hashchange'", "'popstate'"]) {
    assert.ok(app.includes(interaction), `missing drawer interaction: ${interaction}`);
  }
  for (const region of ['sdlc-detail', 'event-detail']) {
    assert.ok(html.includes(`data-region="${region}"`), `drawer must retain ${region}`);
  }
  assert.ok(styles.includes('.dashboard-grid.is-drawer-open'), 'desktop grid reserves space for the drawer');
  assert.ok(styles.includes('@media (max-width: 900px)'), 'drawer switches to overlay before columns overflow');
  assert.ok(styles.includes('position: fixed;'), 'narrow-screen drawer overlays instead of compressing cards');
});

test('drawer navigation preserves selection across URL history', async () => {
  const app = await readAsset('app.js');
  const {
    getAdjacentSessionKey,
    parseSessionHash,
    formatSessionHash,
    preserveDrawerSelection,
    getVisibleCountForSession
  } = await import(
    `data:text/javascript;base64,${Buffer.from(app).toString('base64')}`
  );
  const items = [
    { session: { host: 'copilot', id: 'same-id' } },
    { session: { host: 'claude', id: 'same-id' } },
    { session: { host: 'codex', id: 'last' } }
  ];
  assert.equal(getAdjacentSessionKey(items, 'copilot\0same-id', 1), 'claude\0same-id');
  assert.equal(getAdjacentSessionKey(items, 'copilot\0same-id', -1), 'codex\0last');
  assert.equal(getAdjacentSessionKey(items.slice(1, 2), 'claude\0same-id', 1), 'claude\0same-id');
  assert.equal(getAdjacentSessionKey([], 'copilot\0same-id', 1), null);
  const currentSelection = {
    sessionKey: 'copilot\0same-id',
    activityKey: 'verification-api',
    associationRunId: 'run-next'
  };
  assert.deepEqual(preserveDrawerSelection(currentSelection, 'copilot\0same-id'), currentSelection);
  assert.deepEqual(preserveDrawerSelection(currentSelection, 'claude\0same-id'), {
    sessionKey: 'claude\0same-id',
    activityKey: null,
    associationRunId: null
  });
  const manySessions = Array.from({ length: 25 }, (_, index) => ({
    session: { host: 'copilot', id: `session-${index + 1}` }
  }));
  assert.equal(getVisibleCountForSession(manySessions, 8, 'copilot\0session-19'), 24);
  assert.equal(getVisibleCountForSession(manySessions, 8, 'codex\0missing'), 8);

  const session = { host: 'claude', id: 'issue #1& x?/한글' };
  const hash = formatSessionHash(session);
  assert.equal(parseSessionHash(hash), `claude\0${session.id}`);
  assert.equal(parseSessionHash('#host=claude'), null);
  assert.equal(parseSessionHash('#host=other&session=x'), null);
  assert.equal(parseSessionHash('#host=__proto__&session=x'), null);
  assert.equal(parseSessionHash('#host=claude&host=copilot&session=x'), null);
  assert.equal(parseSessionHash('not-a-hash'), null);
});

test('dashboard refresh defaults to auto 60 seconds with selectable auto steps and manual mode', async () => {
  const [app, html] = await Promise.all([readAsset('app.js'), readAsset('index.html')]);
  assert.match(html, /<select[^>]*id="refresh-interval"/);
  assert.match(html, /id="refresh-button"[^>]*aria-label="지금 새로고침"/);
  const {
    DEFAULT_REFRESH_INTERVAL_MS,
    REFRESH_INTERVAL_OPTIONS,
    normalizeRefreshInterval,
    setConnectedStatus
  } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  assert.equal(DEFAULT_REFRESH_INTERVAL_MS, 60000);
  assert.deepEqual(
    REFRESH_INTERVAL_OPTIONS.map(option => [option.value, option.label]),
    [[10000, '자동 10초'], [30000, '자동 30초'], [60000, '자동 1분'], [300000, '자동 5분'], [0, '수동']]
  );
  assert.equal(normalizeRefreshInterval(undefined), 60000);
  assert.equal(normalizeRefreshInterval('garbage'), 60000);
  assert.equal(normalizeRefreshInterval('3000'), 60000);
  assert.equal(normalizeRefreshInterval('30000'), 30000);
  assert.equal(normalizeRefreshInterval('0'), 0);
  const status = { textContent: '' };
  setConnectedStatus(status, new Date('2026-11-26T10:00:00.000Z'), 60000);
  assert.match(status.textContent, /자동 1분$/);
  setConnectedStatus(status, new Date('2026-11-26T10:00:00.000Z'), 0);
  assert.match(status.textContent, /수동$/);
});

test('dashboard renders transcript values as inert text', async () => {
  const app = await readAsset('app.js');
  assert.doesNotMatch(app, /\.innerHTML\b/);
  assert.match(app, /\.textContent\s*=/);
  const {
    getDashboardRegion,
    getRelatedIds,
    preserveAssociationSelection,
    setConnectedStatus,
    setText
  } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  const node = { textContent: '' };
  const transcript = '<img src=x onerror=alert(1)>';
  setText(node, transcript);
  assert.equal(node.textContent, transcript);
  const region = {};
  const selectors = [];
  assert.equal(getDashboardRegion({ querySelector: selector => (selectors.push(selector), region) }, 'workspace-list'), region);
  assert.deepEqual(selectors, ['[data-region="workspace-list"]']);
  assert.deepEqual(getRelatedIds({}), []);
  assert.deepEqual(getRelatedIds({ relatedTo: ['event-1'] }), ['event-1']);
  const status = { textContent: '' };
  setConnectedStatus(status, new Date('2026-11-26T10:00:00.000Z'));
  assert.match(status.textContent, /로컬 데이터/);
  assert.equal(preserveAssociationSelection('local-beta', 'local-alpha', ['local-alpha', 'local-beta']), 'local-beta');
  assert.equal(preserveAssociationSelection('stale-run', 'local-alpha', ['local-alpha']), 'local-alpha');
});

test('activity summary compresses run events into skill, review, and verification lanes', async () => {
  const app = await readAsset('app.js');
  const { summarizeActivity } = await import(`data:text/javascript;base64,${Buffer.from(app).toString('base64')}`);
  const at = minute => `2026-11-26T10:${String(minute).padStart(2, '0')}:00.000Z`;
  const run = {
    events: [
      { id: 's1', at: at(0), kind: 'skill', label: 'superpowers:brainstorming', relatedTo: [] },
      { id: 's2', at: at(1), kind: 'skill', label: 'test-driven-development', relatedTo: [] },
      { id: 's2:result', at: at(1), kind: 'skill', label: 'test-driven-development', outcome: 'passed', relatedTo: ['s2'] },
      { id: 'view', at: at(2), kind: 'tool', label: 'view', command: null, relatedTo: [] },
      { id: 'grep', at: at(2), kind: 'tool', label: 'bash', command: 'rg -n e2e tests', relatedTo: [] },
      { id: 'api-1', at: at(3), kind: 'tool', command: 'npm run test:api', outcome: 'unknown', relatedTo: [] },
      { id: 'api-1:result', at: at(3), kind: 'tool', command: 'npm run test:api', outcome: 'failed', relatedTo: ['api-1'] },
      { id: 'unit', at: at(4), kind: 'tool', command: 'node --test tests/a.test.mjs', outcome: 'unknown', relatedTo: [] },
      { id: 's3', at: at(5), kind: 'skill', label: 'test-driven-development', relatedTo: [] },
      { id: 'api-2', at: at(6), kind: 'tool', command: 'npm run test:api', relatedTo: [] },
      { id: 'api-2:result', at: at(6), kind: 'tool', outcome: 'passed', relatedTo: ['api-2'] },
      { id: 'e2e', at: at(7), kind: 'tool', command: 'cd app && npx playwright test', relatedTo: [] },
      { id: 'e2e:result', at: at(8), kind: 'tool', outcome: 'failed', relatedTo: ['e2e'] },
      { id: 'validate', at: at(9), kind: 'tool', command: 'npm run validate', relatedTo: [] },
      { id: 'validate:result', at: at(9), kind: 'tool', outcome: 'passed', relatedTo: ['validate'] },
      { id: 'search', at: at(9), kind: 'tool', command: "git ls-files | rg 'playwright test|npm run build'", relatedTo: [] },
      { id: 'truncated', at: at(9), kind: 'tool', command: "git ls-files | grep -E '(vite|playwright|vitest|src/...", relatedTo: [] },
      { id: 'maven', at: at(9), kind: 'tool', command: 'backend/mvnw -q -f backend/pom.xml test > /tmp/junit.log 2>&1', relatedTo: [] },
      { id: 'final', at: at(10), kind: 'tool', command: 'npm --prefix app run build && (cd app && CI=1 npm run test:e2e)', relatedTo: [] },
      { id: 'final:result', at: at(10), kind: 'tool', outcome: 'failed', relatedTo: ['final'] }
    ],
    reviews: [
      { axis: 'plan', reviewerType: 'claude', status: 'passed', blocking: 0, evidencePaths: ['reviews/plan.md'] },
      { axis: 'final', reviewerType: 'claude', status: 'unknown', blocking: null, evidencePaths: [] },
      { axis: 'slice-1', reviewerType: 'codex', status: 'failed', blocking: 2, evidencePaths: ['reviews/slice-1.md'] },
      { axis: 'slice-2', reviewerType: 'codex', status: 'passed', blocking: 0, evidencePaths: [] }
    ],
    verification: [
      { name: 'Slice 1 TDD RED evidence', outcome: 'unknown', evidencePaths: ['evidence/s1-red.txt'] },
      { name: 'Slice 1 GREEN verification', outcome: 'passed', evidencePaths: ['evidence/s1-green.txt'] },
      { name: 'Slice 2 TDD RED evidence', outcome: 'unknown', evidencePaths: ['evidence/s2-red.txt'] },
      { name: 'G3 verification', outcome: 'unknown', evidencePaths: ['evidence/g3.txt'] }
    ]
  };

  const summary = summarizeActivity(run);
  assert.equal(summary.headline, '스킬 2종 · 리뷰 4건(차단 2) · 검증 6종 · 일반 도구 4건 생략');
  assert.deepEqual(summary.lanes.map(lane => [lane.id, lane.nodes.map(item => [item.title, item.count, item.outcome])]), [
    ['skill', [['brainstorming', 1, 'none'], ['test-driven-development', 2, 'none']]],
    ['review', [['계획 리뷰', 1, 'passed'], ['Slice 리뷰', 2, 'failed'], ['최종 리뷰', 1, 'unknown']]],
    ['verification', [
      ['TDD RED→GREEN', 2, 'unknown'],
      ['단위 테스트', 2, 'unknown'],
      ['API 테스트', 2, 'passed'],
      ['E2E 테스트', 2, 'failed'],
      ['빌드 · 검사', 2, 'failed'],
      ['G3 검증', 1, 'unknown']
    ]]
  ]);
  const nodes = new Map(summary.lanes.flatMap(lane => lane.nodes).map(item => [item.title, item]));
  assert.deepEqual(nodes.get('API 테스트').occurrences.map(item => [item.at, item.outcome, item.label]), [
    [at(6), 'passed', 'npm run test:api'],
    [at(3), 'failed', 'npm run test:api']
  ]);
  assert.equal(nodes.get('API 테스트').lastAt, at(6));
  assert.deepEqual(nodes.get('단위 테스트').occurrences.map(item => item.label), [
    'backend/mvnw -q -f backend/pom.xml test > /tmp/junit.log 2>&1',
    'node --test tests/a.test.mjs'
  ]);
  assert.equal(nodes.get('TDD RED→GREEN').detail, 'RED 2 · GREEN 1');
  assert.deepEqual(nodes.get('TDD RED→GREEN').evidencePaths, ['evidence/s1-red.txt', 'evidence/s1-green.txt', 'evidence/s2-red.txt']);
  assert.equal(nodes.get('Slice 리뷰').detail, '차단 지적 2건');
  assert.deepEqual(nodes.get('Slice 리뷰').evidencePaths, ['reviews/slice-1.md']);
  assert.deepEqual(summarizeActivity({}).lanes.map(lane => lane.nodes.length), [0, 0, 0]);
});

test('dashboard assets contain no external requests or inline executable scripts', async () => {
  const html = await readAsset('index.html');
  const app = await readAsset('app.js');
  const styles = await readAsset('styles.css');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.doesNotMatch(html, /\b(?:src|href)\s*=\s*["']https?:/i);
  assert.doesNotMatch(app, /fetch\(\s*["']https?:/i);
  assert.doesNotMatch(styles, /@import\s|url\(\s*["']?https?:/i);
  assert.match(html, /src="\/assets\/app\.js"/);
  assert.match(html, /href="\/assets\/styles\.css"/);
  assert.match(styles, /@media/);
});

test('dashboard command and privacy limits are documented in both READMEs', async () => {
  const [packageJson, korean, english] = await Promise.all([
    readRepositoryFile('package.json').then(JSON.parse),
    readRepositoryFile('README.md'),
    readRepositoryFile('README.en.md')
  ]);
  assert.equal(packageJson.scripts.dashboard, 'node scripts/dashboard.mjs');
  for (const [name, readme, requirements] of [
    ['README.md', korean, ['npm run dashboard', '로컬', '업로드되지', '연결되지 않은 세션', '승인하거나']],
    ['README.en.md', english, ['npm run dashboard', 'local', 'upload', 'unlinked sessions', 'cannot approve']]
  ]) {
    for (const requirement of requirements) {
      assert.ok(readme.toLowerCase().includes(requirement.toLowerCase()), `${name} is missing: ${requirement}`);
    }
  }
});
