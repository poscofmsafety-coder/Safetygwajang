const KOSHA_BASE = 'https://apis.data.go.kr/B552468/msdschem';
function firstSecret(env,names){for(const n of names){if(env&&env[n])return {name:n,value:env[n]};}return {name:'',value:''};}
function koshaMsdsSecret(env){return firstSecret(env,['KOSHA_MSDS_API_KEY','KOSHA_API_KEY','PUBLIC_DATA_API_KEY','DATA_GO_KR_API_KEY','DATA_GO_KR_SERVICE_KEY','SERVICE_KEY','OPENAPI_SERVICE_KEY']);}
function koshaLawSecret(env){return firstSecret(env,['KOSHA_LAW_API_KEY','KOSHA_SMART_SEARCH_API_KEY','KOSHA_API_KEY','PUBLIC_DATA_API_KEY','DATA_GO_KR_API_KEY','DATA_GO_KR_SERVICE_KEY','SERVICE_KEY','OPENAPI_SERVICE_KEY']);}
function koshaMsdsKey(env){return koshaMsdsSecret(env).value;}
function koshaLawKey(env){return koshaLawSecret(env).value;}
function koshaGeneralKey(env){return firstSecret(env,['KOSHA_API_KEY','PUBLIC_DATA_API_KEY','DATA_GO_KR_API_KEY','DATA_GO_KR_SERVICE_KEY','KOSHA_MSDS_API_KEY','KOSHA_LAW_API_KEY','SERVICE_KEY','OPENAPI_SERVICE_KEY']).value;}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return apiHealth(env);
    if (url.pathname === '/api/msds/lookup') return msdsLookup(request, env);
    if (url.pathname === '/api/msds/search') return msdsSearch(request, env);
    if (url.pathname === '/api/news') return safetyNews(request, env);
    if (url.pathname === '/api/laws/search') return lawsSearch(request, env);
    return secureResponse(await env.ASSETS.fetch(request));
  }
};

function applySecurityHeaders(headers){
  const h=new Headers(headers||{});
  h.set('X-Content-Type-Options','nosniff');
  h.set('X-Frame-Options','SAMEORIGIN');
  h.set('Referrer-Policy','strict-origin-when-cross-origin');
  h.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  h.set('Cross-Origin-Opener-Policy','same-origin-allow-popups');
  h.set('Content-Security-Policy',"frame-ancestors 'self'; object-src 'none'; base-uri 'self'");
  h.set('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  return h;
}
function secureResponse(response){
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:applySecurityHeaders(response.headers)});
}
function json(data, status=200){
  return new Response(JSON.stringify(data,null,2),{status,headers:applySecurityHeaders({'content-type':'application/json; charset=utf-8','cache-control':'no-store'})});
}
function apiHealth(env){
  const msdsConfigured=Boolean(koshaMsdsKey(env));
  const lawConfigured=Boolean(koshaLawKey(env));
  const generalConfigured=Boolean(koshaGeneralKey(env));
  const kakaoConfigured=Boolean(env.KAKAO_REST_API_KEY||env.KAKAO_API_KEY||env.KAKAO_REST_KEY);
  const naverHubConfigured=Boolean(env.NAVER_API_HUB_CLIENT_ID&&env.NAVER_API_HUB_CLIENT_SECRET);
  const naverLegacyConfigured=Boolean(env.NAVER_CLIENT_ID&&env.NAVER_CLIENT_SECRET);
  return json({
    ok:true, configured:generalConfigured, koshaConfigured:generalConfigured,
    msdsConfigured, lawSearchConfigured:lawConfigured,
    msdsSecretName:koshaMsdsSecret(env).name||null,
    lawSecretName:koshaLawSecret(env).name||null,
    kakaoNewsConfigured:kakaoConfigured,
    naverNewsConfigured:naverHubConfigured||naverLegacyConfigured,
    message:generalConfigured?'KOSHA/공공데이터 인증키 Secret 감지됨':'Cloudflare Secret KOSHA_API_KEY(또는 서비스별 Key)가 아직 설정되지 않았습니다.'
  });
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
function normalizeLegalText(v){
  return String(v||'').replace(/[·ㆍ]/g,' ').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim();
}
function legalRows(rows){
  return (rows||[]).flatMap(obj=>Object.entries(obj||{}).map(([k,v])=>{
    const original=normalizeLegalText(`${k}: ${v}`);
    return {original,compact:original.replace(/\s+/g,''),lower:original.toLowerCase()};
  })).filter(x=>x.original.replace(/^[^:]+:\s*/, '').trim());
}
function triFromPatterns(rows,patterns){
  const ev=rows.filter(r=>patterns.some(p=>p.test(r.compact)));
  if(!ev.length)return{value:null,evidence:[]};
  let positive=false, negative=false;
  const neg=/(해당없음|해당되지않|비대상|대상아님|규제없음|적용안됨|자료없음|없음)/;
  const pos=/(대상물질|측정주기|진단주기|특별관리물질|관리대상유해물질|해당됨|해당|규제대상)/;
  for(const r of ev){
    if(neg.test(r.compact)) negative=true;
    if(pos.test(r.compact) && !neg.test(r.compact)) positive=true;
  }
  return {value:positive?true:(negative?false:null),evidence:ev.map(x=>x.original).slice(0,8)};
}
function cmrFromPatterns(rows,patterns){
  const ev=rows.filter(r=>patterns.some(p=>p.test(r.compact)));
  if(!ev.length)return{value:null,evidence:[]};
  let positive=false, negative=false;
  for(const r of ev){
    if(/(해당없음|분류되지않|비대상|자료없음|없음)/.test(r.compact))negative=true;
    if(/(구분|category|cat\.?|1A|1B|해당|대상)/i.test(r.compact)&&!/(해당없음|분류되지않|비대상|자료없음)/.test(r.compact))positive=true;
  }
  return {value:positive?true:(negative?false:null),evidence:ev.map(x=>x.original).slice(0,8)};
}
function parseLegal(detailOrItems){
  const rows=legalRows(Array.isArray(detailOrItems)?detailOrItems:[detailOrItems||{}]);
  const work=triFromPatterns(rows,[/작업환경측정(?:대상)?물질/,/작업환경측정대상/]);
  const health=triFromPatterns(rows,[/특수건강진단(?:대상)?물질/,/특수건강진단대상/]);
  const special=triFromPatterns(rows,[/특별관리물질/]);
  const managed=triFromPatterns(rows,[/관리대상유해물질/]);
  const carc=cmrFromPatterns(rows,[/발암성/]);
  const mut=cmrFromPatterns(rows,[/생식세포변이원성/,/변이원성/]);
  const repro=cmrFromPatterns(rows,[/생식독성/]);
  const evidence=[...new Set([...work.evidence,...health.evidence,...special.evidence,...managed.evidence,...carc.evidence,...mut.evidence,...repro.evidence])];
  return{
    workEnvTarget:work.value,specialHealthTarget:health.value,specialManagement:special.value,managementTarget:managed.value,
    cmr:{carcinogenic:carc.value,mutagenic:mut.value,reprotoxic:repro.value},evidence,source:'KOSHA MSDS 15항',
    parserVersion:'2026-09-04-cas-regulatory-v2'
  };
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
  const key=koshaMsdsKey(env);
  if(!key)return json({ok:false,error:'KOSHA_MSDS_API_KEY 또는 KOSHA_API_KEY Secret이 필요합니다.'},503);
  const url=new URL(request.url);const cas=normalizeCas(url.searchParams.get('cas')||'');if(!validateCas(cas))return json({ok:false,error:'올바른 CAS No. 형식이 아닙니다.'},400);
  try{
    const list=await searchChem(key,cas,1);
    const withCas=(list.items||[]).map(x=>({item:x,cas:findCas(x)}));
    const exact=withCas.find(x=>x.cas===cas)?.item;
    const anyReturnedCas=withCas.some(x=>x.cas);
    const item=exact || (!anyReturnedCas ? list.items[0] : null);
    if(!item)return json({ok:true,status:'NOT_FOUND',casNo:cas,matchedName:null,legal:{workEnvTarget:null,specialHealthTarget:null,specialManagement:null,managementTarget:null,cmr:{carcinogenic:null,mutagenic:null,reprotoxic:null},evidence:[],source:'KOSHA 자료 없음'}});
    const chemId=findChemId(item);let d15={items:[]};try{d15=await getDetail15(key,chemId)}catch(e){d15={items:[],warning:e.message};}
    const detail=d15.items[0]||{};const legal=parseLegal(d15.items);
    return json({ok:true,status:'FOUND',casNo:cas,matchedName:findName(item)||findName(detail)||null,chemId:chemId||null,legal,meta:{source:'한국산업안전보건공단 물질안전보건자료 조회 서비스',referenceOnly:true,matchedCas:findCas(item)||cas,detail15Loaded:Boolean(d15.items.length),detail15Rows:d15.items.length,detail15Warning:d15.warning||null}});
  }catch(e){return json({ok:false,error:e.message},502);}
}
async function msdsSearch(request,env){
  const key=koshaMsdsKey(env);
  if(!key)return json({ok:false,error:'KOSHA_MSDS_API_KEY 또는 KOSHA_API_KEY Secret이 필요합니다.'},503);
  const u=new URL(request.url);const q=(u.searchParams.get('q')||'').trim();if(!q)return json({ok:false,error:'검색어가 필요합니다.'},400);
  const isCas=validateCas(q);try{const r=await searchChem(key,q,isCas?1:0);return json({ok:true,items:r.items.slice(0,20)});}catch(e){return json({ok:false,error:e.message},502);}
}


function cleanHtmlText(s){
  return decodeXml(String(s||''))
    .replace(/<b>/gi,'').replace(/<\/b>/gi,'')
    .replace(/<[^>]+>/g,' ')
    .replace(/\s+/g,' ').trim();
}
function fetchTimed(url,options={},ms=9000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort('timeout'),ms);
  return fetch(url,{...options,signal:controller.signal}).finally(()=>clearTimeout(timer));
}
function rssRawTag(block, tag){
  const m=String(block||'').match(new RegExp('<'+tag+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/'+tag+'>','i'));
  return m?decodeXml(m[1]).trim():'';
}
function rssTextTag(block,tag){return cleanHtmlText(rssRawTag(block,tag));}
function parseGoogleNewsRss(xml){
  const out=[];
  for(const m of String(xml||'').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)){
    const b=m[1];
    let title=rssTextTag(b,'title');
    const link=rssRawTag(b,'link').replace(/<!\[CDATA\[|\]\]>/g,'').trim();
    const pubDate=rssTextTag(b,'pubDate');
    const source=rssTextTag(b,'source')||'Google 뉴스';
    if(title.includes(' - ')) title=title.replace(/\s+-\s+[^-]+$/,'').trim();
    if(title&&/^https?:\/\//i.test(link))out.push({title,link,pubDate,source,provider:'Google 뉴스'});
  }
  return out;
}
function canonicalNewsTitle(s){return cleanHtmlText(s).replace(/[\[\]()]/g,' ').replace(/\s+/g,' ').trim().toLowerCase();}
function dedupeNews(items){
  const seen=new Set(),out=[];
  for(const item of items){const key=canonicalNewsTitle(item.title);if(!key||seen.has(key))continue;seen.add(key);out.push(item)}
  return out;
}
function newsValidTitle(title){return /(안전|재해|산재|산업|중대|사고|보건|위험|화재|폭발|추락|끼임|질식|건설|고용노동부|산업안전보건)/.test(String(title||''));}
async function googleNewsQuery(query){
  const u=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r=await fetchTimed(u,{redirect:'follow',headers:{
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36',
    'accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    'accept-language':'ko-KR,ko;q=0.9,en;q=0.5'
  },cf:{cacheTtl:300,cacheEverything:true}},9000);
  const text=await r.text();
  if(!r.ok)throw new Error(`Google News RSS ${r.status}`);
  const items=parseGoogleNewsRss(text).filter(x=>newsValidTitle(x.title));
  if(!items.length && !/<item[\s>]/i.test(text)) throw new Error('Google News RSS 응답에 기사 항목이 없습니다.');
  return items;
}
async function googleSafetyNews(){
  const queries=['산업안전 중대재해 when:14d','산업재해 안전보건 when:14d','건설 안전사고 산업안전 when:14d'];
  const settled=await Promise.all(queries.map(q=>googleNewsQuery(q).catch(e=>({error:e.message,items:[]}))));
  let items=[],errors=[];
  for(const x of settled){if(Array.isArray(x))items.push(...x);else if(x?.error)errors.push(x.error)}
  return {items:dedupeNews(items).slice(0,25),errors};
}
async function googleTopSafetyNews(){
  const u=new URL('https://news.google.com/rss');u.searchParams.set('hl','ko');u.searchParams.set('gl','KR');u.searchParams.set('ceid','KR:ko');
  const r=await fetchTimed(u,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36','Accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'},cf:{cacheTtl:300,cacheEverything:true}},9000);
  const text=await r.text();if(!r.ok)throw new Error(`Google News top RSS ${r.status}`);
  return parseGoogleNewsRss(text).filter(x=>newsValidTitle(x.title)).slice(0,20);
}
function kakaoKey(env){return env.KAKAO_REST_API_KEY||env.KAKAO_API_KEY||env.KAKAO_REST_KEY||'';}
async function kakaoSafetyNews(env){
  const key=kakaoKey(env); if(!key)return [];
  const queries=['산업안전 중대재해','산업재해 안전보건'];
  const batches=await Promise.all(queries.map(async q=>{
    const u=new URL('https://dapi.kakao.com/v2/search/web');
    u.searchParams.set('query',q);u.searchParams.set('sort','recency');u.searchParams.set('size','30');
    const r=await fetchTimed(u,{headers:{Authorization:`KakaoAK ${key}`,Accept:'application/json'}},7000);
    const text=await r.text(); if(!r.ok)throw new Error(`Kakao Search API ${r.status}: ${cleanHtmlText(text).slice(0,120)}`);
    const j=JSON.parse(text); return (j.documents||[]).map(x=>{
      let source='다음·카카오';try{source=new URL(x.url).hostname.replace(/^www\./,'')}catch(e){}
      return {title:cleanHtmlText(x.title),link:x.url||'',pubDate:x.datetime||'',source,provider:'Kakao 검색'};
    }).filter(x=>x.title&&x.link&&newsValidTitle(x.title));
  }));
  return dedupeNews(batches.flat()).slice(0,25);
}
async function naverSafetyNews(env){
  const hub=env.NAVER_API_HUB_CLIENT_ID&&env.NAVER_API_HUB_CLIENT_SECRET;
  const legacy=env.NAVER_CLIENT_ID&&env.NAVER_CLIENT_SECRET;
  if(!hub&&!legacy)return [];
  const u=new URL(hub?'https://naverapihub.apigw.ntruss.com/search/v1/news':'https://openapi.naver.com/v1/search/news.json');
  u.searchParams.set('query','산업안전 중대재해 안전보건');u.searchParams.set('display','20');u.searchParams.set('sort','date');if(hub)u.searchParams.set('format','json');
  const headers=hub?{'X-NCP-APIGW-API-KEY-ID':env.NAVER_API_HUB_CLIENT_ID,'X-NCP-APIGW-API-KEY':env.NAVER_API_HUB_CLIENT_SECRET}:{'X-Naver-Client-Id':env.NAVER_CLIENT_ID,'X-Naver-Client-Secret':env.NAVER_CLIENT_SECRET};
  const r=await fetchTimed(u,{headers},7000);if(!r.ok)throw new Error(`Naver News API ${r.status}`);const j=await r.json();
  return (j.items||[]).map(x=>({title:cleanHtmlText(x.title),link:x.originallink||x.link,pubDate:x.pubDate||'',source:'네이버 뉴스',provider:'NAVER'})).filter(x=>newsValidTitle(x.title));
}
async function koshaFatalityNews(env){
  const key=koshaGeneralKey(env);if(!key)return [];
  const u=new URL('https://apis.data.go.kr/B552468/news_api02/getNews_api02');
  u.searchParams.set('serviceKey',normalizeServiceKey(key));
  u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows','30');u.searchParams.set('callApiId','1040');u.searchParams.set('dataType','JSON');
  const r=await fetchTimed(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:600,cacheEverything:true}},8000);
  const text=await r.text();if(!r.ok)throw new Error(`KOSHA 사고사망 API ${r.status}`);
  let j;try{j=JSON.parse(text)}catch(e){throw new Error('KOSHA 사고사망 JSON 응답 해석 실패')}
  const body=j?.response?.body||j?.body||j||{};let rows=body?.items?.item??body?.items??j?.items?.item??j?.items??[];if(!Array.isArray(rows))rows=rows&&typeof rows==='object'?[rows]:[];
  return rows.map(x=>{
    const title=cleanHtmlText(pickAny(x,['title','subject','sj','boardTitle','nttSj','accidentTitle','ttl']));
    const contents=cleanHtmlText(pickAny(x,['contents','content','summary','accidentOverview']));
    const date=pickAny(x,['regdate','regDate','date','writeDate','createdAt','frstRegisterPnttm','occurrenceDate']);
    const link=pickAny(x,['url','link','href','detailUrl'])||'https://portal.kosha.or.kr/';
    return {title:title||contents.slice(0,90),link,pubDate:date,source:'안전보건공단 사고사망',provider:'KOSHA'};
  }).filter(x=>x.title&&newsValidTitle(x.title));
}
async function koshaDisasterNews(env){
  const key=koshaGeneralKey(env);if(!key)return [];
  const u=new URL('https://apis.data.go.kr/B552468/disaster_api02/getdisaster_api02');
  u.searchParams.set('serviceKey',normalizeServiceKey(key));
  u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows','20');u.searchParams.set('callApiId','1060');
  const r=await fetchTimed(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:600,cacheEverything:true}},8000);
  const text=await r.text();if(!r.ok)throw new Error(`KOSHA 재해사례 API ${r.status}`);
  let j;try{j=JSON.parse(text)}catch(e){throw new Error('KOSHA 재해사례 JSON 응답 해석 실패')}
  const body=j?.response?.body||j?.body||j||{};let rows=body?.items?.item??body?.items??j?.items?.item??j?.items??[];if(!Array.isArray(rows))rows=rows&&typeof rows==='object'?[rows]:[];
  return rows.map(x=>{
    const title=cleanHtmlText(pickAny(x,['title','subject','sj','boardTitle','nttSj','accidentTitle','ttl']));
    const date=pickAny(x,['regdate','regDate','date','writeDate','createdAt','frstRegisterPnttm','occurrenceDate']);
    const link=pickAny(x,['url','link','href','detailUrl'])||'https://portal.kosha.or.kr/';
    return {title,link,pubDate:date,source:'안전보건공단 재해사례',provider:'KOSHA'};
  }).filter(x=>x.title&&newsValidTitle(x.title));
}
async function safetyNews(request,env){
  const errors=[];let items=[];
  const tasks=[
    googleSafetyNews().then(async x=>{let its=x.items||[],errs=x.errors||[];if(!its.length){try{its=await googleTopSafetyNews()}catch(e){errs.push(e.message)}}return{name:'google',items:its,errors:errs}}).catch(async e=>{try{return{name:'google',items:await googleTopSafetyNews(),errors:[e.message]}}catch(e2){return{name:'google',items:[],errors:[e.message,e2.message]}}}),
    kakaoKey(env)?kakaoSafetyNews(env).then(x=>({name:'kakao',items:x,errors:[]})).catch(e=>({name:'kakao',items:[],errors:[e.message]})):Promise.resolve({name:'kakao',items:[],errors:[]}),
    koshaGeneralKey(env)?koshaFatalityNews(env).then(x=>({name:'kosha-fatality',items:x,errors:[]})).catch(e=>({name:'kosha-fatality',items:[],errors:[e.message]})):Promise.resolve({name:'kosha-fatality',items:[],errors:[]}),
    koshaGeneralKey(env)?koshaDisasterNews(env).then(x=>({name:'kosha-disaster',items:x,errors:[]})).catch(e=>({name:'kosha-disaster',items:[],errors:[e.message]})):Promise.resolve({name:'kosha-disaster',items:[],errors:[]}),
    ((env.NAVER_API_HUB_CLIENT_ID&&env.NAVER_API_HUB_CLIENT_SECRET)||(env.NAVER_CLIENT_ID&&env.NAVER_CLIENT_SECRET))?naverSafetyNews(env).then(x=>({name:'naver',items:x,errors:[]})).catch(e=>({name:'naver',items:[],errors:[e.message]})):Promise.resolve({name:'naver',items:[],errors:[]})
  ];
  const results=await Promise.all(tasks);results.forEach(x=>{items.push(...(x.items||[]));errors.push(...(x.errors||[]))});
  items=dedupeNews(items).sort((a,b)=>Date.parse(b.pubDate||0)-Date.parse(a.pubDate||0)).slice(0,18);
  return json({ok:items.length>0,items,updatedAt:new Date().toISOString(),providers:{google:true,kakao:Boolean(kakaoKey(env)),kosha:Boolean(koshaGeneralKey(env)),naver:Boolean(env.NAVER_CLIENT_ID||env.NAVER_API_HUB_CLIENT_ID)},errors});
}

// KOSHA Smart Search proxy: 인증키를 브라우저에 노출하지 않습니다.
const KOSHA_SMART_SEARCH='https://apis.data.go.kr/B552468/srch/smartSearch';
const LAW_CATEGORY={
  '1':'산업안전보건법','2':'산업안전보건법 시행령','3':'산업안전보건법 시행규칙','4':'산업안전보건기준에 관한 규칙',
  '5':'고시·훈령·예규','6':'미디어 자료','7':'KOSHA GUIDE','8':'중대재해 처벌 등에 관한 법률','9':'중대재해 처벌 등에 관한 법률 시행령','11':'유해·위험작업 취업제한 규칙'
};
function pickAny(obj,keys){for(const k of keys){if(obj&&obj[k]!==undefined&&String(obj[k]).trim())return String(obj[k]).trim()}return ''}
function flattenSearchItems(data){
  const direct=data?.response?.body?.items?.item??data?.response?.body?.items??data?.body?.items?.item??data?.body?.items??data?.items?.item??data?.items;
  if(Array.isArray(direct))return direct;if(direct&&typeof direct==='object'&&!Array.isArray(direct))return [direct];
  const seen=new Set();
  function walk(v,depth=0){if(depth>6||v==null)return null;if(Array.isArray(v)&&v.length&&v.every(x=>x&&typeof x==='object'))return v;if(typeof v!=='object')return null;if(seen.has(v))return null;seen.add(v);for(const [k,x] of Object.entries(v)){if(/^(?:item|items|data|result|results|list)$/i.test(k)){const got=walk(x,depth+1);if(got?.length)return got}}for(const x of Object.values(v)){const got=walk(x,depth+1);if(got?.length)return got}return null}
  return walk(data)||[];
}
function normalizeLawItem(x){
  const cat=pickAny(x,['category','categoryCode','categoryCd','cate','cateCd','category_no']);
  const title=cleanHtmlText(pickAny(x,['title','subject','lawName','lawNm','guideName','guideNm','docTitle','filename','fileName','name']));
  const content=cleanHtmlText(pickAny(x,['highlight_content','highlightContent','contents','content','summary','articleContent','sectionContent','detail','description']));
  const rawUrl=pickAny(x,['url','link','href','fileUrl','filepath','filePath','downloadUrl']);
  return {category:String(cat||''),categoryName:LAW_CATEGORY[String(cat||'')]||cleanHtmlText(pickAny(x,['categoryName','cateName']))||'안전보건 자료',title:title||content.slice(0,80)||'검색 결과',content:content||title,url:rawUrl,raw:x};
}
async function lawsSearch(request,env){
  const key=koshaLawKey(env);
  if(!key)return json({ok:false,error:'KOSHA_LAW_API_KEY 또는 KOSHA_API_KEY Secret이 필요합니다.',items:[]},503);
  const u0=new URL(request.url),q=(u0.searchParams.get('q')||u0.searchParams.get('searchValue')||'').trim();const limit=Math.max(1,Math.min(100,Number(u0.searchParams.get('limit'))||100));
  if(!q)return json({ok:false,error:'검색어를 입력하세요.',items:[]},400);
  const u=new URL(KOSHA_SMART_SEARCH);u.searchParams.set('serviceKey',normalizeServiceKey(key));u.searchParams.set('searchValue',q);u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows',String(limit));u.searchParams.set('category','0');u.searchParams.set('dataType','JSON');
  try{
    const r=await fetch(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:300,cacheEverything:true}});const text=await r.text();if(!r.ok)throw new Error(`KOSHA Smart Search HTTP ${r.status}`);
    if(/SERVICE_ACCESS_DENIED|PERMISSION_DENIED|SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_KEY_IS_NULL|APPLICATION_ERROR|LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS/i.test(text))throw new Error(cleanHtmlText(text).slice(0,220)+' · 공공데이터포털 안전보건법령 스마트검색(15123696) 활용신청과 Cloudflare Secret을 확인하세요.');let data;try{data=JSON.parse(text)}catch(e){throw new Error('KOSHA Smart Search JSON 응답을 해석하지 못했습니다: '+cleanHtmlText(text).slice(0,140))}
    const resultCode=data?.response?.header?.resultCode||data?.header?.resultCode; if(resultCode&&String(resultCode)!=='00')throw new Error((data?.response?.header?.resultMsg||data?.header?.resultMsg||`KOSHA resultCode ${resultCode}`)+' · 안전보건법령 스마트검색(15123696) 활용신청 상태를 확인하세요.');
    const items=flattenSearchItems(data).map(normalizeLawItem).filter(x=>x.title||x.content);
    return json({ok:true,query:q,total:items.length,items,updatedAt:new Date().toISOString()});
  }catch(e){return json({ok:false,error:e.message,hint:'Secret 이름은 KOSHA_LAW_API_KEY 또는 KOSHA_API_KEY를 권장합니다. 공공데이터포털의 안전보건법령 스마트검색(15123696) 활용신청 승인 상태도 확인하세요.',secretName:koshaLawSecret(env).name||null,items:[]},502)}
}
