(function(){
  const phrases = [
    '화이팅! 오늘도 안전하게 해낼 수 있습니다.',
    '모든 사고는 예방할 수 있습니다. 한 번 더 확인!',
    '안전은 우연이 아니라 준비에서 시작됩니다.',
    '위험을 먼저 보면 안전이 따라옵니다.',
    '한 번 더 확인하면 사고를 한 번 더 막을 수 있어요.',
    '오늘도 무재해! 기본을 지키는 사람이 현장을 지킵니다.',
    '할 수 있습니다! 안전관리자는 현장을 더 나은 곳으로 만듭니다.',
    '서두르지 말고 정확하게. 안전이 제일 먼저입니다.',
    '작은 기록 하나가 큰 사고를 막을 수 있습니다.',
    '당신의 한 번의 점검이 누군가의 하루를 지킵니다.'
  ];
  let bubble;
  function ensureBubble(){
    if (bubble) return bubble;
    bubble=document.createElement('div');
    bubble.className='mascot-cheer-bubble';
    bubble.setAttribute('role','status');
    bubble.setAttribute('aria-live','polite');
    document.body.appendChild(bubble);
    return bubble;
  }
  function show(el){
    const b=ensureBubble();
    b.textContent=phrases[Math.floor(Math.random()*phrases.length)];
    const r=el.getBoundingClientRect();
    const top=Math.max(12, r.bottom+10);
    let left=Math.min(window.innerWidth-300, Math.max(12, r.left+r.width/2-140));
    b.style.top=top+'px'; b.style.left=left+'px';
    b.classList.add('show');
    clearTimeout(show.t); show.t=setTimeout(()=>b.classList.remove('show'), 2600);
  }

  function prepareMascots(){
    document.querySelectorAll('img[data-cheer-mascot],img[src*="jaeili-head"]').forEach(img=>{
      img.setAttribute('title','제일이를 눌러 오늘의 안전 응원을 받아보세요');
      img.setAttribute('role','button'); img.setAttribute('tabindex','0');
      img.setAttribute('aria-label','제일이 안전 응원 메시지 보기');
      img.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();show(img);}});
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',prepareMascots); else prepareMascots();

  document.addEventListener('click', function(e){
    const img=e.target.closest('img');
    if(!img) return;
    const src=img.getAttribute('src')||'';
    if(!src.includes('jaeili-head') && !img.matches('[data-cheer-mascot]')) return;
    e.preventDefault(); e.stopPropagation();
    show(img);
  }, true);
})();
