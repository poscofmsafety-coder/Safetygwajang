/* 산업안전지도사 기계안전 학습실
 * - 중복기출 잠금영역 내부에만 노출
 * - 2025~2019 사용자 제공 기출/면접 메모 141문항
 * - 2·3차 대비 주제 재구성, KOSHA 공식 근거 검색, 랜덤 구술연습
 */
(function(){
  'use strict';
  const DATA_URL='data/safety-instructor-study.json';
  const UNLOCK_KEY='dup-access-ok';
  const MASTER_KEY='si-mastered-v1';
  const GRADE_KEY='si-random-grades-v1';
  let data=null, root=null, currentTab='roadmap', randomPool='all', randomItem=null, timerId=null, timerLeft=0, voiceRec=null;
  const mastered=loadJson(MASTER_KEY,{}), grades=loadJson(GRADE_KEY,{good:0,maybe:0,again:0});

  document.addEventListener('DOMContentLoaded',()=>waitForPanel());
  window.addEventListener('dup-unlocked',()=>showHub());

  function waitForPanel(){
    let tries=0;
    const t=setInterval(()=>{
      tries++;
      const panel=document.getElementById('panel-dup');
      if(panel){ clearInterval(t); mount(panel); }
      if(tries>80) clearInterval(t);
    },100);
  }

  async function mount(panel){
    if(document.getElementById('safety-instructor-hub')) return;
    root=document.createElement('section');
    root.id='safety-instructor-hub';
    root.hidden=sessionStorage.getItem(UNLOCK_KEY)!=='1';
    root.innerHTML='<div class="si-empty">산업안전지도사 학습자료를 불러오는 중입니다.</div>';
    panel.appendChild(root);
    try{
      const r=await fetch(DATA_URL,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      data=await r.json();
      renderShell();
    }catch(e){
      root.innerHTML='<div class="si-empty">학습자료를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</div>';
      console.error(e);
    }
  }

  function showHub(){ if(root) root.hidden=false; }

  function renderShell(){
    const total=(data.writtenQuestions||[]).length+(data.interviewQuestions||[]).length+(data.part2Extra||[]).length;
    const done=Object.keys(mastered).filter(k=>mastered[k]).length;
    const pct=total?Math.round(done/total*100):0;
    root.innerHTML=`
      <div class="si-shell">
        <section class="si-hero">
          <span class="si-kicker">🦺 산업안전지도사 · 기계안전</span>
          <h2>기출 → 근거 → 암기 → 말하기까지 한 화면에서</h2>
          <p>상업 교재의 문장과 모범답안은 전재하지 않고, 사용자가 제공한 기출 메모와 공개 법령·고시·KOSHA GUIDE를 기준으로 학습 구조를 다시 만들었습니다. 숫자·대상·예외는 아래 <b>공식 근거 찾기</b>로 최신 기준을 확인하면서 외우는 방식입니다.</p>
          <div class="si-hero-actions">
            <button class="si-btn primary" data-go="written">2025~2019 기출 141문항</button>
            <button class="si-btn dark" data-go="random">3차 랜덤 면접 연습</button>
            <button class="si-btn" data-go="evidence">법령·고시·KOSHA 검색</button>
          </div>
          <div class="si-progress-wrap">
            <div class="si-progress-card"><span>사용자 제공 기출</span><b>${data.writtenQuestions.length}문항</b></div>
            <div class="si-progress-card"><span>3차 면접 주제</span><b>${data.interviewQuestions.length}개</b></div>
            <div class="si-progress-card"><span>내 암기 완료</span><b id="si-done-count">${done}개</b></div>
            <div class="si-progress-card"><span>전체 진도</span><b id="si-progress-pct">${pct}%</b></div>
          </div>
        </section>
        <nav class="si-tabs" aria-label="산업안전지도사 학습 메뉴">
          ${tabBtn('roadmap','🧭 합격 로드맵')}
          ${tabBtn('written','📝 기출 141')}
          ${tabBtn('interview','🎤 3차 전체 문답')}
          ${tabBtn('random','🎲 랜덤 면접')}
          ${tabBtn('evidence','⚖️ 법·고시·KOSHA')}
          ${tabBtn('stats','📊 사고·통계')}
        </nav>
        <div id="si-panel-roadmap" class="si-panel active"></div>
        <div id="si-panel-written" class="si-panel"></div>
        <div id="si-panel-interview" class="si-panel"></div>
        <div id="si-panel-random" class="si-panel"></div>
        <div id="si-panel-evidence" class="si-panel"></div>
        <div id="si-panel-stats" class="si-panel"></div>
        <div class="si-disclaimer"><b>학습 원칙</b> · 교재는 출제범위와 학습 흐름을 파악하는 내부 참고자료로만 사용했습니다. 사이트 답변은 독립적으로 재작성했습니다. 법령 개정이 잦은 수치·대상·주기는 KOSHA 스마트검색과 국가법령정보센터 원문을 최종 기준으로 확인하세요.</div>
      </div>`;
    bindTabs();
    renderRoadmap(); renderQuestionPanel('written'); renderQuestionPanel('interview'); renderRandom(); renderEvidence(); renderStats();
  }

  function tabBtn(key,label){ return `<button type="button" class="si-tab ${key==='roadmap'?'active':''}" data-si-tab="${key}">${label}</button>`; }
  function bindTabs(){
    root.querySelectorAll('[data-si-tab]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.siTab)));
    root.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>activate(b.dataset.go)));
  }
  function activate(key){
    currentTab=key;
    root.querySelectorAll('.si-tab').forEach(x=>x.classList.toggle('active',x.dataset.siTab===key));
    root.querySelectorAll('.si-panel').forEach(x=>x.classList.toggle('active',x.id===`si-panel-${key}`));
    const target=document.getElementById(`si-panel-${key}`);
    if(target) target.scrollIntoView({behavior:'smooth',block:'nearest'});
  }

  function renderRoadmap(){
    const p=document.getElementById('si-panel-roadmap');
    const road=(data.roadmap||[]).map(r=>`<article class="si-card"><div class="si-road-step"><strong>${esc(r.step)}</strong><em>${esc(r.title)}</em></div><h3>${esc(r.focus)}</h3><div class="si-checklist">${r.items.map(x=>`<div class="si-check">✓ ${esc(x)}</div>`).join('')}</div></article>`).join('');
    const refs=(data.references||[]).map(x=>`<a href="${attr(x.url)}" target="_blank" rel="noopener">${esc(x.label)}</a>`).join('');
    p.innerHTML=`<div class="si-grid">${road}</div>
      <div class="si-card" style="margin-top:12px"><h3>📌 제가 추천하는 회독 순서</h3><p><b>1회독:</b> 기출 질문만 보고 아는 만큼 말하기 → <b>2회독:</b> 핵심답변 뼈대 확인 → <b>3회독:</b> KOSHA 공식 근거에서 숫자·예외 체크 → <b>4회독:</b> 랜덤 면접에서 60~90초 내 말하기 → <b>마지막:</b> 모르는 문항만 다시 돌리기.</p><div class="si-source-links" style="margin-top:10px">${refs}</div></div>
      <div class="si-card" style="margin-top:12px"><h3>🧠 3차 답변 공식</h3><p><b>결론 1문장 → 핵심항목 3~5개 → 법령/고시/KOSHA 근거 → 현장 예방 포인트 → “이상입니다.”</b> 순으로 연습하세요. 면접 후기 자료에서도 짧은 시간에 질문 요지부터 말하고 법령·기준규칙·고시·KOSHA GUIDE의 조건을 정확히 붙이는 연습이 반복적으로 강조됩니다.</p></div>`;
  }

  function panelItems(kind){
    if(kind==='written') return data.writtenQuestions;
    if(kind==='extra') return data.part2Extra||[];
    return data.interviewQuestions;
  }
  function renderQuestionPanel(kind){
    const p=document.getElementById(`si-panel-${kind}`);
    const title=kind==='written'?'2025~2019 기출·복원 141문항':'3차 면접 전체 문답 연습';
    const desc=kind==='written'?'사용자가 제공한 문제를 연도·분야별로 분류했습니다. 같은 주제가 반복되면 빈출 표시처럼 활용하세요.':'상업 교재의 답안을 복제하지 않고, 출제범위의 주제를 질문형으로 다시 구성했습니다. 각 문항은 핵심답변 뼈대 + 공식 근거 검색으로 학습합니다.';
    const cats=[...new Set(panelItems(kind).map(x=>x.category))].sort();
    const years=kind==='written'?[...new Set(panelItems(kind).map(x=>x.year))].sort((a,b)=>b-a):[];
    const extraHtml=kind==='written'&&data.part2Extra?.length?`<div class="si-card" style="margin-bottom:11px"><h3>📌 추가 복원 · 2부 3문항</h3><p>사용자가 별도로 기억한 2부 문항입니다. 세부 문구가 불확실한 부분은 KOSHA 공식 근거 검색으로 확인하도록 구성했습니다.</p><div class="si-question-list" id="si-list-extra" style="margin-top:10px">${data.part2Extra.map(x=>questionCard(x,'extra')).join('')}</div></div>`:'';
    p.innerHTML=`<div class="si-card" style="margin-bottom:11px"><h3>${title}</h3><p>${desc}</p></div>${extraHtml}
      <div class="si-filterbar"><input class="si-search" id="si-search-${kind}" placeholder="질문·키워드 검색"><select class="si-select" id="si-cat-${kind}"><option value="">전체 분야</option>${cats.map(c=>`<option>${esc(c)}</option>`).join('')}</select>${kind==='written'?`<select class="si-select" id="si-year-${kind}"><option value="">전체 연도</option>${years.map(y=>`<option value="${y}">${y}년</option>`).join('')}</select>`:''}<span class="si-count" id="si-count-${kind}"></span></div><div class="si-question-list" id="si-list-${kind}"></div>`;
    if(kind==='written'){const ex=document.getElementById('si-list-extra');if(ex)bindQuestionActions(ex,'extra');}
    const rerender=()=>paintQuestions(kind);
    p.querySelector(`#si-search-${kind}`).addEventListener('input',rerender);
    p.querySelector(`#si-cat-${kind}`).addEventListener('change',rerender);
    if(kind==='written') p.querySelector(`#si-year-${kind}`).addEventListener('change',rerender);
    paintQuestions(kind);
  }

  function paintQuestions(kind){
    const items=panelItems(kind);
    const q=(document.getElementById(`si-search-${kind}`)?.value||'').trim().toLowerCase();
    const cat=document.getElementById(`si-cat-${kind}`)?.value||'';
    const yr=document.getElementById(`si-year-${kind}`)?.value||'';
    const filtered=items.filter(x=>(!q||(`${x.question} ${x.category} ${(x.keywords||[]).join(' ')}`).toLowerCase().includes(q))&&(!cat||x.category===cat)&&(!yr||String(x.year)===yr));
    document.getElementById(`si-count-${kind}`).textContent=`${filtered.length}개`;
    const list=document.getElementById(`si-list-${kind}`);
    list.innerHTML=filtered.length?filtered.map((x,i)=>questionCard(x,kind)).join(''):'<div class="si-empty">조건에 맞는 질문이 없습니다.</div>';
    bindQuestionActions(list,kind);
  }

  function questionCard(x,kind){
    const key=`${kind}:${x.id}`; const on=!!mastered[key];
    const num=kind==='written'?`${x.year} · ${x.no}번`:(kind==='extra'?'2부 복원':`면접 ${x.topicNo||x.id}`);
    return `<article class="si-q" data-id="${attr(x.id)}" data-kind="${kind}">
      <div class="si-q-head"><span class="si-q-no">${esc(num)}</span><div><div class="si-q-title">${esc(x.question)}</div><div class="si-q-meta"><span class="si-pill">${esc(x.category)}</span>${x.year?`<span class="si-pill year">${x.year}년</span>`:''}<span class="si-pill source">근거검색: ${esc(x.sourceQuery||'')}</span></div></div><button class="si-master ${on?'on':''}" title="암기 완료" aria-label="암기 완료" data-master>${on?'⭐':'☆'}</button></div>
      <div class="si-q-actions"><button class="si-mini-btn" data-answer>핵심답변 보기</button><button class="si-mini-btn" data-evidence>공식 근거 찾기</button><button class="si-mini-btn" data-ai>AI 최신 답변</button><button class="si-mini-btn" data-speak>질문 읽기</button></div>
      <div class="si-answer"><h4>암기용 답변 뼈대 <button class="si-mini-btn si-copy" data-copy>복사</button></h4><p>${esc(x.answer)}</p><div class="si-keywords">${(x.keywords||[]).map(k=>`<span>${esc(k)}</span>`).join('')}</div>${x.note?`<div class="si-note">${esc(x.note)}</div>`:''}<div class="si-evidence"></div><div class="si-ai-out" hidden></div></div>
    </article>`;
  }

  function bindQuestionActions(list,kind){
    list.querySelectorAll('.si-q').forEach(card=>{
      const x=panelItems(kind).find(v=>String(v.id)===card.dataset.id); if(!x) return;
      const ans=card.querySelector('.si-answer');
      card.querySelector('[data-answer]')?.addEventListener('click',()=>ans.classList.toggle('open'));
      card.querySelector('[data-master]')?.addEventListener('click',e=>toggleMaster(`${kind}:${x.id}`,e.currentTarget));
      card.querySelector('[data-evidence]')?.addEventListener('click',async()=>{ans.classList.add('open'); await loadEvidence(x,card.querySelector('.si-evidence'));});
      card.querySelector('[data-ai]')?.addEventListener('click',async e=>{ans.classList.add('open'); await generateAiAnswer(x,card.querySelector('.si-ai-out'),e.currentTarget);});
      card.querySelector('[data-speak]')?.addEventListener('click',()=>speak(x.question));
      card.querySelector('[data-copy]')?.addEventListener('click',()=>copyText(x.answer));
    });
  }

  function toggleMaster(key,btn){
    mastered[key]=!mastered[key]; saveJson(MASTER_KEY,mastered); btn.classList.toggle('on',mastered[key]); btn.textContent=mastered[key]?'⭐':'☆'; updateProgress();
  }
  function updateProgress(){
    const total=data.writtenQuestions.length+data.interviewQuestions.length+data.part2Extra.length;
    const done=Object.keys(mastered).filter(k=>mastered[k]).length;
    const a=document.getElementById('si-done-count'),b=document.getElementById('si-progress-pct'); if(a)a.textContent=`${done}개`; if(b)b.textContent=`${Math.round(done/total*100)}%`;
  }

  async function loadEvidence(x,box){
    box.classList.add('show'); box.innerHTML='<div class="si-empty">KOSHA 공식 검색 중...</div>';
    try{
      const q=encodeURIComponent(x.sourceQuery||x.question);
      const r=await fetch(`/api/safety-law/search?q=${q}&limit=16`);
      const j=await r.json();
      if(!j.ok) throw new Error(j.error||'검색 실패');
      const all=[...(j.law||[]),...(j.guide||[]),...(j.media||[])].slice(0,10);
      box.innerHTML=all.length?all.map(e=>`<div class="si-evidence-card"><b>${esc(e.title||e.categoryName)} <span class="si-source-badge">${esc(e.categoryName||e.source||'')}</span></b><p>${esc((e.content||'').slice(0,560))}</p>${e.link?`<a href="${attr(e.link)}" target="_blank" rel="noopener">공식 원문/검색 열기 →</a>`:''}</div>`).join(''):'<div class="si-empty">검색 결과가 없습니다. 검색어를 줄여 다시 확인해 주세요.</div>';
      return all;
    }catch(e){box.innerHTML=`<div class="si-note">공식 검색 연결이 지연되고 있습니다. ${esc(e.message||'')}</div>`;return[];}
  }

  async function generateAiAnswer(x,out,btn){
    if(btn) {btn.disabled=true;btn.textContent='답변 만드는 중...';}
    out.hidden=false;out.textContent='최신 법령·KOSHA 근거를 확인해 답변을 정리하고 있습니다.';
    let evidence=[];
    try{
      const r=await fetch(`/api/safety-law/search?q=${encodeURIComponent(x.sourceQuery||x.question)}&limit=12`); const j=await r.json();
      evidence=[...(j.law||[]),...(j.guide||[])].slice(0,8).map(e=>({title:e.title,category:e.categoryName,content:(e.content||'').slice(0,1200)}));
    }catch(e){}
    const prompt=`산업안전지도사 기계안전 3차 면접 연습 답변을 작성하세요.\n질문: ${x.question}\n\n공식 검색 근거:\n${evidence.length?JSON.stringify(evidence,null,2):'공식 검색 결과를 불러오지 못했습니다.'}\n\n규칙:\n- 60~90초 구술 답변 분량.\n- 첫 문장은 결론부터.\n- 핵심 항목은 3~6개로 번호를 매김.\n- 검색 근거에 숫자·대상·예외가 있으면 정확히 사용하고, 근거가 없으면 숫자를 추정하지 말고 “최신 고시 확인 필요”라고 표시.\n- 상업 교재 문구를 인용하거나 흉내 내지 말 것.\n- 마지막에 [암기키워드] 5개와 [근거] 제목을 짧게 표시.\n- 자연스러운 한국어로 작성.`;
    try{
      const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'당신은 대한민국 산업안전지도사 시험 대비를 돕는 안전공학 튜터입니다. 공식 근거와 질문 범위 안에서만 정확하게 답합니다.'},{role:'user',content:prompt}],temperature:.2,max_tokens:2200})});
      const j=await r.json();
      const text=j?.choices?.[0]?.message?.content||j?.error||'AI 답변을 불러오지 못했습니다.'; out.textContent=text;
    }catch(e){out.textContent='AI 연결이 지연되고 있습니다. 핵심답변 뼈대와 공식 근거 검색을 먼저 활용해 주세요.';}
    if(btn){btn.disabled=false;btn.textContent='AI 최신 답변';}
  }

  function renderRandom(){
    const p=document.getElementById('si-panel-random');
    p.innerHTML=`<div class="si-random"><div class="si-random-status"><span>면접관 질문 → 3초 생각 → 결론부터 답하기</span><span class="si-timer" id="si-timer">00:00</span></div>
      <div class="si-filterbar"><select class="si-select" id="si-random-pool"><option value="all">전체 문제</option><option value="written">기출 141</option><option value="interview">3차 주제</option><option value="law">법령·제도/위험성평가</option><option value="machine">기계안전 기술</option></select><button class="si-btn primary" id="si-next-random">새 질문</button><button class="si-btn" id="si-read-random">🔊 읽기</button><button class="si-btn" id="si-voice-answer">🎙 음성답변</button><button class="si-btn" id="si-start-timer">⏱ 90초 시작</button></div>
      <div class="si-random-question" id="si-random-question">새 질문을 눌러 면접 연습을 시작하세요.</div>
      <textarea class="si-self-answer" id="si-self-answer" placeholder="말로 먼저 답한 뒤, 필요하면 핵심 키워드를 메모하세요."></textarea>
      <div class="si-random-tools"><button class="si-btn dark" id="si-show-random">모범답변 확인</button><button class="si-btn" id="si-evidence-random">공식 근거</button><button class="si-btn" id="si-ai-random">AI 최신 답변</button><button class="si-btn primary" id="si-eval-random">내 답변 AI 채점</button></div>
      <div class="si-answer-box" id="si-random-answer"><h4>답변 확인</h4><p id="si-random-answer-text"></p><div class="si-keywords" id="si-random-keywords"></div><div class="si-evidence" id="si-random-evidence"></div><div class="si-ai-out" id="si-random-ai" hidden></div></div>
      <div class="si-grade-row"><button class="si-btn good" data-grade="good">✅ 바로 답함 <span id="g-good">${grades.good||0}</span></button><button class="si-btn warn" data-grade="maybe">△ 일부 기억 <span id="g-maybe">${grades.maybe||0}</span></button><button class="si-btn" data-grade="again">↻ 다시 봐야 함 <span id="g-again">${grades.again||0}</span></button></div></div>`;
    document.getElementById('si-random-pool').addEventListener('change',e=>{randomPool=e.target.value;nextRandom();});
    document.getElementById('si-next-random').addEventListener('click',nextRandom);
    document.getElementById('si-read-random').addEventListener('click',()=>randomItem&&speak(randomItem.question));
    document.getElementById('si-voice-answer').addEventListener('click',startVoiceAnswer);
    document.getElementById('si-start-timer').addEventListener('click',()=>startTimer(90));
    document.getElementById('si-show-random').addEventListener('click',showRandomAnswer);
    document.getElementById('si-evidence-random').addEventListener('click',async()=>{if(!randomItem)return;showRandomAnswer();await loadEvidence(randomItem,document.getElementById('si-random-evidence'));});
    document.getElementById('si-ai-random').addEventListener('click',async e=>{if(!randomItem)return;showRandomAnswer();await generateAiAnswer(randomItem,document.getElementById('si-random-ai'),e.currentTarget);});
    document.getElementById('si-eval-random').addEventListener('click',async e=>evaluateRandom(e.currentTarget));
    p.querySelectorAll('[data-grade]').forEach(b=>b.addEventListener('click',()=>gradeRandom(b.dataset.grade)));
    nextRandom();
  }
  function randomCandidates(){
    let arr=[...data.writtenQuestions,...data.interviewQuestions,...data.part2Extra];
    if(randomPool==='written')arr=data.writtenQuestions;
    if(randomPool==='interview')arr=data.interviewQuestions;
    if(randomPool==='law')arr=arr.filter(x=>['법령·제도','위험성평가','인증·검사·계획서'].includes(x.category));
    if(randomPool==='machine')arr=arr.filter(x=>!['법령·제도','위험성평가'].includes(x.category));
    return arr;
  }
  function nextRandom(){
    const arr=randomCandidates(); if(!arr.length)return; let next=arr[Math.floor(Math.random()*arr.length)]; if(randomItem&&arr.length>1&&next.question===randomItem.question)next=arr[(arr.indexOf(next)+1)%arr.length]; randomItem=next;
    document.getElementById('si-random-question').textContent=next.question; document.getElementById('si-self-answer').value='';
    document.getElementById('si-random-answer').classList.remove('show'); document.getElementById('si-random-answer-text').textContent=''; document.getElementById('si-random-keywords').innerHTML=''; document.getElementById('si-random-evidence').classList.remove('show'); document.getElementById('si-random-evidence').innerHTML=''; document.getElementById('si-random-ai').hidden=true; document.getElementById('si-random-ai').textContent='';
    stopTimer(); document.getElementById('si-timer').textContent='00:00';
  }

  function startVoiceAnswer(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
    if(!SR){alert('이 브라우저에서는 음성인식을 지원하지 않습니다. Chrome 최신 버전에서 이용해 주세요.');return;}
    const btn=document.getElementById('si-voice-answer'),ta=document.getElementById('si-self-answer');
    if(voiceRec){try{voiceRec.stop()}catch(e){};return;}
    const rec=new SR();voiceRec=rec;rec.lang='ko-KR';rec.continuous=true;rec.interimResults=true;
    let finalText=ta.value?ta.value+' ':'';
    rec.onstart=()=>{btn.textContent='⏹ 듣는 중 · 종료';btn.classList.add('primary');};
    rec.onresult=e=>{let interim='';for(let i=e.resultIndex;i<e.results.length;i++){const t=e.results[i][0].transcript;if(e.results[i].isFinal)finalText+=t+' ';else interim+=t;}ta.value=(finalText+interim).trim();};
    rec.onerror=()=>{voiceRec=null;btn.textContent='🎙 음성답변';btn.classList.remove('primary');};
    rec.onend=()=>{voiceRec=null;btn.textContent='🎙 음성답변';btn.classList.remove('primary');};
    try{rec.start()}catch(e){voiceRec=null;}
  }
  async function evaluateRandom(btn){
    if(!randomItem)return;
    const user=(document.getElementById('si-self-answer').value||'').trim();
    if(!user){alert('먼저 말하거나 답변 메모를 입력해 주세요.');return;}
    showRandomAnswer();
    const out=document.getElementById('si-random-ai');out.hidden=false;out.textContent='답변을 채점하고 있습니다.';
    btn.disabled=true;btn.textContent='AI 채점 중...';
    const prompt=`산업안전지도사 3차 면접 연습 답변을 채점하세요.
질문: ${randomItem.question}
수험자 답변: ${user}
학습용 핵심답변: ${randomItem.answer}
핵심키워드: ${(randomItem.keywords||[]).join(', ')}

출력은 다음 형식으로 짧고 구체적으로 작성하세요.
[점수] 10점 만점
[잘한 점] 2~3개
[빠진 핵심] 2~5개
[고쳐 말하면] 60초 이내의 두괄식 답변
법령 수치나 예외가 학습용 핵심답변에 없으면 임의로 만들지 말고 공식 근거 확인 필요라고 표시하세요.`;
    try{const r=await fetch('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'system',content:'대한민국 산업안전지도사 3차 면접 채점 튜터입니다. 과장하지 말고 질문에 포함된 핵심 키워드의 충족 여부를 기준으로 평가합니다.'},{role:'user',content:prompt}],temperature:.15,max_tokens:1800})});const j=await r.json();out.textContent=j?.choices?.[0]?.message?.content||j?.error||'채점 결과를 불러오지 못했습니다.';}catch(e){out.textContent='AI 채점 연결이 지연되고 있습니다.';}finally{btn.disabled=false;btn.textContent='내 답변 AI 채점';}
  }

  function showRandomAnswer(){ if(!randomItem)return; const box=document.getElementById('si-random-answer');box.classList.add('show');document.getElementById('si-random-answer-text').textContent=randomItem.answer;document.getElementById('si-random-keywords').innerHTML=(randomItem.keywords||[]).map(k=>`<span>${esc(k)}</span>`).join(''); }
  function gradeRandom(k){grades[k]=(grades[k]||0)+1;saveJson(GRADE_KEY,grades);const el=document.getElementById('g-'+k);if(el)el.textContent=grades[k];if(randomItem){const id=`random:${randomItem.id||randomItem.question}`;if(k==='good')mastered[id]=true;saveJson(MASTER_KEY,mastered);}setTimeout(nextRandom,250);}
  function startTimer(sec){stopTimer();timerLeft=sec;paintTimer();timerId=setInterval(()=>{timerLeft--;paintTimer();if(timerLeft<=0){stopTimer();}},1000)}
  function stopTimer(){if(timerId){clearInterval(timerId);timerId=null;}}
  function paintTimer(){const m=Math.floor(timerLeft/60),s=timerLeft%60;const el=document.getElementById('si-timer');if(el)el.textContent=`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;}

  function renderEvidence(){
    const p=document.getElementById('si-panel-evidence');
    p.innerHTML=`<div class="si-law-search"><h3 style="margin:0 0 7px">KOSHA 안전보건법령 스마트검색</h3><p style="margin:0 0 10px;color:#627786;font-size:.75rem;line-height:1.6">Cloudflare Secret에 등록된 기존 KOSHA API를 그대로 사용합니다. 산업안전보건법·시행령·시행규칙·기준규칙·고시·KOSHA GUIDE를 한 번에 확인합니다.</p><div class="si-law-row"><input class="si-search" id="si-law-q" value="안전검사"><button class="si-btn primary" id="si-law-go">공식 근거 검색</button></div><div class="si-law-results" id="si-law-results"></div></div>
      <div class="si-topic-grid">${data.coreTopics.map((x,i)=>`<article class="si-topic"><h3>${esc(x.title)}</h3><div class="memory">${esc(x.memory)}</div><div class="si-topic-actions"><button class="si-mini-btn" data-topic-search="${i}">근거 확인</button><button class="si-mini-btn" data-topic-random="${i}">말하기 연습</button></div></article>`).join('')}</div>`;
    const go=()=>standaloneLawSearch(document.getElementById('si-law-q').value);
    document.getElementById('si-law-go').addEventListener('click',go);document.getElementById('si-law-q').addEventListener('keydown',e=>{if(e.key==='Enter')go()});
    p.querySelectorAll('[data-topic-search]').forEach(b=>b.addEventListener('click',()=>{const t=data.coreTopics[+b.dataset.topicSearch];document.getElementById('si-law-q').value=t.query;standaloneLawSearch(t.query)}));
    p.querySelectorAll('[data-topic-random]').forEach(b=>b.addEventListener('click',()=>{const t=data.coreTopics[+b.dataset.topicRandom];randomItem={id:'topic-'+b.dataset.topicRandom,question:`${t.title}에 대해 면접답변 형식으로 설명해 보세요.`,answer:t.memory,keywords:t.memory.split('→').map(s=>s.trim()).filter(Boolean),sourceQuery:t.query,category:'핵심주제'};activate('random');document.getElementById('si-random-question').textContent=randomItem.question;showRandomAnswer();}));
  }
  async function standaloneLawSearch(q){
    const out=document.getElementById('si-law-results'); if(!q.trim())return;out.innerHTML='<div class="si-empty">검색 중...</div>';
    try{const r=await fetch(`/api/safety-law/search?q=${encodeURIComponent(q)}&limit=30`);const j=await r.json();if(!j.ok)throw new Error(j.error||'검색 실패');const groups=[['법령·고시',j.law||[]],['KOSHA GUIDE',j.guide||[]],['미디어 자료',j.media||[]]];out.innerHTML=groups.map(([name,items])=>items.length?`<div class="si-card" style="margin-top:8px"><h3>${name} · ${items.length}건</h3>${items.slice(0,12).map(e=>`<div class="si-evidence-card"><b>${esc(e.title||'자료')}</b><p>${esc((e.content||'').slice(0,600))}</p>${e.link?`<a href="${attr(e.link)}" target="_blank" rel="noopener">공식 원문/검색 →</a>`:''}</div>`).join('')}</div>`:'').join('')||'<div class="si-empty">검색 결과가 없습니다.</div>';}
    catch(e){out.innerHTML=`<div class="si-note">${esc(e.message||'공식 검색 연결이 지연되고 있습니다.')}</div>`;}
  }

  function renderStats(){
    const p=document.getElementById('si-panel-stats'); const types=data.stats?.accidentTypes2024||[];const max=Math.max(1,...types.map(x=>x.value));const cases=(data.stats?.constructionCases||[]).slice(0,12);const age=data.stats?.ageFatalities2025||[];const ageMax=Math.max(1,...age.map(x=>x.value));
    p.innerHTML=`<div class="si-grid"><div class="si-card"><h3>2024 발생형태별 사고재해자수</h3><p style="margin-bottom:10px">KOSHA 공개데이터를 합산한 학습용 요약입니다.</p><div class="si-bars">${types.map(x=>bar(x.type,x.value,max)).join('')}</div></div><div class="si-card"><h3>2025 연령별 사망자수</h3><p style="margin-bottom:10px">연령대별 위험 특성을 말할 때 통계 근거로 활용하세요.</p><div class="si-bars">${age.map(x=>bar(x.group,x.value,ageMax)).join('')}</div></div><div class="si-card"><h3>사고사례 활용법</h3><p><b>사고경위 → 직접원인 → 관리적 배경원인 → 재발방지대책 → 적용 법령/기준 → 위험성평가 반영</b> 순서로 정리하면 2·3차 서술과 실무형 면접에 동시에 도움이 됩니다.</p></div></div>
      <h3 style="margin:18px 0 9px">건설안전 사고사례 · 원인/대책 읽기</h3><div class="si-case-grid">${cases.map(c=>`<article class="si-case"><h4>${esc(c.date)} · ${esc(c.accidentType||'사고')}</h4><p>${esc(c.facility)} · ${esc(c.process)} · ${esc(c.object)}</p><p class="bad"><b>원인:</b> ${esc(c.cause||'공개자료 확인 필요')}</p><p class="good"><b>재발방지:</b> ${esc(c.prevention||'공개자료 확인 필요')}</p><p>사망 ${c.deaths||0}명 · 부상 ${c.injuries||0}명</p></article>`).join('')}</div>`;
  }
  function bar(label,val,max){return `<div class="si-bar-row"><span>${esc(label)}</span><div class="si-bar-track"><div class="si-bar-fill" style="width:${Math.max(1,Math.round(val/max*100))}%"></div></div><b>${Number(val).toLocaleString()}</b></div>`;}

  function speak(text){ if(!('speechSynthesis' in window))return alert('이 브라우저에서는 질문 읽기를 지원하지 않습니다.');window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.lang='ko-KR';u.rate=.92;window.speechSynthesis.speak(u); }
  function copyText(t){ navigator.clipboard?.writeText(t).then(()=>{}).catch(()=>{}); }
  function loadJson(k,f){try{return JSON.parse(localStorage.getItem(k)||'')||f}catch(e){return f}}
  function saveJson(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;')}
  function attr(v){return esc(v).replace(/`/g,'&#096;')}
})();
