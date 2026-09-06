(function(){
  const buttons=[...document.querySelectorAll('[data-audience-target]')];
  const panels=[...document.querySelectorAll('.audience-panel')];
  const navGroups=[...document.querySelectorAll('[data-nav-group]')];
  const jobOnly=[...document.querySelectorAll('[data-jobseeker-only]')];
  function setAudience(name, updateUrl, scrollToPanel){
    buttons.forEach(btn=>{
      if(btn.dataset.audienceTarget) btn.setAttribute('aria-selected', btn.dataset.audienceTarget===name ? 'true':'false');
    });
    panels.forEach(panel=>{ panel.hidden = panel.dataset.audiencePanel!==name; });
    navGroups.forEach(nav=>{ nav.hidden = nav.dataset.navGroup!==name; });
    jobOnly.forEach(el=>{ el.hidden = name!=='jobseeker'; });
    document.body.dataset.audience=name;
    if(updateUrl){
      const url=new URL(location.href);
      if(name==='worker') url.searchParams.set('audience','worker'); else url.searchParams.delete('audience');
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
    try{ localStorage.setItem('sg-audience',name); }catch(e){}
    if(scrollToPanel){
      const target=document.querySelector(`[data-audience-panel="${name}"]`);
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }
  }
  const qs=new URLSearchParams(location.search).get('audience');
  let initial=qs==='worker'?'worker':'jobseeker';
  if(!qs){ try{ const saved=localStorage.getItem('sg-audience'); if(saved==='worker'||saved==='jobseeker') initial=saved; }catch(e){} }
  buttons.forEach(btn=>btn.addEventListener('click',()=>setAudience(btn.dataset.audienceTarget,true,btn.classList.contains('home-cta'))));
  document.querySelectorAll('[data-open-audience]').forEach(a=>a.addEventListener('click',()=>{ const target=a.dataset.openAudience;if(target)setAudience(target,true,false); }));
  setAudience(initial,false,false);
})();
