(function(){
  const box=document.getElementById('safetyJobsList');
  const status=document.getElementById('safetyJobsStatus');
  const refresh=document.getElementById('safetyJobsRefresh');
  if(!box)return;
  const CACHE_KEY='sgw_worker_safety_jobs_v4';
  let followUpChecks=0;
  const FALLBACK=[
    {company:'현대자동차',position:'현대자동차 9월 신입 채용 (안전관리·전주공장)',category:'안전관리',career:'신입',location:'전북 완주군',deadline:'2026-09-14',registered:'2026-09-01',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54825196&t_category=top1000&t_content=generic&tab=introduce',expiresAt:'2026-09-14T17:00:00+09:00',curated:true},
    {company:'두산에너빌리티',position:'2026 두산그룹 신입사원 채용 - EHS/안전관리',category:'EHS·안전관리',career:'신입',location:'경기 성남 · 경남 창원',deadline:'2026-09-21',registered:'2026-09-01',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54919078',expiresAt:'2026-09-21T18:00:00+09:00',curated:true},
    {company:'HD현대삼호',position:'26년 하반기 신입사원 채용 (안전관리)',category:'안전관리',career:'신입',location:'전남 영암군',deadline:'2026-09-27',registered:'2026-09-01',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54914131',expiresAt:'2026-09-27T23:59:00+09:00',curated:true},
    {company:'현대자동차',position:'현대자동차 9월 신입 채용 (안전/환경·울산공장)',category:'안전·환경',career:'신입',location:'울산',deadline:'2026-09-14',registered:'2026-09-01',provider:'사람인',link:'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=54824973',expiresAt:'2026-09-14T17:00:00+09:00',curated:true},
    {company:'GS칼텍스',position:'2026년 하반기 신입사원 채용(안전)',category:'안전',career:'신입',location:'전남 여수시',deadline:'2026-09-15',registered:'2026-09-02',provider:'사람인',link:'https://m.saramin.co.kr/job-search/view?rec_idx=54927251',expiresAt:'2026-09-15T23:59:00+09:00',curated:true},
    {company:'쿠팡풀필먼트서비스',position:'물류운영·엔지니어·경영지원·EHS 경력 채용',category:'EHS',career:'경력',location:'전국',deadline:'2026-09-30',registered:'2026-09-01',provider:'사람인',link:'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=54895304',expiresAt:'2026-09-30T23:59:00+09:00',curated:true},
    {company:'LS아이앤디',position:'시설관리(전기/기계) 및 안전관리 경력 채용',category:'안전관리',career:'경력',location:'경기 안양시',deadline:'2026-09-30',registered:'2026-09-01',provider:'잡코리아',link:'https://www.jobkorea.co.kr/Recruit/GI_Read/49892063',expiresAt:'2026-09-30T23:59:00+09:00',curated:true},
    {company:'계룡건설산업',position:'2026년 9월 안전직, 보건관리자 모집공고',category:'안전·보건',career:'신입·경력',location:'대전 외 전국 현장',deadline:'2026-09-10',registered:'2026-09-03',provider:'인크루트',link:'https://lab.incruit.com/jobs/2609030004669',expiresAt:'2026-09-10T23:59:00+09:00',curated:true},
    {company:'두산퓨얼셀',position:'기술 계약직 채용_안전/환경(군산)',category:'안전·환경',career:'신입·경력',location:'전북 군산시',deadline:'2026-09-10',registered:'2026-09-02',provider:'인크루트',link:'https://lab.incruit.com/jobs/2609020000032',expiresAt:'2026-09-10T23:59:00+09:00',curated:true}
  ];
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function getCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(e){return null}}
  function setCache(v){try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(e){}}
  function fingerprint(x){return [clean(x.company).replace(/\(주\)|㈜|주식회사/g,''),clean(x.position).replace(/안전관리자/g,'안전관리'),clean(x.location)].join('|').toLowerCase().replace(/[^0-9a-z가-힣|]/g,'')}
  function dedupe(items){const seen=new Set(),out=[];for(const x of items||[]){const k=fingerprint(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x)}return out}
  function activeFallback(){const now=Date.now();return FALLBACK.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>=now)}
  function mergedItems(j){return dedupe([...(j?.items||[]),...activeFallback()]).slice(0,12)}
  function deadlineLabel(v){
    const raw=clean(v);if(!raw)return '';
    const s=raw.replace(/^(?:마감일|접수마감)\s*[:：]?\s*/,'').trim();
    if(/채용\s*시/.test(s))return '~ 채용시';if(/상시/.test(s))return '~ 상시';
    const names='일월화수목금토';const label=(y,m,d)=>{const yy=Number(y),mm=Number(m),dd=Number(d);const dt=new Date(yy,mm-1,dd,12);if(!yy||!mm||!dd||dt.getFullYear()!==yy||dt.getMonth()!==mm-1||dt.getDate()!==dd)return '';return `~ ${String(mm).padStart(2,'0')}/${String(dd).padStart(2,'0')}(${names[dt.getDay()]})`};
    const now=new Date();now.setHours(12,0,0,0);if(/오늘\s*마감/.test(s))return label(now.getFullYear(),now.getMonth()+1,now.getDate());if(/내일\s*마감/.test(s)){const d=new Date(now);d.setDate(d.getDate()+1);return label(d.getFullYear(),d.getMonth()+1,d.getDate())}
    let m=s.match(/D\s*-\s*(\d+)/i);if(m){const d=new Date(now);d.setDate(d.getDate()+Number(m[1]));return label(d.getFullYear(),d.getMonth()+1,d.getDate())}
    m=s.match(/(20\d{2})\s*(?:[-./]|년\s*)(\d{1,2})\s*(?:[-./]|월\s*)(\d{1,2})/);if(m)return label(m[1],m[2],m[3]);m=s.match(/(?:^|[^\d])(\d{2})[-./](\d{1,2})[-./](\d{1,2})(?:[^\d]|$)/);if(m)return label(2000+Number(m[1]),m[2],m[3]);m=s.match(/(?:^|[^\d])(\d{1,2})\s*[./-]\s*(\d{1,2})/);if(m){let y=now.getFullYear();const d=new Date(y,Number(m[1])-1,Number(m[2]),12);if(d.getTime()<now.getTime()-45*86400000)y+=1;return label(y,m[1],m[2])}const stripped=s.replace(/^~\s*/,'').replace(/\s*마감(?:예정)?\s*$/,'').trim();return stripped?'~ '+stripped:'';
  }
  function render(j,stale,label=''){
    const items=mergedItems(j);if(!items.length)return false;
    box.innerHTML=items.map(x=>{
      const provider=clean(x.provider)||'채용정보';
      const bits=[clean(x.category),clean(x.career),clean(x.location),deadlineLabel(x.deadline)].filter(Boolean);
      return `<a class="safety-job-item" href="${esc(x.link||x.detailUrl||'#')}" target="_blank" rel="noopener noreferrer"><div class="job-top"><span class="job-provider">${esc(provider)}</span>${x.category?`<span class="job-category">${esc(x.category)}</span>`:''}<span class="job-arrow">공고 보기 ↗</span></div><p class="job-sentence"><strong>${esc(x.company)}</strong>에서 <b>${esc(x.position)}</b> 채용을 진행합니다.</p><div class="job-meta">${bits.map(v=>`<span>${esc(v)}</span>`).join('')}</div></a>`;
    }).join('');
    if(status){const t=new Date(j?.updatedAt||Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});status.textContent=(label||((stale?'저장된 공고':(j?.liveCount>0?'실시간 수집':'최근 확인 공고'))+' · '+t))+` · ${items.length}건`;}
    return true;
  }
  async function load(force=false){
    const cached=getCache();let shown=render(cached,true);
    if(!shown)shown=render({items:activeFallback(),updatedAt:new Date().toISOString()},true,'최근 확인 공고 · 최신 목록 갱신 중');
    if(refresh)refresh.disabled=true;
    try{const endpoint=force?('/api/jobs?refresh=1&client=v5&t='+Date.now()):('/api/jobs?client=v5&t='+Date.now());const r=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json','Cache-Control':'no-cache'}});const j=await r.json();if(!r.ok||!j.items?.length)throw new Error(j.error||'채용공고를 불러오지 못했습니다.');setCache(j);render(j,false,['seed','curated'].includes(j.source)?'최근 확인 공고 · 실시간 수집 재시도 중':'');if(j.refreshing&&followUpChecks<4){followUpChecks+=1;setTimeout(()=>load(false),3000)}else if(!j.refreshing){followUpChecks=0}}
    catch(e){if(shown&&status)status.textContent='최근 확인 공고 표시 · 자동 갱신 대기';}
    finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',()=>load(true));load(false);
})();
