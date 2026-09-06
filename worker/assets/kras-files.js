(function(){
  'use strict';
  const DB_NAME='sgw_kras_files_v1',STORE='attachments',DB_VERSION=1,MAX_FILE=10*1024*1024,MAX_BATCH=30*1024*1024;
  let dbp=null;
  function open(){
    if(dbp)return dbp;
    dbp=new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(STORE)){const st=db.createObjectStore(STORE,{keyPath:'id'});st.createIndex('shareId','shareId',{unique:false});}};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||new Error('첨부파일 저장소를 열 수 없습니다.'));});
    return dbp;
  }
  function tx(mode,fn){return open().then(db=>new Promise((resolve,reject)=>{const t=db.transaction(STORE,mode),st=t.objectStore(STORE);let result;try{result=fn(st,t)}catch(e){reject(e);return;}t.oncomplete=()=>resolve(result);t.onerror=()=>reject(t.error||new Error('첨부파일 저장 중 오류가 발생했습니다.'));t.onabort=()=>reject(t.error||new Error('첨부파일 작업이 중단되었습니다.'));}));}
  function allowed(f){return !!f&&(f.type==='application/pdf'||String(f.type||'').startsWith('image/')||/\.(pdf|png|jpe?g|webp|heic|heif)$/i.test(f.name||''));}
  function meta(r){return {id:r.id,shareId:r.shareId,name:r.name,type:r.type||'',size:Number(r.size)||0,createdAt:r.createdAt||''};}
  async function saveFiles(shareId,fileList){const files=Array.from(fileList||[]);if(!files.length)return[];const total=files.reduce((a,f)=>a+(f.size||0),0);if(total>MAX_BATCH)throw new Error('한 번에 첨부하는 파일은 총 30MB 이하로 선택해 주세요.');for(const f of files){if(!allowed(f))throw new Error(`${f.name}: 사진 또는 PDF 파일만 첨부할 수 있습니다.`);if(f.size>MAX_FILE)throw new Error(`${f.name}: 파일당 10MB 이하로 첨부해 주세요.`);}const now=new Date().toISOString(),rows=files.map(f=>({id:`att_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`,shareId,name:f.name,type:f.type||'',size:f.size,createdAt:now,blob:f}));await tx('readwrite',st=>rows.forEach(r=>st.put(r)));return rows.map(meta);}
  async function listShare(shareId){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readonly'),idx=t.objectStore(STORE).index('shareId'),req=idx.getAll(IDBKeyRange.only(shareId));req.onsuccess=()=>resolve((req.result||[]).map(meta));req.onerror=()=>reject(req.error);});}
  async function get(id){const db=await open();return new Promise((resolve,reject)=>{const req=db.transaction(STORE,'readonly').objectStore(STORE).get(id);req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);});}
  async function remove(id){return tx('readwrite',st=>st.delete(id));}
  async function removeShare(shareId){const db=await open();return new Promise((resolve,reject)=>{const t=db.transaction(STORE,'readwrite'),idx=t.objectStore(STORE).index('shareId'),req=idx.openCursor(IDBKeyRange.only(shareId));req.onsuccess=()=>{const c=req.result;if(c){c.delete();c.continue();}};t.oncomplete=()=>resolve();t.onerror=()=>reject(t.error);});}
  async function clear(){return tx('readwrite',st=>st.clear());}
  async function download(id){const r=await get(id);if(!r||!r.blob)throw new Error('첨부파일을 찾지 못했습니다.');const a=document.createElement('a'),url=URL.createObjectURL(r.blob);a.href=url;a.download=r.name||'attachment';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000);}
  function size(n){n=Number(n)||0;if(n<1024)return `${n} B`;if(n<1024*1024)return `${(n/1024).toFixed(1)} KB`;return `${(n/1024/1024).toFixed(1)} MB`;}
  window.KRASFiles={saveFiles,listShare,get,remove,removeShare,clear,download,size,limits:{maxFile:MAX_FILE,maxBatch:MAX_BATCH}};
})();
