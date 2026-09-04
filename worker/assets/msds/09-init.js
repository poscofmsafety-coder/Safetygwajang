/* =========================================================
   [7] 페이지 로드 초기화 (반드시 맨 마지막에 로드)
   ========================================================= */
document.addEventListener('DOMContentLoaded', ()=>{
    // ③ 탭 필터칩·검색
    document.querySelectorAll('#matFilterChips .chip-btn').forEach(chip=>{
        chip.addEventListener('click', ()=>{
            document.querySelectorAll('#matFilterChips .chip-btn').forEach(c=>{
                c.classList.remove('bg-teal-600','text-white','font-bold');
                c.classList.add('bg-white','border','border-gray-300','text-gray-600','font-semibold','hover:bg-slate-100');
            });
            chip.classList.remove('bg-white','border','border-gray-300','text-gray-600','font-semibold','hover:bg-slate-100');
            chip.classList.add('bg-teal-600','text-white','font-bold');
            currentFilter = chip.getAttribute('data-filter');
            renderMaterialList();
        });
    });
    const si = document.getElementById('matSearchInput');
    if(si) si.addEventListener('input', e=>{ currentSearch=e.target.value; renderMaterialList(); });

    renderMaterialList();
    if(MATERIALS.length > 0) applyMaterialToForms(MATERIALS.find(m=>m.id===selectedMaterialId));

    // ① MSDS 업로드
    const zone = document.getElementById('uploadZone');
    const input = document.getElementById('msdsFileInput');
    if(zone && input){
        zone.addEventListener('click', e=>{
            if(e.target.tagName !== 'BUTTON') input.click();
        });
        input.addEventListener('change', e=>{
            handleMSDSFiles(e.target.files);
            e.target.value='';
        });
        ['dragenter','dragover'].forEach(ev=>zone.addEventListener(ev, e=>{
            e.preventDefault();
            zone.classList.add('bg-teal-100','border-teal-500');
        }));
        ['dragleave','drop'].forEach(ev=>zone.addEventListener(ev, e=>{
            e.preventDefault();
            zone.classList.remove('bg-teal-100','border-teal-500');
        }));
        zone.addEventListener('drop', e=>handleMSDSFiles(e.dataTransfer.files));
    }

    // Enter 키로 CAS 검수
    const casInput = document.getElementById('insCasInput');
    if(casInput){
        casInput.addEventListener('keydown', e=>{
            if(e.key==='Enter'){ e.preventDefault(); inspectCasSingle(false); }
        });
    }

    // ② 탭 검색 Enter
    const f2Search = document.getElementById('f2-search');
    if(f2Search){
        f2Search.addEventListener('keydown', e=>{
            if(e.key==='Enter'){ e.preventDefault(); applyFilter2(); }
        });
    }

    // ⭐⭐⭐ ⑤ 특수건강진단 필터 이벤트 (신규 추가)
    const f5Dept = document.getElementById('f5-dept');
    const f5Name = document.getElementById('f5-name');
    const f5Result = document.getElementById('f5-result');
    if(f5Dept) f5Dept.addEventListener('input', ()=>renderHealth());
    if(f5Name) f5Name.addEventListener('input', ()=>renderHealth());
    if(f5Result) f5Result.addEventListener('change', ()=>renderHealth());

    // ④ ⑤ 초기 렌더
    renderMat(materials);
    renderHealth();

    // ② 초기 렌더 + API 연결 확인 + 헤더 갱신
    renderListTable();
    updateAllKPI();
    checkApiHealth();

    // 상단 헤더 KPI (작업환경측정 만료임박)
    const hdrEnvSoon = document.getElementById('hdr-envSoon');
    if(hdrEnvSoon){
        const today = new Date();
        let soon = 0;
        materials.forEach(m=>{
            const next = new Date(m.date);
            next.setMonth(next.getMonth() + m.cycle);
            const dday = Math.ceil((next - today) / 86400000);
            if(dday < 30 && dday >= 0) soon++;
        });
        hdrEnvSoon.textContent = soon;
    }

    // ⭐ 상단 헤더 KPI (안심건강 근로제 대상 인원)
    // ※ renderHealth() 내부에서도 갱신되지만, 초기 로드 시 명시적 호출
    const hdrHealth = document.getElementById('hdr-health');
    if(hdrHealth) hdrHealth.textContent = healths.length;
});
