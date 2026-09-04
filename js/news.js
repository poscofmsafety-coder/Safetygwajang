(function(){
  'use strict';
  const grid=document.getElementById('news-grid');
  const updated=document.getElementById('news-updated');
  const refresh=document.getElementById('news-refresh');
  if(!grid)return;
  const CACHE_KEY='sgw_safety_news_v1', CACHE_MS=30*60*1000;
  const esc=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function relDate(v){
    const d=new Date(v); if(isNaN(d))return '시간 정보 없음';
    const diff=Math.max(0,Date.now()-d.getTime()),m=Math.floor(diff/60000);
    if(m<60)return m<1?'방금 전':m+'분 전'; const h=Math.floor(m/60); if(h<24)return h+'시간 전';
    const days=Math.floor(h/24); return days<7?days+'일 전':d.toLocaleDateString('ko-KR');
  }
  function render(data,stale=false){
    const items=(data&&data.items)||[];
    if(!items.length){grid.innerHTML='<div class="news-loading">현재 불러온 안전 뉴스가 없습니다. 잠시 후 다시 시도해 주세요.</div>';return;}
    grid.innerHTML=items.slice(0,12).map((x,i)=>`<a class="news-card" href="${esc(x.link)}" target="_blank" rel="noopener noreferrer"><span class="news-rank">${String(i+1).padStart(2,'0')}</span><div><h3>${esc(x.title)}</h3><p><b>${esc(x.source||x.provider||'뉴스')}</b><span>${relDate(x.pubDate)}</span></p></div></a>`).join('');
    const when=data.updatedAt?new Date(data.updatedAt):new Date();
    updated.textContent=(stale?'저장된 뉴스 · ':'업데이트 ')+when.toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
  }
  function cacheGet(){try{const x=JSON.parse(localStorage.getItem(CACHE_KEY)||'null');return x&&x.savedAt?x:null}catch(e){return null}}
  function cacheSet(data){try{localStorage.setItem(CACHE_KEY,JSON.stringify({savedAt:Date.now(),data}))}catch(e){}}
  async function load(force=false){
    const cached=cacheGet(); if(!force&&cached&&Date.now()-cached.savedAt<CACHE_MS){render(cached.data);return;}
    grid.classList.add('is-loading'); if(updated)updated.textContent='최신 기사 확인 중';
    try{
      const r=await fetch('/api/news',{cache:'no-store'}); const j=await r.json();
      if(!r.ok||!j.items||!j.items.length)throw new Error(j.error||'news unavailable');
      cacheSet(j);render(j,false);
    }catch(e){
      if(cached)render(cached.data,true); else grid.innerHTML='<div class="news-loading">뉴스 연결을 확인할 수 없습니다. 배포 후 /api/news Worker 경로가 활성화되어 있는지 확인해 주세요.</div>';
      if(updated&&!cached)updated.textContent='뉴스 연결 확인 필요';
    }finally{grid.classList.remove('is-loading')}
  }
  refresh&&refresh.addEventListener('click',()=>load(true)); load(false);
})();
