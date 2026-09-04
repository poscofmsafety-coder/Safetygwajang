/* ============================================================
   면접 예상질문 노트 – 답변 입력 / 자동저장 / 내보내기
   저장 위치 : localStorage  (키: meta.answerStorageKey)
   저장 구조 : { [qid]: { a:"답변", k:"키워드", s:"상태", u:갱신시각 } }
   ============================================================ */
(() => {
  'use strict';

  /* manifest.json 이 없을 때 사용할 기본 파일 목록 */
  const FALLBACK_FILES = [
    'data/companies-posco.json',
    'data/companies-sk.json',
    'data/companies-lg.json',
    'data/companies-hmg.json',
    'data/companies-chem.json',
    'data/companies-etc.json',
    'data/companies-public.json'
  ];

  /* meta.json 이 없을 때 사용할 기본값 */
  const FALLBACK_META = {
    schemaVersion: '1.0.0',
    answerStorageKey: 'interviewPrep.answers.v1',
    groups: [
      { id:'G-POSCO', name:'포스코그룹',            color:'#004a99', order:1 },
      { id:'G-SK',    name:'SK그룹',               color:'#e6002d', order:2 },
      { id:'G-LG',    name:'LG그룹',               color:'#a50034', order:3 },
      { id:'G-HMG',   name:'현대차그룹',            color:'#002c5f', order:4 },
      { id:'G-CHEM',  name:'화학·소재',            color:'#1f7a5a', order:5 },
      { id:'G-ETC',   name:'기타 대기업·서비스',     color:'#5b4b8a', order:6 },
      { id:'G-PUB',   name:'공공기관·공기업',       color:'#2c6e91', order:7 }
    ],
    tiers: [
      { id:'T1', name:'1차 기업군', desc:'그룹 주력사' },
      { id:'T2', name:'2차 기업군', desc:'그룹 계열사·중견' },
      { id:'TP', name:'공공 트랙',  desc:'NCS/블라인드' }
    ],
    qTypes: [
      { id:'common',    name:'공통·인성', badge:'공' },
      { id:'job',       name:'직무·기술', badge:'직' },
      { id:'situation', name:'상황·압박', badge:'상' },
      { id:'english',   name:'영어',     badge:'영' },
      { id:'pt',        name:'발표과제',  badge:'PT' }
    ],
    statuses: [
      { id:'empty',  name:'미작성' },
      { id:'draft',  name:'작성중' },
      { id:'review', name:'검토필요' },
      { id:'done',   name:'완료' }
    ]
  };

  const state = {
    meta: null,
    companies: [],
    coreStories: null,
    answers: {},
    activeCompanyId: null,
    warnings: [],
    filters: { tier:'', type:'', keyword:'', onlyUnanswered:false }
  };

  const $  = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = (s = '') => String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /* ---------------- 저장 / 로드 ---------------- */
  const KEY = () => state.meta?.answerStorageKey || 'interviewPrep.answers.v1';

  function loadAnswers() {
    try { state.answers = JSON.parse(localStorage.getItem(KEY()) || '{}'); }
    catch { state.answers = {}; }
  }
  function saveAnswers() {
    try {
      localStorage.setItem(KEY(), JSON.stringify(state.answers));
      toast('저장됨');
    } catch {
      toast('저장 실패 (저장공간 초과)');
    }
  }
  const debouncedSave = debounce(saveAnswers, 600);

  function setAnswer(qid, patch) {
    const cur  = state.answers[qid] || { a:'', k:'', s:'empty' };
    const next = { ...cur, ...patch, u: Date.now() };
    if (!next.s || next.s === 'empty') next.s = next.a?.trim() ? 'draft' : 'empty';
    state.answers[qid] = next;
    debouncedSave();
    renderNav();
  }

  /* ---------------- 로딩 유틸 ---------------- */
  async function getJSON(path) {
    const r = await fetch(path, { cache:'no-store' });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
  }
    /* silent = true : 없어도 되는 파일 → 경고 표시 안 함 */
  async function tryJSON(path, silent) {
    try {
      return await getJSON(path);
    } catch (e) {
      console.warn('[note] 로드 건너뜀:', path, e.message || e);
      if (!silent) state.warnings.push(e.message || String(e));
      return null;
    }
  }


  /* ---------------- 초기화 ---------------- */
  async function init() {
    const main = $('#main');

    /* 1) meta */
    state.meta = (await tryJSON('data/meta.json', true)) || FALLBACK_META;
    if (!state.meta.groups)   state.meta.groups   = FALLBACK_META.groups;
    if (!state.meta.tiers)    state.meta.tiers    = FALLBACK_META.tiers;
    if (!state.meta.qTypes)   state.meta.qTypes   = FALLBACK_META.qTypes;
    if (!state.meta.statuses) state.meta.statuses = FALLBACK_META.statuses;

    loadAnswers();

    /* 2) 파일 목록 (manifest 우선, 없으면 기본값) */
    const manifest = await tryJSON('data/manifest.json', true);
    const files = (manifest?.files?.length) ? manifest.files : FALLBACK_FILES;
    const corePath = manifest?.coreStories || 'data/core-stories.json';

    /* 3) 회사 데이터 (하나 깨져도 나머지는 로딩) */
    const loadedFiles = await Promise.all(files.map(f => tryJSON(f)));
    loadedFiles.forEach((file, i) => {
      if (!file || !Array.isArray(file.companies)) {
        state.warnings.push(`${files[i]} → companies 배열 없음`);
        return;
      }
      file.companies.forEach(c => {
        state.companies.push({ ...c, group: c.group || file.group || 'G-ETC' });
      });
    });

    /* 4) 공통 경험 뱅크 (없어도 무관) */
    state.coreStories = await tryJSON(corePath, true);

    if (!state.companies.length && !state.coreStories) {
      main.innerHTML =
        `<div class="scenario"><b>데이터를 불러오지 못했습니다</b>
         <p>아래 경로를 확인해 주세요. 로컬에서 <code>file://</code> 로 열면 차단됩니다.</p>
         <ul>${state.warnings.map(w => `<li>${esc(w)}</li>`).join('') || '<li>알 수 없는 오류</li>'}</ul></div>`;
      return;
    }

    buildFilters();
    bindEvents();
    state.activeCompanyId = state.coreStories ? 'CORE' : state.companies[0].id;
    renderNav();
    renderMain();
  }

  function buildFilters() {
    const tierSel = $('#filter-tier');
    state.meta.tiers.forEach(t => tierSel.insertAdjacentHTML('beforeend',
      `<option value="${t.id}">${esc(t.name)}${t.desc ? ' – ' + esc(t.desc) : ''}</option>`));
    const typeSel = $('#filter-type');
    state.meta.qTypes.forEach(t => typeSel.insertAdjacentHTML('beforeend',
      `<option value="${t.id}">${esc(t.name)}</option>`));
  }

  /* ---------------- 통계 ---------------- */
  function companyQuestions(c) {
    return (c.interviews || []).flatMap(s =>
      (s.questions || []).map(q => ({ ...q, stage: s.stage })));
  }
  function progress(c) {
    const qs = companyQuestions(c);
    const done = qs.filter(q => (state.answers[q.qid]?.a || '').trim().length > 0).length;
    return { done, total: qs.length, pct: qs.length ? Math.round(done / qs.length * 100) : 0 };
  }

  /* ---------------- 사이드바 ---------------- */
  function renderNav() {
    const nav = $('#nav');
    let html = '';

    if (state.coreStories) {
      const cls = state.activeCompanyId === 'CORE' ? 'active' : '';
      html += `<div class="nav-group"><div class="nav-group-title">⭐ 공통</div>
        <button class="nav-item ${cls}" data-company="CORE">
          <span class="nm">경험 뱅크(STAR)</span><span class="pg"></span><span class="cnt"></span>
        </button></div>`;
    }

    [...state.meta.groups].sort((a,b) => (a.order||0) - (b.order||0)).forEach(g => {
      const list = state.companies
        .filter(c => c.group === g.id)
        .filter(c => !state.filters.tier || c.tier === state.filters.tier);
      if (!list.length) return;

      html += `<div class="nav-group">
        <div class="nav-group-title" style="border-color:${g.color || '#ddd'}">${esc(g.name)}</div>`;
      list.forEach(c => {
        const p = progress(c);
        const cls = state.activeCompanyId === c.id ? 'active' : '';
        html += `<button class="nav-item ${cls}" data-company="${esc(c.id)}">
          <span class="nm">${esc(c.name)}<em class="tier">${esc(c.tier || '')}</em></span>
          <span class="pg"><i style="width:${p.pct}%"></i></span>
          <span class="cnt">${p.done}/${p.total}</span></button>`;
      });
      html += `</div>`;
    });

   
    nav.innerHTML = html;
  }

  /* ---------------- 본문 ---------------- */
  function renderMain() {
    const main = $('#main');
    if (state.activeCompanyId === 'CORE') return renderCore(main);

    const c = state.companies.find(x => x.id === state.activeCompanyId);
    if (!c) { main.innerHTML = '<p>회사를 선택하세요.</p>'; return; }

    const p = progress(c);
    const g = state.meta.groups.find(x => x.id === c.group);

    let html = `<section class="company">
      <div class="company-head" style="--accent:${g?.color || '#333'}">
        <h2>${esc(c.name)}</h2>
        <div class="chips">
          <span class="chip">${esc(g?.name || '')}</span>
          <span class="chip">${esc(state.meta.tiers.find(t => t.id === c.tier)?.name || c.tier || '')}</span>
          ${(c.jobFields || []).map(f => `<span class="chip ghost">${esc(f)}</span>`).join('')}
        </div>
        <div class="progress"><i style="width:${p.pct}%"></i>
          <span>${p.done}/${p.total} 작성 (${p.pct}%)</span></div>
      </div>`;

    (c.interviews || []).forEach((s, si) => {
      const qs = (s.questions || []).filter(filterQuestion);
      if (!qs.length) return;
      html += `<details class="stage" ${si === 0 ? 'open' : ''}>
        <summary><b>${esc(s.stage || '전형')}</b>
          <span class="stage-meta">${esc(s.format || '')}</span>
          <span class="stage-cnt">${qs.length}문항</span></summary>`;
      if (s.scenario) html += `<div class="scenario"><b>제시 상황</b><p>${esc(s.scenario)}</p></div>`;
      if (s.note)     html += `<div class="note">💬 ${esc(s.note)}</div>`;
      qs.forEach(q => { html += questionCard(q); });
      html += `</details>`;
    });

    html += `</section>`;
    main.innerHTML = html;
  }

  function questionCard(q) {
    const a = state.answers[q.qid] || { a:'', k:'', s:'empty' };
    const badge = state.meta.qTypes.find(t => t.id === q.type)?.badge || '';
    return `<article class="qcard status-${a.s}" data-qid="${esc(q.qid)}">
      <header>
        <span class="badge b-${esc(q.type || 'common')}">${esc(badge)}</span>
        <p class="qtext">${esc(q.q)}</p>
        <code class="qid">${esc(q.qid)}</code>
      </header>
      ${(q.tags || []).length ? `<div class="tags">${q.tags.map(t => `<span class="tag">#${esc(t)}</span>`).join('')}</div>` : ''}
      ${q.note ? `<div class="note">💡 ${esc(q.note)}</div>` : ''}
      <label class="lbl">핵심 키워드 (암기용)</label>
      <input class="kw" type="text" value="${esc(a.k)}" placeholder="예: 배관분리 / 공단질의 / 10억→3억" />
      <label class="lbl">나의 예상답변</label>
      <textarea class="ans" rows="5" placeholder="STAR(상황-과제-행동-결과) 순서로 작성해보세요.">${esc(a.a)}</textarea>
      <div class="qfoot">
        <select class="st">
          ${state.meta.statuses.map(s => `<option value="${s.id}" ${a.s === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}
        </select>
        <span class="saved">${a.u ? new Date(a.u).toLocaleString('ko-KR') + ' 저장' : ''}</span>
      </div>
    </article>`;
  }

  function renderCore(main) {
    const d = state.coreStories;
    let html = `<section class="company">
      <div class="company-head" style="--accent:#c98a00">
        <h2>⭐ ${esc(d.title || '공통 경험 뱅크')}</h2>
        <p class="desc">${esc(d.desc || '')}</p>
      </div>
      <details class="stage" open><summary><b>경험 뱅크</b></summary>`;

    (d.items || []).filter(filterQuestion).forEach(q => {
      const hint = q.hint
        ? `<div class="hint"><b>정리 힌트</b><ul>${Object.entries(q.hint)
            .map(([k, v]) => `<li><b>${esc(k)}</b> · ${esc(v)}</li>`).join('')}</ul></div>`
        : '';
      html += questionCard(q).replace('</header>', '</header>' + hint);
    });

    html += `</details></section>`;
    main.innerHTML = html;
  }

  function filterQuestion(q) {
    const f = state.filters;
    if (f.type && q.type !== f.type) return false;
    if (f.onlyUnanswered && (state.answers[q.qid]?.a || '').trim()) return false;
    if (f.keyword) {
      const hay = (q.q + ' ' + (q.tags || []).join(' ') + ' ' + (q.note || '')).toLowerCase();
      if (!hay.includes(f.keyword.toLowerCase())) return false;
    }
    return true;
  }

  /* ---------------- 이벤트 ---------------- */
  function bindEvents() {
    $('#nav').addEventListener('click', e => {
      const btn = e.target.closest('.nav-item');
      if (!btn) return;
      state.activeCompanyId = btn.dataset.company;
      renderNav(); renderMain();
      window.scrollTo({ top:0, behavior:'smooth' });
    });

    $('#main').addEventListener('input', e => {
      const card = e.target.closest('.qcard'); if (!card) return;
      const qid = card.dataset.qid;
      if (e.target.classList.contains('ans')) setAnswer(qid, { a: e.target.value });
      if (e.target.classList.contains('kw'))  setAnswer(qid, { k: e.target.value });
    });

    $('#main').addEventListener('change', e => {
      const card = e.target.closest('.qcard'); if (!card) return;
      if (e.target.classList.contains('st')) {
        setAnswer(card.dataset.qid, { s: e.target.value });
        card.className = `qcard status-${e.target.value}`;
      }
    });

    $('#search').addEventListener('input', debounce(e => {
      state.filters.keyword = e.target.value.trim(); renderMain();
    }, 250));
    $('#filter-tier').addEventListener('change', e => { state.filters.tier = e.target.value; renderNav(); });
    $('#filter-type').addEventListener('change', e => { state.filters.type = e.target.value; renderMain(); });
    $('#only-unanswered').addEventListener('change', e => { state.filters.onlyUnanswered = e.target.checked; renderMain(); });

    $('#btn-export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify({
        exportedAt: new Date().toISOString(),
        schemaVersion: state.meta.schemaVersion,
        answers: state.answers
      }, null, 2)], { type:'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `면접답변_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    $('#file-import').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        const inc = data.answers || data;
        Object.entries(inc).forEach(([qid, v]) => {
          const cur = state.answers[qid];
          if (!cur || (v.u || 0) > (cur.u || 0)) state.answers[qid] = v;   // 최신 우선 병합
        });
        saveAnswers(); renderNav(); renderMain();
        alert('불러오기 완료 (최신 수정본 기준으로 병합)');
      } catch { alert('JSON 형식이 올바르지 않습니다.'); }
      e.target.value = '';
    });

    $('#btn-print').addEventListener('click', () => {
      $$('.stage').forEach(d => d.open = true);
      window.print();
    });

    window.addEventListener('beforeunload', saveAnswers);
  }

  /* ---------------- 유틸 ---------------- */
  function debounce(fn, ms) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  }
  let toastTimer;
  function toast(msg) {
    const el = $('#toast'); if (!el) return;
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.hidden = true, 1200);
  }

  init().catch(err => {
    const main = $('#main');
    if (main) main.innerHTML =
      `<div class="scenario"><b>초기화 오류</b><p>${esc(err.message || err)}</p></div>`;
  });
})();
