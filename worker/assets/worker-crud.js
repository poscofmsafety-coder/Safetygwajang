(function(){
  'use strict';
  const cfg = window.WORKER_PAGE_CONFIG || {};
  const key = cfg.storageKey || ('sgw_v4_' + (cfg.slug || 'records'));
  const app = document.getElementById('workerApp');
  if(!app) return;

  const esc = (v) => String(v == null ? '' : v)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  const safeParse = (raw, fallback) => { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : fallback; } catch(e){ return fallback; } };
  let rows = safeParse(localStorage.getItem(key), []);
  let editingId = null;
  let search = '';

  function save(){ localStorage.setItem(key, JSON.stringify(rows)); }
  function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,8); }
  function labelFor(field){ return field.label || field.name; }
  function valueOf(row, field){ const v = row[field.name]; return v == null || v === '' ? '-' : String(v); }
  function visibleFields(){ return (cfg.fields || []).filter(f => f.table !== false); }
  function filteredRows(){
    if(!search) return rows.slice();
    const q = search.toLowerCase();
    return rows.filter(r => Object.values(r).some(v => String(v == null ? '' : v).toLowerCase().includes(q)));
  }
  function stats(){
    const s = [{k:'전체 기록',v:rows.length,s:'현재 브라우저 저장'}];
    if(cfg.slug === 'dashboard'){
      s.push({k:'진행 중',v:rows.filter(r=>r.status==='진행').length,s:'현장 작업'});
      s.push({k:'고위험',v:rows.filter(r=>r.riskLevel==='높음').length,s:'사용자 입력 기준'});
      s.push({k:'완료',v:rows.filter(r=>r.status==='완료').length,s:'조치 완료'});
    }else{
      const statusField=(cfg.fields||[]).find(f=>f.name==='status');
      if(statusField){
        s.push({k:'진행 중',v:rows.filter(r=>String(r.status).includes('진행')).length,s:'상태 기준'});
        s.push({k:'완료',v:rows.filter(r=>String(r.status).includes('완료')).length,s:'상태 기준'});
      }
      const dateField=(cfg.fields||[]).find(f=>f.type==='date');
      if(dateField){
        const today=new Date().toISOString().slice(0,10);
        s.push({k:'오늘 기록',v:rows.filter(r=>r[dateField.name]===today).length,s:'날짜 기준'});
      }
    }
    while(s.length<4) s.push({k:'사용자 항목',v:0,s:'필요한 기록을 추가하세요'});
    return s.slice(0,4);
  }

  function render(){
    const list = filteredRows();
    const flds = visibleFields();
    app.innerHTML = `
      <div class="worker-kpis">${stats().map(x=>`<div class="worker-kpi"><div class="k">${esc(x.k)}</div><div class="v">${esc(x.v)}</div><div class="s">${esc(x.s)}</div></div>`).join('')}</div>
      <section class="worker-card">
        <h2>${esc(cfg.listTitle || '내 기록')}</h2>
        <p class="desc">${esc(cfg.listDescription || '처음에는 비어 있습니다. 필요한 항목을 직접 추가하고, 언제든 수정·삭제할 수 있습니다.')}</p>
        <div class="worker-toolbar">
          <button class="worker-btn primary" id="addRecord" type="button">＋ 새 기록 추가</button>
          <button class="worker-btn" id="exportData" type="button">내보내기</button>
          <button class="worker-btn" id="importData" type="button">가져오기</button>
          <input type="file" id="importFile" accept="application/json" hidden>
          <span class="spacer"></span>
          <input type="search" id="recordSearch" value="${esc(search)}" placeholder="기록 검색">
          <button class="worker-btn danger" id="clearData" type="button">전체 삭제</button>
        </div>
        ${list.length ? `
          <div class="worker-table-wrap">
            <table class="worker-table">
              <thead><tr>${flds.map(f=>`<th>${esc(labelFor(f))}</th>`).join('')}<th>관리</th></tr></thead>
              <tbody>${list.map(r=>`<tr>${flds.map(f=>`<td>${esc(valueOf(r,f))}</td>`).join('')}<td class="actions"><button class="mini-btn" data-edit="${esc(r.id)}">수정</button><button class="mini-btn delete" data-delete="${esc(r.id)}">삭제</button></td></tr>`).join('')}</tbody>
            </table>
          </div>` : `
          <div class="worker-empty">
            <img src="../assets/jaeili-avatar.png" alt="안전과장 캐릭터 제일이">
            <strong>아직 저장된 데이터가 없습니다.</strong>
            <p>회사명·부서명·작업정보 등 사전 입력값 없이 시작합니다.<br>사용자 상황에 맞는 기록만 직접 추가해 주세요.</p>
            <button class="worker-btn primary" id="addRecordEmpty" type="button">첫 기록 만들기</button>
          </div>`}
        <div class="worker-helper"><strong>현재 저장 방식</strong> · 로그인 기능을 붙이기 전 단계이므로 데이터는 이 브라우저의 localStorage에만 저장됩니다. 브라우저 데이터 삭제나 기기 변경 시 사라질 수 있으므로 중요한 기록은 <b>내보내기</b>로 백업해 주세요.</div>
      </section>
      <div class="worker-modal-backdrop" id="recordModal" aria-hidden="true">
        <div class="worker-modal" role="dialog" aria-modal="true" aria-labelledby="recordModalTitle">
          <div class="worker-modal-head"><h2 id="recordModalTitle">새 기록 추가</h2><button class="worker-btn" id="closeModal" type="button">닫기</button></div>
          <form id="recordForm">
            <div class="worker-modal-body"><div class="worker-form-grid">${(cfg.fields||[]).map(fieldHTML).join('')}</div></div>
            <div class="worker-modal-foot"><button class="worker-btn" id="cancelModal" type="button">취소</button><button class="worker-btn primary" type="submit">저장</button></div>
          </form>
        </div>
      </div>`;
    bind();
  }

  function fieldHTML(f){
    const full = f.full || f.type === 'textarea';
    const req = f.required ? 'required' : '';
    const ph = esc(f.placeholder || '');
    let control='';
    if(f.type==='textarea'){
      control=`<textarea id="fld_${esc(f.name)}" name="${esc(f.name)}" placeholder="${ph}" ${req}></textarea>`;
    }else if(f.type==='select'){
      control=`<select id="fld_${esc(f.name)}" name="${esc(f.name)}" ${req}><option value="">선택</option>${(f.options||[]).map(o=>`<option value="${esc(o)}">${esc(o)}</option>`).join('')}</select>`;
    }else{
      control=`<input id="fld_${esc(f.name)}" name="${esc(f.name)}" type="${esc(f.type || 'text')}" placeholder="${ph}" ${req}${f.min!=null?` min="${esc(f.min)}"`:''}${f.max!=null?` max="${esc(f.max)}"`:''}>`;
    }
    return `<div class="worker-field ${full?'full':''}"><label for="fld_${esc(f.name)}">${esc(labelFor(f))}${f.required?' *':''}</label>${control}</div>`;
  }

  function openModal(id){
    editingId=id||null;
    const row = editingId ? rows.find(r=>r.id===editingId) : null;
    document.getElementById('recordModalTitle').textContent = row ? '기록 수정' : '새 기록 추가';
    (cfg.fields||[]).forEach(f=>{
      const el=document.getElementById('fld_'+f.name); if(el) el.value=row ? (row[f.name] ?? '') : '';
    });
    const m=document.getElementById('recordModal'); m.classList.add('open'); m.setAttribute('aria-hidden','false');
    const first=m.querySelector('input,select,textarea'); if(first) setTimeout(()=>first.focus(),30);
  }
  function closeModal(){const m=document.getElementById('recordModal'); if(m){m.classList.remove('open');m.setAttribute('aria-hidden','true');} editingId=null;}

  function bind(){
    const add=()=>openModal();
    document.getElementById('addRecord')?.addEventListener('click',add);
    document.getElementById('addRecordEmpty')?.addEventListener('click',add);
    document.getElementById('closeModal')?.addEventListener('click',closeModal);
    document.getElementById('cancelModal')?.addEventListener('click',closeModal);
    document.getElementById('recordModal')?.addEventListener('click',e=>{ if(e.target.id==='recordModal') closeModal(); });
    document.getElementById('recordSearch')?.addEventListener('input',e=>{search=e.target.value.trim();render();document.getElementById('recordSearch')?.focus();});
    document.querySelectorAll('[data-edit]').forEach(b=>b.addEventListener('click',()=>openModal(b.dataset.edit)));
    document.querySelectorAll('[data-delete]').forEach(b=>b.addEventListener('click',()=>{
      if(confirm('이 기록을 삭제할까요?')){ rows=rows.filter(r=>r.id!==b.dataset.delete);save();render(); }
    }));
    document.getElementById('recordForm')?.addEventListener('submit',e=>{
      e.preventDefault();
      const obj={id:editingId||uid(),updatedAt:new Date().toISOString()};
      (cfg.fields||[]).forEach(f=>{ const el=document.getElementById('fld_'+f.name); obj[f.name]=el ? el.value.trim() : ''; });
      if(editingId){ const i=rows.findIndex(r=>r.id===editingId); if(i>=0) rows[i]={...rows[i],...obj}; }
      else rows.unshift(obj);
      save();closeModal();render();
    });
    document.getElementById('clearData')?.addEventListener('click',()=>{
      if(!rows.length) return alert('삭제할 데이터가 없습니다.');
      if(confirm('이 화면에 저장된 모든 데이터를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.')){ rows=[];save();render(); }
    });
    document.getElementById('exportData')?.addEventListener('click',()=>{
      const blob=new Blob([JSON.stringify({version:1,module:cfg.slug||'',exportedAt:new Date().toISOString(),records:rows},null,2)],{type:'application/json'});
      const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=(cfg.slug||'safety-records')+'-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
    });
    document.getElementById('importData')?.addEventListener('click',()=>document.getElementById('importFile')?.click());
    document.getElementById('importFile')?.addEventListener('change',e=>{
      const file=e.target.files&&e.target.files[0]; if(!file) return;
      const reader=new FileReader(); reader.onload=()=>{
        try{
          const data=JSON.parse(reader.result); const incoming=Array.isArray(data)?data:(Array.isArray(data.records)?data.records:null);
          if(!incoming) throw new Error('invalid');
          if(confirm(`기존 데이터 ${rows.length}건을 지우고 ${incoming.length}건을 가져올까요?`)){
            rows=incoming.map(r=>({...r,id:r.id||uid()}));save();render();
          }
        }catch(err){alert('가져올 수 없는 JSON 파일입니다.');}
      }; reader.readAsText(file,'utf-8');
    });
  }
  render();
})();
