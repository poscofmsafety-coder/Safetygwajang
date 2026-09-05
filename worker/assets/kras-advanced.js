(function(){
  'use strict';
  const STORAGE_KEY='sgw_kras_v1';
  const $=s=>document.querySelector(s);
  const esc=v=>String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=v=>String(v==null?'':v).replace(/\s+/g,' ').trim();
  const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
  const parseJSON=(s,fb)=>{try{return JSON.parse(s)}catch(_){return fb}};
  const normalizeHeader=v=>clean(v).toLowerCase().replace(/[\s\-_·ㆍ/\\()[\]{}:,.]/g,'');
  const HAZARD_TYPES=['추락·낙하','끼임·말림','충돌·전도','감전','화재·폭발','화학물질','질식·중독','중량물','차량·운반','소음·진동','근골격계','기타'];
  const ALIASES={
    task:['공정작업','공정명','작업명','공정','단위작업','작업공정','평가대상공정','평가대상작업'],
    step:['세부작업','작업단계','세부공정','작업내용','단위공정','작업순서'],
    type:['유해위험요인분류','위험요인분류','재해유형','위험유형','분류'],
    scenario:['유해위험요인','위험요인','위험요인및발생형태','위험한상황과사건','위험내용','위험요인내용','유해위험요인및발생형태'],
    consequence:['예상되는부상질병','예상재해','예상피해','재해발생형태','피해대상','예상결과'],
    currentControl:['현재안전보건조치','현재조치','기존대책','현재대책','안전보건조치','기존안전조치'],
    basis:['관련근거','법적근거','근거','관련법규','관련기준'],
    worker:['노출근로자','참여근로자','작업인원','대상근로자','근로자'],
    workerComment:['근로자의견','작업자의견','의견','근로자참여'],
    riskLevel:['위험성수준','현재위험성','위험성','위험등급','위험도','위험성결정'],
    likelihood:['가능성','빈도','발생가능성','발생빈도'],
    severity:['중대성','강도','피해강도','중대도'],
    score:['위험성점수','위험도점수','위험성크기','위험값'],
    controlType:['감소대책우선순위','대책구분','개선대책구분','대책유형','조치유형'],
    measure:['위험성감소대책','감소대책','개선대책','개선조치','대책','조치내용','개선내용'],
    owner:['담당자','조치담당자','개선담당자','책임자'],
    due:['완료예정일','조치기한','개선기한','완료기한','예정일'],
    status:['조치상태','진행상태','상태','개선상태'],
    completed:['실제완료일','완료일','조치완료일','개선완료일'],
    evidence:['이행증빙','증빙','확인내용','조치확인','개선확인'],
    afterLevel:['개선후위험성','조치후위험성','잔여위험','재평가위험성','개선후위험도'],
    afterLikelihood:['개선후가능성','조치후가능성','개선후빈도'],
    afterSeverity:['개선후중대성','조치후중대성','개선후강도'],
    afterReason:['재평가근거','개선후판단근거','잔여위험근거'],
    note:['비고','메모','참고사항']
  };
  const HEADER_TO_KEY=new Map();
  Object.entries(ALIASES).forEach(([k,arr])=>arr.forEach(a=>HEADER_TO_KEY.set(normalizeHeader(a),k)));

  function stateNow(){
    const d={version:1,setup:{evaluationType:'정기평가',method:'three',identificationSources:['사업장 순회점검']},hazards:[],shares:[],createdAt:new Date().toISOString()};
    const x=parseJSON(localStorage.getItem(STORAGE_KEY),null);
    if(!x||typeof x!=='object')return d;
    x.setup=x.setup&&typeof x.setup==='object'?x.setup:d.setup;
    x.hazards=Array.isArray(x.hazards)?x.hazards:[];x.shares=Array.isArray(x.shares)?x.shares:[];return x;
  }
  function saveAndReload(s,msg){s.updatedAt=new Date().toISOString();localStorage.setItem(STORAGE_KEY,JSON.stringify(s));alert(msg);location.reload();}
  function setStatus(id,text,kind=''){const el=$(id);if(!el)return;el.textContent=text;el.className='kras-smart-status '+kind;}
  function detectType(v){const s=clean(v);if(!s)return '기타';if(HAZARD_TYPES.includes(s))return s;const m=[[/추락|낙하/,'추락·낙하'],[/끼임|말림|협착/,'끼임·말림'],[/충돌|전도|넘어짐|부딪힘/,'충돌·전도'],[/감전|전기/,'감전'],[/화재|폭발/,'화재·폭발'],[/화학|유해물질|약품|용제/,'화학물질'],[/질식|중독|산소결핍/,'질식·중독'],[/중량|인력운반|들기/,'중량물'],[/차량|지게차|운반/,'차량·운반'],[/소음|진동/,'소음·진동'],[/근골격|반복|부자연스러운자세/,'근골격계']];for(const [r,t] of m)if(r.test(s))return t;return '기타';}
  function detectLevel(v){const s=clean(v).toLowerCase();if(!s)return '';if(/^(상|고|높음|high)$/.test(s)||/매우높|허용불가|중대위험/.test(s))return 'high';if(/^(중|보통|medium)$/.test(s)||/중간/.test(s))return 'medium';if(/^(하|저|낮음|low)$/.test(s)||/허용가능|경미/.test(s))return 'low';return '';}
  function detectControlType(v){const s=clean(v);if(/제거/.test(s))return '제거';if(/대체/.test(s))return '대체';if(/공학|방호|격리|인터록|자동화|환기/.test(s))return '공학적 대책';if(/관리|절차|교육|허가|표지|감시/.test(s))return '관리적 대책';if(/보호구|ppe/i.test(s))return '개인보호구';return '';}
  function detectStatus(v){const s=clean(v);if(/완료|종결/.test(s))return '완료';if(/진행|조치중|개선중/.test(s))return '진행중';if(/재검토|검토/.test(s))return '재검토 필요';return '미착수';}
  function parseDate(v){if(!v)return '';if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);const s=clean(v).replace(/[.\/]/g,'-');const m=s.match(/(20\d{2})-?(\d{1,2})-?(\d{1,2})/);if(m)return `${m[1]}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[3])).padStart(2,'0')}`;return '';}
  function headerMap(row){const out={};(row||[]).forEach((v,i)=>{const k=HEADER_TO_KEY.get(normalizeHeader(v));if(k&&out[k]==null)out[k]=i;});return out;}
  function scoreHeader(row){const m=headerMap(row);let s=Object.keys(m).length;if(m.task)s+=2;if(m.scenario)s+=3;if(m.measure)s+=1;return s;}
  function combineHeaderRows(matrix,idx,depth){const width=Math.max(...matrix.slice(idx,idx+depth).map(r=>r?.length||0),0);const out=[];for(let c=0;c<width;c++){const parts=[];for(let r=idx;r<idx+depth;r++){const v=clean(matrix[r]?.[c]);if(v&&!parts.includes(v))parts.push(v);}out[c]=parts.join(' ');}return out;}
  function bestHeader(matrix){let best={idx:-1,depth:1,score:0,map:{}};const rows=matrix||[];for(let i=0;i<Math.min(40,rows.length);i++){for(let depth=1;depth<=3&&i+depth<=rows.length;depth++){const combined=combineHeaderRows(rows,i,depth),score=scoreHeader(combined);if(score>best.score)best={idx:i,depth,score,map:headerMap(combined)};}}return best;}
  function inferMethod(map){if(map.likelihood!=null||map.severity!=null)return 'frequency';return 'three';}
  function cell(row,map,key){const i=map[key];return i==null?'':row[i];}
  function rowToHazard(row,map,source,last={}){
    const task=clean(cell(row,map,'task'))||last.task||'';const step=clean(cell(row,map,'step'))||last.step||'';const scenario=clean(cell(row,map,'scenario'));
    if(!scenario)return null;
    const likelihood=clean(cell(row,map,'likelihood')),severity=clean(cell(row,map,'severity')),afterLikelihood=clean(cell(row,map,'afterLikelihood')),afterSeverity=clean(cell(row,map,'afterSeverity'));
    const h={id:uid(),task,step,type:detectType(cell(row,map,'type')),source:'안전보건 자료',scenario,consequence:clean(cell(row,map,'consequence')),currentControl:clean(cell(row,map,'currentControl'))||'현장 확인 필요',basis:clean(cell(row,map,'basis')),worker:clean(cell(row,map,'worker')),workerComment:clean(cell(row,map,'workerComment')),riskLevel:detectLevel(cell(row,map,'riskLevel')),riskReason:'기존 KRAS/평가자료에서 가져온 값 · 현장 조건과 현행 기준 재확인 필요',likelihood,severity,controlType:detectControlType(cell(row,map,'controlType'))||detectControlType(cell(row,map,'measure')),measure:clean(cell(row,map,'measure')),owner:clean(cell(row,map,'owner')),due:parseDate(cell(row,map,'due')),status:detectStatus(cell(row,map,'status')),completed:parseDate(cell(row,map,'completed')),evidence:clean(cell(row,map,'evidence')),afterLevel:detectLevel(cell(row,map,'afterLevel')),afterLikelihood,afterSeverity,afterReason:clean(cell(row,map,'afterReason')),note:[clean(cell(row,map,'note')),`가져온 자료: ${source}`].filter(Boolean).join(' · '),method:'three',needsReview:true,importedAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(!h.task)h.task='가져온 평가자료';return h;
  }
  function parseMatrix(matrix,source){
    const h=bestHeader(matrix);if(h.idx<0||h.score<5)return {hazards:[],method:'',headerScore:h.score};
    const hazards=[];let last={task:'',step:''};
    for(const row of matrix.slice(h.idx+(h.depth||1))){
      const currentTask=clean(cell(row,h.map,'task'));const currentStep=clean(cell(row,h.map,'step'));if(currentTask)last.task=currentTask;if(currentStep)last.step=currentStep;
      const item=rowToHazard(row,h.map,source,last);if(item)hazards.push(item);
    }
    return {hazards,method:inferMethod(h.map),headerScore:h.score};
  }
  function parseKeyValueSetup(matrix){
    const out={};const names={평가명:'title',평가구분:'evaluationType',평가방법:'methodLabel',사업장:'workplace',사업장명:'workplace','부서/공정':'department',부서:'department',공정:'department',업종:'industry','총괄 책임자':'manager','평가 담당자':'evaluator','참여 근로자':'workers','평가 시작일':'startDate','평가 완료예정일':'endDate','평가 대상·범위':'scope','사전 검토자료':'preData'};
    for(const r of matrix||[]){const k=clean(r?.[0]),v=clean(r?.[1]);if(names[k]&&v)out[names[k]]=v;}
    return out;
  }
  function methodFromLabel(v){const s=clean(v);if(/빈도|강도/.test(s))return 'frequency';if(/체크/.test(s))return 'checklist';if(/핵심|OPS/i.test(s))return 'ops';if(/3단계|수준/.test(s))return 'three';return '';}
  function mergeImport(parsed,filename){
    if(!parsed.hazards.length){setStatus('#kras-import-status','변환할 위험성평가 행을 찾지 못했습니다. 헤더에 공정/작업, 유해·위험요인 같은 항목이 있는지 확인해 주세요.','bad');return;}
    const s=stateNow();const existing=new Set(s.hazards.map(h=>normalizeHeader(h.task)+'|'+normalizeHeader(h.scenario)));let added=0;
    for(const h of parsed.hazards){const key=normalizeHeader(h.task)+'|'+normalizeHeader(h.scenario);if(!key.replace('|','')||existing.has(key))continue;h.method=parsed.method||s.setup.method||'three';if(h.method==='frequency'&&!(h.likelihood&&h.severity))h.needsReview=true;s.hazards.push(h);existing.add(key);added++;}
    if(!s.hazards.length)return;
    if(parsed.setup&&Object.keys(parsed.setup).length){const wasBlank=!clean(s.setup.title)&&s.hazards.length===added;Object.entries(parsed.setup).forEach(([k,v])=>{if(wasBlank||!clean(s.setup[k]))s.setup[k]=v});if(parsed.setup.methodLabel&&!s.setup.method)s.setup.method=methodFromLabel(parsed.setup.methodLabel)||s.setup.method;}
    if(s.hazards.length===added&&parsed.method)s.setup.method=parsed.method;
    saveAndReload(s,`${filename||'자료'}에서 ${added}건을 변환해 가져왔습니다.\n기존 위험성·감소대책 값은 보존했지만, 현장 조건과 현재 실시규정에 맞는지 반드시 재검토해 주세요.`);
  }
  async function ensureXLSX(){if(window.XLSX)return true;const urls=['https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js','https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js'];for(const url of urls){const ok=await new Promise(resolve=>{const el=document.createElement('script');let done=false;const finish=v=>{if(done)return;done=true;clearTimeout(timer);resolve(v)};const timer=setTimeout(()=>finish(!!window.XLSX),5000);el.src=url;el.async=true;el.onload=()=>finish(!!window.XLSX);el.onerror=()=>finish(false);document.head.appendChild(el)});if(ok||window.XLSX)return true;}return !!window.XLSX;}
  async function parseWorkbookFile(file){
    if(file.size>20*1024*1024)throw new Error('20MB 이하 파일을 사용해 주세요.');
    const lower=file.name.toLowerCase();
    if(lower.endsWith('.json')){const text=await file.text();const j=JSON.parse(text);if(j&&Array.isArray(j.hazards))return {hazards:j.hazards.map(h=>({...h,id:uid(),needsReview:true,note:[h.note,'JSON에서 가져옴'].filter(Boolean).join(' · ')})),method:j.setup?.method||'three',setup:j.setup||{}};if(Array.isArray(j)){const matrix=[Object.keys(j[0]||{}),...j.map(x=>Object.keys(j[0]||{}).map(k=>x[k]))];return parseMatrix(matrix,file.name)}throw new Error('지원하는 KRAS JSON 구조가 아닙니다.');}
    const ok=await ensureXLSX();if(!ok)throw new Error('Excel 변환 모듈을 불러오지 못했습니다. 인터넷 연결 후 다시 시도하거나 CSV/TSV 붙여넣기를 사용해 주세요.');
    const buf=await file.arrayBuffer();const wb=window.XLSX.read(buf,{type:'array',cellDates:true});let all=[],setup={};let inferred='';
    for(const name of wb.SheetNames){const ws=wb.Sheets[name];const matrix=window.XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});const kv=parseKeyValueSetup(matrix);setup={...setup,...kv};const parsed=parseMatrix(matrix,`${file.name} · ${name}`);if(parsed.hazards.length){all.push(...parsed.hazards);if(!inferred)inferred=parsed.method;}}
    if(setup.methodLabel)inferred=methodFromLabel(setup.methodLabel)||inferred;
    return {hazards:all,method:inferred||'three',setup};
  }
  function parseDelimited(text){
    const raw=String(text||'').replace(/^\uFEFF/,'').trim();if(!raw)return {hazards:[]};
    if(raw.startsWith('{')||raw.startsWith('[')){const j=JSON.parse(raw);if(j&&Array.isArray(j.hazards))return {hazards:j.hazards.map(h=>({...h,id:uid(),needsReview:true})),method:j.setup?.method||'three',setup:j.setup||{}};if(Array.isArray(j)&&j.length){const keys=Object.keys(j[0]);return parseMatrix([keys,...j.map(x=>keys.map(k=>x[k]))],'붙여넣은 JSON');}}
    const delim=raw.includes('\t')?'\t':raw.split('\n')[0].includes(',')?',':'\t';
    const rows=raw.split(/\r?\n/).map(line=>line.split(delim).map(v=>v.trim().replace(/^"|"$/g,'')));
    return parseMatrix(rows,'붙여넣은 표');
  }
  function riskCriteriaText(s){const m=s.setup?.method||'three';if(m==='three')return `3단계 판단법. 상: ${s.setup?.threeHigh||''} / 중: ${s.setup?.threeMedium||''} / 하: ${s.setup?.threeLow||''} / 허용 기준: ${s.setup?.threeAcceptable||'low'}`;if(m==='frequency')return `빈도·강도법 ${s.setup?.freqPreset||''}; 허용 최대점수 ${s.setup?.freqAcceptableMax||'미설정'}; ${s.setup?.freqCriteria||''}`;if(m==='checklist')return '체크리스트법';return '핵심요인기술법(OPS)';}
  let aiDraft=null;
  async function generateAI(){
    const task=clean($('#kras-ai-task')?.value),description=clean($('#kras-ai-description')?.value);if(!task||!description){setStatus('#kras-ai-status','공정·작업명과 작업내용은 반드시 입력해 주세요.','bad');return;}
    const s=stateNow();const btn=$('#kras-ai-generate');btn.disabled=true;btn.textContent='AI 분석 중…';setStatus('#kras-ai-status','Groq가 작업내용을 KRAS 위험 시나리오와 감소대책 초안으로 구조화하고 있습니다.','working');
    const body={task,description,equipment:clean($('#kras-ai-equipment')?.value),controls:clean($('#kras-ai-controls')?.value),conditions:clean($('#kras-ai-conditions')?.value),incidents:clean($('#kras-ai-incidents')?.value),workplace:clean(s.setup?.workplace),industry:clean(s.setup?.industry),method:s.setup?.method||'three',criteria:riskCriteriaText(s)};
    try{
      const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),60000);const r=await fetch('/api/ai/kras',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:ctrl.signal});clearTimeout(timer);const data=await r.json().catch(()=>({}));if(!r.ok||!data.ok)throw new Error(data.error||'AI 초안을 만들지 못했습니다.');aiDraft=data.result;renderAiPreview(aiDraft);setStatus('#kras-ai-status',`AI 초안 ${aiDraft.hazards?.length||0}건 생성 · 저장 전 반드시 현장 사실과 위험성 수준을 확인하세요.`,'ok');
    }catch(e){setStatus('#kras-ai-status',e?.name==='AbortError'?'AI 응답 시간이 길어 중단되었습니다. 잠시 후 다시 시도해 주세요.':(e.message||'AI 처리 중 오류가 발생했습니다.'),'bad');}
    finally{btn.disabled=false;btn.textContent='✨ AI KRAS 초안 만들기';}
  }
  function renderAiPreview(result){const box=$('#kras-ai-preview'),apply=$('#kras-ai-apply');if(!box)return;const hazards=Array.isArray(result?.hazards)?result.hazards:[];if(!hazards.length){box.innerHTML='';apply.hidden=true;return;}box.innerHTML=`<div class="kras-ai-summary"><b>${esc(result.summary||'AI KRAS 초안')}</b><span>${hazards.length}개 위험 시나리오</span></div><div class="kras-ai-draft-list">${hazards.map((h,i)=>`<article><div><span>${String(i+1).padStart(2,'0')}</span><b>${esc(h.task||'작업')}</b><em>${esc(h.riskLevel==='high'?'상':h.riskLevel==='medium'?'중':'하')}</em></div><p>${esc(h.scenario)}</p><small>대책: ${esc(h.measure)}</small><small>현장 확인: ${esc((h.verificationItems||[]).join(' · '))}</small></article>`).join('')}</div>`;apply.hidden=false;}
  function applyAI(){if(!aiDraft?.hazards?.length)return;const s=stateNow();const existing=new Set(s.hazards.map(h=>normalizeHeader(h.task)+'|'+normalizeHeader(h.scenario)));let added=0;for(const x of aiDraft.hazards){const key=normalizeHeader(x.task)+'|'+normalizeHeader(x.scenario);if(existing.has(key))continue;const h={id:uid(),task:clean(x.task),step:clean(x.step),type:detectType(x.type),source:'기타',scenario:clean(x.scenario),consequence:clean(x.consequence),currentControl:clean(x.currentControl)||'현장 확인 필요',basis:'',worker:'',workerComment:'AI 초안에서 생성 · 해당 작업 근로자 참여 후 보완 필요',controlType:detectControlType(x.controlType),measure:clean(x.measure),owner:'',due:'',status:'재검토 필요',completed:'',evidence:'',riskReason:clean(x.riskReason),afterReason:clean(x.afterReason),riskLevel:x.riskLevel||'',afterLevel:x.afterLevel||'',note:`AI KRAS 초안 · 신뢰도 ${Number(x.confidence)||0}% · 현장 확인: ${(x.verificationItems||[]).join(' / ')}`,method:s.setup?.method||'three',needsReview:true,aiGenerated:true,updatedAt:new Date().toISOString()};if(h.method==='checklist'){h.checkItem=`${h.scenario}에 대한 현재 안전보건조치가 적정한가?`;h.checklistResult=h.riskLevel==='low'?'adequate':'supplement';h.afterChecklist=h.afterLevel==='low'?'adequate':'supplement';}else if(h.method==='ops'){h.opsWhat=h.scenario;h.opsWho=h.consequence;h.opsCurrent=h.currentControl;h.opsAdditional=h.measure;h.opsNeed=h.riskLevel==='low'?'no':'yes';h.afterOpsNeed=h.afterLevel==='low'?'no':'yes';}else if(h.method==='frequency'){h.note+=' · 빈도·강도 점수는 사업장 실시규정에 따라 직접 확인 필요';h.riskLevel='';h.afterLevel='';}s.hazards.push(h);existing.add(key);added++;}
    saveAndReload(s,`AI KRAS 초안 ${added}건을 평가표에 추가했습니다.\nAI는 초안 작성만 수행했습니다. 위험성 수준, 현재조치, 감소대책, 담당자·기한은 현장 확인 후 확정해 주세요.`);
  }
  async function importFile(file){setStatus('#kras-import-status',`${file.name} 분석 중…`,'working');try{const parsed=await parseWorkbookFile(file);setStatus('#kras-import-status',`${file.name}: 위험성평가 ${parsed.hazards.length}건 인식 · 변환 준비 완료`,'ok');if(!parsed.hazards.length)return;if(confirm(`${file.name}에서 위험성평가 ${parsed.hazards.length}건을 찾았습니다.\n현재 평가표에 병합할까요? 중복 항목은 제외합니다.`))mergeImport(parsed,file.name);}catch(e){setStatus('#kras-import-status',e.message||'파일을 읽지 못했습니다.','bad');}}
  function bind(){
    $('#kras-import-btn')?.addEventListener('click',()=>$('#kras-import-file')?.click());
    $('#kras-import-file')?.addEventListener('change',e=>{const f=e.target.files?.[0];if(f)importFile(f);e.target.value='';});
    $('#kras-import-text-btn')?.addEventListener('click',()=>{try{const p=parseDelimited($('#kras-import-text')?.value||'');if(!p.hazards.length)return setStatus('#kras-import-status','붙여넣은 표에서 위험성평가 행을 찾지 못했습니다. 첫 행에 항목명이 포함되어 있는지 확인해 주세요.','bad');if(confirm(`붙여넣은 자료에서 ${p.hazards.length}건을 찾았습니다. 현재 평가표에 병합할까요?`))mergeImport(p,'붙여넣은 표');}catch(e){setStatus('#kras-import-status','붙여넣은 자료 형식을 확인해 주세요.','bad');}});
    $('#kras-ai-generate')?.addEventListener('click',generateAI);$('#kras-ai-apply')?.addEventListener('click',applyAI);
  }
  bind();
})();
