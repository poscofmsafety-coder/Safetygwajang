/* =========================================================
   [5] ④ 작업환경측정
   ========================================================= */
// ⭐ 샘플 데이터 제거 - 빈 배열로 시작 (모든 회사에서 사용 가능)
let materials = JSON.parse(localStorage.getItem('sgw_env_materials') || '[]');
function saveMatLS(){ localStorage.setItem('sgw_env_materials', JSON.stringify(materials)); }

function renderMat(list){
    const grid = document.getElementById('matGrid');
    const empty = document.getElementById('matEmpty');
    if(!grid) return;
    if(list.length===0){ grid.innerHTML=''; empty.classList.remove('hidden'); }
    else empty.classList.add('hidden');

    const today = new Date();
    let soon=0, bad=0, workers=0, locs=new Set();

    grid.innerHTML = list.map(m=>{
        const next = m.date ? new Date(m.date) : null;
        if(next) next.setMonth(next.getMonth()+m.cycle);
        const dday = next ? Math.ceil((next-today)/86400000) : null;
        const status = m.ratio>100 ? 'bad' : (dday!==null && dday<30 ? 'soon' : 'ok');
        if(dday!==null && dday<30 && dday>=0) soon++;
        if(m.ratio>100) bad++;
        workers += Number(m.workers)||0;
        if(m.site || m.loc) locs.add((m.site||'')+'/'+(m.loc||''));

        const badgeSpc = m.special==='Y' ? '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">🔴 특별관리</span>' : '';
        const badgeSt = status==='ok' ? '<span class="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded">✅ 적합</span>'
                      : status==='soon' ? '<span class="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded">⏰ 만료임박</span>'
                      : '<span class="bg-rose-100 text-rose-700 text-[10px] font-bold px-1.5 py-0.5 rounded">⚠ 부적합</span>';
        const gaugeClass = m.ratio>100 ? 'gauge-bad' : (m.ratio>50 ? 'gauge-warn' : 'gauge-ok');

        // ⭐ 사업장 색상은 자유입력이라 고정 매핑 대신 해시 기반 동적 색상
        const siteColors = ['bg-blue-100 text-blue-700','bg-emerald-100 text-emerald-700','bg-purple-100 text-purple-700','bg-amber-100 text-amber-700','bg-teal-100 text-teal-700','bg-rose-100 text-rose-700','bg-indigo-100 text-indigo-700'];
        const siteColor = m.site ? siteColors[m.site.charCodeAt(0) % siteColors.length] : 'bg-gray-100 text-gray-700';

        return `
        <div class="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-lg transition">
            <div class="flex items-center justify-between mb-2">
                <div class="flex gap-1">${badgeSpc}${badgeSt}</div>
                ${m.site ? `<span class="text-[10px] ${siteColor} px-2 py-0.5 rounded-full font-bold">${m.site}</span>` : ''}
            </div>
            <p class="text-sm font-black text-gray-900 leading-tight">${m.name}</p>
            <p class="text-[11px] text-gray-500 mt-0.5">CAS ${m.cas||'-'} · ${m.cycle}개월 주기</p>
            <div class="mt-3 space-y-1 text-[11px] text-gray-700">
                <p><i class="fa-solid fa-building text-gray-400 w-4"></i> ${m.dept||'-'}</p>
                <p><i class="fa-solid fa-location-dot text-gray-400 w-4"></i> ${m.loc||'-'}</p>
                <p><i class="fa-solid fa-users text-gray-400 w-4"></i> 노출자 <b>${m.workers||0}명</b></p>
            </div>
            <div class="mt-3 bg-slate-50 rounded-lg p-2">
                <div class="flex justify-between text-[11px] mb-1">
                    <span class="text-gray-600">최근 측정 (${m.date||'-'})</span>
                    <span class="font-bold text-gray-800">${m.val||'-'} / ${m.twa||'-'}</span>
                </div>
                <div class="gauge"><div class="gauge-fill ${gaugeClass}" style="width:${Math.min(m.ratio||0,100)}%"></div></div>
                <p class="text-right text-[10px] text-gray-500 mt-1">노출비율 <b class="${m.ratio>100?'text-rose-600':'text-gray-700'}">${m.ratio||0}%</b></p>
            </div>
            ${next ? `
            <div class="mt-3 flex items-center justify-between text-[11px]">
                <span class="text-gray-500"><i class="fa-solid fa-clock mr-1"></i>차기 ${next.toISOString().slice(0,10)}</span>
                <span class="font-bold ${dday<0?'text-rose-600':dday<30?'text-amber-600':'text-emerald-600'}">D${dday>=0?'-':'+'}${Math.abs(dday)}</span>
            </div>` : ''}
            <div class="mt-3 pt-3 border-t border-gray-100 flex gap-2">
                <button onclick="editMat(${m.id})" class="flex-1 bg-white border border-gray-300 hover:bg-slate-50 text-xs font-semibold py-1.5 rounded"><i class="fa-solid fa-pen mr-1"></i>편집</button>
                <button onclick="delMat(${m.id})" class="flex-1 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold py-1.5 rounded"><i class="fa-solid fa-trash mr-1"></i>삭제</button>
            </div>
        </div>`;
    }).join('');

    document.getElementById('k4-total').innerHTML = list.length+'<span class="text-xs text-gray-500"> 종</span>';
    document.getElementById('k4-soon').innerHTML = soon+'<span class="text-xs text-gray-500"> 건</span>';
    document.getElementById('k4-bad').innerHTML = bad+'<span class="text-xs text-gray-500"> 건</span>';
    document.getElementById('k4-worker').innerHTML = workers+'<span class="text-xs text-gray-500"> 명</span>';
    document.getElementById('k4-loc').innerHTML = locs.size+'<span class="text-xs text-gray-500"> 개</span>';
}

function applyFilter4(){
    const site=document.getElementById('f4-site').value.toLowerCase();
    const dept=document.getElementById('f4-dept').value.toLowerCase();
    const status=document.getElementById('f4-status').value;
    const q=document.getElementById('f4-search').value.toLowerCase();
    const today=new Date();
    const filtered = materials.filter(m=>{
        // ⭐ 사업장도 부분검색(includes)으로 변경 - 자유입력이라 완전일치 대신 포함 검색
        if(site && !(m.site||'').toLowerCase().includes(site)) return false;
        if(dept && !(m.dept||'').toLowerCase().includes(dept)) return false;
        if(q && !((m.name||'').toLowerCase().includes(q)||(m.cas||'').toLowerCase().includes(q))) return false;
        if(status){
            const next = m.date ? new Date(m.date) : null;
            if(next) next.setMonth(next.getMonth()+m.cycle);
            const dday = next ? Math.ceil((next-today)/86400000) : null;
            const st = m.ratio>100?'bad':(dday!==null && dday<30?'soon':'ok');
            if(st!==status) return false;
        }
        return true;
    });
    renderMat(filtered);
}
function resetMat(){
    ['f4-site','f4-dept','f4-status','f4-search'].forEach(id=>document.getElementById(id).value='');
    renderMat(materials);
}

let editMatId = null;
function openMatModal(){
    editMatId=null;
    document.getElementById('matModalTitle').textContent='측정물질 등록';
    // ⭐ 사업장도 자유입력이므로 초기값 빈 문자열로
    ['m-name','m-cas','m-site','m-dept','m-loc','m-twa','m-date','m-val'].forEach(id=>document.getElementById(id).value='');
    document.getElementById('m-cycle').value=6;
    document.getElementById('m-workers').value=0;
    document.getElementById('m-special').value='N';
    document.getElementById('matModal').classList.remove('hidden');
    document.getElementById('matModal').classList.add('flex');
}
function editMat(id){
    const m = materials.find(x=>x.id===id); if(!m) return;
    editMatId=id;
    document.getElementById('matModalTitle').textContent='측정물질 수정';
    document.getElementById('m-name').value=m.name||''; document.getElementById('m-cas').value=m.cas||'';
    document.getElementById('m-site').value=m.site||''; document.getElementById('m-dept').value=m.dept||'';
    document.getElementById('m-loc').value=m.loc||''; document.getElementById('m-cycle').value=m.cycle||6;
    document.getElementById('m-twa').value=m.twa||''; document.getElementById('m-date').value=m.date||'';
    document.getElementById('m-val').value=m.val||''; document.getElementById('m-workers').value=m.workers||0;
    document.getElementById('m-special').value=m.special||'N';
    document.getElementById('matModal').classList.remove('hidden');
    document.getElementById('matModal').classList.add('flex');
}
function closeMatModal(){
    document.getElementById('matModal').classList.add('hidden');
    document.getElementById('matModal').classList.remove('flex');
}
function saveMat(){
    const obj = {
        name:document.getElementById('m-name').value.trim(),
        cas:document.getElementById('m-cas').value.trim(),
        site:document.getElementById('m-site').value.trim(),
        dept:document.getElementById('m-dept').value.trim(),
        loc:document.getElementById('m-loc').value.trim(),
        cycle:Number(document.getElementById('m-cycle').value)||6,
        twa:document.getElementById('m-twa').value.trim(),
        date:document.getElementById('m-date').value,
        val:document.getElementById('m-val').value.trim(),
        workers:Number(document.getElementById('m-workers').value)||0,
        special:document.getElementById('m-special').value,
        ratio:0
    };
    const twaN=parseFloat(obj.twa), valN=parseFloat(obj.val);
    if(twaN && valN) obj.ratio = Math.round((valN/twaN)*100*10)/10;
    if(!obj.name){ alert('물질명을 입력하세요'); return; }
    if(!obj.site){ alert('사업장을 입력하세요'); return; }
    if(editMatId){
        const i = materials.findIndex(x=>x.id===editMatId);
        materials[i] = {...materials[i],...obj};
    } else {
        obj.id = Date.now(); materials.push(obj);
    }
    saveMatLS(); renderMat(materials); closeMatModal(); showToast('✅ 저장되었습니다');
}
function delMat(id){
    if(!confirm('삭제하시겠습니까?')) return;
    materials = materials.filter(m=>m.id!==id);
    saveMatLS(); renderMat(materials); showToast('삭제되었습니다');
}
