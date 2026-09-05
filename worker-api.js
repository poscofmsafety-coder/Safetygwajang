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
    if (url.pathname === '/api/ai') return aiGateway(request, env);
    if (url.pathname === '/api/ai/inspection') return aiInspection(request, env);
    if (url.pathname === '/api/msds/lookup') return msdsLookup(request, env);
    if (url.pathname === '/api/msds/search') return msdsSearch(request, env);
    if (url.pathname === '/api/news') return safetyNews(request, env, ctx);
    if (url.pathname === '/api/jobs') return safetyJobs(request, env, ctx);
    if (url.pathname === '/api/laws/search') return lawsSearch(request, env);
    if (url.pathname === '/api/safety-law/search') return safetyLawSearch(request, env);
    return secureResponse(await env.ASSETS.fetch(request));
  }
};

function applySecurityHeaders(headers){
  const h=new Headers(headers||{});
  h.set('X-Content-Type-Options','nosniff');
  h.set('X-Frame-Options','SAMEORIGIN');
  h.set('Referrer-Policy','strict-origin-when-cross-origin');
  h.set('Permissions-Policy','camera=(self), microphone=(), geolocation=(), display-capture=()');
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
  // 공개 화면에서는 연동 방식/Secret 이름을 노출하지 않습니다.
  return json({
    ok:true,
    configured:Boolean(koshaGeneralKey(env)),
    msdsConfigured:Boolean(koshaMsdsKey(env)),
    lawSearchConfigured:Boolean(koshaLawKey(env)),
    aiConfigured:Boolean(env&&env.GROQ_API_KEY)
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
  if(!key)return json({ok:false,error:'외부 자료 조회 기능을 준비 중입니다.'},503);
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
  if(!key)return json({ok:false,error:'외부 자료 조회 기능을 준비 중입니다.'},503);
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
async function googleNewsQuery(query,timeoutMs=9000){
  const u=`https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ko&gl=KR&ceid=KR:ko`;
  const r=await fetchTimed(u,{redirect:'follow',headers:{
    'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36',
    'accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    'accept-language':'ko-KR,ko;q=0.9,en;q=0.5'
  },cf:{cacheTtl:300,cacheEverything:true}},timeoutMs);
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
async function googleTopSafetyNews(timeoutMs=9000){
  const u=new URL('https://news.google.com/rss');u.searchParams.set('hl','ko');u.searchParams.set('gl','KR');u.searchParams.set('ceid','KR:ko');
  const r=await fetchTimed(u,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152 Safari/537.36','Accept':'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8'},cf:{cacheTtl:300,cacheEverything:true}},timeoutMs);
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
  const r=await fetchTimed(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:300,cacheEverything:true}},8000);
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
  const r=await fetchTimed(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:300,cacheEverything:true}},8000);
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
function newsJson(data,status=200){
  return new Response(JSON.stringify(data),{status,headers:applySecurityHeaders({
    'content-type':'application/json; charset=utf-8',
    'cache-control':'public, max-age=20, s-maxage=600, stale-while-revalidate=86400'
  })});
}
function newsProviders(env){
  return [
    googleSafetyNews().then(async x=>{let its=x.items||[],errs=x.errors||[];if(!its.length){try{its=await googleTopSafetyNews()}catch(e){errs.push(e.message)}}return{name:'google',items:its,errors:errs}}).catch(async e=>{try{return{name:'google',items:await googleTopSafetyNews(),errors:[e.message]}}catch(e2){return{name:'google',items:[],errors:[e.message,e2.message]}}}),
    kakaoKey(env)?kakaoSafetyNews(env).then(x=>({name:'kakao',items:x,errors:[]})).catch(e=>({name:'kakao',items:[],errors:[e.message]})):Promise.resolve({name:'kakao',items:[],errors:[]}),
    koshaGeneralKey(env)?koshaFatalityNews(env).then(x=>({name:'kosha-fatality',items:x,errors:[]})).catch(e=>({name:'kosha-fatality',items:[],errors:[e.message]})):Promise.resolve({name:'kosha-fatality',items:[],errors:[]}),
    koshaGeneralKey(env)?koshaDisasterNews(env).then(x=>({name:'kosha-disaster',items:x,errors:[]})).catch(e=>({name:'kosha-disaster',items:[],errors:[e.message]})):Promise.resolve({name:'kosha-disaster',items:[],errors:[]}),
    ((env.NAVER_API_HUB_CLIENT_ID&&env.NAVER_API_HUB_CLIENT_SECRET)||(env.NAVER_CLIENT_ID&&env.NAVER_CLIENT_SECRET))?naverSafetyNews(env).then(x=>({name:'naver',items:x,errors:[]})).catch(e=>({name:'naver',items:[],errors:[e.message]})):Promise.resolve({name:'naver',items:[],errors:[]})
  ];
}
function newsPayload(results,env){
  const errors=[];let items=[];(results||[]).forEach(x=>{items.push(...(x?.items||[]));errors.push(...(x?.errors||[]))});
  items=dedupeNews(items).sort((a,b)=>Date.parse(b.pubDate||0)-Date.parse(a.pubDate||0)).slice(0,18);
  return {ok:items.length>0,items,updatedAt:new Date().toISOString(),providers:{google:true,kakao:Boolean(kakaoKey(env)),kosha:Boolean(koshaGeneralKey(env)),naver:Boolean(env.NAVER_CLIENT_ID||env.NAVER_API_HUB_CLIENT_ID)},errors};
}
async function refreshNewsCache(cache,key,env){
  try{const results=await Promise.all(newsProviders(env));const payload=newsPayload(results,env);if(payload.items.length)await cache.put(key,newsJson(payload).clone());return payload}catch(e){return null}
}
async function quickSafetyNews(env){
  // 첫 방문은 검색 RSS와 종합 RSS를 동시에 요청해 먼저 성공한 쪽으로 즉시 화면을 채웁니다.
  const q='산업안전 OR 중대재해 OR 산업재해 OR 안전보건 when:14d';
  const candidates=[
    googleNewsQuery(q,4200).then(items=>items.length?items:Promise.reject(new Error('검색 RSS 결과 없음'))),
    googleTopSafetyNews(4200).then(items=>items.length?items:Promise.reject(new Error('종합 RSS 결과 없음')))
  ];
  try{const items=(await Promise.any(candidates)).slice(0,18);return newsPayload([{name:'google-fast',items,errors:[]}],env)}catch(e){return newsPayload([{name:'google',items:[],errors:['뉴스 빠른 연결 실패']}],env)}
}
async function safetyNews(request,env,ctx){
  const url=new URL(request.url),force=url.searchParams.get('refresh')==='1';
  let cache=null,key=null,cached=null;
  try{cache=caches.default;key=new Request(new URL('/api/news?cache=v4',request.url).toString(),{method:'GET'});cached=await cache.match(key)}catch(e){}
  if(cached){
    // 캐시가 있으면 즉시 반환합니다. 5분 이상 지난 캐시 또는 수동 새로고침일 때만 뒤에서 갱신합니다.
    const data=await cached.clone().json().catch(()=>null);
    const age=data?.updatedAt?Math.max(0,Date.now()-Date.parse(data.updatedAt)):Infinity;
    if(ctx&&cache&&key&&(force||age>5*60*1000))ctx.waitUntil(refreshNewsCache(cache,key,env));
    if(force&&data)return newsJson({...data,refreshing:true});
    return cached;
  }
  const quick=await quickSafetyNews(env);
  if(ctx&&cache&&key)ctx.waitUntil(refreshNewsCache(cache,key,env));
  else if(cache&&key&&quick.items.length)try{await cache.put(key,newsJson(quick).clone())}catch(e){}
  return newsJson(quick,quick.items.length?200:502);
}


// 최신 안전관리자 채용공고
// 공개 구인 목록은 빠르게 보여주고, 원문 채용사이트 링크 확인은 백그라운드에서 보강합니다.
const SAFETY_JOB_LIST='https://isafety.co.kr/is/job';
const SAFETY_JOB_UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0 Safari/537.36';
function jobText(v){
  return cleanHtmlText(String(v||'')
    .replace(/&nbsp;|&#160;/gi,' ')
    .replace(/&#x([0-9a-f]+);/gi,(_,h)=>{try{return String.fromCodePoint(parseInt(h,16))}catch(e){return ' '}})
    .replace(/&#(\d+);/g,(_,n)=>{try{return String.fromCodePoint(parseInt(n,10))}catch(e){return ' '}}));
}
function jobAbsoluteUrl(href,base=SAFETY_JOB_LIST){try{return new URL(decodeXml(String(href||'').replace(/&amp;/g,'&')),base).href}catch(e){return ''}}
function jobIdFromUrl(href){const u=String(href||'');let m=u.match(/[?&]wr_id=(\d+)/);if(m)return m[1];m=u.match(/\/is\/job\/(\d+)/);return m?m[1]:''}
function safetyJobTitle(v){return /(안전|EHS|HSE|SHE|산업안전|안전보건|보건안전|환경안전|안전환경|PSM|소방안전|위험물)/i.test(String(v||''))}
function parseSafetyJobRows(html){
  const out=[];
  const rows=String(html||'').match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)||[];
  for(const row of rows){
    const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
    if(cells.length<5)continue;
    const a=cells[0].match(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i);
    if(!a)continue;
    const href=jobAbsoluteUrl(a[1]); const jobId=jobIdFromUrl(href); if(!jobId)continue;
    const position=jobText(a[2]); if(!position||!safetyJobTitle(position))continue;
    const first=jobText(cells[0]);
    let tail=first; if(position&&tail.startsWith(position))tail=tail.slice(position.length).trim();
    const parts=tail.split('·').map(x=>x.trim()).filter(Boolean);
    out.push({
      id:jobId,position,category:parts[0]||'',registered:parts[1]||'',views:parts[2]||'',
      company:jobText(cells[1]),career:jobText(cells[2]).replace(/\.$/,''),location:jobText(cells[3]),deadline:jobText(cells[4]),
      detailUrl:href,link:href,provider:'채용정보'
    });
  }
  return out;
}
function normalizedJobCompany(v){return jobText(v).toLowerCase().replace(/\(주\)|㈜|주식회사|유한회사|\(유\)/g,'').replace(/[^0-9a-z가-힣]/g,'')}
function normalizedJobTitle(v){return jobText(v).toLowerCase().replace(/[\[\](){}<>·ㆍ,_/\\|-]/g,' ').replace(/\b(신입|경력|정규직|계약직|채용|모집|담당자|담당)\b/g,' ').replace(/안전관리자/g,'안전관리').replace(/\s+/g,'').trim()}
function normalizedJobLocation(v){return jobText(v).toLowerCase().replace(/[^0-9a-z가-힣]/g,'')}
function jobFingerprint(x){return [normalizedJobCompany(x.company),normalizedJobTitle(x.position),normalizedJobLocation(x.location)].join('|')}
function dedupeSafetyJobs(items){
  const seen=new Set(),out=[];
  for(const x of items||[]){const k=jobFingerprint(x);if(!x?.company||!x?.position||!k.replace(/\|/g,'')||seen.has(k))continue;seen.add(k);out.push(x)}
  return out;
}

// 한 곳의 게시판만 의존하면 해당 사이트 장애/HTML 변경 시 시드 공고만 남습니다.
// 사람인 검색결과도 직접 읽어 두 번째 실시간 원천으로 사용합니다.
const SARAMIN_SAFETY_SEARCHES=[
  'https://www.saramin.co.kr/zf_user/search?searchType=search&searchword='+encodeURIComponent('안전관리'),
  'https://www.saramin.co.kr/zf_user/search?searchType=search&searchword='+encodeURIComponent('EHS')
];
function htmlAttr(attrs,name){const m=String(attrs||'').match(new RegExp('(?:^|\\s)'+name+'=["\\\']([^"\\\']+)["\\\']','i'));return m?decodeXml(m[1]):''}
function saraminBlockText(block,re){const m=String(block||'').match(re);return m?jobText(m[1]):''}
function parseSaraminSafetyJobs(html){
  const out=[];
  // item_recruit 단위가 가장 안정적이지만 클래스명이 바뀌어도 rec_idx 링크 주변을 보조 탐색합니다.
  const source=String(html||'');
  let blocks=source.split(/<div\b[^>]*class=["'][^"']*\bitem_recruit\b[^"']*["'][^>]*>/i).slice(1);
  if(!blocks.length){
    const hits=[...source.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter(m=>/rec_idx=\d+/i.test(htmlAttr(m[1],'href')));
    blocks=hits.map(m=>source.slice(Math.max(0,m.index-3500),Math.min(source.length,m.index+6500)));
  }
  for(const raw of blocks.slice(0,100)){
    const b=raw.slice(0,14000);let title='',link='';
    for(const m of b.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
      const href=htmlAttr(m[1],'href');if(!/rec_idx=\d+/i.test(href))continue;
      const text=jobText(m[2]);if(text.length<3)continue;
      if(safetyJobTitle(text)){title=text;link=jobAbsoluteUrl(href,'https://www.saramin.co.kr/');break}
      if(!title){title=text;link=jobAbsoluteUrl(href,'https://www.saramin.co.kr/')}
    }
    if(!title||!link||!safetyJobTitle(title))continue;
    let company=saraminBlockText(b,/class=["'][^"']*(?:corp_name|company_name)[^"']*["'][^>]*>([\s\S]*?)<\/(?:strong|div|span)>/i);
    if(!company)company=saraminBlockText(b,/data-(?:company_nm|corp-name)=["']([^"']+)["']/i);
    if(!company){
      const cm=b.match(/<a\b[^>]*href=["'][^"']*(?:company-info|company\/)[^"']*["'][^>]*>([\s\S]*?)<\/a>/i);company=cm?jobText(cm[1]):'';
    }
    if(!company)continue;
    const cond=saraminBlockText(b,/class=["'][^"']*job_condition[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
    const spans=cond?[...String(b.match(/class=["'][^"']*job_condition[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||'').matchAll(/<span\b[^>]*>([\s\S]*?)<\/span>/gi)].map(x=>jobText(x[1])).filter(Boolean):[];
    const location=spans[0]||'';const career=spans[1]||'';
    let deadline=saraminBlockText(b,/class=["'][^"']*(?:date|job_date)[^"']*["'][^>]*>([\s\S]*?)<\/(?:span|div)>/i);
    deadline=deadline.replace(/^(?:마감일\s*)?/,'').trim();
    const reg=(jobText(b).match(/(?:등록일|수정일)\s*(\d{2,4}[./-]\d{1,2}[./-]\d{1,2})/)||[])[1]||'';
    const id=(link.match(/[?&]rec_idx=(\d+)/)||[])[1]||'';
    out.push({id:id?'saramin-'+id:'saramin-'+out.length,company,position:title,category:'안전·EHS',career,location,deadline,registered:reg,detailUrl:link,link,provider:'사람인',portalDirect:true});
  }
  return dedupeSafetyJobs(out);
}
async function fetchSaraminSafetyJobs(timeoutMs=4800){
  const settled=await Promise.allSettled(SARAMIN_SAFETY_SEARCHES.map(url=>fetchTimed(url,{redirect:'follow',headers:{'user-agent':SAFETY_JOB_UA,'accept':'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9'},cf:{cacheTtl:180,cacheEverything:true}},timeoutMs).then(async r=>{if(!r.ok)throw new Error('사람인 '+r.status);return parseSaraminSafetyJobs(await r.text())})));
  let items=[];for(const r of settled)if(r.status==='fulfilled')items.push(...r.value);
  items=dedupeSafetyJobs(items);if(!items.length)throw new Error('사람인 검색결과를 읽지 못했습니다.');return items;
}

// 화면이 비어 보이지 않도록 최근 확인한 대기업 공고를 최소 시드로 유지합니다.
// 마감일이 지나면 자동 제외되며, 실시간 수집 결과와 합쳐서 중복 제거합니다.
const CURATED_MAJOR_JOBS=[
  {
    id:'curated-hyundai-jeonju-20260914',company:'현대자동차',
    position:'현대자동차 9월 신입 채용 (안전관리·전주공장)',category:'안전관리',career:'신입',
    location:'전북 완주군',deadline:'2026-09-14',registered:'2026-09-01',
    link:'https://m.saramin.co.kr/job-search/view?rec_idx=54825196&t_category=top1000&t_content=generic&tab=introduce',
    detailUrl:'https://m.saramin.co.kr/job-search/view?rec_idx=54825196&t_category=top1000&t_content=generic&tab=introduce',
    provider:'사람인',curated:true,expiresAt:'2026-09-14T17:00:00+09:00'
  },
  {
    id:'curated-doosan-ehs-20260921',company:'두산에너빌리티',
    position:'2026 두산그룹 신입사원 채용 - EHS/안전관리',category:'EHS·안전관리',career:'신입',
    location:'경기 성남 · 경남 창원',deadline:'2026-09-21',registered:'2026-09-01',
    link:'https://www.jobkorea.co.kr/Recruit/GI_Read/49909743?Oem_Code=C1&PageGbn=ST',
    detailUrl:'https://www.jobkorea.co.kr/Recruit/GI_Read/49909743?Oem_Code=C1&PageGbn=ST',
    provider:'잡코리아',curated:true,expiresAt:'2026-09-21T18:00:00+09:00'
  },
  {
    id:'curated-hdhyundai-samho-20260927',company:'HD현대삼호',
    position:'26년 하반기 신입사원 채용 (안전관리)',category:'안전관리',career:'신입',
    location:'전남 영암군',deadline:'2026-09-27',registered:'2026-09-01',
    link:'https://m.saramin.co.kr/job-search/view?rec_idx=54914131',
    detailUrl:'https://m.saramin.co.kr/job-search/view?rec_idx=54914131',
    provider:'사람인',curated:true,expiresAt:'2026-09-27T23:59:00+09:00'
  },
  {
    id:'curated-hyundai-ulsan-safety-20260914',company:'현대자동차',
    position:'현대자동차 9월 신입 채용 (안전/환경·울산공장)',category:'안전·환경',career:'신입',
    location:'울산',deadline:'2026-09-14',registered:'2026-09-01',
    link:'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=54824973',
    detailUrl:'https://www.saramin.co.kr/zf_user/jobs/view?rec_idx=54824973',
    provider:'사람인',curated:true,expiresAt:'2026-09-14T17:00:00+09:00'
  },
  {
    id:'curated-gscaltex-safety-20260915',company:'GS칼텍스',
    position:'2026년 하반기 신입사원 채용(안전)',category:'안전',career:'신입',
    location:'전남 여수시',deadline:'2026-09-15',registered:'2026-09-02',
    link:'https://m.saramin.co.kr/job-search/view?rec_idx=54927251',
    detailUrl:'https://m.saramin.co.kr/job-search/view?rec_idx=54927251',
    provider:'사람인',curated:true,expiresAt:'2026-09-15T23:59:00+09:00'
  },
  {
    id:'curated-kyeryong-safety-20260910',company:'계룡건설산업',
    position:'2026년 9월 안전직, 보건관리자 모집공고',category:'안전·보건',career:'신입·경력',
    location:'대전 외 전국 현장',deadline:'2026-09-10',registered:'2026-09-03',
    link:'https://lab.incruit.com/jobs/2609030004669',
    detailUrl:'https://lab.incruit.com/jobs/2609030004669',
    provider:'인크루트',curated:true,expiresAt:'2026-09-10T23:59:00+09:00'
  },
  {
    id:'curated-doosanfuel-safety-20260910',company:'두산퓨얼셀',
    position:'기술 계약직 채용_안전/환경(군산)',category:'안전·환경',career:'신입·경력',
    location:'전북 군산시',deadline:'2026-09-10',registered:'2026-09-02',
    link:'https://lab.incruit.com/jobs/2609020000032',
    detailUrl:'https://lab.incruit.com/jobs/2609020000032',
    provider:'인크루트',curated:true,expiresAt:'2026-09-10T23:59:00+09:00'
  }
];
function activeCuratedMajorJobs(now=Date.now()){
  return CURATED_MAJOR_JOBS.filter(x=>!x.expiresAt||Date.parse(x.expiresAt)>=now).map(x=>({...x}));
}

// 너무 작은 업체가 화면을 채우지 않도록 대기업·중견기업·공공기관 계열을 우선합니다.
const MAJOR_EMPLOYER_RE=/(삼성|현대|기아|포스코|POSCO|SK|LG|롯데|한화|두산|CJ|GS|LS|DL|LX|효성|코오롱|금호|KT|네이버|NAVER|카카오|셀트리온|아모레|한솔|동국제강|세아|고려아연|풍산|OCI|한국타이어|넥센|HL만도|현대모비스|현대제철|현대건설|현대엔지니어링|삼성E&A|삼성물산|삼성SDI|삼성전기|삼성중공업|삼성바이오|에쓰오일|S-OIL|대한항공|아시아나|HMM|현대글로비스|HD현대|두산에너빌리티|LS ELECTRIC|LS전선|삼양|대상|SPC|오뚜기|농심|동원|하림|유한양행|종근당|한미약품|녹십자|대웅|코스맥스|한국콜마|성우하이텍|동진쎄미켐|솔브레인|DB하이텍|LX세미콘|한온시스템|대한전선|한국항공우주|KAI|LIG넥스원|현대로템|BGF|신세계|이마트|쿠팡|한진|대한유화|KCC|에코프로|금호석유|금호타이어|롯데케미칼|롯데정밀화학|SKC|한화오션|한화에어로|한화시스템|한화솔루션|SK하이닉스|SK온|SK이노베이션|SK에코플랜트|SK실트론|LG화학|LG에너지솔루션|LG전자|LG디스플레이|LG이노텍|포스코퓨처엠|CJ대한통운|계룡건설|SGC|반도건설|HL디앤아이한라|현대프라퍼티|킨텍스|국도화학|HYBE|두산퓨얼셀|GS칼텍스)/i;
const PUBLIC_EMPLOYER_RE=/(한국.*(?:공사|공단|연구원|발전)|공항공사|도로공사|철도공사|수자원공사|가스공사|전력공사|한국수력원자력|한전|남동발전|남부발전|동서발전|서부발전|중부발전)/i;
function preferredJobEmployer(item){
  if(item?.curated)return true;
  const c=jobText(item?.company);
  return MAJOR_EMPLOYER_RE.test(c)||PUBLIC_EMPLOYER_RE.test(c);
}
function jobDateScore(v){
  const s=jobText(v);let m=s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);if(m)return Number(m[1])*10000+Number(m[2])*100+Number(m[3]);
  m=s.match(/^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$/);if(m)return (2000+Number(m[1]))*10000+Number(m[2])*100+Number(m[3]);
  m=s.match(/(\d{1,2})[-./](\d{1,2})/);if(m)return new Date().getFullYear()*10000+Number(m[1])*100+Number(m[2]);
  const ago=s.match(/(\d+)\s*(분|시간|일)\s*전/);if(ago){const n=Number(ago[1]);return 99999999-(ago[2]==='분'?n:ago[2]==='시간'?n*60:n*1440)}
  return 0;
}
function mergePreferredSafetyJobs(items){
  const dynamic=(items||[]).filter(preferredJobEmployer);
  const merged=dedupeSafetyJobs(dynamic.concat(activeCuratedMajorJobs()));
  merged.sort((a,b)=>{
    const d=jobDateScore(b.registered)-jobDateScore(a.registered);if(d)return d;
    if(Boolean(a.curated)!==Boolean(b.curated))return a.curated?-1:1;
    return jobDateScore(a.deadline)-jobDateScore(b.deadline);
  });
  return merged;
}
function jobProviderFromUrl(raw){
  let host='';try{host=new URL(raw).hostname.toLowerCase()}catch(e){}
  if(/saramin\.co\.kr$/.test(host)||host.includes('.saramin.co.kr'))return '사람인';
  if(/jobkorea\.co\.kr$/.test(host)||host.includes('.jobkorea.co.kr'))return '잡코리아';
  if(/incruit\.com$/.test(host)||host.includes('.incruit.com'))return '인크루트';
  if(/jasoseol\.com$/.test(host)||host.includes('.jasoseol.com'))return '자소설닷컴';
  if(/catch\.co\.kr$/.test(host)||host.includes('.catch.co.kr'))return '캐치';
  if(/wanted\.co\.kr$/.test(host)||host.includes('.wanted.co.kr'))return '원티드';
  if(/linkareer\.com$/.test(host)||host.includes('.linkareer.com'))return '링커리어';
  if(/jobplanet\.co\.kr$/.test(host)||host.includes('.jobplanet.co.kr'))return '잡플래닛';
  if(/career\.co\.kr$/.test(host)||host.includes('.career.co.kr'))return '커리어';
  if(host&&host!=='isafety.co.kr'&&!host.endsWith('.isafety.co.kr'))return '기업 채용';
  return '채용정보';
}
function validJobExternal(raw){
  const u=jobAbsoluteUrl(raw);if(!/^https:\/\//i.test(u))return false;
  let host='';try{host=new URL(u).hostname.toLowerCase()}catch(e){return false}
  if(host==='isafety.co.kr'||host.endsWith('.isafety.co.kr'))return false;
  if(/facebook|twitter|x\.com|kakao|band\.us|pinterest|instagram|youtube/.test(host))return false;
  if(/\.(?:jpg|jpeg|png|gif|webp|pdf|hwp|docx?)(?:$|[?#])/i.test(u))return false;
  return true;
}
function extractJobOriginalLink(html){
  const candidates=[];const add=v=>{const u=jobAbsoluteUrl(v);if(validJobExternal(u)&&!candidates.includes(u))candidates.push(u)};
  for(const m of String(html||'').matchAll(/<(?:a|iframe)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi))add(m[1]);
  for(const m of String(html||'').matchAll(/https?:\/\/[^\s'"<>()\\]+/gi))add(m[0].replace(/[;,)>\]}]+$/,''));
  const preferred=['사람인','잡코리아','인크루트','자소설닷컴','캐치','원티드','링커리어','잡플래닛','커리어'];
  candidates.sort((a,b)=>{const ia=preferred.indexOf(jobProviderFromUrl(a)),ib=preferred.indexOf(jobProviderFromUrl(b));return (ia<0?99:ia)-(ib<0?99:ib)});
  return candidates[0]||'';
}
async function fetchSafetyJobPage(page=1,timeoutMs=4800){
  const url=page>1?`${SAFETY_JOB_LIST}/p${page}`:SAFETY_JOB_LIST;
  const r=await fetchTimed(url,{redirect:'follow',headers:{'user-agent':SAFETY_JOB_UA,'accept':'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9'},cf:{cacheTtl:300,cacheEverything:true}},timeoutMs);
  const text=await r.text();if(!r.ok)throw new Error(`채용 목록 ${r.status}`);const items=parseSafetyJobRows(text);if(!items.length)throw new Error('채용 목록을 읽지 못했습니다.');return items;
}
async function enrichSafetyJob(item){
  try{
    const r=await fetchTimed(item.detailUrl,{redirect:'follow',headers:{'user-agent':SAFETY_JOB_UA,'accept':'text/html,application/xhtml+xml','accept-language':'ko-KR,ko;q=0.9'},cf:{cacheTtl:600,cacheEverything:true}},3600);
    if(!r.ok)return item;const html=await r.text();const original=extractJobOriginalLink(html);
    return original?{...item,link:original,provider:jobProviderFromUrl(original)}:item;
  }catch(e){return item}
}
async function jobMapLimit(items,limit,fn){
  const out=new Array(items.length);let next=0;
  async function run(){while(true){const i=next++;if(i>=items.length)return;try{out[i]=await fn(items[i],i)}catch(e){out[i]=items[i]}}}
  await Promise.all(Array.from({length:Math.min(limit,items.length)},run));return out;
}
function safetyJobsPayload(items,extra={}){const merged=mergePreferredSafetyJobs(items||[]).slice(0,16);return {ok:Boolean(merged.length),items:merged,updatedAt:new Date().toISOString(),...extra}}
function safetyJobsJson(data,status=200){return new Response(JSON.stringify(data),{status,headers:applySecurityHeaders({'content-type':'application/json; charset=utf-8','cache-control':'public, max-age=20, s-maxage=300, stale-while-revalidate=21600'})})}
async function collectSafetyJobSources(quick=false){
  const defs=[
    ['isafety-1',fetchSafetyJobPage(1,quick?3000:5200)],
    ['saramin',fetchSaraminSafetyJobs(quick?3200:5000)]
  ];
  if(!quick)defs.splice(1,0,['isafety-2',fetchSafetyJobPage(2,5200)]);
  const settled=await Promise.allSettled(defs.map(x=>x[1]));
  let items=[];const sourceStats={},errors=[];
  settled.forEach((r,i)=>{const name=defs[i][0];if(r.status==='fulfilled'){sourceStats[name]=r.value.length;items.push(...r.value)}else{sourceStats[name]=0;errors.push(name+': '+String(r.reason?.message||r.reason||'failed'))}});
  return {items:dedupeSafetyJobs(items),sourceStats,errors};
}
async function buildEnrichedSafetyJobs(){
  const collected=await collectSafetyJobSources(false);
  let items=collected.items.filter(preferredJobEmployer).slice(0,28);
  // 직접 사람인에서 가져온 공고는 이미 원문 URL이므로, 중계 게시판 공고만 원문 링크를 보강합니다.
  const enriched=items.length?await jobMapLimit(items,4,x=>x.portalDirect?Promise.resolve(x):enrichSafetyJob(x)):[];
  const liveCount=enriched.length;
  return safetyJobsPayload(enriched,{source:liveCount?'live+curated':'curated',liveCount,sourceStats:collected.sourceStats,sourceErrors:collected.errors});
}
async function refreshSafetyJobsCache(cache,key){
  try{const payload=await buildEnrichedSafetyJobs();if(payload.items.length&&cache&&key)await cache.put(key,safetyJobsJson(payload).clone());return payload}catch(e){return null}
}
async function quickSafetyJobs(){
  const collected=await collectSafetyJobSources(true);
  const items=collected.items.filter(preferredJobEmployer).slice(0,18);
  return safetyJobsPayload(items,{refreshing:true,source:items.length?'quick+curated':'seed',liveCount:items.length,sourceStats:collected.sourceStats,sourceErrors:collected.errors});
}
async function safetyJobs(request,env,ctx){
  const url=new URL(request.url),force=url.searchParams.get('refresh')==='1';let cache=null,key=null,cached=null;
  try{cache=caches.default;key=new Request(new URL('/api/jobs?cache=v3',request.url).toString(),{method:'GET'});cached=await cache.match(key)}catch(e){}
  if(cached){
    const data=await cached.clone().json().catch(()=>null);const age=data?.updatedAt?Math.max(0,Date.now()-Date.parse(data.updatedAt)):Infinity;
    if(force){
      // 수동 새로고침은 기존 3개 캐시만 즉시 돌려주지 않고 실제 수집을 한 번 기다립니다.
      const fresh=await refreshSafetyJobsCache(cache,key);
      if(fresh?.items?.length)return safetyJobsJson({...fresh,refreshing:false});
      return safetyJobsJson({...data,refreshing:true,refreshError:'실시간 수집 실패'});
    }
    const seedLike=!data?.items?.length||data?.source==='seed'||data?.source==='curated';
    if(ctx&&cache&&key&&(age>3*60*1000||(seedLike&&age>20*1000)))ctx.waitUntil(refreshSafetyJobsCache(cache,key));
    return cached;
  }

  // 첫 접속도 짧은 실시간 수집을 먼저 시도합니다. 실패할 때만 최근 확인 공고를 사용합니다.
  let first=null;try{first=await quickSafetyJobs()}catch(e){}
  const payload=first?.items?.length?first:safetyJobsPayload([], {refreshing:true,source:'seed',liveCount:0});
  if(cache&&key)try{await cache.put(key,safetyJobsJson(payload).clone())}catch(e){}
  if(ctx&&cache&&key)ctx.waitUntil(refreshSafetyJobsCache(cache,key));
  else if(cache&&key)refreshSafetyJobsCache(cache,key).catch(()=>{});
  return safetyJobsJson(payload,200);
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
function lawOfficialLink(item,query){
  const raw=String(item?.url||item?.link||'').trim();
  if(/^https?:\/\//i.test(raw))return raw;
  const cat=String(item?.category||'');
  if(cat==='6'||cat==='7')return 'https://smartsearch.kosha.or.kr/?searchValue='+encodeURIComponent(query||item?.title||'');
  return 'https://www.law.go.kr/lsSc.do?query='+encodeURIComponent(item?.title||query||'');
}
function normalizeMatchText(v){return cleanHtmlText(String(v||'')).replace(/\s+/g,' ').trim().toLowerCase();}
function lawMatchType(item,query){
  const q=normalizeMatchText(query); if(!q)return 'related';
  const title=normalizeMatchText(item?.title),content=normalizeMatchText(item?.content);
  if(title.includes(q))return 'title-phrase';
  if(content.includes(q))return 'content-phrase';
  const terms=q.split(/\s+/).filter(Boolean);
  if(terms.length&&terms.every(t=>title.includes(t)))return 'title-all-terms';
  if(terms.length&&terms.every(t=>content.includes(t)))return 'content-all-terms';
  return 'related';
}
function normalizeLawItem(x,query=''){
  const cat=pickAny(x,['category','categoryCode','categoryCd','cate','cateCd','category_no']);
  const title=cleanHtmlText(pickAny(x,['title','subject','lawName','lawNm','guideName','guideNm','docTitle','filename','fileName','name']));
  const content=cleanHtmlText(pickAny(x,['highlight_content','highlightContent','contents','content','summary','articleContent','sectionContent','detail','description','lawContent','guideContent','text']));
  const rawUrl=pickAny(x,['url','link','href','fileUrl','filepath','filePath','downloadUrl']);
  const category=String(cat||'');
  const categoryName=LAW_CATEGORY[category]||cleanHtmlText(pickAny(x,['categoryName','cateName']))||'안전보건 자료';
  const item={category,categoryName,title:title||content.slice(0,80)||'검색 결과',content:content||title,url:rawUrl,raw:x};
  item.link=lawOfficialLink(item,query);
  item.source=(category==='6'||category==='7')?'한국산업안전보건공단':'국가법령정보센터';
  item.matchType=lawMatchType(item,query);
  return item;
}
async function lawsSearch(request,env){
  const key=koshaLawKey(env);
  if(!key)return json({ok:false,error:'검색 기능을 준비 중입니다.',items:[]},503);
  const u0=new URL(request.url),q=(u0.searchParams.get('q')||u0.searchParams.get('searchValue')||'').trim();const limit=Math.max(1,Math.min(100,Number(u0.searchParams.get('limit'))||100));
  if(!q)return json({ok:false,error:'검색어를 입력하세요.',items:[]},400);
  const u=new URL(KOSHA_SMART_SEARCH);u.searchParams.set('serviceKey',normalizeServiceKey(key));u.searchParams.set('searchValue',q);u.searchParams.set('pageNo','1');u.searchParams.set('numOfRows',String(limit));u.searchParams.set('category','0');u.searchParams.set('dataType','JSON');
  try{
    const r=await fetch(u,{headers:{Accept:'application/json,text/plain,*/*'},cf:{cacheTtl:300,cacheEverything:true}});const text=await r.text();if(!r.ok)throw new Error(`KOSHA Smart Search HTTP ${r.status}`);
    if(/SERVICE_ACCESS_DENIED|PERMISSION_DENIED|SERVICE_KEY_IS_NOT_REGISTERED|SERVICE_KEY_IS_NULL|APPLICATION_ERROR|LIMITED_NUMBER_OF_SERVICE_REQUESTS_EXCEEDS/i.test(text))throw new Error(cleanHtmlText(text).slice(0,220)+' · 공공데이터포털 안전보건법령 스마트검색(15123696) 활용신청과 Cloudflare Secret을 확인하세요.');let data;try{data=JSON.parse(text)}catch(e){throw new Error('KOSHA Smart Search JSON 응답을 해석하지 못했습니다: '+cleanHtmlText(text).slice(0,140))}
    const resultCode=data?.response?.header?.resultCode||data?.header?.resultCode; if(resultCode&&!['00','0'].includes(String(resultCode)))throw new Error((data?.response?.header?.resultMsg||data?.header?.resultMsg||`KOSHA resultCode ${resultCode}`)+' · 안전보건법령 스마트검색(15123696) 활용신청 상태를 확인하세요.');
    const items=flattenSearchItems(data).map(x=>normalizeLawItem(x,q)).filter(x=>x.title||x.content);
    return json({ok:true,query:q,total:items.length,items,updatedAt:new Date().toISOString(),searchedAtLabel:new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})});
  }catch(e){console.error('law-search',e);return json({ok:false,error:'검색 연결이 지연되고 있습니다. 잠시 후 다시 시도해 주세요.',items:[]},502)}
}

async function safetyLawSearch(request,env){
  const legacy=await lawsSearch(request,env);
  let data;
  try{data=await legacy.clone().json()}catch(e){return legacy}
  if(!legacy.ok||!data?.ok)return legacy;
  const items=Array.isArray(data.items)?data.items:[];
  const law=items.filter(x=>!['6','7'].includes(String(x.category)));
  const guide=items.filter(x=>String(x.category)==='7');
  const media=items.filter(x=>String(x.category)==='6');
  return json({
    ok:true,query:data.query,total:items.length,law,guide,media,
    searchedAt:data.updatedAt,
    searchedAtLabel:data.searchedAtLabel||new Date().toLocaleTimeString('ko-KR',{timeZone:'Asia/Seoul',hour:'2-digit',minute:'2-digit'})
  });
}


/* =========================================================
   AI gateway — Cloudflare Secret의 GROQ_API_KEY를 서버에서만 사용
   ========================================================= */
function sameOriginRequest(request){
  try{
    const origin=request.headers.get('Origin');
    if(!origin)return true;
    return origin===new URL(request.url).origin;
  }catch(e){return false}
}
function totalMessageChars(messages){
  let n=0;
  for(const m of messages||[]){
    if(typeof m?.content==='string')n+=m.content.length;
    else if(Array.isArray(m?.content))for(const part of m.content){if(typeof part?.text==='string')n+=part.text.length}
  }
  return n;
}
function genericAiError(status=502){return json({ok:false,error:'AI 처리 중 연결이 지연되었습니다. 잠시 후 다시 시도해 주세요.'},status)}
const KOREAN_OUTPUT_GUARD='[최우선 언어 규칙] 사용자에게 보이는 자연어는 반드시 자연스러운 한국어로 작성합니다. 한자·중국어·일본어·러시아어·아랍어·태국어·베트남어식 확장문자를 섞지 않습니다. 영어는 회사명, 제품명, 법정 약어, CCTV·MSDS·AI 같은 통용 약어와 URL에만 허용합니다. 한자어도 한글로 풀어 씁니다. 뜻이 어색한 직역문이나 깨진 문자를 만들지 않습니다.';
const FORBIDDEN_SCRIPT_RE=/[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0400-\u052f\u0600-\u06ff\u0e00-\u0e7f\u00c0-\u02af]/u;
const FORBIDDEN_SCRIPT_RE_GLOBAL=/[\u3040-\u30ff\u31f0-\u31ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0400-\u052f\u0600-\u06ff\u0e00-\u0e7f\u00c0-\u02af]+/gu;
function hasForbiddenScript(v){return FORBIDDEN_SCRIPT_RE.test(String(v||''))}
function scrubForbiddenScripts(v){return String(v||'').replace(FORBIDDEN_SCRIPT_RE_GLOBAL,' ').replace(/[ \t]{2,}/g,' ').replace(/\s+([,.!?。])/g,'$1').trim()}
function guardKoreanMessages(messages){
  const out=(messages||[]).map(m=>({...m}));
  const i=out.findIndex(m=>m?.role==='system'&&typeof m.content==='string');
  if(i>=0)out[i]={...out[i],content:KOREAN_OUTPUT_GUARD+'\n\n'+out[i].content};
  else out.unshift({role:'system',content:KOREAN_OUTPUT_GUARD});
  return out;
}
async function rewriteKoreanText(text,env,maxTokens=5000){
  const original=String(text||'').trim();if(!original||!env?.GROQ_API_KEY)return '';
  const payload={model:String(env.GROQ_TEXT_MODEL||'openai/gpt-oss-120b'),temperature:0.05,max_completion_tokens:Math.max(800,Math.min(6000,maxTokens)),messages:[
    {role:'system',content:KOREAN_OUTPUT_GUARD+' 원문의 의미·사실·숫자·마크다운 구조는 변경하거나 추가하지 말고 언어 표기와 어색한 문장만 바로잡습니다.'},
    {role:'user',content:'다음 내용을 자연스러운 한국어로 다시 쓰세요. 한자나 다른 문자권 글자가 한 글자도 남지 않게 하세요.\n\n'+original}
  ]};
  try{const r=await fetchTimed('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+env.GROQ_API_KEY},body:JSON.stringify(payload)},22000);if(!r.ok)return '';const j=await r.json();return String(j?.choices?.[0]?.message?.content||'').trim()}catch(e){return ''}
}
async function aiGateway(request,env){
  const ready=Boolean(env&&env.GROQ_API_KEY);
  if(request.method==='GET')return json({ok:true,ready});
  if(request.method!=='POST')return json({ok:false,error:'허용되지 않은 요청입니다.'},405);
  if(!sameOriginRequest(request))return json({ok:false,error:'허용되지 않은 요청입니다.'},403);
  if(!ready)return json({ok:false,error:'AI 기능을 준비 중입니다.'},503);
  let body;
  try{body=await request.json()}catch(e){return json({ok:false,error:'요청 형식을 확인해 주세요.'},400)}
  const messages=Array.isArray(body?.messages)?body.messages:[];
  if(!messages.length||messages.length>8||totalMessageChars(messages)>36000)return json({ok:false,error:'입력 내용이 너무 깁니다. 핵심 내용만 줄여서 다시 시도해 주세요.'},413);
  const requested=String(body?.model||'');
  const research=requested==='groq/compound';
  const model=research?'groq/compound':String(env.GROQ_TEXT_MODEL||'openai/gpt-oss-120b');
  const payload={
    model,
    messages:guardKoreanMessages(messages),
    temperature:Math.max(0,Math.min(1.2,Number(body?.temperature??0.55))),
    max_completion_tokens:Math.max(800,Math.min(8000,Number(body?.max_tokens||body?.max_completion_tokens||5000)))
  };
  if(research)payload.citation_options='enabled';
  try{
    const r=await fetchTimed('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+env.GROQ_API_KEY},
      body:JSON.stringify(payload)
    },55000);
    const text=await r.text();
    if(!r.ok)return genericAiError(r.status===429?429:502);
    let data;try{data=JSON.parse(text)}catch(e){return genericAiError()}
    const msg=data?.choices?.[0]?.message;let content=String(msg?.content||'');
    if(content&&hasForbiddenScript(content)){const fixed=await rewriteKoreanText(content,env,Math.min(6000,payload.max_completion_tokens));content=fixed&&!hasForbiddenScript(fixed)?fixed:scrubForbiddenScripts(fixed||content);if(msg)msg.content=content}
    return json(data,200);
  }catch(e){return genericAiError(e?.name==='AbortError'?504:502)}
}

function safeInspectionJson(text){
  const raw=String(text||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
  try{return JSON.parse(raw)}catch(e){
    const a=raw.indexOf('{'),b=raw.lastIndexOf('}');
    if(a>=0&&b>a){try{return JSON.parse(raw.slice(a,b+1))}catch(_){}}
  }
  return null;
}
function normalizeAccidentType(v){
  const allowed=['추락','넘어짐','끼임','맞음','부딪힘','깔림·뒤집힘','무너짐','감전','화재·폭발','질식·중독','절단·베임·찔림','교통·운반','화학물질 노출','기타'];
  const t=String(v||'').trim();
  return allowed.includes(t)?t:'기타';
}
function normalizeInspectionResult(x){
  x=x&&typeof x==='object'?x:{};
  const urgency=['즉시 조치','당일 개선','계획 개선','관찰 유지'].includes(x.urgency)?x.urgency:'계획 개선';
  const rv=x.riskAssessmentRecommended;const risk=typeof rv==='boolean'?rv:/^(?:true|1|o|yes)$/i.test(String(rv||'').trim());
  return {
    inspectionItem:String(x.inspectionItem||'').slice(0,700),
    observation:String(x.observation||'').slice(0,1200),
    improvement:String(x.improvement||'').slice(0,1400),
    accidentType:normalizeAccidentType(x.accidentType),
    hazardScenario:String(x.hazardScenario||'').slice(0,1200),
    riskAssessmentRecommended:risk,
    urgency,
    reason:String(x.reason||'').slice(0,900),
    confidence:Math.max(0,Math.min(100,Number(x.confidence)||0))
  };
}
function inspectionTextValues(x){return [x.inspectionItem,x.observation,x.improvement,x.hazardScenario,x.reason].map(v=>String(v||''))}
function inspectionHasForbidden(x){return inspectionTextValues(x).some(hasForbiddenScript)}
function normalizeKoreanSafetyPhrase(v){
  return String(v||'')
    .replace(/(?:지면|바닥|바닥면)?\s*이?\s*불평(?:하다|하여|해서|한)?/g,'바닥이 고르지 않아')
    .replace(/\s{2,}/g,' ').trim();
}
function safeKoreanField(value,fallback){
  const raw=normalizeKoreanSafetyPhrase(String(value||'').trim());
  if(!raw)return fallback;
  if(!hasForbiddenScript(raw))return raw;
  const cleaned=normalizeKoreanSafetyPhrase(scrubForbiddenScripts(raw));
  const hangul=(cleaned.match(/[가-힣]/g)||[]).length;
  return hangul>=8?cleaned:fallback;
}

function finalKoreanInspection(x){
  const y=normalizeInspectionResult(x);
  y.inspectionItem=safeKoreanField(y.inspectionItem,'사진에서 확인된 현장 상태를 기준으로 점검이 필요합니다.');
  y.observation=safeKoreanField(y.observation,'사진에서 확인 가능한 상태만 바탕으로 현장에서 다시 확인해 주세요.');
  y.improvement=safeKoreanField(y.improvement,'위험구역을 정리하고 필요한 안전조치를 현장 기준에 따라 시행해 주세요.');
  y.hazardScenario=safeKoreanField(y.hazardScenario,'현재 상태가 지속되면 작업 중 안전사고가 발생할 수 있습니다.');
  y.reason=safeKoreanField(y.reason,'사진 분석 결과를 참고해 현장 확인 후 위험성평가 연계 여부를 결정해 주세요.');
  return normalizeInspectionResult(y);
}
const INSPECTION_SCHEMA={
  type:'object',
  properties:{
    inspectionItem:{type:'string'},observation:{type:'string'},improvement:{type:'string'},
    accidentType:{type:'string',enum:['추락','넘어짐','끼임','맞음','부딪힘','깔림·뒤집힘','무너짐','감전','화재·폭발','질식·중독','절단·베임·찔림','교통·운반','화학물질 노출','기타']},
    hazardScenario:{type:'string'},riskAssessmentRecommended:{type:'boolean'},
    urgency:{type:'string',enum:['즉시 조치','당일 개선','계획 개선','관찰 유지']},reason:{type:'string'},confidence:{type:'number'}
  },
  required:['inspectionItem','observation','improvement','accidentType','hazardScenario','riskAssessmentRecommended','urgency','reason','confidence'],
  additionalProperties:false
};
function currentVisionModels(env){
  const supported=['qwen/qwen3.6-27b','qwen/qwen3.8-27b'];
  const configured=String(env?.GROQ_VISION_MODEL||'').trim();
  const ordered=[];
  if(supported.includes(configured))ordered.push(configured);
  for(const m of supported)if(!ordered.includes(m))ordered.push(m);
  return ordered;
}
async function callInspectionVision(model,prompt,image,env,timeoutMs){
  const useStrict=model==='qwen/qwen3.8-27b';
  const payload={
    model,
    messages:[{role:'user',content:[{type:'text',text:prompt},{type:'image_url',image_url:{url:image}}]}],
    temperature:0.15,
    max_completion_tokens:1200,
    stream:false,
    reasoning_effort:'none',
    response_format:useStrict?{type:'json_schema',json_schema:{name:'patrol_inspection',strict:true,schema:INSPECTION_SCHEMA}}:{type:'json_object'}
  };
  const r=await fetchTimed('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+env.GROQ_API_KEY},body:JSON.stringify(payload)
  },timeoutMs);
  const text=await r.text();
  if(!r.ok){const err=new Error('groq_http_'+r.status);err.status=r.status;throw err}
  let data;try{data=JSON.parse(text)}catch(e){throw new Error('groq_response_json')}
  const parsed=safeInspectionJson(data?.choices?.[0]?.message?.content);
  if(!parsed)throw new Error('inspection_json');
  return normalizeInspectionResult(parsed);
}
async function aiInspection(request,env){
  if(request.method!=='POST')return json({ok:false,error:'허용되지 않은 요청입니다.'},405);
  if(!sameOriginRequest(request))return json({ok:false,error:'허용되지 않은 요청입니다.'},403);
  if(!env?.GROQ_API_KEY)return json({ok:false,error:'AI 분석 기능을 준비 중입니다.'},503);
  let body;try{body=await request.json()}catch(e){return json({ok:false,error:'이미지 요청 형식을 확인해 주세요.'},400)}
  const image=String(body?.image||'');
  const context=String(body?.context||'').slice(0,2500);
  if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(image))return json({ok:false,error:'JPG, PNG 또는 WEBP 이미지를 선택해 주세요.'},400);
  if(image.length>9_000_000)return json({ok:false,error:'이미지가 너무 큽니다. 더 작은 사진으로 다시 시도해 주세요.'},413);
  const prompt=`당신은 대한민국 제조·건설 현장의 숙련된 안전관리자입니다. 사진에 실제로 보이는 사실만 근거로 순회점검일지 초안을 작성하세요. 보이지 않는 사람의 행동, 설비 상태, 수치, 보호구 착용 여부를 임의로 단정하지 마세요.\n\n[출력 언어]\n모든 설명은 자연스럽고 간결한 한국어 문장으로만 작성하세요. 한자·중국어·일본어 등 다른 문자권 글자를 섞지 마세요. 사진 속 외국어 문구를 그대로 옮기지 말고 필요한 의미만 한국어로 설명하세요. CCTV, MSDS, AI 같은 현장 통용 약어만 영문으로 허용합니다. 번역투 표현을 피하고 실제 순회점검일지에 바로 수정해 쓸 수 있는 문장으로 작성하세요.\n\n[현장 메모]\n${context||'없음'}\n\nJSON 객체만 반환하세요. inspectionItem은 사진에서 확인되는 점검사항 1~3문장, observation은 사진에서 직접 확인되는 근거, improvement는 현실적인 개선조치, accidentType은 지정된 재해유형 중 하나, hazardScenario는 재해 발생 시나리오 한 문장, riskAssessmentRecommended는 수시 위험성평가 연계 필요 여부, urgency는 조치 우선순위, reason은 연계 판단 근거, confidence는 0~100 숫자입니다.`;
  const models=currentVisionModels(env);
  let lastStatus=502;
  for(let i=0;i<models.length;i++){
    try{
      let result=await callInspectionVision(models[i],prompt,image,env,i===0?18000:12000);
      if(inspectionHasForbidden(result)){
        // 별도 번역/교정 API를 또 호출하지 않고 최신 비전 모델로 한 번만 재생성합니다.
        if(i+1<models.length)continue;
      }
      result=finalKoreanInspection(result);
      return json({ok:true,result},200);
    }catch(e){
      lastStatus=Number(e?.status)||((e?.name==='AbortError')?504:502);
      continue;
    }
  }
  return json({ok:false,error:lastStatus===429?'AI 요청이 많습니다. 자동 재시도 후에도 연결되지 않았습니다. 잠시 후 다시 시도해 주세요.':'사진 분석을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'},lastStatus===429?429:502);
}
