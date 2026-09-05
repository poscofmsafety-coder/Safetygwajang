(function(){
  'use strict';
  const phrases=[
    '안전은 제일 먼저! 오늘도 무재해로 갑시다!',
    '작업 전 10초 확인이 하루를 안전하게 지킵니다.',
    '위험을 발견했다면 멈추고, 확인하고, 개선하세요!',
    '서두르지 말고 정확하게. 안전이 가장 빠른 길입니다.',
    '오늘의 점검 하나가 내일의 사고 하나를 막습니다.',
    '보호구 착용, 작업 전 확인, 이상하면 즉시 STOP!',
    '좋습니다! 기본을 지키는 사람이 현장을 지킵니다.',
    '작은 이상도 그냥 지나치지 않기. 제일이가 응원합니다!',
    '위험성평가는 서류가 아니라 오늘 작업을 지키는 약속입니다.',
    '동료에게 한 번 더 알려주는 것도 중요한 안전조치입니다.',
    '오늘도 안전하게 출근하고, 더 안전하게 퇴근합시다!',
    '모르면 확인하고, 다르면 멈추고, 위험하면 바로 개선!'
  ];
  let bubble=null,last=-1,hideTimer=null;
  function ensureBubble(){
    if(bubble)return bubble;
    bubble=document.createElement('div');bubble.className='mascot-cheer-bubble';bubble.setAttribute('role','status');bubble.setAttribute('aria-live','polite');document.body.appendChild(bubble);return bubble;
  }
  function nextPhrase(){let i=Math.floor(Math.random()*phrases.length);if(phrases.length>1&&i===last)i=(i+1+Math.floor(Math.random()*(phrases.length-1)))%phrases.length;last=i;return phrases[i];}
  function animate(el){
    const hero=el.matches('[data-hero-mascot]');const cls=hero?'mascot-power-wave':'mascot-power-pop';el.classList.remove(cls);void el.offsetWidth;el.classList.add(cls);setTimeout(()=>el.classList.remove(cls),900);
  }
  function show(el){
    const b=ensureBubble();b.textContent=nextPhrase();animate(el);
    const r=el.getBoundingClientRect();const bw=Math.min(300,window.innerWidth-24);b.style.width='auto';b.style.maxWidth=bw+'px';
    const left=Math.max(12,Math.min(window.innerWidth-bw-12,r.left+r.width/2-bw/2));
    b.style.left=left+'px';b.style.top='12px';b.classList.remove('show');void b.offsetWidth;
    requestAnimationFrame(()=>{
      const bh=b.offsetHeight||70;let top=r.bottom+10;if(top+bh>window.innerHeight-12)top=Math.max(12,r.top-bh-10);b.style.top=top+'px';b.classList.add('show');
    });
    clearTimeout(hideTimer);hideTimer=setTimeout(()=>b.classList.remove('show'),3000);
  }
  function isMascot(img){if(!img)return false;const src=img.getAttribute('src')||'';return img.matches('[data-cheer-mascot],[data-hero-mascot]')||/jaeili-(?:face|wave|thumbs|inspector|clipboard|warning)-v4/i.test(src);}
  function prepare(){
    document.querySelectorAll('img[data-cheer-mascot],img[data-hero-mascot]').forEach(img=>{
      img.setAttribute('title','제일이를 눌러 오늘의 안전 응원을 받아보세요');img.setAttribute('role','button');img.setAttribute('tabindex','0');img.setAttribute('aria-label','제일이의 랜덤 안전 응원 메시지 보기');
      img.addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();show(img);}});
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',prepare);else prepare();
  document.addEventListener('click',e=>{const img=e.target.closest?.('img');if(!isMascot(img))return;e.preventDefault();e.stopPropagation();show(img);},true);
})();
