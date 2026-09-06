(function(){
  'use strict';
  const listEl=document.getElementById('community-list');
  if(!listEl)return;
  const writeBtn=document.getElementById('community-write');
  const moreBtn=document.getElementById('community-more');
  const statusEl=document.getElementById('community-status');
  const categoriesEl=document.getElementById('community-categories');
  const sortBtns=[...document.querySelectorAll('[data-community-sort]')];
  const modalRoot=document.getElementById('community-modal-root');
  const CATEGORIES=['고민상담','업무문의','질의회시','현장실무','취업·이직','기타'];
  const LOCAL_KEY='sgw_anjage_local_v1';
  const TOKEN_KEY='sgw_anjage_device_token_v1';
  const PAGE_SIZE=12;
  let activeCategory='전체',activeSort='latest',offset=0,apiMode='remote',loading=false;

  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clean=s=>String(s??'').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/g,' ').trim();
  function deviceToken(){
    try{
      let t=localStorage.getItem(TOKEN_KEY);
      if(!t){
        t=(crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2))+'-'+Math.random().toString(36).slice(2);
        localStorage.setItem(TOKEN_KEY,t);
      }
      return t;
    }catch(e){return 'session-'+Math.random().toString(36).slice(2)}
  }
  const token=deviceToken();
  function fmtTime(ts){
    const d=new Date(Number(ts)||ts||Date.now()),diff=Date.now()-d.getTime();
    if(diff<60000)return '방금';
    if(diff<3600000)return Math.max(1,Math.floor(diff/60000))+'분 전';
    if(diff<86400000)return Math.floor(diff/3600000)+'시간 전';
    if(diff<604800000)return Math.floor(diff/86400000)+'일 전';
    return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  }
  function modal(html){
    modalRoot.innerHTML=`<div class="community-modal-bg" data-community-close><div class="community-modal" role="dialog" aria-modal="true" aria-label="안자게 게시판"><button class="community-modal-x" type="button" aria-label="닫기" data-community-close>×</button>${html}</div></div>`;
    document.body.classList.add('community-modal-open');
    modalRoot.querySelectorAll('[data-community-close]').forEach(el=>el.addEventListener('click',e=>{
      if(e.currentTarget===e.target||e.currentTarget.classList.contains('community-modal-x'))closeModal();
    }));
  }
  function closeModal(){modalRoot.innerHTML='';document.body.classList.remove('community-modal-open')}
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modalRoot.innerHTML)closeModal()});

  async function api(path,options={}){
    const headers=new Headers(options.headers||{});headers.set('Accept','application/json');headers.set('X-Community-Token',token);
    if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
    const r=await fetch(path,{...options,headers,cache:'no-store'});
    const text=await r.text();let j={};try{j=JSON.parse(text)}catch(e){}
    if(!r.ok){const err=new Error(j.error||`게시판 연결 오류 (${r.status})`);err.status=r.status;throw err;}
    return j;
  }

  function unavailable(err){return !err?.status||[502,503,504].includes(Number(err.status));}
  function localState(){try{return JSON.parse(localStorage.getItem(LOCAL_KEY)||'{"posts":[],"comments":{}}')}catch(e){return {posts:[],comments:{}}}}
  function saveLocal(x){try{localStorage.setItem(LOCAL_KEY,JSON.stringify(x))}catch(e){}}
  function localList(){
    const s=localState();let rows=(s.posts||[]).filter(p=>activeCategory==='전체'||p.category===activeCategory);
    rows.sort(activeSort==='popular'?(a,b)=>(b.commentCount||0)-(a.commentCount||0)||(b.createdAt-a.createdAt):(a,b)=>b.createdAt-a.createdAt);
    return {items:rows.slice(offset,offset+PAGE_SIZE).map(p=>({...p,owned:p._owner===token})),hasMore:rows.length>offset+PAGE_SIZE,total:rows.length,mode:'local'};
  }
  function localCreatePost(payload){
    const s=localState(),now=Date.now(),id='local-'+now+'-'+Math.random().toString(36).slice(2,8);
    const p={id,category:payload.category,title:payload.title,content:payload.content,createdAt:now,updatedAt:now,commentCount:0,authorLabel:'익명',_owner:token};
    s.posts=s.posts||[];s.posts.push(p);s.comments=s.comments||{};s.comments[id]=[];saveLocal(s);return {...p,owned:true};
  }
  function localDetail(id){
    const s=localState(),p=(s.posts||[]).find(x=>x.id===id);if(!p)throw new Error('게시글을 찾을 수 없습니다.');
    const comments=(s.comments?.[id]||[]).map((c,i)=>({...c,authorLabel:c._owner===p._owner?'작성자':`익명${i+1}`,owned:c._owner===token}));
    return {post:{...p,owned:p._owner===token},comments,mode:'local'};
  }
  function localComment(id,content){
    const s=localState(),p=(s.posts||[]).find(x=>x.id===id);if(!p)throw new Error('게시글을 찾을 수 없습니다.');
    s.comments=s.comments||{};s.comments[id]=s.comments[id]||[];
    const c={id:'lc-'+Date.now()+'-'+Math.random().toString(36).slice(2,7),postId:id,content,createdAt:Date.now(),_owner:token};s.comments[id].push(c);p.commentCount=s.comments[id].length;saveLocal(s);return c;
  }
  function localDeletePost(id){const s=localState();s.posts=(s.posts||[]).filter(x=>!(x.id===id&&x._owner===token));if(s.comments)delete s.comments[id];saveLocal(s)}
  function localDeleteComment(postId,id){const s=localState();if(s.comments?.[postId])s.comments[postId]=s.comments[postId].filter(x=>!(x.id===id&&x._owner===token));const p=(s.posts||[]).find(x=>x.id===postId);if(p)p.commentCount=s.comments?.[postId]?.length||0;saveLocal(s)}

  function postCard(p){
    const preview=clean(p.content).slice(0,120);
    return `<article class="community-post-card" data-community-post="${esc(p.id)}" tabindex="0" role="button" aria-label="${esc(p.title)} 게시글 열기"><div class="community-post-top"><span class="community-cat">${esc(p.category)}</span><span class="community-meta">${esc(p.authorLabel||'익명')} · ${fmtTime(p.createdAt)}</span></div><h3>${esc(p.title)}</h3><p>${esc(preview)}${clean(p.content).length>120?'…':''}</p><div class="community-post-foot"><span>💬 댓글 ${Number(p.commentCount)||0}</span>${p.owned?'<span class="community-mine">내 글</span>':''}</div></article>`;
  }
  function bindCards(){
    listEl.querySelectorAll('[data-community-post]').forEach(el=>{
      const open=()=>openDetail(el.dataset.communityPost);
      el.addEventListener('click',open);el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    });
  }
  async function load(reset=true){
    if(loading)return;loading=true;if(reset){offset=0;listEl.innerHTML='<div class="community-empty">게시글을 불러오고 있습니다.</div>'}
    try{
      let data;
      if(apiMode==='remote'){
        const q=new URLSearchParams({limit:String(PAGE_SIZE),offset:String(offset),sort:activeSort});if(activeCategory!=='전체')q.set('category',activeCategory);
        try{data=await api('/api/community/posts?'+q.toString())}catch(e){if(unavailable(e)||e.status===404){apiMode='local';data=localList()}else throw e}
      }else data=localList();
      const html=(data.items||[]).map(postCard).join('');
      if(reset) listEl.innerHTML=html||'<div class="community-empty"><b>아직 글이 없습니다.</b><span>첫 번째 이야기를 남겨보세요.</span></div>';
      else listEl.insertAdjacentHTML('beforeend',html);
      bindCards();
      moreBtn.hidden=!data.hasMore;
      statusEl.textContent=apiMode==='remote'?`익명 게시판 · ${Number(data.total)||0}개 글`:'연결 전 임시모드 · 이 브라우저에만 저장';
    }finally{loading=false}
  }

  function openWrite(){
    modal(`<div class="community-modal-head"><span class="eyebrow">안자게 · 익명 글쓰기</span><h3>안전관리자끼리 편하게 이야기해보세요</h3><p>회사명·실명·연락처·내부문서 등 식별 가능한 정보는 적지 않는 것을 권장합니다.</p></div><form id="community-write-form" class="community-form"><label>분류<select name="category" required>${CATEGORIES.map(x=>`<option>${esc(x)}</option>`).join('')}</select></label><label>제목<input name="title" maxlength="80" minlength="3" placeholder="제목을 입력하세요" required></label><label>내용<textarea name="content" maxlength="3000" minlength="5" rows="8" placeholder="고민, 업무 질문, 질의회시 관련 내용 등을 자유롭게 작성하세요." required></textarea></label><div class="community-form-count"><span>익명으로 등록됩니다.</span><span id="community-content-count">0 / 3000</span></div><div class="community-form-actions"><button type="button" data-community-close>취소</button><button class="primary" type="submit">등록하기</button></div></form>`);
    const form=document.getElementById('community-write-form'),ta=form.elements.content,count=document.getElementById('community-content-count');ta.addEventListener('input',()=>count.textContent=`${ta.value.length} / 3000`);
    modalRoot.querySelector('[data-community-close]:not(.community-modal-bg):not(.community-modal-x)')?.addEventListener('click',closeModal);
    form.addEventListener('submit',async e=>{
      e.preventDefault();const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
      const payload={category:clean(form.elements.category.value),title:clean(form.elements.title.value),content:String(form.elements.content.value||'').trim()};
      try{
        if(!CATEGORIES.includes(payload.category)||payload.title.length<3||payload.content.length<5)throw new Error('분류, 제목, 내용을 확인해주세요.');
        if(apiMode==='remote'){try{await api('/api/community/posts',{method:'POST',body:JSON.stringify(payload)})}catch(err){if(unavailable(err)||err.status===404){apiMode='local';localCreatePost(payload)}else throw err}}else localCreatePost(payload);
        closeModal();activeCategory='전체';categoriesEl.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.communityCategory==='전체'));await load(true);
      }catch(err){alert(err.message||'게시글 등록에 실패했습니다.');submit.disabled=false}
    });
  }

  async function openDetail(id){
    modal('<div class="community-detail-loading">게시글을 불러오고 있습니다.</div>');
    try{
      let data;if(apiMode==='remote'){try{data=await api('/api/community/posts/'+encodeURIComponent(id))}catch(e){if(unavailable(e)){apiMode='local';data=localDetail(id)}else throw e}}else data=localDetail(id);
      const p=data.post,comments=data.comments||[];
      modal(`<article class="community-detail"><div class="community-detail-top"><span class="community-cat">${esc(p.category)}</span><span>${esc(p.authorLabel||'익명')} · ${fmtTime(p.createdAt)}</span></div><h3>${esc(p.title)}</h3><div class="community-detail-content">${esc(p.content).replace(/\n/g,'<br>')}</div><div class="community-detail-actions">${p.owned?'<button class="danger" id="community-delete-post" type="button">내 글 삭제</button>':''}<span>댓글 ${comments.length}</span></div></article><section class="community-comments"><h4>댓글</h4><div id="community-comments-list">${comments.length?comments.map(c=>`<div class="community-comment"><div><b>${esc(c.authorLabel||'익명')}</b><span>${fmtTime(c.createdAt)}</span>${c.owned?`<button type="button" data-delete-comment="${esc(c.id)}">삭제</button>`:''}</div><p>${esc(c.content).replace(/\n/g,'<br>')}</p></div>`).join(''):'<div class="community-comment-empty">아직 댓글이 없습니다.</div>'}</div><form class="community-comment-form" id="community-comment-form"><textarea name="content" maxlength="1000" rows="3" placeholder="익명 댓글을 입력하세요." required></textarea><button type="submit">댓글 등록</button></form></section>`);
      const form=document.getElementById('community-comment-form');form.addEventListener('submit',async e=>{e.preventDefault();const content=String(form.elements.content.value||'').trim();if(!content)return;const btn=form.querySelector('button');btn.disabled=true;try{if(apiMode==='remote'){try{await api(`/api/community/posts/${encodeURIComponent(id)}/comments`,{method:'POST',body:JSON.stringify({content})})}catch(err){if(unavailable(err)){apiMode='local';localComment(id,content)}else throw err}}else localComment(id,content);await openDetail(id);await load(true)}catch(err){alert(err.message||'댓글 등록에 실패했습니다.');btn.disabled=false}});
      document.getElementById('community-delete-post')?.addEventListener('click',async()=>{if(!confirm('이 게시글과 댓글을 삭제할까요?'))return;try{if(apiMode==='remote'){try{await api('/api/community/posts/'+encodeURIComponent(id),{method:'DELETE'})}catch(e){if(unavailable(e)){apiMode='local';localDeletePost(id)}else throw e}}else localDeletePost(id);closeModal();await load(true)}catch(e){alert(e.message||'삭제하지 못했습니다.')}});
      modalRoot.querySelectorAll('[data-delete-comment]').forEach(btn=>btn.addEventListener('click',async()=>{if(!confirm('이 댓글을 삭제할까요?'))return;try{if(apiMode==='remote'){try{await api(`/api/community/posts/${encodeURIComponent(id)}/comments/${encodeURIComponent(btn.dataset.deleteComment)}`,{method:'DELETE'})}catch(e){if(unavailable(e)){apiMode='local';localDeleteComment(id,btn.dataset.deleteComment)}else throw e}}else localDeleteComment(id,btn.dataset.deleteComment);await openDetail(id);await load(true)}catch(e){alert(e.message||'댓글을 삭제하지 못했습니다.')}}));
    }catch(e){modal(`<div class="community-modal-head"><h3>게시글을 열 수 없습니다.</h3><p>${esc(e.message||'잠시 후 다시 시도해주세요.')}</p></div>`)}
  }

  writeBtn?.addEventListener('click',openWrite);
  categoriesEl?.querySelectorAll('button').forEach(btn=>btn.addEventListener('click',()=>{activeCategory=btn.dataset.communityCategory||'전체';categoriesEl.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b===btn));load(true)}));
  sortBtns.forEach(btn=>btn.addEventListener('click',()=>{activeSort=btn.dataset.communitySort||'latest';sortBtns.forEach(b=>b.classList.toggle('active',b===btn));load(true)}));
  moreBtn?.addEventListener('click',()=>{offset+=PAGE_SIZE;load(false)});
  load(true);
})();
