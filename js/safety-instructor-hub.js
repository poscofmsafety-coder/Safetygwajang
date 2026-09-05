/* 산업안전지도사 학습실 V25 - 문제 · 정답 · 원문 중심 */
(function(){
  'use strict';

  const DATA_URL='data/safety-instructor-study.json';
  const UNLOCK_KEY='dup-access-ok';
  const MEMO_KEY='si-v25-mastered';
  let data=null, root=null, mainTab='first', secondMode='past', thirdMode='past';
  let firstLimit=24, secondLimit=24, thirdLimit=24, timerId=null, timerLeft=90;
  const mastered=loadJson(MEMO_KEY,{});

  document.addEventListener('DOMContentLoaded',waitForPanel);
  window.addEventListener('dup-unlocked',()=>{if(root)root.hidden=false});

  function waitForPanel(){
    let n=0; const t=setInterval(()=>{
      n++; const panel=document.getElementById('panel-dup');
      if(panel){clearInterval(t);mount(panel)}
      if(n>120)clearInterval(t);
    },100);
  }

  async function mount(panel){
    if(document.getElementById('safety-instructor-hub'))return;
    root=document.createElement('section'); root.id='safety-instructor-hub';
    root.hidden=sessionStorage.getItem(UNLOCK_KEY)!=='1';
    root.innerHTML='<div class="si-loading">산업안전지도사 자료 불러오는 중…</div>';
    panel.appendChild(root);
    try{
      const r=await fetch(DATA_URL,{cache:'no-store'}); if(!r.ok)throw new Error('HTTP '+r.status);
      data=await r.json(); renderShell();
    }catch(e){console.error(e);root.innerHTML='<div class="si-error">학습자료를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</div>'}
  }

  function renderShell(){
    root.innerHTML=`
      <div class="si-wrap">
        <header class="si-head">
          <div><span class="si-label">산업안전지도사</span><h2>문제 · 정답 · 원문</h2></div>
          <span class="si-updated">${esc(data.meta.updated)} 기준</span>
        </header>
        <nav class="si-main-tabs" aria-label="산업안전지도사 학습 탭">
          ${mainBtn('first','1차 CBT·중복')}${mainBtn('second','2차 기출·신출')}${mainBtn('third','3차 면접')}
        </nav>
        <section id="si-main-first" class="si-main-panel active"></section>
        <section id="si-main-second" class="si-main-panel"></section>
        <section id="si-main-third" class="si-main-panel"></section>
      </div>`;
    root.querySelectorAll('[data-main]').forEach(b=>b.addEventListener('click',()=>activateMain(b.dataset.main)));
    renderFirst(); renderSecond(); renderThird();
  }

  function mainBtn(k,t){return `<button type="button" data-main="${k}" class="si-main-tab ${k===mainTab?'active':''}">${t}</button>`}
  function activateMain(k){
    mainTab=k;
    root.querySelectorAll('.si-main-tab').forEach(b=>b.classList.toggle('active',b.dataset.main===k));
    root.querySelectorAll('.si-main-panel').forEach(p=>p.classList.toggle('active',p.id===`si-main-${k}`));
  }

  /* ================= 1차 ================= */
  function renderFirst(){
    const s=data.first.summary, p=$('si-main-first');
    p.innerHTML=`
      <div class="si-exam-strip">
        <b>${s.questions}문항</b><span>${s.minutes}분</span><span>${s.subjects.length}과목</span><span>${esc(s.pass)}</span>
        <a class="si-cbt-link" href="exam.html?exam=${encodeURIComponent('산업안전지도사 2026-03-28')}">2026 CBT 풀기</a>
      </div>
      <div class="si-toolbar">
        <input id="si-f1-search" class="si-input" placeholder="중복기출 검색">
        <select id="si-f1-subject" class="si-select"><option value="">전체 과목</option>${s.subjects.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
        <span id="si-f1-count" class="si-count"></span>
      </div>
      <div id="si-f1-list" class="si-list"></div>
      <button id="si-f1-more" class="si-more" type="button">더 보기</button>`;
    $('si-f1-search').addEventListener('input',()=>{firstLimit=24;paintFirst()});
    $('si-f1-subject').addEventListener('change',()=>{firstLimit=24;paintFirst()});
    $('si-f1-more').addEventListener('click',()=>{firstLimit+=24;paintFirst()});
    paintFirst();
  }

  function paintFirst(){
    const q=$('si-f1-search').value.trim().toLowerCase(), sub=$('si-f1-subject').value;
    const arr=data.first.repeats.filter(x=>(!sub||x.subject===sub)&&(!q||`${x.topic} ${x.question} ${(x.choices||[]).join(' ')}`.toLowerCase().includes(q)));
    $('si-f1-count').textContent=`2회 이상 ${arr.length}개`;
    $('si-f1-list').innerHTML=arr.slice(0,firstLimit).map(firstCard).join('')||empty('검색 결과가 없습니다.');
    $('si-f1-more').hidden=arr.length<=firstLimit; bindCommon($('si-f1-list'));
  }

  function firstCard(x){
    const choices=(x.choices||[]).map((c,i)=>`<li class="${i+1===x.answer?'is-answer':''}"><span>${i+1}</span>${esc(c)}</li>`).join('');
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div><span class="si-badge hot">${x.frequency}회</span><span class="si-badge">${esc(x.subject)}</span><span class="si-years">${x.years.join(' · ')}</span></div>${star('f:'+x.id)}</div>
      <h3>${esc(x.question)}</h3>
      <ol class="si-choices">${choices}</ol>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="정답·해설">정답·해설</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}" data-past="1">최신 법령</button></div>
      <div class="si-answer-box" hidden><b>정답 ${x.answer}번</b><p>${esc(x.answerText||'')}</p><div class="si-explain"><strong>해설</strong><p>${esc(x.explanation||'')}</p></div></div>
      ${officialLinks(x,'1차 기출')}
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  /* ================= 2차 ================= */
  function renderSecond(){
    const p=$('si-main-second');
    const years=[...new Set(data.second.pastQuestions.map(x=>x.year))].filter(Boolean).sort((a,b)=>b-a);
    const cats=[...new Set(data.second.pastQuestions.map(x=>x.category).filter(Boolean))].sort();
    p.innerHTML=`
      <div class="si-subtabs">
        <button data-second="past" class="active">기출 ${data.second.pastQuestions.length}</button>
        <button data-second="new">신출 ${data.second.newQuestions.length}</button>
        <button data-second="sources">법·고시·지침·GUIDE</button>
      </div>
      <div id="si-second-list-view">
        <div class="si-toolbar">
          <input id="si-f2-search" class="si-input" placeholder="기출문제 검색">
          <select id="si-f2-year" class="si-select"><option value="">전체 연도</option>${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
          <select id="si-f2-cat" class="si-select"><option value="">전체 분야</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
          <span id="si-f2-count" class="si-count"></span>
        </div>
        <div id="si-f2-list" class="si-list"></div>
        <button id="si-f2-more" class="si-more" type="button">더 보기</button>
      </div>
      <div id="si-source-library" hidden></div>`;
    p.querySelectorAll('[data-second]').forEach(b=>b.addEventListener('click',()=>{
      secondMode=b.dataset.second; secondLimit=24;
      p.querySelectorAll('[data-second]').forEach(x=>x.classList.toggle('active',x===b));
      paintSecond();
    }));
    ['si-f2-search','si-f2-year','si-f2-cat'].forEach(id=>$(id).addEventListener(id.includes('search')?'input':'change',()=>{secondLimit=24;paintSecond()}));
    $('si-f2-more').addEventListener('click',()=>{secondLimit+=24;paintSecond()});
    paintSecond();
  }

  function paintSecond(){
    const view=$('si-second-list-view'), lib=$('si-source-library');
    if(secondMode==='sources'){
      view.hidden=true; lib.hidden=false; paintSourceLibrary(); return;
    }
    view.hidden=false; lib.hidden=true;
    $('si-f2-year').hidden=secondMode!=='past'; $('si-f2-cat').hidden=secondMode!=='past';
    $('si-f2-search').placeholder=secondMode==='past'?'기출문제 검색':'신출문제 검색';
    const q=$('si-f2-search').value.trim().toLowerCase();
    let arr=[];
    if(secondMode==='past'){
      const y=$('si-f2-year').value, c=$('si-f2-cat').value;
      arr=data.second.pastQuestions.filter(x=>(!y||String(x.year)===y)&&(!c||x.category===c)&&(!q||`${x.question} ${x.answer} ${x.category||''}`.toLowerCase().includes(q)));
    }else{
      arr=data.second.newQuestions.filter(x=>!q||`${x.question} ${x.answer} ${x.base||x.field||''}`.toLowerCase().includes(q));
    }
    $('si-f2-count').textContent=`${arr.length}문항`;
    $('si-f2-list').innerHTML=arr.slice(0,secondLimit).map(x=>secondCard(x,secondMode)).join('')||empty('검색 결과가 없습니다.');
    $('si-f2-more').hidden=arr.length<=secondLimit; bindCommon($('si-f2-list'));
  }

  function secondCard(x,mode){
    const past=mode==='past', key=(past?'p2:':'n2:')+(x.id||x.no);
    const label=past?`<span class="si-badge past">기출</span><span class="si-badge year">${esc(x.year)}</span><span class="si-badge">${esc(x.category||'기계안전')}</span>`:`<span class="si-badge new">신출</span>${x.grade?`<span class="si-badge hot">${esc(x.grade)}</span>`:''}${x.base?`<span class="si-badge">${esc(x.base)}</span>`:''}`;
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div>${label}</div>${star(key)}</div>
      <h3>${esc(x.question)}</h3>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="모범답안">모범답안</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}" data-past="${past?'1':'0'}">근거 원문</button></div>
      <div class="si-answer-box" hidden><b>모범답안</b><p>${esc(x.answer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}${x.note?`<p class="si-note">${esc(x.note)}</p>`:''}</div>
      ${officialLinks(x,past?'2차 기출':'2차 신출')}
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  function paintSourceLibrary(){
    const p=$('si-source-library');
    if(!p.dataset.ready){
      p.innerHTML=`
        <div class="si-source-searchbar"><input id="si-src-live-query" class="si-input" placeholder="전체 원문 검색: 예) 제2차 금속산업, 프레스 덮개, 승강기 수시검사"><button id="si-src-live-btn" class="si-answer-btn" type="button">전체 원문 검색</button></div>
        <div id="si-src-live-results" class="si-source-results" hidden></div>
        <div class="si-toolbar"><input id="si-src-search" class="si-input" placeholder="아래 주요 원문 목록 필터"><select id="si-src-type" class="si-select"><option value="">전체</option>${[...new Set(data.sources.map(x=>x.type))].map(t=>`<option>${esc(t)}</option>`).join('')}</select><span id="si-src-count" class="si-count"></span></div>
        <div id="si-src-list" class="si-source-grid"></div>`;
      p.dataset.ready='1';
      $('si-src-search').addEventListener('input',paintSourceLibraryRows);
      $('si-src-type').addEventListener('change',paintSourceLibraryRows);
      $('si-src-live-btn').addEventListener('click',async()=>{const q=$('si-src-live-query').value.trim();if(q)await showSource($('si-src-live-results'),q,false)});
      $('si-src-live-query').addEventListener('keydown',async e=>{if(e.key==='Enter'){e.preventDefault();const q=e.currentTarget.value.trim();if(q)await showSource($('si-src-live-results'),q,false)}});
    }
    paintSourceLibraryRows();
  }

  function paintSourceLibraryRows(){
    const q=$('si-src-search')?.value.trim().toLowerCase()||'', type=$('si-src-type')?.value||'';
    const arr=data.sources.filter(x=>(!type||x.type===type)&&(!q||`${x.title} ${x.focus} ${x.query}`.toLowerCase().includes(q)));
    $('si-src-count').textContent=`${arr.length}개`;
    $('si-src-list').innerHTML=arr.map(sourceLibraryCard).join('')||empty('검색 결과가 없습니다.');
    bindCommon($('si-src-list'));
  }

  function sourceLibraryCard(s){
    const h=s.hits||{}, linked=(h.total||0)>0;
    return `<article class="si-source-card">
      <div class="si-source-card-top"><span class="si-badge">${esc(s.type)}</span>${linked?`<span class="si-badge past">기출연계 ${h.total}</span>`:''}</div>
      <h3>${esc(s.title)}</h3>
      <div class="si-focus"><mark>${esc(s.focus||'관련 조항')}</mark></div>
      ${linked?`<div class="si-hit-count"><span>1차 ${h.first||0}</span><span>2차 ${h.second||0}</span><span>3차 ${h.third||0}</span></div>`:''}
      <div class="si-actions"><a class="si-law-link" href="${attr(s.url)}" target="_blank" rel="noopener">원문 열기</a><button class="si-source-btn" data-source="${attr(s.query||s.title)}" data-past="${linked?'1':'0'}">조항 검색</button></div>
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  /* ================= 3차 ================= */
  function renderThird(){
    const p=$('si-main-third');
    const pastCount=data.third.questions.filter(x=>x.origin==='기출').length;
    const newCount=data.third.questions.filter(x=>x.origin!=='기출').length;
    p.innerHTML=`
      <div class="si-subtabs">
        <button data-third="past" class="active">기출 ${pastCount}</button>
        <button data-third="new">신출 ${newCount}</button>
        <button data-third="random">랜덤 연습</button>
        <button data-third="live">최신 개정·뉴스</button>
      </div>
      <div id="si-third-list-view">
        <div class="si-toolbar"><input id="si-f3-search" class="si-input" placeholder="면접 질문 검색"><span id="si-f3-count" class="si-count"></span></div>
        <div id="si-f3-list" class="si-list"></div><button id="si-f3-more" class="si-more" type="button">더 보기</button>
      </div>
      <div id="si-third-random" hidden></div>
      <div id="si-third-live" hidden></div>`;
    p.querySelectorAll('[data-third]').forEach(b=>b.addEventListener('click',()=>{
      thirdMode=b.dataset.third; thirdLimit=24;
      p.querySelectorAll('[data-third]').forEach(x=>x.classList.toggle('active',x===b)); paintThird();
    }));
    $('si-f3-search').addEventListener('input',()=>{thirdLimit=24;paintThird()});
    $('si-f3-more').addEventListener('click',()=>{thirdLimit+=24;paintThird()});
    paintThird();
  }

  function paintThird(){
    const listView=$('si-third-list-view'), random=$('si-third-random'), live=$('si-third-live');
    listView.hidden=true; random.hidden=true; live.hidden=true; stopTimer();
    if(thirdMode==='random'){random.hidden=false;paintRandom();return}
    if(thirdMode==='live'){live.hidden=false;paintLive();return}
    listView.hidden=false;
    const origin=thirdMode==='past'?'기출':'신출예상', q=$('si-f3-search').value.trim().toLowerCase();
    const arr=data.third.questions.filter(x=>x.origin===origin&&(!q||`${x.question} ${x.modelAnswer} ${x.reference||''}`.toLowerCase().includes(q)));
    $('si-f3-count').textContent=`${arr.length}문항`;
    $('si-f3-list').innerHTML=arr.slice(0,thirdLimit).map(thirdCard).join('')||empty('검색 결과가 없습니다.');
    $('si-f3-more').hidden=arr.length<=thirdLimit; bindCommon($('si-f3-list'));
  }

  function thirdCard(x){
    const past=x.origin==='기출', key='i3:'+x.id;
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div><span class="si-badge ${past?'past':'new'}">${past?'기출':'신출'}</span>${x.year?`<span class="si-badge year">${esc(x.year)}</span>`:''}${x.reference?`<span class="si-ref">${esc(x.reference)}</span>`:''}</div>${star(key)}</div>
      <h3>${esc(x.question)}</h3>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="모범답변">모범답변</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}" data-past="${past?'1':'0'}">근거 원문</button></div>
      <div class="si-answer-box" hidden><b>모범답변</b><p>${esc(x.modelAnswer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}</div>
      ${officialLinks(x,past?'3차 기출':'3차 신출')}
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  function paintRandom(){
    const p=$('si-third-random'), pool=data.third.questions;
    const x=pool[Math.floor(Math.random()*pool.length)], past=x.origin==='기출';
    timerLeft=90; stopTimer();
    p.innerHTML=`<div class="si-random-card">
      <div class="si-random-top"><span class="si-badge ${past?'past':'new'}">${past?'기출':'신출'}</span><b id="si-timer">01:30</b></div>
      <h3>${esc(x.question)}</h3>
      <textarea id="si-random-answer" class="si-textarea" placeholder="90초 안에 말해보세요. 핵심어만 적어도 됩니다."></textarea>
      <div class="si-actions"><button id="si-timer-start" class="si-answer-btn">90초 시작</button><button id="si-speak" class="si-ghost-btn">질문 읽기</button><button id="si-random-reveal" class="si-source-btn">모범답변</button><button id="si-random-next" class="si-ghost-btn">다음</button></div>
      <div id="si-random-key" class="si-answer-box" hidden><b>모범답변</b><p>${esc(x.modelAnswer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}${officialLinks(x,past?'3차 기출':'3차 신출')}<button class="si-source-btn si-inline-source" data-source="${attr(x.sourceQuery||x.question)}" data-past="${past?'1':'0'}">근거 원문</button><div class="si-source-results" hidden></div></div>
    </div>`;
    $('si-timer-start').addEventListener('click',()=>startTimer(90));
    $('si-speak').addEventListener('click',()=>speak(x.question));
    $('si-random-reveal').addEventListener('click',()=>{$('si-random-key').hidden=false;stopTimer()});
    $('si-random-next').addEventListener('click',paintRandom);
    bindCommon(p);
  }

  /* ================= latest ================= */
  function paintLive(){
    const p=$('si-third-live');
    if(!p.dataset.ready){
      p.dataset.ready='1';
      p.innerHTML=`
        <div class="si-live-head"><button id="si-live-refresh" class="si-answer-btn" type="button">새로고침</button><span id="si-live-time">최신 공식자료와 안전뉴스</span></div>
        <div class="si-live-grid">
          <section class="si-live-box"><h3>법령·고시·지침</h3><div id="si-live-law"></div></section>
          <section class="si-live-box"><h3>안전뉴스</h3><div id="si-live-news"></div></section>
        </div>
        <section class="si-live-box si-live-expected"><h3>새로 외울 면접질문</h3><div id="si-live-expected"></div></section>`;
      $('si-live-refresh').addEventListener('click',loadLive);
    }
    if(!$('si-live-law').dataset.loaded)loadLive();
  }

  async function loadLive(){
    const btn=$('si-live-refresh'); if(btn){btn.disabled=true;btn.textContent='확인 중…'}
    $('si-live-law').innerHTML=loading('공식자료 확인 중…'); $('si-live-news').innerHTML=loading('뉴스 확인 중…'); $('si-live-expected').innerHTML=loading('질문 생성 중…');
    try{
      const queries=(data.live.lawQueries||[]).slice(0,12);
      const [lawSets,news]=await Promise.all([
        Promise.all(queries.map(q=>fetchLaw(q,8).catch(()=>[]))),
        fetch('/api/news?refresh=1&t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).catch(()=>({items:[]}))
      ]);
      const laws=dedupe(lawSets.flat()).slice(0,20), newsItems=(news.items||[]).slice(0,10);
      $('si-live-law').dataset.loaded='1';
      $('si-live-law').innerHTML=laws.length?laws.map(x=>liveLawCard(x)).join(''):empty('검색 결과가 없습니다.');
      $('si-live-news').innerHTML=newsItems.length?newsItems.map(liveNewsCard).join(''):empty('뉴스를 불러오지 못했습니다.');
      const expected=[...laws.slice(0,10).map((x,i)=>({type:'law',title:x.title,query:x.title,question:makeLawQuestion(x,i)})),...newsItems.slice(0,4).map(x=>({type:'news',title:x.title,query:x.title,question:`${x.title} 사고와 관련해 산업안전지도사가 현장에서 확인할 예방조치를 말해보세요.`}))];
      $('si-live-expected').innerHTML=expected.length?expected.map((x,i)=>liveExpectedCard(x,i)).join(''):empty('새 질문이 없습니다.');
      bindLiveExpected(expected);
      $('si-live-time').textContent='업데이트 '+new Date().toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    }catch(e){console.error(e);$('si-live-expected').innerHTML=empty('업데이트 연결이 지연되고 있습니다.');}
    finally{if(btn){btn.disabled=false;btn.textContent='새로고침'}}
  }

  function makeLawQuestion(x,i){
    const t=x.title||'해당 기준';
    if(/안전검사/.test(t))return `${t}에서 최근 변경된 대상·검사기준을 설명해보세요.`;
    if(/위험성평가/.test(t))return `${t}에서 평가 시기와 근로자 참여·공유 사항을 설명해보세요.`;
    if(/교육/.test(t))return `${t}에서 현재 적용되는 교육대상·시간·내용의 핵심을 설명해보세요.`;
    return `${t}에서 산업안전지도사가 외워야 할 정의·대상·절차·수치를 설명해보세요.`;
  }

  function liveLawCard(x){return `<article class="si-live-row"><div><span>${esc(x.categoryName||x.source||'공식자료')}</span><b>${esc(x.title)}</b><p>${highlightText((x.content||'').slice(0,260),x.title)}</p></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</article>`}
  function liveNewsCard(x){return `<article class="si-live-row"><div><span>${esc(x.source||'뉴스')}</span><b>${esc(x.title)}</b></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">기사</a>`:''}</article>`}
  function liveExpectedCard(x,i){return `<article class="si-live-q"><span class="si-badge ${x.type==='law'?'variant':'new'}">${x.type==='law'?'개정·원문':'뉴스'}</span><h4>${esc(x.question)}</h4><div class="si-actions"><button class="si-source-btn" data-live-source="${i}">근거</button><button class="si-answer-btn" data-live-ai="${i}">모범답변 생성</button></div><div class="si-source-results" data-live-box="${i}" hidden></div><div class="si-ai-answer" data-live-answer="${i}" hidden></div></article>`}

  function bindLiveExpected(expected){
    root.querySelectorAll('[data-live-source]').forEach(b=>b.addEventListener('click',async()=>{
      const i=Number(b.dataset.liveSource),x=expected[i],box=root.querySelector(`[data-live-box="${i}"]`); await showSource(box,x.query,false);
    }));
    root.querySelectorAll('[data-live-ai]').forEach(b=>b.addEventListener('click',async()=>{
      const i=Number(b.dataset.liveAi),x=expected[i],out=root.querySelector(`[data-live-answer="${i}"]`);out.hidden=false;out.textContent='작성 중…';b.disabled=true;
      let evidence=[];try{evidence=await fetchLaw(x.query,6)}catch(e){}
      const prompt=`산업안전지도사 3차 면접 질문의 모범답변을 작성하세요. 질문: ${x.question}\n공식 검색자료: ${JSON.stringify(evidence.slice(0,5).map(v=>({title:v.title,content:(v.content||'').slice(0,800)})))}\n60초 안에 말할 수 있게 결론부터 3~5개 항목으로 답하세요. 법령·고시의 정의, 대상, 절차, 수치가 확인되는 경우만 사용하고 확인되지 않은 숫자는 만들지 마세요.`;
      try{out.textContent=await callAI(prompt)}catch(e){out.textContent='AI 연결이 지연되고 있습니다. 근거 원문을 확인해 주세요.'}finally{b.disabled=false}
    }));
  }

  /* ================= sources/common ================= */
  function officialLinks(x,context){
    const links=x.officialLinks||[]; if(!links.length)return '';
    const isPast=/기출/.test(context||'');
    return `<div class="si-official-links"><span class="si-official-label">${isPast?'기출 근거':'근거 원문'}</span>${links.slice(0,5).map(s=>`<a href="${attr(s.url)}" target="_blank" rel="noopener" title="${attr(s.focus||'')}"><span>${esc(s.type)}</span>${esc(s.title)}${s.focus?`<mark>${esc(s.focus)}</mark>`:''}</a>`).join('')}</div>`;
  }

  function bindCommon(scope){
    scope.querySelectorAll('[data-reveal]').forEach(b=>b.addEventListener('click',()=>{
      const box=b.closest('.si-question-card,.si-random-card')?.querySelector('.si-answer-box'); if(!box)return;
      box.hidden=!box.hidden; const label=b.dataset.label||'답'; b.textContent=box.hidden?label:'접기';
    }));
    scope.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',async()=>{
      const host=b.closest('.si-question-card,.si-source-card,.si-random-card,.si-answer-box');
      let box=host?.querySelector(':scope > .si-source-results') || host?.querySelector('.si-source-results');
      if(box)await showSource(box,b.dataset.source,b.dataset.past==='1');
    }));
    scope.querySelectorAll('[data-master]').forEach(b=>b.addEventListener('click',()=>{
      const k=b.dataset.master; mastered[k]=!mastered[k]; saveJson(MEMO_KEY,mastered); b.classList.toggle('on',!!mastered[k]); b.textContent=mastered[k]?'★':'☆';
    }));
  }

  async function showSource(box,q,isPast){
    if(!box)return; box.hidden=false; box.innerHTML=loading('공식 원문 검색 중…');
    try{
      const items=await fetchLaw(q,12);
      box.innerHTML=items.length?items.slice(0,8).map(x=>sourceRow(x,q,isPast)).join(''):empty('검색 결과가 없습니다. 위 법제처 원문 링크도 확인해 주세요.');
    }catch(e){box.innerHTML=empty('공식자료 검색 연결이 지연되고 있습니다.')}
  }
  async function fetchLaw(q,limit=10){
    const r=await fetch(`/api/safety-law/search?q=${encodeURIComponent(q||'')}&limit=${limit}`,{cache:'no-store'}); const j=await r.json();
    if(!r.ok||!j.ok)throw new Error(j.error||'검색 실패'); return [...(j.law||[]),...(j.guide||[]),...(j.media||[])];
  }
  function sourceRow(x,q,isPast){
    return `<div class="si-source-row"><div><span>${esc(x.categoryName||x.source||'공식자료')}${isPast?'<em>기출 근거</em>':''}</span><b>${highlightText(x.title||'검색 결과',q)}</b><p>${highlightText((x.content||'').slice(0,420),q)}</p></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</div>`;
  }

  function highlightText(text,q){
    let out=esc(text||''); const terms=queryTerms(q);
    for(const t of terms){const re=new RegExp(`(${escapeRegExp(esc(t))})`,'gi');out=out.replace(re,'<mark class="si-hit">$1</mark>')}
    return out;
  }
  function queryTerms(q){
    const stop=new Set(['산업안전보건법','산업안전보건기준','관한','규칙','시행령','시행규칙','고시','지침','기준','설명','하시오','대하여','관련','해당','안전','보건','산업','근로자','사업주']);
    return [...new Set(String(q||'').replace(/[()\[\]{}“”"'·,/.:;!?~\-]/g,' ').split(/\s+/).map(x=>x.trim()).filter(x=>x.length>=2&&!stop.has(x)))].sort((a,b)=>b.length-a.length).slice(0,10);
  }
  function escapeRegExp(v){return String(v).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
  function dedupe(arr){const seen=new Set();return arr.filter(x=>{const k=`${x.category||''}|${x.title||''}`;if(!x.title||seen.has(k))return false;seen.add(k);return true})}

  async function callAI(prompt){
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'산업안전지도사 3차 면접 튜터입니다. 공식 근거를 우선하고 짧고 정확한 모범답변만 작성합니다.'},{role:'user',content:prompt}],temperature:.1,max_tokens:1300})});
    const j=await r.json(); return j?.choices?.[0]?.message?.content||j?.error||'응답을 불러오지 못했습니다.';
  }

  function star(k){return `<button class="si-star ${mastered[k]?'on':''}" data-master="${attr(k)}" title="외움 체크">${mastered[k]?'★':'☆'}</button>`}
  function startTimer(sec){stopTimer();timerLeft=sec;updateTimer();timerId=setInterval(()=>{timerLeft--;updateTimer();if(timerLeft<=0)stopTimer()},1000)}
  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
  function updateTimer(){const e=$('si-timer');if(e)e.textContent=`${String(Math.floor(Math.max(0,timerLeft)/60)).padStart(2,'0')}:${String(Math.max(0,timerLeft)%60).padStart(2,'0')}`}
  function speak(t){if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';u.rate=.95;window.speechSynthesis.speak(u)}
  function empty(t){return `<div class="si-empty">${esc(t)}</div>`}
  function loading(t){return `<div class="si-loading">${esc(t)}</div>`}
  function $(id){return document.getElementById(id)}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function attr(v){return esc(v).replace(/`/g,'&#96;')}
  function loadJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')||f}catch(e){return f}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
})();
