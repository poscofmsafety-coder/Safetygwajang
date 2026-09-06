/* ============================================================
   안전과장 CBT - 자기소개서 탭 추가
   resume-tab.js  (v3 / 영구 감시판)
   - main.js·toeic.js 가 탭 바를 몇 번 다시 그려도 스스로 재삽입
   - 감시자를 절대 disconnect 하지 않음
   ============================================================ */
(function () {
  'use strict';

  const LABEL = '📝 자기소개서';
  const BADGE = 'AI';
  const HREF  = 'resume.html';
  const MARK  = 'data-tab-resume';

  /* ---------- 탭 바 찾기 (id 가 달라도 대응) ---------- */
  function tabsBar() {
    return document.getElementById('main-tabs')
        || document.querySelector('.main-tabs')
        || document.querySelector('.exam-tabs')
        || document.querySelector('.tabs');
  }

  /* ---------- 탭 삽입 (멱등 / 몇 번 호출해도 안전) ---------- */
  function addTab() {
    const wrap = tabsBar();
    if (!wrap) return false;

    /* 이미 붙어 있으면 성공으로 간주 (재삽입 안 함) */
    if (wrap.querySelector('[' + MARK + ']')) return true;

    /* 기존 탭을 샘플로 클래스 복사 — 우리 버튼은 제외 */
    const sample = wrap.querySelector(
      'button:not([' + MARK + ']), a:not([' + MARK + ']), .main-tab:not([' + MARK + '])'
    );

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(MARK, '1');
    btn.className = sample
      ? (sample.className || 'main-tab').replace(/\bactive\b/g, '').trim()
      : 'main-tab';
    if (!btn.className) btn.className = 'main-tab';

    btn.appendChild(document.createTextNode(LABEL));

    const cntSample = sample && sample.querySelector('.tab-cnt, .cnt, span');
    const badge = document.createElement('span');
    badge.className = cntSample ? cntSample.className : 'tab-cnt';
    badge.textContent = BADGE;
    btn.appendChild(badge);

    /* main.js 탭 핸들러보다 먼저 가로채기 (캡처 단계) */
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      location.href = HREF;
    }, true);

    /* 터치 기기에서 탭 전환이 먼저 먹는 것 방지 */
    btn.addEventListener('touchend', function (e) {
      e.preventDefault();
      e.stopImmediatePropagation();
      location.href = HREF;
    }, true);

    wrap.appendChild(btn);
    console.log('[resume-tab] 탭 삽입 완료');
    return true;
  }

  /* ---------- 영구 감시 : body 전체를 보므로 탭 바가 교체돼도 살아남음 ---------- */
  let scheduled = false;
  function scheduleCheck() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      addTab();
    });
  }

  function observeForever() {
    if (!window.MutationObserver) return;
    new MutationObserver(scheduleCheck)
      .observe(document.documentElement, { childList: true, subtree: true });
  }

  /* ---------- 폴링 백업 : 처음 15초간 300ms 마다 확인 ---------- */
  function pollBackup() {
    let tries = 0;
    const timer = setInterval(function () {
      tries++;
      addTab();
      if (tries > 50) clearInterval(timer);   // 15초 후 종료(감시자가 이어받음)
    }, 300);
  }

  /* ---------- 부팅 ---------- */
  function boot() {
    addTab();
    observeForever();
    pollBackup();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* 뒤로가기 캐시 복원 시에도 재확인 */
  window.addEventListener('pageshow', addTab);
})();
