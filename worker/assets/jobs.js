(function(){
  const box=document.getElementById('safetyJobsList');
  const status=document.getElementById('safetyJobsStatus');
  const refresh=document.getElementById('safetyJobsRefresh');
  if(!box)return;
  const CACHE_KEY='sgw_worker_safety_jobs_v1';
  let followUpChecks=0;
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function getCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(e){return null}}
  function setCache(v){try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(e){}}
  function fingerprint(x){return [clean(x.company).replace(/\(주\)|㈜|주식회사/g,''),clean(x.position).replace(/안전관리자/g,'안전관리'),clean(x.location)].join('|').toLowerCase().replace(/[^0-9a-z가-힣|]/g,'')}
  function dedupe(items){const seen=new Set(),out=[];for(const x of items||[]){const k=fingerprint(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x)}return out}
  function deadlineLabel(v){const s=clean(v);if(!s)return '';if(s==='채용시'||/^D-\d+/i.test(s))return s;if(/^\d{2}-\d{2}-\d{2}$/.test(s)){const [y,m,d]=s.split('-');return `${Number(m)}.${Number(d)} 마감`}return s}
  function render(j,stale){
    const items=dedupe(j?.items||[]).slice(0,18);if(!items.length)return false;
    box.innerHTML=items.map(x=>{
      const provider=clean(x.provider)||'채용정보';
      const bits=[clean(x.category),clean(x.career),clean(x.location),deadlineLabel(x.deadline)].filter(Boolean);
      const reg=clean(x.registered);if(reg)bits.push(reg);
      return `<a class="safety-job-item" href="${esc(x.link||x.detailUrl||'#')}" target="_blank" rel="noopener noreferrer"><div class="job-top"><span class="job-provider">${esc(provider)}</span>${x.category?`<span class="job-category">${esc(x.category)}</span>`:''}<span class="job-arrow">공고 보기 ↗</span></div><p class="job-sentence"><strong>${esc(x.company)}</strong>에서 <b>${esc(x.position)}</b> 채용을 진행합니다.</p><div class="job-meta">${bits.map(v=>`<span>${esc(v)}</span>`).join('')}</div></a>`;
    }).join('');
    if(status){const t=new Date(j.updatedAt||Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});status.textContent=(stale?'저장된 공고 표시 · 갱신 중':'최신 공고')+` · ${t} · 중복 제외 ${items.length}건`;}
    return true;
  }
  async function load(force=false){
    const cached=getCache(),shown=render(cached,true);
    if(refresh)refresh.disabled=true;
    if(!shown){if(status)status.textContent='최신 안전관리 채용공고 확인 중';box.innerHTML='<div class="jobs-loading">안전·EHS 채용공고를 확인하고 있습니다.</div>';}
    try{
      const r=await fetch(force?('/api/jobs?refresh=1&t='+Date.now()):'/api/jobs',{cache:'no-store'});
      const j=await r.json();if(!r.ok||!j.items?.length)throw new Error(j.error||'채용공고를 불러오지 못했습니다.');
      setCache(j);render(j,false);
      if(j.refreshing&&followUpChecks<3){followUpChecks+=1;setTimeout(()=>load(false),4800)}else if(!j.refreshing){followUpChecks=0}
    }catch(e){
      if(!shown){box.innerHTML='<div class="jobs-loading jobs-error">채용공고 연결이 잠시 지연되고 있습니다. 잠시 후 새로고침해 주세요.</div>';if(status)status.textContent='공고 연결 재시도 필요';}
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',()=>load(true));load(false);
})();
