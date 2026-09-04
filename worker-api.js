const KOSHA_BASE = 'https://apis.data.go.kr/B552468/msdschem';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return apiHealth(env);
    if (url.pathname === '/api/msds/lookup') return msdsLookup(request, env);
    if (url.pathname === '/api/msds/search') return msdsSearch(request, env);
    return env.ASSETS.fetch(request);
  }
};

function json(data, status=200){
  return new Response(JSON.stringify(data,null,2),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function apiHealth(env){
  const configured=Boolean(env.KOSHA_API_KEY);
  return json({ok:true,configured,message:configured?'KOSHA 공공데이터 인증키 설정됨':'Cloudflare Secret KOSHA_API_KEY가 아직 설정되지 않았습니다.'});
}
function decodeXml(s){return String(s||'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function stripTags(s){return decodeXml(String(s||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function parseItems(xml){
  const items=[]; const blocks=[...String(xml||'').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  for(const b of blocks){
    const obj={}; const re=/<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g; let m;
    while((m=re.exec(b[1]))){ if(!/<[A-Za-z]/.test(m[2])) obj[m[1]]=stripTags(m[2]); }
    items.push(obj);
  }
  if(items.length) return items;
  // Some detail endpoints return a flat body instead of item wrappers.
  const body=String(xml||'').match(/<body(?:\s[^>]*)?>([\s\S]*?)<\/body>/i)?.[1]||'';
  if(body){const obj={};const re=/<([A-Za-z0-9_:-]+)(?:\s[^>]*)?>([^<]*)<\/\1>/g;let m;while((m=re.exec(body)))obj[m[1]]=stripTags(m[2]);if(Object.keys(obj).length)items.push(obj);}
  return items;
}
function pick(obj, patterns){
  for(const [k,v] of Object.entries(obj||{})){ if(patterns.some(r=>r.test(k)) && String(v||'').trim()) return String(v).trim(); }
  return '';
}
function allValues(obj){return Object.entries(obj||{}).map(([k,v])=>`${k}: ${v}`).filter(x=>x.replace(/^[^:]+:\s*/, '').trim());}
function normalizeCas(cas){return String(cas||'').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,'').trim();}
function validateCas(cas){return /^\d{2,7}-\d{2}-\d$/.test(normalizeCas(cas));}
function normalizeServiceKey(key){
  const raw=String(key||'').trim();
  if(!raw.includes('%')) return raw;
  try{return decodeURIComponent(raw)}catch(e){return raw}
}
function makeKoshaUrl(path, key, params={}){
  const u=new URL(KOSHA_BASE+path);u.searchParams.set('serviceKey',normalizeServiceKey(key));for(const [k,v] of Object.entries(params))if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,String(v));return u;
}

async function koshaFetch(path,key,params){
  const r=await fetch(makeKoshaUrl(path,key,params),{headers:{accept:'application/xml,text/xml,*/*'}});
  const text=await r.text();
  if(!r.ok) throw new Error(`KOSHA API HTTP ${r.status}`);
  if(/SERVICE_KEY|APPLICATION_ERROR|ERROR/i.test(text)&&!/<item/i.test(text)){throw new Error(stripTags(text).slice(0,220)||'KOSHA API 오류');}
  return {text,items:parseItems(text)};
}
function triFromLines(lines,keyword){
  const ev=lines.filter(x=>x.includes(keyword));if(!ev.length)return{value:null,evidence:[]};let value=null;
  for(const line of ev){if(/해당\s*없|비대상|규제\s*없|없음|해당되지|적용\s*안/.test(line))value=false;else if(/해당|대상|규제|관리대상|특별관리/.test(line))value=true;}
  return {value,evidence:ev.slice(0,5)};
}
function cmrFromLines(lines,keyword){
  const ev=lines.filter(x=>x.includes(keyword));if(!ev.length)return{value:null,evidence:[]};let value=null;
  for(const line of ev){if(/해당\s*없|분류\s*되지|비대상|없음|자료\s*없/.test(line))value=false;else if(/(?:구분|category|cat\.?)[\s:.-]*(?:1A|1B|1\b)|\b1A\b|\b1B\b|해당|대상/i.test(line))value=true;}
  return {value,evidence:ev.slice(0,5)};
}
function parseLegal(detailOrItems){
  const rows=Array.isArray(detailOrItems)?detailOrItems:[detailOrItems||{}];
  const lines=rows.flatMap(allValues);const work=triFromLines(lines,'작업환경측정'),health=triFromLines(lines,'특수건강진단'),special=triFromLines(lines,'특별관리물질'),managed=triFromLines(lines,'관리대상유해물질'),carc=cmrFromLines(lines,'발암성'),mut=cmrFromLines(lines,'생식세포 변이원성'),repro=cmrFromLines(lines,'생식독성');
  const evidence=[...new Set([...work.evidence,...health.evidence,...special.evidence,...managed.evidence,...carc.evidence,...mut.evidence,...repro.evidence])];
  return{workEnvTarget:work.value,specialHealthTarget:health.value,specialManagement:special.value,managementTarget:managed.value,cmr:{carcinogenic:carc.value,mutagenic:mut.value,reprotoxic:repro.value},evidence,source:'KOSHA MSDS 15항'};
}
function findChemId(obj){
  const preferred=pick(obj,[/^chemId$/i,/^chem_id$/i,/chem.*id/i,/msds.*id/i]);if(preferred)return preferred;
  for(const [k,v] of Object.entries(obj||{})){if(/id|seq|no/i.test(k)&&!/cas|un|ke/i.test(k)&&/^\d+$/.test(String(v)))return String(v)}return '';
}
function findName(obj){return pick(obj,[/chem.*(name|nm)/i,/(kor|korean).*(name|nm)/i,/^name$/i,/물질명/i])||pick(obj,[/(eng|english).*(name|nm)/i]);}
function findCas(obj){
  const preferred=pick(obj,[/cas/i]);
  const m=normalizeCas(preferred).match(/\d{2,7}-\d{2}-\d/); if(m)return m[0];
  for(const v of Object.values(obj||{})){const mm=normalizeCas(v).match(/\d{2,7}-\d{2}-\d/);if(mm)return mm[0];}
  return '';
}
async function searchChem(key,query,searchCnd){
  return koshaFetch('/getChemList',key,{searchWrd:query,searchCnd,numOfRows:10,pageNo:1});
}
async function getDetail15(key,chemId){
  if(!chemId)return{items:[]};
  return koshaFetch('/getChemDetail15',key,{chemId});
}
async function msdsLookup(request,env){
  if(!env.KOSHA_API_KEY)return json({ok:false,error:'KOSHA_API_KEY secret not configured'},503);
  const url=new URL(request.url);const cas=normalizeCas(url.searchParams.get('cas')||'');if(!validateCas(cas))return json({ok:false,error:'올바른 CAS No. 형식이 아닙니다.'},400);
  try{
    const list=await searchChem(env.KOSHA_API_KEY,cas,1);
    const withCas=(list.items||[]).map(x=>({item:x,cas:findCas(x)}));
    const exact=withCas.find(x=>x.cas===cas)?.item;
    const anyReturnedCas=withCas.some(x=>x.cas);
    const item=exact || (!anyReturnedCas ? list.items[0] : null);
    if(!item)return json({ok:true,status:'NOT_FOUND',casNo:cas,matchedName:null,legal:{workEnvTarget:null,specialHealthTarget:null,specialManagement:null,managementTarget:null,cmr:{carcinogenic:null,mutagenic:null,reprotoxic:null},evidence:[],source:'KOSHA 자료 없음'}});
    const chemId=findChemId(item);let d15={items:[]};try{d15=await getDetail15(env.KOSHA_API_KEY,chemId)}catch(e){d15={items:[],warning:e.message};}
    const detail=d15.items[0]||{};const legal=parseLegal(d15.items);
    return json({ok:true,status:'FOUND',casNo:cas,matchedName:findName(item)||findName(detail)||null,chemId:chemId||null,legal,meta:{source:'한국산업안전보건공단 물질안전보건자료 조회 서비스',referenceOnly:true,matchedCas:findCas(item)||cas,detail15Loaded:Boolean(d15.items.length),detail15Rows:d15.items.length,detail15Warning:d15.warning||null}});
  }catch(e){return json({ok:false,error:e.message},502);}
}
async function msdsSearch(request,env){
  if(!env.KOSHA_API_KEY)return json({ok:false,error:'KOSHA_API_KEY secret not configured'},503);
  const u=new URL(request.url);const q=(u.searchParams.get('q')||'').trim();if(!q)return json({ok:false,error:'검색어가 필요합니다.'},400);
  const isCas=validateCas(q);try{const r=await searchChem(env.KOSHA_API_KEY,q,isCas?1:0);return json({ok:true,items:r.items.slice(0,20)});}catch(e){return json({ok:false,error:e.message},502);}
}
