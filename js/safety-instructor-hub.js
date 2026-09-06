/* 산업안전지도사 학습실 V31 - 문제 · 정답 · 원문 중심 */
(function(){
  'use strict';

  const DATA_URL='data/safety-instructor-study.json';
  const UNLOCK_KEY='dup-access-ok';
  const MEMO_KEY='si-v25-mastered';
  let data=null, root=null, mainTab='first', firstMode='study', secondMode='past', thirdMode='past';
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
      <div class="si-subtabs"><button data-first-mode="study" class="active">학습모드</button><button data-first-mode="exam">실전모드</button></div><div class="si-exam-strip">
        <b>${s.questions}문항</b><span>${s.minutes}분</span><span>${s.subjects.length}과목</span><span>${esc(s.pass)}</span>
        <a class="si-cbt-link" href="exam.html?exam=${encodeURIComponent('산업안전지도사 2026-03-28')}">2026 CBT 풀기</a>
      </div>
      <div id="si-first-study-toolbar" class="si-toolbar">
        <input id="si-f1-search" class="si-input" placeholder="중복기출 검색">
        <select id="si-f1-subject" class="si-select"><option value="">전체 과목</option>${s.subjects.map(x=>`<option>${esc(x)}</option>`).join('')}</select>
        <span id="si-f1-count" class="si-count"></span>
      </div>
      <div id="si-f1-list" class="si-list"></div>
      <button id="si-f1-more" class="si-more" type="button">더 보기</button>
      <div id="si-first-exam" class="si-source-grid" hidden>${[2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026].map(y=>`<article class="si-source-card"><div class="si-source-card-top"><span class="si-badge year">${y}</span><span class="si-badge past">실전 CBT</span></div><h3>${y}년 산업안전지도사 1차</h3><p class="si-note">실제 회차 문제를 시간 제한과 함께 풀고 채점합니다.</p><div class="si-actions"><a class="si-law-link" href="exam.html?exam=${encodeURIComponent(`산업안전지도사 ${y}-${y===2020?'07-25':y===2017?'03-25':y===2018?'03-24':y===2019?'03-30':y===2021?'03-13':y===2022?'03-19':y===2023?'04-01':y===2024?'03-30':y===2025?'03-29':y===2026?'03-28':y===2013?'04-20':y===2014?'04-12':y===2015?'04-18':'04-09'}`)}">실전 시작</a></div></article>`).join('')}</div>`;
    p.querySelectorAll('[data-first-mode]').forEach(b=>b.addEventListener('click',()=>{firstMode=b.dataset.firstMode;p.querySelectorAll('[data-first-mode]').forEach(x=>x.classList.toggle('active',x===b));paintFirst()}));
    $('si-f1-search').addEventListener('input',()=>{firstLimit=24;paintFirst()});
    $('si-f1-subject').addEventListener('change',()=>{firstLimit=24;paintFirst()});
    $('si-f1-more').addEventListener('click',()=>{firstLimit+=24;paintFirst()});
    paintFirst();
  }

  function paintFirst(){
    const exam=$('si-first-exam'), toolbar=$('si-first-study-toolbar'), list=$('si-f1-list'), more=$('si-f1-more');
    const isExam=firstMode==='exam'; exam.hidden=!isExam; toolbar.hidden=isExam; list.hidden=isExam; more.hidden=isExam;
    if(isExam)return;
    const q=$('si-f1-search').value.trim().toLowerCase(), sub=$('si-f1-subject').value;
    const arr=data.first.repeats.filter(x=>(!sub||x.subject===sub)&&(!q||`${x.topic} ${x.question} ${(x.choices||[]).join(' ')}`.toLowerCase().includes(q)));
    $('si-f1-count').textContent=`2회 이상 ${arr.length}개`;
    list.innerHTML=arr.slice(0,firstLimit).map(firstCard).join('')||empty('검색 결과가 없습니다.');
    more.hidden=arr.length<=firstLimit; bindCommon(list);
  }

  function firstCard(x){
    const choices=(x.choices||[]).map((c,i)=>`<li class="${i+1===x.answer?'is-answer':''}"><span>${i+1}</span>${esc(c)}</li>`).join('');
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div><span class="si-badge hot">${x.frequency}회</span><span class="si-badge">${esc(x.subject)}</span><span class="si-years">${x.years.join(' · ')}</span></div>${star('f:'+x.id)}</div>
      <h3>${esc(x.question)}</h3>
      <ol class="si-choices">${choices}</ol>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="정답·해설">${firstMode==='study'?'해설 접기':'정답·해설'}</button></div>
      <div class="si-answer-box" ${firstMode==='study'?'':'hidden'}><b>정답 ${x.answer}번</b><p>${esc(x.answerText||'')}</p><div class="si-explain"><strong>해설</strong><p>${esc(x.explanation||'')}</p></div></div>
      ${officialLinks(x,'1차')}
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
      view.hidden=true; lib.hidden=false; paintSourceLibrary('si-source-library','si-src2'); return;
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
    const origin=x.origin==='복원'?'복원':(past?'기출':'신출');
    const label=past?`<span class="si-badge ${origin==='복원'?'variant':'past'}">${origin}</span><span class="si-badge year">${esc(x.year)}</span><span class="si-badge">${esc(x.category||'기계안전')}</span>`:`<span class="si-badge new">신출</span>${x.grade?`<span class="si-badge hot">${esc(x.grade)}</span>`:''}${x.base?`<span class="si-badge">${esc(x.base)}</span>`:''}`;
    return `<article class="si-card si-question-card">
      <div class="si-card-top"><div>${label}</div>${star(key)}</div>
      <h3>${esc(x.question)}</h3>
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="모범답안">답안 접기</button></div>
      <div class="si-answer-box"><b>모범답안</b><p>${esc(x.answer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}${x.note?`<p class="si-note">${esc(x.note)}</p>`:''}</div>
      ${secondEvidence(x)}
    </article>`;
  }

  function secondEvidence(x){
    const evidence=(x.evidence||[]).filter(e=>{
      const text=`${e.title||''} ${e.location||''}`;
      const url=String(e.url||'');
      const official=/law\.go\.kr|kosha\.or\.kr/i.test(url);
      const weak=/(욕조곡선 그래프|S-N곡선|해당 펌프에서 발생|연삭숫돌 표기내용|blog\.naver|youtube)/i.test(text);
      const exact=Boolean(String(e.location||'').trim()&&String(e.excerpt||'').trim()&&(e.highlightLines||[]).length);
      const genericKosha=/^https:\/\/smartsearch\.kosha\.or\.kr\/?$/i.test(url.trim());
      return official&&!weak&&exact&&!genericKosha;
    });
    if(!evidence.length)return '';
    return `<div class="si-evidence-wrap">
      <button type="button" class="si-evidence-toggle" data-evidence data-count="${evidence.length}">관련 조항 · 근거 ${evidence.length}개 보기</button>
      <div class="si-evidence-box" hidden>${evidence.map(e=>`<section class="si-evidence-item">
        <div class="si-evidence-head"><span>${esc(e.type||'근거')}</span><strong>${esc(e.title||'관련 원문')}</strong></div>
        ${e.location?`<div class="si-evidence-location">${esc(e.location)}</div>`:''}
        ${e.excerpt?`<div class="si-evidence-text">${evidenceExcerpt(e)}</div>`:''}
        ${e.url?`<a class="si-law-link" href="${attr(e.url)}" target="_blank" rel="noopener">해당 위치 원문 열기</a>`:''}
      </section>`).join('')}</div>
    </div>`;
  }

  function evidenceExcerpt(e){
    const norm=v=>String(v||'').replace(/\s+/g,' ').trim();
    const hits=(e.highlightLines||[]).map(norm).filter(Boolean);
    return String(e.excerpt||'').split(/\n+/).map(v=>v.trim()).filter(Boolean).map(line=>{
      const n=norm(line);
      const isHit=hits.some(h=>n===h||n.includes(h)||h.includes(n));
      const tag=isHit?'mark':'span';
      const cls=tag==='mark'?' class="si-evidence-hit"':'';
      return `<${tag}${cls}>${esc(line)}</${tag}>`;
    }).join('');
  }

  function paintSourceLibrary(hostId,prefix){
    const p=$(hostId); if(!p)return;
    const qId=prefix+'-query', btnId=prefix+'-btn', resultId=prefix+'-results';
    if(!p.dataset.ready){
      p.innerHTML=`
        <div class="si-source-searchbar"><input id="${qId}" class="si-input" placeholder="전체 원문 검색: 예) 밀폐공간, 위험성평가, 안전검사, 컨베이어"><button id="${btnId}" class="si-answer-btn" type="button">전체 원문 검색</button></div>
        <div id="${resultId}" class="si-source-results" hidden></div>
        <div class="si-source-list">${data.sources.map(sourceLibraryLine).join('')}</div>`;
      p.dataset.ready='1';
      $(btnId).addEventListener('click',async()=>{const q=$(qId).value.trim();if(q)await showSource($(resultId),q,false)});
      $(qId).addEventListener('keydown',async e=>{if(e.key==='Enter'){e.preventDefault();const q=e.currentTarget.value.trim();if(q)await showSource($(resultId),q,false)}});
    }
  }

  function sourceLibraryLine(s){
    const h=s.hits||{}, linked=(h.total||0)>0;
    return `<div class="si-source-line"><div class="si-source-line-main"><div><span class="si-badge">${esc(s.type)}</span>${linked?`<span class="si-badge past">기출연계 ${h.total}</span>`:''}</div><strong>${esc(s.title)}</strong>${s.focus?`<small>${esc(s.focus)}</small>`:''}</div><a class="si-law-link" href="${attr(s.url)}" target="_blank" rel="noopener">원문 열기</a></div>`;
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
        <button data-third="sources">법·고시·지침·GUIDE</button>
      </div>
      <div id="si-third-list-view">
        <div class="si-toolbar"><input id="si-f3-search" class="si-input" placeholder="면접 질문 검색"><span id="si-f3-count" class="si-count"></span></div>
        <div id="si-f3-list" class="si-list"></div><button id="si-f3-more" class="si-more" type="button">더 보기</button>
      </div>
      <div id="si-third-random" hidden></div>
      <div id="si-third-live" hidden></div>
      <div id="si-third-source-library" hidden></div>`;
    p.querySelectorAll('[data-third]').forEach(b=>b.addEventListener('click',()=>{
      thirdMode=b.dataset.third; thirdLimit=24;
      p.querySelectorAll('[data-third]').forEach(x=>x.classList.toggle('active',x===b)); paintThird();
    }));
    $('si-f3-search').addEventListener('input',()=>{thirdLimit=24;paintThird()});
    $('si-f3-more').addEventListener('click',()=>{thirdLimit+=24;paintThird()});
    paintThird();
  }

  function paintThird(){
    const listView=$('si-third-list-view'), random=$('si-third-random'), live=$('si-third-live'), sources=$('si-third-source-library');
    listView.hidden=true; random.hidden=true; live.hidden=true; sources.hidden=true; stopTimer();
    if(thirdMode==='random'){random.hidden=false;paintRandom();return}
    if(thirdMode==='live'){live.hidden=false;paintLive();return}
    if(thirdMode==='sources'){sources.hidden=false;paintSourceLibrary('si-third-source-library','si-src3');return}
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
      <div class="si-actions"><button type="button" class="si-answer-btn" data-reveal data-label="모범답변">답변 접기</button></div>
      <div class="si-answer-box"><b>모범답변</b><p>${esc(x.modelAnswer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}</div>
      ${officialLinks(x,'3차')}
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
      <div class="si-actions"><button id="si-timer-start" class="si-answer-btn">90초 시작</button><button id="si-speak" class="si-ghost-btn">질문 읽기</button><button id="si-random-reveal" class="si-source-btn">답변 접기/펼치기</button><button id="si-random-next" class="si-ghost-btn">다음</button></div>
      <div id="si-random-key" class="si-answer-box"><b>모범답변</b><p>${esc(x.modelAnswer||'')}</p>${x.mnemonic?`<div class="si-mnemonic"><strong>암기</strong> ${esc(x.mnemonic)}</div>`:''}${officialLinks(x,'3차')}</div>
    </div>`;
    $('si-timer-start').addEventListener('click',()=>startTimer(90));
    $('si-speak').addEventListener('click',()=>speak(x.question));
    $('si-random-reveal').addEventListener('click',()=>{$('si-random-key').hidden=!$('si-random-key').hidden;stopTimer()});
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
    $('si-live-law').innerHTML=loading('국가법령정보센터 공식자료 확인 중…');
    $('si-live-news').innerHTML=loading('고용노동부·안전뉴스 확인 중…');
    $('si-live-expected').innerHTML=loading('공식 개정사항 기반 질문 정리 중…');
    try{
      const ctrl=new AbortController(), timer=setTimeout(()=>ctrl.abort(),7500);
      const r=await fetch('/api/safety-instructor/updates?refresh=1&t='+Date.now(),{cache:'no-store',signal:ctrl.signal});
      clearTimeout(timer);const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||'업데이트 조회 실패');
      const laws=(j.laws||[]).slice(0,20), newsItems=(j.news||[]).slice(0,10), expected=(j.questions||[]).slice(0,16);
      $('si-live-law').dataset.loaded='1';
      $('si-live-law').innerHTML=laws.length?laws.map(liveLawCard).join(''):empty('최근 확인된 공식 개정자료가 없습니다.');
      $('si-live-news').innerHTML=newsItems.length?newsItems.map(liveNewsCard).join(''):empty('최근 확인된 안전뉴스가 없습니다.');
      $('si-live-expected').innerHTML=expected.length?expected.map((x,i)=>liveExpectedCard(x,i)).join(''):empty('최근 개정사항에서 추가된 질문이 없습니다.');
      bindLiveExpected(expected);
      const when=j.checkedAt||new Date().toISOString();
      $('si-live-time').textContent=(j.degraded?'공식자료 대체경로 확인 · ':'공식자료 확인 · ')+new Date(when).toLocaleString('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
    }catch(e){
      console.error(e);
      $('si-live-law').innerHTML=empty('공식자료 연결이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.');
      $('si-live-news').innerHTML=empty('안전뉴스 연결이 지연되고 있습니다. 잠시 후 다시 확인해 주세요.');
      $('si-live-expected').innerHTML=empty('공식 근거를 확인하지 못한 질문은 표시하지 않습니다.');
    }finally{if(btn){btn.disabled=false;btn.textContent='새로고침'}}
  }

  function liveLawCard(x){
    const meta=[x.status,x.effectiveDate,x.basis].filter(Boolean).join(' · ');
    return `<article class="si-live-row"><div><span>${esc(meta||x.source||'국가법령정보센터')}</span><b>${esc(x.title)}</b><p>${esc((x.summary||x.content||'').slice(0,420))}</p></div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</article>`;
  }
  function liveNewsCard(x){return `<article class="si-live-row"><div><span>${esc([x.source,x.pubDate||x.date].filter(Boolean).join(' · ')||'공식 안전뉴스')}</span><b>${esc(x.title)}</b>${x.summary?`<p>${esc(x.summary)}</p>`:''}</div>${x.link?`<a href="${attr(x.link)}" target="_blank" rel="noopener">원문</a>`:''}</article>`}
  function liveExpectedCard(x,i){
    return `<article class="si-live-q"><span class="si-badge variant">공식 개정</span><h4>${esc(x.question)}</h4><div class="si-actions"><button class="si-answer-btn" data-live-answer-toggle="${i}">모범답변 접기</button>${x.link?`<a class="si-source-btn" href="${attr(x.link)}" target="_blank" rel="noopener">근거 원문</a>`:''}</div><div class="si-ai-answer" data-live-answer="${i}"><b>모범답변</b><p>${esc(x.answer||'')}</p>${x.basis?`<small>${esc(x.basis)}</small>`:''}</div></article>`;
  }
  function bindLiveExpected(expected){
    root.querySelectorAll('[data-live-answer-toggle]').forEach(b=>b.addEventListener('click',()=>{
      const i=Number(b.dataset.liveAnswerToggle),out=root.querySelector(`[data-live-answer="${i}"]`);if(!out)return;out.hidden=!out.hidden;b.textContent=out.hidden?'모범답변 펼치기':'모범답변 접기';
    }));
  }

  /* ================= sources/common ================= */
  function officialLinks(x,context){
    const links=x.officialLinks||[]; if(!links.length)return '';
    const s=links[0];
    return `<div class="si-official-links"><span class="si-official-label">관련 조항</span><a href="${attr(s.url)}" target="_blank" rel="noopener" title="${attr(s.focus||'')}"><span>${esc(s.type||'법령')}</span>${esc(s.title||'원문 바로가기')}</a></div>`;
  }

  function bindCommon(scope){
    scope.querySelectorAll('[data-reveal]').forEach(b=>b.addEventListener('click',()=>{
      const box=b.closest('.si-question-card,.si-random-card')?.querySelector('.si-answer-box'); if(!box)return;
      box.hidden=!box.hidden; const label=b.dataset.label||'답'; b.textContent=box.hidden?label:'접기';
    }));
    scope.querySelectorAll('[data-evidence]').forEach(b=>b.addEventListener('click',()=>{
      const box=b.closest('.si-evidence-wrap')?.querySelector('.si-evidence-box'); if(!box)return;
      box.hidden=!box.hidden; const n=b.dataset.count||'1'; b.textContent=box.hidden?`관련 조항 · 근거 ${n}개 보기`:'관련 조항 · 근거 접기';
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
    const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),6500);
    try{
      const r=await fetch(`/api/safety-law/search?q=${encodeURIComponent(q||'')}&limit=${limit}`,{cache:'no-store',signal:ctrl.signal});
      const j=await r.json().catch(()=>({}));if(!r.ok||!j.ok)throw new Error(j.error||'검색 실패');
      return [...(j.law||[]),...(j.guide||[])];
    }catch(e){throw e?.name==='AbortError'?new Error('공식자료 검색 시간이 초과되었습니다.'):e}
    finally{clearTimeout(timer)}
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

  function star(k){return `<button class="si-star ${mastered[k]?'on':''}" data-master="${attr(k)}" title="외움 체크">${mastered[k]?'★':'☆'}</button>`}
  function startTimer(sec){stopTimer();timerLeft=sec;updateTimer();timerId=setInterval(()=>{timerLeft--;updateTimer();if(timerLeft<=0)stopTimer()},1000)}
  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null}}
  function updateTimer(){const e=$('si-timer');if(e)e.textContent=`${String(Math.floor(Math.max(0,timerLeft)/60)).padStart(2,'0')}:${String(Math.max(0,timerLeft)%60).padStart(2,'0')}`}
  function speak(t){if(!('speechSynthesis' in window))return;window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(t);u.lang='ko-KR';u.rate=.95;window.speechSynthesis.speak(u)}
  function empty(t){return `<div class="si-empty">${esc(t)}</div>`}
  function loading(t){return `<div class="si-loading">${esc(t)}</div>`}
  function $(id){return document.getElementById(id)}
  function esc(v){return String(v??'').replace(/\*\*/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function attr(v){return esc(v).replace(/`/g,'&#96;')}
  function loadJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'null')||f}catch(e){return f}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
})();
