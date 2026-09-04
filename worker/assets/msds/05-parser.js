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
    // PDF.js 좌표를 이용해 표의 열 경계를 최대한 보존합니다.
    // 단순 공백 결합은 MSDS 1항/3항 표에서 제품명·CAS·함유량 열이 섞이는 원인이 됩니다.
    const rows=[];
    for(const it of items||[]){
        const str=String(it.str||'').trim(); if(!str) continue;
        const x=Number(it.transform?.[4]||0), y=Number(it.transform?.[5]||0);
        const width=Math.max(0,Number(it.width||0));
        let row=rows.find(r=>Math.abs(r.y-y)<=2.8);
        if(!row){ row={y,items:[]}; rows.push(row); }
        row.items.push({x,width,str});
    }
    rows.sort((a,b)=>b.y-a.y);
    return rows.map(r=>{
        const cols=r.items.sort((a,b)=>a.x-b.x); let out='',prevEnd=null;
        for(const col of cols){
            if(!out){ out=col.str; prevEnd=col.x+col.width; continue; }
            const gap=prevEnd===null?0:col.x-prevEnd;
            // 큰 X 간격은 표의 다음 셀로 보고 명시적 구분자를 둡니다.
            out+=(gap>22?' | ':gap>7?'  ':' ')+col.str;
            prevEnd=Math.max(prevEnd||0,col.x+col.width);
        }
        return out;
    }).join('\n');
}


function preprocessOcrCanvas(sourceCanvas){
    // MSDS 표의 얇은 선과 회색 배경을 줄이고 작은 한글/CAS 숫자의 획을 살립니다.
    const canvas=document.createElement('canvas');
    canvas.width=sourceCanvas.width; canvas.height=sourceCanvas.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(sourceCanvas,0,0);
    try{
        const img=ctx.getImageData(0,0,canvas.width,canvas.height), d=img.data;
        for(let i=0;i<d.length;i+=4){
            const y=0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
            const gamma=255*Math.pow(y/255,0.92);
            const c=Math.max(0,Math.min(255,(gamma-128)*1.58+128));
            d[i]=d[i+1]=d[i+2]=c;
        }
        ctx.putImageData(img,0,0);
    }catch(e){}
    return canvas;
}

let __sgwOcrWorker=null;
async function getOcrWorker(){
    if(!window.Tesseract) return null;
    if(__sgwOcrWorker) return __sgwOcrWorker;
    try{
        __sgwOcrWorker=await Tesseract.createWorker('kor+eng',1,{logger:m=>{
            if(m?.status==='recognizing text'){
                const el=document.getElementById('progressPercent');
                if(el)el.textContent='OCR '+Math.round((m.progress||0)*100)+'%';
            }
        }});
        // 표가 많은 한국형 MSDS에 맞춰 한 개의 정렬된 텍스트 블록으로 우선 인식합니다.
        // 실패/저품질 시 extractPdfText에서 원문 PDF 텍스트와 교차 사용합니다.
        try{ await __sgwOcrWorker.setParameters({tessedit_pageseg_mode:'6',preserve_interword_spaces:'1',user_defined_dpi:'300'}); }catch(e){}
        return __sgwOcrWorker;
    }catch(e){ console.warn('[OCR worker] 생성 실패, 단일 인식으로 전환',e); return null; }
}
async function ocrCanvas(canvas){
    if(!window.Tesseract) return '';
    const prepared=preprocessOcrCanvas(canvas);
    try{
        const worker=await getOcrWorker();
        if(worker){
            const result=await worker.recognize(prepared,{rotateAuto:true,preserve_interword_spaces:'1'});
            return result?.data?.text||'';
        }
        const result=await Tesseract.recognize(prepared,'kor+eng',{rotateAuto:true,preserve_interword_spaces:'1'});
        return result?.data?.text||'';
    }catch(e){ console.warn('[OCR] 실패',e); return ''; }
}
async function waitForPdfJs(timeout=9000){
    if(window.pdfjsLib)return window.pdfjsLib;
    await new Promise(resolve=>{
        let done=false; const finish=()=>{if(done)return;done=true;resolve();};
        window.addEventListener('pdfjs-ready',finish,{once:true}); setTimeout(finish,timeout);
    });
    return window.pdfjsLib||null;
}
async function renderPdfPage(page,scale=2.65){
    const viewport=page.getViewport({scale});
    const canvas=document.createElement('canvas');
    canvas.width=Math.ceil(viewport.width); canvas.height=Math.ceil(viewport.height);
    await page.render({canvasContext:canvas.getContext('2d',{willReadFrequently:true}),viewport}).promise;
    return canvas;
}
function nativeMsdsQuality(text){
    const s1=extractMSDSSection(text,1), s2=extractMSDSSection(text,2), s3=extractMSDSSection(text,3), s15=extractMSDSSection(text,15);
    const productLabel=/(?:^|\n)\s*(?:[가-하]\s*[.)]\s*)?(?:제품명|제품의\s*명칭|화학제품명)\s*(?:[:：|]|\s{2,})/im.test(s1);
    const validCas=(s3.match(/\b\d{2,7}-\d{2}-\d\b/g)||[]).filter(isValidCasChecksum).length;
    const sections=[s1,s2,s3,s15].filter(x=>x&&x.length>30).length;
    const score=sections+(productLabel?2:0)+(validCas?2:0)+(s2.length>80?1:0);
    return {score,sections,productLabel,validCas,s1,s2,s3,s15};
}
function pageLooksCritical(text){
    const t=String(text||'');
    return /(?:^|\n)\s*(?:1|2|3|15)\s*[.)]?\s*(?:화학제품|유해성|구성성분|법적)/m.test(t)
        || /제품명|CAS\s*(?:No\.?|번호)|함유량|유해.?위험\s*문구|법적\s*규제현황/.test(t);
}
async function extractPdfText(file){
    const lib=await waitForPdfJs(); if(!lib)throw new Error('PDF 분석 모듈을 불러오지 못했습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요.');
    try{
        const buffer=await file.arrayBuffer();
        const pdf=await lib.getDocument({data:buffer,useSystemFonts:true,isEvalSupported:false,stopAtErrors:false}).promise;
        const maxPages=Math.min(pdf.numPages,60), pageNative=[];
        for(let i=1;i<=maxPages;i++){
            const page=await pdf.getPage(i);
            const content=await page.getTextContent({includeMarkedContent:true,disableNormalization:false});
            const txt=groupPdfItemsToLines(content.items);
            pageNative.push({page:i,text:txt,chars:txt.replace(/\s/g,'').length});
        }
        let text=normalizeMsdsText(pageNative.map(x=>`\n[PAGE ${x.page}]\n${x.text}`).join('\n'));
        const totalChars=pageNative.reduce((a,x)=>a+x.chars,0), quality=nativeMsdsQuality(text);

        // 텍스트 PDF라도 1항 제품명 또는 3항 CAS가 제대로 잡히지 않으면 OCR을 보조 실행합니다.
        if(totalChars>=1800 && quality.score>=7 && quality.productLabel && quality.validCas>=1) return text;

        // 스캔/혼합형 PDF: 중요 항목이 있는 페이지 + 앞/뒤 페이지 + 텍스트가 빈약한 페이지를 선택 OCR합니다.
        const candidate=new Set([1,2,3,4,5,maxPages,maxPages-1,maxPages-2,maxPages-3].filter(x=>x>=1&&x<=maxPages));
        pageNative.filter(x=>pageLooksCritical(x.text)).forEach(x=>candidate.add(x.page));
        pageNative.filter(x=>x.chars<160).slice(0,8).forEach(x=>candidate.add(x.page));
        const pages=[...candidate].sort((a,b)=>a-b).slice(0,16), ocr=[];
        for(const i of pages){
            const page=await pdf.getPage(i), canvas=await renderPdfPage(page,2.9), t=normalizeMsdsText(await ocrCanvas(canvas));
            if(t)ocr.push(`\n[OCR PAGE ${i}]\n${t}`);
        }
        if(ocr.length){
            // 품질이 떨어진 native section보다 OCR critical section이 먼저 탐색되도록 OCR을 앞에 둡니다.
            const hybrid=normalizeMsdsText(ocr.join('\n')+'\n'+text);
            const hq=nativeMsdsQuality(hybrid);
            if(hq.score>=quality.score) text=hybrid;
            else text=normalizeMsdsText(text+'\n'+ocr.join('\n'));
        }
        return text;
    }catch(e){ console.warn('[PDF] 텍스트 추출 실패',e); throw new Error('PDF 자동추출 실패: '+(e?.message||'알 수 없는 오류')); }
}
async function extractImageText(file){
    if(!window.Tesseract)throw new Error('OCR 모듈을 불러오지 못했습니다.');
    try{
        const bitmap=await createImageBitmap(file);
        const scale=Math.min(3.2,Math.max(1.25,3000/Math.max(bitmap.width,1)));
        const canvas=document.createElement('canvas'); canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale));
        canvas.getContext('2d',{willReadFrequently:true}).drawImage(bitmap,0,0,canvas.width,canvas.height); if(bitmap.close)bitmap.close();
        return normalizeMsdsText(await ocrCanvas(canvas));
    }catch(e){ console.warn('[이미지 OCR] 실패',e); throw new Error('이미지 OCR 실패: '+(e?.message||'알 수 없는 오류')); }
}
async function extractSourceText(file){
    const name=(file?.name||'').toLowerCase(), type=file?.type||'';
    if(type==='application/pdf'||name.endsWith('.pdf'))return extractPdfText(file);
    if(type.startsWith('image/')||/\.(png|jpe?g|webp|tif?f)$/i.test(name))return extractImageText(file);
    throw new Error('자동추출은 PDF 또는 이미지(PNG/JPG/WEBP/TIFF)를 지원합니다. HWP/DOCX는 PDF로 변환 후 업로드해 주세요.');
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

function lineAfterExactLabel(lines,index,labelRe){
    const line=lines[index]||'';
    const m=line.match(labelRe);
    if(!m)return '';
    const same=String(m[1]||'').replace(/^\s*[:：\-]?\s*/,'').trim();
    if(same && !/^(해당없음|없음)$/i.test(same))return same;
    const next=lines[index+1]||'';
    if(next&&!/^\s*(?:[가-하]|\d+)\s*[.)]/.test(next))return next.trim();
    return '';
}
function exactLabelValue(section,labels){
    const ls=linesOf(section);
    for(let i=0;i<ls.length;i++){
        const clean=ls[i].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').replace(/^[가-하]\s*[.)]\s*/,'');
        for(const label of labels){
            const re=new RegExp('^'+escReg(label)+'\\s*(?:[:：|]|\\s{2,})?\\s*(.*)$','i');
            const v=lineAfterExactLabel([clean,...ls.slice(i+1)],0,re); if(v)return v;
        }
    }
    return '';
}
function labelValueLoose(section,labels){
    const ls=linesOf(section);
    for(let i=0;i<ls.length;i++){
        let line=ls[i].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').replace(/^[가-하]\s*[.)]\s*/,'').trim();
        for(const label of labels){
            const re=new RegExp('^'+escReg(label)+'\\s*(?:[:：|]|\\s{2,})?\\s*(.*)$','i');
            const m=line.match(re); if(!m)continue;
            let v=String(m[1]||'').replace(/^\s*[|:：\-]\s*/,'').trim();
            if(!v || /^(해당없음|없음)$/i.test(v)){
                for(let j=i+1;j<Math.min(ls.length,i+4);j++){
                    const n=ls[j].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').trim();
                    if(!n)continue;
                    if(new RegExp('^(?:'+labels.map(escReg).join('|')+')\\s*(?:[:：|]|$)','i').test(n))break;
                    if(/^\s*(?:[가-하]|\d+)\s*[.)]/.test(n))break;
                    v=n.replace(/^\s*[|:：\-]\s*/,'').trim(); break;
                }
            }
            if(v)return v;
        }
    }
    return '';
}
function labelValueRegex(section,regex){
    const ls=linesOf(section);
    for(let i=0;i<ls.length;i++){
        const line=ls[i].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').replace(/^[가-하]\s*[.)]\s*/,'').trim();
        const m=line.match(regex); if(!m)continue;
        let v=String(m[1]||'').replace(/^\s*[|:：\-]\s*/,'').trim();
        if(v)return v.includes('|')?v.split('|')[0].trim():v;
        for(let j=i+1;j<Math.min(ls.length,i+4);j++){
            const n=ls[j].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').trim();
            if(!n)continue;
            if(/^\s*(?:[가-하]|\d+)\s*[.)]/.test(n))break;
            return n.includes('|')?n.split('|')[0].trim():n;
        }
    }
    return '';
}
function extractSupplierProfile(section){
    const ls=linesOf(section);
    const cleanLine=x=>String(x||'').replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').replace(/^[가-하]\s*[.)]\s*/,'').trim();
    const phoneRe=/(?:\+?82[-\s)]*)?(?:0\d{1,2}[-\s)]*)?\d{3,4}[-\s]\d{4}|\b\d{2,4}-\d{3,4}-\d{4}\b/;
    let start=ls.findIndex(x=>/(?:공급자|제조자|공급자\s*또는\s*제조자|공급자\s*및\s*제조자)\s*(?:정보|및\s*긴급전화번호)?/i.test(x));
    const scope=start>=0?ls.slice(Math.max(0,start),Math.min(ls.length,start+38)):ls;
    const block=scope.map(cleanLine).join('\n');
    let company=labelValueRegex(block,/^(?:회사명|공급자명|공급업체명|제조자명|제조업체명|공급자|제조자|회사)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?\s*(.*)$/i)
        ||labelValueLoose(block,['회사명','공급자명','공급업체명','제조자명','제조업체명','공급자','제조자','회사']);
    let phone=labelValueRegex(block,/^(?:긴급\s*(?:연락)?\s*전화번호|긴급전화|전화번호|연락처|전화)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?\s*(.*)$/i)
        ||labelValueLoose(block,['긴급전화번호','긴급 연락전화번호','긴급전화','전화번호','연락처','전화']);
    const address=labelValueRegex(block,/^(?:주소|소재지)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?\s*(.*)$/i)
        ||labelValueLoose(block,['주소','소재지']);
    if(phone){ const pm=phone.match(phoneRe); if(pm) phone=pm[0]; }
    if(!phone){ for(const line of scope){const pm=cleanLine(line).match(phoneRe);if(pm){phone=pm[0];break;}} }
    // '공급자 정보' 같은 제목 자체를 회사명으로 채택하지 않습니다.
    if(company && /^(공급자|제조자)(?:\s*(?:정보|및\s*긴급전화번호))?$/i.test(company)) company='';
    // 회사명 라벨이 없으면 공급자 블록에서 주소/전화/항목 제목이 아닌 첫 실질 문자열을 보조 후보로 사용합니다.
    if(!company && start>=0){
        for(const raw of scope.slice(1,9)){
            const line=cleanLine(raw).split('|')[0].trim();
            if(!line||phoneRe.test(line)||/^(주소|소재지|전화|연락처|긴급|담당|팩스|FAX|전자메일|이메일|e-?mail)/i.test(line))continue;
            if(/^(공급자|제조자).*정보$/i.test(line))continue;
            if(line.length>=2&&line.length<=90){company=line.replace(/^(?:회사명|공급자명|제조자명)\s*[:：]?\s*/,'');break;}
        }
    }
    const display=[company,phone?`연락처 ${phone}`:''].filter(Boolean).join(' · ')||'원본 MSDS 1항 공급자 정보 확인';
    return {company,phone,address,display};
}
function cleanProductValue(v){
    let x=String(v||'').replace(/^[\-|:：\s]+/,'').trim();
    x=x.split(/\s+(?:제품의\s*권고|권고\s*용도|사용상의\s*제한|공급자\s*정보|회사명|나\s*[.)])/)[0].trim();
    if(!x || /^(혼합물|단일물질|제품\s*형태\s*[:：]?)/.test(x))return '';
    // PDF 표에서 다음 셀이 붙은 경우 첫 셀까지만 사용합니다.
    if(x.includes('|')) x=x.split('|')[0].trim();
    return x;
}
function extractProductProfile(text,fileName){
    const s1=extractMSDSSection(text,1), fallback=String(fileName||'MSDS').replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();
    const ls=linesOf(s1);
    let rawName=labelValueLoose(s1,['제품명','제품의 명칭','화학제품명','제품 명칭'])
        ||labelValueRegex(s1,/^(?:제품명|제품의\s*명칭|화학제품명|제품\s*명칭)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?\s*(.*)$/i);
    // 한국형 MSDS 1항의 '가. 제품명' 표/줄바꿈 형태를 별도 복구합니다.
    if(!cleanProductValue(rawName)){
        for(let i=0;i<ls.length;i++){
            const line=ls[i].replace(/^[○●•▪■□◆◇▶▷※*\-\s]+/,'').trim();
            if(!/(?:^|\s)(?:가\s*[.)]\s*)?(?:제품명|제품의\s*명칭|화학제품명|제품\s*명칭)(?:\s|[:：|]|$)/i.test(line))continue;
            let same=line.replace(/^.*?(?:제품명|제품의\s*명칭|화학제품명|제품\s*명칭)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?/i,'').trim();
            same=cleanProductValue(same); if(same){rawName=same;break;}
            for(let j=i+1;j<Math.min(ls.length,i+5);j++){
                const n=cleanProductValue(ls[j]);
                if(!n)continue;
                if(/^(?:나|다|라)\s*[.)]|권고\s*용도|사용상의\s*제한|공급자|제조자/i.test(n))break;
                rawName=n;break;
            }
            if(cleanProductValue(rawName))break;
        }
    }
    let name=cleanProductValue(rawName);
    // 잘못 인식된 제품형태/혼합물 라벨은 파일명보다도 신뢰하지 않습니다.
    if(!name||/^(?:제품\s*형태\s*[:：]?\s*)?(?:혼합물|단일\s*물질|단일물질)$/i.test(name))name=fallback;
    const supplier=extractSupplierProfile(s1);
    const manufacturer=labelValueLoose(s1,['제조자명','제조자','제조업체명'])
        ||labelValueRegex(s1,/^(?:제조자명|제조업체명|제조자)\s*(?:\([^)]*\))?\s*(?:[:：|]|\s{2,})?\s*(.*)$/i)
        ||supplier.company||'원본 MSDS 1항 확인';
    return {name,manufacturer,supplier:supplier.display,supplierCompany:supplier.company,supplierPhone:supplier.phone,supplierAddress:supplier.address,raw:s1};
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
        .replace(/\(\s*\)/g,' ')
        .replace(/[□■☐☑✓✔]+/g,' ')
        .replace(/(CAS\s*(No\.?|번호)?|식별번호|함유량\s*\(?%?\)?|화학물질명|관용명|이명|구성성분.*)/gi,' ')
        .replace(/[|,:;]+/g,' ').replace(/\s+/g,' ').trim().replace(/^[\-·•\s]+|[\-·•\s]+$/g,'');
}
function normalizeCasOcrToken(token){
    const raw=String(token||'').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,'');
    const fixed=raw.replace(/[Oo]/g,'0').replace(/[Il|]/g,'1');
    return fixed;
}
function casHits(line){
    const re=/\b[0-9OoIl|]{2,7}\s*-\s*[0-9OoIl|]{2}\s*-\s*[0-9OoIl|]\b/g;
    return [...String(line||'').matchAll(re)].map(m=>({raw:m[0],index:m.index||0,cas:normalizeCasOcrToken(m[0])}));
}
function chemicalNameScore(s){
    const x=cleanChemicalName(s); if(!x)return -99;
    let score=Math.min(6,x.length/8);
    if(/[가-힣A-Za-z]/.test(x))score+=3;
    if(/^(구성성분|화학물질명|관용명|이명|CAS|함유량|영업비밀|번호|비고)$/i.test(x))score-=10;
    if(/^\d/.test(x))score-=5;
    if(/제품\s*형태|혼합물|단일물질/.test(x))score-=3;
    return score;
}
function chooseChemicalName(candidates){
    return candidates.map(v=>({v:cleanChemicalName(v),score:chemicalNameScore(v)})).filter(x=>x.v).sort((a,b)=>b.score-a.score)[0]?.v||'물질명 확인 필요';
}
function extractComposition(text){
    const section=extractMSDSSection(text,3);
    const result={items:[],sum:0,valid:false,warnings:[],rawText:section,sumStatus:'확인 필요',suspectCas:[]};
    if(!section){result.warnings.push('MSDS 3항을 찾지 못했습니다. 구성성분을 수동 확인하세요.');return result;}
    const ls=linesOf(section), seen=new Set();
    const metaCell=/^(?:화학물질명|구성성분|관용명|이명|CAS(?:\s*No\.?)?|식별번호|함유량|비고|영업비밀)$/i;
    for(let i=0;i<ls.length;i++){
        const line=ls[i], hits=casHits(line);
        for(const hit of hits){
            const cas=hit.cas; if(seen.has(cas))continue;
            const casOk=isValidCasChecksum(cas);
            if(!casOk){result.suspectCas.push({raw:hit.raw,normalized:cas,line:line.slice(0,240)});continue;}
            const cells=line.split(/\s*\|\s*/).map(x=>x.trim()).filter(Boolean);
            let name='', content=null;
            if(cells.length>=2){
                const casIdx=cells.findIndex(c=>casHits(c).some(h=>h.cas===cas));
                const nameCells=(casIdx>0?cells.slice(0,casIdx):cells).filter(c=>!metaCell.test(cleanChemicalName(c)));
                name=chooseChemicalName(nameCells.reverse());
                const contentCells=(casIdx>=0?cells.slice(casIdx+1):cells).concat(cells);
                for(const c of contentCells){content=parseContentRange(c);if(content)break;}
            }
            const before=line.slice(0,hit.index).trim(), after=line.slice(hit.index+hit.raw.length).trim();
            const window=[ls[i-2]||'',ls[i-1]||'',line,ls[i+1]||'',ls[i+2]||''];
            if(!content)content=parseContentRange(after)||parseContentRange(before);
            if(!content){for(const w of [ls[i+1],ls[i-1],ls[i+2],ls[i-2]]){if(!w||casHits(w).length)continue;content=parseContentRange(w);if(content)break;}}
            const stripMeta=v=>String(v||'').replace(new RegExp(escReg(hit.raw),'g'),' ').replace(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?\s*(?:[~\-]\s*\d{1,3}(?:\.\d+)?)?\s*%)/g,' ');
            if(!name||name==='물질명 확인 필요'){
                const candidates=[stripMeta(before),stripMeta(line),stripMeta(ls[i-1]),stripMeta(ls[i+1])];
                name=chooseChemicalName(candidates);
            }
            const confidence=content&&name!=='물질명 확인 필요'?'높음':(content||name!=='물질명 확인 필요')?'보통':'검토 필요';
            result.items.push({name,cas,casChecksumValid:true,confidence,content:content?.text||'-',contentNum:content?.num||0,contentMin:content?.min??null,contentMax:content?.max??null,contentRange:!!content?.range,sourceWindow:window.join(' | ').slice(0,700)});
            seen.add(cas);
        }
    }
    if(result.items.length===0){
        for(const line of ls){
            const content=parseContentRange(line);if(!content)continue;
            const name=chooseChemicalName([line.replace(/([<>≤≥]?\s*\d{1,3}(?:\.\d+)?\s*(?:[~\-]\s*\d{1,3}(?:\.\d+)?)?\s*%)/g,' ')]);
            if(name==='물질명 확인 필요')continue;
            result.items.push({name,cas:'-',casChecksumValid:null,confidence:'검토 필요',content:content.text,contentNum:content.num,contentMin:content.min,contentMax:content.max,contentRange:!!content.range,needsCas:true});
        }
    }
    result.sum=Math.round(result.items.reduce((a,c)=>a+(c.contentNum||0),0)*10)/10;
    result.valid=result.items.length>0;
    if(!result.items.length)result.warnings.push('구성성분을 자동 인식하지 못했습니다. 스캔 품질을 확인하거나 수동 입력하세요.');
    if(result.suspectCas.length)result.warnings.push(`${result.suspectCas.length}개 CAS 후보가 체크디지트 검증을 통과하지 못해 자동등록에서 제외되었습니다. 원본 3항에서 수동 확인하세요.`);
    const missingCas=result.items.filter(x=>x.cas==='-').length;if(missingCas)result.warnings.push(`${missingCas}개 성분의 CAS No.를 인식하지 못했습니다. 원본 3항에서 보완하세요.`);
    const missing=result.items.filter(x=>x.content==='-').length;if(missing)result.warnings.push(`${missing}개 성분의 함유량을 인식하지 못했습니다. MSDS 3항과 대조하세요.`);
    if(result.items.some(x=>x.contentRange))result.warnings.push('범위 함유량은 중간값으로 합계만 참고 표시하며 원본 범위값을 그대로 보존합니다.');
    result.sumStatus=(result.sum>=95&&result.sum<=105)?'단순 합계 약 100%':(result.items.length?'범위·영업비밀·누락 여부 확인':'확인 필요');
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
        else if(/(?:구분|category|cat\.?)[\s:.-]*(?:1A|1B|1)|\b1A\b|\b1B\b|해당|대상/i.test(line)) value=true;
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
    base.supplierCompany=product.supplierCompany||'';
    base.supplierPhone=product.supplierPhone||'';
    base.supplierAddress=product.supplierAddress||'';
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
    base.extractionEngine='PDF.js 6.3.289 + Tesseract.js 7.0.0 · 레이아웃 보존 + 중요항목 선택 OCR';
    base.rawMsdsText=sourceText.slice(0,90000);
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
