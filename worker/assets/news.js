(function(){
  const box=document.getElementById('safetyNewsList');
  const status=document.getElementById('safetyNewsStatus');
  const refresh=document.getElementById('safetyNewsRefresh');
  if(!box)return;
  const esc=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  function relTime(v){
    const d=new Date(v); if(isNaN(d))return '';
    const sec=Math.max(0,(Date.now()-d)/1000);
    if(sec<3600)return Math.max(1,Math.floor(sec/60))+'분 전';
    if(sec<86400)return Math.floor(sec/3600)+'시간 전';
    if(sec<604800)return Math.floor(sec/86400)+'일 전';
    return d.toLocaleDateString('ko-KR');
  }
  async function load(){
    if(refresh)refresh.disabled=true;
    if(status)status.textContent='최신 안전 뉴스를 불러오는 중입니다.';
    box.innerHTML='<div class="news-loading">산업안전·중대재해·안전보건 뉴스를 확인하고 있습니다.</div>';
    try{
      const r=await fetch('/api/news',{cache:'no-store'}); const j=await r.json();
      if(!r.ok||!j.items?.length)throw new Error(j.errors?.[0]||'뉴스를 불러오지 못했습니다.');
      box.innerHTML=j.items.map((n,i)=>`<a class="safety-news-item" href="${esc(n.link)}" target="_blank" rel="noopener noreferrer"><span class="news-no">${String(i+1).padStart(2,'0')}</span><span class="news-main"><strong>${esc(n.title)}</strong><small>${esc(n.source||n.provider||'뉴스')} · ${esc(relTime(n.pubDate))}</small></span><span class="news-arrow">↗</span></a>`).join('');
      if(status)status.textContent=`${j.items.length}건 · ${j.naverConfigured?'네이버+Google 뉴스':'Google 뉴스'} · ${new Date(j.updatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})} 갱신`;
    }catch(e){
      box.innerHTML='<div class="news-loading news-error">실시간 뉴스를 가져오지 못했습니다. 잠시 후 새로고침해 주세요.</div>';
      if(status)status.textContent=e.message||'뉴스 연결 오류';
    }finally{if(refresh)refresh.disabled=false;}
  }
  refresh?.addEventListener('click',load); load();
})();
