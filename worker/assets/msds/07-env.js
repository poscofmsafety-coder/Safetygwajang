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
  const defaults={becameTargetDate:'',preSurveyDate:'',preSurveyDone:false,taskDescription:'',normalOperationConfirmed:false,exposedWorkers:'',chemicalUseState:'',workerParticipationNote:'',monthlyHours:'',monthlyRecurring:false,dailyMinutes:'',dailyRecurring:false,hourlyUseGrams:'',roomVolumeM3:'',specialPlace:false,ministerNoExemption:false,decisionConfirmed:'',decisionNote:'',measurementCompany:'',sampleMethod:'개인 시료채취',regionalSamplingReason:'',reportDate:'',unit:'',cycleRule:'standard',annualNoChange:false,annualTwoBelow:false,quarterlyDesignated:false,notes:''};
  Object.entries(defaults).forEach(([k,v])=>{if(w[k]===undefined)w[k]=v}); return m;
}
materials.forEach(ensureEnvItem);

function envMsdsTargets(){
  const out=[];
  (MATERIALS||[]).forEach(m=>{
    const comps=m.composition||[], inspections=m.compInspections||[];
    const trueRows=inspections.filter(x=>x.inspection?.ok&&x.inspection?.status==='FOUND'&&x.inspection?.legal?.workEnvTarget===true);
    trueRows.forEach(x=>{
      const c=comps.find(v=>v.cas===x.cas)||{};
      out.push({key:`${m.id}::${x.cas}`,productId:m.id,productName:m.name,name:c.name||x.inspection.matchedName||m.name,cas:x.cas,content:c.content||'-',legal:x.inspection.legal||{},evidence:x.inspection.legal?.evidence||[],needsConfirm:false});
    });
    // 공급자 MSDS 15항에 작업환경측정 관련 정보가 있으나 KOSHA CAS 대조가 아직 없으면
    // 대표 CAS 한 개를 임의 확정하지 않고 3항의 모든 구성성분을 '확인 후보'로 펼칩니다.
    // 혼합물 함유량 기준은 유해인자별로 달라질 수 있으므로 여기서는 최종 대상 판정을 하지 않습니다.
    if(!trueRows.length&&m.envTarget===true&&!inspections.length){
      const candidates=(comps||[]).filter(c=>c.cas&&c.cas!=='-');
      if(!candidates.length&&m.cas&&m.cas!=='-') candidates.push({name:m.name,cas:m.cas,content:'-'});
      const seen=new Set();
      candidates.forEach(c=>{
        if(seen.has(c.cas))return;seen.add(c.cas);
        out.push({key:`${m.id}::${c.cas}`,productId:m.id,productName:m.name,name:c.name||m.name,cas:c.cas,content:c.content||'-',legal:{workEnvTarget:null,managementTarget:null,specialManagement:null},evidence:m.regulatoryProfile?.evidence||[],needsConfirm:true,sourceLabel:'MSDS 15항 후보 · CAS/함유량 대조 필요'});
      });
    }
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
      const ins=ci?.inspection||null, legal=ins?.legal||{};
      let state='pending',label='CAS 대조 필요';
      if(ins?.ok&&ins.status==='FOUND'&&legal.workEnvTarget===true){state='target';label='별표21 대상인자 확인';}
      else if(ins?.ok&&ins.status==='FOUND'&&legal.workEnvTarget===false){state='not-target';label='KOSHA 15항 대상 표기 없음';}
      else if(ins?.ok&&ins.status==='FOUND'){state='review';label='별표21 직접 확인 필요';}
      else if(m.envTarget===true){state='candidate';label='공급자 MSDS 15항 후보';}
      out.push({productId:m.id,productName:m.name,name:c.name||m.name,cas:c.cas,content:c.content||'-',state,label,legal,evidence:legal.evidence||[],needsConfirm:state==='candidate'||state==='review'||state==='pending'});
    });
  });
  return out;
}
function findEnvSource(productId,cas){return envMsdsTargets().find(x=>x.productId===productId&&x.cas===cas)||null;}
function importEnvTarget(t){
  if(materials.some(x=>x.sourceMaterialId===t.productId&&x.cas===t.cas)){showToast('이미 작업환경측정 관리목록에 있습니다.');return;}
  const m=ensureEnvItem({id:Date.now()+Math.random(),sourceMaterialId:t.productId,sourceKey:t.key,productName:t.productName,name:t.name,cas:t.cas,content:t.content,site:'',dept:'',loc:'',cycle:null,twa:'',date:'',val:'',workers:0,special:t.legal?.specialManagement===true?'Y':'N',ratio:0,legalSnapshot:t.legal||{},lawEvidence:t.evidence||[],needsConfirm:!!t.needsConfirm,sourceLabel:t.sourceLabel||''});
  materials.unshift(m); envSelectedId=m.id; saveMatLS(); renderMat(materials); showToast(`${t.name} (${t.cas})를 예비조사 목록에 추가했습니다.`);
}
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
function envStepState(m){const w=m.workflow||{};return[true,!!w.preSurveyDone,!!w.decisionConfirmed,!!m.date,!!m.nextDate];}
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
  const inventory=envAllCasInventory(), targets=envMsdsTargets(), selected=materials.find(x=>x.id===envSelectedId)||null;
  const stages=[['1','전체 MSDS·CAS 파악'],['2','예비조사'],['3','적용제외 검토'],['4','측정·결과'],['5','주기관리']];
  let html=`<section class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 mb-5 shadow-sm"><div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3"><div><p class="text-[11px] font-black text-teal-700 tracking-widest">LEGAL WORKFLOW · 2026.08.01 시행 기준</p><h3 class="text-lg font-black text-slate-900 mt-1">작업환경측정 법정 흐름</h3><p class="text-[11px] text-slate-600 mt-1 leading-5">MSDS·CAS 대상 후보를 모두 파악한 뒤 예비조사를 실시하고, 허용소비량·임시작업·단시간작업 등 적용제외 여부를 검토한 다음 대상이면 측정·결과보고·주기관리로 이어집니다.</p></div><button onclick="syncEnvTargetsFromMsds()" class="shrink-0 bg-teal-600 hover:bg-teal-700 text-white text-xs font-black px-4 py-2 rounded-xl">MSDS 대상 후보 전체 가져오기</button></div><div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-4">${stages.map(([n,t])=>`<div class="rounded-xl border border-slate-200 bg-slate-50 p-2.5"><b class="text-teal-700 text-xs">STEP ${n}</b><p class="text-[11px] font-bold text-slate-700 mt-1">${t}</p></div>`).join('')}</div><div class="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-[10px] leading-5 text-amber-900"><b>중요:</b> 자동 로직은 법정 흐름을 빠뜨리지 않도록 돕는 검토 도구입니다. KOSHA API는 참고자료이므로 실제 공급자 MSDS, 별표 21, 최신 고시와 현장 노출조건을 최종 확인하세요.</div>${(()=>{const st=envInventoryStats();return `<div class="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3"><div class="rounded-xl bg-slate-50 border p-2"><b class="text-xs text-slate-900">${st.products}</b><p class="text-[9px] text-slate-500">등록 MSDS</p></div><div class="rounded-xl bg-slate-50 border p-2"><b class="text-xs text-slate-900">${st.cas}</b><p class="text-[9px] text-slate-500">CAS 구성성분</p></div><div class="rounded-xl bg-emerald-50 border border-emerald-100 p-2"><b class="text-xs text-emerald-800">${st.inspected}</b><p class="text-[9px] text-emerald-700">공공데이터 대조완료</p></div><div class="rounded-xl bg-amber-50 border border-amber-100 p-2"><b class="text-xs text-amber-800">${st.pending}</b><p class="text-[9px] text-amber-700">CAS 대조 필요</p></div><div class="rounded-xl bg-sky-50 border border-sky-100 p-2"><b class="text-xs text-sky-800">${st.targets}</b><p class="text-[9px] text-sky-700">작측 대상 후보</p></div></div>`})()}</section>`;
  html+=`<section class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 mb-5"><div class="flex items-center justify-between gap-3"><div><h3 class="font-black text-slate-900">STEP 1 · 전체 MSDS·CAS 인벤토리</h3><p class="text-[11px] text-slate-500 mt-1">등록된 MSDS의 <b>구성성분 CAS를 전부 펼쳐</b> 별표 21 대상인자 여부를 CAS별로 구분합니다. 제품 전체에 한 번에 ‘작측 대상’ 표시를 하지 않습니다.</p></div><span class="text-xs font-black text-teal-700">${inventory.length}개 CAS · 대상/후보 ${targets.length}개</span></div><div class="overflow-x-auto mt-3"><table class="w-full text-[11px]"><thead><tr class="bg-slate-50 text-slate-600"><th class="p-2 text-left">제품</th><th class="p-2 text-left">구성성분</th><th class="p-2">CAS</th><th class="p-2">함유량</th><th class="p-2">별표21/CAS 검토</th><th class="p-2">관리</th></tr></thead><tbody>${inventory.length?inventory.map(r=>{const t=targets.find(x=>x.productId===r.productId&&x.cas===r.cas);const tracked=materials.some(x=>x.sourceMaterialId===r.productId&&x.cas===r.cas);const badge=r.state==='target'?'<span class="font-bold text-sky-700">대상인자 확인</span>':r.state==='not-target'?'<span class="text-slate-500">대상 표기 없음</span>':r.state==='candidate'?'<span class="text-amber-700">15항 후보 · 대조 필요</span>':r.state==='review'?'<span class="text-amber-700">별표21 확인 필요</span>':'<span class="text-amber-700">CAS 대조 필요</span>';return`<tr class="border-t"><td class="p-2">${envEsc(r.productName)}</td><td class="p-2 font-bold">${envEsc(r.name)}</td><td class="p-2 text-center font-mono">${envEsc(r.cas)}</td><td class="p-2 text-center">${envEsc(r.content)}</td><td class="p-2 text-center">${badge}</td><td class="p-2 text-center">${t?`<button ${tracked?'disabled':''} onclick='importEnvTarget(${JSON.stringify(t).replace(/'/g,"&#39;")})' class="px-2 py-1 rounded-lg text-[10px] font-bold ${tracked?'bg-slate-100 text-slate-400':'bg-teal-50 text-teal-700 border border-teal-200'}">${tracked?'추가됨':'예비조사 추가'}</button>`:'<span class="text-[9px] text-slate-400">대조 후 결정</span>'}</td></tr>`}).join(''):'<tr><td colspan="6" class="p-7 text-center text-slate-400">등록된 MSDS 구성성분이 없습니다. ① MSDS 등록에서 파일을 먼저 등록하세요.</td></tr>'}</tbody></table></div></section>`;
  html+=`<section class="bg-white border border-slate-200 rounded-2xl p-4 md:p-5 mb-5"><div class="flex items-center justify-between"><div><h3 class="font-black text-slate-900">STEP 2~5 · 예비조사부터 주기관리</h3><p class="text-[11px] text-slate-500 mt-1">각 CAS를 선택해 현장 노출조건을 기록하고 적용제외 검토 → 측정 → 차기일정을 관리하세요.</p></div><span class="text-xs text-slate-500">관리 ${materials.length}건</span></div><div class="grid lg:grid-cols-[330px_1fr] gap-4 mt-4"><div class="space-y-2 max-h-[660px] overflow-y-auto">${materials.length?materials.map(m=>{const st=envStepState(m),ev=evaluateEnvExemption(m);return`<button onclick="selectEnvWorkflow(${JSON.stringify(m.id)})" class="w-full text-left rounded-xl border ${m.id===envSelectedId?'border-teal-500 bg-teal-50':'border-slate-200 bg-white hover:border-teal-300'} p-3"><div class="flex justify-between gap-2"><b class="text-xs text-slate-900">${envEsc(m.name)}</b><span class="font-mono text-[10px]">${envEsc(m.cas)}</span></div><p class="text-[10px] text-slate-500 mt-1">${envEsc(m.productName||'수동 등록')} · ${envEsc(m.site||'사업장 미입력')}</p><div class="flex gap-1 mt-2">${st.map((on,i)=>`<span class="w-6 h-1.5 rounded ${on?'bg-teal-500':'bg-slate-200'}"></span>`).join('')}</div><p class="text-[10px] mt-2 ${ev.suggestion==='exempt-review'?'text-amber-700':'text-sky-700'}">${envEsc(m.workflow.decisionConfirmed==='exempt'?'적용제외 확정':m.workflow.decisionConfirmed==='measure'?'측정대상 확정':ev.label)}</p></button>`}).join(''):'<div class="p-8 text-center text-slate-400 text-xs border border-dashed rounded-xl">대상 후보를 먼저 추가하세요.</div>'}</div><div>${selected?renderEnvEditor(selected):'<div class="h-full min-h-[260px] flex items-center justify-center rounded-xl border border-dashed border-slate-300 text-slate-400 text-sm">왼쪽에서 관리할 CAS를 선택하세요.</div>'}</div></div></section>`;
  root.innerHTML=html;
}
function selectEnvWorkflow(id){envSelectedId=id;renderEnvWorkflow();}
function checked(v){return v?'checked':'';}
function renderEnvEditor(m){
  ensureEnvItem(m);const w=m.workflow,ev=evaluateEnvExemption(m),allowed=ev.allowed; const due=w.measurementDue||'';
  const decisionLabel=w.decisionConfirmed==='exempt'?'적용제외로 관리':w.decisionConfirmed==='measure'?'측정대상으로 관리':'미확정';
  return `<div class="rounded-xl border border-slate-200 overflow-hidden"><div class="bg-slate-900 text-white p-3"><div class="flex justify-between gap-3"><div><b>${envEsc(m.name)}</b><p class="text-[10px] text-slate-300 mt-1">${envEsc(m.productName||'')} · CAS ${envEsc(m.cas)} · 함유량 ${envEsc(m.content||'-')}</p></div><div class="flex gap-1">${envLawPills(m)}</div></div></div><div class="p-4 space-y-5">
  <div><h4 class="text-xs font-black text-teal-800">STEP 2 · 예비조사</h4><p class="text-[10px] text-slate-500 mt-1">측정기관에 전달할 공정별 작업내용·화학물질 사용실태·MSDS와 실제 노출근로자 정보를 먼저 정리합니다.</p><div class="grid md:grid-cols-2 gap-2 mt-2">${envInput(m,'site','사업장','text',m.site)}${envInput(m,'dept','부서','text',m.dept)}${envInput(m,'loc','공정·측정지점','text',m.loc)}${envInput(m,'workers','노출 근로자 수','number',m.workers)}${envInput(m,'workflow.becameTargetDate','대상 작업장이 된 날','date',w.becameTargetDate)}${envInput(m,'workflow.preSurveyDate','예비조사일','date',w.preSurveyDate)}<label class="text-[10px] font-bold text-slate-600 md:col-span-2">공정별 작업내용<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.taskDescription',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="정상작업·비정상작업, 작업시간, 작업방법, 설비·환기 상태">${envEsc(w.taskDescription)}</textarea></label><label class="text-[10px] font-bold text-slate-600 md:col-span-2">화학물질 사용실태<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.chemicalUseState',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="제품명, CAS, 1일/월 사용량, 취급시간, 사용방법, 밀폐·국소배기 등">${envEsc(w.chemicalUseState)}</textarea></label><label class="text-[10px] font-bold text-slate-600 md:col-span-2">노출 근로자·직종 정보<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.exposedWorkers',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="직종/작업그룹, 작업시간, 유사노출그룹(SEG) 메모">${envEsc(w.exposedWorkers)}</textarea></label><label class="text-[10px] font-bold text-slate-600 md:col-span-2">근로자대표·작업자 참여 메모<textarea onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.workerParticipationNote',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs" rows="2" placeholder="요구가 있는 경우 예비조사 참여 여부 및 의견">${envEsc(w.workerParticipationNote)}</textarea></label></div><div class="grid md:grid-cols-2 gap-2 mt-2">${envCheck(m,'workflow.normalOperationConfirmed','정상작업 상태에서 노출수준을 대표할 수 있는 조건인지 확인',w.normalOperationConfirmed)}${envCheck(m,'workflow.preSurveyDone','예비조사 완료 · 공정/작업/사용실태/MSDS/노출근로자 확인',w.preSurveyDone)}</div>${due?`<p class="text-[10px] text-sky-700 mt-2">대상 작업장이 된 날 기준 최초 작업환경측정 30일 이내 관리일: <b>${due}</b></p>`:''}</div>
  <div><h4 class="text-xs font-black text-teal-800">STEP 3 · 적용제외 검토</h4><div class="grid md:grid-cols-3 gap-2 mt-2">${envInput(m,'workflow.monthlyHours','월 취급시간(h)','number',w.monthlyHours)}${envCheck(m,'workflow.monthlyRecurring','월 10~24시간 작업이 매월 반복',w.monthlyRecurring)}${envInput(m,'workflow.dailyMinutes','1일 취급시간(분)','number',w.dailyMinutes)}${envCheck(m,'workflow.dailyRecurring','1시간 미만 작업이 매일 반복',w.dailyRecurring)}${envInput(m,'workflow.hourlyUseGrams','시간당 사용량(g)','number',w.hourlyUseGrams)}${envInput(m,'workflow.roomVolumeM3','작업장 공기부피(m³)','number',w.roomVolumeM3)}${envCheck(m,'workflow.specialPlace','특별관리물질/특별장소/환기불충분 등 허용소비량 적용제외 제한',w.specialPlace)}${envCheck(m,'workflow.ministerNoExemption','고시 물질로 임시·단시간 적용제외 불가 여부 확인',w.ministerNoExemption)}</div><div class="mt-3 rounded-lg ${ev.suggestion==='exempt-review'?'bg-amber-50 border-amber-200':'bg-sky-50 border-sky-200'} border p-3 text-[10px] leading-5"><b>${ev.label}</b>${ev.reasons.length?`<p>검토 근거: ${envEsc(ev.reasons.join(' · '))}</p>`:''}${ev.blockers.length?`<p class="text-rose-700">제한 확인: ${envEsc(ev.blockers.join(' · '))}</p>`:''}${allowed?`<p>허용소비량 계산: 작업장 부피 ${Math.min(Number(w.roomVolumeM3)||0,150)}m³ ÷ 15 = <b>${allowed.allowed}g/h</b> · 입력 사용량 ${allowed.use}g/h</p>`:''}<p class="text-slate-500">임시작업: 월 24시간 미만(월 10~24시간이 매월 반복되면 제외 아님) · 단시간작업: 1일 1시간 미만(매일 반복되면 제외 아님)</p></div><div class="mt-2"><label class="text-[10px] font-bold text-slate-600">최종 관리 판단<select onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.decisionConfirmed',this.value)" class="ml-2 border rounded-lg px-2 py-1.5 text-xs"><option value="" ${!w.decisionConfirmed?'selected':''}>확인 필요</option><option value="measure" ${w.decisionConfirmed==='measure'?'selected':''}>작업환경측정 실시</option><option value="exempt" ${w.decisionConfirmed==='exempt'?'selected':''}>적용제외로 관리</option></select></label><span class="ml-2 text-[10px] font-bold text-slate-500">현재: ${decisionLabel}</span></div></div>
  <div class="${w.decisionConfirmed==='exempt'?'opacity-55':''}"><h4 class="text-xs font-black text-teal-800">STEP 4 · 측정 실시·결과 입력</h4><div class="grid md:grid-cols-3 gap-2 mt-2">${envInput(m,'workflow.measurementCompany','측정기관','text',w.measurementCompany)}<label class="text-[10px] font-bold text-slate-600">시료채취 방법<select onchange="updateEnvPath(${JSON.stringify(m.id)},'workflow.sampleMethod',this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs"><option ${w.sampleMethod==='개인 시료채취'?'selected':''}>개인 시료채취</option><option ${w.sampleMethod==='지역 시료채취'?'selected':''}>지역 시료채취</option></select></label>${w.sampleMethod==='지역 시료채취'?envInput(m,'workflow.regionalSamplingReason','지역 시료채취 사유','text',w.regionalSamplingReason):''}${envInput(m,'date','시료채취/측정일','date',m.date)}${envInput(m,'twa','노출기준(TWA)','number',m.twa)}${envInput(m,'val','측정값','number',m.val)}${envInput(m,'workflow.unit','단위','text',w.unit)}${envInput(m,'workflow.reportDate','결과 보고/수령일','date',w.reportDate)}</div><p class="text-[10px] text-slate-500 mt-2">개인 시료채취가 원칙이며 곤란한 경우 지역 시료채취 사유를 결과표에 남겨야 합니다. 시료채취 완료 후 결과보고 기한도 함께 관리하세요.</p></div>
  <div><h4 class="text-xs font-black text-teal-800">STEP 5 · 주기관리</h4><div class="grid md:grid-cols-2 gap-2 mt-2"><label class="text-[10px] font-bold text-slate-600">주기 규칙<select onchange="updateEnvCycleRule(${JSON.stringify(m.id)},this.value)" class="mt-1 w-full border rounded-lg p-2 text-xs"><option value="standard" ${w.cycleRule==='standard'?'selected':''}>기본: 반기 1회 이상 (6개월)</option><option value="quarterly" ${w.cycleRule==='quarterly'?'selected':''}>3개월 1회 이상 적용</option><option value="annual" ${w.cycleRule==='annual'?'selected':''}>연 1회 요건 확인</option><option value="manual" ${w.cycleRule==='manual'?'selected':''}>직접 입력</option></select></label>${w.cycleRule==='manual'?envInput(m,'cycle','직접 주기(개월)','number',m.cycle):'<div class="rounded-lg bg-slate-50 border p-2 text-[10px] text-slate-600">현재 주기 <b>'+(m.cycle||'-')+'개월</b><br>차기 측정일 <b>'+(m.nextDate||'측정일 입력 필요')+'</b></div>'}${envCheck(m,'workflow.quarterlyDesignated','3개월 주기: 고시물질 노출기준 초과 또는 그 밖 화학인자 2배 이상 초과 확인',w.quarterlyDesignated)}${envCheck(m,'workflow.annualNoChange','최근 1년 공정·설비·방법·화학물질 변경 없음',w.annualNoChange)}${envCheck(m,'workflow.annualTwoBelow','최근 2회 연속 노출기준 미만(소음은 85dB 미만) 확인',w.annualTwoBelow)}</div><p class="text-[10px] text-slate-500 mt-2">신규·변경 대상 작업장은 30일 이내 최초 측정 후 반기 1회 이상이 기본입니다. 고시 화학인자가 노출기준을 초과하거나 그 밖의 화학인자가 노출기준의 2배 이상이면 3개월에 1회 이상, 최근 1년 변경이 없고 최근 2회 결과가 기준 미만이면 법정 제외물질이 아닌 경우 연 1회 요건을 검토할 수 있습니다.</p></div>
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
  grid.innerHTML=list.map(m=>{recalcEnv(m);const next=m.nextDate?new Date(m.nextDate+'T00:00:00'):null,dday=next?Math.ceil((next-today)/86400000):null;if(dday!==null&&dday<30&&dday>=0)soon++;if(m.ratio>100)bad++;workers+=Number(m.workers)||0;if(m.site||m.loc)locs.add((m.site||'')+'/'+(m.loc||''));const w=m.workflow||{},decision=w.decisionConfirmed==='exempt'?'<span class="bg-slate-100 text-slate-700">적용제외 관리</span>':w.decisionConfirmed==='measure'?'<span class="bg-sky-100 text-sky-700">측정대상</span>':'<span class="bg-amber-100 text-amber-700">판단 필요</span>';return`<div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition"><div class="flex gap-1 flex-wrap mb-2">${decision.replace('>',' class="text-[10px] font-bold px-1.5 py-0.5 rounded">')}${m.special==='Y'?'<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">특별관리</span>':''}</div><p class="text-sm font-black text-gray-900">${envEsc(m.name)}</p><p class="text-[10px] text-gray-500 mt-1">제품 ${envEsc(m.productName||'-')} · CAS ${envEsc(m.cas)} · 함유량 ${envEsc(m.content||'-')}</p><p class="text-[10px] text-gray-500 mt-1">${envEsc(m.site||'사업장 미입력')} · ${envEsc(m.dept||'부서 미입력')} · ${envEsc(m.loc||'공정 미입력')}</p><div class="mt-3 bg-slate-50 rounded-lg p-2 text-[10px]"><div class="flex justify-between"><span>최근 측정 ${envEsc(m.date||'-')}</span><b>${envEsc(m.val||'-')} / ${envEsc(m.twa||'-')} ${envEsc(w.unit||'')}</b></div><div class="mt-1 flex justify-between"><span>노출비율</span><b class="${m.ratio>100?'text-rose-600':'text-slate-700'}">${m.ratio||0}%</b></div></div>${m.nextDate?`<p class="text-[10px] mt-2 ${dday<0?'text-rose-600':dday<30?'text-amber-600':'text-emerald-600'}">차기 측정 ${m.nextDate} · ${dday<0?'기한 '+Math.abs(dday)+'일 경과':'D-'+dday}</p>`:''}<div class="mt-3 pt-3 border-t flex gap-2"><button onclick="selectEnvWorkflow(${JSON.stringify(m.id)});document.getElementById('envWorkflowRoot').scrollIntoView({behavior:'smooth'})" class="flex-1 border rounded py-1.5 text-xs font-bold text-teal-700">법정 흐름 관리</button><button onclick="editMat(${JSON.stringify(m.id)})" class="border rounded px-3 py-1.5 text-xs">기본편집</button><button onclick="delMat(${JSON.stringify(m.id)})" class="border border-rose-200 text-rose-600 rounded px-3 py-1.5 text-xs">삭제</button></div></div>`}).join('');
  document.getElementById('k4-total').innerHTML=list.length+'<span class="text-xs text-gray-500"> 종</span>';document.getElementById('k4-soon').innerHTML=soon+'<span class="text-xs text-gray-500"> 건</span>';document.getElementById('k4-bad').innerHTML=bad+'<span class="text-xs text-gray-500"> 건</span>';document.getElementById('k4-worker').innerHTML=workers+'<span class="text-xs text-gray-500"> 명</span>';document.getElementById('k4-loc').innerHTML=locs.size+'<span class="text-xs text-gray-500"> 개</span>';renderEnvWorkflow();
}
function applyFilter4(){const site=(document.getElementById('f4-site')?.value||'').toLowerCase(),dept=(document.getElementById('f4-dept')?.value||'').toLowerCase(),q=(document.getElementById('f4-search')?.value||'').toLowerCase(),status=document.getElementById('f4-status')?.value||'';const today=new Date();renderMat(materials.filter(m=>{if(site&&!String(m.site||'').toLowerCase().includes(site))return false;if(dept&&!String(m.dept||'').toLowerCase().includes(dept))return false;if(q&&!(`${m.name} ${m.cas} ${m.productName||''}`).toLowerCase().includes(q))return false;if(status){const d=m.nextDate?Math.ceil((new Date(m.nextDate+'T00:00:00')-today)/86400000):null;const st=m.ratio>100?'bad':(d!==null&&d<30?'soon':'ok');if(st!==status)return false;}return true;}));}
function resetMat(){['f4-site','f4-dept','f4-status','f4-search'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});renderMat(materials);}

let editMatId=null;
function openMatModal(){editMatId=null;document.getElementById('matModalTitle').textContent='측정물질 수동 등록';['m-name','m-cas','m-site','m-dept','m-loc','m-twa','m-date','m-val'].forEach(id=>document.getElementById(id).value='');document.getElementById('m-cycle').value='';document.getElementById('m-workers').value=0;document.getElementById('m-special').value='N';document.getElementById('matModal').classList.remove('hidden');document.getElementById('matModal').classList.add('flex');}
function editMat(id){const m=materials.find(x=>x.id===id);if(!m)return;editMatId=id;document.getElementById('matModalTitle').textContent='측정물질 기본정보 수정';document.getElementById('m-name').value=m.name||'';document.getElementById('m-cas').value=m.cas||'';document.getElementById('m-site').value=m.site||'';document.getElementById('m-dept').value=m.dept||'';document.getElementById('m-loc').value=m.loc||'';document.getElementById('m-cycle').value=m.cycle||'';document.getElementById('m-twa').value=m.twa||'';document.getElementById('m-date').value=m.date||'';document.getElementById('m-val').value=m.val||'';document.getElementById('m-workers').value=m.workers||0;document.getElementById('m-special').value=m.special||'N';document.getElementById('matModal').classList.remove('hidden');document.getElementById('matModal').classList.add('flex');}
function closeMatModal(){document.getElementById('matModal').classList.add('hidden');document.getElementById('matModal').classList.remove('flex');}
function saveMat(){const obj={name:document.getElementById('m-name').value.trim(),cas:document.getElementById('m-cas').value.trim(),site:document.getElementById('m-site').value.trim(),dept:document.getElementById('m-dept').value.trim(),loc:document.getElementById('m-loc').value.trim(),cycle:Number(document.getElementById('m-cycle').value)||null,twa:document.getElementById('m-twa').value.trim(),date:document.getElementById('m-date').value,val:document.getElementById('m-val').value.trim(),workers:Number(document.getElementById('m-workers').value)||0,special:document.getElementById('m-special').value,ratio:0};if(!obj.name){alert('물질명을 입력하세요.');return;}if(editMatId){const i=materials.findIndex(x=>x.id===editMatId);materials[i]={...materials[i],...obj};ensureEnvItem(materials[i]);recalcEnv(materials[i]);}else{obj.id=Date.now();obj.productName='수동 등록';materials.unshift(ensureEnvItem(obj));}saveMatLS();renderMat(materials);closeMatModal();showToast('저장되었습니다.');}
function delMat(id){if(!confirm('이 작업환경측정 관리 항목을 삭제하시겠습니까?'))return;materials=materials.filter(x=>x.id!==id);if(envSelectedId===id)envSelectedId=null;saveMatLS();renderMat(materials);}
