import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { ROOT, readJson, atomicJson, validateProgress, collect } from './collect.mjs';
import { withLock } from './lock.mjs';

const [id,status,...args]=process.argv.slice(2);
const usage='사용법: node scripts/progress.mjs policy active --note "공개할 작업 설명" [--evidence "검증 결과 또는 커밋"]';
try {
  if(!id || !status)throw new Error(usage);
  const notes=[];const evidence=[];
  for(let i=0;i<args.length;i+=2){if(!args[i+1])throw new Error(usage);if(args[i]==='--note')notes.push(args[i+1]);else if(args[i]==='--evidence')evidence.push(args[i+1]);else throw new Error(usage);}
  await withLock(ROOT,async()=>{
    const file=path.join(ROOT,'content/progress.json');
    const progress=await readJson(file);
    const item=progress.milestones.find(x=>x.id===id);
    if(!item)throw new Error(`단계 ID: ${progress.milestones.map(x=>x.id).join(', ')}`);
    if(!['pending','active','done','blocked'].includes(status))throw new Error('상태: pending, active, done, blocked');
    if(status==='done'&&!evidence.length)throw new Error('완료 처리에는 이번 변경의 --evidence가 필요합니다.');
    if(!notes.length)throw new Error('공개할 변경 요약 --note가 필요합니다.');
    item.status=status;item.note=notes.join(' ');item.evidence=[...new Set([...item.evidence,...evidence])];
    if(status==='done')item.completedAt=new Date().toISOString();else delete item.completedAt;
    const labels={pending:'대기',active:'진행 중',done:'완료',blocked:'확인 필요'};
    progress.updates.unshift({id:randomUUID(),at:new Date().toISOString(),type:'milestone',title:`${item.title} · ${labels[status]}`,detail:item.note});
    progress.updates=progress.updates.slice(0,80);
    validateProgress(progress);
    await atomicJson(file,progress);await collect();
    console.log('상태와 브리핑을 갱신했습니다. 다음 자동 게시 때 반영됩니다. 바로 게시: npm run publish');
  });
}catch(e){console.error(e.message);process.exitCode=1;}
