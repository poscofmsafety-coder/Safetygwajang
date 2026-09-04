/* =========================================================
   안전과장 MSDS 파서 v7
   - PDF 텍스트 레이아웃 보존
   - 스캔 PDF/이미지 OCR 보조
   - 1·2·3·4·7·8·15항 우선 추출
   - CAS/함유량/유해위험문구/예방조치문구/법적규제현황 분리
   - 법적 대상 여부를 임의 추정하지 않음
   ========================================================= */

const MSDS_SECTION_TITLES = {
    1: ['화학제품과 회사에 관한 정보','화학제품과 회사에 관한정보','화학제품과 회사'],
    2: ['유해성·위험성','유해성 위험성','유해 위험성'],
    3: ['구성성분의 명칭 및 함유량','구성성분 명칭 및 함유량','구성성분'],
    4: ['응급조치 요령','응급조치요령','응급조치'],
    5: ['폭발·화재시 대처방법','폭발 화재시 대처방법','폭발 화재'],
    6: ['누출사고시 대처방법','누출사고 시 대처방법','누출사고'],
    7: ['취급 및 저장방법','취급및저장방법','취급 저장'],
    8: ['노출방지 및 개인보호구','노출 방지 및 개인 보호구','개인보호구'],
    9: ['물리화학적 특성','물리·화학적 특성'],
    10:['안정성 및 반응성'],
    11:['독성에 관한 정보'],
    12:['환경에 미치는 영향'],
    13:['폐기시 주의사항','폐기 시 주의사항'],
    14:['운송에 필요한 정보'],
    15:['법적 규제현황','법적규제현황','법적 규제 현황'],
    16:['그 밖의 참고사항','그밖의 참고사항']
};

function normalizeMsdsText(text){
    return String(text||'')
        .replace(/\r/g,'\n')
        .replace(/[\u00a0\u2000-\u200b]/g,' ')
        .replace(/[‐‑‒–—−]/g,'-')
        .replace(/％/g,'%')
        .replace(/[ \t]+/g,' ')
        .replace(/\n[ \t]+/g,'\n')
        .replace(/\n{3,}/g,'\n\n')
        .trim();
}
function escReg(s){ return String(s).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); }
function uniqueClean(arr, max=50){
    const out=[]; const seen=new Set();
    (arr||[]).forEach(v=>{
        const x=String(v||'').replace(/\s+/g,' ').replace(/^[·•\-–—:;\s]+/,'').trim();
        if(!x || x.length<2 || seen.has(x)) return;
        seen.add(x); out.push(x);
    });
    return out.slice(0,max);
}
function linesOf(text){ return normalizeMsdsText(text).split('\n').map(s=>s.trim()).filter(Boolean); }

function groupPdfItemsToLines(items){
    const rows=[];
    for(const it of items||[]){
        const str=String(it.str||'').trim(); if(!str) continue;
        const x=it.transform?.[4]||0, y=it.transform?.[5]||0;
        let row=rows.find(r=>Math.abs(r.y-y)<=2.4);
        if(!row){ row={y,items:[]}; rows.push(row); }
        row.items.push({x,str});
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(r=>r.items.sort((a,b)=>a.x-b.x).map(v=>v.str).join(' ')).join('\n');
}


function preprocessOcrCanvas(sourceCanvas){
    // 스캔 문서에서 옅은 표선·회색 배경 때문에 CAS/함유량이 깨지는 것을 줄이는 전처리.
    const canvas=document.createElement('canvas');
    canvas.width=sourceCanvas.width; canvas.height=sourceCanvas.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(sourceCanvas,0,0);
    try{
        const img=ctx.getImageData(0,0,canvas.width,canvas.height); const d=img.data;
        for(let i=0;i<d.length;i+=4){
            const y=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
            // contrast stretch around middle gray; keep text edges rather than hard thresholding.
            const c=Math.max(0,Math.min(255,(y-128)*1.42+128));
            d[i]=d[i+1]=d[i+2]=c;
        }
        ctx.putImageData(img,0,0);
    }catch(e){}
    return canvas;
}

async function ocrCanvas(canvas){
    if(!window.Tesseract) return '';
    try{
        const prepared=preprocessOcrCanvas(canvas);
        const result=await Tesseract.recognize(prepared,'kor+eng',{preserve_interword_spaces:'1',logger:m=>{
            if(m && m.status==='recognizing text' && typeof updateProgress==='function'){
                const pct=Math.round((m.progress||0)*100);
                const el=document.getElementById('progressPercent');
                if(el) el.textContent='OCR '+pct+'%';
            }
        }});
        return result?.data?.text||'';
    }catch(e){ console.warn('[OCR] 실패',e); return ''; }
}

async function extractPdfText(file){
    if(!window.pdfjsLib) return '';
    try{
        const buffer=await file.arrayBuffer();
        const pdf=await pdfjsLib.getDocument({data:buffer}).promise;
        const maxPages=Math.min(pdf.numPages,30);
        const pageTexts=[];
        let signalChars=0;
        for(let i=1;i<=maxPages;i++){
            const page=await pdf.getPage(i);
            const content=await page.getTextContent({normalizeWhitespace:true});
            const txt=groupPdfItemsToLines(content.items);
            pageTexts.push(`\n[PAGE ${i}]\n${txt}`);
            signalChars += txt.replace(/\s/g,'').length;
        }
        let text=normalizeMsdsText(pageTexts.join('\n'));
        const hasKey=/구성\s*성분|유해성\s*[·ㆍ\-]?\s*위험성|법적\s*규제/.test(text);
        if(signalChars>=900 && hasKey) return text;

        // 스캔형 PDF 보조 OCR: 텍스트가 부족한 경우 앞쪽 최대 6페이지.
        if(window.Tesseract){
            const ocr=[];
            const ocrPages=Math.min(pdf.numPages,6);
            for(let i=1;i<=ocrPages;i++){
                const page=await pdf.getPage(i);
                const viewport=page.getViewport({scale:2.15});
                const canvas=document.createElement('canvas');
                canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
                await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
                const t=await ocrCanvas(canvas);
                if(t) ocr.push(`\n[OCR PAGE ${i}]\n${t}`);
            }
            if(ocr.length) text=normalizeMsdsText(text+'\n'+ocr.join('\n'));
        }
        return text;
    }catch(e){ console.warn('[PDF] 텍스트 추출 실패',e); return ''; }
}

async function extractImageText(file){
    if(!window.Tesseract) return '';
    try{
        const bitmap=await createImageBitmap(file);
        const scale=Math.min(2.2, Math.max(1, 2200/Math.max(bitmap.width,1)));
        const canvas=document.createElement('canvas');
        canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height);
        if(bitmap.close) bitmap.close();
        return normalizeMsdsText(await ocrCanvas(canvas));
    }catch(e){
        console.warn('[이미지 OCR] 전처리 실패, 원본 OCR 재시도',e);
        try{const result=await Tesseract.recognize(file,'kor+eng',{preserve_interword_spaces:'1'});return normalizeMsdsText(result?.data?.text||'');}
        catch(err){console.warn('[이미지 OCR] 실패',err);return '';}
    }
}

async function extractSourceText(file){
    const name=(file?.name||'').toLowerCase();
    const type=file?.type||'';
    if(type==='application/pdf' || name.endsWith('.pdf')) return extractPdfText(file);
    if(type.startsWith('image/') || /\.(png|jpe?g|webp|tif?f)$/i.test(name)) return extractImageText(file);
    throw new Error('현재 자동추출은 PDF 또는 이미지(PNG/JPG/WEBP)를 지원합니다. HWP/DOCX는 PDF로 변환 후 업로드해 주세요.');
}

function findSectionStart(text,n){
    const titles=MSDS_SECTION_TITLES[n]||[];
    for(const title of titles){
        const loose=escReg(title).replace(/\\ /g,'\\s*').replace(/·/g,'[·ㆍ\\-]?');
        const re=new RegExp('(?:^|\\n)\\s*'+n+'\\s*[.)]?\\s*'+loose,'i');
        const m=re.exec(text); if(m) return m.index+(m[0].startsWith('\n')?1:0);
    }
    const generic=new RegExp('(?:^|\\n)\\s*'+n+'\\s*[.)]\\s*[^\\n]{2,80}','i').exec(text);
    return generic ? generic.index+(generic[0].startsWith('\n')?1:0) : -1;
}
function extractMSDSSection(text,n){
    text=normalizeMsdsText(text); const start=findSectionStart(text,n); if(start<0) return '';
    let end=text.length;
    for(let k=n+1;k<=16;k++){ const x=findSectionStart(text,k); if(x>start && x<end){end=x;break;} }
    return text.slice(start,end).trim();
}

function valueAfterLabel(section, labels){
    const ls=linesOf(section);
    for(let i=0;i<ls.length;i++){
        for(const label of labels){
            if(!ls[i].toLowerCase().includes(label.toLowerCase())) continue;
            let v=ls[i].replace(new RegExp('.*?'+escReg(label)+'\\s*[:：]?\\s*','i'),'').trim();
            if(v && v!==ls[i] && v.length>1) return v;
            if(ls[i+1] && !/^\d+\s*[.)]/.test(ls[i+1])) return ls[i+1].trim();
        }
    }
    return '';
}
function extractProductProfile(text,fileName){
    const s1=extractMSDSSection(text,1);
    const fallback=String(fileName||'MSDS').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
    return {
        name:valueAfterLabel(s1,['제품명','제품의 명칭','화학제품명','물질명'])||fallback,
        manufacturer:valueAfterLabel(s1,['제조자명','제조자','제조업체명','회사명'])||'원본 MSDS 확인',
        supplier:valueAfterLabel(s1,['공급자명','공급자','긴급전화번호'])||'원본 MSDS 확인',
        raw:s1
    };
}

function inferPictogramsFromHCodes(codes){
    const set=new Set();
    for(const codeRaw of codes||[]){
        const n=parseInt(String(codeRaw).match(/H(\d{3})/)?.[1]||'',10); if(!n) continue;
        if(n>=200&&n<=205) set.add('GHS01');
        if((n>=220&&n<=228)||(n>=240&&n<=242)||(n>=250&&n<=252)||(n>=260&&n<=261)) set.add('GHS02');
        if(n>=270&&n<=272) set.add('GHS03');
        if(n>=280&&n<=281) set.add('GHS04');
        if(n===290||n===314||n===318) set.add('GHS05');
        if([300,301,310,311,330,331].includes(n)) set.add('GHS06');
        if([302,312,315,317,319,332,335,336].includes(n)) set.add('GHS07');
        if([304,334,340,341,350,351,360,361,362,370,371,372,373].includes(n)) set.add('GHS08');
        if([400,410,411].includes(n)) set.add('GHS09');
    }
    return [...set];
}
function extractCodeStatements(section,prefix){
    const re=prefix==='H' ? /\bH\d{3}(?:\s*\+\s*H?\d{3})*/g : /\bP\d{3}(?:\s*\+\s*P?\d{3})*/g;
    const out=[]; const ls=linesOf(section);
    for(let i=0;i<ls.length;i++){
        const line=ls[i]; const ms=[...line.matchAll(re)];
        for(const m of ms){
            const code=m[0].replace(/\s+/g,'');
            let stmt=line.slice((m.index||0)+m[0].length).replace(/^\s*[:：\-–—]?\s*/,'').trim();
            if(!stmt || stmt===code){
                const next=ls[i+1]||'';
                if(next && !re.test(next) && !/^(신호어|그림문자|예방조치|유해.?위험)/.test(next)) stmt=next;
                re.lastIndex=0;
            }
            out.push({code,text:stmt,full:(code+(stmt?' '+stmt:''))});
        }
    }
    return out;
}
function extractHeadingLines(section, headingRegex){
    const ls=linesOf(section); const out=[];
    for(let i=0;i<ls.length;i++){
        if(!headingRegex.test(ls[i])) continue;
        const same=ls[i].replace(headingRegex,'').replace(/^\s*[:：\-–—]?\s*/,'').trim();
        if(same.length>2) out.push(same);
        for(let j=i+1;j<Math.min(ls.length,i+8);j++){
            if(/^(신호어|그림문자|예방조치|유해.?위험 문구|가\. |나\. |다\. )/.test(ls[j])) break;
            if(ls[j].length>2) out.push(ls[j]);
        }
    }
    return uniqueClean(out,20);
}
function extractHazardProfile(text){
    const s2=extractMSDSSection(text,2);
    const ls=linesOf(s2);
    let signal='';
    for(let i=0;i<ls.length;i++) if(/신호어/.test(ls[i])){
        const joined=(ls[i]+' '+(ls[i+1]||''));
        const m=joined.match(/(위험|경고)/); if(m){signal=m[1];break;}
    }
    const hs=extractCodeStatements(s2,'H');
    const ps=extractCodeStatements(s2,'P');
    let hazards=uniqueClean(hs.map(x=>x.full),30);
    if(!hazards.length) hazards=extractHeadingLines(s2,/.*유해.?위험\s*문구\s*/);

    const buckets={prevention:[],response:[],storage:[],disposal:[]};
    for(const item of ps){
        const n=parseInt(item.code.match(/P(\d{3})/)?.[1]||'',10);
        if(n>=200&&n<300) buckets.prevention.push(item.full);
        else if(n>=300&&n<400) buckets.response.push(item.full);
        else if(n>=400&&n<500) buckets.storage.push(item.full);
        else if(n>=500&&n<600) buckets.disposal.push(item.full);
    }
    if(!ps.length){
        const precaution=extractHeadingLines(s2,/.*예방조치\s*문구\s*/);
        buckets.prevention=precaution;
    }
    const explicit=[...s2.matchAll(/\bGHS0([1-9])\b/gi)].map(m=>'GHS0'+m[1]);
    const hcodes=hs.map(x=>x.code);
    const wordHints=inferPictogramsFromWords(s2);
    const inferred=[...new Set([...inferPictogramsFromHCodes(hcodes),...wordHints])];
    return {
        raw:s2, signalWord:signal||'원본 확인', hazards,
        pPrevention:uniqueClean(buckets.prevention,20),
        pResponse:uniqueClean(buckets.response,20),
        pStorage:uniqueClean(buckets.storage,12),
        pDisposal:uniqueClean(buckets.disposal,12),
        hCodes:hcodes, pCodes:ps.map(x=>x.code),
        pictograms:uniqueClean(explicit.length?explicit:inferred,9),
        pictogramsVerified:explicit.length>0,
        pictogramsSource:explicit.length?'MSDS 텍스트에서 GHS 코드 직접 확인':'MSDS 2항 H코드·텍스트 기반 보조 추정 — 원본 그림문자 최종 대조 필요'
    };
}


function isValidCasChecksum(cas){
    const m=String(cas||'').match(/^(\d{2,7})-(\d{2})-(\d)$/);
    if(!m) return false;
    const digits=(m[1]+m[2]).split('').reverse().map(Number);
    const sum=digits.reduce((acc,d,i)=>acc+d*(i+1),0);
    return sum%10===Number(m[3]);
}
function inferPictogramsFromWords(section){
    const text=String(section||'').toLowerCase(); const set=new Set();
    const rules=[
      ['GHS01',/폭발|폭발하는 폭탄|explos/],['GHS02',/불꽃|인화성|flamm/],['GHS03',/원 위의 불꽃|산화성|oxidiz/],
      ['GHS04',/가스 실린더|고압가스|gas cylinder/],['GHS05',/부식|corrosi/],['GHS06',/해골|급성독성|skull/],
      ['GHS07',/느낌표|자극성|유해성|exclamation/],['GHS08',/건강 유해성|건강유해성|발암|생식독성|호흡기 과민|health hazard/],
      ['GHS09',/환경|수생환경|environment/]
    ];
    rules.forEach(([code,re])=>{if(re.test(text))set.add(code)}); return [...set];
}

function parseContentRange(str){
    const s=String(str||'').replace(/％/g,'%').replace(/∼|–|—/g,'~');
    let m=s.match(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?)\s*[~\-]\s*(\d{1,3}(?:\.\d+)?)\s*%?/);
    if(m){
        const lo=parseFloat(m[1].replace(/[^0-9.]/g,'')), hi=parseFloat(m[2]);
        if(lo>=0&&hi>=0&&lo<=100&&hi<=100&&lo<=hi) return {text:m[0].includes('%')?m[0].trim():m[0].trim()+'%',min:lo,max:hi,num:(lo+hi)/2,range:true};
    }
    m=s.match(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?)\s*%/);
    if(m){ const v=parseFloat(m[1].replace(/[^0-9.]/g,'')); if(v>=0&&v<=100) return {text:m[0].replace(/\s/g,''),min:v,max:v,num:v,range:false}; }
    return null;
}
function cleanChemicalName(s){
    return String(s||'')
        .replace(/(CAS\s*(No\.?|번호)?|식별번호|함유량\s*\(?%?\)?|화학물질명|관용명|이명|구성성분.*)/gi,' ')
        .replace(/[|,:;]+/g,' ').replace(/\s+/g,' ').trim().replace(/^[\-·•\s]+|[\-·•\s]+$/g,'');
}
function extractComposition(text){
    const section=extractMSDSSection(text,3);
    const result={items:[],sum:0,valid:false,warnings:[],rawText:section,sumStatus:'확인 필요'};
    if(!section){ result.warnings.push('MSDS 3항을 찾지 못했습니다. 구성성분을 수동 확인하세요.'); return result; }
    const ls=linesOf(section); const seen=new Set();
    for(let i=0;i<ls.length;i++){
        const line=ls[i]; const hits=[...line.matchAll(/\b\d{2,7}\s*-\s*\d{2}\s*-\s*\d\b/g)];
        for(const hit of hits){
            const rawCas=hit[0]; const cas=rawCas.replace(/\s+/g,''); if(seen.has(cas)) continue;
            const before=line.slice(0,hit.index).trim(); const after=line.slice((hit.index||0)+rawCas.length).trim();
            let content=parseContentRange(after)||parseContentRange(before);
            if(!content && ls[i+1] && !/\b\d{2,7}\s*-\s*\d{2}\s*-\s*\d\b/.test(ls[i+1])) content=parseContentRange(ls[i+1]);
            if(!content && i>0) content=parseContentRange(ls[i-1]);
            let name=cleanChemicalName(before.replace(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?\s*(?:[~\-]\s*\d{1,3}(?:\.\d+)?)?\s*%)/g,' '));
            if(!name && i>0) name=cleanChemicalName(ls[i-1].replace(/\b\d{2,7}\s*-\s*\d{2}\s*-\s*\d\b/g,'').replace(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?\s*(?:[~\-]\s*\d{1,3}(?:\.\d+)?)?\s*%)/g,' '));
            if(!name || /^\d/.test(name)) name='물질명 확인 필요';
            const casOk=isValidCasChecksum(cas);
            const confidence=casOk&&content?'높음':casOk?'보통':'검토 필요';
            result.items.push({name,cas,casChecksumValid:casOk,confidence,content:content?.text||'-',contentNum:content?.num||0,contentMin:content?.min??null,contentMax:content?.max??null,contentRange:!!content?.range});
            seen.add(cas);
        }
    }
    // OCR에서 CAS가 빠졌더라도 “물질명 + 함유량” 형태가 명확하면 검수용 행으로 보존합니다.
    if(result.items.length===0){
        for(const line of ls){
            const content=parseContentRange(line); if(!content) continue;
            let name=cleanChemicalName(line.replace(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?\s*(?:[~\-]\s*\d{1,3}(?:\.\d+)?)?\s*%)/g,' '));
            if(!name || /^(함유량|구성성분|CAS)/i.test(name)) continue;
            result.items.push({name,cas:'-',casChecksumValid:null,confidence:'검토 필요',content:content.text,contentNum:content.num,contentMin:content.min,contentMax:content.max,contentRange:!!content.range,needsCas:true});
        }
    }
    result.sum=Math.round(result.items.reduce((a,c)=>a+(c.contentNum||0),0)*10)/10;
    result.valid=result.items.length>0;
    if(!result.items.length) result.warnings.push('구성성분을 자동 인식하지 못했습니다. 스캔 품질을 확인하거나 수동 입력하세요.');
    const badCas=result.items.filter(x=>x.cas!=='-'&&x.casChecksumValid===false); if(badCas.length) result.warnings.push(`${badCas.length}개 CAS No.의 체크디지트가 맞지 않습니다. OCR 오인식 여부를 원본과 대조하세요.`);
    const missingCas=result.items.filter(x=>x.cas==='-').length; if(missingCas) result.warnings.push(`${missingCas}개 성분의 CAS No.를 인식하지 못했습니다. 원본 3항에서 보완하세요.`);
    const missing=result.items.filter(x=>x.content==='-').length; if(missing) result.warnings.push(`${missing}개 성분의 함유량을 인식하지 못했습니다. MSDS 3항과 대조하세요.`);
    if(result.items.some(x=>x.contentRange)) result.warnings.push('범위 함유량은 중간값으로 합계만 참고 표시합니다. 범위 자체가 원본 기준입니다.');
    if(result.sum>=95&&result.sum<=105) result.sumStatus='단순 합계 약 100%'; else if(result.items.length) result.sumStatus='범위·영업비밀·누락 여부 확인';
    return result;
}
function triStateKeyword(section, keyword){
    const contexts=linesOf(section).filter(l=>l.includes(keyword));
    if(!contexts.length) return {value:null,evidence:[]};
    let value=null;
    for(const line of contexts){
        if(/해당\s*없|비대상|규제\s*없|적용\s*안|없음|해당되지/.test(line)) value=false;
        else if(/해당|대상|규제|관리대상|특별관리/.test(line)) value=true;
    }
    return {value,evidence:contexts.slice(0,5)};
}
function triStateCmr(section, keyword){
    const contexts=linesOf(section).filter(l=>l.includes(keyword));
    if(!contexts.length) return {value:null,evidence:[]};
    let value=null;
    for(const line of contexts){
        if(/해당\s*없|분류\s*되지|비대상|없음|자료\s*없/.test(line)) value=false;
        else if(/(?:구분|category|cat\.?)[\s:.-]*(?:1A|1B|1)|1A|1B|해당|대상/i.test(line)) value=true;
    }
    return {value,evidence:contexts.slice(0,5)};
}
function extractRegulatoryProfile(text){
    const s15=extractMSDSSection(text,15);
    const work=triStateKeyword(s15,'작업환경측정');
    const health=triStateKeyword(s15,'특수건강진단');
    const special=triStateKeyword(s15,'특별관리물질');
    const managed=triStateKeyword(s15,'관리대상유해물질');
    const carc=triStateCmr(s15,'발암성');
    const mut=triStateCmr(s15,'생식세포 변이원성');
    const repro=triStateCmr(s15,'생식독성');
    return {
        source:'업로드 MSDS 15항', raw:s15,
        workEnvTarget:work.value, specialHealthTarget:health.value, specialManagement:special.value, managementTarget:managed.value,
        cmr:{carcinogenic:carc.value,mutagenic:mut.value,reprotoxic:repro.value},
        evidence:uniqueClean([...work.evidence,...health.evidence,...special.evidence,...managed.evidence,...carc.evidence,...mut.evidence,...repro.evidence],18)
    };
}
function extractSectionUsefulLines(section, patterns, max=12){
    const ls=linesOf(section); const out=[];
    for(let i=0;i<ls.length;i++){
        if(patterns.some(r=>r.test(ls[i]))){
            out.push(ls[i]);
            if(ls[i+1] && !/^\d+\s*[.)]/.test(ls[i+1])) out.push(ls[i+1]);
        }
    }
    return uniqueClean(out,max);
}
function parseSupportingSections(text){
    const s4=extractMSDSSection(text,4), s7=extractMSDSSection(text,7), s8=extractMSDSSection(text,8);
    return {
        firstAid:extractSectionUsefulLines(s4,[/눈|안구|피부|흡입|먹었|섭취|의료|의사/],12),
        handling:extractSectionUsefulLines(s7,[/취급|환기|화기|점화|저장|보관|밀폐|피해야/],14),
        ppe:extractSectionUsefulLines(s8,[/호흡기|보호구|보안경|안면|장갑|보호복|국소배기|환기/],12),
        raw:{s4,s7,s8}
    };
}

async function parseMSDSFile(file){
    const sourceText=await extractSourceText(file);
    if(!sourceText || sourceText.replace(/\s/g,'').length<120) throw new Error('문자 인식 결과가 너무 적습니다. 선명한 PDF 또는 이미지로 다시 시도해 주세요.');
    const product=extractProductProfile(sourceText,file.name);
    const hazard=extractHazardProfile(sourceText);
    const comp=extractComposition(sourceText);
    const reg=extractRegulatoryProfile(sourceText);
    const support=parseSupportingSections(sourceText);

    const base=JSON.parse(JSON.stringify(typeof FALLBACK_TEMPLATE!=='undefined'?FALLBACK_TEMPLATE:{}));
    base.id='MSDS_'+Date.now()+'_'+Math.floor(Math.random()*1000);
    base.name=product.name;
    base.subtitle=comp.items[0]?.cas||'원본 MSDS 기준';
    base.manufacturer=product.manufacturer;
    base.supplier=product.supplier;
    base.cas=comp.items[0]?.cas||'-';
    base.signalWord=hazard.signalWord;
    base.pictograms=hazard.pictograms;
    base.pictogramsSource=hazard.pictogramsSource;
    base.pictogramsVerified=hazard.pictogramsVerified;
    base.hazards=hazard.hazards.length?hazard.hazards:['MSDS 2항 유해성·위험성 문구를 원본에서 확인하세요.'];
    base.pPrevention=hazard.pPrevention.length?hazard.pPrevention:['MSDS 2항 예방조치문구를 원본에서 확인하세요.'];
    base.pResponse=hazard.pResponse;
    base.pStorage=hazard.pStorage;
    base.pDisposal=hazard.pDisposal;
    base.handling=support.handling.length?support.handling:hazard.pPrevention;
    base.ppe=support.ppe.length?support.ppe:['MSDS 8항 개인보호구를 원본에서 확인하세요.'];
    base.firstAid=support.firstAid.length?support.firstAid:['MSDS 4항 응급조치요령을 원본에서 확인하세요.'];
    base.composition=comp.items;
    base.compositionSum=comp.sum;
    base.compositionValid=comp.valid;
    base.compositionWarnings=comp.warnings;
    base.compositionRawText=comp.rawText;
    base.compositionReviewed=false;
    base.regulatoryProfile=reg;
    // 15항에 명시가 없으면 false로 단정하지 않고 null(확인 필요)을 유지합니다.
    base.isSpecial=reg.specialManagement;
    base.envTarget=reg.workEnvTarget;
    base.healthTarget=reg.specialHealthTarget;
    // 특별관리물질이 제품 수준에서 확인돼도 어떤 구성성분이 해당하는지 임의 매핑하지 않습니다. CAS별 KOSHA 대조 또는 수동 검토 후 채웁니다.
    base.specialMaterials=[];
    base.tags=[];
    if(base.isSpecial) base.tags.push('special');
    if(reg.cmr.carcinogenic===true || reg.cmr.mutagenic===true || reg.cmr.reprotoxic===true) base.tags.push('cmr');
    base.sourceFile=file.name;
    base.uploadedAt=new Date().toISOString();
    base.matched=false;
    const trace={section1:!!product.raw,section2:!!hazard.raw,section3:!!comp.rawText,section15:!!reg.raw,compositionCount:comp.items.length,hCodes:hazard.hCodes.length,pCodes:hazard.pCodes.length};
    base.extractionTrace=trace;
    const score=[trace.section1,trace.section2,trace.section3,trace.section15].filter(Boolean).length + (comp.items.length?1:0) + (hazard.hCodes.length?1:0);
    base.matchConfidence=score>=5?'높음 (MSDS 주요 항목 직접 추출)':score>=3?'보통 (자동추출 후 원본 대조 필요)':'검토 필요 (OCR/수동확인 권장)';
    base.matchReason=`1항 ${trace.section1?'확인':'미확인'} · 2항 ${trace.section2?'확인':'미확인'} · 3항 ${trace.section3?'확인':'미확인'} · 15항 ${trace.section15?'확인':'미확인'}`;
    base.rawMsdsText=sourceText.slice(0,60000);
    return base;
}

function stripPunctuation(str){ return String(str||'').replace(/[,./()[\]{}<>"'`|]/g,' '); }
function stripBracketedName(str){ return String(str||'').replace(/[\[(](?:異名|이명)[\])]?/g,' '); }

/* =========================================================
   아래는 기존 검수 UI/수동입력 동기화 기능을 유지합니다.
   ========================================================= */
function syncParsedToManual(){
    if(typeof manualCompRows === 'undefined') return;
    if(!lastParsedMaterials || lastParsedMaterials.length === 0) return;
    const m = lastParsedMaterials[0];
    if(!m || !m.composition) return;

    // 배열 참조 유지하면서 내용만 교체
    manualCompRows.length = 0;
    m.composition.forEach(c=>{
        manualCompRows.push({
            name: c.name || '',
            cas: c.cas || '',
            content: c.content || '',
            contentNum: c.contentNum || 0
        });
    });
    if(manualCompRows.length === 0){
        manualCompRows.push({ name:'', cas:'', content:'', contentNum:0 });
    }
    if(typeof renderManualCompTable === 'function'){
        renderManualCompTable();
    }
}

/* =========================================================
   구성성분 검수 UI (참고용 · 하단 수동입력 테이블과 병행)
   ========================================================= */
function renderCompositionReview(parsedMaterial){
    const container = document.getElementById('compositionReviewArea');
    if(!container) return;

    if(!parsedMaterial.composition || parsedMaterial.composition.length === 0){
        container.classList.add('hidden');
        container.innerHTML = '';
        const regBtn = document.getElementById('btnRegister');
        if(regBtn){
            regBtn.disabled = false;
            regBtn.classList.remove('opacity-50','cursor-not-allowed');
        }
        return;
    }

    const comp = parsedMaterial.composition || [];
    const sum = parsedMaterial.compositionSum || 0;
    const valid = parsedMaterial.compositionValid;
    const warnings = parsedMaterial.compositionWarnings || [];

    const sumBadgeColor = valid
        ? 'bg-green-100 text-green-800 border-green-300'
        : (sum < 95 ? 'bg-red-100 text-red-800 border-red-300' : 'bg-amber-100 text-amber-800 border-amber-300');
    const sumIcon = valid ? '' : '';

    let html = ''
        + '<div class="p-4 border-2 ' + (valid?'border-green-300 bg-green-50':'border-amber-300 bg-amber-50') + ' rounded-lg">'
        +   '<div class="flex items-center justify-between mb-3 flex-wrap gap-2">'
        +     '<h4 class="font-bold text-slate-800 text-sm"> MSDS 3번 「구성성분의 명칭 및 함유량」 자동추출 결과 <span class="text-[10px] text-gray-500 font-normal">(참고용 · 아래 수동입력 테이블과 실시간 동기화)</span></h4>'
        +     '<span class="px-3 py-1 text-xs font-bold rounded-full border ' + sumBadgeColor + '">'
        +       sumIcon + ' 합계 ' + sum + '%'
        +     '</span>'
        +   '</div>'
        +   '<table class="comp-review-table">'
        +     '<thead>'
        +       '<tr>'
        +         '<th style="width:40px">#</th>'
        +         '<th>물질명</th>'
        +         '<th style="width:140px">CAS No.</th>'
        +         '<th style="width:110px">함유량(%)</th>'
        +         '<th style="width:95px">추출 신뢰도</th>'
        +         '<th style="width:50px">삭제</th>'
        +       '</tr>'
        +     '</thead>'
        +     '<tbody id="compReviewTbody">';

    for(let i=0; i<comp.length; i++){
        const item = comp[i];
        const nameErr = item.name.indexOf('추출실패')>=0 || item.name.indexOf('미상')>=0;
        const contErr = !item.content || item.content === '-';
        const safeName = item.name.split('"').join('&quot;');
        html += ''
            + '<tr>'
            +   '<td style="text-align:center">' + (i+1) + '</td>'
            +   '<td><input type="text" value="' + safeName + '" class="' + (nameErr?'error':'') + '" onchange="updateCompItem(' + i + ',\'name\',this.value)"></td>'
            +   '<td><input type="text" value="' + item.cas + '" style="font-family:monospace;font-size:11px" onchange="updateCompItem(' + i + ',\'cas\',this.value)"></td>'
            +   '<td><input type="text" value="' + item.content + '" class="' + (contErr?'error':'') + '" style="text-align:center" onchange="updateCompItem(' + i + ',\'content\',this.value)"></td>'
            +   '<td style="text-align:center;font-size:10px;color:' + (item.casChecksumValid===false?'#be123c':'#64748b') + '">' + (item.confidence||'검토 필요') + (item.casChecksumValid===false?' / CAS 확인':'') + '</td>'
            +   '<td style="text-align:center"><button onclick="removeCompItem(' + i + ')" style="color:#dc2626;font-weight:bold;cursor:pointer;background:none;border:none;font-size:11px">삭제</button></td>'
            + '</tr>';
    }

    html += ''
        +     '</tbody>'
        +   '</table>'
        +   '<div class="mt-3 flex gap-2 flex-wrap">'
        +     '<button onclick="addCompItem()" class="px-3 py-1.5 text-xs bg-slate-600 text-white rounded hover:bg-slate-700 font-semibold">성분 추가</button>'
        +     '<button onclick="recalcCompSum()" class="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 font-semibold">합계 재계산</button>'
        +     '<button onclick="showRawSection3()" class="px-3 py-1.5 text-xs bg-slate-200 text-slate-700 rounded hover:bg-slate-300 font-semibold">MSDS 원본 3번 항목 보기</button>'
        +   '</div>';

    if(warnings.length > 0){
        html += ''
            + '<div class="mt-3 p-3 bg-white border-l-4 border-amber-500 rounded">'
            +   '<div class="text-xs font-bold text-amber-800 mb-1"> 검토 필요 항목 (' + warnings.length + '건)</div>'
            +   '<ul class="text-[11px] text-amber-900 space-y-0.5 ml-4 list-disc">'
            +     warnings.map(w=>'<li>' + w + '</li>').join('')
            +   '</ul>'
            + '</div>';
    }

    html += ''
        +   '<div class="mt-4 p-3 bg-blue-50 border-2 border-blue-300 rounded flex items-start gap-3">'
        +     ''
        +     '<div class="text-xs text-slate-800 flex-1">'
        +       '<b class="text-blue-800">자동 동기화 안내</b>'
        +       '<p class="mt-1">위 자동추출 결과를 수정하면 <b class="text-teal-700">아래 「구성성분 수동 입력」 테이블</b>에 <b>실시간으로 자동 반영</b>됩니다. 반대로 수동입력 테이블에서 수정한 내용도 자동추출 결과에 반영되어 항상 동일한 값이 유지됩니다.</p>'
        +     '</div>'
        +   '</div>'
        + '</div>';

    container.innerHTML = html;
    container.classList.remove('hidden');

    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = false;
        regBtn.classList.remove('opacity-50','cursor-not-allowed');
    }
}

/* =========================================================
   ⭐⭐⭐ 자동추출 결과 편집 → 즉시 수동입력 테이블도 동기화
   ========================================================= */
function updateCompItem(idx, field, value){
    const m = lastParsedMaterials[0];
    if(!m || !m.composition[idx]) return;
    m.composition[idx][field] = value;
    m.composition[idx].confidence='수동 수정';
    if(field==='cas' && typeof isValidCasChecksum==='function') m.composition[idx].casChecksumValid=value&&value!=='-'?isValidCasChecksum(String(value).replace(/\s+/g,'')):null;
    if(field === 'content'){
        const nums = value.match(/\d+(?:\.\d+)?/g);
        if(nums && nums.length === 2){
            m.composition[idx].contentNum = (parseFloat(nums[0])+parseFloat(nums[1]))/2;
        } else if(nums && nums.length === 1){
            m.composition[idx].contentNum = parseFloat(nums[0]);
        } else {
            m.composition[idx].contentNum = 0;
        }
        // 합계도 즉시 재계산
        m.compositionSum = Math.round(m.composition.reduce((s,it)=>s+(it.contentNum||0),0)*10)/10;
        m.compositionValid = (m.compositionSum >= 95 && m.compositionSum <= 105);
    }
    // ⭐ 수동입력 테이블 즉시 반영
    syncParsedToManual();
}

function removeCompItem(idx){
    const m = lastParsedMaterials[0];
    if(!m) return;
    m.composition.splice(idx, 1);
    // 합계 재계산
    m.compositionSum = Math.round(m.composition.reduce((s,it)=>s+(it.contentNum||0),0)*10)/10;
    m.compositionValid = (m.compositionSum >= 95 && m.compositionSum <= 105);
    renderCompositionReview(m);
    syncParsedToManual();
}

function addCompItem(){
    const m = lastParsedMaterials[0];
    if(!m) return;
    if(!m.composition) m.composition = [];
    m.composition.push({name:'', cas:'', content:'', contentNum:0, confidence:'수동 입력', casChecksumValid:null});
    renderCompositionReview(m);
    syncParsedToManual();
}

function recalcCompSum(){
    const m = lastParsedMaterials[0];
    if(!m) return;
    m.compositionSum = Math.round(m.composition.reduce((s,it)=>s+(it.contentNum||0),0)*10)/10;
    m.compositionValid = (m.compositionSum >= 95 && m.compositionSum <= 105);
    renderCompositionReview(m);
    syncParsedToManual();
    showToast('합계 재계산: ' + m.compositionSum + '%');
}

function toggleCompReviewed(checked){
    const m = lastParsedMaterials[0];
    if(m) m.compositionReviewed = checked;
    const regBtn = document.getElementById('btnRegister');
    if(regBtn){
        regBtn.disabled = false;
        regBtn.classList.remove('opacity-50','cursor-not-allowed');
    }
    if(checked) showToast(' 검수 완료');
}

function showRawSection3(){
    const m = lastParsedMaterials[0];
    if(!m || !m.compositionRawText){
        alert('원본 텍스트가 없습니다.');
        return;
    }
    const w = window.open('', '_blank', 'width=800,height=600');
    const safeText = m.compositionRawText.split('<').join('&lt;');
    w.document.write(''
        + '<html><head><title>MSDS 3번 항목 원본</title>'
        + '<meta charset="UTF-8">'
        + '<style>'
        +   'body{font-family:\'Malgun Gothic\',sans-serif;padding:20px;white-space:pre-wrap;line-height:1.7;font-size:13px;color:#333}'
        +   'h3{color:#0d9488;border-bottom:2px solid #0d9488;padding-bottom:8px}'
        +   '.box{background:#f8fafc;border-left:4px solid #0d9488;padding:15px;border-radius:4px;margin-top:10px}'
        + '</style>'
        + '</head><body>'
        + '<h3> MSDS 3번 「구성성분의 명칭 및 함유량」 원본 텍스트</h3>'
        + '<p style="color:#64748b;font-size:11px"> 원본파일: ' + (m.sourceFile||'') + '</p>'
        + '<div class="box">' + safeText + '</div>'
        + '</body></html>');
}
