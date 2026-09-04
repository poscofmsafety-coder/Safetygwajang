/* =========================================================
   ④ 작업환경측정 통합관리 v8
   - CAS별 MSDS 대상 후보 → 예비조사 → 적용제외 검토 → 측정 → 주기관리
   - 시행규칙 제186·189·190조 및 안전보건규칙 제420·421조 흐름 반영
   - 자동판정은 '검토 제안'이며 사업장의 실제 작업조건/최신 고시 확인 후 확정
   ========================================================= */
let materials = JSON.parse(localStorage.getItem('sgw_env_materials') || '[]');
let envSelectedId = null;
function saveMatLS(){ localStorage.setItem('sgw_env_materials', JSON.stringify(materials)); }
function envEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function addMonthsISO(date,months){if(!date||!months)return'';const d=new Date(date+'T00:00:00');if(isNaN(d))return'';d.setMonth(d.getMonth()+Number(months));return d.toISOString().slice(0,10);}
function addDaysISO(date,days){if(!date)return'';const d=new Date(date+'T00:00:00');if(isNaN(d))return'';d.setDate(d.getDate()+Number(days));return d.toISOString().slice(0,10);}
function ensureEnvItem(m){
  m.workflow=m.workflow||{}; const w=m.workflow;
  const defaults={becameTargetDate:'',preSurveyDate:'',preSurveyDone:false,taskDescription:'',normalOperationConfirmed:false,exposedWorkers:'',chemicalUseState:'',workerParticipationNote:'',hazardFrequency:'',workHours:'',physicalState:'',monthlyQuantity:'',usePurpose:'',ventilation:'',ppeUse:'',estimatedSamples:'',estimatedCost:'',monthlyHours:'',monthlyRecurring:false,dailyMinutes:'',dailyRecurring:false,hourlyUseGrams:'',roomVolumeM3:'',specialPlace:false,ministerNoExemption:false,decisionConfirmed:'',decisionNote:'',measurementCompany:'',sampleMethod:'개인 시료채취',regionalSamplingReason:'',reportDate:'',unit:'',cycleRule:'standard',annualNoChange:false,annualTwoBelow:false,quarterlyDesignated:false,notes:''};
  Object.entries(defaults).forEach(([k,v])=>{if(w[k]===undefined)w[k]=v}); return m;
}
materials.forEach(ensureEnvItem);

function envMsdsTargets(){
  const out=[];
  (MATERIALS||[]).forEach(m=>{
    const comps=(m.composition||[]).filter(c=>c.cas&&c.cas!=='-');
    const rows=comps.length?comps:((m.cas&&m.cas!=='-')?[{name:m.name,cas:m.cas,content:'-'}]:[]);
    const seen=new Set();
    rows.forEach(c=>{
      if(seen.has(c.cas))return;seen.add(c.cas);
      const ci=(m.compInspections||[]).find(x=>x.cas===c.cas||x.inspection?.casNo===c.cas);const ins=ci?.inspection||null;
      const local=(typeof sgwLegalForCas==='function')?sgwLegalForCas(m,c.cas):{};const legal=ins?.legal||local||{};
      const apiTrue=ins?.ok&&ins.status==='FOUND'&&ins.legal?.workEnvTarget===true;
      const localTrue=local.workEnvTarget===true;
      if(apiTrue||localTrue){out.push({key:`${m.id}::${c.cas}`,productId:m.id,productName:m.name,name:c.name||ins?.matchedName||local.name||m.name,cas:c.cas,content:c.content||'-',legal:{...local,...(ins?.legal||{})},evidence:[...(local.evidence||[]),...(ins?.legal?.evidence||[])],needsConfirm:!(apiTrue||localTrue),sourceLabel:apiTrue?'KOSHA CAS 대조':'별표21·MSDS CAS 보조판정'});}
    });
  });
  return out;
}

function envAllCasInventory(){
  const out=[];
  (MATERIALS||[]).forEach(m=>{
    const comps=(m.composition||[]).filter(c=>c.cas&&c.cas!=='-');
    const rows=comps.length?comps:((m.cas&&m.cas!=='-')?[{name:m.name,cas:m.cas,content:'-'}]:[]);
    const seen=new Set();
    rows.forEach(c=>{
      if(seen.has(c.cas))return;seen.add(c.cas);
      const ci=(m.compInspections||[]).find(x=>x.cas===c.cas||x.inspection?.casNo===c.cas);
      const ins=ci?.inspection||null, apiLegal=ins?.legal||{}, local=(typeof sgwLegalForCas==='function')?sgwLegalForCas(m,c.cas):{}, legal={...local,...apiLegal};
      let state='pending',label='CAS 대조 필요';
      if(ins?.ok&&ins.status==='FOUND'&&apiLegal.workEnvTarget===true){state='target';label='KOSHA CAS 대상인자 확인';}
      else if(local.workEnvTarget===true){state='target';label='별표21 CAS 보조판정';}
      else if(ins?.ok&&ins.status==='FOUND'&&apiLegal.workEnvTarget===false){state='not-target';label='KOSHA 15항 대상 표기 없음';}
      else if(local.workEnvTarget===false){state='not-target';label='CAS 보조표 비대상';}
      else if(ins?.ok&&ins.status==='FOUND'){state='review';label='별표21 직접 확인 필요';}
      else if(m.envTarget===true){state='candidate';label='공급자 MSDS 15항 후보';}
      out.push({productId:m.id,productName:m.name,name:c.name||local.name||m.name,cas:c.cas,content:c.content||'-',state,label,legal,evidence:legal.evidence||[],needsConfirm:state==='candidate'||state==='review'||state==='pending'});
    });
  });
  return out;
}
function findEnvSource(productId,cas){return envMsdsTargets().find(x=>x.productId===productId&&x.cas===cas)||null;}
function importEnvTarget(t){
  // 동일 CAS를 여러 부서·작업장소에서 사용할 수 있으므로 중복 위치 등록을 허용합니다.
  const m=ensureEnvItem({id:Date.now()+Math.random(),sourceMaterialId:t.productId,sourceKey:t.key,productName:t.productName,name:t.name,cas:t.cas,content:t.content,site:'',dept:'',loc:'',cycle:null,twa:'',date:'',val:'',workers:0,special:t.legal?.specialManagement===true?'Y':'N',ratio:0,legalSnapshot:t.legal||{},lawEvidence:t.evidence||[],needsConfirm:!!t.needsConfirm,sourceLabel:t.sourceLabel||''});
  materials.unshift(m); envSelectedId=m.id; saveMatLS(); renderMat(materials); showToast(`${t.name} (${t.cas})를 예비조사 목록에 추가했습니다.`);
}
function addEnvWorkplace(id){
  const src=materials.find(x=>String(x.id)===String(id));if(!src)return;
  const copy=JSON.parse(JSON.stringify(src));copy.id=Date.now()+Math.random();copy.site=src.site||'';copy.dept='';copy.loc='';copy.date='';copy.val='';copy.nextDate='';copy.ratio=0;copy.workers=0;copy.workflow={...copy.workflow,preSurveyDate:'',preSurveyDone:false,taskDescription:'',exposedWorkers:'',measurementCompany:'',reportDate:'',notes:''};materials.unshift(ensureEnvItem(copy));envSelectedId=copy.id;saveMatLS();renderMat(materials);showToast('같은 물질의 새 부서·작업장소 기록을 만들었습니다.');
}
function envDeptSummaryHtml(){
  const groups=new Map();
  materials.forEach(m=>{
    const site=m.site||'사업장 미입력', dept=m.dept||'부서 미입력', key=site+' / '+dept;
    if(!groups.has(key))groups.set(key,{key,site:m.site||'',dept:m.dept||'',rows:[],samples:0,cost:0,locations:new Set()});
    const g=groups.get(key);g.rows.push(m);if(m.loc)g.locations.add(m.loc);g.samples+=Number(m.workflow?.estimatedSamples)||0;g.cost+=Number(m.workflow?.estimatedCost)||0;
  });
  if(!groups.size)return '<div class="text-center py-6 text-xs text-slate-400 border border-dashed rounded-xl">부서·작업장소를 등록하면 부서별 측정물질, 측정지점, 예상 시료건수와 비용을 한눈에 볼 수 있습니다.</div>';
  return '<div class="grid md:grid-cols-2 gap-3">'+[...groups.values()].map(g=>{
    const unique=[...new Map(g.rows.map(r=>[r.cas,r])).values()];const locs=[...g.locations];
    return `<button type="button" onclick="filterEnvDept('${envEsc(g.dept).replace(/'/g,"\\'")}')" class="text-left rounded-xl border border-slate-200 bg-white p-3 hover:border-teal-300 hover:bg-teal-50/30 transition"><div class="flex justify-between gap-2"><b class="text-sm text-slate-900">${envEsc(g.key)}</b><span class="text-[10px] text-teal-700 font-bold">${unique.length}물질 · ${g.rows.length}관리건</span></div><p class="text-[10px] text-slate-500 mt-1"><b>측정물질</b> ${unique.map(r=>`${envEsc(r.name)} (${envEsc(r.cas)})`).join(' · ')}</p><p class="text-[10px] text-slate-500 mt-1"><b>작업장소</b> ${locs.length?locs.map(envEsc).join(' · '):'미입력'}</p><p class="text-[10px] mt-2 text-slate-600">예상 시료 ${g.samples||0}건 · 예상비용 ${g.cost?g.cost.toLocaleString()+'원':'미입력'}</p></button>`;
  }).join('')+'</div>';
}
function filterEnvDept(dept){const el=document.getElementById('f4-dept');if(el){el.value=dept==='부서 미입력'?'':dept;applyFilter4();el.scrollIntoView({behavior:'smooth',block:'center'});}}
function syncEnvTargetsFromMsds(silent=false){
  const targets=envMsdsTargets();
  if(!targets.length){if(!silent&&typeof showToast==='function')showToast('CAS별 작업환경측정 대상 후보가 없습니다. MSDS 등록 후 KOSHA 대조를 먼저 실행하세요.');renderEnvWorkflow();return 0;}
  let added=0,updated=0;
  targets.forEach(t=>{
    const existing=materials.find(x=>x.sourceMaterialId===t.productId&&x.cas===t.cas);
    if(existing){
      existing.productName=t.productName;existing.name=t.name;existing.content=t.content;existing.legalSnapshot=t.legal||{};existing.lawEvidence=t.evidence||[];existing.needsConfirm=!!t.needsConfirm;existing.sourceLabel=t.sourceLabel||'';
      existing.special=t.legal?.specialManagement===true?'Y':existing.special||'N';ensureEnvItem(existing);recalcEnv(existing);updated++;return;
    }
    const m=ensureEnvItem({id:Date.now()+Math.random(),sourceMaterialId:t.productId,sourceKey:t.key,productName:t.productName,name:t.name,cas:t.cas,content:t.content,site:'',dept:'',loc:'',cycle:null,twa:'',date:'',val:'',workers:0,special:t.legal?.specialManagement===true?'Y':'N',ratio:0,legalSnapshot:t.legal||{},lawEvidence:t.evidence||[],needsConfirm:!!t.needsConfirm,sourceLabel:t.sourceLabel||''});
    materials.push(m);added++;
  });
  saveMatLS();renderMat(materials);
  if(!silent&&typeof showToast==='function')showToast(`CAS별 작업환경측정 후보 ${added}건 추가 · ${updated}건 갱신`);
  return added;
}
function calcAllowedConsumption(m){
  const w=m.workflow||{}, vol=Number(w.roomVolumeM3), use=Number(w.hourlyUseGrams);
  if(!(vol>0)||!(use>=0))return null; const effective=Math.min(vol,150), allowed=effective/15;
  return {allowed:Math.round(allowed*100)/100,use,eligible:use<=allowed};
}
function evaluateEnvExemption(m){
  const w=m.workflow||{}, legal=m.legalSnapshot||{}; const reasons=[], cautions=[];
  const monthly=Number(w.monthlyHours), daily=Number(w.dailyMinutes);
  const temporaryRaw=Number.isFinite(monthly)&&monthly>=0&&monthly<24 && !(monthly>=10&&w.monthlyRecurring);
  const shortTimeRaw=Number.isFinite(daily)&&daily>=0&&daily<60 && !w.dailyRecurring;
  const temporary=temporaryRaw&&!w.ministerNoExemption;
  const shortTime=shortTimeRaw&&!w.ministerNoExemption;
  const allowed=calcAllowedConsumption(m);
  if(w.ministerNoExemption)cautions.push('고용노동부장관 고시 물질/작업이면 임시·단시간 작업 적용제외를 사용할 수 없습니다.');
  if(temporary)reasons.push('임시작업 요건 검토 후보');
  if(shortTime)reasons.push('단시간작업 요건 검토 후보');
  if(legal.managementTarget===true&&allowed?.eligible){
    if(w.specialPlace||legal.specialManagement===true){
      cautions.push('특별관리물질 취급 장소·유기화합물 취급 특별장소·지하실·환기불충분 장소는 허용소비량 적용제외를 사용할 수 없습니다.');
    }else{
      reasons.push(`관리대상 유해물질 허용소비량 이하 후보 (${allowed.use}g/h ≤ ${allowed.allowed}g/h)`);
    }
  }
  if(reasons.length)return{suggestion:'exempt-review',label:'적용제외 검토 가능',reasons,blockers:cautions,allowed,temporary,shortTime};
  return{suggestion:'measure',label:'측정 실시 검토',reasons,blockers:cautions,allowed,temporary,shortTime};
}
function effectiveCycle(m){
  const w=m.workflow||{}; if(w.cycleRule==='quarterly')return 3; if(w.cycleRule==='annual')return 12; if(w.cycleRule==='manual')return Number(m.cycle)||null; return 6;
}
function recalcEnv(m){
  ensureEnvItem(m); const twa=parseFloat(m.twa),val=parseFloat(m.val);m.ratio=(twa>0&&Number.isFinite(val))?Math.round(val/twa*1000)/10:0;
  m.cycle=effectiveCycle(m); m.nextDate=(m.date&&m.cycle)?addMonthsISO(m.date,m.cycle):''; m.workflow.measurementDue=m.workflow.becameTargetDate?addDaysISO(m.workflow.becameTargetDate,30):''; return m;
}
materials.forEach(recalcEnv);
function envStepState(m){const w=m.workflow||{};return[!!w.preSurveyDone,!!w.decisionConfirmed,!!m.date,!!m.nextDate];}
function envLawPills(m){
  const l=m.legalSnapshot||{},a=[];
  if(m.needsConfirm)a.push('<span class="bg-amber-100 text-amber-800">CAS·함유량 확인 필요</span>');
  if(l.workEnvTarget===true)a.push('<span class="bg-sky-100 text-sky-700">별표21 대상인자</span>');
  if(l.managementTarget===true)a.push('<span class="bg-teal-100 text-teal-700">관리대상</span>');
  if(l.specialManagement===true)a.push('<span class="bg-rose-100 text-rose-700">특별관리</span>');
  return a.map(x=>x.replace('>',' class="text-[9px] font-bold px-1.5 py-0.5 rounded">')).join(' ');
}

function envInventoryStats(){
  const products=(MATERIALS||[]), components=products.flatMap(m=>m.composition||[]).filter(c=>c.cas&&c.cas!=='-');
  const inspections=products.flatMap(m=>m.compInspections||[]);
  const inspected=new Set(inspections.filter(x=>x.inspection?.status==='FOUND').map(x=>x.cas));
  const pending=new Set(components.map(c=>c.cas).filter(cas=>!inspected.has(cas)));
  return {products:products.length,cas:[...new Set(components.map(c=>c.cas))].length,inspected:inspected.size,pending:pending.size,targets:envMsdsTargets().length};
}
function renderEnvWorkflow(){
  const root=document.getElementById('envWorkflowRoot');if(!root)return;
  const inventory=envAllCasInventory(),targets=envMsdsTargets(),selected=materials.find(x=>x.id===envSelectedId)||null;
  const st=envInventoryStats();
  let html=`<section class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 mb-5 shadow-sm">
    <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4"><div><p class="text-[11px] font-black text-teal-700 tracking-widest">WORK ENVIRONMENT MEASUREMENT</p><h3 class="text-xl font-black text-slate-900 mt-1">작업환경측정, 순서대로 따라가세요</h3><p class="text-[11px] text-slate-600 mt-2 leading-5">처음 사용하는 경우 <b>대상물질 불러오기 → 부서·작업장소 입력 → 적용제외 확인 → 측정결과·다음 일정 관리</b> 순서로 진행하면 됩니다.</p></div><button onclick="syncEnvTargetsFromMsds()" class="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black px-4 py-2.5 rounded-xl">1. MSDS 대상물질 불러오기</button></div>
    <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-4">${[['1','대상물질 불러오기','MSDS의 CAS별 후보'],['2','부서·장소 입력','실제 사용하는 위치'],['3','적용제외 확인','임시·단시간·허용소비량'],['4','측정·주기 관리','결과와 다음 측정일']].map(x=>`<div class="rounded-xl border border-slate-200 bg-slate-50 p-3"><b class="text-teal-700 text-xs">${x[0]}</b><p class="text-[11px] font-black text-slate-800 mt-1">${x[1]}</p><p class="text-[9px] text-slate-500 mt-1">${x[2]}</p></div>`).join('')}</div>
    <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3"><div class="rounded-xl bg-slate-50 border p-2"><b class="text-xs">${st.products}</b><p class="text-[9px] text-slate-500">등록 MSDS</p></div><div class="rounded-xl bg-slate-50 border p-2"><b class="text-xs">${st.cas}</b><p class="text-[9px] text-slate-500">CAS 성분</p></div><div class="rounded-xl bg-emerald-50 border border-emerald-100 p-2"><b class="text-xs text-emerald-800">${st.inspected}</b><p class="text-[9px] text-emerald-700">CAS 대조완료</p></div><div class="rounded-xl bg-amber-50 border border-amber-100 p-2"><b class="text-xs text-amber-800">${st.pending}</b><p class="text-[9px] text-amber-700">대조 필요</p></div><div class="rounded-xl bg-sky-50 border border-sky-100 p-2"><b class="text-xs text-sky-800">${st.targets}</b><p class="text-[9px] text-sky-700">측정 대상 후보</p></div></div>
  </section>`;
  html+=`<details class="bg-white border border-slate-200 rounded-2xl p-4 mb-5"><summary class="cursor-pointer flex items-center justify-between gap-3"><div><b class="text-sm text-slate-900">CAS별 대상물질 확인표</b><p class="text-[10px] text-slate-500 mt-1">필요할 때 펼쳐서 어떤 성분이 작업환경측정 후보인지 확인합니다.</p></div><span class="text-xs font-black text-teal-700">${inventory.length}개 CAS · 후보 ${targets.length}개</span></summary><div class="overflow-x-auto mt-4"><table class="w-full text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="p-2 text-left">제품</th><th class="p-2 text-left">구성성분</th><th class="p-2">CAS</th><th class="p-2">함유량</th><th class="p-2">검토상태</th><th class="p-2">추가</th></tr></thead><tbody>${inventory.length?inventory.map(r=>{const t=targets.find(x=>x.productId===r.productId&&x.cas===r.cas),tracked=materials.some(x=>x.sourceMaterialId===r.productId&&x.cas===r.cas);const badge=r.state==='target'?'대상인자 확인':r.state==='not-target'?'대상 표기 없음':r.state==='candidate'?'MSDS 후보 · 확인 필요':r.state==='review'?'직접 확인 필요':'CAS 대조 필요';return`<tr class="border-t"><td class="p-2">${envEsc(r.productName)}</td><td class="p-2 font-bold">${envEsc(r.name)}</td><td class="p-2 text-center font-mono">${envEsc(r.cas)}</td><td class="p-2 text-center">${envEsc(r.content)}</td><td class="p-2 text-center ${r.state==='target'?'text-sky-700 font-bold':'text-slate-500'}">${badge}</td><td class="p-2 text-center">${t?`<button ${tracked?'disabled':''} onclick='importEnvTarget(${JSON.stringify(t).replace(/'/g,"&#39;")})' class="px-2 py-1 rounded-lg text-[10px] font-bold ${tracked?'bg-slate-100 text-slate-400':'bg-teal-50 text-teal-700 border border-teal-200'}">${tracked?'추가됨':'이 장소에 추가'}</button>`:'-'}</td></tr>`}).join(''):'<tr><td colspan="6" class="p-7 text-center text-slate-400">등록된 MSDS 구성성분이 없습니다.</td></tr>'}</tbody></table></div></details>`;
  html+=`<section class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 mb-5"><div class="flex items-center justify-between gap-3"><div><h3 class="font-black text-slate-900">부서·작업장소별 측정 관리</h3><p class="text-[11px] text-slate-500 mt-1">같은 물질도 사용하는 부서와 작업장소가 다르면 별도 항목으로 추가해 관리할 수 있습니다.</p></div><span class="text-xs text-slate-500">관리 ${materials.length}건</span></div><div class="grid lg:grid-cols-[330px_1fr] gap-4 mt-4"><div class="space-y-2 max-h-[690px] overflow-y-auto">${materials.length?materials.map(m=>{const state=envStepState(m);return`<button onclick="selectEnvWorkflow(${JSON.stringify(m.id)})" class="w-full text-left rounded-xl border ${m.id===envSelectedId?'border-teal-500 bg-teal-50':'border-slate-200 bg-white hover:border-teal-300'} p-3"><div class="flex justify-between gap-2"><b class="text-xs text-slate-900">${envEsc(m.name)}</b><span class="font-mono text-[10px]">${envEsc(m.cas)}</span></div><p class="text-[10px] text-slate-500 mt-1">${envEsc(m.dept||'부서 미입력')} · ${envEsc(m.loc||'작업장소 미입력')}</p><div class="flex gap-1 mt-2">${state.map(on=>`<span class="w-8 h-1.5 rounded ${on?'bg-teal-500':'bg-slate-200'}"></span>`).join('')}</div></button>`}).join(''):'<div class="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">위의 <b>MSDS 대상물질 불러오기</b>부터 시작하세요.</div>'}</div><div>${selected?renderEnvEditor(selected):'<div class="h-full min-h-[260px] flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 text-sm">왼쪽에서 물질을 선택하면 입력 화면이 열립니다.</div>'}</div></div></section>`;
  root.innerHTML=html;
}
function selectEnvWorkflow(id){envSelectedId=id;renderEnvWorkflow();}
function checked(v){return v?'checked':'';}
function renderEnvEditor(m){
  ensureEnvItem(m);const w=m.workflow,ev=evaluateEnvExemption(m),allowed=ev.allowed,due=w.measurementDue||'';const decisionLabel=w.decisionConfirmed==='exempt'?'적용제외로 관리':w.decisionConfirmed==='measure'?'작업환경측정 실시':'확인 필요';
  return `<div class="rounded-xl border border-slate-200 overflow-hidden"><div class="bg-slate-900 text-white p-4"><div class="flex justify-between gap-3"><div><b class="text-base">${envEsc(m.name)}</b><p class="text-[10px] text-slate-300 mt-1">${envEsc(m.productName||'')} · CAS ${envEsc(m.cas)} · 함유량 ${envEsc(m.content||'-')}</p></div><div class="flex gap-1 flex-wrap">${envLawPills(m)}</div></div></div><div class="p-4 space-y-5">
  <section class="rounded-xl bg-teal-50/40 border border-teal-100 p-3"><h4 class="text-sm font-black text-teal-900">1. 어디에서 사용하나요?</h4><p class="text-[10px] text-slate-500 mt-1">부서와 작업장소를 먼저 입력하면 부서별 측정물질을 한눈에 정리할 수 있습니다.</p><div class="grid md:grid-cols-2 gap-2 mt-3">${envInput(m,'site','사업장','text',m.site)}${envInput(m,'dept','부서명','text',m.dept)}${envInput(m,'loc','작업장소 / 공정','text',m.loc)}${envInput(m,'workers','노출 근로자 수','number',m.workers)}<label class="text-[10px] font-bold text-slate-600 md:col-span-2">주요 작업내용<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.taskDescription',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="예: 산세라인 탱크 투입, 1일 2시간, 국소배기 가동">${envEsc(w.taskDescription)}</textarea></label><label class="text-[10px] font-bold text-slate-600 md:col-span-2">화학물질 사용상태<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.chemicalUseState',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="예: 황산 70%, 하루 3kg, 밀폐 배관 이송">${envEsc(w.chemicalUseState)}</textarea></label>${envCheck(m,'workflow.preSurveyDone','예비조사를 완료했습니다',w.preSurveyDone)}</div><details class="mt-3 rounded-lg border border-slate-200 bg-white p-3"><summary class="cursor-pointer text-xs font-black text-slate-700">예비조사 상세 항목 펼치기</summary><div class="grid md:grid-cols-3 gap-2 mt-3">${envInput(m,'workflow.becameTargetDate','대상 작업장이 된 날','date',w.becameTargetDate)}${envInput(m,'workflow.preSurveyDate','예비조사일','date',w.preSurveyDate)}${envInput(m,'workflow.hazardFrequency','유해인자 발생주기','text',w.hazardFrequency)}${envInput(m,'workflow.workHours','작업/노출시간','text',w.workHours)}${envInput(m,'workflow.monthlyQuantity','월 취급량','text',w.monthlyQuantity)}${envInput(m,'workflow.usePurpose','사용 용도','text',w.usePurpose)}${envInput(m,'workflow.physicalState','물리적 상태','text',w.physicalState)}${envInput(m,'workflow.ventilation','환기·밀폐 상태','text',w.ventilation)}${envInput(m,'workflow.ppeUse','보호구 사용','text',w.ppeUse)}${envInput(m,'workflow.estimatedSamples','예상 시료수','number',w.estimatedSamples)}${envInput(m,'workflow.estimatedCost','예상 비용(원)','number',w.estimatedCost)}</div><div class="grid md:grid-cols-2 gap-2 mt-2">${envCheck(m,'workflow.normalOperationConfirmed','평소 작업을 대표하는 조건인지 확인',w.normalOperationConfirmed)}</div></details>${due?`<p class="text-[10px] text-sky-700 mt-2">최초 측정 관리일: <b>${due}</b></p>`:''}</section>
  <section class="rounded-xl border border-slate-200 p-3"><h4 class="text-sm font-black text-slate-900">2. 측정에서 제외될 수 있는 작업인가요?</h4><p class="text-[10px] text-slate-500 mt-1">임시·단시간 작업이나 허용소비량 조건을 순서대로 입력하면 검토 포인트를 정리합니다.</p><div class="grid md:grid-cols-2 gap-2 mt-3"><div class="rounded-lg bg-slate-50 p-2">${envInput(m,'workflow.monthlyHours','한 달 총 취급시간(h)','number',w.monthlyHours)}<div class="mt-2">${envCheck(m,'workflow.monthlyRecurring','이 작업이 매월 반복됩니다',w.monthlyRecurring)}</div></div><div class="rounded-lg bg-slate-50 p-2">${envInput(m,'workflow.dailyMinutes','하루 취급시간(분)','number',w.dailyMinutes)}<div class="mt-2">${envCheck(m,'workflow.dailyRecurring','이 작업이 매일 반복됩니다',w.dailyRecurring)}</div></div><div class="rounded-lg bg-slate-50 p-2">${envInput(m,'workflow.hourlyUseGrams','시간당 사용량(g)','number',w.hourlyUseGrams)}</div><div class="rounded-lg bg-slate-50 p-2">${envInput(m,'workflow.roomVolumeM3','작업장 공기부피(m³)','number',w.roomVolumeM3)}</div></div><details class="mt-2"><summary class="cursor-pointer text-[10px] font-black text-slate-600">적용제외 제한조건 확인</summary><div class="grid md:grid-cols-2 gap-2 mt-2">${envCheck(m,'workflow.specialPlace','특별관리물질·특별장소·환기불충분 등 제한조건이 있습니다',w.specialPlace)}${envCheck(m,'workflow.ministerNoExemption','임시·단시간 적용제외가 제한되는 물질인지 확인했습니다',w.ministerNoExemption)}</div></details><div class="mt-3 rounded-lg ${ev.suggestion==='exempt-review'?'bg-amber-50 border-amber-200':'bg-sky-50 border-sky-200'} border p-3 text-[10px] leading-5"><b>${envEsc(ev.label)}</b>${ev.reasons.length?`<p>확인된 내용: ${envEsc(ev.reasons.join(' · '))}</p>`:''}${ev.blockers.length?`<p class="text-rose-700">추가 확인: ${envEsc(ev.blockers.join(' · '))}</p>`:''}${allowed?`<p>허용소비량 계산값 <b>${allowed.allowed}g/h</b> · 입력 사용량 ${allowed.use}g/h</p>`:''}</div><div class="mt-3"><label class="text-xs font-black text-slate-700">최종 관리 선택<select onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.decisionConfirmed',this.value)" class="ml-2 border rounded-lg px-2 py-1.5 text-xs"><option value="" ${!w.decisionConfirmed?'selected':''}>확인 필요</option><option value="measure" ${w.decisionConfirmed==='measure'?'selected':''}>작업환경측정 실시</option><option value="exempt" ${w.decisionConfirmed==='exempt'?'selected':''}>적용제외로 관리</option></select></label><span class="ml-2 text-[10px] text-slate-500">${decisionLabel}</span></div></section>
  <section class="rounded-xl border border-slate-200 p-3 ${w.decisionConfirmed==='exempt'?'opacity-60':''}"><h4 class="text-sm font-black text-slate-900">3. 측정 결과를 입력하세요</h4><div class="grid md:grid-cols-2 gap-2 mt-3">${envInput(m,'workflow.measurementCompany','측정기관','text',w.measurementCompany)}${envInput(m,'date','측정일','date',m.date)}${envInput(m,'twa','노출기준(TWA)','number',m.twa)}${envInput(m,'val','측정값','number',m.val)}${envInput(m,'workflow.unit','단위','text',w.unit)}${envInput(m,'workflow.reportDate','결과 수령일','date',w.reportDate)}</div><details class="mt-2"><summary class="cursor-pointer text-[10px] font-black text-slate-600">시료채취 방법</summary><div class="grid md:grid-cols-2 gap-2 mt-2"><label class="text-[10px] font-bold text-slate-600">방법<select onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.sampleMethod',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs"><option ${w.sampleMethod==='개인 시료채취'?'selected':''}>개인 시료채취</option><option ${w.sampleMethod==='지역 시료채취'?'selected':''}>지역 시료채취</option></select></label>${w.sampleMethod==='지역 시료채취'?envInput(m,'workflow.regionalSamplingReason','지역 시료채취 사유','text',w.regionalSamplingReason):''}</div></details></section>
  <section class="rounded-xl border border-slate-200 p-3"><h4 class="text-sm font-black text-slate-900">4. 다음 측정일을 관리하세요</h4><div class="grid md:grid-cols-2 gap-2 mt-3"><label class="text-[10px] font-bold text-slate-600">관리 주기<select onchange="updateEnvCycleRule(${JSON.stringify(m.id)},this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs"><option value="standard" ${w.cycleRule==='standard'?'selected':''}>기본 6개월</option><option value="quarterly" ${w.cycleRule==='quarterly'?'selected':''}>3개월</option><option value="annual" ${w.cycleRule==='annual'?'selected':''}>12개월 요건 검토</option><option value="manual" ${w.cycleRule==='manual'?'selected':''}>직접 입력</option></select></label>${w.cycleRule==='manual'?envInput(m,'cycle','직접 주기(개월)','number',m.cycle):`<div class="rounded-lg bg-slate-50 border p-2 text-[10px] text-slate-600">현재 주기 <b>${m.cycle||'-'}개월</b><br>차기 측정일 <b>${m.nextDate||'측정일 입력 필요'}</b></div>`}</div><details class="mt-2"><summary class="cursor-pointer text-[10px] font-black text-slate-600">주기 변경 요건 메모</summary><div class="grid md:grid-cols-2 gap-2 mt-2">${envCheck(m,'workflow.quarterlyDesignated','3개월 주기 적용 요건 확인',w.quarterlyDesignated)}${envCheck(m,'workflow.annualNoChange','최근 1년 공정·설비·방법·물질 변경 없음',w.annualNoChange)}${envCheck(m,'workflow.annualTwoBelow','최근 2회 연속 기준 미만 확인',w.annualTwoBelow)}</div></details></section>
  </div></div>`;
}
function envInput(m,path,label,type,value){return `<label class="text-[10px] font-bold text-slate-600">${label}<input type="${type}" value="${envEsc(value??'')}" onchange="updateEnvPath(${JSON.stringify(m.id)},'${path}',this.value)" class="mt-1 w-full border border-slate-300 rounded-lg px-2 py-1.5 text-xs"></label>`;}
function envCheck(m,path,label,value){return `<label class="flex items-start gap-2 rounded-lg bg-slate-50 border border-slate-200 p-2 text-[10px] font-bold text-slate-600"><input type="checkbox" class="mt-0.5" ${checked(value)} onchange="updateEnvPath(${JSON.stringify(m.id)},'${path}',this.checked)"><span>${label}</span></label>`;}
function updateEnvPath(id,path,value){
  const m=materials.find(x=>x.id===id);if(!m)return;ensureEnvItem(m);const parts=path.split('.');let o=m;for(let i=0;i<parts.length-1;i++){o[parts[i]]=o[parts[i]]||{};o=o[parts[i]];}const k=parts.at(-1);if(['workers','cycle'].includes(k))value=Number(value)||0;o[k]=value;recalcEnv(m);saveMatLS();renderMat(materials);
}
function updateEnvCycleRule(id,value){const m=materials.find(x=>x.id===id);if(!m)return;m.workflow.cycleRule=value;if(value==='quarterly')m.workflow.quarterlyDesignated=true;recalcEnv(m);saveMatLS();renderMat(materials);}

function renderMat(list){
  materials.forEach(recalcEnv); const grid=document.getElementById('matGrid'),empty=document.getElementById('matEmpty');if(!grid)return;
  if(!list.length){grid.innerHTML='';empty?.classList.remove('hidden')}else empty?.classList.add('hidden');
  const today=new Date();let soon=0,bad=0,workers=0,locs=new Set();
  grid.innerHTML=list.map(m=>{recalcEnv(m);const next=m.nextDate?new Date(m.nextDate+'T00:00:00'):null,dday=next?Math.ceil((next-today)/86400000):null;if(dday!==null&&dday<30&&dday>=0)soon++;if(m.ratio>100)bad++;workers+=Number(m.workers)||0;if(m.site||m.loc)locs.add((m.site||'')+'/'+(m.loc||''));const w=m.workflow||{},decision=w.decisionConfirmed==='exempt'?'<span class="bg-slate-100 text-slate-700">적용제외 관리</span>':w.decisionConfirmed==='measure'?'<span class="bg-sky-100 text-sky-700">측정대상</span>':'<span class="bg-amber-100 text-amber-700">판단 필요</span>';return`<div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition"><div class="flex gap-1 flex-wrap mb-2">${decision.replace('>',' class="text-[10px] font-bold px-1.5 py-0.5 rounded">')}${m.special==='Y'?'<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">특별관리</span>':''}</div><p class="text-sm font-black text-gray-900">${envEsc(m.name)}</p><p class="text-[10px] text-gray-500 mt-1">제품 ${envEsc(m.productName||'-')} · CAS ${envEsc(m.cas)} · 함유량 ${envEsc(m.content||'-')}</p><p class="text-[10px] text-gray-500 mt-1">${envEsc(m.site||'사업장 미입력')} · ${envEsc(m.dept||'부서 미입력')} · ${envEsc(m.loc||'공정 미입력')}</p><div class="mt-3 bg-slate-50 rounded-lg p-2 text-[10px]"><div class="flex justify-between"><span>최근 측정 ${envEsc(m.date||'-')}</span><b>${envEsc(m.val||'-')} / ${envEsc(m.twa||'-')} ${envEsc(w.unit||'')}</b></div><div class="mt-1 flex justify-between"><span>노출비율</span><b class="${m.ratio>100?'text-rose-600':'text-slate-700'}">${m.ratio||0}%</b></div></div>${m.nextDate?`<p class="text-[10px] mt-2 ${dday<0?'text-rose-600':dday<30?'text-amber-600':'text-emerald-600'}">차기 측정 ${m.nextDate} · ${dday<0?'기한 '+Math.abs(dday)+'일 경과':'D-'+dday}</p>`:''}<div class="mt-3 pt-3 border-t flex gap-2"><button onclick="selectEnvWorkflow(${JSON.stringify(m.id)});document.getElementById('envWorkflowRoot').scrollIntoView({behavior:'smooth'})" class="flex-1 border rounded py-1.5 text-xs font-bold text-teal-700">예비조사·측정 관리</button><button onclick="addEnvWorkplace(${JSON.stringify(m.id)})" class="border border-teal-200 text-teal-700 rounded px-3 py-1.5 text-xs font-bold">장소 추가</button><button onclick="editMat(${JSON.stringify(m.id)})" class="border rounded px-3 py-1.5 text-xs">기본편집</button><button onclick="delMat(${JSON.stringify(m.id)})" class="border border-rose-200 text-rose-600 rounded px-3 py-1.5 text-xs">삭제</button></div></div>`}).join('');
  document.getElementById('k4-total').innerHTML=list.length+'<span class="text-xs text-gray-500"> 건</span>';document.getElementById('k4-soon').innerHTML=soon+'<span class="text-xs text-gray-500"> 건</span>';document.getElementById('k4-bad').innerHTML=bad+'<span class="text-xs text-gray-500"> 건</span>';document.getElementById('k4-worker').innerHTML=workers+'<span class="text-xs text-gray-500"> 명</span>';document.getElementById('k4-loc').innerHTML=locs.size+'<span class="text-xs text-gray-500"> 개</span>';const ds=document.getElementById('envDeptSummary');if(ds)ds.innerHTML=envDeptSummaryHtml();renderEnvWorkflow();
}
function applyFilter4(){const site=(document.getElementById('f4-site')?.value||'').toLowerCase(),dept=(document.getElementById('f4-dept')?.value||'').toLowerCase(),q=(document.getElementById('f4-search')?.value||'').toLowerCase(),status=document.getElementById('f4-status')?.value||'';const today=new Date();renderMat(materials.filter(m=>{if(site&&!String(m.site||'').toLowerCase().includes(site))return false;if(dept&&!String(m.dept||'').toLowerCase().includes(dept))return false;if(q&&!(`${m.name} ${m.cas} ${m.productName||''} ${m.site||''} ${m.dept||''} ${m.loc||''}`).toLowerCase().includes(q))return false;if(status){const d=m.nextDate?Math.ceil((new Date(m.nextDate+'T00:00:00')-today)/86400000):null;const st=m.ratio>100?'bad':(d!==null&&d<30?'soon':'ok');if(st!==status)return false;}return true;}));}
function resetMat(){['f4-site','f4-dept','f4-status','f4-search'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderMat(materials);}

let editMatId=null;
function openMatModal(){editMatId=null;document.getElementById('matModalTitle').textContent='측정물질 수동 등록';['m-name','m-cas','m-site','m-dept','m-loc','m-twa','m-date','m-val'].forEach(id=>document.getElementById(id).value='');document.getElementById('m-cycle').value='';document.getElementById('m-workers').value=0;document.getElementById('m-special').value='N';document.getElementById('matModal').classList.remove('hidden');document.getElementById('matModal').classList.add('flex');}
function editMat(id){const m=materials.find(x=>x.id===id);if(!m)return;editMatId=id;document.getElementById('matModalTitle').textContent='측정물질 기본정보 수정';document.getElementById('m-name').value=m.name||'';document.getElementById('m-cas').value=m.cas||'';document.getElementById('m-site').value=m.site||'';document.getElementById('m-dept').value=m.dept||'';document.getElementById('m-loc').value=m.loc||'';document.getElementById('m-cycle').value=m.cycle||'';document.getElementById('m-twa').value=m.twa||'';document.getElementById('m-date').value=m.date||'';document.getElementById('m-val').value=m.val||'';document.getElementById('m-workers').value=m.workers||0;document.getElementById('m-special').value=m.special||'N';document.getElementById('matModal').classList.remove('hidden');document.getElementById('matModal').classList.add('flex');}
function closeMatModal(){document.getElementById('matModal').classList.add('hidden');document.getElementById('matModal').classList.remove('flex');}
function saveMat(){const obj={name:document.getElementById('m-name').value.trim(),cas:document.getElementById('m-cas').value.trim(),site:document.getElementById('m-site').value.trim(),dept:document.getElementById('m-dept').value.trim(),loc:document.getElementById('m-loc').value.trim(),cycle:Number(document.getElementById('m-cycle').value)||null,twa:document.getElementById('m-twa').value.trim(),date:document.getElementById('m-date').value,val:document.getElementById('m-val').value.trim(),workers:Number(document.getElementById('m-workers').value)||0,special:document.getElementById('m-special').value,ratio:0};if(!obj.name){alert('물질명을 입력하세요.');return;}if(editMatId){const i=materials.findIndex(x=>x.id===editMatId);materials[i]={...materials[i],...obj};ensureEnvItem(materials[i]);recalcEnv(materials[i]);}else{obj.id=Date.now();obj.productName='수동 등록';materials.unshift(ensureEnvItem(obj));}saveMatLS();renderMat(materials);closeMatModal();showToast('저장되었습니다.');}
function delMat(id){if(!confirm('이 작업환경측정 관리 항목을 삭제하시겠습니까?'))return;materials=materials.filter(x=>x.id!==id);if(envSelectedId===id)envSelectedId=null;saveMatLS();renderMat(materials);}
