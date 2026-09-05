import worker from '../worker-api.js';
const okJson=obj=>new Response(JSON.stringify(obj),{status:200,headers:{'content-type':'application/json'}});
globalThis.fetch=async (input,opts={})=>{
  const u=String(input instanceof Request?input.url:input);
  if(u.includes('VilageFcstInfoService_2.0')) return okJson({response:{header:{resultCode:'00'},body:{items:{item:[{category:'T1H',obsrValue:'31.2'},{category:'REH',obsrValue:'72'},{category:'WSD',obsrValue:'8.5'},{category:'RN1',obsrValue:'0'}]}}}});
  if(u.includes('ArpltnInforInqireSvc')) return okJson({response:{header:{resultCode:'00'},body:{items:[{stationName:'중구',pm10Value:'30',pm25Value:'15',khaiValue:'60',khaiGrade:'2',dataTime:'2026-09-05 15:00'},{stationName:'강남구',pm10Value:'40',pm25Value:'20',khaiValue:'75',khaiGrade:'2',dataTime:'2026-09-05 15:00'}]}}});
  if(u.includes('iciskischem')) return okJson({response:{header:{resultCode:'00'},body:{items:{item:[{casNo:'7664-93-9',chemKo:'황산',chemEn:'Sulfuric acid',symptom:'자극 증상',inhale:'신선한 공기로 이동',skin:'오염 의복 제거'}]}}}});
  if(u.includes('forestPointV2')) return okJson({response:{header:{resultCode:'00'},body:{items:{item:[{analdate:'2026090515',dngr:'55'}]}}}});
  if(u.includes('FireInformationService')) return okJson({response:{header:{resultCode:'00'},body:{items:{item:[{fire_rcpt_cnt:'10',fire_prog_cnt:'4',dth_cnt:'0',injpsn_cnt:'1'}]}}}});
  if(u.includes('api.groq.com')) return okJson({choices:[{message:{content:JSON.stringify({summary:'테스트 초안',methodRecommendation:'three',hazards:[{task:'황산 이송',step:'배관 연결',type:'화학물질',scenario:'연결부 누출로 황산에 접촉할 수 있음',consequence:'피부 화상',currentControl:'현장 확인 필요',riskLevel:'high',riskReason:'부식성 물질 접촉 가능성',controlType:'공학적 대책',measure:'밀폐 연결구와 누출받이 설치 검토',afterLevel:'medium',afterReason:'대책 이행 후 재평가 필요',verificationItems:['실제 MSDS와 농도 확인'],confidence:82}]})}}]});
  return new Response('not mocked',{status:404});
};
const env={PUBLIC_DATA_API_KEY:'TEST',GROQ_API_KEY:'TEST',ASSETS:{fetch:async()=>new Response('asset',{status:200})}};
async function get(path){const r=await worker.fetch(new Request('https://example.test'+path),env,{waitUntil(){}});return [r.status,await r.json()];}
let [status,brief]=await get('/api/public/safety-brief?lat=37.5665&lon=126.9780&sido=서울');
if(status!==200||!brief.ok||!brief.data.weather||!brief.data.air||!brief.data.wildfire||!brief.data.fire) throw new Error('safety brief failed '+JSON.stringify({status,brief}));
let [cstatus,chem]=await get('/api/public/chemical?cas=7664-93-9');
if(cstatus!==200||chem.data?.nameKo!=='황산') throw new Error('chemical failed');
const aiReq=new Request('https://example.test/api/ai/kras',{method:'POST',headers:{'content-type':'application/json','Origin':'https://example.test'},body:JSON.stringify({task:'황산 이송',description:'황산 7664-93-9 저장탱크에서 배관으로 이송',equipment:'황산 7664-93-9, 펌프',method:'three',criteria:'상/중/하',publicContext:{summary:'기상 31.2℃ · 풍속 8.5m/s',sources:['weather']}})});
const air=await worker.fetch(aiReq,env,{waitUntil(){}});const aj=await air.json();
if(air.status!==200||!aj.ok||aj.publicContextUsed?.chemicalCount!==1||!aj.publicContextUsed?.sources?.includes('weather')) throw new Error('ai context failed '+JSON.stringify({status:air.status,aj}));
console.log(JSON.stringify({briefSources:Object.keys(brief.data),chemical:chem.data.nameKo,aiSources:aj.publicContextUsed.sources,aiHazards:aj.result.hazards.length},null,2));
