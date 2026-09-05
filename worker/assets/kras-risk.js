(function(){
  'use strict';
  const STORAGE_KEY='sgw_kras_v1';
  const LEGACY_KEY='sgw_v5_risk-execute';
  const SOURCE_OPTIONS=['사업장 순회점검','근로자 상시 제안','설문·인터뷰 등 청취조사','MSDS·작업환경측정·건강진단 등 안전보건 자료','안전보건 체크리스트','재해·아차사고·재해통계','기타 사업장 특성에 적합한 방법'];
  const METHOD_LABELS={three:'위험성 수준 3단계 판단법',checklist:'체크리스트법',ops:'핵심요인기술법(OPS)',frequency:'빈도·강도법'};
  const LEVEL_LABELS={high:'상',medium:'중',low:'하'};
  const LEVEL_ORDER={low:1,medium:2,high:3};

  const $=s=>document.querySelector(s);
  const $$=s=>Array.from(document.querySelectorAll(s));
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v==null?'':v).trim();
  const today=()=>new Date().toISOString().slice(0,10);
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const safeParse=(raw,fb)=>{try{return JSON.parse(raw)}catch(_){return fb}};
  const fmtDate=v=>{if(!v)return '-';const d=new Date(v+'T00:00:00');return isNaN(d)?esc(v):d.toLocaleDateString('ko-KR')};
  const nl=v=>esc(v).replace(/\n/g,'<br>');

  function defaultState(){
    return {
      version:1,
      setup:{
        title:'',evaluationType:'정기평가',method:'three',startDate:today(),endDate:'',workplace:'',department:'',industry:'',manager:'',evaluator:'',workers:'',scope:'',preData:'',
        identificationSources:['사업장 순회점검'],sharePlan:'',recordPlan:'전자파일 및 출력본 보존',
        threeAcceptable:'low',threeHigh:'사고 발생 시 사망 또는 장애가 남을 수 있거나 산업안전보건법 기준을 충족하지 못하는 위험',threeMedium:'사고 발생 시 요양이 필요하거나 아차사고 사례가 있는 위험',threeLow:'작업 수행에 영향을 미치지 않는 경미한 부상 또는 질병이 예상되는 위험',
        freqPreset:'3x3',freqLikelihoodMax:3,freqSeverityMax:3,freqAcceptableMax:'',freqCriteria:'사업장 실시규정에 정한 가능성·중대성 기준을 사용'
      },
      hazards:[],shares:[],createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()
    };
  }
  function normalizeState(v){
    const d=defaultState();
    if(!v||typeof v!=='object')return d;
    const s={...d,...v,setup:{...d.setup,...(v.setup||{})}};
    s.hazards=Array.isArray(v.hazards)?v.hazards:[];
    s.shares=Array.isArray(v.shares)?v.shares:[];
    s.setup.identificationSources=Array.isArray(s.setup.identificationSources)?s.setup.identificationSources:['사업장 순회점검'];
    return s;
  }
  let state=normalizeState(safeParse(localStorage.getItem(STORAGE_KEY),null));
  let hazardSearch='',hazardFilter='all',editingHazard=null,editingShare=null,saveTimer=null;
  const fileStore=()=>window.KRASFiles||null;
  const shareAttachments=s=>Array.isArray(s?.attachments)?s.attachments:[];
  function attachmentNames(s){return shareAttachments(s).map(x=>x.name).filter(Boolean).join(', ')}
  async function downloadAttachment(id){try{if(!fileStore())throw new Error('첨부파일 저장모듈을 불러오지 못했습니다.');await fileStore().download(id)}catch(e){alert(e.message||'첨부파일을 열지 못했습니다.')}}
  async function removeAttachmentFromShare(shareId,attId){const s=state.shares.find(x=>x.id===shareId);if(!s)return;if(!confirm('이 첨부파일을 삭제할까요?'))return;try{await fileStore()?.remove(attId)}catch(e){}s.attachments=shareAttachments(s).filter(x=>x.id!==attId);save(true);renderShare();if(editingShare===shareId)renderShareAttachmentEditor(s);}
  function renderShareAttachmentEditor(s={}){const box=$('#s-attachments');if(!box)return;const rows=shareAttachments(s);box.innerHTML=rows.length?rows.map(a=>`<span class="kras-attachment-chip"><b title="${esc(a.name)}">${esc(a.name)}</b><span>${fileStore()?.size(a.size)||''}</span><button type="button" data-open-att="${esc(a.id)}">보기</button><button type="button" class="delete" data-remove-att="${esc(a.id)}">삭제</button></span>`).join(''):'<span class="kras-mini-note">저장된 첨부파일이 없습니다.</span>';box.querySelectorAll('[data-open-att]').forEach(b=>b.addEventListener('click',()=>downloadAttachment(b.dataset.openAtt)));box.querySelectorAll('[data-remove-att]').forEach(b=>b.addEventListener('click',()=>removeAttachmentFromShare(s.id,b.dataset.removeAtt)));}
  async function syncShareAttachments(s){if(!s?.id||!fileStore())return;try{const rows=await fileStore().listShare(s.id);if(rows.length){s.attachments=rows;save(true);renderShareAttachmentEditor(s);renderShare();}}catch(e){console.warn('KRAS attachments',e)}}


  function save(immediate=false){
    state.updatedAt=new Date().toISOString();
    const doSave=()=>{
      try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));setSaveState('저장됨 '+new Date().toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'}));}catch(e){setSaveState('저장 실패 · 브라우저 저장공간 확인');}
    };
    if(immediate){clearTimeout(saveTimer);doSave();return;}
    setSaveState('저장 중…');clearTimeout(saveTimer);saveTimer=setTimeout(doSave,280);
  }
  function setSaveState(t){const el=$('#kras-save-state');if(el)el.textContent=t}

  function bindSetup(){
    $$('[data-setup]').forEach(el=>{
      const k=el.dataset.setup;
      if(k in state.setup) el.value=state.setup[k]??'';
      const ev=el.tagName==='SELECT'?'change':'input';
      el.addEventListener(ev,()=>{
        const oldMethod=state.setup.method;
        state.setup[k]=el.value;
        if(k==='method'&&oldMethod!==el.value){state.hazards=state.hazards.map(h=>({...h,needsReview:true}));renderCriteria();renderAllBoards();}
        if(k==='freqPreset')syncFreqPreset();
        save();renderKpis();renderReadiness();
      });
    });
    renderSources();renderCriteria();
  }
  function renderSources(){
    const box=$('#identification-sources');if(!box)return;
    box.innerHTML=SOURCE_OPTIONS.map((x,i)=>`<label><input type="checkbox" value="${esc(x)}" ${state.setup.identificationSources.includes(x)?'checked':''}><span>${esc(x)}${i===0?' <em>권장 기본</em>':''}</span></label>`).join('');
    box.querySelectorAll('input').forEach(c=>c.addEventListener('change',()=>{
      state.setup.identificationSources=Array.from(box.querySelectorAll('input:checked')).map(x=>x.value);save();renderReadiness();
    }));
  }
  function renderCriteria(){
    const box=$('#method-criteria');if(!box)return;
    const m=state.setup.method;
    if(m==='three'){
      box.innerHTML=`<div class="kras-criteria-head"><div><b>3단계 판단기준</b><span>공단 안내의 예시를 기본값으로 넣었습니다. 사업장 특성에 맞게 수정하세요.</span></div><label>허용 가능한 수준<select id="three-acceptable"><option value="low">하만 허용</option><option value="medium">중·하 허용</option></select></label></div><div class="kras-level-criteria"><label class="high"><b>상</b><textarea id="three-high"></textarea></label><label class="medium"><b>중</b><textarea id="three-medium"></textarea></label><label class="low"><b>하</b><textarea id="three-low"></textarea></label></div><p class="kras-mini-note">※ ‘하만 허용’은 안전보건공단 3단계 안내서의 <b>예시</b>입니다. 실제 허용 가능한 위험성 수준은 사업장이 사전에 정한 실시규정을 따르세요.</p>`;
      $('#three-acceptable').value=state.setup.threeAcceptable||'low';$('#three-high').value=state.setup.threeHigh||'';$('#three-medium').value=state.setup.threeMedium||'';$('#three-low').value=state.setup.threeLow||'';
      [['#three-acceptable','threeAcceptable','change'],['#three-high','threeHigh','input'],['#three-medium','threeMedium','input'],['#three-low','threeLow','input']].forEach(([s,k,e])=>$(s).addEventListener(e,()=>{state.setup[k]=$(s).value;save();renderAllBoards();}));
    }else if(m==='checklist'){
      box.innerHTML=`<div class="kras-criteria-head"><div><b>체크리스트 판단기준</b><span>각 항목을 ‘적정 / 보완필요’로 판단하고 보완필요 항목은 감소대책 대상으로 관리합니다.</span></div></div><div class="kras-method-tip"><strong>작성 원칙</strong><p>체크리스트 문항은 법령·공단 지침·사내표준·설비 기준처럼 확인 가능한 기준을 질문형으로 작성하고, 단순 체크에서 끝내지 말고 미흡 사유와 개선조치를 함께 기록합니다.</p></div>`;
    }else if(m==='ops'){
      box.innerHTML=`<div class="kras-criteria-head"><div><b>핵심요인기술법(OPS) 판단기준</b><span>핵심 질문에 답하면서 추가 대책 필요 여부를 결정합니다.</span></div></div><div class="kras-method-tip"><strong>4가지 핵심 질문</strong><p>① 무엇이 위험한가? ② 누가 어떻게 다칠 수 있는가? ③ 현재 어떤 조치를 하고 있는가? ④ 추가로 무엇을 해야 하는가?</p></div>`;
    }else{
      box.innerHTML=`<div class="kras-criteria-head"><div><b>빈도·강도법 기준</b><span>가능성×중대성 점수를 계산합니다. 허용점수는 사업장 기준을 직접 입력해야 자동 판정됩니다.</span></div><label>평가 매트릭스<select id="freq-preset"><option value="3x3">3 × 3</option><option value="5x4">5 × 4</option><option value="5x5">5 × 5 (사업장 자체)</option></select></label></div><div class="kras-frequency-criteria"><label>가능성 최대값<input id="freq-lmax" type="number" min="2" max="10"></label><label>중대성 최대값<input id="freq-smax" type="number" min="2" max="10"></label><label>허용 가능한 최대 점수<input id="freq-accept" type="number" min="1" placeholder="사업장 기준 입력"></label><label class="wide">판단기준 메모<input id="freq-note" placeholder="예: 가능성 1~3, 중대성 1~3의 사내 기준"></label></div><p class="kras-mini-note">※ 현행 지침은 빈도·강도법을 허용하지만 전국 공통의 단일 점수구간을 강제하지 않습니다. 사업장 실시규정의 기준을 입력하세요.</p>`;
      $('#freq-preset').value=state.setup.freqPreset||'3x3';$('#freq-lmax').value=state.setup.freqLikelihoodMax||3;$('#freq-smax').value=state.setup.freqSeverityMax||3;$('#freq-accept').value=state.setup.freqAcceptableMax||'';$('#freq-note').value=state.setup.freqCriteria||'';
      $('#freq-preset').addEventListener('change',()=>{state.setup.freqPreset=$('#freq-preset').value;syncFreqPreset();save();renderAllBoards();});
      [['#freq-lmax','freqLikelihoodMax'],['#freq-smax','freqSeverityMax'],['#freq-accept','freqAcceptableMax'],['#freq-note','freqCriteria']].forEach(([s,k])=>$(s).addEventListener('input',()=>{state.setup[k]=$(s).value;save();renderHazardRiskFields();renderAllBoards();}));
    }
    renderHazardRiskFields();
  }
  function syncFreqPreset(){
    const p=state.setup.freqPreset;
    if(p==='3x3'){state.setup.freqLikelihoodMax=3;state.setup.freqSeverityMax=3;}
    else if(p==='5x4'){state.setup.freqLikelihoodMax=5;state.setup.freqSeverityMax=4;}
    else if(p==='5x5'){state.setup.freqLikelihoodMax=5;state.setup.freqSeverityMax=5;}
    if($('#freq-lmax'))$('#freq-lmax').value=state.setup.freqLikelihoodMax;if($('#freq-smax'))$('#freq-smax').value=state.setup.freqSeverityMax;
  }

  function riskInfo(h,after=false){
    const m=state.setup.method;
    if(m==='three'){
      const level=after?h.afterLevel:h.riskLevel;
      if(!level)return {known:false,label:'미판정',accepted:null,level:'unknown'};
      const threshold=LEVEL_ORDER[state.setup.threeAcceptable||'low']||1;
      const accepted=(LEVEL_ORDER[level]||9)<=threshold;
      return {known:true,label:LEVEL_LABELS[level]||level,accepted,level};
    }
    if(m==='checklist'){
      const v=after?h.afterChecklist:h.checklistResult;
      if(!v)return {known:false,label:'미판정',accepted:null,level:'unknown'};
      return {known:true,label:v==='adequate'?'적정':'보완필요',accepted:v==='adequate',level:v==='adequate'?'low':'high'};
    }
    if(m==='ops'){
      const v=after?h.afterOpsNeed:h.opsNeed;
      if(!v)return {known:false,label:'미판정',accepted:null,level:'unknown'};
      return {known:true,label:v==='no'?'추가대책 불필요':'추가대책 필요',accepted:v==='no',level:v==='no'?'low':'high'};
    }
    const l=Number(after?h.afterLikelihood:h.likelihood),s=Number(after?h.afterSeverity:h.severity);const score=l&&s?l*s:0;
    if(!score)return {known:false,label:'미판정',accepted:null,level:'unknown',score:0};
    const max=Number(state.setup.freqAcceptableMax);
    if(!max)return {known:true,label:`${score}점`,accepted:null,level:'unknown',score};
    return {known:true,label:`${score}점`,accepted:score<=max,level:score<=max?'low':'high',score};
  }
  function riskBadge(info){
    const cls=!info.known?'unknown':info.accepted===true?'ok':info.accepted===false?'bad':'warn';
    const text=!info.known?'미판정':info.accepted===true?`허용 · ${info.label}`:info.accepted===false?`허용불가 · ${info.label}`:`기준미설정 · ${info.label}`;
    return `<span class="risk-badge ${cls}">${esc(text)}</span>`;
  }
  function actionNeeds(h){const r=riskInfo(h,false);return r.accepted===false||h.status==='진행중'||h.status==='미착수'||h.needsReview}
  function isOverdue(h){return !!(h.due&&h.status!=='완료'&&h.due<today())}
  function controlRank(v){return {'제거':1,'대체':2,'공학적 대책':3,'관리적 대책':4,'개인보호구':5}[v]||''}

  function renderKpis(){
    const total=state.hazards.length,unacc=state.hazards.filter(h=>riskInfo(h,false).accepted===false).length,open=state.hazards.filter(h=>actionNeeds(h)&&h.status!=='완료').length,over=state.hazards.filter(isOverdue).length;
    const completeNeeded=state.hazards.filter(h=>riskInfo(h,false).accepted===false);const complete=completeNeeded.filter(h=>h.status==='완료'&&riskInfo(h,true).known).length;const rate=completeNeeded.length?Math.round(complete/completeNeeded.length*100):0;
    const el=$('#kras-kpis');if(!el)return;el.innerHTML=[
      ['유해·위험요인',total,'등록된 위험요인'],['허용 불가능',unacc,'현재 기준 판정'],['개선 미완료',open,over?`기한경과 ${over}건`:'담당·기한 관리'],['개선·재평가',rate+'%',completeNeeded.length?`${complete}/${completeNeeded.length}건`:'대상 없음']
    ].map(x=>`<div class="worker-kpi"><div class="k">${x[0]}</div><div class="v">${x[1]}</div><div class="s">${x[2]}</div></div>`).join('');
  }

  function renderHazards(){
    const box=$('#hazard-list');if(!box)return;let rows=state.hazards.slice();const q=hazardSearch.toLowerCase();if(q)rows=rows.filter(h=>Object.values(h).some(v=>String(v||'').toLowerCase().includes(q)));
    if(hazardFilter==='unacceptable')rows=rows.filter(h=>riskInfo(h,false).accepted===false);
    if(hazardFilter==='open')rows=rows.filter(h=>actionNeeds(h)&&h.status!=='완료');
    if(hazardFilter==='overdue')rows=rows.filter(isOverdue);
    if(!rows.length){box.innerHTML=`<div class="worker-empty"><img src="../assets/jaeili-face-v4.png" alt="제일이"><strong>${state.hazards.length?'조건에 맞는 위험요인이 없습니다.':'아직 등록된 유해·위험요인이 없습니다.'}</strong><p>공정·작업을 실제로 순회하며 작업자와 함께 위험한 상황과 사건을 찾아 기록하세요.</p><button class="worker-btn primary" type="button" data-add-hazard>첫 위험요인 등록</button></div>`;box.querySelector('[data-add-hazard]')?.addEventListener('click',()=>openHazard());return;}
    box.innerHTML=`<div class="worker-table-wrap"><table class="worker-table kras-table"><thead><tr><th>No.</th><th>공정·작업</th><th>유해·위험요인</th><th>현재 위험성</th><th>현재조치</th><th>감소대책</th><th>상태</th><th>관리</th></tr></thead><tbody>${rows.map((h,i)=>{const r=riskInfo(h,false);return `<tr class="${r.accepted===false?'risk-row-bad':''}"><td>${i+1}</td><td><b>${esc(h.task)}</b><small>${esc(h.step||'')}</small></td><td><span class="hazard-type">${esc(h.type||'기타')}</span><div>${esc(h.scenario||'')}</div>${h.needsReview?'<em class="review-flag">방법 변경 후 재검토 필요</em>':''}</td><td>${riskBadge(r)}</td><td>${esc(h.currentControl||'미기재')}</td><td>${esc(h.measure||'-')}</td><td><span class="status-chip ${h.status==='완료'?'done':isOverdue(h)?'overdue':''}">${esc(isOverdue(h)?'기한경과':h.status||'미착수')}</span></td><td class="actions"><button class="mini-btn" data-edit-hazard="${esc(h.id)}">수정</button><button class="mini-btn delete" data-delete-hazard="${esc(h.id)}">삭제</button></td></tr>`}).join('')}</tbody></table></div>`;
    box.querySelectorAll('[data-edit-hazard]').forEach(b=>b.addEventListener('click',()=>openHazard(b.dataset.editHazard)));
    box.querySelectorAll('[data-delete-hazard]').forEach(b=>b.addEventListener('click',()=>{if(confirm('이 유해·위험요인을 삭제할까요?')){state.hazards=state.hazards.filter(h=>h.id!==b.dataset.deleteHazard);save(true);renderAllBoards();}}));
  }

  function renderDecision(){
    const box=$('#risk-decision-board');if(!box)return;
    if(!state.hazards.length){box.innerHTML='<div class="kras-board-empty">유해·위험요인을 먼저 등록하면 위험성 결정 현황이 표시됩니다.</div>';return;}
    const known=state.hazards.filter(h=>riskInfo(h,false).known).length,unacc=state.hazards.filter(h=>riskInfo(h,false).accepted===false).length,unknown=state.hazards.filter(h=>{const r=riskInfo(h,false);return !r.known||r.accepted===null}).length;
    const method=METHOD_LABELS[state.setup.method]||state.setup.method;
    box.innerHTML=`<div class="kras-decision-summary"><div><span>평가방법</span><b>${esc(method)}</b></div><div><span>판정 완료</span><b>${known}/${state.hazards.length}</b></div><div><span>허용 불가능</span><b class="danger-text">${unacc}건</b></div><div><span>기준 미설정·미판정</span><b>${unknown}건</b></div></div><div class="kras-risk-cards">${state.hazards.map(h=>{const r=riskInfo(h,false);return `<article><div class="risk-card-top"><b>${esc(h.task)}</b>${riskBadge(r)}</div><p>${esc(h.scenario)}</p><small>현재조치: ${esc(h.currentControl||'미기재')}</small><button class="worker-btn" data-edit-hazard="${esc(h.id)}">위험성 판단 수정</button></article>`}).join('')}</div>`;
    box.querySelectorAll('[data-edit-hazard]').forEach(b=>b.addEventListener('click',()=>openHazard(b.dataset.editHazard)));
  }

  function renderActions(){
    const box=$('#action-board');if(!box)return;const rows=state.hazards.filter(h=>riskInfo(h,false).accepted===false||h.measure||h.status==='완료');
    if(!rows.length){box.innerHTML='<div class="kras-board-empty">허용 불가능 위험 또는 등록된 감소대책이 없습니다.</div>';return;}
    box.innerHTML=`<div class="kras-action-list">${rows.map(h=>{const before=riskInfo(h,false),after=riskInfo(h,true);return `<article class="${isOverdue(h)?'overdue':''}"><div class="action-main"><div class="action-title"><span class="hierarchy-no">${controlRank(h.controlType)||'–'}</span><div><b>${esc(h.task)} · ${esc(h.type||'위험요인')}</b><p>${esc(h.scenario)}</p></div></div><div class="risk-transition">${riskBadge(before)}<span>→</span>${riskBadge(after)}</div></div><div class="action-detail"><div><span>감소대책</span><b>${esc(h.measure||'미수립')}</b></div><div><span>담당 / 기한</span><b>${esc(h.owner||'-')} / ${fmtDate(h.due)}</b></div><div><span>상태 / 완료일</span><b>${esc(isOverdue(h)?'기한경과':h.status||'미착수')} / ${fmtDate(h.completed)}</b></div></div><div class="action-foot"><span>${h.evidence?'증빙: '+esc(h.evidence):'이행 증빙 미기재'}</span><button class="worker-btn" data-edit-hazard="${esc(h.id)}">대책·재평가 수정</button></div></article>`}).join('')}</div>`;
    box.querySelectorAll('[data-edit-hazard]').forEach(b=>b.addEventListener('click',()=>openHazard(b.dataset.editHazard,true)));
  }

  function tbmRows(){return state.hazards.filter(h=>riskInfo(h,false).accepted===false||((h.status==='미착수'||h.status==='진행중')&&h.measure)).slice(0,10)}
  function tbmText(){const rows=tbmRows();if(!rows.length)return '현재 TBM에 자동 반영할 허용 불가능·개선 진행 위험요인이 없습니다.';return ['[오늘의 핵심 위험 · KRAS 위험성평가 연계]',...rows.map((h,i)=>`${i+1}. ${h.task}${h.step?' / '+h.step:''}\n- 위험: ${h.scenario}\n- 조치: ${h.measure||'추가 감소대책 수립 필요'}${h.owner?'\n- 담당: '+h.owner:''}`),'작업 전 변경사항과 현장 상태를 다시 확인하고, 새로운 위험이 있으면 작업을 중지한 뒤 공유해 주세요.'].join('\n');}
  function renderShare(){
    const preview=$('#tbm-preview');const rows=tbmRows();if(preview)preview.innerHTML=rows.length?`<div class="kras-tbm-list">${rows.map((h,i)=>`<div><span>${String(i+1).padStart(2,'0')}</span><div><b>${esc(h.task)}${h.step?' · '+esc(h.step):''}</b><p>${esc(h.scenario)}</p><small>대책: ${esc(h.measure||'추가 대책 수립 필요')}</small></div></div>`).join('')}</div>`:'<div class="kras-board-empty">현재 TBM 자동요약 대상이 없습니다.</div>';
    const box=$('#share-list');if(!box)return;if(!state.shares.length){box.innerHTML='<div class="kras-share-empty">아직 공유·교육 기록이 없습니다. 위험성평가 결과를 TBM 또는 교육으로 공유한 뒤 사진·교육 서명록과 함께 기록을 남기세요.</div>';return;}
    box.innerHTML=`<div class="kras-share-list">${state.shares.map(s=>{const files=shareAttachments(s);return `<article><div><span>${esc(s.method||'공유')}</span><b>${fmtDate(s.date)} · ${esc(s.target||'대상 미기재')}</b><p>${nl(s.content||'')}</p><small>${s.feedback?'피드백: '+esc(s.feedback):'피드백 미기재'}</small>${files.length?`<div class="kras-share-files">${files.map(a=>`<button type="button" data-download-att="${esc(a.id)}">📎 ${esc(a.name)}</button>`).join('')}</div>`:'<div class="kras-share-files"><span>첨부 없음</span></div>'}</div><div><button class="mini-btn" data-edit-share="${esc(s.id)}">수정</button><button class="mini-btn delete" data-delete-share="${esc(s.id)}">삭제</button></div></article>`}).join('')}</div>`;
    box.querySelectorAll('[data-download-att]').forEach(b=>b.addEventListener('click',()=>downloadAttachment(b.dataset.downloadAtt)));
    box.querySelectorAll('[data-edit-share]').forEach(b=>b.addEventListener('click',()=>openShare(b.dataset.editShare)));
    box.querySelectorAll('[data-delete-share]').forEach(b=>b.addEventListener('click',async()=>{if(!confirm('이 공유 기록과 연결된 첨부파일을 함께 삭제할까요?'))return;const id=b.dataset.deleteShare;try{await fileStore()?.removeShare(id)}catch(e){}state.shares=state.shares.filter(s=>s.id!==id);save(true);renderAllBoards();}));
  }

  function readinessItems(){
    const methodCriteria=state.setup.method!=='frequency'||Number(state.setup.freqAcceptableMax)>0;
    const allRisk=state.hazards.length>0&&state.hazards.every(h=>riskInfo(h,false).known&&riskInfo(h,false).accepted!==null);
    const unacc=state.hazards.filter(h=>riskInfo(h,false).accepted===false);
    const controls=unacc.every(h=>h.measure&&h.owner&&h.due);
    const reeval=unacc.filter(h=>h.status==='완료').every(h=>riskInfo(h,true).known);
    return [
      {ok:!!(state.setup.title&&state.setup.method),label:'평가명·평가방법 설정'},
      {ok:!!(state.setup.manager||state.setup.evaluator),label:'평가 책임·담당자 지정'},
      {ok:!!state.setup.workers,label:'해당 작업 근로자 참여 기록'},
      {ok:state.setup.identificationSources.includes('사업장 순회점검'),label:'사업장 순회점검 포함'},
      {ok:methodCriteria,label:'위험성 판단기준·허용수준 설정'},
      {ok:state.hazards.length>0,label:'유해·위험요인 등록'},
      {ok:allRisk,label:'모든 위험요인의 위험성 결정 완료'},
      {ok:controls,label:'허용 불가능 위험의 감소대책·담당·기한 지정'},
      {ok:reeval,label:'완료된 감소대책의 잔여위험 재평가'},
      {ok:state.shares.length>0,label:'결과 공유·TBM·교육 기록'}
    ];
  }
  function renderReadiness(){
    const box=$('#kras-readiness');if(!box)return;const list=readinessItems(),ok=list.filter(x=>x.ok).length;box.innerHTML=`<div class="readiness-score"><b>${ok}/${list.length}</b><span>KRAS 등록 준비 점검</span><div><i style="width:${ok/list.length*100}%"></i></div></div><div class="readiness-list">${list.map(x=>`<span class="${x.ok?'ok':'todo'}">${x.ok?'✓':'!'} ${esc(x.label)}</span>`).join('')}</div>`;
  }

  function renderAllBoards(){renderKpis();renderHazards();renderDecision();renderActions();renderShare();renderReadiness();renderLegacyButton();}

  function renderHazardRiskFields(h={}){
    const before=$('#hazard-risk-fields'),after=$('#hazard-residual-fields');if(!before||!after)return;const m=state.setup.method;
    if(m==='three'){
      before.innerHTML=`<div class="method-field-card"><h3>현재 위험성 · 3단계 판단</h3><p>현재 안전보건조치를 고려하여 사전 설정한 기준으로 상·중·하를 선택합니다.</p><div class="risk-choice-row"><label><input type="radio" name="riskLevel" value="high"><span class="high">상</span></label><label><input type="radio" name="riskLevel" value="medium"><span class="medium">중</span></label><label><input type="radio" name="riskLevel" value="low"><span class="low">하</span></label></div><label>판단 근거<textarea id="h-risk-reason" placeholder="왜 이 수준인지 현재 조치와 예상 결과를 근거로 작성"></textarea></label></div>`;
      after.innerHTML=`<div class="method-field-card residual"><h3>개선 후 잔여위험 재평가</h3><p>감소대책을 실제로 이행한 뒤 다시 판단합니다.</p><div class="risk-choice-row"><label><input type="radio" name="afterLevel" value="high"><span class="high">상</span></label><label><input type="radio" name="afterLevel" value="medium"><span class="medium">중</span></label><label><input type="radio" name="afterLevel" value="low"><span class="low">하</span></label></div><label>재평가 근거<textarea id="h-after-reason"></textarea></label></div>`;
      setRadio('riskLevel',h.riskLevel);setRadio('afterLevel',h.afterLevel);$('#h-risk-reason').value=h.riskReason||'';$('#h-after-reason').value=h.afterReason||'';
    }else if(m==='checklist'){
      before.innerHTML=`<div class="method-field-card"><h3>현재 위험성 · 체크리스트</h3><label>체크 항목 / 기준<textarea id="h-check-item" placeholder="예: 회전체 점검 전 에너지 차단·잠금장치가 적용되는가?"></textarea></label><div class="risk-choice-row"><label><input type="radio" name="checklistResult" value="adequate"><span class="low">적정</span></label><label><input type="radio" name="checklistResult" value="supplement"><span class="high">보완필요</span></label></div><label>판단 근거<textarea id="h-risk-reason"></textarea></label></div>`;
      after.innerHTML=`<div class="method-field-card residual"><h3>개선 후 체크리스트 재확인</h3><div class="risk-choice-row"><label><input type="radio" name="afterChecklist" value="adequate"><span class="low">적정</span></label><label><input type="radio" name="afterChecklist" value="supplement"><span class="high">보완필요</span></label></div><label>재확인 근거<textarea id="h-after-reason"></textarea></label></div>`;
      $('#h-check-item').value=h.checkItem||'';setRadio('checklistResult',h.checklistResult);setRadio('afterChecklist',h.afterChecklist);$('#h-risk-reason').value=h.riskReason||'';$('#h-after-reason').value=h.afterReason||'';
    }else if(m==='ops'){
      before.innerHTML=`<div class="method-field-card"><h3>현재 위험성 · 핵심요인기술법(OPS)</h3><label>무엇이 위험한가?<textarea id="h-ops-what" placeholder="핵심 위험요인"></textarea></label><label>누가 어떻게 다칠 수 있는가?<textarea id="h-ops-who"></textarea></label><label>현재 어떤 조치를 하고 있는가?<textarea id="h-ops-current"></textarea></label><label>추가로 무엇을 해야 하는가?<textarea id="h-ops-additional"></textarea></label><div class="risk-choice-row"><label><input type="radio" name="opsNeed" value="yes"><span class="high">추가대책 필요</span></label><label><input type="radio" name="opsNeed" value="no"><span class="low">추가대책 불필요</span></label></div></div>`;
      after.innerHTML=`<div class="method-field-card residual"><h3>개선 후 OPS 재확인</h3><div class="risk-choice-row"><label><input type="radio" name="afterOpsNeed" value="yes"><span class="high">추가대책 필요</span></label><label><input type="radio" name="afterOpsNeed" value="no"><span class="low">추가대책 불필요</span></label></div><label>재평가 근거<textarea id="h-after-reason"></textarea></label></div>`;
      $('#h-ops-what').value=h.opsWhat||h.scenario||'';$('#h-ops-who').value=h.opsWho||h.consequence||'';$('#h-ops-current').value=h.opsCurrent||h.currentControl||'';$('#h-ops-additional').value=h.opsAdditional||h.measure||'';setRadio('opsNeed',h.opsNeed);setRadio('afterOpsNeed',h.afterOpsNeed);$('#h-after-reason').value=h.afterReason||'';
    }else{
      const lm=Number(state.setup.freqLikelihoodMax)||3,sm=Number(state.setup.freqSeverityMax)||3;
      before.innerHTML=`<div class="method-field-card"><h3>현재 위험성 · 빈도×강도</h3><div class="frequency-inputs"><label>가능성(빈도)<input id="h-likelihood" type="number" min="1" max="${lm}" placeholder="1~${lm}"></label><span>×</span><label>중대성(강도)<input id="h-severity" type="number" min="1" max="${sm}" placeholder="1~${sm}"></label><span>=</span><output id="h-score">-</output></div><p class="score-rule">허용 최대점수: <b>${esc(state.setup.freqAcceptableMax||'미설정')}</b> · 미설정 시 자동 허용판정을 하지 않습니다.</p><label>판단 근거<textarea id="h-risk-reason"></textarea></label></div>`;
      after.innerHTML=`<div class="method-field-card residual"><h3>개선 후 빈도×강도 재평가</h3><div class="frequency-inputs"><label>가능성<input id="h-after-likelihood" type="number" min="1" max="${lm}"></label><span>×</span><label>중대성<input id="h-after-severity" type="number" min="1" max="${sm}"></label><span>=</span><output id="h-after-score">-</output></div><label>재평가 근거<textarea id="h-after-reason"></textarea></label></div>`;
      $('#h-likelihood').value=h.likelihood||'';$('#h-severity').value=h.severity||'';$('#h-after-likelihood').value=h.afterLikelihood||'';$('#h-after-severity').value=h.afterSeverity||'';$('#h-risk-reason').value=h.riskReason||'';$('#h-after-reason').value=h.afterReason||'';
      const upd=()=>{const a=Number($('#h-likelihood').value),b=Number($('#h-severity').value);$('#h-score').value=a&&b?a*b:'-';const c=Number($('#h-after-likelihood').value),d=Number($('#h-after-severity').value);$('#h-after-score').value=c&&d?c*d:'-'};['#h-likelihood','#h-severity','#h-after-likelihood','#h-after-severity'].forEach(s=>$(s).addEventListener('input',upd));upd();
    }
  }
  function setRadio(name,val){if(!val)return;const x=document.querySelector(`input[name="${name}"][value="${CSS.escape(val)}"]`);if(x)x.checked=true}
  function radioVal(name){return document.querySelector(`input[name="${name}"]:checked`)?.value||''}

  function openModal(id){const m=$(id);if(m){m.classList.add('open');m.setAttribute('aria-hidden','false');document.body.classList.add('modal-open')}}
  function closeModal(id){const m=$(id);if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.classList.remove('modal-open')}}
  function openHazard(id,focusAction=false){
    editingHazard=id||null;const h=id?state.hazards.find(x=>x.id===id)||{}:{};
    $('#hazard-modal-title').textContent=id?'유해·위험요인 수정':'유해·위험요인 추가';
    const map={
      '#hazard-id':'id','#h-task':'task','#h-step':'step','#h-type':'type','#h-source':'source','#h-scenario':'scenario','#h-consequence':'consequence','#h-current':'currentControl','#h-basis':'basis','#h-worker':'worker','#h-worker-comment':'workerComment','#h-control-type':'controlType','#h-status':'status','#h-measure':'measure','#h-owner':'owner','#h-due':'due','#h-completed':'completed','#h-evidence':'evidence','#h-note':'note'
    };
    Object.entries(map).forEach(([sel,k])=>{const el=$(sel);if(el)el.value=h[k]||''});
    if(!id){$('#h-source').value='사업장 순회점검';$('#h-status').value='미착수';}
    renderHazardRiskFields(h);openModal('#hazard-modal');setTimeout(()=>$(focusAction?'#h-measure':'#h-task')?.focus(),40);
  }
  function collectHazard(){
    const old=editingHazard?state.hazards.find(x=>x.id===editingHazard)||{}:{};const m=state.setup.method;
    const h={...old,id:editingHazard||uid(),task:clean($('#h-task').value),step:clean($('#h-step').value),type:$('#h-type').value,source:$('#h-source').value,scenario:clean($('#h-scenario').value),consequence:clean($('#h-consequence').value),currentControl:clean($('#h-current').value),basis:clean($('#h-basis').value),worker:clean($('#h-worker').value),workerComment:clean($('#h-worker-comment').value),controlType:$('#h-control-type').value,status:$('#h-status').value,measure:clean($('#h-measure').value),owner:clean($('#h-owner').value),due:$('#h-due').value,completed:$('#h-completed').value,evidence:clean($('#h-evidence').value),note:clean($('#h-note').value),method:m,updatedAt:new Date().toISOString(),needsReview:false};
    if(m==='three'){h.riskLevel=radioVal('riskLevel');h.afterLevel=radioVal('afterLevel');h.riskReason=clean($('#h-risk-reason').value);h.afterReason=clean($('#h-after-reason').value);}
    if(m==='checklist'){h.checkItem=clean($('#h-check-item').value);h.checklistResult=radioVal('checklistResult');h.afterChecklist=radioVal('afterChecklist');h.riskReason=clean($('#h-risk-reason').value);h.afterReason=clean($('#h-after-reason').value);}
    if(m==='ops'){h.opsWhat=clean($('#h-ops-what').value);h.opsWho=clean($('#h-ops-who').value);h.opsCurrent=clean($('#h-ops-current').value);h.opsAdditional=clean($('#h-ops-additional').value);h.opsNeed=radioVal('opsNeed');h.afterOpsNeed=radioVal('afterOpsNeed');h.afterReason=clean($('#h-after-reason').value);}
    if(m==='frequency'){h.likelihood=$('#h-likelihood').value;h.severity=$('#h-severity').value;h.afterLikelihood=$('#h-after-likelihood').value;h.afterSeverity=$('#h-after-severity').value;h.riskReason=clean($('#h-risk-reason').value);h.afterReason=clean($('#h-after-reason').value);}
    return h;
  }

  function openShare(id){editingShare=id||null;const s=id?state.shares.find(x=>x.id===id)||{}:{id:'',attachments:[]};$('#share-modal-title').textContent=id?'공유 기록 수정':'결과 공유·TBM 기록';$('#share-id').value=s.id||'';$('#s-date').value=s.date||today();$('#s-method').value=s.method||'TBM';$('#s-target').value=s.target||'';$('#s-instructor').value=s.instructor||state.setup.evaluator||'';$('#s-content').value=s.content||tbmText();$('#s-feedback').value=s.feedback||'';if($('#s-files'))$('#s-files').value='';renderShareAttachmentEditor(s);openModal('#share-modal');if(id)syncShareAttachments(s);}

  function legacyRows(){const x=safeParse(localStorage.getItem(LEGACY_KEY),[]);return Array.isArray(x)?x:[]}
  function renderLegacyButton(){const b=$('#import-legacy');if(!b)return;const n=legacyRows().length;b.hidden=!n;b.textContent=n?`기존 기록 ${n}건 가져오기`:'기존 기록 가져오기';}
  function importLegacy(){const rows=legacyRows();if(!rows.length)return alert('가져올 기존 기록이 없습니다.');if(!confirm(`기존 위험성평가 기록 ${rows.length}건의 공통 항목을 KRAS 화면으로 복사할까요?\n원본 기록은 삭제하지 않습니다. 위험성 수준은 현재 평가방법 기준으로 다시 확인해야 합니다.`))return;const existing=new Set(state.hazards.map(h=>[h.task,h.scenario].join('|')));let added=0;rows.forEach(r=>{const key=[r.task,r.scenario].join('|');if(existing.has(key))return;const h={id:uid(),task:r.task||'',step:r.step||'',type:r.hazardType||'기타',source:'기타',scenario:r.scenario||'',consequence:'',currentControl:r.currentControl||'',basis:'',worker:'',workerComment:'',controlType:'',status:r.status?.includes('완료')?'완료':r.status?.includes('진행')?'진행중':'재검토 필요',measure:r.measure||'',owner:r.owner||'',due:r.due||'',completed:'',evidence:'',note:`이전 위험성평가 기록에서 가져옴${r.likelihood||r.severity?` · 기존 가능성 ${r.likelihood||'-'} / 중대성 ${r.severity||'-'}`:''}`,method:state.setup.method,needsReview:true,updatedAt:new Date().toISOString()};state.hazards.push(h);existing.add(key);added++;});save(true);renderAllBoards();alert(`${added}건을 가져왔습니다. 각 항목의 위험성 판단과 감소대책을 현재 KRAS 기준으로 다시 확인해 주세요.`);}

  function exportRows(){return state.hazards.map((h,i)=>{const b=riskInfo(h,false),a=riskInfo(h,true);return {
    '번호':i+1,'평가명':state.setup.title,'평가구분':state.setup.evaluationType,'평가방법':METHOD_LABELS[state.setup.method],
    '사업장':state.setup.workplace,'부서/공정':state.setup.department,'공정(작업)명':h.task,'세부작업':h.step,'유해·위험요인 분류':h.type,'파악방법':h.source,
    '유해·위험요인(위험한 상황과 사건)':h.scenario,'예상 부상·질병/피해대상':h.consequence,'현재 안전보건조치':h.currentControl,'관련근거':h.basis,'노출·참여 근로자':h.worker,'근로자 의견':h.workerComment,
    '현재 위험성':b.label,'허용여부':b.accepted===true?'허용 가능':b.accepted===false?'허용 불가능':'기준 확인 필요','위험성 판단근거':h.riskReason||'',
    '체크리스트 항목':h.checkItem||'','OPS-무엇이 위험한가':h.opsWhat||'','OPS-누가 어떻게 다칠 수 있는가':h.opsWho||'','OPS-현재 조치':h.opsCurrent||'','OPS-추가조치':h.opsAdditional||'',
    '가능성(빈도)':h.likelihood||'','중대성(강도)':h.severity||'','위험성 점수':b.score||'',
    '감소대책 우선순위':h.controlType,'위험성 감소대책':h.measure,'담당자':h.owner,'완료예정일':h.due,'조치상태':h.status,'실제 완료일':h.completed,'이행 증빙':h.evidence,
    '개선 후 위험성':a.label,'개선 후 허용여부':a.accepted===true?'허용 가능':a.accepted===false?'허용 불가능':'미판정/기준확인','재평가 근거':h.afterReason||'','비고':h.note||''
  }})}
  function downloadBlob(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500)}
  function exportTSV(){const rows=exportRows();if(!rows.length)return alert('내보낼 위험성평가 기록이 없습니다.');const heads=Object.keys(rows[0]);const cell=v=>String(v??'').replace(/\t/g,' ').replace(/\r?\n/g,' / ');const text='\uFEFF'+[heads.join('\t'),...rows.map(r=>heads.map(h=>cell(r[h])).join('\t'))].join('\r\n');downloadBlob(new Blob([text],{type:'text/tab-separated-values;charset=utf-8'}),`KRAS_복사용_${today()}.tsv`)}
  function exportJSON(){downloadBlob(new Blob([JSON.stringify(state,null,2)],{type:'application/json;charset=utf-8'}),`KRAS_위험성평가_백업_${today()}.json`)}

  async function ensureXLSX(){if(window.XLSX)return true;const urls=['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];for(const url of urls){const ok=await new Promise(resolve=>{const el=document.createElement('script');let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v)};const timer=setTimeout(()=>finish(!!window.XLSX),5000);el.src=url;el.async=true;el.onload=()=>finish(!!window.XLSX);el.onerror=()=>finish(false);document.head.appendChild(el)});if(ok||window.XLSX)return true;}return !!window.XLSX;}
  function sheetRows(){
    const setup=[['항목','내용'],['평가명',state.setup.title],['평가구분',state.setup.evaluationType],['평가방법',METHOD_LABELS[state.setup.method]],['사업장',state.setup.workplace],['부서/공정',state.setup.department],['업종',state.setup.industry],['총괄 책임자',state.setup.manager],['평가 담당자',state.setup.evaluator],['참여 근로자',state.setup.workers],['평가 시작일',state.setup.startDate],['평가 완료예정일',state.setup.endDate],['평가 대상·범위',state.setup.scope],['유해·위험요인 파악방법',state.setup.identificationSources.join(', ')],['사전 검토자료',state.setup.preData],['허용기준',criteriaText()],['근로자 참여·공유방법',state.setup.sharePlan],['기록·보존',state.setup.recordPlan]];
    const risk=exportRows();
    const actions=state.hazards.filter(h=>h.measure||riskInfo(h,false).accepted===false).map((h,i)=>({'번호':i+1,'공정(작업)':h.task,'유해·위험요인':h.scenario,'현재위험성':riskInfo(h,false).label,'대책 우선순위':h.controlType,'감소대책':h.measure,'담당자':h.owner,'완료예정일':h.due,'조치상태':h.status,'실제완료일':h.completed,'이행증빙':h.evidence,'개선후위험성':riskInfo(h,true).label,'재평가근거':h.afterReason||''}));
    const share=state.shares.map((s,i)=>({'번호':i+1,'공유일':s.date,'공유방법':s.method,'대상·참여인원':s.target,'진행자':s.instructor,'공유한 핵심 위험·대책':s.content,'근로자 피드백':s.feedback,'첨부파일':attachmentNames(s)}));
    const guide=[['KRAS 등록 호환 안내'],['본 파일은 KRAS 일반 위험성평가 화면의 입력 흐름에 맞춘 등록 보조·복사·증빙 첨부용 작업파일입니다.'],['2025 KRAS 사용설명서에서는 일반 3단계/체크리스트/OPS/빈도강도 평가의 Excel 일괄 직접 업로드 기능을 명시적으로 확인할 수 없으므로 직접 업로드 호환을 보장하지 않습니다.'],['화학물질 위험성평가에는 KRAS 공식 Excel 일괄 업로드 기능이 별도로 안내되어 있으므로 화학물질 평가는 KRAS가 제공하는 공식 양식을 사용하세요.'],['등록 권장 순서'],['1. KRAS에서 위험성평가 생성 → 평가방법과 구분 선택'],['2. 사전준비의 공정(작업) 및 유해인자 등록'],['3. 유해·위험요인과 현재 안전보건조치 입력'],['4. 위험성 결정 → 허용 불가능 항목의 감소대책 입력'],['5. 담당자·완료일 확인 후 잔여위험 재평가'],['6. 결과 공유·TBM 실시 및 기록·보존'],['공식사이트','https://kras.kosha.or.kr/kras24/']];
    return {setup,risk,actions,share,guide};
  }
  function criteriaText(){const m=state.setup.method;if(m==='three')return `3단계: 상=${state.setup.threeHigh} / 중=${state.setup.threeMedium} / 하=${state.setup.threeLow} / 허용=${state.setup.threeAcceptable==='low'?'하':state.setup.threeAcceptable==='medium'?'중·하':'하'}`;if(m==='frequency')return `빈도강도 ${state.setup.freqPreset}; 허용 최대점수=${state.setup.freqAcceptableMax||'미설정'}; ${state.setup.freqCriteria||''}`;if(m==='checklist')return '체크리스트: 적정=허용, 보완필요=감소대책 수립';return 'OPS: 추가대책 필요=허용 불가능으로 관리';}
  function setSheetWidths(ws,widths){if(!ws)return;ws['!cols']=widths.map(w=>({wch:w}))}
  async function exportExcel(){
    if(!state.hazards.length&&!state.setup.title)return alert('내보낼 위험성평가 내용이 없습니다.');
    const ok=await ensureXLSX();if(!ok){exportExcelXml();return;}
    const X=window.XLSX,wb=X.utils.book_new(),d=sheetRows();
    const ws0=X.utils.aoa_to_sheet(d.setup);setSheetWidths(ws0,[24,90]);X.utils.book_append_sheet(wb,ws0,'평가개요');
    const ws1=X.utils.json_to_sheet(d.risk);setSheetWidths(ws1,[7,20,14,25,20,18,24,22,18,18,45,35,35,24,20,30,16,16,35,35,35,35,35,12,12,12,18,45,14,14,14,14,30,16,16,35,35]);X.utils.book_append_sheet(wb,ws1,'위험성평가');
    const ws2=X.utils.json_to_sheet(d.actions);setSheetWidths(ws2,[7,24,45,16,18,45,16,16,14,16,30,18,35]);X.utils.book_append_sheet(wb,ws2,'감소대책');
    const ws3=X.utils.json_to_sheet(d.share);setSheetWidths(ws3,[7,14,18,22,18,60,45,45]);X.utils.book_append_sheet(wb,ws3,'TBM공유');
    const ws4=X.utils.aoa_to_sheet(d.guide);setSheetWidths(ws4,[28,90]);X.utils.book_append_sheet(wb,ws4,'KRAS등록안내');
    X.writeFile(wb,`KRAS_등록보조_${today()}.xlsx`);
  }
  function exportExcelXml(){
    const d=sheetRows();const xmlEsc=v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const rowXml=row=>'<Row>'+row.map(v=>`<Cell><Data ss:Type="String">${xmlEsc(v)}</Data></Cell>`).join('')+'</Row>';
    const table=(name,rows)=>`<Worksheet ss:Name="${xmlEsc(name)}"><Table>${rows.map(rowXml).join('')}</Table></Worksheet>`;
    const risk=d.risk.length?[Object.keys(d.risk[0]),...d.risk.map(r=>Object.keys(d.risk[0]).map(k=>r[k]))]:[['위험성평가 기록 없음']];
    const actions=d.actions.length?[Object.keys(d.actions[0]),...d.actions.map(r=>Object.keys(d.actions[0]).map(k=>r[k]))]:[['감소대책 기록 없음']];
    const shares=d.share.length?[Object.keys(d.share[0]),...d.share.map(r=>Object.keys(d.share[0]).map(k=>r[k]))]:[['공유 기록 없음']];
    const xml=`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${table('평가개요',d.setup)}${table('위험성평가',risk)}${table('감소대책',actions)}${table('TBM공유',shares)}${table('KRAS등록안내',d.guide)}</Workbook>`;
    downloadBlob(new Blob(['\uFEFF'+xml],{type:'application/vnd.ms-excel;charset=utf-8'}),`KRAS_등록보조_${today()}.xls`);alert('XLSX 라이브러리 연결이 되지 않아 Excel 2003 호환(.xls) 형식으로 저장했습니다. 내용은 동일합니다.');
  }

  function importJSONFile(file){const r=new FileReader();r.onload=()=>{try{const incoming=normalizeState(JSON.parse(r.result));if(confirm('현재 KRAS 기록을 백업파일 내용으로 교체할까요?')){state=incoming;save(true);bindSetupValues();renderAllBoards();alert('복원이 완료되었습니다.')}}catch(e){alert('안전과장 KRAS 백업 JSON 형식이 아닙니다.')}};r.readAsText(file,'utf-8')}
  function bindSetupValues(){ $$('[data-setup]').forEach(el=>{const k=el.dataset.setup;if(k in state.setup)el.value=state.setup[k]??''});renderSources();renderCriteria();}

  function bindGlobal(){
    $('#toggle-study')?.addEventListener('click',()=>{const b=$('#kras-study-body'),btn=$('#toggle-study');b.hidden=!b.hidden;btn.textContent=b.hidden?'교육내용 펼치기':'교육내용 접기'});
    $('#add-hazard')?.addEventListener('click',()=>openHazard());
    $('#hazard-search')?.addEventListener('input',e=>{hazardSearch=e.target.value.trim();renderHazards()});
    $('#hazard-filter')?.addEventListener('change',e=>{hazardFilter=e.target.value;renderHazards()});
    $('#import-legacy')?.addEventListener('click',importLegacy);
    $('#hazard-form')?.addEventListener('submit',e=>{e.preventDefault();const h=collectHazard();if(!h.task||!h.scenario)return alert('공정(작업)명과 유해·위험요인을 입력하세요.');const r=riskInfo(h,false);if(r.accepted===false&&(!h.measure||!h.owner||!h.due)){if(!confirm('현재 위험성이 허용 불가능으로 판단되었지만 감소대책·담당자·기한 중 일부가 비어 있습니다. 그래도 저장할까요?'))return;}const i=state.hazards.findIndex(x=>x.id===h.id);if(i>=0)state.hazards[i]=h;else state.hazards.unshift(h);save(true);closeModal('#hazard-modal');renderAllBoards();});
    $$('[data-close="hazard-modal"]').forEach(b=>b.addEventListener('click',()=>closeModal('#hazard-modal')));$('#hazard-modal')?.addEventListener('click',e=>{if(e.target.id==='hazard-modal')closeModal('#hazard-modal')});
    $('#add-share')?.addEventListener('click',()=>openShare());
    $('#share-form')?.addEventListener('submit',async e=>{e.preventDefault();const id=editingShare||uid(),old=state.shares.find(x=>x.id===id)||{},s={...old,id,date:$('#s-date').value,method:$('#s-method').value,target:clean($('#s-target').value),instructor:clean($('#s-instructor').value),content:clean($('#s-content').value),feedback:clean($('#s-feedback').value),attachments:shareAttachments(old),updatedAt:new Date().toISOString()};const files=$('#s-files')?.files||[];const submit=e.submitter;if(submit)submit.disabled=true;try{if(files.length){if(!fileStore())throw new Error('첨부파일 저장기능을 준비하지 못했습니다.');const added=await fileStore().saveFiles(id,files);s.attachments=[...s.attachments,...added];}const i=state.shares.findIndex(x=>x.id===s.id);if(i>=0)state.shares[i]=s;else state.shares.unshift(s);save(true);closeModal('#share-modal');renderAllBoards();}catch(err){alert(err.message||'첨부파일 저장 중 오류가 발생했습니다.');}finally{if(submit)submit.disabled=false;}});
    $$('[data-close="share-modal"]').forEach(b=>b.addEventListener('click',()=>closeModal('#share-modal')));$('#share-modal')?.addEventListener('click',e=>{if(e.target.id==='share-modal')closeModal('#share-modal')});
    $('#copy-tbm')?.addEventListener('click',async()=>{const t=tbmText();try{await navigator.clipboard.writeText(t);alert('TBM 문구를 복사했습니다.')}catch(_){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();alert('TBM 문구를 복사했습니다.')}});
    $('#export-xlsx')?.addEventListener('click',exportExcel);$('#export-tsv')?.addEventListener('click',exportTSV);$('#export-json')?.addEventListener('click',exportJSON);
    $('#import-json')?.addEventListener('click',()=>$('#import-json-file').click());$('#import-json-file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importJSONFile(f);e.target.value=''});
    $('#clear-kras')?.addEventListener('click',async()=>{if(!confirm('KRAS 위험성평가에 저장된 모든 데이터와 TBM 첨부파일을 초기화할까요?\n이 작업은 되돌릴 수 없습니다. 먼저 JSON 백업을 권장합니다.'))return;try{await fileStore()?.clear()}catch(e){}state=defaultState();save(true);bindSetupValues();renderAllBoards();});
    window.addEventListener('hashchange',()=>setTimeout(()=>document.querySelector(location.hash)?.scrollIntoView({behavior:'smooth',block:'start'}),30));
  }

  bindSetup();bindGlobal();renderAllBoards();
  if(location.hash)setTimeout(()=>document.querySelector(location.hash)?.scrollIntoView({block:'start'}),100);
})();
