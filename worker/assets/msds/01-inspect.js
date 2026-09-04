/* =========================================================
   [0] KOSHA 공단 API 검수 설정 (단일 소스)
   ========================================================= */
const INSPECT_CONFIG = {
    proxyBase: '/api/inspect',
    cacheTTL: {
        success: 30 * 24 * 60 * 60 * 1000,
        failure: 1 * 24 * 60 * 60 * 1000
    },
    timeout: 10000
};

const InspectCache = {
    get(cas){
        try{
            const raw = localStorage.getItem('sgw_inspect_'+cas);
            if(!raw) return null;
            const obj = JSON.parse(raw);
            const ttl = obj.ok ? INSPECT_CONFIG.cacheTTL.success : INSPECT_CONFIG.cacheTTL.failure;
            if(Date.now() - obj.checkedAt > ttl) return null;
            return obj;
        }catch(e){ return null; }
    },
    set(cas, data){ try{ localStorage.setItem('sgw_inspect_'+cas, JSON.stringify(data)); }catch(e){} },
    del(cas){ localStorage.removeItem('sgw_inspect_'+cas); },
    clearAll(){
        Object.keys(localStorage).filter(k=>k.startsWith('sgw_inspect_')).forEach(k=>localStorage.removeItem(k));
    }
};

let apiConnected = false;
async function checkApiHealth(){
    try{
        const ctrl = new AbortController();
        setTimeout(()=>ctrl.abort(), 3000);
        const res = await fetch(INSPECT_CONFIG.proxyBase+'/health', { signal: ctrl.signal });
        apiConnected = res.ok;
    }catch(e){ apiConnected = false; }
    updateApiStatusPill();
}

function updateApiStatusPill(){
    const pill = document.getElementById('apiStatusPill');
    if(!pill) return;
    if(apiConnected){
        pill.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-500"></span><span class="text-emerald-700">KOSHA 공단 API 연결됨</span>';
        pill.className = 'inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-[11px] font-bold px-2.5 py-1 rounded-full';
    } else {
        pill.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-500 pulse-dot"></span><span class="text-amber-700">데모 모드 (프록시 미연결)</span>';
        pill.className = 'inline-flex items-center gap-1.5 bg-amber-50 border border-amber-200 text-[11px] font-bold px-2.5 py-1 rounded-full';
    }
}

/* =========================================================
   백엔드 응답 정규화
   백엔드 [cas].js는 { ok, casNo, matchedName, status, tags, docs, meta } 반환
   프론트가 기대하는 형태: { ok, matched:{kosha}, sources:{kosha}, tags, status }
   ========================================================= */
function normalizeBackendResponse(cas, raw){
    if(!raw || raw.ok === false){
        return {
            ok: false,
            casNo: cas,
            error: raw?.error || '조회 실패',
            checkedAt: Date.now()
        };
    }

    const koshaHit = raw.status === 'REGULATED';
    const docs = raw.docs || [];

    return {
        ok: true,
        casNo: cas,
        matchedName: raw.matchedName || null,
        status: raw.status || 'NO_MATCH',
        tags: raw.tags || [],
        matched: { kosha: koshaHit },
        sources: {
            kosha: koshaHit ? {
                ok: true, hit: true,
                note: `산업안전보건법령 ${docs.length}건 매칭`,
                name: raw.matchedName,
                docs: docs
            } : {
                ok: true, hit: false,
                note: '산업안전보건법령 매칭 없음'
            }
        },
        meta: raw.meta || {},
        checkedAt: Date.now()
    };
}

async function inspectByCas(cas, forceRefresh=false){
    cas = (cas||'').trim();
    if(!cas) throw new Error('CAS No.를 입력하세요');

    if(!forceRefresh){
        const hit = InspectCache.get(cas);
        if(hit) return { ...hit, fromCache: true };
    }

    let result;
    if(apiConnected){
        try{
            const ctrl = new AbortController();
            setTimeout(()=>ctrl.abort(), INSPECT_CONFIG.timeout);
            const res = await fetch(
                `${INSPECT_CONFIG.proxyBase}/${encodeURIComponent(cas)}${forceRefresh?'?refresh=true':''}`,
                { signal: ctrl.signal }
            );
            if(!res.ok) throw new Error('HTTP '+res.status);
            const raw = await res.json();
            result = normalizeBackendResponse(cas, raw);
        }catch(e){
            result = { ok:false, casNo:cas, error:e.message, checkedAt:Date.now() };
        }
    } else {
        await new Promise(r=>setTimeout(r, 300+Math.random()*300));
        result = demoInspect(cas);
        result.checkedAt = Date.now();
        result.ok = true;
        result.demo = true;
    }

    InspectCache.set(cas, result);
    return result;
}

/* =========================================================
   데모 DB (KOSHA 단일 소스)
   ========================================================= */
const DEMO_REG_DB = {
    '872-50-4':  { name:'NMP', kosha:true,  tags:['특별관리','생식독성1B','산안법'] },
    '10124-43-3':{ name:'황산코발트', kosha:true, tags:['특별관리','발암성','산안법'] },
    '7786-81-4': { name:'황산니켈', kosha:true, tags:['특별관리','발암성','산안법'] },
    '1310-65-2': { name:'수산화리튬', kosha:true, tags:['부식성','산안법'] },
    '64-17-5':   { name:'에탄올', kosha:true, tags:['인화성'] },
    '71-43-2':   { name:'벤젠', kosha:true, tags:['특별관리','발암성1A','산안법'] },
    '67-56-1':   { name:'메탄올', kosha:true, tags:['특별관리','급성독성','인화성'] },
    '50-00-0':   { name:'포름알데히드', kosha:true, tags:['특별관리','발암성1B','산안법'] },
    '1309-48-4': { name:'산화마그네슘', kosha:true, tags:['자극성'] },
    '64742-54-7':{ name:'광유계 윤활기유', kosha:true, tags:['건강유해성'] },
    '7664-93-9': { name:'황산', kosha:true, tags:['부식성','산안법'] },
    '7732-18-5': { name:'물', kosha:false, tags:[] }
};

function demoInspect(cas){
    const rec = DEMO_REG_DB[cas];
    if(!rec){
        return {
            casNo: cas, status: 'NO_MATCH',
            matched: { kosha:false },
            tags: [],
            sources: {
                kosha: { ok:true, hit:false, note:'KOSHA MSDS 목록에 없음' }
            }
        };
    }
    return {
        casNo: cas, matchedName: rec.name,
        status: rec.kosha ? 'REGULATED' : 'NO_MATCH',
        matched: { kosha: rec.kosha },
        tags: rec.tags,
        sources: {
            kosha: rec.kosha
                ? { ok:true, hit:true, note:'KOSHA 안전보건법령 등재', name:rec.name }
                : { ok:true, hit:false, note:'KOSHA MSDS 목록에 없음' }
        }
    };
}

/* =========================================================
   자동 검수 → material 필드 반영
   ========================================================= */
function applyInspectionToMaterial(material, inspection){
    if(!material || !inspection || !inspection.ok) return false;

    let updated = false;
    const tags = inspection.tags || [];
    const matched = inspection.matched || {};

    if(!material.tags) material.tags = [];
    tags.forEach(t=>{
        if(!material.tags.includes(t)) { material.tags.push(t); updated = true; }
    });

    if(tags.some(t=>t.includes('특별관리'))){
        if(!material.isSpecial){ material.isSpecial = true; updated = true; }
    }

    const isCMR = tags.some(t=>t.includes('발암') || t.includes('변이') || t.includes('생식'));
    if(isCMR && !material.tags.includes('cmr')){
        material.tags.push('cmr');
        updated = true;
    }

    if(material.isSpecial || isCMR){
        if(!material.envTarget){ material.envTarget = true; material.envCycle = 6; updated = true; }
        if(!material.healthTarget){ material.healthTarget = true; material.healthCycle = 12; updated = true; }
    }

    if(!material.laws) material.laws = {};
    material.laws.kosha = material.laws.kosha || !!matched.kosha;
    material.laws.checkedAt = inspection.checkedAt;
    material.laws.status = inspection.status;
    updated = true;

    if(inspection.matchedName && (!material.subtitle || material.subtitle === '수동 등록' || material.subtitle === '-')){
        material.subtitle = inspection.matchedName + ' (' + material.cas + ')';
        updated = true;
    }

    return updated;
}

/* =========================================================
   혼합물 전체 성분 CAS 병렬 조회
   ========================================================= */
async function inspectAllComponents(material, forceRefresh=false){
    if(!material) return null;

    const casSet = new Set();
    if(material.cas && material.cas !== '-') casSet.add(material.cas);
    (material.composition || []).forEach(c=>{
        if(c.cas && c.cas !== '-') casSet.add(c.cas);
    });

    if(casSet.size === 0) return null;

    const casList = [...casSet];
    const results = [];

    await Promise.all(casList.map(async cas=>{
        try{
            const r = await inspectByCas(cas, forceRefresh);
            if(r && r.ok){
                results.push({ cas, inspection: r });
            }
        }catch(e){
            console.warn('[inspectAllComponents]', cas, e.message);
        }
    }));

    if(results.length === 0) return null;

    material.compInspections = results.map(x=>({
        cas: x.cas,
        matchedName: x.inspection.matchedName || null,
        status: x.inspection.status,
        matched: x.inspection.matched || {},
        tags: x.inspection.tags || [],
        checkedAt: x.inspection.checkedAt
    }));

    // KOSHA union
    if(!material.laws) material.laws = {};
    material.laws.kosha = results.some(x=>x.inspection.matched?.kosha);
    material.laws.checkedAt = Date.now();
    material.laws.status = results.some(x=>x.inspection.status==='REGULATED') ? 'REGULATED' : 'NO_MATCH';

    if(!material.tags) material.tags = [];
    results.forEach(x=>{
        (x.inspection.tags||[]).forEach(t=>{
            if(!material.tags.includes(t)) material.tags.push(t);
        });
    });

    const allTags = results.flatMap(x=>x.inspection.tags||[]);
    if(allTags.some(t=>t.includes('특별관리'))) material.isSpecial = true;
    if(allTags.some(t=>t.includes('발암')||t.includes('변이')||t.includes('생식'))){
        if(!material.tags.includes('cmr')) material.tags.push('cmr');
    }
    if(material.isSpecial || material.tags.includes('cmr')){
        material.envTarget = true; material.envCycle = 6;
        material.healthTarget = true; material.healthCycle = 12;
    }

    return material.compInspections;
}

/* =========================================================
   단일 물질 자동 검수
   ========================================================= */
async function autoInspectMaterial(materialId, showToastMsg=true){
    const m = MATERIALS.find(x=>x.id===materialId);
    if(!m) return null;

    const hasCas = m.cas && m.cas !== '-';
    const hasComponents = (m.composition||[]).some(c=>c.cas && c.cas!=='-');
    if(!hasCas && !hasComponents) return null;

    try{
        const result = await inspectAllComponents(m, false);
        if(result){
            saveMATERIALS();
            if(typeof renderListTable === 'function') renderListTable();
            if(typeof updateAllKPI === 'function') updateAllKPI();
            if(typeof applyMaterialToForms === 'function'){
                applyMaterialToForms(MATERIALS.find(x=>x.id===materialId));
            }
            if(showToastMsg && typeof showToast === 'function'){
                const regCnt = result.filter(x=>x.status==='REGULATED').length;
                if(regCnt > 0){
                    showToast(`🔍 KOSHA 검수 완료: ${result.length}개 CAS, 규제 매칭 ${regCnt}건`);
                } else {
                    showToast(`🔍 KOSHA 검수 완료: ${result.length}개 CAS, 매칭 없음`);
                }
            }
        }
        return result;
    }catch(e){
        console.warn('[autoInspect] 실패:', m.cas, e.message);
    }
    return null;
}

/* =========================================================
   백그라운드 자동조회
   ========================================================= */
let _autoInspectRunning = false;
let _autoInspectDone = false;

async function autoInspectAllPending(force=false){
    if(_autoInspectRunning) return;
    if(_autoInspectDone && !force) return;
    _autoInspectRunning = true;

    try{
        const pending = MATERIALS.filter(m=>{
            if(m.laws && m.laws.checkedAt) return false;
            const hasCas = m.cas && m.cas !== '-';
            const hasComp = (m.composition||[]).some(c=>c.cas && c.cas!=='-');
            return hasCas || hasComp;
        });

        if(pending.length === 0){
            _autoInspectDone = true;
            _autoInspectRunning = false;
            return;
        }

        insLog(`🤖 KOSHA 자동 검수 시작 (${pending.length}건 대기)`);

        const BATCH = 3;
        for(let i=0; i<pending.length; i+=BATCH){
            const batch = pending.slice(i, i+BATCH);
            await Promise.all(batch.map(async m=>{
                try{
                    const results = await inspectAllComponents(m, false);
                    if(results){
                        const regCnt = results.filter(x=>x.status==='REGULATED').length;
                        insLog(`  ✓ ${m.name} (${results.length}개 CAS) → 규제 ${regCnt}건`);
                    }
                }catch(e){
                    insLog(`  ✗ ${m.name} ${e.message}`);
                }
            }));
            await new Promise(r=>setTimeout(r, 200));
        }

        saveMATERIALS();
        if(typeof renderListTable === 'function') renderListTable();
        if(typeof updateAllKPI === 'function') updateAllKPI();
        insLog(`🎉 자동 검수 완료`);
        _autoInspectDone = true;
    } finally {
        _autoInspectRunning = false;
    }
}

function insLog(msg){
    const box = document.getElementById('insLog');
    if(!box) return;
    box.classList.remove('hidden');
    const p = document.createElement('p');
    p.innerHTML = `<span class="text-gray-400">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    box.appendChild(p);
    box.scrollTop = box.scrollHeight;
}

async function inspectCasSingle(forceRefresh){
    const cas = document.getElementById('insCasInput').value.trim();
    if(!cas){ showToast('CAS No.를 입력하세요'); return; }
    openInspectModal(cas);
    try{
        insLog(`🔍 ${cas} KOSHA 조회 시작${forceRefresh?' (재조회)':''}`);
        const result = await inspectByCas(cas, forceRefresh);
        renderInspectModal(cas, result);
        insLog(`✅ ${cas} 완료 · ${result.fromCache?'캐시':'신규'} · ${result.status||'ERROR'}`);

        if(result.ok){
            let anyUpdated = false;
            MATERIALS.forEach(m=>{
                const isMatch = m.cas === cas || (m.composition||[]).some(c=>c.cas===cas);
                if(isMatch){
                    if(applyInspectionToMaterial(m, result)) anyUpdated = true;
                }
            });
            if(anyUpdated){
                saveMATERIALS();
                if(typeof applyMaterialToForms === 'function' && typeof selectedMaterialId !== 'undefined' && selectedMaterialId){
                    applyMaterialToForms(MATERIALS.find(m=>m.id===selectedMaterialId));
                }
            }
        }

        if(typeof renderListTable === 'function') renderListTable();
        if(typeof updateInspectKpi === 'function') updateInspectKpi();
    }catch(e){
        renderInspectModal(cas, { ok:false, error:e.message });
        insLog(`❌ ${cas} 실패: ${e.message}`);
    }
}

async function reinspectAll(){
    const btn = document.getElementById('btnReinspectAll');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner spin mr-1"></i>재조회 중…';
    const list = MATERIALS.filter(m=>(m.cas && m.cas!=='-') || (m.composition||[]).some(c=>c.cas));
    insLog(`🚀 전체 재조회 시작 (${list.length}건)`);
    const BATCH = 3;
    for(let i=0; i<list.length; i+=BATCH){
        const batch = list.slice(i, i+BATCH);
        await Promise.all(batch.map(async m=>{
            try{
                const results = await inspectAllComponents(m, true);
                if(results){
                    const regCnt = results.filter(x=>x.status==='REGULATED').length;
                    insLog(`  · ${m.name} (${results.length}개 CAS) → 규제 ${regCnt}건`);
                }
            }catch(e){
                insLog(`  · ${m.name} ❌ ${e.message}`);
            }
        }));
    }
    saveMATERIALS();
    if(typeof renderListTable === 'function') renderListTable();
    if(typeof updateInspectKpi === 'function') updateInspectKpi();
    insLog(`🎉 전체 재조회 완료`);
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-arrows-rotate mr-1"></i>전체 재조회';
    showToast('✅ 전체 재조회 완료');
}

function clearInspectCache(){
    if(!confirm('모든 KOSHA 검수 캐시를 삭제하시겠습니까?')) return;
    InspectCache.clearAll();
    _autoInspectDone = false;
    if(typeof renderListTable === 'function') renderListTable();
    if(typeof updateInspectKpi === 'function') updateInspectKpi();
    showToast('🗑 캐시 초기화 완료');
}

function openInspectModal(cas){
    document.getElementById('insModalCas').textContent = 'CAS No. ' + cas;
    document.getElementById('inspectModalBody').innerHTML =
        '<p class="text-center py-8 text-gray-400"><i class="fa-solid fa-spinner spin mr-2"></i>KOSHA 공단 API 조회 중…</p>';
    const m = document.getElementById('inspectModal');
    m.classList.remove('hidden'); m.classList.add('flex');
}

function closeInspectModal(){
    const m = document.getElementById('inspectModal');
    m.classList.add('hidden'); m.classList.remove('flex');
}

/* =========================================================
   ⭐ 모달 렌더링 - KOSHA 단일 카드로 변경
   ========================================================= */
function renderInspectModal(cas, r){
    const body = document.getElementById('inspectModalBody');

    if(!r.ok){
        body.innerHTML = `
            <div class="bg-rose-50 border border-rose-200 rounded-lg p-4 text-rose-700">
                <p class="font-bold mb-1"><i class="fa-solid fa-triangle-exclamation mr-1"></i>조회 실패</p>
                <p class="text-sm">${r.error||'알수없는 오류'}</p>
                <p class="text-xs text-rose-500 mt-2">CAS: ${cas}</p>
            </div>`;
        return;
    }

    const kosha = (r.sources && r.sources.kosha) || {};
    const hit = kosha.hit || (r.matched && r.matched.kosha);
    const docs = kosha.docs || [];

    const statusBadge = r.status==='REGULATED'
        ? '<span class="bg-rose-100 text-rose-700 px-3 py-1 rounded-full font-black text-xs">⚠ 산업안전보건법 규제 대상</span>'
        : '<span class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full font-black text-xs">✓ 규제 매칭 없음</span>';

    const tags = (r.tags||[]).map(t=>
        `<span class="bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-0.5 rounded">${t}</span>`
    ).join(' ');

    const docsHtml = docs.length ? `
        <div class="mt-3">
            <p class="text-[11px] font-black text-gray-700 mb-1.5">
                <i class="fa-solid fa-file-lines mr-1"></i>근거 법령 (${docs.length}건)
            </p>
            <ul class="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                ${docs.slice(0, 10).map(d=>`
                    <li class="bg-white border border-gray-200 rounded p-2 text-[11px]">
                        <p class="font-bold text-gray-800">${escapeHtml(d.title || '(제목 없음)')}</p>
                        <p class="text-gray-400 font-mono text-[10px] mt-0.5">${escapeHtml(d.docId || '')}</p>
                    </li>
                `).join('')}
            </ul>
        </div>
    ` : '';

    body.innerHTML = `
        <div class="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-gray-100">
            <div>
                <p class="text-xs text-gray-500">물질명 (KOSHA 매칭): <b class="text-gray-800">${r.matchedName||'-'}</b></p>
                <div class="flex gap-1 mt-1 flex-wrap">${tags}</div>
            </div>
            ${statusBadge}
        </div>

        <div class="mt-4 border ${hit?'border-rose-200 bg-rose-50/40':'border-emerald-200 bg-emerald-50/40'} rounded-lg p-4">
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <p class="text-sm font-black text-gray-800">
                    <i class="fa-solid fa-shield-halved mr-1.5 ${hit?'text-rose-600':'text-emerald-600'}"></i>
                    한국산업안전보건공단 (KOSHA)
                </p>
                ${hit
                    ? '<span class="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">규제 대상</span>'
                    : '<span class="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">매칭 없음</span>'}
            </div>
            <p class="text-[11px] text-gray-500 mb-2">산업안전보건법 · 시행령 · 시행규칙 · 안전보건기준에 관한 규칙</p>
            <p class="text-xs text-gray-700 font-semibold">${kosha.note || (hit?'매칭됨':'해당 없음')}</p>
            ${docsHtml}
        </div>

        <div class="mt-3 bg-slate-50 rounded-lg p-3 text-[11px] text-gray-600 flex items-center justify-between flex-wrap gap-2">
            <span><i class="fa-solid fa-clock mr-1"></i>조회 시각: ${new Date(r.checkedAt).toLocaleString()}</span>
            <span>
                ${r.fromCache?'📦 캐시':'🌐 신규 조회'}
                ${r.demo?'· 데모 모드':''}
                ${r.meta?.elapsedMs?`· ${r.meta.elapsedMs}ms`:''}
            </span>
        </div>
    `;
}

function escapeHtml(s){
    return String(s||'').replace(/[&<>"']/g, c=>({
        '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
}
