import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, collect, atomicJson, readJson, assertPublic, validateProgress } from '../scripts/collect.mjs';
import { validateStaged } from '../scripts/publish.mjs';
import { withLock } from '../scripts/lock.mjs';

async function fixture(t) {
  const parent=path.join(ROOT,'.local');await fs.mkdir(parent,{recursive:true});
  const dir=await fs.mkdtemp(path.join(parent,'test-'));
  t.after(async()=>{const resolved=path.resolve(dir);assert.ok(resolved.startsWith(path.resolve(parent)+path.sep+'test-'));await fs.rm(resolved,{recursive:true,force:true});});
  const root=path.join(dir,'report'),source=path.join(dir,'engine');
  await fs.mkdir(path.join(source,'research/scratch'),{recursive:true});
  await fs.mkdir(path.join(root,'content'),{recursive:true});
  await fs.writeFile(path.join(source,'research/11-merged-architecture.md'),'# PRIVATE source body — never publish this sentence\n- [x] fake done');
  await fs.writeFile(path.join(source,'research/scratch/demo.js'),'ignored');
  const progress=await readJson(path.join(ROOT,'content/progress.json'));
  progress.milestones.forEach(m=>{m.status='pending';m.evidence=[];delete m.completedAt;});progress.updates=[];
  await atomicJson(path.join(root,'content/progress.json'),progress);
  await atomicJson(path.join(root,'.local/config.json'),{sourcePath:source,repository:'example/ai-engine-briefing',intervalMinutes:30,heartbeatHours:6});
  return {root,source,dir,progress};
}

test('수집은 원문을 보존하고 공개 데이터에는 요약된 관측만 포함한다',async t=>{
  const {root,source}=await fixture(t);
  const file=path.join(source,'research/11-merged-architecture.md');const original=await fs.readFile(file);const before=await fs.stat(file);
  const {data}=await collect(root,new Date('2026-09-23T12:00:00Z'));
  assert.equal(data.stats.researchDocuments,1);assert.equal(data.stats.implementationFiles,0);assert.equal(data.git.available,false);
  assert.equal(data.milestones.filter(m=>m.status==='done').length,0);
  assert.ok(!JSON.stringify(data).includes('PRIVATE'));assert.ok(!JSON.stringify(data).includes(source));assert.ok(!JSON.stringify(data).includes('fake done'));
  assert.deepEqual(await fs.readFile(file),original);assert.equal((await fs.stat(file)).mtimeMs,before.mtimeMs);
});

test('변경 없는 반복은 재게시하지 않고 6시간 후 heartbeat만 갱신한다',async t=>{
  const {root}=await fixture(t);const first=await collect(root,new Date('2026-09-23T12:00:00Z'));
  const second=await collect(root,new Date('2026-09-23T12:30:00Z'));
  assert.equal(second.updated,false);assert.equal(second.data.observedAt,first.data.observedAt);
  const heartbeat=await collect(root,new Date('2026-09-23T18:01:00Z'));
  assert.equal(heartbeat.updated,true);assert.equal(heartbeat.data.changedAt,first.data.changedAt);assert.equal(heartbeat.data.activity.length,1);
});

test('코드 변경은 기록되지만 단계를 자동 완료하지 않는다',async t=>{
  const {root,source}=await fixture(t);await collect(root);
  await fs.mkdir(path.join(source,'src'));await fs.mkdir(path.join(source,'test'));
  await fs.writeFile(path.join(source,'src/main.mjs'),'export const answer=42;');
  await fs.writeFile(path.join(source,'test/main.test.mjs'),'// a test file, not a passing result');
  const changed=await collect(root);assert.equal(changed.data.stats.implementationFiles,1);assert.equal(changed.data.stats.testFiles,1);
  assert.equal(changed.data.activity[0].type,'source');assert.equal(changed.data.milestones[0].status,'pending');
  await fs.unlink(path.join(source,'src/main.mjs'));const removed=await collect(root);assert.match(removed.data.activity[0].detail,/1개 삭제/);
});

test('완료에는 명시적 근거가 필요하고 CLI 기록이 다음 작업을 바꾼다',async t=>{
  const {root,progress}=await fixture(t);progress.milestones[0].status='done';
  assert.throws(()=>validateProgress(progress),/근거/);
  progress.milestones[0].evidence=['fixture validation passed'];progress.milestones[0].completedAt=new Date().toISOString();
  await atomicJson(path.join(root,'content/progress.json'),progress);
  const result=await collect(root);assert.equal(result.data.next.id,'ledger');
  progress.milestones[1].status='blocked';progress.milestones[1].note='결정 필요';
  await atomicJson(path.join(root,'content/progress.json'),progress);assert.equal((await collect(root)).data.stage,'확인 후 진행 대기');
});

test('없는 원본은 마지막 정상 공개 데이터를 지우지 않는다',async t=>{
  const {root}=await fixture(t);await collect(root);const previous=await fs.readFile(path.join(root,'docs/data/briefing.json'));
  await atomicJson(path.join(root,'.local/config.json'),{sourcePath:'missing',repository:'example/ai-engine-briefing'});
  await assert.rejects(()=>collect(root));assert.deepEqual(await fs.readFile(path.join(root,'docs/data/briefing.json')),previous);
});

test('알려진 자격 증명과 개인 경로 및 무관한 staging 파일을 차단한다',()=>{
  assert.throws(()=>assertPublic({note:'C:\\Users\\private\\secret.txt'}));
  assert.throws(()=>assertPublic({note:'C:/Users/private/secret.txt'}));
  assert.throws(()=>assertPublic({note:'ghp_'+'A'.repeat(36)}));
  assert.throws(()=>validateStaged(['.local/config.json']));assert.throws(()=>validateStaged(['docs/assets/app.js']));
  assert.doesNotThrow(()=>validateStaged(['docs/data/briefing.json','content/progress.json']));
});

test('동시에 두 수집기가 같은 기록을 쓰지 않는다',async t=>{
  const {root}=await fixture(t);let release,entered;
  const gate=new Promise(r=>{release=r;});const ready=new Promise(r=>{entered=r;});
  const first=withLock(root,async()=>{entered();await gate;});await ready;
  await assert.rejects(()=>withLock(root,async()=>{}),/실행 중/);release();await first;
  await withLock(root,async()=>{});
});

test('엔진과 브리핑의 포함 관계를 거부한다',async t=>{
  const {root}=await fixture(t);await atomicJson(path.join(root,'.local/config.json'),{sourcePath:root,repository:'example/report'});
  await assert.rejects(()=>collect(root),/하위 폴더/);
});

test('다른 폴더로 향하는 링크는 원본 수집에 포함하지 않는다',async t=>{
  const {root,source,dir}=await fixture(t);const outside=path.join(dir,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.js'),'private');
  try{await fs.symlink(outside,path.join(source,'linked'),process.platform==='win32'?'junction':'dir');}catch(e){if(e.code==='EPERM')return t.skip('환경에서 symlink 생성을 허용하지 않습니다.');throw e;}
  assert.equal((await collect(root)).data.stats.implementationFiles,0);
});

test('Git 기록은 엔진 저장소에만 해당하고 커밋 원문을 게시하지 않는다',async t=>{
  const {root,source}=await fixture(t);
  const git=args=>execFileSync('git',['-C',source,...args],{stdio:'pipe',windowsHide:true});
  git(['init']);git(['config','user.name','Fixture']);git(['config','user.email','fixture@example.invalid']);git(['add','.']);git(['commit','-m','PRIVATE customer detail']);
  const {data}=await collect(root);assert.equal(data.git.available,true);assert.equal(data.git.commits,1);assert.ok(!JSON.stringify(data).includes('customer detail'));
});
