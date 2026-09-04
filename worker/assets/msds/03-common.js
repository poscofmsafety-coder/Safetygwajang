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
    GHS01:{icon:'fa-burst',name:'폭발성'}, GHS02:{icon:'fa-fire',name:'인화성'},
    GHS03:{icon:'fa-fire-flame-curved',name:'산화성'}, GHS04:{icon:'fa-gauge',name:'고압가스'},
    GHS05:{icon:'fa-droplet',name:'부식성'}, GHS06:{icon:'fa-skull-crossbones',name:'급성독성'},
    GHS07:{icon:'fa-triangle-exclamation',name:'경고(자극성)'},
    GHS08:{icon:'fa-person-dots-from-line',name:'건강유해성'}, GHS09:{icon:'fa-fish',name:'수생환경유해성'}
};

// ⭐ 샘플 데이터 제거 - 빈 배열로 시작 (모든 회사에서 사용 가능)
let MATERIALS = JSON.parse(localStorage.getItem('sgw_materials') || '[]');
function saveMATERIALS(){ localStorage.setItem('sgw_materials', JSON.stringify(MATERIALS)); }

function makePictogramsHTML(codes, size='w-16 h-16 text-2xl'){
    if(!codes || codes.length === 0) return '<span class="text-xs text-gray-400">해당 없음</span>';
    return codes.map(code=>{
        const g = GHS_PICTOGRAMS[code]; if(!g) return '';
        const parts = size.split(' ');
        return `<div class="${parts[0]} ${parts[1]} border-[3px] border-red-600 rotate-45 flex items-center justify-center bg-white" title="${g.name}"><i class="fa-solid ${g.icon} ${parts[2]} text-black -rotate-45"></i></div>`;
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
            ? `<button onclick="selectMaterial('${m.id}')" class="w-full text-left bg-teal-600 text-white rounded-lg p-2.5 shadow-sm"><div class="flex items-center justify-between"><p class="text-xs font-bold">${m.name}</p><i class="fa-solid fa-check text-[10px]"></i></div><p class="text-[10px] text-teal-100 mt-0.5">${m.subtitle||m.cas||''}</p></button>`
            : `<button onclick="selectMaterial('${m.id}')" class="w-full text-left bg-white border border-gray-200 hover:border-teal-400 rounded-lg p-2.5"><p class="text-xs font-bold text-gray-800">${m.name}</p><p class="text-[10px] text-gray-500 mt-0.5">${m.subtitle||m.cas||''}</p>${badges.length?`<div class="flex gap-1 mt-1">${badges.join('')}</div>`:''}</button>`;
    }).join('') || '<p class="text-[11px] text-gray-400 text-center py-6">등록된 물질이 없습니다.<br>① MSDS 등록 탭에서<br>파일을 업로드하세요.</p>';
}
function selectMaterial(id){ selectedMaterialId=id; renderMaterialList(); applyMaterialToForms(MATERIALS.find(m=>m.id===id)); }
function setField(panelId,name,html){ document.querySelectorAll(`#${panelId} [data-field="${name}"]`).forEach(el=>el.innerHTML=html); }
function setList(panelId,name,arr,bullet='· '){ setField(panelId,name,(arr&&arr.length)?arr.map(t=>`<li>${bullet}${t}</li>`).join(''):'<li class="text-gray-400">해당 없음</li>'); }
function applyMaterialToForms(m){
    if(!m) return;
    setField('form-warning','product-name',m.name); setField('form-warning','pictograms',makePictogramsHTML(m.pictograms));
    setField('form-warning','signal-word',m.signalWord); setList('form-warning','hazards',m.hazards);
    setList('form-warning','p-prevention',m.pPrevention); setList('form-warning','p-response',m.pResponse);
    setList('form-warning','p-storage',m.pStorage); setList('form-warning','p-disposal',m.pDisposal);
    setField('form-warning','supplier',m.supplier);
    setField('form-process','product-name',m.name); setField('form-process','cas-no',m.cas);
    setField('form-process','pictograms',makePictogramsHTML(m.pictograms,'w-12 h-12 text-lg'));
    setField('form-process','signal-word',m.signalWord);
    setList('form-process','hazards-o',m.hazards,'ㅇ '); setList('form-process','handling',m.handling,'ㅇ ');
    setList('form-process','ppe',m.ppe,'ㅇ '); setList('form-process','first-aid',m.firstAid,'ㅇ ');
    setField('form-process','manufacturer',m.manufacturer);
    setField('form-process','supplier',m.supplier);
    applySpecialForm(m); applyEditMode();
}
function applySpecialForm(m){
    const badge=document.getElementById('specialBadge'), banner=document.getElementById('notSpecialBanner'), tbody=document.getElementById('specialTableBody');
    if(!badge || !banner || !tbody) return;
    if(m.isSpecial && m.specialMaterials && m.specialMaterials.length>0){
        badge.classList.remove('hidden'); banner.classList.add('hidden');
        tbody.innerHTML = m.specialMaterials.map((sm,idx)=>{
            const chk = v => v?`<span class="inline-flex w-6 h-6 border-2 border-gray-800 text-base font-black items-center justify-center">✓</span>`:`<span class="inline-block w-6 h-6 border-2 border-gray-800"></span>`;
            const pc = idx===0?`<td class="border-r-2 border-gray-800 text-center font-bold py-3 px-2" rowspan="${m.specialMaterials.length}">${m.name}</td>`:'';
            return `<tr class="border-b-2 border-gray-800">${pc}<td class="border-r-2 border-gray-800 py-3 px-2"><p>${sm.name} / ${sm.content}</p><p class="text-gray-500 text-[10px]">${sm.nameEn||''}</p></td><td class="border-r-2 border-gray-800 text-center py-3">${sm.cas}</td><td class="border-r-2 border-gray-800 text-center py-3">${chk(sm.acute)}</td><td class="border-l-2 border-r border-gray-800 text-center py-3">${chk(sm.carcino)}</td><td class="border-r border-gray-800 text-center py-3">${chk(sm.mutagen)}</td><td class="text-center py-3">${chk(sm.repro)}</td></tr>`;
        }).join('');
        setField('form-special','special-mat',m.specialMaterials.map(sm=>sm.name).join(', '));
    } else {
        badge.classList.add('hidden'); banner.classList.remove('hidden');
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-gray-400 text-xs"><i class="fa-solid fa-ban mr-1"></i>특별관리물질 아님</td></tr>`;
        setField('form-special','special-mat','해당 없음');
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
    btn.innerHTML = editMode?'<i class="fa-solid fa-pen-to-square mr-1 text-teal-600"></i>편집중':'<i class="fa-solid fa-lock mr-1"></i>잠금';
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
