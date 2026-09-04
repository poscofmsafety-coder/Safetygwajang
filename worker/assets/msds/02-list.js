/* =========================================================
   ② MSDS 리스트 상태
   ========================================================= */
let list2State = {
    page: 1,
    pageSize: 10,
    filter: { dept:'', process:'', hazard:'', law:'', search:'' },
    filtered: [],
    selectedIds: new Set(),
    expandedCasIds: new Set()  // ⭐ CAS 펼침 상태
};

/* =========================================================
   ⭐ HTML 이스케이프 (인라인 편집 안전용)
   ========================================================= */
function escHtml(v){
    if(v==null) return '';
    return String(v)
        .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
        .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

/* =========================================================
   ⭐ 인라인 편집 저장 (셀 blur 시)
   ========================================================= */
function editListCell(id, field, el){
    const m = MATERIALS.find(x=>x.id===id);
    if(!m) return;
    let val = (el.innerText||'').trim();

    // 등록일은 YYYY-MM-DD → ISO 로 변환
    if(field === 'uploadedAt'){
        const d = new Date(val);
        if(!isNaN(d.getTime())){
            m.uploadedAt = d.toISOString();
        } else {
            showToast('⚠ 날짜 형식이 올바르지 않습니다 (예: 2025-01-15)');
            renderListTable();
            return;
        }
    } else if(field === 'deptInfo'){
        m.deptInfo = val; m.dept = val;
    } else if(field === 'processInfo'){
        m.processInfo = val; m.process = val;
    } else if(field === 'cas'){
        // CAS 수정 시 대표 CAS 갱신 + 자동조회 트리거
        const oldCas = m.cas;
        m.cas = val || '-';
        m.subtitle = val || m.subtitle;
        saveMATERIALS();
        renderListTable();
        if(val && val !== oldCas && val !== '-' && typeof autoInspectMaterial === 'function'){
            autoInspectMaterial(id, true);
        }
        showToast('✅ CAS 저장됨');
        return;
    } else {
        m[field] = val;
    }

    saveMATERIALS();
    showToast('✅ 저장됨');
    // 리스트 재렌더 (다른 셀 편집 중이 아닐 때만 안전)
    renderListTable();
}

/* =========================================================
   ⭐ CAS 펼침 토글
   ========================================================= */
function toggleCasExpand(id, ev){
    if(ev){ ev.stopPropagation(); }
    if(list2State.expandedCasIds.has(id)) list2State.expandedCasIds.delete(id);
    else list2State.expandedCasIds.add(id);
    renderListTable();
}

/* =========================================================
   ⭐ 다중 CAS 셀 HTML 생성
   ========================================================= */
function renderCasCell(m){
    const mainCas = m.cas || '-';
    const compCasList = (m.composition||[])
        .map(c=>c.cas)
        .filter(c=>c && c!=='-' && c!==mainCas);
    const uniqCompCas = [...new Set(compCasList)];
    const hasMore = uniqCompCas.length > 0;
    const isExpanded = list2State.expandedCasIds.has(m.id);

    // 메인 CAS (편집 가능)
    let html = `<div class="flex items-center gap-1 flex-wrap">`;
    html += `<span contenteditable="true" onblur="editListCell('${m.id}','cas',this)" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" class="font-mono text-[11px] px-1 rounded hover:bg-yellow-50 focus:bg-yellow-100 focus:outline-none focus:ring-1 focus:ring-teal-400" title="클릭하여 CAS 수정">${escHtml(mainCas)}</span>`;

    if(hasMore){
        html += `<button onclick="toggleCasExpand('${m.id}', event)" class="ml-1 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded px-1.5 py-0.5 text-[9px] font-bold text-slate-700" title="구성성분 CAS 보기">+${uniqCompCas.length}${isExpanded?' ▲':' ▼'}</button>`;
    }
    html += `</div>`;

    // 펼침 영역 (성분 CAS 목록 + 각 상태 배지)
    if(hasMore && isExpanded){
        html += `<div class="mt-1.5 pl-2 border-l-2 border-teal-300 space-y-0.5" onclick="event.stopPropagation()">`;
        uniqCompCas.forEach(cas=>{
            const cache = InspectCache.get(cas);
            let badge = '';
            if(!cache){
                badge = '<span class="text-[9px] text-gray-400">(대기)</span>';
            } else if(cache.status === 'REGULATED'){
                const cnt = Object.values(cache.matched||{}).filter(Boolean).length;
                badge = `<span class="text-[9px] bg-rose-100 text-rose-700 px-1 rounded font-bold">규제${cnt}</span>`;
            } else {
                badge = '<span class="text-[9px] bg-emerald-50 text-emerald-700 px-1 rounded">-</span>';
            }
            html += `<div class="flex items-center gap-1 text-[10px]"><span class="text-gray-400">└</span><span class="font-mono">${escHtml(cas)}</span>${badge}</div>`;
        });
        html += `</div>`;
    }
    return html;
}

/* =========================================================
   ⭐ 통합 법규 배지 (union: 대표 + 모든 성분)
   ========================================================= */
function getUnifiedLawTags(m){
    const tags = [];
    if(m.isSpecial) tags.push({t:'특별관리', c:'bg-rose-100 text-rose-700'});
    if((m.tags||[]).includes('cmr')) tags.push({t:'CMR', c:'bg-orange-100 text-orange-700'});
    if((m.pictograms||[]).includes('GHS02')) tags.push({t:'위험물', c:'bg-orange-100 text-orange-700'});

    // 대표 material.laws
    const laws = m.laws || {};
    // 성분별 결과 union
    let kosha = !!laws.kosha, nier = !!laws.nier, nfa = !!laws.nfa, cci = !!laws.cci;
    (m.compInspections||[]).forEach(ci=>{
        if(ci.matched?.kosha) kosha = true;
        if(ci.matched?.nier) nier = true;
        if(ci.matched?.nfa) nfa = true;
        if(ci.matched?.cci) cci = true;
    });
    // 대표 CAS 캐시도 참조
    if(m.cas && m.cas!=='-'){
        const cache = InspectCache.get(m.cas);
        if(cache?.matched){
            if(cache.matched.kosha) kosha = true;
            if(cache.matched.nier) nier = true;
            if(cache.matched.nfa) nfa = true;
            if(cache.matched.cci) cci = true;
        }
    }
    if(kosha) tags.push({t:'산안법', c:'bg-blue-100 text-blue-700'});
    if(nier)  tags.push({t:'화관법', c:'bg-emerald-100 text-emerald-700'});
    if(nfa)   tags.push({t:'소방법', c:'bg-red-100 text-red-700'});
    if(cci)   tags.push({t:'화안원', c:'bg-purple-100 text-purple-700'});
    return tags;
}

/* =========================================================
   ⭐ 리스트 진입 시 자동조회 트리거 (1회만)
   ========================================================= */
function startAutoInspectOnce(){
    if(typeof autoInspectAllPending === 'function'){
        setTimeout(()=>autoInspectAllPending(false), 500);
    }
}

/* =========================================================
   메인 렌더링
   ========================================================= */
function renderListTable(){
    const tbody = document.getElementById('listTableBody');
    const emptyState = document.getElementById('listEmptyState');
    if(!tbody) return;

    const f = list2State.filter;
    const kw = f.search.trim().toLowerCase();
    let filtered = MATERIALS.filter(m=>{
        const dept = (m.deptInfo||m.dept||'').toString();
        const process = (m.processInfo||m.process||'').toString();
        if(f.dept && !dept.includes(f.dept)) return false;
        if(f.process && !process.includes(f.process)) return false;
        if(f.hazard === 'special' && !m.isSpecial) return false;
        if(f.hazard === 'cmr' && !(m.tags||[]).includes('cmr')) return false;
        if(f.hazard === 'carcino' && !((m.tags||[]).includes('carcino') || (m.hazards||[]).some(h=>h.includes('발암')))) return false;
        if(f.hazard === 'repro' && !((m.hazards||[]).some(h=>h.includes('생식')))) return false;
        if(f.hazard === 'flam' && !(m.pictograms||[]).includes('GHS02')) return false;
        if(f.law){
            if(f.law === '산업안전보건법' && !m.isSpecial && !m.laws?.kosha) return false;
            if(f.law === '위험물안전관리법' && !(m.pictograms||[]).includes('GHS02') && !m.laws?.nfa) return false;
        }
        if(kw){
            // 성분 CAS까지 검색 대상 포함
            const compCas = (m.composition||[]).map(c=>c.cas).join(' ');
            const target = (m.name+' '+(m.cas||'')+' '+dept+' '+process+' '+(m.manufacturer||'')+' '+compCas).toLowerCase();
            if(!target.includes(kw)) return false;
        }
        return true;
    });

    list2State.filtered = filtered;

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / list2State.pageSize));
    if(list2State.page > totalPages) list2State.page = totalPages;
    const start = (list2State.page - 1) * list2State.pageSize;
    const pageData = filtered.slice(start, start + list2State.pageSize);

    if(MATERIALS.length === 0){
        tbody.innerHTML = '';
        if(emptyState) emptyState.classList.remove('hidden');
    } else if(pageData.length === 0){
        if(emptyState) emptyState.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="9" class="text-center py-10 text-gray-400 text-xs"><i class="fa-solid fa-filter-circle-xmark text-2xl mb-2 block"></i>필터 조건에 맞는 항목이 없습니다. <button onclick="resetFilter2()" class="text-teal-600 underline ml-1">필터 초기화</button></td></tr>`;
    } else {
        if(emptyState) emptyState.classList.add('hidden');
        tbody.innerHTML = pageData.map(m=>{
            // 공식 API 버튼 (대표 CAS 기준)
            const cache = m.cas && m.cas!=='-' ? InspectCache.get(m.cas) : null;
            let apiCell;
            if(!m.cas || m.cas==='-'){
                apiCell = `<span class="text-[10px] text-gray-400">CAS 없음</span>`;
            } else if(!cache){
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-blue-50 border border-blue-300 text-blue-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-blue-100"><i class="fa-solid fa-spinner spin mr-1"></i>대기중</button>`;
            } else if(cache.status==='REGULATED'){
                const cnt = Object.values(cache.matched||{}).filter(Boolean).length;
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-rose-100 text-rose-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-rose-200"><i class="fa-solid fa-triangle-exclamation mr-1"></i>규제 ${cnt}건</button>`;
            } else {
                apiCell = `<button onclick="event.stopPropagation(); document.getElementById('insCasInput').value='${m.cas}'; inspectCasSingle(false);" class="bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-bold px-2 py-1 rounded hover:bg-emerald-100"><i class="fa-solid fa-check mr-1"></i>매칭 없음</button>`;
            }

            const ghsHtml = (m.pictograms||[]).map(code=>{
                const g = GHS_PICTOGRAMS[code];
                return `<span class="bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold" title="${g?g.name:code}">${g?g.name.substring(0,4):code}</span>`;
            }).join(' ') || '<span class="text-gray-400 text-[10px]">-</span>';

            // 통합 법규 배지
            const unified = getUnifiedLawTags(m);
            let lawHtml;
            if(unified.length > 0){
                lawHtml = unified.map(x=>`<span class="${x.c} px-1.5 py-0.5 rounded font-semibold text-[10px]">${x.t}</span>`).join(' ');
            } else if(m.laws?.checkedAt){
                lawHtml = '<span class="text-gray-400 text-[10px]">해당 없음</span>';
            } else if((m.cas && m.cas!=='-') || (m.composition||[]).some(c=>c.cas)){
                lawHtml = '<span class="text-blue-500 text-[10px]"><i class="fa-solid fa-spinner spin mr-1"></i>분석중</span>';
            } else {
                lawHtml = '<span class="text-gray-400 text-[10px]">-</span>';
            }

            const dept = m.deptInfo || m.dept || '';
            const process = m.processInfo || m.process || '';
            const regDate = m.uploadedAt ? new Date(m.uploadedAt).toISOString().slice(0,10) : '-';
            const isChecked = list2State.selectedIds.has(m.id) ? 'checked' : '';

            // 인라인 편집 셀 헬퍼
            const editSpan = (field, val, ph='-') => 
                `<span contenteditable="true" onblur="editListCell('${m.id}','${field}',this)" onclick="event.stopPropagation()" onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}" class="inline-block min-w-[30px] px-1 rounded hover:bg-yellow-50 focus:bg-yellow-100 focus:outline-none focus:ring-1 focus:ring-teal-400" title="클릭하여 수정">${val ? escHtml(val) : `<span class="text-gray-300">${ph}</span>`}</span>`;

            return `
                <tr class="hover:bg-teal-50 cursor-pointer" onclick="openDetailPanel('${m.id}')">
                    <td class="px-3 py-2.5" onclick="event.stopPropagation()">
                        <input type="checkbox" ${isChecked} onchange="toggleSelect2('${m.id}',this.checked)">
                    </td>
                    <td class="px-3 py-2.5">
                        <p class="font-bold text-gray-900">${editSpan('name', m.name)}</p>
                        <p class="text-[10px] text-gray-500">${editSpan('manufacturer', m.manufacturer, '제조사')}</p>
                    </td>
                    <td class="px-3 py-2.5 text-gray-600">${renderCasCell(m)}</td>
                    <td class="px-3 py-2.5">
                        <p class="text-gray-800 text-[11px]">${editSpan('deptInfo', dept, '부서')}</p>
                        <p class="text-gray-500 text-[10px]">${editSpan('processInfo', process, '공정')}</p>
                    </td>
                    <td class="px-3 py-2.5 text-center"><div class="flex justify-center gap-1 flex-wrap">${ghsHtml}</div></td>
                    <td class="px-3 py-2.5 text-center"><div class="flex justify-center gap-1 flex-wrap">${lawHtml}</div></td>
                    <td class="px-3 py-2.5 text-center">${apiCell}</td>
                    <td class="px-3 py-2.5 text-center text-gray-600 text-[10px]">${editSpan('uploadedAt', regDate, '-')}</td>
                    <td class="px-3 py-2.5 text-center whitespace-nowrap" onclick="event.stopPropagation()">
                        <button onclick="viewInLabelTab('${m.id}')" class="text-teal-600 hover:text-teal-800 mr-2" title="경고표지 보기"><i class="fa-solid fa-tag"></i></button>
                        ${m.cas && m.cas!=='-' ? `<button onclick="autoInspectMaterial('${m.id}', true);" class="text-indigo-600 hover:text-indigo-800 mr-2" title="성분별 재조회"><i class="fa-solid fa-rotate"></i></button>`:''}
                        <button onclick="deleteMaterial('${m.id}')" class="text-rose-600 hover:text-rose-800" title="삭제"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
        }).join('');
    }

    document.getElementById('list-total-count').textContent = MATERIALS.length;
    document.getElementById('list-shown-count').textContent = total;
    const info = document.getElementById('list-filter-info');
    const isFiltered = f.dept || f.process || f.hazard || f.law || f.search;
    if(info){
        if(isFiltered){
            info.classList.remove('hidden');
            info.textContent = `(필터 적용 중)`;
        } else {
            info.classList.add('hidden');
        }
    }

    renderPagination2(totalPages);
    updateAllKPI();

    // ⭐⭐⭐ 여기서 자동조회 트리거 제거 (탭 진입 시에만 1회 호출)
}

function renderPagination2(totalPages){
    const container = document.getElementById('list-pagination');
    if(!container) return;
    if(totalPages <= 1){ container.innerHTML = ''; return; }
    const cur = list2State.page;
    let html = '';
    html += `<button ${cur===1?'disabled':''} onclick="goToPage2(1)" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angles-left"></i></button>`;
    html += `<button ${cur===1?'disabled':''} onclick="goToPage2(${cur-1})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angle-left"></i></button>`;
    const startP = Math.max(1, cur-2);
    const endP = Math.min(totalPages, startP+4);
    for(let i=startP; i<=endP; i++){
        html += `<button onclick="goToPage2(${i})" class="px-3 py-1 text-xs border ${i===cur?'border-teal-500 bg-teal-500 text-white font-bold':'border-gray-300 hover:bg-slate-50'} rounded">${i}</button>`;
    }
    html += `<button ${cur===totalPages?'disabled':''} onclick="goToPage2(${cur+1})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angle-right"></i></button>`;
    html += `<button ${cur===totalPages?'disabled':''} onclick="goToPage2(${totalPages})" class="px-2 py-1 text-xs border border-gray-300 rounded hover:bg-slate-50 disabled:opacity-40"><i class="fa-solid fa-angles-right"></i></button>`;
    container.innerHTML = html;
}
function goToPage2(p){ list2State.page = p; renderListTable(); }
function changePageSize2(){
    list2State.pageSize = Number(document.getElementById('list-page-size').value);
    list2State.page = 1;
    renderListTable();
}
function applyFilter2(){
    list2State.filter = {
        dept: document.getElementById('f2-dept').value,
        process: document.getElementById('f2-process').value,
        hazard: document.getElementById('f2-hazard').value,
        law: document.getElementById('f2-law').value,
        search: document.getElementById('f2-search').value
    };
    list2State.page = 1;
    renderListTable();
    showToast('🔎 검색·필터 적용 완료');
}
function resetFilter2(){
    ['f2-dept','f2-process','f2-hazard','f2-law','f2-search'].forEach(id=>{
        const el = document.getElementById(id);
        if(el) el.value='';
    });
    list2State.filter = { dept:'', process:'', hazard:'', law:'', search:'' };
    list2State.page = 1;
    renderListTable();
    showToast('필터 초기화 완료');
}
function toggleSelect2(id, checked){
    if(checked) list2State.selectedIds.add(id);
    else list2State.selectedIds.delete(id);
}
function toggleAllSelect2(cb){
    list2State.filtered.forEach(m=>{
        if(cb.checked) list2State.selectedIds.add(m.id);
        else list2State.selectedIds.delete(m.id);
    });
    renderListTable();
}
function deleteSelected2(){
    if(list2State.selectedIds.size === 0){ showToast('선택된 항목이 없습니다'); return; }
    if(!confirm(`선택된 ${list2State.selectedIds.size}건을 삭제하시겠습니까?`)) return;
    MATERIALS = MATERIALS.filter(m=>!list2State.selectedIds.has(m.id));
    list2State.selectedIds.clear();
    saveMATERIALS();
    renderMaterialList();
    renderListTable();
    showToast('✅ 선택 항목 삭제 완료');
}
function deleteMaterial(id){
    const m = MATERIALS.find(x=>x.id===id);
    if(!m) return;
    if(!confirm(`「${m.name}」을(를) 삭제하시겠습니까?`)) return;
    MATERIALS = MATERIALS.filter(x=>x.id!==id);
    list2State.selectedIds.delete(id);
    if(selectedMaterialId === id && MATERIALS.length > 0){
        selectedMaterialId = MATERIALS[0].id;
    }
    saveMATERIALS();
    renderMaterialList();
    renderListTable();
    if(MATERIALS.length > 0) applyMaterialToForms(MATERIALS.find(x=>x.id===selectedMaterialId));
    showToast('🗑 삭제 완료');
}

/* =========================================================
   상세 패널 (성분별 규제 결과 표시)
   ========================================================= */
function openDetailPanel(id){
    const m = MATERIALS.find(x=>x.id===id);
    if(!m) return;
    document.getElementById('dp-name').textContent = m.name;
    document.getElementById('dp-cas').textContent = m.cas || '-';

    const specialBadge = m.isSpecial ? `
        <div class="bg-rose-50 border-l-4 border-rose-500 rounded-r-lg p-3">
            <p class="text-xs font-bold text-rose-700"><i class="fa-solid fa-triangle-exclamation mr-1"></i>특별관리물질</p>
            <p class="text-xs text-rose-600 mt-1">임신 중 노출 시 태아에게 해를 끼칠 우려. 특별관리 필요.</p>
        </div>` : '';

    const ghsBadges = (m.pictograms||[]).map(code=>{
        const g = GHS_PICTOGRAMS[code];
        return `<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded font-semibold text-xs">${g?g.name:code}</span>`;
    }).join(' ') || '<span class="text-gray-400 text-xs">해당 없음</span>';

    let compHtml = '';
    if(m.composition && m.composition.length > 0){
        compHtml = `
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">구성성분 (MSDS 3번)</p>
            <div class="bg-slate-50 rounded-lg p-3">
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300 text-gray-600">
                            <th class="text-left py-1">물질명</th>
                            <th class="text-left py-1">CAS</th>
                            <th class="text-right py-1">함유량</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${m.composition.map(c=>`
                            <tr class="border-b border-gray-200">
                                <td class="py-1">${escHtml(c.name)}</td>
                                <td class="py-1 font-mono text-[10px]">${escHtml(c.cas)}</td>
                                <td class="py-1 text-right">${escHtml(c.content)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p class="text-[10px] text-gray-500 mt-2">합계: <b>${m.compositionSum||0}%</b> ${m.compositionReviewed?'· ✅ 검수완료':''}</p>
            </div>
        </div>`;
    }

    // ⭐⭐⭐ 성분별 법규 상세 (compInspections)
    let compInspHtml = '';
    if(m.compInspections && m.compInspections.length > 0){
        compInspHtml = `
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">🔬 성분별 법규 자동매칭 <span class="text-[10px] text-gray-400">(공식 API)</span></p>
            <div class="bg-white border border-indigo-200 rounded-lg divide-y divide-indigo-100">
                ${m.compInspections.map(ci=>{
                    const badges = [];
                    if(ci.matched?.kosha) badges.push('<span class="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-[10px] font-bold">산안법</span>');
                    if(ci.matched?.nier)  badges.push('<span class="bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-bold">화관법</span>');
                    if(ci.matched?.nfa)   badges.push('<span class="bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-bold">소방법</span>');
                    if(ci.matched?.cci)   badges.push('<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px] font-bold">화안원</span>');
                    const status = ci.status === 'REGULATED'
                        ? '<span class="bg-rose-100 text-rose-700 px-2 py-0.5 rounded text-[10px] font-black">⚠ 규제</span>'
                        : '<span class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px]">매칭 없음</span>';
                    const tagChips = (ci.tags||[]).slice(0,5).map(t=>`<span class="bg-indigo-50 text-indigo-700 px-1 py-0.5 rounded text-[9px]">${escHtml(t)}</span>`).join(' ');
                    return `
                        <div class="p-2.5">
                            <div class="flex items-center justify-between gap-2 flex-wrap">
                                <div>
                                    <p class="font-bold text-xs text-gray-800">${escHtml(ci.matchedName || '(미확인)')} <span class="font-mono text-[10px] text-gray-500">${escHtml(ci.cas)}</span></p>
                                    <div class="flex gap-1 mt-1 flex-wrap">${badges.join('')} ${tagChips}</div>
                                </div>
                                ${status}
                            </div>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
    }

    // 통합 법규 요약
    let lawsHtml = '';
    if(m.laws){
        const lawItems = [];
        if(m.laws.kosha) lawItems.push('<li>✓ KOSHA MSDS <b>등재</b> (산업안전보건법)</li>');
        if(m.laws.nier) lawItems.push('<li>✓ 환경공단 <b>화관법 유독물질</b> 해당</li>');
        if(m.laws.nfa) lawItems.push('<li>✓ 소방청 <b>위험물</b> 지정 (위험물안전관리법)</li>');
        if(m.laws.cci) lawItems.push('<li>✓ 화학물질안전원 <b>안전관리정보</b> 등재</li>');
        if(m.envTarget) lawItems.push(`<li>✓ 작업환경측정 대상 (${m.envCycle||6}개월 주기)</li>`);
        if(m.healthTarget) lawItems.push(`<li>✓ 특수건강진단 대상 (${m.healthCycle||12}개월 주기)</li>`);

        if(lawItems.length > 0){
            const checkedDate = m.laws.checkedAt ? new Date(m.laws.checkedAt).toLocaleString() : '-';
            lawsHtml = `
            <div>
                <p class="text-xs font-bold text-gray-500 mb-1">⚖️ 법규 통합 요약</p>
                <ul class="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-1 text-xs text-indigo-900">
                    ${lawItems.join('')}
                </ul>
                <p class="text-[10px] text-gray-400 mt-1">📅 검수일시: ${checkedDate}</p>
            </div>`;
        }
    }

    document.getElementById('dp-body').innerHTML = `
        ${specialBadge}
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">기본 정보</p>
            <div class="bg-slate-50 rounded-lg p-3 space-y-1 text-xs">
                <p>제품명: <b>${escHtml(m.name)}</b></p>
                <p>CAS No.: <span class="font-mono">${escHtml(m.cas||'-')}</span></p>
                <p>제조사: ${escHtml(m.manufacturer||'-')}</p>
                <p>공급자: ${escHtml(m.supplier||'-')}</p>
                <p>사용 부서: ${escHtml(m.deptInfo||m.dept||'-')}</p>
                <p>사용 공정: ${escHtml(m.processInfo||m.process||'-')}</p>
                <p>월 사용량: ${escHtml(m.usageInfo||'-')} kg</p>
                <p>등록일: ${m.uploadedAt ? new Date(m.uploadedAt).toLocaleString() : '-'}</p>
            </div>
        </div>
        ${compHtml}
        ${lawsHtml}
        ${compInspHtml}
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">신호어 · GHS 픽토그램</p>
            <div class="bg-slate-50 rounded-lg p-3 flex items-center gap-2">
                <span class="inline-block bg-red-600 text-white text-xs font-black px-3 py-1 rounded">${escHtml(m.signalWord||'-')}</span>
                <div class="flex flex-wrap gap-1">${ghsBadges}</div>
            </div>
        </div>
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">유해위험문구</p>
            <ul class="bg-slate-50 rounded-lg p-3 space-y-1 text-xs text-gray-700">
                ${(m.hazards||[]).map(h=>`<li>· ${escHtml(h)}</li>`).join('') || '<li class="text-gray-400">-</li>'}
            </ul>
        </div>
        <div>
            <p class="text-xs font-bold text-gray-500 mb-1">권장 보호구</p>
            <p class="bg-slate-50 rounded-lg p-3 text-xs text-gray-700">${escHtml((m.ppe||[]).join(', ') || '-')}</p>
        </div>
        <div class="flex gap-2">
            <button onclick="viewInLabelTab('${m.id}'); closeDetailPanel();" class="flex-1 bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold py-2 rounded-lg">
                <i class="fa-solid fa-tag mr-1"></i>경고표지 보기
            </button>
            ${((m.cas && m.cas!=='-') || (m.composition||[]).some(c=>c.cas)) ? `<button onclick="autoInspectMaterial('${m.id}', true); closeDetailPanel();" class="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold py-2 px-4 rounded-lg"><i class="fa-solid fa-satellite-dish mr-1"></i>성분별 재검수</button>`:''}
            <button onclick="deleteMaterial('${m.id}'); closeDetailPanel();" class="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold py-2 px-4 rounded-lg">
                <i class="fa-solid fa-trash mr-1"></i>삭제
            </button>
        </div>
    `;

    document.getElementById('detailPanel').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}
function viewInLabelTab(id){
    selectedMaterialId = id;
    renderMaterialList();
    const m = MATERIALS.find(x=>x.id===id);
    if(m) applyMaterialToForms(m);
    goToLabelTab();
}
function exportList2Excel(){
    const rows = list2State.filtered.map((m,i)=>({
        '번호': i+1,
        '제품명': m.name,
        'CAS No.': m.cas||'-',
        '전체CAS(성분포함)': [m.cas, ...(m.composition||[]).map(c=>c.cas)].filter(c=>c && c!=='-').join(' / '),
        '제조사': m.manufacturer||'-',
        '사용부서': m.deptInfo||m.dept||'-',
        '사용공정': m.processInfo||m.process||'-',
        '월사용량(kg)': m.usageInfo||'-',
        '신호어': m.signalWord||'-',
        '픽토그램': (m.pictograms||[]).join(', '),
        '특별관리물질': m.isSpecial ? 'Y' : 'N',
        'CMR': (m.tags||[]).includes('cmr') ? 'Y' : 'N',
        '산안법(KOSHA)': m.laws?.kosha ? 'Y' : 'N',
        '화관법(NIER)': m.laws?.nier ? 'Y' : 'N',
        '소방법(NFA)': m.laws?.nfa ? 'Y' : 'N',
        '화안원(CCI)': m.laws?.cci ? 'Y' : 'N',
        '작업환경측정': m.envTarget ? '대상' : '-',
        '특수건강진단': m.healthTarget ? '대상' : '-',
        '유해위험문구': (m.hazards||[]).join(' / '),
        '구성성분': (m.composition||[]).map(c=>`${c.name}(${c.cas}) ${c.content}`).join(' / '),
        '등록일': m.uploadedAt ? new Date(m.uploadedAt).toISOString().slice(0,10) : '-'
    }));
    if(rows.length === 0){ showToast('내보낼 데이터가 없습니다'); return; }
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'MSDS리스트');
    XLSX.writeFile(wb, 'MSDS리스트_'+new Date().toISOString().slice(0,10)+'.xlsx');
    showToast('📥 Excel 다운로드 완료');
}
function updateAllKPI(){
    const total = MATERIALS.length;
    const special = MATERIALS.filter(m=>m.isSpecial).length;
    const cmr = MATERIALS.filter(m=>(m.tags||[]).includes('cmr') || (m.hazards||[]).some(h=>h.includes('발암')||h.includes('생식')||h.includes('변이원'))).length;
    const envTarget = MATERIALS.filter(m=>m.envTarget || m.isSpecial || (m.hazards||[]).some(h=>h.includes('발암')||h.includes('생식'))).length;
    const healthTarget = MATERIALS.filter(m=>m.healthTarget || m.isSpecial).length;

    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
    set('k2-total', total);
    set('k2-special', special);
    set('k2-cmr', cmr);
    set('k2-env', envTarget);
    set('k2-health', healthTarget);
    set('hdr-total', total);
    set('hdr-special', special);

    const badge = document.getElementById('tabBadgeList');
    if(badge) badge.textContent = total;

    updateInspectKpi();
}
function updateInspectKpi(){
    let matched=0, nomatch=0, refresh=0;
    const withCas = MATERIALS.filter(m=>m.cas && m.cas!=='-');
    withCas.forEach(m=>{
        const c = InspectCache.get(m.cas);
        if(!c) refresh++;
        else if(c.status==='REGULATED') matched++;
        else nomatch++;
    });
    const set=(id,v)=>{const el=document.getElementById(id); if(el) el.textContent=v;};
    set('ins-total', withCas.length);
    set('ins-matched', matched);
    set('ins-nomatch', nomatch);
    set('ins-refresh', refresh);
}
