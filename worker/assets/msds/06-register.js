/* =========================================================
   [진행률 표시·MSDS 파일 처리·등록]
   ========================================================= */
function updateProgress(pct,msg){
    let safePct = Number(pct);
    if(!isFinite(safePct)) safePct = 0;
    if(safePct < 0) safePct = 0;
    if(safePct > 100) safePct = 100;

    document.getElementById('progressBar').style.width = safePct + '%';
    document.getElementById('progressPercent').textContent = Math.round(safePct) + '%';
    if(msg){
        const log = document.getElementById('progressLog');
        const p = document.createElement('p');
        p.innerHTML = `<i class="fa-solid fa-check text-emerald-500 mr-1"></i>${msg}`;
        log.appendChild(p);
        log.scrollTop = log.scrollHeight;
    }
}
const sleep = ms => new Promise(r=>setTimeout(r,ms));
let lastParsedMaterials = [];

/* =========================================================
   구성성분 수동 입력 테이블
   ========================================================= */
let manualCompRows = [];

function addManualCompRow(name='', cas='', content=''){
    const contentNum = parseContentNum(content);
    manualCompRows.push({ name, cas, content, contentNum });
    renderManualCompTable();
    syncManualToParsed();
}

function removeManualCompRow(idx){
    manualCompRows.splice(idx, 1);
    renderManualCompTable();
    syncManualToParsed();
}

function updateManualCompRow(idx, field, value){
    if(!manualCompRows[idx]) return;
    manualCompRows[idx][field] = value;
    if(field === 'content'){
        manualCompRows[idx].contentNum = parseContentNum(value);
    }
    recalcManualCompSum();
    syncManualToParsed();
}

/* ⭐ 수동 테이블 → 자동추출 결과(parsed) 동기화 */
function syncManualToParsed(){
    if(!lastParsedMaterials || lastParsedMaterials.length === 0) return;
    const m = lastParsedMaterials[0];
    m.composition = manualCompRows.map(r=>({
        name: r.name || '(미기입)',
        cas: r.cas || '-',
        content: r.content || '-',
        contentNum: r.contentNum || 0
    }));
    m.compositionSum = Math.round(m.composition.reduce((s,c)=>s+(c.contentNum||0),0) * 10) / 10;
    m.compositionValid = (m.compositionSum >= 95 && m.compositionSum <= 105);
    m.compositionReviewed = true;

    // ⭐ 자동추출 UI 도 있으면 다시 렌더 (양방향 동기화)
    if(typeof renderCompositionReview === 'function' && document.getElementById('compositionReviewArea')){
        const area = document.getElementById('compositionReviewArea');
        if(!area.classList.contains('hidden')){
            renderCompositionReview(m);
        }
    }
}

function parseContentNum(str){
    if(!str) return 0;
    const nums = String(str).match(/\d+(?:\.\d+)?/g);
    if(!nums) return 0;
    if(nums.length >= 2){
        return (parseFloat(nums[0]) + parseFloat(nums[1])) / 2;
    }
    return parseFloat(nums[0]) || 0;
}

function recalcManualCompSum(){
    const sum = manualCompRows.reduce((s, r) => s + (r.contentNum || 0), 0);
    const el = document.getElementById('manualCompSum');
    if(el){
        const rounded = Math.round(sum * 10) / 10;
        el.textContent = rounded;
        el.className = (sum >= 95 && sum <= 105) ? 'text-emerald-700' : (sum > 105 ? 'text-rose-700' : 'text-amber-700');
    }
}

function renderManualCompTable(){
    const body = document.getElementById('manualCompBody');
    if(!body) return;

    if(manualCompRows.length === 0){
        body.innerHTML = `
            <tr>
                <td colspan="5" class="text-center py-6 text-gray-400 text-xs bg-white border border-gray-200 border-t-0">
                    <i class="fa-solid fa-inbox mr-1"></i>
                    성분이 없습니다. 우측 상단의 <b>+ 성분 추가</b> 버튼을 눌러 시작하세요.
                </td>
            </tr>`;
        recalcManualCompSum();
        return;
    }

    body.innerHTML = manualCompRows.map((r, i) => `
        <tr class="bg-white border border-gray-200 border-t-0">
            <td class="px-2 py-1 text-center text-gray-500 font-mono">${i+1}</td>
            <td class="px-1 py-1">
                <input type="text" value="${(r.name||'').replace(/"/g,'&quot;')}"
                    placeholder="예: 황산 (Sulfuric Acid)"
                    onchange="updateManualCompRow(${i},'name',this.value)"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-teal-500 focus:border-teal-500">
            </td>
            <td class="px-1 py-1">
                <input type="text" value="${(r.cas||'').replace(/"/g,'&quot;')}"
                    placeholder="예: 7664-93-9"
                    onchange="updateManualCompRow(${i},'cas',this.value)"
                    class="w-full border border-gray-200 rounded px-2 py-1 text-xs font-mono focus:ring-1 focus:ring-teal-500 focus:border-teal-500">
            </td>
            <td class="px-1 py-1">
                <div class="flex items-center gap-1">
                    <input type="text" value="${(r.content||'').replace(/"/g,'&quot;')}"
                        placeholder="95~98 또는 99"
                        onchange="updateManualCompRow(${i},'content',this.value)"
                        class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs text-center focus:ring-1 focus:ring-teal-500 focus:border-teal-500">
                    <span class="text-xs text-gray-500 font-bold">%</span>
                </div>
            </td>
            <td class="px-1 py-1 text-center">
                <button type="button" onclick="removeManualCompRow(${i})" class="text-rose-600 hover:text-rose-800" title="삭제">
                    <i class="fa-solid fa-trash text-xs"></i>
                </button>
            </td>
        </tr>
    `).join('');
    recalcManualCompSum();
}

function clearManualComp(){
    manualCompRows = [];
    renderManualCompTable();
    syncManualToParsed();
}

/* =========================================================
   MSDS 파일 처리
   ========================================================= */
async function handleMSDSFiles(files){
    if(!files || files.length === 0) return;

    if(typeof parseMSDSFile !== 'function'){
        alert('⚠ MSDS 파서 스크립트가 로드되지 않았습니다.\n\n브라우저 콘솔(F12)에서 오류를 확인하거나\n페이지를 새로고침(Ctrl+F5)해주세요.');
        return;
    }

    document.getElementById('uploadProgress').classList.remove('hidden');
    document.getElementById('parseResult').classList.add('hidden');
    document.getElementById('compositionReviewArea').classList.add('hidden');
    document.getElementById('progressLog').innerHTML = '';
    updateProgress(0);

    const parsedList = [];
    const total = files.length;

    for(let i=0; i<total; i++){
        const f = files[i];
        const base = (i * 100) / total;
        const step = 100 / total;

        try{
            updateProgress(base + step*0.15, `📄 [${f.name}] 수신`); await sleep(150);
            updateProgress(base + step*0.30, `🔍 [${f.name}] PDF 텍스트 추출 중…`);
            updateProgress(base + step*0.50, `🧠 [${f.name}] 지식베이스 매칭 중…`);
            updateProgress(base + step*0.75, `📋 [${f.name}] 3번 구성성분 추출 중…`);

            const parsed = await parseMSDSFile(f);
            parsedList.push(parsed);
            updateProgress(((i+1) * 100) / total,
                `✅ [${parsed.name}] → 신뢰도: ${parsed.matchConfidence} · 성분 ${parsed.composition?.length||0}개`);
        } catch(err){
            console.error('[handleMSDSFiles] 파싱 실패:', f.name, err);
            updateProgress(((i+1) * 100) / total,
                `❌ [${f.name}] 파싱 실패: ${err.message}`);
        }
    }

    updateProgress(100, '🎉 파싱 완료 — 구성성분을 검수한 후 등록하세요');
    await sleep(300);

    if(parsedList.length === 0){
        alert('⚠ 파싱된 파일이 없습니다. PDF 형식과 내용을 확인해주세요.\n\n하단의 「구성성분 수동 입력」 섹션에서 직접 입력하실 수 있습니다.');
        return;
    }

    document.getElementById('parseResult').classList.remove('hidden');
    document.getElementById('parseResultSummary').innerHTML =
        parsedList.map(p=>`<b>${p.name}</b>`).join(', ');
    document.getElementById('parseDetail').innerHTML = parsedList.map(p=>`
        <div class="border-b border-emerald-100 pb-2 mb-2 last:border-0 last:mb-0 last:pb-0">
            <p class="font-bold text-emerald-900">📦 ${p.name}</p>
            <p class="text-gray-600 mt-1">
                <span class="parse-highlight">CAS ${p.cas}</span>
                <span class="parse-highlight">${p.signalWord}</span>
                <span class="parse-highlight">픽토그램 ${p.pictograms.length}종</span>
                ${p.isSpecial?'<span class="parse-highlight" style="background:linear-gradient(120deg,#fecaca,#f87171)">특별관리물질</span>':''}
                <span class="parse-highlight" style="background:linear-gradient(120deg,#bfdbfe,#93c5fd)">성분 ${p.composition?.length||0}개</span>
            </p>
            <p class="text-gray-500 text-[10px] mt-1">📁 원본: ${p.sourceFile} · 신뢰도: <b class="${p.matched?'text-emerald-700':'text-amber-700'}">${p.matchConfidence}</b></p>
        </div>
    `).join('');

    lastParsedMaterials = parsedList;
    const first = parsedList[0];
    const regProduct = document.getElementById('reg-product');
    if(regProduct) regProduct.value = first.name;

    const regMfr = document.getElementById('reg-manufacturer');
    if(regMfr && first.manufacturer && first.manufacturer !== '(파일 참조)') regMfr.value = first.manufacturer;
    const regSup = document.getElementById('reg-supplier');
    if(regSup && first.supplier && first.supplier !== '(공급자 참조)') regSup.value = first.supplier;

    updateAIPreview(first);

    // ⭐ 파싱 결과 → 수동 입력 테이블 동기화
    manualCompRows = (first.composition || []).map(c => ({
        name: c.name || '',
        cas: c.cas || '',
        content: c.content || '',
        contentNum: c.contentNum || 0
    }));
    if(manualCompRows.length === 0){
        manualCompRows.push({ name:'', cas:'', content:'', contentNum:0 });
    }
    renderManualCompTable();

    renderCompositionReview(first);
}

function updateAIPreview(m){
    const box = document.getElementById('aiPreviewBody');
    if(!box) return;
    if(!m){
        box.innerHTML = '<p class="text-gray-400 text-center py-8"><i class="fa-solid fa-file-arrow-up text-2xl mb-2 block"></i>파일을 업로드하면<br>여기에 결과가 표시됩니다</p>';
        return;
    }
    const ghsBadges = m.pictograms.map(p=>{
        const g = GHS_PICTOGRAMS[p];
        return `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-semibold">${g?g.name:p}</span>`;
    }).join(' ');

    box.innerHTML = `
        <div>
            <p class="font-bold text-gray-600">📄 제품명 / CAS</p>
            <p class="mt-1 bg-white border border-teal-100 rounded p-2 text-gray-800 text-[11px]">${m.name}<br><span class="font-mono text-gray-500">${m.cas}</span></p>
        </div>
        <div>
            <p class="font-bold text-gray-600">⚠ 신호어 · GHS 픽토그램</p>
            <div class="mt-1 bg-white border border-teal-100 rounded p-2">
                <span class="inline-block bg-red-600 text-white text-xs font-black px-2 py-0.5 rounded mr-2">${m.signalWord}</span>
                <div class="flex flex-wrap gap-1 mt-1">${ghsBadges}</div>
            </div>
        </div>
        <div>
            <p class="font-bold text-gray-600">🧬 유해위험문구 (상위 3개)</p>
            <ul class="mt-1 bg-white border border-teal-100 rounded p-2 space-y-1 text-gray-700 text-[11px]">
                ${m.hazards.slice(0,3).map(h=>`<li>· ${h}</li>`).join('')}
            </ul>
        </div>
        <div>
            <p class="font-bold text-gray-600">🛡️ 권장 보호구</p>
            <p class="mt-1 bg-white border border-teal-100 rounded p-2 text-gray-700 text-[11px]">${m.ppe.join(', ')}</p>
        </div>
        <div>
            <p class="font-bold text-gray-600">⚖️ 법규 자동매칭 <span class="text-[9px] text-gray-400">(등록 후 공식 API 자동검수)</span></p>
            <ul class="mt-1 space-y-1 text-gray-700 text-[11px]">
                ${m.isSpecial?'<li>✓ 산안법 <b>특별관리물질</b></li>':''}
                ${m.isSpecial?'<li>✓ 작업환경측정 대상 (6개월)</li>':'<li>· 작업환경측정: 등록 후 자동검수</li>'}
                ${m.isSpecial?'<li>✓ 특수건강진단 대상 (12개월)</li>':''}
                <li>· 폐기물관리법: 지정폐기물</li>
            </ul>
        </div>
        ${m.isSpecial?'<div class="bg-rose-100 border border-rose-300 rounded p-2 text-rose-700 font-bold text-[11px]"><i class="fa-solid fa-triangle-exclamation mr-1"></i>특별관리물질 감지됨</div>':''}
        <div class="text-[10px] text-gray-500 pt-2 border-t border-teal-100">
            📊 매칭 신뢰도: <b class="${m.matched?'text-emerald-700':'text-amber-700'}">${m.matchConfidence}</b>
        </div>
    `;
}

/* =========================================================
   ⭐⭐⭐ 등록 처리 + 자동 검수 트리거
   ========================================================= */
function registerMaterial(){
    const product = document.getElementById('reg-product').value.trim();
    const dept = document.getElementById('reg-dept').value.trim();
    const process = document.getElementById('reg-process').value.trim();
    const usage = document.getElementById('reg-usage').value;
    const manufacturer = document.getElementById('reg-manufacturer')?.value.trim() || '';
    const supplier = document.getElementById('reg-supplier')?.value.trim() || '';

    if(!product){ alert('제품명을 입력하세요. (파일을 업로드하면 자동 채워집니다)'); return; }
    if(!dept){ alert('사용 부서를 입력하세요.'); return; }

    const validManualComp = manualCompRows.filter(r =>
        (r.name && r.name.trim()) || (r.cas && r.cas.trim()) || (r.contentNum > 0)
    ).map(r => ({
        name: (r.name || '').trim() || '(미기입)',
        cas: (r.cas || '').trim() || '-',
        content: r.content || '-',
        contentNum: r.contentNum || 0
    }));

    const manualSum = Math.round(validManualComp.reduce((s,c)=>s+c.contentNum,0) * 10) / 10;

    if(validManualComp.length > 0 && (manualSum < 90 || manualSum > 110)){
        if(!confirm(`⚠️ 구성성분 합계가 ${manualSum}% 입니다.\n\n일반적으로 100% ±5% 여야 합니다.\n그래도 등록하시겠습니까?`)){
            return;
        }
    }

    let firstId = null;
    const registeredIds = [];

    if(lastParsedMaterials && lastParsedMaterials.length > 0){
        lastParsedMaterials.forEach((m, i)=>{
            if(i===0){
                m.name = product;
                if(manufacturer) m.manufacturer = manufacturer;
                if(supplier) m.supplier = supplier;
                if(validManualComp.length > 0){
                    m.composition = validManualComp;
                    m.compositionSum = manualSum;
                    m.compositionValid = (manualSum >= 95 && manualSum <= 105);
                    m.compositionReviewed = true;
                    if(validManualComp[0].cas && validManualComp[0].cas !== '-'){
                        m.cas = validManualComp[0].cas;
                    }
                }
            }
            m.deptInfo = dept;
            m.processInfo = process;
            m.usageInfo = usage;
            MATERIALS.unshift(m);
            registeredIds.push(m.id);
            if(!firstId) firstId = m.id;
        });
        showToast(`✅ ${lastParsedMaterials.length}건 등록 완료 → 공식 API 자동검수 시작`);
        lastParsedMaterials = [];
    } else {
        const manual = JSON.parse(JSON.stringify(FALLBACK_TEMPLATE));
        manual.id = 'MAT_' + Date.now();
        manual.name = product;
        manual.subtitle = (validManualComp[0] && validManualComp[0].cas !== '-') ? validManualComp[0].cas : '수동 등록';
        manual.deptInfo = dept;
        manual.processInfo = process;
        manual.usageInfo = usage;
        if(manufacturer) manual.manufacturer = manufacturer;
        if(supplier) manual.supplier = supplier;

        if(validManualComp.length > 0){
            manual.composition = validManualComp;
            manual.compositionSum = manualSum;
            manual.compositionValid = (manualSum >= 95 && manualSum <= 105);
            manual.compositionReviewed = true;
            if(validManualComp[0].cas && validManualComp[0].cas !== '-'){
                manual.cas = validManualComp[0].cas;
                manual.subtitle = validManualComp[0].cas;
            }
        }

        manual.uploadedAt = new Date().toISOString();
        MATERIALS.unshift(manual);
        firstId = manual.id;
        registeredIds.push(firstId);
        showToast(`✅ 수동 등록 완료 (성분 ${validManualComp.length}개) → 공식 API 자동검수 시작`);
    }

    saveMATERIALS();

    selectedMaterialId = firstId;
    renderMaterialList();
    applyMaterialToForms(MATERIALS.find(m=>m.id===firstId));
    renderListTable();

    clearRegForm();

    // ⭐⭐⭐ 등록된 모든 물질에 대해 자동 검수 실행 (혼합물 성분 전체 병렬조회)
    if(typeof autoInspectMaterial === 'function'){
        (async ()=>{
            let totalCasChecked = 0;
            let totalRegulated = 0;
            for(const id of registeredIds){
                try{
                    const results = await autoInspectMaterial(id, false);
                    if(results){
                        totalCasChecked += results.length;
                        totalRegulated += results.filter(x=>x.status==='REGULATED').length;
                    }
                }catch(e){
                    console.warn('[registerMaterial] 자동검수 실패:', id, e);
                }
            }
            if(registeredIds.length > 0 && typeof showToast === 'function'){
                showToast(`🔍 자동검수 완료: ${registeredIds.length}건 등록, ${totalCasChecked}개 CAS 조회, 규제 ${totalRegulated}건`);
            }
            // ⭐ 자동조회 후 리스트 강제 재렌더 (분석중 → 결과 표시)
            if(typeof renderListTable === 'function') renderListTable();
        })();
    }

    setTimeout(()=>goToListTab(), 800);
}


function clearRegForm(){
    const ids = ['reg-product','reg-process','reg-usage','reg-dept','reg-manufacturer','reg-supplier'];
    ids.forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('parseResult').classList.add('hidden');
    document.getElementById('compositionReviewArea').classList.add('hidden');
    document.getElementById('compositionReviewArea').innerHTML = '';

    manualCompRows = [{ name:'', cas:'', content:'', contentNum:0 }];
    renderManualCompTable();

    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = false;
        regBtn.classList.remove('opacity-50','cursor-not-allowed');
    }
}

document.addEventListener('DOMContentLoaded', function(){
    manualCompRows = [{ name:'', cas:'', content:'', contentNum:0 }];
    setTimeout(()=>renderManualCompTable(), 300);
});
