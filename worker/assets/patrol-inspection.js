(function(){
  'use strict';
  const STORE='sgw_v6_patrol-inspection', KRAS='sgw_kras_v1';
  const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const read=(k)=>{try{const v=JSON.parse(localStorage.getItem(k)||'[]');return Array.isArray(v)?v:[]}catch(e){return[]}};
  const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true}catch(e){alert('브라우저 저장공간이 부족합니다. 오래된 기록을 내보낸 뒤 정리해 주세요.');return false}};
  let imageData='', thumbData='', records=read(STORE), analyzing=false;

  function setState(msg,kind){const el=$('#patrolAnalyzeState');if(!el)return;el.textContent=msg;el.className='patrol-state '+(kind||'');}
  function today(){return new Date().toISOString().slice(0,10)}
  function radio(v){const e=document.querySelector('input[name="patrolRisk"][value="'+v+'"]');if(e)e.checked=true}
  function compress(file,max=1280,quality=.78){
    return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=reject;r.onload=()=>{const img=new Image();img.onerror=reject;img.onload=()=>{let w=img.width,h=img.height;if(Math.max(w,h)>max){const k=max/Math.max(w,h);w=Math.round(w*k);h=Math.round(h*k)}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',quality))};img.src=r.result};r.readAsDataURL(file)});
  }
  function makeThumb(data){return new Promise(resolve=>{const img=new Image();img.onload=()=>{let w=img.width,h=img.height,k=Math.min(1,420/Math.max(w,h));w=Math.round(w*k);h=Math.round(h*k);const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);resolve(c.toDataURL('image/jpeg',.62))};img.onerror=()=>resolve('');img.src=data})}
  async function setImage(file){
    if(!file||!/^image\/(jpeg|png|webp)$/i.test(file.type)){alert('JPG, PNG 또는 WEBP 이미지를 선택해 주세요.');return}
    if(file.size>20*1024*1024){alert('20MB 이하 이미지를 사용해 주세요.');return}
    setState('사진을 최적화하는 중…');
    try{imageData=await compress(file);thumbData=await makeThumb(imageData);const p=$('#patrolPreview'),empty=$('#patrolPreviewEmpty'),wrap=$('#patrolPreviewWrap');p.src=imageData;p.hidden=false;p.style.display='block';if(empty){empty.hidden=true;empty.style.display='none'}if(wrap)wrap.classList.add('has-image');$('#patrolRemoveImage').hidden=false;$('#patrolAnalyzeBtn').disabled=false;setState('사진 준비 완료 · 분석 버튼을 눌러 주세요.','ok')}catch(e){setState('사진을 읽지 못했습니다. 다른 사진을 선택해 주세요.','bad')}
  }
  function removeImage(){imageData='';thumbData='';const p=$('#patrolPreview'),empty=$('#patrolPreviewEmpty'),wrap=$('#patrolPreviewWrap');p.hidden=true;p.style.display='none';p.removeAttribute('src');if(empty){empty.hidden=false;empty.style.removeProperty('display')}if(wrap)wrap.classList.remove('has-image');$('#patrolRemoveImage').hidden=true;$('#patrolAnalyzeBtn').disabled=true;setState('사진을 먼저 입력해 주세요.')}
  function applyAI(r){
    $('#patrolItem').value=r.inspectionItem||'';$('#patrolObservation').value=r.observation||'';$('#patrolImprovement').value=r.improvement||'';$('#patrolAccidentType').value=r.accidentType||'기타';$('#patrolScenario').value=r.hazardScenario||'';$('#patrolUrgency').value=r.urgency||'계획 개선';$('#patrolRiskReason').value=r.reason||'';radio(r.riskAssessmentRecommended?'O':'X');
  }
  async function requestAnalysis(payload,attempt=0){
    const ctrl=new AbortController();
    const timer=setTimeout(()=>ctrl.abort(),34000);
    try{
      const res=await fetch('/api/ai/inspection',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:ctrl.signal});
      const data=await res.json().catch(()=>({}));
      if(res.ok&&data.ok)return data;
      const retryable=[429,500,502,503,504].includes(res.status);
      if(retryable&&attempt<1){setState('AI 응답을 다시 확인하고 있습니다…');await new Promise(r=>setTimeout(r,700));return requestAnalysis(payload,attempt+1)}
      throw new Error(data.error||'사진 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }catch(e){
      if(e?.name==='AbortError'&&attempt<1){setState('AI 응답을 다시 확인하고 있습니다…');return requestAnalysis(payload,attempt+1)}
      throw e;
    }finally{clearTimeout(timer)}
  }
  async function analyze(){
    if(!imageData||analyzing)return;analyzing=true;const b=$('#patrolAnalyzeBtn');b.disabled=true;b.textContent='분석 중…';setState('사진에서 위험요인과 점검사항을 분석하는 중…');
    try{const data=await requestAnalysis({image:imageData,context:$('#patrolContext').value.trim()});applyAI(data.result||{});setState('AI 초안 작성 완료 · 내용을 확인하고 수정한 뒤 저장하세요.','ok');$('#patrolItem').scrollIntoView({behavior:'smooth',block:'center'})}catch(e){setState(e?.name==='AbortError'?'AI 응답이 늦어 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.':(e.message||'사진 분석 중 오류가 발생했습니다.'),'bad')}finally{analyzing=false;b.disabled=!imageData;b.textContent='✨ 사진 분석해서 점검일지 채우기'}
  }
  function riskHazardType(type){const m={'추락':'추락·낙하','넘어짐':'충돌·전도','끼임':'끼임·말림','맞음':'충돌·전도','부딪힘':'충돌·전도','깔림·뒤집힘':'차량·운반','무너짐':'기타','감전':'감전','화재·폭발':'화재·폭발','질식·중독':'질식·중독','절단·베임·찔림':'기타','교통·운반':'차량·운반','화학물질 노출':'화학물질'};return m[type]||'기타'}
  function riskPriority(u){return u==='즉시 조치'?'즉시 조치':u==='당일 개선'?'우선 개선':u==='관찰 유지'?'현 수준 유지':'계획 개선'}
  function linkRisk(row){
    let data;try{data=JSON.parse(localStorage.getItem(KRAS)||'null')}catch(e){data=null}
    if(!data||typeof data!=='object')data={version:1,setup:{evaluationType:'수시평가',method:'three',identificationSources:['사업장 순회점검']},hazards:[],shares:[],createdAt:new Date().toISOString()};
    if(!data.setup||typeof data.setup!=='object')data.setup={evaluationType:'수시평가',method:'three',identificationSources:['사업장 순회점검']};
    if(!Array.isArray(data.hazards))data.hazards=[];if(!Array.isArray(data.shares))data.shares=[];
    if(data.hazards.some(x=>x.sourcePatrolId===row.id))return false;
    data.hazards.unshift({id:uid(),sourcePatrolId:row.id,updatedAt:new Date().toISOString(),task:row.area||'순회점검 발견사항',step:'순회점검 중 발견',type:riskHazardType(row.accidentType),source:'사업장 순회점검',scenario:row.scenario||row.inspectionItem,consequence:'',currentControl:'순회점검 발견 당시 상태: '+(row.observation||row.inspectionItem),basis:'',worker:row.inspector||'',workerComment:'순회점검 AI/현장 기록에서 수시평가 대상으로 연계됨. '+(row.riskReason||''),controlType:'',status:'진행중',measure:row.improvement,owner:row.owner||'',due:row.due||'',completed:'',evidence:'순회점검 기록 ID: '+row.id,note:'순회점검에서 자동 연계 · 기존 긴급도: '+riskPriority(row.urgency),method:data.setup.method||'three',needsReview:true});
    data.setup.evaluationType=data.setup.evaluationType||'수시평가';data.updatedAt=new Date().toISOString();
    try{localStorage.setItem(KRAS,JSON.stringify(data));return true}catch(e){alert('위험성평가 연계 저장에 실패했습니다. 브라우저 저장공간을 확인해 주세요.');return false}
  }
  function collect(){const risk=(document.querySelector('input[name="patrolRisk"]:checked')||{}).value||'X';return {id:uid(),updatedAt:new Date().toISOString(),date:$('#patrolDate').value,area:$('#patrolArea').value.trim(),inspector:$('#patrolInspector').value.trim(),accidentType:$('#patrolAccidentType').value,inspectionItem:$('#patrolItem').value.trim(),observation:$('#patrolObservation').value.trim(),improvement:$('#patrolImprovement').value.trim(),scenario:$('#patrolScenario').value.trim(),urgency:$('#patrolUrgency').value,owner:$('#patrolOwner').value.trim(),due:$('#patrolDue').value,riskAssessment:risk,riskReason:$('#patrolRiskReason').value.trim(),thumbnail:thumbData||''}}
  function clearForm(keepDate=true){$('#patrolForm').reset();$('#patrolDate').value=keepDate?today():'';$('#patrolUrgency').value='계획 개선';radio('X');removeImage();$('#patrolContext').value=''}
  function render(){
    const box=$('#patrolRecordList');if(!records.length){box.innerHTML='<div class="worker-empty"><img src="../assets/jaeili-face-v4.png" alt="제일이"><strong>아직 저장된 순회점검 기록이 없습니다.</strong><p>현장 사진을 입력해 첫 점검일지를 만들어 보세요.</p></div>';return}
    box.innerHTML='<div class="patrol-record-grid">'+records.map(r=>`<article class="patrol-record"><div class="patrol-record-top">${r.thumbnail?`<img src="${esc(r.thumbnail)}" alt="점검 사진 썸네일">`:''}<div><span>${esc(r.date||'-')} · ${esc(r.area||'장소 미입력')}</span><h3>${esc(r.inspectionItem||'점검 기록')}</h3></div><span class="patrol-risk-pill ${r.riskAssessment==='O'?'on':''}">${r.riskAssessment==='O'?'수시평가 연계':'점검기록'}</span></div><dl><div><dt>재해유형</dt><dd>${esc(r.accidentType||'-')}</dd></div><div><dt>개선조치</dt><dd>${esc(r.improvement||'-')}</dd></div></dl><div class="patrol-record-actions">${r.riskAssessment==='O'?'<a class="worker-btn" href="risk-assessment.html#hazards">위험성평가 열기 →</a>':''}<button class="mini-btn delete" data-del="${esc(r.id)}" type="button">삭제</button></div></article>`).join('')+'</div>';
    box.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{if(confirm('이 순회점검 기록을 삭제할까요?\n연계된 위험성평가 기록은 별도로 유지됩니다.')){records=records.filter(x=>x.id!==b.dataset.del);write(STORE,records);render()}}));
  }
  $('#patrolCameraBtn').addEventListener('click',()=>$('#patrolImageInput').click());
  $('#patrolImageInput').addEventListener('change',e=>setImage(e.target.files&&e.target.files[0]));
  $('#patrolPasteZone').addEventListener('click',e=>e.currentTarget.focus());
  $('#patrolPasteZone').addEventListener('paste',e=>{const items=[...(e.clipboardData?.items||[])];const img=items.find(x=>x.type&&x.type.startsWith('image/'));if(img){e.preventDefault();setImage(img.getAsFile())}else setState('클립보드에서 이미지를 찾지 못했습니다.','bad')});
  $('#patrolRemoveImage').addEventListener('click',removeImage);$('#patrolAnalyzeBtn').addEventListener('click',analyze);
  $('#patrolFormClear').addEventListener('click',()=>{if(confirm('입력 내용을 초기화할까요?'))clearForm()});
  $('#patrolForm').addEventListener('submit',e=>{e.preventDefault();const row=collect();if(!row.date||!row.inspectionItem||!row.improvement||!row.accidentType)return alert('점검일, 재해유형, 점검사항, 개선조치 필요사항을 확인해 주세요.');if(row.riskAssessment==='O'){linkRisk(row);row.riskLinked=true}records.unshift(row);if(write(STORE,records)){render();alert(row.riskAssessment==='O'?'저장되었습니다.\nKRAS 위험성평가 유해·위험요인에도 자동 연계했습니다. 위험성 수준을 다시 확인해 주세요.':'순회점검일지가 저장되었습니다.');clearForm();window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})}});
  $('#patrolExport').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='순회점검일지_'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
  $('#patrolClearAll').addEventListener('click',()=>{if(!records.length)return alert('삭제할 기록이 없습니다.');if(confirm('순회점검 기록을 모두 삭제할까요?\n위험성평가로 연계된 기록은 별도로 유지됩니다.')){records=[];write(STORE,records);render()}});
  $('#patrolDate').value=today();render();
})();
