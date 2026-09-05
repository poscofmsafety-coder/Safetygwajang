(function(){
  'use strict';
  const grid=document.getElementById('jobs-grid');
  const updated=document.getElementById('jobs-updated');
  const refresh=document.getElementById('jobs-refresh');
  if(!grid)return;
  const CACHE_KEY='sgw_safety_jobs_v1', CACHE_MS=30*60*1000;
  let followUpChecks=0;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=s=>String(s||'').replace(/\s+/g,' ').trim();
  function fingerprint(x){return [clean(x.company).replace(/\(주\)|㈜|주식회사/g,''),clean(x.position).replace(/안전관리자/g,'안전관리'),clean(x.location)].join('|').toLowerCase().replace(/[^0-9a-z가-힣|]/g,'')}
  function dedupe(items){const seen=new Set(),out=[];for(const x of items||[]){const k=fingerprint(x);if(!k||seen.has(k))continue;seen.add(k);out.push(x)}return out}
  function deadline(v){const s=clean(v);if(!s)return '';if(s==='채용시'||/^D-\d+/i.test(s))return s;if(/^\d{2}-\d{2}-\d{2}$/.test(s)){const [,m,d]=s.split('-');return `${Number(m)}.${Number(d)} 마감`}return s}
  function cacheGet(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&x.savedAt?x:null}catch(e){return null}}
  function cacheSet(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
  function render(data,stale=false){
    const items=dedupe(data?.items||[]).slice(0,12);if(!items.length)return false;
    grid.innerHTML=items.map(x=>{
      const meta=[clean(x.category),clean(x.career),clean(x.location),deadline(x.deadline),clean(x.registered)].filter(Boolean);
      return `<a class="job-card-main" href="${esc(x.link||x.detailUrl||'#')}" target="_blank" rel="noopener noreferrer"><div class="job-card-head-main"><span class="job-provider-main">${esc(clean(x.provider)||'채용정보')}</span>${x.category?`<span class="job-category-main">${esc(x.category)}</span>`:''}<span class="job-link-main">공고 보기 ↗</span></div><h3><strong>${esc(x.company)}</strong><span>에서</span> ${esc(x.position)} 채용을 진행합니다.</h3><p>${meta.map(v=>`<span>${esc(v)}</span>`).join('')}</p></a>`;
    }).join('');
    const when=data.updatedAt?new Date(data.updatedAt):new Date();
    if(updated)updated.textContent=(stale?'저장된 공고 · ':'업데이트 ')+when.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+` · 중복 제외 ${items.length}건`;
    return true;
  }
  async function load(force=false){
    const cached=cacheGet();const shown=cached?render(cached.data,Date.now()-cached.savedAt>=CACHE_MS):false;
    if(!shown){grid.classList.add('is-loading');if(updated)updated.textContent='최신 안전관리 채용공고 확인 중';}
    if(refresh)refresh.disabled=true;
    try{
      const endpoint=force?('/api/jobs?refresh=1&t='+Date.now()):'/api/jobs';
      const r=await fetch(endpoint,{cache:'no-store',headers:{Accept:'application/json'}});const text=await r.text();let j;try{j=JSON.parse(text)}catch(_){throw new Error('공고 응답 해석 실패')}
      if(!r.ok||!j.items?.length)throw new Error(j.error||'jobs unavailable');
      cacheSet(j);render(j,false);
      if(j.refreshing&&followUpChecks<3){followUpChecks+=1;setTimeout(()=>load(false),4800)}else if(!j.refreshing){followUpChecks=0}
    }catch(e){
      if(!shown){grid.innerHTML='<div class="jobs-loading-main jobs-error-main">최신 채용공고 연결이 잠시 지연되고 있습니다. 잠시 후 다시 시도해 주세요.</div>';if(updated)updated.textContent='공고 연결 재시도 필요'}
      console.warn('Safety jobs:',e);
    }finally{grid.classList.remove('is-loading');if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',()=>load(true));load(false);
})();
