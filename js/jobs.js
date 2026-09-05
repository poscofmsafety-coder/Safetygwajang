(function(){
  'use strict';
  const grid=document.getElementById('jobs-grid');
  const updated=document.getElementById('jobs-updated');
  const refresh=document.getElementById('jobs-refresh');
  if(!grid)return;
  const CACHE_KEY='sgw_safety_jobs_v4', CACHE_MS=10*60*1000;
  let followUpChecks=0;
  const FALLBACK=[
    {company:'현대자동차',position:'현대자동차 9월 신입 채용 (안전관리·전주공장)',category:'안전관리',career:'신입',location:'전북 완주군',deadline:'2026-09-14',registered:'2026-09-01',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54825196&t_category=top1000&t_content=generic&tab=introduce',expiresAt:'2026-09-14T17:00:00+09:00',curated:true},
    {company:'두산에너빌리티',position:'2026 두산그룹 신입사원 채용 - EHS/안전관리',category:'EHS·안전관리',career:'신입',location:'경기 성남 · 경남 창원',deadline:'2026-09-21',registered:'2026-09-01',provider:'잡코리아',link:'https://www.jobkorea.co.kr/Recruit/GI_Read/49909743?Oem_Code=C1&PageGbn=ST',expiresAt:'2026-09-21T18:00:00+09:00',curated:true},
    {company:'HD현대삼호',position:'26년 하반기 신입사원 채용 (안전관리)',category:'안전관리',career:'신입',location:'전남 영암군',deadline:'2026-09-27',registered:'2026-09-01',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54914131',expiresAt:'2026-09-27T23:59:00+09:00',curated:true},
    {company:'현대자동차',position:'현대자동차 9월 신입 채용 (안전/환경·울산공장)',category:'안전·환경',career:'신입',location:'울산',deadline:'2026-09-14',registered:'2026-09-01',provider:'사람인',link:'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=54824973',expiresAt:'2026-09-14T17:00:00+09:00',curated:true},
    {company:'GS칼텍스',position:'2026년 하반기 신입사원 채용(안전)',category:'안전',career:'신입',location:'전남 여수시',deadline:'2026-09-15',registered:'2026-09-02',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54927251',expiresAt:'2026-09-15T23:59:00+09:00',curated:true},
    {company:'계룡건설산업',position:'2026년 9월 안전직, 보건관리자 모집공고',category:'안전·보건',career:'신입·경력',location:'대전 외 전국 현장',deadline:'2026-09-10',registered:'2026-09-03',provider:'인크루트',link:'https://lab.incruit.com/jobs/2609030004669',expiresAt:'2026-09-10T23:59:00+09:00',curated:true},
    {company:'두산퓨얼셀',position:'기술 계약직 채용_안전/환경(군산)',category:'안전·환경',career:'신입·경력',location:'전북 군산시',deadline:'2026-09-10',registered:'2026-09-02',provider:'인크루트',link:'https://lab.incruit.com/jobs/2609020000032',expiresAt:'2026-09-10T23:59:00+09:00',curated:true}
  ];
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function fingerprint(x){return [clean(x.company).replace(/\(주\)|㈜|주식회사/g,''),clean(x.position).replace(/안전관리자/g,'안전관리'),clean(x.location)].join('|').toLowerCase().replace(/[^0-9a-z가-힣|]/g,'')}
  function dedupe(items){const seen=new Set(),out=[];for(const x of items||[]){const k=fingerprint(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x)}return out}
  function activeFallback(){const now=Date.now();return FALLBACK.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>=now)}
  function mergedItems(data){return dedupe([...(data?.items||[]),...activeFallback()]).slice(0,16)}
  function deadline(v){
    const raw=clean(v);if(!raw)return '';
    const s=raw.replace(/\s+/g,' ').trim();
    if(/채용시/.test(s))return '~ 채용시';
    if(/상시/.test(s))return '~ 상시';
    const dayNames='일월화수목금토';
    const label=(y,m,d)=>{const yy=Number(y),mm=Number(m),dd=Number(d);if(!mm||!dd||mm>12||dd>31)return '';const dt=new Date(yy,mm-1,dd);if(dt.getFullYear()!==yy||dt.getMonth()!==mm-1||dt.getDate()!==dd)return '';return `~ ${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}(${dayNames[dt.getDay()]})`};
    let m=s.match(/D\s*-\s*(\d+)/i);if(m){const dt=new Date();dt.setHours(12,0,0,0);dt.setDate(dt.getDate()+Number(m[1]));return label(dt.getFullYear(),dt.getMonth()+1,dt.getDate())}
    m=s.match(/(20\d{2})\s*(?:[-./]|년\s*)(\d{1,2})\s*(?:[-./]|월\s*)(\d{1,2})/);if(m)return label(m[1],m[2],m[3])||('~ '+s.replace(/^~\s*/,'').replace(/\s*마감.*$/,''));
    m=s.match(/(?:^|[^\d])(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:[^\d]|$)/);if(m)return label(2000+Number(m[1]),m[2],m[3])||('~ '+s.replace(/^~\s*/,'').replace(/\s*마감.*$/,''));
    m=s.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})(?:\s*\([일월화수목금토]\))?/);if(m){let y=new Date().getFullYear();let out=label(y,m[1],m[2]);if(out)return out}
    return '~ '+s.replace(/^~\s*/,'').replace(/\s*마감(?:예정)?\s*$/,'').trim();
  }
  function cacheGet(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&x.savedAt?x:null}catch(e){return null}}
  function cacheSet(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
  function render(data,stale=false,label=''){
    const items=mergedItems(data);if(!items.length)return false;
    grid.innerHTML=items.map(x=>{
      const meta=[clean(x.category),clean(x.career),clean(x.location),deadline(x.deadline),clean(x.registered)].filter(Boolean);
      return `<a class="job-card-main" href="${esc(x.link||x.detailUrl||'#')}" target="_blank" rel="noopener noreferrer"><div class="job-card-head-main"><span class="job-provider-main">${esc(clean(x.provider)||'채용정보')}</span>${x.category?`<span class="job-category-main">${esc(x.category)}</span>`:''}<span class="job-link-main">공고 보기 ↗</span></div><h3><strong>${esc(x.company)}</strong><span>에서</span> ${esc(x.position)} 채용을 진행합니다.</h3><p>${meta.map(v=>`<span>${esc(v)}</span>`).join('')}</p></a>`;
    }).join('');
    if(updated){
      const when=data?.updatedAt?new Date(data.updatedAt):new Date();
      updated.textContent=(label||((stale?'저장된 공고 · ':'최신 공고 · ')+when.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})))+` · ${items.length}건`;
    }
    return true;
  }
  async function load(force=false){
    const cached=cacheGet();
    let shown=cached?render(cached.data,Date.now()-cached.savedAt>=CACHE_MS):false;
    if(!shown)shown=render({items:activeFallback(),updatedAt:new Date().toISOString()},true,'최근 확인 공고 · 최신 목록 갱신 중');
    if(refresh)refresh.disabled=true;
    try{
      const endpoint=force?('/api/jobs?refresh=1&t='+Date.now()):'/api/jobs';
      const r=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}});const text=await r.text();let j;try{j=JSON.parse(text)}catch(_){throw new Error('공고 응답 해석 실패')}
      if(!r.ok||!j.items?.length)throw new Error(j.error||'jobs unavailable');
      cacheSet(j);render(j,false,['seed','curated'].includes(j.source)?'최근 확인 공고 · 실시간 수집 재시도 중':'');
      if(j.refreshing&&followUpChecks<4){followUpChecks+=1;setTimeout(()=>load(false),3800)}else if(!j.refreshing){followUpChecks=0}
    }catch(e){
      if(shown&&updated)updated.textContent='최근 확인 공고 표시 · 자동 갱신 대기';
      console.warn('Safety jobs:',e);
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',()=>load(true));load(false);
})();
