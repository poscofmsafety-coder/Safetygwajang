/* 산업안전지도사 학습실 V24 - 1차/2차/3차/최신업데이트 */
(function(){
  'use strict';

  const DATA_URL='data/safety-instructor-study.json';
  const UNLOCK_KEY='dup-access-ok';
  const MEMO_KEY='si-v24-mastered';
  let data=null, root=null, mainTab='first', secondMode='past', thirdMode='past';
  let firstLimit=20, secondLimit=24, thirdLimit=24, timerId=null, timerLeft=90;
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
          <div><span class="si-label">산업안전지도사</span><h2>1·2·3차 학습</h2></div>
          <span class="si-updated">${esc(data.meta.updated)} 기준</span>
        </header>
        <nav class="si-main-tabs" aria-label="산업안전지도사 학습 탭">
          ${mainBtn('first','1차 시험')}${mainBtn('second','2차 시험')}${mainBtn('third','3차 면접')}${mainBtn('live','최신 업데이트')}
        </nav>
        <section id="si-main-first" class="si-main-panel active"></section>
        <section id="si-main-second" class="si-main-panel"></section>
        <section id="si-main-third" class="si-main-panel"></section>
        <section id="si-main-live" class="si-main-panel"></section>
      </div>`;
    root.querySelectorAll('[data-main]').forEach(b=>b.addEventListener('click',()=>activateMain(b.dataset.main)));
    renderFirst(); renderSecond(); renderThird(); renderLive();
  }

  function mainBtn(k,t){return `<button type="button" data-main="${k}" class="si-main-tab ${k===mainTab?'active':''}">${t}</button>`}
  function activateMain(k){
    mainTab=k;
    root.querySelectorAll('.si-main-tab').forEach(b=>b.classList.toggle('active',b.dataset.main===k));
    root.querySelectorAll('.si-main-panel').forEach(p=>p.classList.toggle('active',p.id===`si-main-${k}`));
  }

  /* ---------------- 1차 ---------------- */
  function renderFirst(){
    const s=data.first.summary, p=$('si-main-first');
    p.innerHTML=`
      <div class="si-exam-strip">
        <b>${s.subjects.length}과목</b><span>${s.questions}문항 · 과목당 25문항</span><span>${s.minutes}분</span><span>${esc(s.pass)}</span>
      </div>
      <div class="si-subject-line">${s.subjects.map((x,i)=>`<span>${i+1}. ${esc(x)}</span>`).join('')}</div>
      <div class="si-toolbar">
        <input id="si-f1-search" class="si-input" placeholder="문제·주제 검색">
        <select id="si-f1-subject" class="si-select"><option value="">전체 과목</option>${s.subjects.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
        <span id="si-f1-count" class="si-count"></span>
      </div>
      <div id="si-f1-list" class="si-list"></div>
      <button id="si-f1-more" class="si-more" type="button">더 보기</button>`;
    $('si-f1-search').addEventListener('input',()=>{firstLimit=20;paintFirst()});
    $('si-f1-subject').addEventListener('change',()=>{firstLimit=20;paintFirst()});
    $('si-f1-more').addEventListener('click',()=>{firstLimit+=20;paintFirst()});
    paintFirst();
  }

  function paintFirst(){
    const q=$('si-f1-search').value.trim().toLowerCase(), sub=$('si-f1-subject').value;
    const arr=data.first.repeats.filter(x=>(!sub||x.subject===sub)&&(!q||`${x.topic} ${x.question} ${x.choices.join(' ')}`.toLowerCase().includes(q)));
    $('si-f1-count').textContent=`2회 이상 중복 ${arr.length}개`;
    $('si-f1-list').innerHTML=arr.slice(0,firstLimit).map(firstCard).join('')||empty('검색 결과가 없습니다.');
    $('si-f1-more').hidden=arr.length<=firstLimit;
    bindCommon($('si-f1-list'));
  }

  function firstCard(x){
    const choices=(x.choices||[]).map((c,i)=>`<li class="${i+1===x.answer?'is-answer':''}"><span>${i+1}</span>${esc(c)}</li>`).join('');
    return `<article class="si-card si-question-card" data-item="${attr(x.id)}">
      <div class="si-card-top"><div><span class="si-badge hot">${x.frequency}회 출제</span><span class="si-badge">${esc(x.subject)}</span></div><button class="si-star ${mastered['f:'+x.id]?'on':''}" data-master="f:${attr(x.id)}" title="외움 체크">${mastered['f:'+x.id]?'★':'☆'}</button></div>
      <div class="si-years">${x.years.join(' · ')}</div>
      <h3>${esc(x.question)}</h3>
      <ol class="si-choices">${choices}</ol>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal>정답·해설 보기</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery)}">공식 법령 확인</button></div>
      <div class="si-answer-box" hidden><b>정답 ${x.answer}번 · 출제 당시 기준</b><p>${esc(x.answerText||'')}</p><div class="si-explain"><strong>해설</strong><p>${esc(x.explanation||'')}</p></div></div>
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  /* ---------------- 2차 ---------------- */
  function renderSecond(){
    const p=$('si-main-second');
    const years=[...new Set(data.second.pastQuestions.map(x=>x.year))].filter(Boolean).sort((a,b)=>b-a);
    const cats=[...new Set(data.second.pastQuestions.map(x=>x.category).filter(Boolean))].sort();
    p.innerHTML=`
      <div class="si-subtabs"><button data-second="past" class="active">기출문제 ${data.second.pastQuestions.length}</button><button data-second="variant">기출변형 ${data.second.variants.length}</button></div>
      <div class="si-toolbar" id="si-second-toolbar">
        <input id="si-f2-search" class="si-input" placeholder="예: 프레스, 안전검사, 위험성평가">
        <select id="si-f2-year" class="si-select"><option value="">전체 연도</option>${years.map(y=>`<option value="${y}">${y}</option>`).join('')}</select>
        <select id="si-f2-cat" class="si-select"><option value="">전체 분야</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>
        <span id="si-f2-count" class="si-count"></span>
      </div>
      <div id="si-f2-list" class="si-list"></div>
      <button id="si-f2-more" class="si-more" type="button">더 보기</button>`;
    p.querySelectorAll('[data-second]').forEach(b=>b.addEventListener('click',()=>{secondMode=b.dataset.second;secondLimit=24;p.querySelectorAll('[data-second]').forEach(x=>x.classList.toggle('active',x===b));updateSecondToolbar();paintSecond()}));
    ['si-f2-search','si-f2-year','si-f2-cat'].forEach(id=>$(id).addEventListener(id.includes('search')?'input':'change',()=>{secondLimit=24;paintSecond()}));
    $('si-f2-more').addEventListener('click',()=>{secondLimit+=24;paintSecond()});
    updateSecondToolbar(); paintSecond();
  }

  function updateSecondToolbar(){
    $('si-f2-year').hidden=secondMode!=='past'; $('si-f2-cat').hidden=secondMode!=='past';
    $('si-f2-search').placeholder=secondMode==='past'?'기출문제 검색':'기출에서 꼬아낸 조항·고시 검색';
  }

  function paintSecond(){
    const q=$('si-f2-search').value.trim().toLowerCase();
    let arr;
    if(secondMode==='past'){
      const y=$('si-f2-year').value, c=$('si-f2-cat').value;
      arr=data.second.pastQuestions.filter(x=>(!y||String(x.year)===y)&&(!c||x.category===c)&&(!q||`${x.question} ${x.answer} ${x.category||''}`.toLowerCase().includes(q)));
    }else{
      arr=data.second.variants.filter(x=>!q||`${x.base} ${x.question} ${x.answer}`.toLowerCase().includes(q));
    }
    $('si-f2-count').textContent=`${arr.length}문항`;
    $('si-f2-list').innerHTML=arr.slice(0,secondLimit).map(x=>secondCard(x,secondMode)).join('')||empty('검색 결과가 없습니다.');
    $('si-f2-more').hidden=arr.length<=secondLimit; bindCommon($('si-f2-list'));
  }

  function secondCard(x,mode){
    const key=(mode==='past'?'p2:':'v2:')+(x.id||x.no);
    const meta=mode==='past'?`<span class="si-badge year">${x.year}</span><span class="si-badge">${esc(x.category||'기계안전')}</span>`:`<span class="si-badge variant">기출변형</span><span class="si-badge">${esc(x.base||x.field||'')}</span>`;
    const kws=(x.keywords||[]).filter(Boolean).slice(0,6);
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div>${meta}</div><button class="si-star ${mastered[key]?'on':''}" data-master="${attr(key)}">${mastered[key]?'★':'☆'}</button></div>
      <h3>${esc(x.question)}</h3>
      ${kws.length?`<div class="si-keywords">${kws.map(k=>`<span>${esc(k)}</span>`).join('')}</div>`:''}
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal>모범답안 보기</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}">공식 원문 확인</button></div>
      <div class="si-answer-box" hidden><b>모범답안</b><p>${esc(x.answer||'공식 근거 확인 후 답안을 보완하세요.')}</p>${x.note?`<p class="si-note">${esc(x.note)}</p>`:''}</div>
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  /* ---------------- 3차 ---------------- */
  function renderThird(){
    const p=$('si-main-third');
    const pastCount=data.third.questions.filter(x=>x.origin==='기출').length;
    const newCount=data.third.questions.filter(x=>x.origin!=='기출').length;
    p.innerHTML=`
      <div class="si-template">${data.third.template.map((x,i)=>`<span><b>${i+1}</b>${esc(x)}</span>`).join('')}</div>
      <div class="si-subtabs"><button data-third="past" class="active">기출 면접 ${pastCount}</button><button data-third="new">신출 예상 ${newCount}</button><button data-third="random">랜덤 연습</button></div>
      <div id="si-third-list-view">
        <div class="si-toolbar"><input id="si-f3-search" class="si-input" placeholder="면접질문 검색"><span id="si-f3-count" class="si-count"></span></div>
        <div id="si-f3-list" class="si-list"></div><button id="si-f3-more" class="si-more" type="button">더 보기</button>
      </div>
      <div id="si-third-random" hidden></div>`;
    p.querySelectorAll('[data-third]').forEach(b=>b.addEventListener('click',()=>{thirdMode=b.dataset.third;thirdLimit=24;p.querySelectorAll('[data-third]').forEach(x=>x.classList.toggle('active',x===b));paintThird()}));
    $('si-f3-search').addEventListener('input',()=>{thirdLimit=24;paintThird()});
    $('si-f3-more').addEventListener('click',()=>{thirdLimit+=24;paintThird()});
    paintThird();
  }

  function paintThird(){
    const listView=$('si-third-list-view'), random=$('si-third-random');
    if(thirdMode==='random'){listView.hidden=true;random.hidden=false;paintRandom();return}
    listView.hidden=false;random.hidden=true; stopTimer();
    const origin=thirdMode==='past'?'기출':'신출예상', q=$('si-f3-search').value.trim().toLowerCase();
    const arr=data.third.questions.filter(x=>x.origin===origin&&(!q||`${x.question} ${x.modelAnswer} ${x.reference||''}`.toLowerCase().includes(q)));
    $('si-f3-count').textContent=`${arr.length}문항`;
    $('si-f3-list').innerHTML=arr.slice(0,thirdLimit).map(thirdCard).join('')||empty('검색 결과가 없습니다.');
    $('si-f3-more').hidden=arr.length<=thirdLimit; bindCommon($('si-f3-list'));
  }

  function thirdCard(x){
    const key='i3:'+x.id;
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div><span class="si-badge ${x.origin==='기출'?'past':'new'}">${x.origin==='기출'?'기출':'신출 예상'}</span>${x.reference?`<span class="si-ref">${esc(x.reference)}</span>`:''}</div><button class="si-star ${mastered[key]?'on':''}" data-master="${attr(key)}">${mastered[key]?'★':'☆'}</button></div>
      <h3>${esc(x.question)}</h3>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal>모범답변 보기</button><button type="button" class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}">법령·고시 확인</button></div>
      <div class="si-answer-box" hidden><b>모범답변</b><p>${esc(x.modelAnswer)}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}</div>
      <div class="si-source-results" hidden></div>
    </article>`;
  }

  function paintRandom(){
    const p=$('si-third-random');
    const pool=data.third.questions;
    const x=pool[Math.floor(Math.random()*pool.length)];
    timerLeft=90; stopTimer();
    p.innerHTML=`<div class="si-random-card">
      <div class="si-random-top"><span class="si-badge ${x.origin==='기출'?'past':'new'}">${x.origin==='기출'?'기출':'신출 예상'}</span><b id="si-timer">01:30</b></div>
      <h3>${esc(x.question)}</h3>
      <textarea id="si-random-answer" class="si-textarea" placeholder="답변 핵심을 적거나 소리 내어 말해보세요."></textarea>
      <div class="si-actions"><button id="si-timer-start" class="si-answer-btn">90초 시작</button><button id="si-speak" class="si-ghost-btn">질문 읽기</button><button id="si-random-reveal" class="si-source-btn">모범답변</button><button id="si-random-next" class="si-ghost-btn">다음 질문</button></div>
      <div id="si-random-key" class="si-answer-box" hidden><b>모범답변</b><p>${esc(x.modelAnswer)}</p>${x.reference?`<div class="si-refline">${esc(x.reference)}</div>`:''}<button class="si-source-btn" data-source="${attr(x.sourceQuery||x.question)}">공식 원문 확인</button><div class="si-source-results" hidden></div></div>
    </div>`;
    $('si-timer-start').addEventListener('click',()=>startTimer(90));
    $('si-speak').addEventListener('click',()=>speak(x.question));
    $('si-random-reveal').addEventListener('click',()=>{$('si-random-key').hidden=false;stopTimer()});
    $('si-random-next').addEventListener('click',paintRandom);
    bindCommon(p);
  }

  function startTimer(sec){
    stopTimer(); timerLeft=sec; updateTimer();
    timerId=setInterval(()=>{timerLeft--;updateTimer();if(timerLeft<=0)stopTimer()},1000);
  }
  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
  function updateTimer(){const e=$('si-timer');if(e)e.textContent=`${String(Math.floor(Math.max(0,timerLeft)/60)).padStart(2,'0')}:${String(Math.max(0,timerLeft)%60).padStart(2,'0')}`}
  function speak(t){if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';u.rate=.95;window.speechSynthesis.speak(u)}

  /* ---------------- 최신 업데이트 ---------------- */
  function renderLive(){
    const p=$('si-main-live');
    p.innerHTML=`
      <div class="si-live-head"><button id="si-live-refresh" class="si-answer-btn" type="button">새로고침</button><span id="si-live-time">공식자료와 최신뉴스를 확인합니다.</span></div>
      <div class="si-live-grid">
        <section class="si-live-box"><h3>법령·고시 변경 확인</h3><div id="si-live-law">${empty('새로고침을 누르면 공식자료를 확인합니다.')}</div></section>
        <section class="si-live-box"><h3>최신 안전뉴스</h3><div id="si-live-news">${empty('새로고침을 누르면 최신 안전뉴스를 확인합니다.')}</div></section>
      </div>
      <section class="si-live-box si-live-expected"><h3>최신자료 기반 신출 면접</h3><div id="si-live-expected">${empty('공식자료를 불러오면 예상질문이 자동으로 생성됩니다.')}</div></section>`;
    $('si-live-refresh').addEventListener('click',loadLive); loadLive();
  }

  async function loadLive(){
    const btn=$('si-live-refresh'); btn.disabled=true; btn.textContent='확인 중…';
    $('si-live-law').innerHTML=loading('공식 법령·고시 검색 중…');
    $('si-live-news').innerHTML=loading('최신 안전뉴스 불러오는 중…');
    $('si-live-expected').innerHTML=loading('신출 질문 만드는 중…');
    try{
      const [lawSets,news]=await Promise.all([
        Promise.all((data.live.lawQueries||[]).map(q=>fetchLaw(q,12).catch(()=>[]))),
        fetch('/api/news?refresh=1&t='+Date.now(),{cache:'no-store'}).then(r=>r.json()).catch(()=>({items:[]}))
      ]);
      const laws=dedupe(lawSets.flat()).filter(x=>/개정|시행|신설|고시|규칙|법|지침/i.test(`${x.title} ${x.content}`)).slice(0,18);
      const newsItems=(news.items||[]).slice(0,10);
      $('si-live-law').innerHTML=laws.length?laws.map(liveLawCard).join(''):empty('공식자료 검색 결과가 없습니다. 잠시 후 다시 확인해 주세요.');
      $('si-live-news').innerHTML=newsItems.length?newsItems.map(liveNewsCard).join(''):empty('최신 뉴스를 불러오지 못했습니다.');
      const expected=[...laws.slice(0,7).map(x=>({type:'law',title:x.title,content:x.content,query:x.title,question:`${x.title}의 최근 적용 포인트와 현장에서 확인할 사항을 설명해보세요.`})),...newsItems.slice(0,5).map(x=>({type:'news',title:x.title,content:`${x.source||''} ${x.title}`,query:x.title,question:`${x.title}과 같은 사고를 예방하기 위해 사업주와 관리감독자가 확인할 조치를 설명해보세요.`}))];
      $('si-live-expected').innerHTML=expected.length?expected.map((x,i)=>liveExpectedCard(x,i)).join(''):empty('신출 질문을 만들 자료가 없습니다.');
      bindLiveExpected(expected);
      $('si-live-time').textContent='업데이트 '+new Date().toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    }catch(e){console.error(e);$('si-live-expected').innerHTML=empty('업데이트 연결이 지연되고 있습니다.');}
    finally{btn.disabled=false;btn.textContent='새로고침'}
  }

  function liveLawCard(x){return `<article class="si-live-row"><div><span>${esc(x.categoryName||x.source||'공식자료')}</span><b>${esc(x.title)}</b><p>${esc((x.content||'').slice(0,220))}</p></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</article>`}
  function liveNewsCard(x){return `<article class="si-live-row"><div><span>${esc(x.source||'뉴스')}</span><b>${esc(x.title)}</b></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">기사</a>`:''}</article>`}
  function liveExpectedCard(x,i){return `<article class="si-live-q"><span class="si-badge ${x.type==='law'?'variant':'new'}">${x.type==='law'?'법·고시':'뉴스'}</span><h4>${esc(x.question)}</h4><div class="si-actions"><button class="si-source-btn" data-live-source="${i}">근거 확인</button><button class="si-answer-btn" data-live-ai="${i}">AI 모범답변</button></div><div class="si-source-results" data-live-box="${i}" hidden></div><div class="si-ai-answer" data-live-answer="${i}" hidden></div></article>`}

  function bindLiveExpected(expected){
    root.querySelectorAll('[data-live-source]').forEach(b=>b.addEventListener('click',async()=>{
      const i=Number(b.dataset.liveSource),x=expected[i],box=root.querySelector(`[data-live-box="${i}"]`); await showSource(box,x.query);
    }));
    root.querySelectorAll('[data-live-ai]').forEach(b=>b.addEventListener('click',async()=>{
      const i=Number(b.dataset.liveAi),x=expected[i],out=root.querySelector(`[data-live-answer="${i}"]`);out.hidden=false;out.textContent='모범답변 작성 중…';b.disabled=true;
      let evidence=[];try{evidence=await fetchLaw(x.query,6)}catch(e){}
      const prompt=`산업안전지도사 3차 면접 모범답변을 작성하세요. 질문: ${x.question}\n공식 검색자료: ${JSON.stringify(evidence.slice(0,5).map(v=>({title:v.title,content:(v.content||'').slice(0,700)})))}\n60초 안에 말할 수 있게 결론부터 3~5개 항목으로 답하고, 확인되지 않은 숫자는 만들지 마세요. 마지막 한 문장은 현장 지도조치로 끝내세요.`;
      try{out.textContent=await callAI(prompt)}catch(e){out.textContent='AI 연결이 지연되고 있습니다. 공식 근거를 먼저 확인해 주세요.'}finally{b.disabled=false}
    }));
  }

  /* ---------------- 공통 ---------------- */
  function bindCommon(scope){
    scope.querySelectorAll('[data-reveal]').forEach(b=>b.addEventListener('click',()=>{const box=b.closest('.si-question-card,.si-random-card')?.querySelector('.si-answer-box');if(box){box.hidden=!box.hidden;b.textContent=box.hidden?(b.textContent.includes('모범')?'모범답안 보기':'정답·해설 보기'):'접기'}}));
    scope.querySelectorAll('[data-source]').forEach(b=>b.addEventListener('click',async()=>{const card=b.closest('.si-question-card,.si-answer-box,.si-random-card');let box=card?.querySelector(':scope > .si-source-results')||card?.parentElement?.querySelector('.si-source-results');if(!box){box=b.parentElement?.querySelector('.si-source-results')}if(box)await showSource(box,b.dataset.source)}));
    scope.querySelectorAll('[data-master]').forEach(b=>b.addEventListener('click',()=>{const k=b.dataset.master;mastered[k]=!mastered[k];saveJson(MEMO_KEY,mastered);b.classList.toggle('on',!!mastered[k]);b.textContent=mastered[k]?'★':'☆'}));
  }

  async function showSource(box,q){
    if(!box)return; box.hidden=false; box.innerHTML=loading('공식 원문 검색 중…');
    try{const items=await fetchLaw(q,10);box.innerHTML=items.length?items.slice(0,7).map(sourceRow).join(''):empty('검색 결과가 없습니다. 검색어를 바꿔 확인해 주세요.')}catch(e){box.innerHTML=empty('공식자료 검색 연결이 지연되고 있습니다.')}
  }
  async function fetchLaw(q,limit=10){
    const r=await fetch(`/api/safety-law/search?q=${encodeURIComponent(q||'')}&limit=${limit}`,{cache:'no-store'});const j=await r.json();if(!r.ok||!j.ok)throw new Error(j.error||'검색 실패');return [...(j.law||[]),...(j.guide||[]),...(j.media||[])];
  }
  function sourceRow(x){return `<div class="si-source-row"><div><span>${esc(x.categoryName||x.source||'공식자료')}</span><b>${esc(x.title||'검색 결과')}</b><p>${esc((x.content||'').slice(0,360))}</p></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</div>`}
  function dedupe(arr){const seen=new Set();return arr.filter(x=>{const k=`${x.category||''}|${x.title||''}`;if(!x.title||seen.has(k))return false;seen.add(k);return true})}
  async function callAI(prompt){
    const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'산업안전지도사 3차 면접 튜터입니다. 공식 근거를 우선하고 짧고 정확하게 답합니다.'},{role:'user',content:prompt}],temperature:.1,max_tokens:1300})});const j=await r.json();return j?.choices?.[0]?.message?.content||j?.error||'응답을 불러오지 못했습니다.';
  }

  function empty(t){return `<div class="si-empty">${esc(t)}</div>`}
  function loading(t){return `<div class="si-loading">${esc(t)}</div>`}
  function $(id){return document.getElementById(id)}
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function attr(v){return esc(v).replace(/`/g,'&#96;')}
  function loadJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')||f}catch(e){return f}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
})();
