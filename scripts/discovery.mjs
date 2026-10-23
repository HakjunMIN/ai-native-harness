const identifier = /^[A-Za-z][A-Za-z0-9]*(?:-[A-Za-z0-9]+)*$/;
const content = value => typeof value === 'string' && value.trim() !== '' && value.trim() !== '-';
const references = body => [...body.matchAll(/(?<![\w@])@([A-Za-z][A-Za-z0-9-]*)(?![A-Za-z0-9/-])/g)].map(match => match[1]);

function scan(body) {
  const lines = [], blocks = [];
  let fence;
  for (const text of body.split('\n')) {
    if (fence) {
      lines.push({text, language:fence.language, fenced:true});
      if (new RegExp(`^ {0,3}${fence.marker}{${fence.length},}\\s*$`).test(text)) {
        blocks.push(fence);
        fence = undefined;
      } else fence.body += `${text}\n`;
    } else {
      const start = text.match(/^ {0,3}(`{3,}|~{3,})([^ \t]*)[ \t]*$/);
      if (start) fence = {marker:start[1][0],length:start[1].length,language:start[2],body:''};
      lines.push({text, language:fence?.language, fenced:!!fence});
    }
  }
  return {lines, blocks, unclosed:!!fence};
}

function sections(body, level, errors) {
  const result = new Map();
  let current;
  for (const {text, fenced} of scan(body).lines) {
    const heading = !fenced && text.match(new RegExp(`^#{${level}} (.+?)\\s*$`));
    if (heading) {
      current = heading[1];
      if (result.has(current)) errors.push(`duplicate section ${current}`);
      else result.set(current, '');
    } else if (current) result.set(current, result.get(current) + text + '\n');
  }
  return result;
}

function cells(line) {
  const result = [];
  let cell = '';
  for (let i = 1; i < line.length - 1; i++) {
    if (line[i] === '\\' && ['|','\\'].includes(line[i + 1])) cell += line[++i];
    else if (line[i] === '|') { result.push(cell.trim()); cell = ''; }
    else cell += line[i];
  }
  return [...result, cell.trim()];
}

function table(body, columns, label, errors) {
  const lines = scan(body).lines.filter(line => !line.fenced && line.text.trim().startsWith('|')).map(line => line.text.trim());
  if (lines.length < 2 || lines.some(line => !line.endsWith('|'))) {
    errors.push(`${label}: Markdown table required`);
    return [];
  }
  const header = cells(lines[0]), divider = cells(lines[1]);
  if (header.join('|') !== columns.join('|') || divider.length !== columns.length ||
      divider.some(cell => !/^:?-{3,}:?$/.test(cell))) {
    errors.push(`${label}: expected columns ${columns.join(', ')}`);
    return [];
  }
  const records = [];
  for (const line of lines.slice(2)) {
    const values = cells(line);
    if (values.length !== columns.length) { errors.push(`${label}: invalid number of columns`); continue; }
    if (values.some(value => !value)) errors.push(`${label}: empty cell; use - for inapplicable values`);
    records.push(Object.fromEntries(columns.map((column, i) => [column, values[i]])));
  }
  return records;
}

export function inspectDiscovery(markdown, {approved = false, confirmations = []} = {}) {
  const body = markdown.replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
  const errors = [];
  if (body.includes('<!--')) errors.push('unclosed HTML comment');
  if (scan(body).unclosed) errors.push('unclosed Markdown fence');
  const document = sections(body, 2, errors);
  for (const heading of ['Approval summary','Acceptance criteria','Decisions','Risks']) {
    if (!document.has(heading)) errors.push(`${heading}: section required`);
  }
  const summary = document.get('Approval summary') ?? '';
  const review = sections(summary, 3, errors);
  for (const heading of ['Goal','Scope','Non-goals','Behavior','Review','Approval']) {
    if (!content(review.get(heading))) errors.push(`${heading}: content required in approval summary`);
  }
  if (/<(?:details|script|style)\b/i.test(summary)) errors.push('approval summary must not hide content in HTML');
  const diagrams = scan(review.get('Behavior') ?? '').blocks.filter(block => block.language === 'mermaid');
  if (!diagrams.length) errors.push('Mermaid behavior diagram required');
  for (const diagram of diagrams) {
    const visible = diagram.body.replace(/%%[^\n]*/g, '');
    if (!references(visible).length) errors.push('Mermaid diagram requires an @ID reference');
  }
  const criteria = table(document.get('Acceptance criteria') ?? '', ['ID','Criterion','Verification'], 'Acceptance criteria', errors);
  const decisions = table(document.get('Decisions') ?? '', ['ID','Timing','Impact','Status','Choice','Owner','Evidence'], 'Decisions', errors);
  const risks = table(document.get('Risks') ?? '', ['ID','Risk','Mitigation','Decision'], 'Risks', errors);
  const entries = table(review.get('Review') ?? '', ['ID','Status','Summary'], 'summary', errors);
  const records = new Map();
  const add = (row, status, required) => {
    if (!identifier.test(row.ID)) errors.push(`invalid record ID ${row.ID}`);
    if (records.has(row.ID)) errors.push(`duplicate record ID ${row.ID}`);
    records.set(row.ID, {status,required});
  };
  if (!criteria.length) errors.push('at least one acceptance criterion required');
  for (const row of criteria) {
    add(row, 'defined', true);
    if (/^[DR]-/.test(row.ID)) errors.push(`${row.ID}: AC IDs cannot use the decision/risk namespace`);
    if (!content(row.Criterion) || !content(row.Verification)) errors.push(`${row.ID}: criterion and verification required`);
  }
  for (const row of decisions) {
    add(row, row.Status, row.Timing !== 'record' || row.Status === 'deferred');
    if (!/^D-[1-9][0-9]*$/.test(row.ID)) errors.push(`${row.ID}: decision ID must be D-<positive integer>`);
    if (!['now','g1','record'].includes(row.Timing)) errors.push(`${row.ID}: invalid timing`);
    if (!['standard','high'].includes(row.Impact)) errors.push(`${row.ID}: invalid impact`);
    if (!['open','recommended','confirmed','assumed','deferred'].includes(row.Status)) errors.push(`${row.ID}: invalid status`);
    if (!content(row.Choice) || !content(row.Owner)) errors.push(`${row.ID}: choice and owner required`);
    if (['confirmed','assumed'].includes(row.Status) && !content(row.Evidence)) errors.push(`${row.ID}: decision evidence required`);
    if (row.Status === 'recommended' && row.Timing !== 'g1') errors.push(`${row.ID}: recommended choices require g1 timing`);
    if (row.Status === 'assumed' && row.Timing !== 'record') errors.push(`${row.ID}: assumed choices require record timing`);
    if (row.Timing === 'record' && row.Impact === 'high') errors.push(`${row.ID}: high impact cannot be record-only`);
    if (row.Timing === 'record' && row.Status === 'open') errors.push(`${row.ID}: record-only choice cannot be unresolved`);
    if (row.Status === 'deferred' && !references(review.get('Non-goals') ?? '').includes(row.ID)) {
      errors.push(`${row.ID}: deferred work must be excluded explicitly in Non-goals`);
    }
    if (approved && row.Status === 'open') errors.push(`${row.ID}: unresolved decision blocks G1`);
  }
  for (const row of risks) {
    add(row, 'noted', true);
    if (!/^R-[1-9][0-9]*$/.test(row.ID)) errors.push(`${row.ID}: risk ID must be R-<positive integer>`);
    if (!content(row.Risk) || !content(row.Mitigation)) errors.push(`${row.ID}: risk and mitigation required`);
    if (row.Decision !== '-' && !decisions.some(decision => decision.ID === row.Decision)) {
      errors.push(`${row.ID}: unknown risk decision ${row.Decision}`);
    }
  }
  const seen = new Set();
  for (const row of entries) {
    if (seen.has(row.ID)) errors.push(`duplicate summary ID ${row.ID}`);
    seen.add(row.ID);
    const record = records.get(row.ID);
    if (!record) errors.push(`summary: unknown ID ${row.ID}`);
    else if (record.status !== row.Status) errors.push(`summary status differs for ${row.ID}`);
    if (!content(row.Summary)) errors.push(`summary: text required for ${row.ID}`);
  }
  for (const [id, record] of records) {
    if (record.required && !seen.has(id)) errors.push(`summary: missing ${id}`);
  }
  for (const id of references(summary)) {
    if (!records.has(id)) errors.push(`summary: unknown reference ${id}`);
  }
  for (const row of criteria) {
    for (const id of references(`${row.Criterion} ${row.Verification}`)) {
      if (!records.has(id)) errors.push(`${row.ID}: unknown reference ${id}`);
      if (decisions.some(decision => decision.ID === id && decision.Status === 'deferred')) {
        errors.push(`${row.ID}: cannot depend on deferred decision ${id}`);
      }
    }
  }
  const confirmed = new Set();
  if (!Array.isArray(confirmations)) errors.push('individual confirmations must be an array');
  else for (const item of confirmations) {
    if (!item || !content(item.reference) || !decisions.some(row =>
      row.ID === item.id && row.Timing === 'g1' && row.Status === 'recommended')) {
      errors.push('invalid individual confirmation; reference an observed choice for a G1 recommendation');
      continue;
    }
    if (confirmed.has(item.id)) errors.push(`duplicate individual confirmation ${item.id}`);
    confirmed.add(item.id);
  }
  if (approved) {
    for (const row of decisions.filter(row => row.Status === 'recommended' && row.Impact === 'high')) {
      if (!confirmed.has(row.ID)) errors.push(`${row.ID}: individual confirmation required for high impact`);
    }
  }
  return {errors,summary:summary.trim(),decisions};
}

export function renderDiscovery(report, {textOnly = false, approved = false, root} = {}) {
  const summary = textOnly
    ? scan(report.summary).lines.filter(line => line.language !== 'mermaid').map(line => line.text).join('\n')
    : report.summary;
  const open = report.decisions.filter(row => row.Status === 'open').map(row => row.ID);
  const explicit = report.decisions.filter(row => row.Status === 'recommended' && row.Impact === 'high')
    .map(row => `${row.ID} (${row.Owner})`);
  const output = [
    ...(open.length ? [`미결정: ${open.join(', ')}`] : []),
    ...(explicit.length ? [`개별 확인 ${approved ? '완료' : '대상'}: ${explicit.join(', ')}`] : []),
    summary
  ].join('\n\n').replace(/\n{3,}/g, '\n\n');
  if (!root) return output;
  return output.replace(/(!?\[[^\]]*\])\((?:<([^>]+)>|([^\s)]+))\)/g, (link, label, quoted, plain) => {
    const target = quoted ?? plain;
    if (target.startsWith('#') || target.startsWith('//') || isAbsolute(target) || /^[a-z][a-z0-9+.-]*:/i.test(target)) return link;
    const hash = target.indexOf('#');
    const path = hash < 0 ? target : target.slice(0, hash);
    const anchor = hash < 0 ? '' : target.slice(hash);
    return `${label}(<${resolve(root, path)}${anchor}>)`;
  });
}
import { isAbsolute, resolve } from 'node:path';
