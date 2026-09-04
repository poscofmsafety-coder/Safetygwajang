
(function(){
  const buttons=[...document.querySelectorAll('[data-audience-target]')];
  const panels=[...document.querySelectorAll('.audience-panel')];
  function setAudience(name, updateUrl){
    buttons.forEach(btn=>btn.setAttribute('aria-selected', btn.dataset.audienceTarget===name ? 'true':'false'));
    panels.forEach(panel=>{ panel.hidden = panel.dataset.audiencePanel!==name; });
    document.body.dataset.audience=name;
    if(updateUrl){
      const url=new URL(location.href);
      if(name==='worker') url.searchParams.set('audience','worker');
      else url.searchParams.delete('audience');
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
    try{ localStorage.setItem('sg-audience',name); }catch(e){}
  }
  const qs=new URLSearchParams(location.search).get('audience');
  let initial=qs==='worker'?'worker':'jobseeker';
  if(!qs){
    try{
      const saved=localStorage.getItem('sg-audience');
      if(saved==='worker'||saved==='jobseeker') initial=saved;
    }catch(e){}
  }
  buttons.forEach(btn=>btn.addEventListener('click',()=>setAudience(btn.dataset.audienceTarget,true)));
  document.querySelectorAll('[data-open-audience]').forEach(a=>{
    a.addEventListener('click',e=>{
      const target=a.dataset.openAudience;
      if(target){ setAudience(target,true); }
    });
  });
  setAudience(initial,false);
})();