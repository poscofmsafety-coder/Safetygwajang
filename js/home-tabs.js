(function(){
  'use strict';
  const buttons=[...document.querySelectorAll('[data-audience-target]')];
  const panels=[...document.querySelectorAll('.audience-panel')];
  const navGroups=[...document.querySelectorAll('[data-nav-group]')];
  const homeOnly=[...document.querySelectorAll('[data-home-only]')];
  const jobOnly=[...document.querySelectorAll('[data-jobseeker-only]')];

  function setAudience(name, updateUrl, scrollToPanel){
    if(!['home','jobseeker','worker'].includes(name)) name='home';
    buttons.forEach(btn=>{
      if(btn.dataset.audienceTarget) btn.setAttribute('aria-selected', btn.dataset.audienceTarget===name ? 'true':'false');
    });
    homeOnly.forEach(el=>{ el.hidden=name!=='home'; });
    panels.forEach(panel=>{ panel.hidden = panel.dataset.audiencePanel!==name; });
    navGroups.forEach(nav=>{ nav.hidden = nav.dataset.navGroup!==name; });
    jobOnly.forEach(el=>{ el.hidden = name!=='jobseeker'; });
    document.body.dataset.audience=name;

    if(updateUrl){
      const url=new URL(location.href);
      if(name==='home') url.searchParams.delete('audience');
      else url.searchParams.set('audience',name);
      history.replaceState(null,'',url.pathname+url.search+url.hash);
    }
    try{ localStorage.setItem('sg-audience',name); }catch(e){}

    if(scrollToPanel){
      const target=name==='home'
        ? document.querySelector('[data-home-only]')
        : document.querySelector(`[data-audience-panel="${name}"]`);
      if(target) target.scrollIntoView({behavior:'smooth',block:'start'});
    }else if(updateUrl){
      window.scrollTo({top:0,behavior:'smooth'});
    }
  }

  const qs=new URLSearchParams(location.search).get('audience');
  const initial=qs==='worker'?'worker':qs==='jobseeker'?'jobseeker':'home';

  buttons.forEach(btn=>btn.addEventListener('click',()=>{
    setAudience(btn.dataset.audienceTarget,true,btn.classList.contains('home-cta'));
  }));
  document.querySelectorAll('[data-open-audience]').forEach(a=>a.addEventListener('click',()=>{
    const target=a.dataset.openAudience;
    if(target)setAudience(target,true,false);
  }));
  setAudience(initial,false,false);
})();
