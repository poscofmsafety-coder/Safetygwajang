/* =========================================================
   ⑤ 특수건강진단 대상물질 · 검진기록 관리
   - MSDS에서 healthTarget === true 인 물질만 대상 후보로 표시
   - 의학적 적격/부적격 자동판정 없음
   - 시기·주기는 시행규칙 별표 23 확인 후 사용자가 입력
   ========================================================= */
let healths = JSON.parse(localStorage.getItem('sgw_healths_v6') || '[]');
function saveHealthLS(){ localStorage.setItem('sgw_healths_v6', JSON.stringify(healths)); }
function healthEsc(v){ return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function healthTargets(){
    const out=[];
    (MATERIALS||[]).forEach(m=>{
        const comps=m.composition||[];
        const inspections=m.compInspections||[];
        const trueRows=inspections.filter(x=>x.inspection?.ok&&x.inspection?.status==='FOUND'&&x.inspection?.legal?.specialHealthTarget===true);
        trueRows.forEach(x=>{
            const c=comps.find(v=>v.cas===x.cas)||{};
            out.push({id:`${m.id}::${x.cas}`,productId:m.id,productName:m.name,name:c.name||x.inspection.matchedName||m.name,cas:x.cas,content:c.content||'-',inspection:x.inspection});
        });
        // 공급자 MSDS 15항에서 특수건강진단 관련 정보가 있으나 CAS 대조 전이라면
        // 3항의 모든 CAS를 '확인 후보'로 펼치고, 별표 22 대상이라고 임의 확정하지 않습니다.
        if(!trueRows.length&&m.healthTarget===true&&!inspections.length){
            const candidates=(comps||[]).filter(c=>c.cas&&c.cas!=='-');
            if(!candidates.length&&m.cas&&m.cas!=='-')candidates.push({name:m.name,cas:m.cas,content:'-'});
            const seen=new Set();
            candidates.forEach(c=>{
                if(seen.has(c.cas))return;seen.add(c.cas);
                out.push({id:`${m.id}::${c.cas}`,productId:m.id,productName:m.name,name:c.name||m.name,cas:c.cas,content:c.content||'-',inspection:null,needsConfirm:true,sourceLabel:'MSDS 15항 후보 · 별표22/CAS 대조 필요'});
            });
        }
    });
    return out;
}
function healthTargetByKey(key){return healthTargets().find(x=>x.id===key)||null;}
function calcNextHealthDate(examDate, cycleMonths){
    if(!examDate || !cycleMonths) return '';
    const d=new Date(examDate); if(isNaN(d)) return '';
    d.setMonth(d.getMonth()+Number(cycleMonths));
    return d.toISOString().slice(0,10);
}
function renderHealthTargetMaterials(){
    const box=document.getElementById('healthTargetMaterials'); if(!box) return;
    const list=healthTargets();
    const k=document.getElementById('k5-targets'); if(k) k.textContent=list.length;
    const hdr=document.getElementById('hdr-health'); if(hdr) hdr.textContent=list.length;
    if(!list.length){ box.innerHTML='<div class="md:col-span-2 lg:col-span-3 text-center py-5 text-gray-400 text-xs border border-dashed rounded-lg">특수건강진단 대상으로 명시 확인된 MSDS 물질이 없습니다.<br>MSDS 등록 후 CAS 공공데이터 검토를 실행하거나 원본 15항을 확인하세요.</div>'; return; }
    box.innerHTML=list.map(m=>`<div class="border ${m.needsConfirm?'border-amber-200 bg-amber-50/60':'border-indigo-100 bg-indigo-50/50'} rounded-lg p-3"><div class="flex items-start justify-between gap-2"><div><p class="font-bold text-gray-900">${healthEsc(m.name)}</p><p class="text-[10px] text-gray-500 mt-0.5">제품 ${healthEsc(m.productName||'-')} · 함유량 ${healthEsc(m.content||'-')}</p><p class="text-[10px] text-gray-500 font-mono mt-0.5">CAS ${healthEsc(m.cas||'-')}</p></div><span class="${m.needsConfirm?'bg-amber-100 text-amber-800':'bg-indigo-100 text-indigo-700'} text-[9px] font-bold px-2 py-0.5 rounded">${m.needsConfirm?'별표22 확인 필요':'CAS 대상 확인'}</span></div>${m.needsConfirm?'<p class="mt-2 text-[10px] leading-4 text-amber-800">공급자 MSDS 15항의 제품 수준 정보만 확인되었습니다. CAS별 공공데이터·별표 22 대조 후 검진대상으로 확정하세요.</p>':`<button onclick="addHealthRow('${healthEsc(m.id)}')" class="mt-2 text-[10px] font-bold text-indigo-700 underline">이 물질로 검진기록 추가</button>`}</div>`).join('');
}
function healthMaterialOptions(selectedId){
    const list=healthTargets();
    return '<option value="">대상물질 선택</option>'+list.map(m=>`<option value="${healthEsc(m.id)}" ${m.id===selectedId?'selected':''}>${healthEsc(m.name)} (${healthEsc(m.cas||'-')})</option>`).join('');
}
function addHealthRow(materialId=''){
    const m=healthTargetByKey(materialId);
    healths.unshift({id:'H_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),dept:'',name:'',materialId:materialId||'',hazardName:m?.name||'',cas:m?.cas||'',productName:m?.productName||'',assignedDate:'',examDate:'',cycleMonths:null,nextDate:'',note:'',fileReport:null});
    saveHealthLS(); renderHealth();
}
function updateHealth(id,field,value){
    const h=healths.find(x=>x.id===id); if(!h) return;
    if(field==='materialId'){
        const m=healthTargetByKey(value); h.materialId=value; h.hazardName=m?.name||''; h.cas=m?.cas||''; h.productName=m?.productName||'';
    } else if(field==='cycleMonths') { const n=Number(value); h.cycleMonths=Number.isFinite(n)&&n>0?n:null; }
    else h[field]=value;
    h.nextDate=calcNextHealthDate(h.examDate,h.cycleMonths); saveHealthLS(); renderHealth();
}
function deleteHealth(id){ if(!confirm('이 검진기록을 삭제하시겠습니까?')) return; healths=healths.filter(x=>x.id!==id); saveHealthLS(); renderHealth(); }
function uploadHealthReport(id,input){
    const f=input.files?.[0]; if(!f) return; if(f.size>5*1024*1024){alert('결과서 파일은 5MB 이하로 저장해 주세요.');input.value='';return;}
    const r=new FileReader(); r.onload=()=>{const h=healths.find(x=>x.id===id);if(!h)return;h.fileReport={name:f.name,type:f.type,data:r.result,uploadedAt:new Date().toISOString()};saveHealthLS();renderHealth();}; r.readAsDataURL(f);
}
function viewHealthReport(id){ const h=healths.find(x=>x.id===id); const f=h?.fileReport;if(!f)return; const w=window.open(''); if(f.type==='application/pdf')w.document.write(`<iframe src="${f.data}" style="width:100%;height:100vh;border:0"></iframe>`); else if((f.type||'').startsWith('image/'))w.document.write(`<img src="${f.data}" style="max-width:100%">`); else {const a=document.createElement('a');a.href=f.data;a.download=f.name;a.click();w.close();} }
function deleteHealthReport(id){const h=healths.find(x=>x.id===id);if(h){h.fileReport=null;saveHealthLS();renderHealth();}}
function renderHealth(){
    renderHealthTargetMaterials();
    const dept=(document.getElementById('f5-dept')?.value||'').toLowerCase();
    const name=(document.getElementById('f5-name')?.value||'').toLowerCase();
    const list=healths.filter(h=>(!dept||(h.dept||'').toLowerCase().includes(dept))&&(!name||(h.name||'').toLowerCase().includes(name)));
    const tbody=document.getElementById('healthBody'); if(!tbody)return;
    const today=new Date(); let soon=0,expired=0;
    healths.forEach(h=>{if(!h.nextDate)return;const d=Math.ceil((new Date(h.nextDate)-today)/86400000);if(d<0)expired++;else if(d<=30)soon++;});
    document.getElementById('k5-total').textContent=healths.length; document.getElementById('k5-soon').textContent=soon; document.getElementById('k5-expired').textContent=expired;
    if(!list.length){tbody.innerHTML='<tr><td colspan="12" class="p-8 text-center text-gray-400">등록된 검진기록이 없습니다. 대상물질 카드에서 기록을 추가하거나 ‘검진기록 추가’를 눌러 시작하세요.</td></tr>';return;}
    tbody.innerHTML=list.map((h,i)=>{
        const dday=h.nextDate?Math.ceil((new Date(h.nextDate)-today)/86400000):null;
        const dueClass=dday===null?'text-gray-500':dday<0?'text-rose-700 font-bold':dday<=30?'text-amber-700 font-bold':'text-emerald-700';
        const report=h.fileReport?`<div class="flex gap-1"><button onclick="viewHealthReport('${h.id}')" class="text-blue-700 underline">보기</button><button onclick="deleteHealthReport('${h.id}')" class="text-rose-600 underline">삭제</button></div><p class="text-[9px] text-gray-400 truncate max-w-[110px]">${healthEsc(h.fileReport.name)}</p>`:`<label class="text-blue-700 underline cursor-pointer">업로드<input type="file" class="hidden" accept="image/*,.pdf" onchange="uploadHealthReport('${h.id}',this)"></label>`;
        return `<tr>
          <td class="p-1.5 border text-center">${i+1}</td>
          <td class="p-1 border"><input value="${healthEsc(h.dept)}" onchange="updateHealth('${h.id}','dept',this.value)" class="w-full min-w-[90px] border rounded px-2 py-1"></td>
          <td class="p-1 border"><input value="${healthEsc(h.name)}" onchange="updateHealth('${h.id}','name',this.value)" class="w-full min-w-[85px] border rounded px-2 py-1"></td>
          <td class="p-1 border"><select onchange="updateHealth('${h.id}','materialId',this.value)" class="w-full min-w-[190px] border rounded px-2 py-1">${healthMaterialOptions(h.materialId)}</select></td>
          <td class="p-1.5 border font-mono text-center">${healthEsc(h.cas||'-')}</td>
          <td class="p-1 border"><input type="date" value="${healthEsc(h.assignedDate)}" onchange="updateHealth('${h.id}','assignedDate',this.value)" class="border rounded px-1 py-1"></td>
          <td class="p-1 border"><input type="date" value="${healthEsc(h.examDate)}" onchange="updateHealth('${h.id}','examDate',this.value)" class="border rounded px-1 py-1"></td>
          <td class="p-1 border"><input type="number" min="1" value="${h.cycleMonths||''}" placeholder="별표23" onchange="updateHealth('${h.id}','cycleMonths',this.value)" class="w-20 border rounded px-2 py-1 text-center"></td>
          <td class="p-1.5 border text-center ${dueClass}">${healthEsc(h.nextDate||'주기 확인 필요')}${dday!==null?`<div class="text-[9px]">${dday<0?'기한 '+Math.abs(dday)+'일 경과':'D-'+dday}</div>`:''}</td>
          <td class="p-1 border"><textarea onchange="updateHealth('${h.id}','note',this.value)" class="w-full min-w-[180px] border rounded px-2 py-1" rows="2" placeholder="검진기관·판정서 내용·조치사항">${healthEsc(h.note)}</textarea></td>
          <td class="p-1.5 border text-center">${report}</td>
          <td class="p-1.5 border text-center"><button onclick="deleteHealth('${h.id}')" class="text-rose-600 font-bold">삭제</button></td>
        </tr>`;
    }).join('');
}
function downloadExcel(){
    const rows=healths.map((h,i)=>({NO:i+1,부서:h.dept,성명:h.name,'대상 유해인자':h.hazardName,'CAS No.':h.cas,'배치·노출 시작일':h.assignedDate,'최근 검진일':h.examDate,'주기(개월)':h.cycleMonths||'별표23 확인','차기 검진일':h.nextDate||'','검진기관·판정/비고':h.note||''}));
    const ws=XLSX.utils.json_to_sheet(rows); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,'특수건강진단기록'); XLSX.writeFile(wb,'특수건강진단기록_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function importExcel(event){
    const f=event.target.files?.[0]; if(!f)return; const r=new FileReader();r.onload=e=>{try{const wb=XLSX.read(e.target.result,{type:'array'});const rows=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{defval:''});rows.forEach(row=>{healths.push({id:'H_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),dept:row['부서']||'',name:row['성명']||'',materialId:'',hazardName:row['대상 유해인자']||'',cas:row['CAS No.']||'',assignedDate:row['배치·노출 시작일']||'',examDate:row['최근 검진일']||'',cycleMonths:Number(row['주기(개월)'])||null,nextDate:'',note:row['검진기관·판정/비고']||'',fileReport:null});});healths.forEach(h=>h.nextDate=calcNextHealthDate(h.examDate,h.cycleMonths));saveHealthLS();renderHealth();showToast('검진기록을 불러왔습니다.');}catch(err){alert('엑셀 파일을 읽지 못했습니다: '+err.message);}event.target.value='';};r.readAsArrayBuffer(f);
}
