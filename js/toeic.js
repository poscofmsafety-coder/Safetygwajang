/* ============================================================
   토익스피킹 탭 자동 삽입 (main.js 수정 불필요)
   - 탭 바가 다시 그려져도 스스로 재삽입
   ============================================================ */
(function () {
  'use strict';

  var LIST = [
    { id:'toeic-part1', part:'PART 1', title:'문장 읽기', en:'Read a text aloud',
      q:'Q1~2', prep:'준비 45초', ans:'답변 45초',
      desc:'끊어읽기 · 강세 · 억양 · 연음 · 속도 완전정리' },
    { id:'toeic-part2', part:'PART 2', title:'사진 묘사', en:'Describe a picture',
      q:'Q3~4', prep:'준비 45초', ans:'답변 30초',
      desc:'서론 → 전체요약 → 인물묘사 → 사물·배경 → 마무리 템플릿' },
    { id:'toeic-part3', part:'PART 3', title:'듣고 질문에 답하기', en:'Respond to questions',
      q:'Q5~7', prep:'준비 3초', ans:'답변 15/15/30초',
      desc:'이유 만능문장 · 답변 공식 · 시간 채우기 전략' },
    { id:'toeic-part4', part:'PART 4', title:'제공된 정보로 답하기', en:'Respond using information',
      q:'Q8~10', prep:'표 읽기 45초', ans:'답변 15/15/30초',
      desc:'일정표 · 이력서 · 수업표 패턴 문장 총정리' },
    { id:'toeic-part5', part:'PART 5', title:'의견 제시하기', en:'Express an opinion',
      q:'Q11', prep:'준비 30초', ans:'답변 60초',
      desc:'서론-본론2-결론 템플릿 + 이유 만능문장' }
  ];

  var BTN_ID = 'toeic-tab-btn';
  var PANEL_ID = 'panel-toeic';
  var active = false;

  /* 숨김용 스타일 주입 */
  var st = document.createElement('style');
  st.textContent = '.toeic-hidden{display:none !important;}' +
    '#' + PANEL_ID + '{margin-top:4px;}';
  document.head.appendChild(st);

  /* ---------- 탭 바 찾기 ---------- */
  function tabsBar() {
    return document.querySelector('#main-tabs') ||
           document.querySelector('.main-tabs') ||
           document.querySelector('.exam-tabs') ||
           document.querySelector('.tabs');
  }

  /* ---------- 카드 HTML ---------- */
  function cardsHTML() {
    return LIST.map(function (t) {
      return '<a class="exam-card" href="study.html?id=' + t.id + '" style="text-decoration:none;display:block;">' +
        '<div style="font-size:.7rem;font-weight:800;letter-spacing:.06em;color:#fff;background:var(--primary,#2563eb);display:inline-block;padding:3px 9px;border-radius:20px;margin-bottom:8px;">' + t.part + '</div>' +
        '<h3>' + t.title + '</h3>' +
        '<div style="font-size:.78rem;color:var(--gray-400,#9ca3af);margin:2px 0 8px;">' + t.en + ' · ' + t.q + '</div>' +
        '<div class="exam-tags"><span class="tag">' + t.prep + '</span><span class="tag">' + t.ans + '</span></div>' +
        '<div class="exam-subjects">' + t.desc + '</div>' +
      '</a>';
    }).join('');
  }

  /* ---------- 패널 생성 ---------- */
  function ensurePanel() {
    var p = document.getElementById(PANEL_ID);
    if (p) return p;
    var bar = tabsBar();
    if (!bar) return null;

    p = document.createElement('div');
    p.id = PANEL_ID;
    p.style.display = 'none';
    p.innerHTML =
      '<div class="study-intro"><b>TOEIC Speaking</b> · 5파트 11문항 / 약 20분 / 0~200점(Level 1~8)<br>' +
      '파트별 <b>템플릿과 만능문장</b>을 정리했습니다. 소리 내어 3회 이상 읽어보세요.</div>' +
      '<div class="exam-grid" id="toeic-list">' + cardsHTML() + '</div>';

    bar.parentNode.insertBefore(p, bar.nextSibling);
    return p;
  }

  /* ---------- 다른 콘텐츠 숨기기 / 되돌리기 ---------- */
  function hideOthers() {
    var sel = '.tab-panel, #exam-list, #dup-list, #dup-locked, .lock-box, .exam-grid, .subject-grid, .round-grid';
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.id === PANEL_ID) return;
      if (el.closest('#' + PANEL_ID)) return;
      if (el.id === 'recent-list' || el.closest('#recent-section')) return;
      if (el.closest('.bookmark-section')) return;
      el.classList.add('toeic-hidden');
    });
  }
  function showOthers() {
    document.querySelectorAll('.toeic-hidden').forEach(function (el) {
      el.classList.remove('toeic-hidden');
    });
  }

  /* ---------- 활성 / 비활성 ---------- */
  function activate() {
    var p = ensurePanel();
    if (!p) return;
    active = true;
    hideOthers();
    p.style.display = '';
    var bar = tabsBar();
    if (bar) {
      bar.querySelectorAll('button, a, .main-tab, .tab').forEach(function (b) {
        b.classList.remove('active');
      });
    }
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.add('active');
    try { history.replaceState(null, '', '#toeic'); } catch (e) {}
  }
  function deactivate() {
    active = false;
    var p = document.getElementById(PANEL_ID);
    if (p) p.style.display = 'none';
    var btn = document.getElementById(BTN_ID);
    if (btn) btn.classList.remove('active');
    showOthers();
  }

  /* ---------- 탭 버튼 삽입 ---------- */
  function ensureButton() {
    var bar = tabsBar();
    if (!bar) return false;
    if (document.getElementById(BTN_ID)) return true;

    var sample = bar.querySelector('button, a');
    var btn = document.createElement('button');
    btn.id = BTN_ID;
    btn.type = 'button';
    btn.className = sample ? sample.className.replace(/\bactive\b/g, '').trim() : 'main-tab';
    if (!btn.className) btn.className = 'main-tab';
    btn.innerHTML = '🗣️ 토익스피킹 <span class="tab-cnt">5</span>';

    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      activate();
    });

    bar.appendChild(btn);
    return true;
  }

  /* ---------- 다른 탭 클릭 시 우리 패널 닫기 ---------- */
  function bindBar() {
    var bar = tabsBar();
    if (!bar || bar.dataset.toeicBound === '1') return;
    bar.dataset.toeicBound = '1';
    bar.addEventListener('click', function (e) {
      var hit = e.target.closest('#' + BTN_ID);
      if (!hit && active) deactivate();
    }, true);
  }

  /* ---------- main.js가 탭을 다시 그려도 재삽입 ---------- */
  function watch() {
    var bar = tabsBar();
    if (!bar) return;
    var mo = new MutationObserver(function () {
      if (!document.getElementById(BTN_ID)) {
        ensureButton();
        if (active) activate();
      }
    });
    mo.observe(bar, { childList: true, subtree: true });
  }

  /* ---------- 탭 바가 준비될 때까지 최대 10초 대기 ---------- */
  function boot() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (ensureButton()) {
        bindBar();
        watch();
        clearInterval(timer);
        if (location.hash === '#toeic') setTimeout(activate, 200);
      }
      if (tries > 100) clearInterval(timer);   // 10초 타임아웃
    }, 100);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
