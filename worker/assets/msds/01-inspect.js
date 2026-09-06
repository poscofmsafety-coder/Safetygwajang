/* =========================================================
   KOSHA MSDS OpenAPI 검수 v7
   - 데이터 서비스 15157612 / msdschem 사용
   - CAS 일치 및 KOSHA MSDS 15항을 보조근거로 사용
   - API 미연결 시 가짜/데모 판정을 생성하지 않음
   ========================================================= */
const INSPECT_CONFIG={
  lookup:'/api/msds/lookup', health:'/api/health', timeout:12000,
  cacheTTL:{success:7*24*60*60*1000,failure:4*60*60*1000}
};
const InspectCache={
  get(cas){try{const x=JSON.parse(localStorage.getItem('sgw_inspect_'+cas)||'null');if(!x)return null;const ttl=x.ok?INSPECT_CONFIG.cacheTTL.success:INSPECT_CONFIG.cacheTTL.failure;if(Date.now()-(x.checkedAt||0)>ttl)return null;return x}catch(e){return null}},
  set(cas,v){try{localStorage.setItem('sgw_inspect_'+cas,JSON.stringify(v))}catch(e){}},
  del(cas){localStorage.removeItem('sgw_inspect_'+cas)},
  clearAll(){Object.keys(localStorage).filter(k=>k.startsWith('sgw_inspect_')).forEach(k=>localStorage.removeItem(k))}
};
let apiConnected=false, apiStatusDetail='';
async function checkApiHealth(){
  try{const ctrl=new AbortController();setTimeout(()=>ctrl.abort(),3500);const r=await fetch(INSPECT_CONFIG.health,{signal:ctrl.signal});const j=await r.json().catch(()=>({}));apiConnected=r.ok&&j.configured!==false;apiStatusDetail=j.message||'';}catch(e){apiConnected=false;apiStatusDetail=e.message||''} updateApiStatusPill();
}
function updateApiStatusPill(){
  const el=document.getElementById('apiStatusPill');if(!el)return;
  if(apiConnected){el.textContent='자료 확인 준비됨';el.className='inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold px-2.5 py-1 rounded-full';}
  else{el.textContent='업로드 문서 우선 분석';el.className='inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold px-2.5 py-1 rounded-full';}
}
function triText(v){return v===true?'해당으로 기재':v===false?'해당 없음으로 기재':'자동 확정 안 됨';}
function normalizeBackendResponse(cas,raw){
  if(!raw||raw.ok===false)return{ok:false,casNo:cas,error:raw?.error||'조회 실패',checkedAt:Date.now()};
  return{...raw,ok:true,casNo:raw.casNo||cas,status:raw.status||'FOUND',checkedAt:Date.now(),sources:{kosha:{ok:true,hit:raw.status==='FOUND',note:'KOSHA 물질안전보건자료 조회 서비스',evidence:raw.legal?.evidence||[]}}};
}
function mergeCasLegal(material,cas,apiLegal){
  const local=(typeof sgwLegalForCas==='function')?sgwLegalForCas(material,cas):{};const api=apiLegal||{};
  const tri=(a,b)=>a===true||b===true?true:(a===false&&b===false?false:(a===false&&b==null?false:(b===false&&a==null?false:null)));
  const cmr={};['carcinogenic','mutagenic','reprotoxic'].forEach(k=>{cmr[k]=tri(local.cmr?.[k],api.cmr?.[k])});
  return {...api,workEnvTarget:tri(local.workEnvTarget,api.workEnvTarget),specialHealthTarget:tri(local.specialHealthTarget,api.specialHealthTarget),specialManagement:tri(local.specialManagement,api.specialManagement),managementTarget:tri(local.managementTarget,api.managementTarget),cmr,evidence:[...(local.evidence||[]),...(api.evidence||[])].filter(Boolean).slice(0,14),source:[local.source,api.source].filter(Boolean).join(' + ')||'CAS 대조'};
}
async function inspectByCas(cas,forceRefresh=false){
  cas=String(cas||'').trim();if(!cas)throw new Error('CAS No.를 입력하세요.');
  if(!forceRefresh){const c=InspectCache.get(cas);if(c)return{...c,fromCache:true}}
  if(!apiConnected){
    try{await checkApiHealth();}catch(e){}
  }
  if(!apiConnected){
    // API 설정 직후에도 즉시 다시 시도할 수 있도록 '미연결' 상태는 장기 캐시하지 않습니다.
    return {ok:false,unavailable:true,casNo:cas,error:'외부 자료 조회가 준비되지 않았습니다. 업로드한 MSDS 15항을 우선 확인해 주세요.',checkedAt:Date.now()};
  }
  try{const ctrl=new AbortController();setTimeout(()=>ctrl.abort(),INSPECT_CONFIG.timeout);const u=INSPECT_CONFIG.lookup+'?cas='+encodeURIComponent(cas)+(forceRefresh?'&refresh=1':'');const r=await fetch(u,{signal:ctrl.signal});const raw=await r.json();const out=normalizeBackendResponse(cas,raw);InspectCache.set(cas,out);return out;}catch(e){const out={ok:false,casNo:cas,error:e.message,checkedAt:Date.now()};InspectCache.set(cas,out);return out;}
}
function applyInspectionToMaterial(m,ins){
  if(!m||!ins||!ins.ok)return false;let changed=false;
  m.laws=m.laws||{};m.laws.kosha=ins.status==='FOUND';m.laws.checkedAt=ins.checkedAt;m.laws.status=ins.status;m.laws.koshaName=ins.matchedName||'';m.laws.koshaChemId=ins.chemId||'';changed=true;
  const legal=ins.legal||{};
  if(legal.workEnvTarget===true||legal.workEnvTarget===false){m.envTarget=legal.workEnvTarget;changed=true;}
  if(legal.specialHealthTarget===true||legal.specialHealthTarget===false){m.healthTarget=legal.specialHealthTarget;changed=true;}
  if(legal.specialManagement===true||legal.specialManagement===false){
    m.isSpecial=legal.specialManagement;changed=true;
    if(legal.specialManagement===true){
      const comp=(m.composition||[]).find(c=>c.cas===ins.casNo);
      const cmr=legal.cmr||{};
      m.specialMaterials=m.specialMaterials||[];
      if(!m.specialMaterials.some(x=>x.cas===ins.casNo)){
        m.specialMaterials.push({
          name:comp?.name||ins.matchedName||'물질명 확인 필요', nameEn:'', content:comp?.content||'-', cas:ins.casNo,
          acute:null, carcino:cmr.carcinogenic, mutagen:cmr.mutagenic, repro:cmr.reprotoxic,
          needsConfirm:true, source:'KOSHA MSDS 15항 보조검토'
        });
      }
    }
  }
  m.regulatoryProfile=m.regulatoryProfile||{source:'업로드 MSDS 15항',evidence:[]};
  m.regulatoryProfile.kosha={...legal,source:'KOSHA MSDS 15항',checkedAt:ins.checkedAt};
  if(ins.publicSafety){m.publicSafety={...ins.publicSafety,checkedAt:ins.checkedAt};changed=true;}
  m.tags=m.tags||[];
  if(m.isSpecial&&!m.tags.includes('special'))m.tags.push('special');
  const cmr=legal.cmr||{};if([cmr.carcinogenic,cmr.mutagenic,cmr.reprotoxic].includes(true)&&!m.tags.includes('cmr'))m.tags.push('cmr');
  if(ins.matchedName&&(!m.subtitle||m.subtitle==='-'||m.subtitle==='원본 MSDS 기준'))m.subtitle=ins.matchedName+' · '+m.cas;
  return changed;
}
async function inspectAllComponents(material,forceRefresh=false){
  if(!material)return null;
  const set=new Set();
  if(material.cas&&material.cas!=='-')set.add(material.cas);
  (material.composition||[]).forEach(c=>{if(c.cas&&c.cas!=='-')set.add(c.cas)});
  if(!set.size)return null;

  const results=await Promise.all([...set].map(async cas=>{
    const inspection=await inspectByCas(cas,forceRefresh);
    if(inspection.ok){
      inspection.legal=mergeCasLegal(material,cas,inspection.legal||{});applyInspectionToMaterial(material,inspection);
      const comp=(material.composition||[]).find(c=>c.cas===cas);
      if(comp&&inspection.status==='FOUND'&&inspection.matchedName){
        const low=/^(?:\[?(?:OCR\s*)?PAGE|물질명 확인|\(?\s*\)?)/i.test(String(comp.name||''))||String(comp.confidence||'').includes('검토');
        comp.koshaName=inspection.matchedName; if(low)comp.name=inspection.matchedName;
      }
    }
    return {cas,inspection,status:inspection.status||'ERROR',tags:inspection.tags||[]};
  }));

  // 혼합물은 한 성분의 결과가 다른 성분의 true 판정을 덮어쓰지 않도록 CAS별 결과를 합산한다.
  // true가 하나라도 있으면 대상, 모든 확인값이 false일 때만 비대상, 그 외에는 확인 필요(null)로 둔다.
  const legalRows=results.filter(x=>x.inspection?.ok&&x.inspection.status==='FOUND').map(x=>x.inspection.legal||{});
  const aggregateTri=(key)=>{
    const values=legalRows.map(x=>x[key]).filter(v=>v===true||v===false);
    if(values.includes(true))return true;
    if(values.length && values.length===legalRows.length && values.every(v=>v===false))return false;
    return null;
  };
  const koshaEnv=aggregateTri('workEnvTarget');
  const koshaHealth=aggregateTri('specialHealthTarget');
  const koshaSpecial=aggregateTri('specialManagement');
  const sourceReg=material.regulatoryProfile||{};
  // 공급자 MSDS 15항과 KOSHA 참고자료 중 하나라도 명시적 true이면 대상 근거 있음으로 둡니다.
  // true가 없고 어느 한 쪽에 명시적 false가 있을 때만 false, 둘 다 정보가 없으면 null을 유지합니다.
  const combineTri=(sourceValue,koshaValue)=>{
    if(sourceValue===true||koshaValue===true)return true;
    if(sourceValue===false||koshaValue===false)return false;
    return null;
  };
  const env=combineTri(sourceReg.workEnvTarget,koshaEnv);
  const health=combineTri(sourceReg.specialHealthTarget,koshaHealth);
  const special=combineTri(sourceReg.specialManagement,koshaSpecial);
  material.envTarget=env;
  material.healthTarget=health;
  material.isSpecial=special;

  const found=results.filter(x=>x.inspection?.ok&&x.inspection.status==='FOUND');
  const notFound=results.filter(x=>x.inspection?.ok&&x.inspection.status==='NOT_FOUND');
  material.laws=material.laws||{};
  material.laws.status=found.length?'FOUND':(notFound.length===results.length?'NOT_FOUND':'PARTIAL');
  material.laws.kosha=found.length>0;
  material.laws.checkedAt=Date.now();
  material.laws.componentCount=results.length;
  material.laws.foundCount=found.length;

  const anyCmr=legalRows.some(x=>{
    const c=x.cmr||{};return [c.carcinogenic,c.mutagenic,c.reprotoxic].includes(true);
  });
  material.tags=material.tags||[];
  material.tags=material.tags.filter(t=>t!=='special'&&t!=='cmr');
  if(special===true)material.tags.push('special');
  if(anyCmr)material.tags.push('cmr');

  // 특별관리물질 상세은 이번 KOSHA 대조에서 실제로 true인 CAS만 재구성한다.
  material.specialMaterials=found.filter(x=>x.inspection?.legal?.specialManagement===true).map(x=>{
    const comp=(material.composition||[]).find(c=>c.cas===x.cas);
    const cmr=x.inspection.legal?.cmr||{};
    return {
      name:comp?.name||x.inspection.matchedName||'물질명 확인 필요', nameEn:'', content:comp?.content||'-', cas:x.cas,
      acute:null, carcino:cmr.carcinogenic, mutagen:cmr.mutagenic, repro:cmr.reprotoxic,
      needsConfirm:true, source:'KOSHA MSDS 15항 보조검토'
    };
  });

  material.regulatoryProfile=material.regulatoryProfile||{source:'업로드 MSDS 15항',evidence:[]};
  material.regulatoryProfile.koshaAggregate={workEnvTarget:koshaEnv,specialHealthTarget:koshaHealth,specialManagement:koshaSpecial,checkedAt:Date.now()};
  material.regulatoryProfile.koshaComponents=results.map(x=>({
    cas:x.cas,status:x.inspection?.status||'ERROR',matchedName:x.inspection?.matchedName||'',legal:x.inspection?.legal||null,checkedAt:x.inspection?.checkedAt||Date.now()
  }));
  material.compInspections=results;
  return results;
}
function refreshDependentMsdsViews(){
  try{ if(typeof syncEnvTargetsFromMsds==='function') syncEnvTargetsFromMsds(true); }catch(e){console.warn('[env sync]',e);}
  try{ if(typeof renderEnvWorkflow==='function') renderEnvWorkflow(); }catch(e){}
  try{ if(typeof renderHealth==='function') renderHealth(); }catch(e){}
  try{ const m=(MATERIALS||[]).find(x=>x.id===selectedMaterialId); if(m&&typeof applyMaterialToForms==='function')applyMaterialToForms(m); }catch(e){}
}
async function autoInspectMaterial(materialId,showToastMsg=true){
  const m=MATERIALS.find(x=>x.id===materialId);if(!m)return null;
  const r=await inspectAllComponents(m,false);
  if(r){
    saveMATERIALS();
    if(typeof renderListTable==='function')renderListTable();
    if(typeof updateAllKPI==='function')updateAllKPI();
    refreshDependentMsdsViews();
    if(showToastMsg&&typeof showToast==='function'){
      const found=r.filter(x=>x.inspection?.ok&&x.inspection.status==='FOUND').length;
      const env=r.filter(x=>x.inspection?.legal?.workEnvTarget===true).length;
      const health=r.filter(x=>x.inspection?.legal?.specialHealthTarget===true).length;
      showToast(`CAS 대조 완료 ${found}/${r.length}건 · 작측 ${env} · 특검 ${health}`);
    }
  }
  return r;
}
let _autoInspectRunning=false,_autoInspectDone=false;
async function autoInspectAllPending(force=false){
  if(_autoInspectRunning||(_autoInspectDone&&!force))return;
  if(!apiConnected){try{await checkApiHealth();}catch(e){}}
  if(!apiConnected)return;
  _autoInspectRunning=true;
  try{
    const list=MATERIALS.filter(m=>force||!m.laws?.checkedAt);
    for(const m of list){await inspectAllComponents(m,force);await new Promise(r=>setTimeout(r,120));}
    saveMATERIALS();
    if(typeof renderListTable==='function')renderListTable();
    if(typeof updateAllKPI==='function')updateAllKPI();
    refreshDependentMsdsViews();
    _autoInspectDone=true;
  }finally{_autoInspectRunning=false;}
}
function startAutoInspectOnce(){autoInspectAllPending(false)}
function insLog(msg){const b=document.getElementById('insLog');if(!b)return;b.classList.remove('hidden');const p=document.createElement('p');p.textContent='['+new Date().toLocaleTimeString()+'] '+msg;b.appendChild(p);b.scrollTop=b.scrollHeight;}
async function inspectCasSingle(forceRefresh){const input=document.getElementById('insCasInput');const cas=input?.value.trim();if(!cas){showToast('CAS No.를 입력하세요');return;}openInspectModal(cas);insLog(cas+' KOSHA 조회 시작');const r=await inspectByCas(cas,forceRefresh);renderInspectModal(cas,r);if(r.ok){for(const m of MATERIALS){if(m.cas===cas||(m.composition||[]).some(c=>c.cas===cas))await inspectAllComponents(m,false);}saveMATERIALS();if(typeof renderListTable==='function')renderListTable();if(typeof updateAllKPI==='function')updateAllKPI();refreshDependentMsdsViews();}insLog(cas+' 조회 완료');}
async function reinspectAll(){const btn=document.getElementById('btnReinspectAll');if(btn){btn.disabled=true;btn.textContent='재조회 중';}InspectCache.clearAll();_autoInspectDone=false;await autoInspectAllPending(true);if(btn){btn.disabled=false;btn.textContent='전체 재조회';}showToast('KOSHA 전체 재조회 완료');}
function clearInspectCache(){if(!confirm('KOSHA 조회 캐시를 삭제하시겠습니까?'))return;InspectCache.clearAll();_autoInspectDone=false;showToast('조회 캐시를 삭제했습니다.');}
function openInspectModal(cas){const m=document.getElementById('inspectModal');if(!m)return;const c=document.getElementById('insModalCas');if(c)c.textContent='CAS No. '+cas;m.classList.remove('hidden');m.classList.add('flex');const body=document.getElementById('inspectModalBody');if(body)body.innerHTML='<p class="text-center py-8 text-gray-500">KOSHA 자료를 조회하고 있습니다.</p>';}
function closeInspectModal(){const m=document.getElementById('inspectModal');if(m){m.classList.add('hidden');m.classList.remove('flex')}}
function renderInspectModal(cas,r){
  const body=document.getElementById('inspectModalBody');if(!body)return;
  if(!r.ok){body.innerHTML=`<div class="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-900"><p class="font-bold">조회 결과를 불러오지 못했습니다.</p><p class="text-sm mt-1">${escapeHtml(r.error||'API 설정을 확인하세요.')}</p><p class="text-xs mt-2">업로드 MSDS 15항과 최신 법령을 우선 확인하세요.</p></div>`;return;}
  const l=r.legal||{};const ev=(l.evidence||[]).slice(0,8);const ps=r.publicSafety||null;
  const publicBox=ps?`<div class="border border-emerald-200 bg-emerald-50 rounded p-3"><p class="text-xs font-bold text-emerald-900">화학물질안전원 참고자료</p><p class="text-[11px] text-emerald-900 mt-1">${escapeHtml(ps.nameKo||ps.nameEn||r.matchedName||'물질명 확인')} · ${escapeHtml(ps.casNo||cas)}</p>${ps.symptom?`<p class="text-[11px] mt-2"><b>노출 증상</b> ${escapeHtml(ps.symptom)}</p>`:''}${ps.inhale?`<p class="text-[11px] mt-1"><b>흡입</b> ${escapeHtml(ps.inhale)}</p>`:''}${ps.skin?`<p class="text-[11px] mt-1"><b>피부</b> ${escapeHtml(ps.skin)}</p>`:''}<p class="text-[10px] text-emerald-800 mt-2">표시된 자료는 사고·노출 검토 보조자료입니다. 실제 사용농도·사용량·환기조건과 공급자 최신 MSDS를 최종 확인하세요.</p></div>`:'';
  body.innerHTML=`<div class="space-y-3"><div class="bg-slate-50 border border-slate-200 rounded-lg p-3"><p class="text-xs text-gray-500">KOSHA 물질 확인</p><p class="font-bold text-gray-900 mt-1">${escapeHtml(r.matchedName||'물질명 확인')} · ${escapeHtml(cas)}</p><p class="text-[11px] text-gray-500 mt-1">KOSHA 자료는 MSDS 작성·검토의 참고자료이며 최종 법적 적용은 원본 MSDS와 최신 법령으로 확인해야 합니다.</p></div>${publicBox}<div class="grid grid-cols-1 sm:grid-cols-3 gap-2"><div class="border rounded p-3"><p class="text-[11px] text-gray-500">작업환경측정</p><b>${triText(l.workEnvTarget)}</b></div><div class="border rounded p-3"><p class="text-[11px] text-gray-500">특수건강진단</p><b>${triText(l.specialHealthTarget)}</b></div><div class="border rounded p-3"><p class="text-[11px] text-gray-500">특별관리물질</p><b>${triText(l.specialManagement)}</b></div></div>${ev.length?`<div class="border rounded p-3"><p class="text-xs font-bold mb-2">KOSHA 15항 근거 문구</p><ul class="text-[11px] space-y-1">${ev.map(x=>`<li>· ${escapeHtml(x)}</li>`).join('')}</ul></div>`:''}<div class="bg-blue-50 border border-blue-200 rounded p-3 text-[11px] text-blue-900">작업환경측정은 시행규칙 별표 21, 특수건강진단은 별표 22, 검진 시기·주기는 별표 23, 특별관리물질은 안전보건규칙 별표 12 및 제440조를 최신본으로 확인하세요.</div></div>`;
}
