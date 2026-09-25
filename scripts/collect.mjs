import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { withLock } from './lock.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = value => createHash('sha256').update(value).digest('hex');
const catalog = [
  ['00-evidence-brief.md', '조사 종합'], ['01-relay-forensics.md', '기존 자동화 분석'],
  ['02-platform-audit.md', '플랫폼 구조 검토'], ['03-runtime-capabilities.md', '실행 환경 조사'],
  ['04-roblox-verification.md', '프로젝트 검증 조사'], ['05-agent-reliability-research.md', '에이전트 신뢰성 조사'],
  ['10-design-minimal-harness-native.md', '최소 엔진 설계안'], ['10-design-ops-and-risk.md', '운영과 위험 설계안'],
  ['10-design-oracle-first.md', '검증 중심 설계안'], ['10-design-product-outcome.md', '제품 결과 중심 설계안'],
  ['11-merged-architecture.md', '통합 아키텍처 설계안']
];
const ignored = new Set(['.git', '.local', '.env', 'node_modules', 'scratch', 'dist', 'build', 'coverage', '.venv', 'vendor', '.cache', 'projects']);
const codeExt = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.ps1', '.go', '.rs', '.cs', '.lua', '.luau']);

export async function readJson(file, fallback) {
  try { return JSON.parse((await fs.readFile(file, 'utf8')).replace(/^\uFEFF/, '')); }
  catch (error) { if (error.code === 'ENOENT' && fallback !== undefined) return fallback; throw error; }
}
export async function atomicJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + '\n');
  await fs.rename(tmp, file);
}
export function assertPublic(data) {
  const text = JSON.stringify(data);
  if (/(?:[A-Za-z]:\\\\|[A-Za-z]:\/|\/Users\/|\/home\/|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|sk-[A-Za-z0-9_-]{20,})/.test(text)) {
    throw new Error('공개 데이터에 로컬 절대 경로나 자격 증명 형태의 문자열이 있습니다.');
  }
}
export function validateProgress(progress) {
  if (!Array.isArray(progress.milestones) || progress.milestones.length !== 7) throw new Error('7개 단계가 필요합니다.');
  const ids = new Set();
  for (const item of progress.milestones) {
    if (!/^[a-z][a-z0-9-]*$/.test(item.id) || ids.has(item.id)) throw new Error('단계 ID가 잘못됐습니다.');
    ids.add(item.id);
    if (!['pending', 'active', 'done', 'blocked'].includes(item.status)) throw new Error('단계 상태가 잘못됐습니다.');
    if (!Array.isArray(item.evidence) || item.evidence.some(x => typeof x !== 'string' || !x.trim())) throw new Error('근거는 문자열 목록이어야 합니다.');
    if (item.status === 'done' && (!item.evidence.length || !Number.isFinite(Date.parse(item.completedAt)))) throw new Error('완료에는 근거와 완료 시각이 필요합니다.');
    if (typeof item.title !== 'string' || typeof item.description !== 'string' || typeof item.note !== 'string') throw new Error('단계 설명을 확인하세요.');
  }
  if (!Array.isArray(progress.updates) || !Array.isArray(progress.decisions)) throw new Error('기록 목록을 확인하세요.');
  assertPublic(progress);
}
export async function inventory(source) {
  const files = [];
  let count = 0;
  async function walk(dir, relative = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (++count > 30000) throw new Error('수집 범위가 너무 큽니다. 제외할 폴더를 설정하세요.');
      if (entry.isSymbolicLink() || ignored.has(entry.name) || entry.name.startsWith('.env')) continue;
      const rel = relative ? `${relative}/${entry.name}` : entry.name;
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(abs, rel); continue; }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (ext !== '.md' && !codeExt.has(ext)) continue;
      const stat = await fs.stat(abs);
      if (stat.size > 4 * 1024 * 1024) throw new Error('수집 대상 파일이 4MB를 초과했습니다.');
      const kind = rel.startsWith('research/') ? 'research' : /(^|\/)(__tests__|test|tests)(\/|$)|\.(test|spec)\./i.test(rel) ? 'test' : codeExt.has(ext) ? 'code' : 'document';
      files.push({ rel, kind, modifiedAt: stat.mtime.toISOString(), hash: sha(await fs.readFile(abs)) });
    }
  }
  await walk(source);
  return files.sort((a,b) => a.rel.localeCompare(b.rel));
}
function gitFacts(source) {
  const run = args => execFileSync('git', ['--no-optional-locks', '-C', source, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (path.resolve(run(['rev-parse', '--show-toplevel'])).toLowerCase() !== path.resolve(source).toLowerCase()) return { available: false };
    const head = run(['rev-parse', '--verify', 'HEAD']);
    const status = run(['status', '--porcelain=v1', '-z', '--untracked-files=normal']);
    return { available: true, commits: Number(run(['rev-list', '--count', 'HEAD'])), head: head.slice(0, 12), committedAt: run(['show', '-s', '--format=%cI', 'HEAD']), hasUncommittedChanges: Boolean(status) };
  } catch { return { available: false }; }
}
function workspaceFacts(workspace, root) {
  const label = String(workspace.label || '').trim();
  const id = String(workspace.id || '').trim();
  if (!/^[a-z0-9-]{1,40}$/.test(id) || !label || label.length > 60 || typeof workspace.path !== 'string' || !workspace.path.trim()) {
    throw new Error('로컬 설정의 workspaceRepos 항목을 확인하세요.');
  }
  const repoPath = path.resolve(root, workspace.path);
  const execute = args => execFileSync('git', ['--no-optional-locks', '-C', repoPath, ...args], { encoding: 'utf8', timeout: 15000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  const run = args => execute(args).trim();
  try {
    const top = path.resolve(run(['rev-parse', '--show-toplevel']));
    if (top.toLowerCase() !== path.resolve(repoPath).toLowerCase()) return { id, label, available: false };
    const branch = run(['branch', '--show-current']) || '(detached)';
    const status = execute(['status', '--porcelain=v1', '--untracked-files=all']).trimEnd();
    const rows = status ? status.split(/\r?\n/).filter(Boolean) : [];
    const counts = { staged: 0, unstaged: 0, modified: 0, added: 0, deleted: 0, untracked: 0 };
    for (const row of rows) {
      const x = row[0], y = row[1];
      if (x !== ' ' && x !== '?') counts.staged++;
      if (y !== ' ' && y !== '?') counts.unstaged++;
      if (x === '?' && y === '?') counts.untracked++;
      else if (x === 'A' || y === 'A') counts.added++;
      else if (x === 'D' || y === 'D') counts.deleted++;
      else if (x === 'M' || y === 'M' || x === 'T' || y === 'T' || x === 'U' || y === 'U') counts.modified++;
    }
    let ahead = null, behind = null;
    try {
      const [a, b] = run(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).split(/\s+/).map(Number);
      if (Number.isFinite(a) && Number.isFinite(b)) { ahead = a; behind = b; }
    } catch {
      if (branch !== 'main' && branch !== '(detached)') {
        try {
          const [baseOnly, branchOnly] = run(['rev-list', '--left-right', '--count', 'main...HEAD']).split(/\s+/).map(Number);
          if (Number.isFinite(baseOnly) && Number.isFinite(branchOnly)) { ahead = branchOnly; behind = baseOnly; }
        } catch {}
      }
    }
    return { id, label, available: true, branch, changedFiles: rows.length, ...counts, ahead, behind };
  } catch { return { id, label, available: false }; }
}
export async function collect(root = ROOT, now = new Date()) {
  const config = await readJson(path.join(root, '.local/config.json'));
  const source = await fs.realpath(path.resolve(root, config.sourcePath));
  const realRoot = await fs.realpath(root);
  if (source === realRoot || realRoot.startsWith(source + path.sep) || source.startsWith(realRoot + path.sep)) throw new Error('엔진과 브리핑 프로젝트는 서로의 하위 폴더일 수 없습니다.');
  const progress = await readJson(path.join(root, 'content/progress.json'));
  validateProgress(progress);
  const files = await inventory(source);
  const previous = await readJson(path.join(root, '.local/inventory.json'), { files: [] });
  const old = new Map(previous.files.map(f => [f.rel, f]));
  const current = new Map(files.map(f => [f.rel, f]));
  const changed = files.filter(f => old.get(f.rel)?.hash !== f.hash);
  const removed = previous.files.filter(f => !current.has(f.rel));
  const documents = catalog.flatMap(([name, label]) => {
    const f = current.get(`research/${name}`);
    return f ? [{ id: name.replace('.md',''), label, modifiedAt: f.modifiedAt, kind: name.startsWith('10-') ? 'design' : name.startsWith('11-') ? 'merged' : 'research' }] : [];
  });
  const stats = { researchDocuments: files.filter(f => f.kind === 'research' && f.rel.endsWith('.md')).length, implementationFiles: files.filter(f => f.kind === 'code').length, testFiles: files.filter(f => f.kind === 'test').length };
  const git = gitFacts(source);
  const configuredWorkspaces = config.workspaceRepos || [];
  if (!Array.isArray(configuredWorkspaces) || configuredWorkspaces.length > 20) throw new Error('workspaceRepos는 최대 20개 저장소 목록이어야 합니다.');
  const workspaceIds = new Set();
  const workspaces = configuredWorkspaces.map(item => {
    const result = workspaceFacts(item, root);
    if (workspaceIds.has(result.id)) throw new Error('workspaceRepos ID가 중복됐습니다.');
    workspaceIds.add(result.id);
    return result;
  });
  const done = progress.milestones.filter(m => m.status === 'done').length;
  const active = progress.milestones.find(m => m.status === 'active');
  const blocked = progress.milestones.filter(m => m.status === 'blocked');
  const next = active || progress.milestones.find(m => m.status !== 'done');
  const merged = documents.some(d => d.kind === 'merged');
  const stage = done === 7 ? 'MVP 검증 완료' : active ? active.title : blocked.length ? '확인 후 진행 대기' : stats.implementationFiles ? '구현 파일 확인 · 완료 검증 대기' : merged ? '통합 설계안 작성 · 구현 대기' : '조사와 설계 진행';
  const summary = done === 7 ? '7개 단계에 완료 근거가 등록됐습니다.' : active ? `${active.title} 단계를 진행 중입니다. ${active.note}` : blocked.length ? `${blocked[0].title}: ${blocked[0].note}` : stats.implementationFiles ? '엔진 코드가 확인됐습니다. 단계별 완료 여부는 등록된 근거를 기준으로 표시합니다.' : merged ? '조사와 설계안을 모아 통합 아키텍처를 작성했습니다. 엔진 구현 파일은 아직 확인되지 않았습니다.' : '조사 자료를 모으고 있습니다. 구현 상태와 완료 근거를 함께 기록합니다.';
  const publicPath = path.join(root, 'docs/data/briefing.json');
  const prior = await readJson(publicPath, null);
  let activity = prior?.activity || [];
  const eventTime = now.toISOString();
  if (!prior) activity = [{ id: sha('initial' + eventTime).slice(0,16), at: eventTime, type: 'baseline', title: '첫 브리핑 작성', detail: `조사·설계 문서 ${stats.researchDocuments}개와 구현 파일 ${stats.implementationFiles}개를 확인했습니다.` }];
  else if (changed.length || removed.length) {
    const labels = catalog.filter(([name]) => changed.some(f => f.rel === `research/${name}`)).map(([, label]) => label);
    const detail = labels.length ? `${labels.slice(0,3).join(', ')}${labels.length > 3 ? ` 외 ${labels.length-3}개` : ''} 변경을 확인했습니다.` : `수집 대상 ${changed.length}개 변경, ${removed.length}개 삭제를 확인했습니다. 원문 내용은 게시하지 않습니다.`;
    activity.unshift({ id: sha(eventTime + detail).slice(0,16), at: eventTime, type: 'source', title: '엔진 작업 자료 변경', detail });
  }
  if (prior?.git?.head && git.head && prior.git.head !== git.head) activity.unshift({ id: sha(eventTime + git.head).slice(0,16), at: eventTime, type: 'commit', title: '엔진 커밋 변경', detail: `현재 커밋 ${git.head}. 완료 단계와는 별도로 기록합니다.` });
  if (prior && JSON.stringify(prior.workspaces || []) !== JSON.stringify(workspaces)) {
    const detail = workspaces.map(w => w.available ? `${w.label} ${w.changedFiles}개 변경 · 미푸시 ${w.ahead ?? '확인 불가'}` : `${w.label} 저장소 확인 불가`).join(', ');
    activity.unshift({ id: sha(eventTime + detail).slice(0,16), at: eventTime, type: 'workspace', title: '코드 작업 폴더 상태 변경', detail: detail || '등록된 코드 작업 폴더가 없습니다.' });
  }
  const existing = new Set(activity.map(x => x.id));
  for (const update of progress.updates) if (!existing.has(update.id)) activity.push(update);
  activity = activity.sort((a,b) => b.at.localeCompare(a.at)).slice(0,80);
  const content = { schemaVersion: 1, project: progress.project, intro: progress.intro, stage, summary, stats, git, workspaces, documents, milestones: progress.milestones, decisions: progress.decisions, activity, next: next ? { id: next.id, title: next.title, description: next.note || next.description } : null, blocked: blocked.map(m => ({ title:m.title, note:m.note })), sourceChangedAt: files.map(f => f.modifiedAt).sort().at(-1) || null, collection: { intervalMinutes: config.intervalMinutes || 30, heartbeatHours: config.heartbeatHours || 6, sourceAvailable: true }, repository: config.repository };
  const fingerprint = sha(JSON.stringify(content));
  const heartbeatDue = !prior || now - new Date(prior.observedAt) >= (config.heartbeatHours || 6) * 3600000;
  const contentChanged = fingerprint !== previous.fingerprint;
  const data = { ...content, observedAt: contentChanged || heartbeatDue ? eventTime : prior.observedAt, changedAt: contentChanged ? eventTime : prior.changedAt };
  assertPublic(data);
  const updated = contentChanged || heartbeatDue;
  if (updated) await atomicJson(publicPath, data);
  await atomicJson(path.join(root, '.local/inventory.json'), { fingerprint, files, checkedAt: eventTime });
  return { updated, data };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  withLock(ROOT, () => collect()).then(r => console.log(r.updated ? '브리핑 데이터를 갱신했습니다.' : '새 변경이 없습니다.')).catch(e => { console.error(e.message); process.exitCode = 1; });
}
