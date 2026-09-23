import { promises as fs } from 'node:fs';
import path from 'node:path';
export async function withLock(root, fn) {
  const file=path.join(root,'.local/run.lock');
  await fs.mkdir(path.dirname(file),{recursive:true});
  let handle;
  try { handle=await fs.open(file,'wx'); }
  catch(error) {
    if(error.code!=='EEXIST')throw error;
    const prior=JSON.parse(await fs.readFile(file,'utf8'));
    let alive=true;
    try {process.kill(prior.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    if(alive || Date.now()-Date.parse(prior.at)<15*60000)throw new Error('다른 브리핑 작업이 실행 중입니다.');
    await fs.unlink(file);
    handle=await fs.open(file,'wx');
  }
  try { await handle.writeFile(JSON.stringify({pid:process.pid,at:new Date().toISOString()}));return await fn(); }
  finally {await handle.close();await fs.unlink(file);}
}
