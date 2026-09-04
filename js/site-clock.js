(function(){
  'use strict';
  const dayMap=['일','월','화','수','목','금','토'];
  function partsKst(){
    const now=new Date();
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Seoul',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const v={}; parts.forEach(p=>{if(p.type!=='literal')v[p.type]=p.value});
    const kstDate=new Date(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(now)+'T00:00:00+09:00');
    return {year:Number(v.year),month:Number(v.month),day:Number(v.day),hour:String(v.hour).padStart(2,'0'),minute:String(v.minute).padStart(2,'0'),weekday:dayMap[kstDate.getDay()]};
  }
  function tick(){
    const x=partsKst(), text=`${x.year}. ${x.month}. ${x.day} (${x.weekday}), ${x.hour}:${x.minute}`;
    document.querySelectorAll('[data-live-clock]').forEach(el=>{el.textContent=text;el.setAttribute('title','대한민국 표준시(KST)');});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{tick();setInterval(tick,15000)});else{tick();setInterval(tick,15000)}
})();
