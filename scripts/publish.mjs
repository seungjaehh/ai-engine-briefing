import { promises as fs } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, collect, readJson, atomicJson, assertPublic } from './collect.mjs';
import { withLock } from './lock.mjs';

const git = args => execFileSync('git',['-C',ROOT,...args],{encoding:'utf8',timeout:60000,windowsHide:true,stdio:['ignore','pipe','pipe']}).trim();
const allowed=new Set(['docs/data/briefing.json','content/progress.json']);
export function validateStaged(names) { if(names.some(name=>!allowed.has(name)))throw new Error('자동 게시 범위를 벗어난 파일이 staging 영역에 있습니다. 직접 검토 후 커밋하세요.'); }

export async function publish() {
  return withLock(ROOT,async()=>{
    const config=await readJson(path.join(ROOT,'.local/config.json'));
    if(!/^[\w.-]+\/[\w.-]+$/.test(config.repository))throw new Error('GitHub 저장소 이름이 잘못됐습니다.');
    if(git(['branch','--show-current'])!=='main')throw new Error('자동 게시는 main 브랜치에서만 실행합니다.');
    const origin=git(['remote','get-url','origin']);
    if(![`https://github.com/${config.repository}.git`,`https://github.com/${config.repository}`,`git@github.com:${config.repository}.git`].includes(origin))throw new Error('연결된 저장소가 설정과 다릅니다.');
    validateStaged(git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean));
    const result=await collect();
    assertPublic(result.data);
    git(['add','--','docs/data/briefing.json','content/progress.json']);
    const staged=git(['diff','--cached','--name-only','-z']).split('\0').filter(Boolean);
    validateStaged(staged);
    if(staged.length)git(['commit','-m',`briefing: update ${new Date().toISOString().slice(0,16)}`]);
    // Always retry pending commits after a network failure; never force-push.
    git(['push','origin','HEAD:refs/heads/main']);
    await atomicJson(path.join(ROOT,'.local/last-run.json'),{status:'success',checkedAt:new Date().toISOString(),lastSucceededAt:new Date().toISOString(),updated:result.updated});
    console.log(result.updated ? '브리핑 변경을 게시했습니다.' : '확인 완료: 새 변경이 없습니다.');
    return result;
  });
}
if(process.argv[1] && path.resolve(process.argv[1])===path.join(ROOT,'scripts/publish.mjs')) {
  publish().catch(async error=>{
    const previous=await readJson(path.join(ROOT,'.local/last-run.json'),{});
    await atomicJson(path.join(ROOT,'.local/last-run.json'),{status:'error',checkedAt:new Date().toISOString(),lastSucceededAt:previous.lastSucceededAt||null,error:error.message});
    const log=path.join(ROOT,'.local/publish.log');
    try {const stat=await fs.stat(log);if(stat.size>256*1024)await fs.rename(log,log+'.previous');}catch{}
    await fs.appendFile(log,`${new Date().toISOString()} ${error.message}\n`);
    console.error(error.message);process.exitCode=1;
  });
}
