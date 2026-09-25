const $ = id => document.getElementById(id);
const labels = { pending: '대기', active: '진행 중', done: '완료', blocked: '확인 필요' };
let data, visible = 6;
const date = (value, short = false) => value ? new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month:'2-digit', day:'2-digit', ...(short ? {} : {hour:'2-digit',minute:'2-digit',hour12:false}) }).format(new Date(value)) : '기록 없음';
function el(tag, className, text) { const node=document.createElement(tag); if(className) node.className=className; if(text!==undefined) node.textContent=text; return node; }
function text(id,value) { $(id).textContent=value; }
function renderActivity() {
  $('activity').replaceChildren(...data.activity.slice(0,visible).map(item=>{const li=el('li');const time=el('time','',date(item.at));time.dateTime=item.at;li.append(time,el('h3','',item.title),el('p','',item.detail));return li;}));
  $('more').hidden=visible>=data.activity.length;
  text('activity-count',`${data.activity.length}개 기록`);
}
function renderWorkspaces() {
  const items=data.workspaces||[];
  text('workspace-count',`${items.length}개 저장소`);
  $('workspaces').replaceChildren(...items.map(item=>{
    const card=el('article','workspace-card');
    const heading=el('div','workspace-heading');
    heading.append(el('h3','',item.label),el('span',`workspace-state ${item.available?(item.changedFiles?'changed':'clean'):'unavailable'}`,!item.available?'연결 안 됨':item.changedFiles?'수정 중':'깨끗함'));
    card.append(heading);
    if(item.available){
      card.append(el('p','workspace-branch',item.branch));
      const stats=el('div','workspace-stats');
      stats.append(el('span','',`변경 파일 ${item.changedFiles}개`),el('span','',`추가 ${item.added} · 수정 ${item.modified} · 삭제 ${item.deleted} · 미추적 ${item.untracked}`),el('span','',`스테이징 ${item.staged} · 미스테이징 ${item.unstaged}`));
      const remote=[];
      if(item.ahead!==null)remote.push(`미푸시 ${item.ahead}`);
      if(item.behind!==null)remote.push(`미반영 ${item.behind}`);
      if(remote.length)stats.append(el('span','',remote.join(' · ')));
      card.append(stats);
    } else card.append(el('p','workspace-branch','로컬 저장소를 읽지 못했습니다.'));
    return card;
  }));
  if(!items.length)$('workspaces').append(el('p','empty-state','추적할 코드 저장소가 등록되지 않았습니다.'));
}
function render(next) {
  data=next;
  const done=data.milestones.filter(m=>m.status==='done').length;
  text('stage',data.stage); text('summary',data.summary); text('done-count',done);
  text('completion-note',done ? `완료 근거 ${done}개 단계에 등록` : '완료로 등록된 구현 단계 없음');
  $('meter-fill').style.width=`${done/7*100}%`;
  $('meter-fill').parentElement.setAttribute('aria-valuenow',String(done));
  text('baseline-label',`자료 변경 ${date(data.sourceChangedAt)}`);
  text('doc-count',data.stats.researchDocuments);text('code-count',data.stats.implementationFiles);text('test-count',data.stats.testFiles);
  text('git-count',data.git.available ? `${data.git.commits}개` : '미등록');text('git-note',data.git.available ? `최근 ${data.git.head}${data.git.hasUncommittedChanges ? ' · 미커밋 변경 있음' : ''}` : '엔진 폴더 기준 · 브리핑 저장소 제외');
  $('milestones').replaceChildren(...data.milestones.map((item,i)=>{const row=el('article',`milestone ${item.status}`);row.append(el('span','step-number',item.status==='done'?'✓':String(i+1).padStart(2,'0')));const title=el('div','step-title');title.append(el('h3','',item.title),el('span',`status ${item.status}`,labels[item.status]));row.append(title,el('p','step-description',item.description));if(item.evidence.length){const details=el('details');details.append(el('summary','',`완료·진행 근거 ${item.evidence.length}개`));const list=el('ul');list.append(...item.evidence.map(e=>el('li','',e)));details.append(list);row.append(details);}if(item.status==='blocked'&&item.note)row.append(el('p','step-description',item.note));return row;}));
  text('next-title',data.next?.title || '7개 단계 완료');text('next-description',data.next?.description || '등록된 완료 근거와 안정성 관찰 결과를 확인하세요.');
  $('blockers').replaceChildren(...(data.blocked.length ? data.blocked.map(item=>{const n=el('div','decision');n.append(el('h3','',item.title),el('p','',item.note));return n;}) : [el('p','empty-state',done ? '등록된 차단 사유가 없습니다.' : '등록된 차단 사유가 없습니다. 완료 근거가 등록되면 단계별로 표시됩니다.')]));
  $('decisions').replaceChildren(...data.decisions.map(item=>{const n=el('div','decision');n.append(el('span','tag',item.status),el('h3','',item.title),el('p','',item.detail));return n;}));
  $('documents').replaceChildren(...[...data.documents].reverse().map(item=>{const row=el('div',`doc ${item.kind}`);const time=el('time','',date(item.modifiedAt,true));time.dateTime=item.modifiedAt;row.append(el('span','',item.label),time);return row;}));
  if(!data.documents.length)$('documents').append(el('p','empty-state','등록된 설계 자료가 없습니다.'));
  text('sync-label',`최근 수집 ${date(data.observedAt)} KST`);
  renderWorkspaces();
  text('schedule-note',`PC 실행 중 ${data.collection.intervalMinutes}분마다 확인\n변경 시 게시 · 수집 상태는 최대 ${data.collection.heartbeatHours}시간마다 반영`);$('schedule-note').style.whiteSpace='pre-line';
  if(/^[\w.-]+\/[\w.-]+$/.test(data.repository))$('repo-link').href=`https://github.com/${data.repository}`;
  const age=(Date.now()-new Date(data.observedAt))/3600000;
  $('notice').hidden=age<data.collection.heartbeatHours+2;
  if(!$('notice').hidden)text('notice','최근 수집 기록이 오래됐습니다. PC 전원, 자동 수집 작업 또는 GitHub 연결 상태를 확인하세요. 아래는 마지막으로 게시된 기록입니다.');
  renderActivity();$('dashboard').hidden=false;$('loading').hidden=true;
}
async function load() {
  $('refresh').disabled=true;
  try { const response=await fetch(`data/briefing.json?t=${Date.now()}`,{cache:'no-store'});if(!response.ok)throw new Error('fetch');const next=await response.json();if(next.schemaVersion!==1)throw new Error('schema');render(next); }
  catch { $('loading').hidden=true;$('notice').hidden=false;text('notice',data ? '최신 자료를 불러오지 못했습니다. 마지막으로 확인한 기록을 표시합니다.' : '브리핑 자료를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.'); }
  finally { $('refresh').disabled=false; }
}
$('refresh').addEventListener('click',load);$('more').addEventListener('click',()=>{visible+=10;renderActivity();});
load();setInterval(()=>{if(!document.hidden)load();},300000);
