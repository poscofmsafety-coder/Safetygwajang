/* =========================================================
   [1] 메인 탭 전환
   ========================================================= */
document.addEventListener('DOMContentLoaded', ()=>{
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById(targetId).classList.add('active');
            if(targetId === 'tab-list'){
                renderListTable();
                // ⭐⭐⭐ 리스트 탭 진입 시 자동조회 1회만 실행
                if(typeof startAutoInspectOnce === 'function'){
                    startAutoInspectOnce();
                }
            }
        });
    });
});


/* =========================================================
   [2] 공통 유틸
   ========================================================= */
function showToast(msg) {
    const t = document.getElementById('toast');
    if(!t) return;
    t.textContent = msg; t.classList.add('on');
    setTimeout(() => t.classList.remove('on'), 2200);
}
function closeDetailPanel() {
    document.getElementById('detailPanel').classList.add('hidden');
    document.body.style.overflow = '';
}

/* =========================================================
   [3] ③ GHS 픽토그램·물질 데이터
   ========================================================= */
const GHS_PICTOGRAMS = {
    GHS01:{name:'폭발성',src:'https://upload.wikimedia.org/wikipedia/commons/4/4a/GHS-pictogram-explos.svg'},
    GHS02:{name:'인화성',src:'https://upload.wikimedia.org/wikipedia/commons/6/6d/GHS-pictogram-flamme.svg'},
    GHS03:{name:'산화성',src:'https://upload.wikimedia.org/wikipedia/commons/e/e5/GHS-pictogram-rondflam.svg'},
    GHS04:{name:'고압가스',src:'https://upload.wikimedia.org/wikipedia/commons/6/6a/GHS-pictogram-bottle.svg'},
    GHS05:{name:'부식성',src:'https://upload.wikimedia.org/wikipedia/commons/a/a1/GHS-pictogram-acid.svg'},
    GHS06:{name:'급성독성',src:'https://upload.wikimedia.org/wikipedia/commons/5/58/GHS-pictogram-skull.svg'},
    GHS07:{name:'경고·자극성',src:'https://upload.wikimedia.org/wikipedia/commons/c/c3/GHS-pictogram-exclam.svg'},
    GHS08:{name:'건강유해성',src:'https://upload.wikimedia.org/wikipedia/commons/2/21/GHS-pictogram-silhouette.svg'},
    GHS09:{name:'수생환경유해성',src:'https://upload.wikimedia.org/wikipedia/commons/b/b9/GHS-pictogram-pollu.svg'}
};


// CAS 단위 보조판정: 공급자 MSDS 15항/KOSHA API 결과가 불완전할 때만 사용합니다.
// 황산(7664-93-9)은 시행규칙 별표 21·22 대상 유해인자이며 혼합물은 함유량을 함께 확인합니다.
const SGW_LEGAL_CAS_HINTS={
  '7664-93-9':{name:'황산',workEnvTarget:true,workEnvMinPct:1,specialHealthTarget:true,specialHealthMinPct:1,healthFirstMonths:6,healthCycleMonths:12,managementTarget:true,source:'산업안전보건법 시행규칙 별표 21·22·23 CAS 보조표'},
  '7732-18-5':{name:'증류수',workEnvTarget:false,specialHealthTarget:false,specialManagement:false,managementTarget:false,source:'비규제 보조표'}
};
function sgwContentPct(comp){const n=Number(comp?.contentNum);return Number.isFinite(n)?n:null;}
function sgwLegalForCas(material,cas){
  const c=(material?.composition||[]).find(x=>x.cas===cas)||{};const pct=sgwContentPct(c);const msds=material?.regulatoryProfile?.byCas?.[cas]||{};const hint=SGW_LEGAL_CAS_HINTS[cas]||{};const out={...hint,...msds};
  for(const [key,minKey] of [['workEnvTarget','workEnvMinPct'],['specialHealthTarget','specialHealthMinPct'],['specialManagement','specialManagementMinPct'],['managementTarget','managementMinPct']]){const min=Number(out[minKey]);if(out[key]===true&&Number.isFinite(min)&&pct!==null&&pct<min)out[key]=false;}
  out.evidence=[...(msds.evidence||[]),hint.source||''].filter(Boolean);return out;
}

// 샘플 데이터 없이 시작합니다.
let MATERIALS = JSON.parse(localStorage.getItem('sgw_materials') || '[]');
function saveMATERIALS(){ localStorage.setItem('sgw_materials', JSON.stringify(MATERIALS)); }

function makePictogramsHTML(codes, size='w-16 h-16 text-2xl'){
    if(!codes || codes.length === 0) return '<span class="text-xs text-gray-500">원본 MSDS 그림문자 확인 필요</span>';
    const compact = String(size).includes('w-12') ? '48px' : '64px';
    return codes.map(code=>{
        const g=GHS_PICTOGRAMS[code]; if(!g) return '';
        return `<img src="${g.src}" alt="${code} ${g.name}" title="${code} ${g.name}" style="width:${compact};height:${compact};object-fit:contain;background:#fff" referrerpolicy="no-referrer">`;
    }).join('');
}

let currentFilter = 'all', currentSearch = '', selectedMaterialId = MATERIALS.length > 0 ? MATERIALS[0].id : null;
function renderMaterialList(){
    const box = document.getElementById('materialList'); if(!box) return;
    const kw = currentSearch.trim().toLowerCase();
    const list = MATERIALS.filter(m=>{
        const tags = m.tags || [];
        if(currentFilter==='special' && !m.isSpecial && !tags.includes('special')) return false;
        if(currentFilter==='cmr' && !tags.includes('cmr')) return false;
        if(kw && !(m.name+(m.subtitle||'')+(m.cas||'')).toLowerCase().includes(kw)) return false;
        return true;
    });
    box.innerHTML = list.map(m=>{
        const sel = m.id === selectedMaterialId;
        const badges = [];
        if(m.isSpecial || (m.tags||[]).includes('special')) badges.push('<span class="bg-rose-100 text-rose-700 text-[9px] font-bold px-1.5 py-0.5 rounded">특별관리</span>');
        if((m.tags||[]).includes('cmr')) badges.push('<span class="bg-orange-100 text-orange-700 text-[9px] font-bold px-1.5 py-0.5 rounded">CMR</span>');
        return sel
            ? `<button onclick="selectMaterial('${m.id}')" class="w-full text-left bg-teal-600 text-white rounded-lg p-2.5 shadow-sm"><div class="flex items-center justify-between"><p class="text-xs font-bold">${m.name}</p></div><p class="text-[10px] text-teal-100 mt-0.5">${m.subtitle||m.cas||''}</p></button>`
            : `<button onclick="selectMaterial('${m.id}')" class="w-full text-left bg-white border border-gray-200 hover:border-teal-400 rounded-lg p-2.5"><p class="text-xs font-bold text-gray-800">${m.name}</p><p class="text-[10px] text-gray-500 mt-0.5">${m.subtitle||m.cas||''}</p>${badges.length?`<div class="flex gap-1 mt-1">${badges.join('')}</div>`:''}</button>`;
    }).join('') || '<p class="text-[11px] text-gray-400 text-center py-6">등록된 물질이 없습니다.<br>① MSDS 등록 탭에서<br>파일을 업로드하세요.</p>';
}
function selectMaterial(id){ selectedMaterialId=id; renderMaterialList(); applyMaterialToForms(MATERIALS.find(m=>m.id===id)); }
function setField(panelId,name,html){ document.querySelectorAll(`#${panelId} [data-field="${name}"]`).forEach(el=>el.innerHTML=html); }
function setList(panelId,name,arr,bullet='· '){ setField(panelId,name,(arr&&arr.length)?arr.map(t=>`<li>${bullet}${t}</li>`).join(''):'<li class="text-gray-400">해당 없음</li>'); }
function safeSupplierDisplay(m){
    const company=String(m?.supplierCompany||m?.supplierProfile?.company||'').trim();
    const phone=String(m?.supplierPhone||m?.supplierProfile?.phone||'').trim();
    const raw=String(m?.supplier||'').trim();
    if(company){ return [company,phone?`연락처 ${phone}`:''].filter(Boolean).join(' · '); }
    // 이전 버전의 전역 전화번호 오인식 데이터는 출력하지 않습니다.
    if(!raw || /^(정보|연락처|전화|tel|phone)\b/i.test(raw) || /02-2278-8080/.test(raw)) return '원본 MSDS 1항 공급자 정보 확인';
    return raw;
}
function applyMaterialToForms(m){
    if(!m) return;
    setField('form-warning','product-name',m.name); setField('form-warning','pictograms',makePictogramsHTML(m.pictograms));
    setField('form-warning','signal-word',m.signalWord); setField('form-warning','pictogram-source',m.pictogramsSource||'원본 MSDS 2항 확인'); setList('form-warning','hazards',m.hazards);
    setList('form-warning','p-prevention',m.pPrevention); setList('form-warning','p-response',m.pResponse);
    setList('form-warning','p-storage',m.pStorage); setList('form-warning','p-disposal',m.pDisposal);
    setField('form-warning','supplier',safeSupplierDisplay(m));
    setField('form-process','product-name',m.name); setField('form-process','cas-no',m.cas);
    setField('form-process','pictograms',makePictogramsHTML(m.pictograms,'w-12 h-12 text-lg'));
    setField('form-process','signal-word',m.signalWord); setField('form-process','pictogram-source',m.pictogramsSource||'원본 MSDS 2항 확인');
    setList('form-process','hazards-o',m.hazards,'· '); setList('form-process','handling',m.handling,'· ');
    setList('form-process','ppe',m.ppe,'· '); setList('form-process','first-aid',m.firstAid,'· ');
    setField('form-process','manufacturer',m.manufacturer);
    setField('form-process','supplier',safeSupplierDisplay(m));
    applySpecialForm(m); applyEditMode();
}
function deriveSpecialRows(m){
    const rows=[]; const seen=new Set();
    (m.compInspections||[]).forEach(x=>{const legal=x.inspection?.legal||{};if(x.inspection?.ok&&x.inspection?.status==='FOUND'&&legal.specialManagement===true){const c=(m.composition||[]).find(v=>v.cas===x.cas)||{},cmr=legal.cmr||{};rows.push({name:c.name||x.inspection.matchedName||'물질명 확인 필요',content:c.content||'-',cas:x.cas,carcino:cmr.carcinogenic,mutagen:cmr.mutagenic,repro:cmr.reprotoxic,source:'KOSHA CAS 대조'});seen.add(x.cas)}});
    (m.composition||[]).forEach(c=>{if(!c.cas||c.cas==='-'||seen.has(c.cas))return;const l=sgwLegalForCas(m,c.cas);if(l.specialManagement===true){rows.push({name:c.name||l.name||'물질명 확인 필요',content:c.content||'-',cas:c.cas,carcino:l.cmr?.carcinogenic??null,mutagen:l.cmr?.mutagenic??null,repro:l.cmr?.reprotoxic??null,source:l.source||'업로드 MSDS 15항'});seen.add(c.cas)}});
    return rows.length?rows:(m.specialMaterials||[]);
}
function applySpecialForm(m){
    const badge=document.getElementById('specialBadge'),banner=document.getElementById('notSpecialBanner'),tbody=document.getElementById('specialTableBody');if(!badge||!banner||!tbody)return;
    const rows=deriveSpecialRows(m); if(rows.length){m.specialMaterials=rows;m.isSpecial=true;}
    const chk=v=>v===true?'<span class="inline-flex w-6 h-6 border-2 border-gray-800 text-base font-black items-center justify-center">✓</span>':v===false?'<span class="inline-flex w-6 h-6 border-2 border-gray-800 text-[10px] text-gray-500 items-center justify-center">－</span>':'<span class="inline-flex w-6 h-6 border-2 border-amber-500 text-[10px] text-amber-700 items-center justify-center">?</span>';
    const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'});
    setField('form-special','special-product',escHtml(m.name||'원본 MSDS 1항 확인'));
    setField('form-special','special-supplier',escHtml(safeSupplierDisplay(m)));
    const dept=[m.deptInfo,m.processInfo].filter(Boolean).map(escHtml).join(' / ')||'직접 입력';
    setField('form-special','special-dept-process',dept); setField('form-special','special-date',today);
    if(m.isSpecial===true&&rows.length){
        badge.classList.remove('hidden');badge.textContent=`${rows.length}개 CAS`;banner.classList.add('hidden');
        tbody.innerHTML=rows.map(sm=>`<tr class="border-b-2 border-gray-900"><td class="border-r-2 border-gray-900 py-3 px-2"><p class="font-bold">${escHtml(sm.name)} / ${escHtml(sm.content||'-')}</p><p class="text-gray-500 text-[9px] mt-1">CAS별 확인 · ${escHtml(sm.source||'KOSHA/MSDS 대조')}</p></td><td class="border-r-2 border-gray-900 text-center py-3 font-mono">${escHtml(sm.cas)}</td><td class="border-l-2 border-r border-gray-900 text-center py-3">${chk(sm.carcino)}</td><td class="border-r border-gray-900 text-center py-3">${chk(sm.mutagen)}</td><td class="text-center py-3">${chk(sm.repro)}</td></tr>`).join('');
        setField('form-special','special-mat',rows.map(sm=>`${escHtml(sm.name)} (${escHtml(sm.cas)})`).join(', '));
    }else if(m.isSpecial===true){
        const candidates=(m.composition||[]).filter(c=>c.cas&&c.cas!=='-');
        const list=candidates.length?`<div class="mt-2 grid sm:grid-cols-2 gap-1">${candidates.map(c=>`<div class="bg-white border border-amber-200 rounded px-2 py-1"><b>${escHtml(c.name||'성분명 확인')}</b> · <span class="font-mono">${escHtml(c.cas)}</span> · ${escHtml(c.content||'-')}</div>`).join('')}</div>`:'';
        badge.classList.remove('hidden');badge.textContent='CAS 확인 필요';banner.classList.remove('hidden');banner.innerHTML='제품 수준에서 특별관리물질 관련 정보가 확인되었지만 구성성분 CAS별 연결이 완료되지 않았습니다. 3항 구성성분별로 KOSHA/별표 12를 대조한 뒤 고지문을 출력하세요.'+list;tbody.innerHTML='<tr><td colspan="5" class="text-center py-8 text-amber-700 text-xs font-bold">특별관리물질 구성성분 CAS 매칭 필요</td></tr>';setField('form-special','special-mat','구성성분 확인 필요');
    }else{
        badge.classList.add('hidden');banner.classList.remove('hidden');banner.innerHTML=m.isSpecial===false?'CAS별 KOSHA/MSDS 검토에서 특별관리물질 대상 표기가 확인되지 않았습니다. 최신 별표 12와 공급자 MSDS를 최종 확인하세요.':'특별관리물질 여부가 아직 확정되지 않았습니다. MSDS 3항 CAS와 15항, KOSHA 대조 및 최신 별표 12를 확인하세요.';tbody.innerHTML='<tr><td colspan="5" class="text-center py-8 text-gray-400 text-xs">CAS별 특별관리물질 여부 확인 필요</td></tr>';setField('form-special','special-mat',m.isSpecial===false?'해당 표기 없음':'확인 필요');
    }
}
function switchForm(btn,targetId){
    document.querySelectorAll('.form-tab-btn').forEach(b=>{b.classList.remove('bg-teal-600','text-white');b.classList.add('bg-white','text-gray-600','hover:bg-slate-50');});
    btn.classList.remove('bg-white','text-gray-600','hover:bg-slate-50'); btn.classList.add('bg-teal-600','text-white');
    document.querySelectorAll('.form-panel').forEach(p=>p.classList.add('hidden'));
    document.getElementById(targetId).classList.remove('hidden');
}
let editMode = false;
function toggleEditMode(){
    editMode=!editMode;
    const btn=document.getElementById('editModeBtn');
    if(!btn) return;
    btn.innerHTML = editMode?'편집중':'잠금';
    btn.classList.toggle('bg-teal-50',editMode); applyEditMode();
}
function applyEditMode(){
    document.querySelectorAll('[data-field]').forEach(el=>{
        const n=el.getAttribute('data-field'); if(['pictograms','signal-word-box'].includes(n)) return;
        el.setAttribute('contenteditable',editMode?'true':'false');
        if(editMode) el.classList.add('outline','outline-1','outline-dashed','outline-teal-300','rounded');
        else el.classList.remove('outline','outline-1','outline-dashed','outline-teal-300','rounded');
    });
}
function resetToAuto(){ applyMaterialToForms(MATERIALS.find(m=>m.id===selectedMaterialId)); }
function goToLabelTab(){ document.querySelector('.tab-btn[data-tab="tab-label"]').click(); }
function goToListTab(){ document.querySelector('.tab-btn[data-tab="tab-list"]').click(); }


function printMsdsForm(panelId){
    const panel=document.getElementById(panelId);
    if(!panel){ showToast('인쇄할 서식을 찾지 못했습니다.'); return; }
    document.querySelectorAll('.msds-print-target').forEach(el=>el.classList.remove('msds-print-target'));
    panel.classList.add('msds-print-target');
    const cleanup=()=>panel.classList.remove('msds-print-target');
    window.addEventListener('afterprint',cleanup,{once:true});
    window.print();
    setTimeout(cleanup,1200);
}

function printCurrentMsdsForm(){
    const visible=[...document.querySelectorAll('.form-panel')].find(el=>!el.classList.contains('hidden'));
    if(!visible){ showToast('인쇄할 양식을 선택하세요.'); return; }
    printMsdsForm(visible.id);
}

let _html2pdfLoader=null;
function loadHtml2Pdf(){
    if(window.html2pdf) return Promise.resolve(window.html2pdf);
    if(_html2pdfLoader) return _html2pdfLoader;
    const urls=[
      'https://cdn.jsdelivr.net/npm/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js',
      'https://unpkg.com/html2pdf.js@0.14.0/dist/html2pdf.bundle.min.js'
    ];
    _html2pdfLoader=new Promise((resolve,reject)=>{
      let i=0;
      const next=()=>{
        if(i>=urls.length){reject(new Error('PDF 저장 모듈을 불러오지 못했습니다.'));return;}
        const tag=document.createElement('script');tag.src=urls[i++];tag.async=true;
        tag.onload=()=>window.html2pdf?resolve(window.html2pdf):next();
        tag.onerror=next;document.head.appendChild(tag);
      };next();
    });
    return _html2pdfLoader;
}
function pdfSafeName(v){return String(v||'MSDS').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,70)||'MSDS';}
async function downloadCurrentMsdsFormPdf(){
    const visible=[...document.querySelectorAll('.form-panel')].find(el=>!el.classList.contains('hidden'));
    if(!visible){ showToast('PDF로 저장할 양식을 선택하세요.'); return; }
    const source=visible.firstElementChild||visible;
    let host=null;
    try{
      const html2pdf=await loadHtml2Pdf();
      const clone=source.cloneNode(true);
      host=document.createElement('div');
      host.className='msds-pdf-export-host';
      host.style.cssText='position:fixed;left:-12000px;top:0;width:194mm;background:#fff;padding:0;margin:0;z-index:-1;';
      clone.style.width='194mm';clone.style.maxWidth='194mm';clone.style.margin='0 auto';clone.style.boxShadow='none';
      host.appendChild(clone);document.body.appendChild(host);
      await new Promise(r=>setTimeout(r,120));
      const mat=(MATERIALS||[]).find(m=>m.id===selectedMaterialId)||{};
      const label=visible.id==='form-warning'?'MSDS_경고표지':visible.id==='form-process'?'작업공정별_관리요령':'특별관리물질_고지';
      const filename=pdfSafeName((mat.name||'MSDS')+'_'+label)+'.pdf';
      await html2pdf().set({
        margin:[6,6,6,6],filename,
        image:{type:'jpeg',quality:0.98},
        html2canvas:{scale:2,useCORS:true,allowTaint:false,backgroundColor:'#ffffff',logging:false,windowWidth:1200},
        jsPDF:{unit:'mm',format:'a4',orientation:'portrait',compress:true},
        pagebreak:{mode:['css','legacy'],avoid:['tr','.msds-process-footer','.msds-process-title']}
      }).from(clone).save();
      showToast('PDF 저장을 시작했습니다.');
    }catch(e){
      console.warn('[MSDS PDF]',e);
      showToast('직접 PDF 저장이 어려워 인쇄창을 엽니다. 대상에서 PDF 저장을 선택하세요.');
      printMsdsForm(visible.id);
    }finally{ if(host)host.remove(); }
}
