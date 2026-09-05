(function(){
  const box=document.getElementById('safetyNewsList');
  const status=document.getElementById('safetyNewsStatus');
  const refresh=document.getElementById('safetyNewsRefresh');
  if(!box)return;
  const CACHE_KEY='sgw_worker_safety_news_v4';
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function relTime(v){const d=new Date(v);if(isNaN(d))return '';const sec=Math.max(0,(Date.now()-d)/1000);if(sec<3600)return Math.max(1,Math.floor(sec/60))+'분 전';if(sec<86400)return Math.floor(sec/3600)+'시간 전';if(sec<604800)return Math.floor(sec/86400)+'일 전';return d.toLocaleDateString('ko-KR')}
  function getCache(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch(e){return null}}
  function setCache(v){try{localStorage.setItem(CACHE_KEY,JSON.stringify(v))}catch(e){}}
  function render(j,stale){
    const items=j?.items||[];if(!items.length)return false;
    box.innerHTML=items.slice(0,18).map((n,i)=>`<a class="safety-news-item" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer"><span class="news-no">${String(i+1).padStart(2,'0')}</span><span class="news-main"><strong>${esc(n.title)}</strong><small>${esc(n.source||n.provider||'뉴스')} · ${esc(relTime(n.pubDate))}</small></span><span class="news-arrow">↗</span></a>`).join('');
    if(status)status.textContent=(stale?'저장된 뉴스 표시 · 갱신 중':'최신 뉴스')+' · '+new Date(j.updatedAt||Date.now()).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'});
    return true;
  }
  async function load(force=false){
    const cached=getCache(),shown=render(cached,true);
    if(refresh)refresh.disabled=true;
    if(!shown){if(status)status.textContent='최신 안전 뉴스 확인 중';box.innerHTML='<div class="news-loading">최신 기사를 빠르게 확인하고 있습니다.</div>'}
    try{
      const r=await fetch(force?('/api/news?refresh=1&t='+Date.now()):'/api/news',{cache:'no-store'});const j=await r.json();
      if(!r.ok||!j.items?.length)throw new Error(j.error||'뉴스를 불러오지 못했습니다.');
      setCache(j);render(j,false);
      if(j.refreshing)setTimeout(()=>load(false),4200);
    }catch(e){if(!shown){box.innerHTML='<div class="news-loading news-error">실시간 뉴스를 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>';if(status)status.textContent='뉴스 연결 재시도 필요'}}
    finally{if(refresh)refresh.disabled=false}
  }
  refresh?.addEventListener('click',()=>load(true));load(false);
})();
