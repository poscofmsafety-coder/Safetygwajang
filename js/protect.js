/* ============================================
   안전과장 CBT - 콘텐츠 보호
   protect.js (v3)
   우клик / 드래그 / 복사 / 롱탭 / 개발자도구 / 인쇄 차단
   + 안내 토스트 · 예외영역(.allow-select) · 중복로드 방지
   ============================================ */

(function () {
  'use strict';

  /* 중복 로드 방지 */
  if (window.__CBT_PROTECT__) return;
  window.__CBT_PROTECT__ = true;

  /* ============================================
     설정 (필요 시 true/false 만 바꾸세요)
     ============================================ */
  const CONFIG = {
    contextmenu: true,   // 우클릭 차단
    select: true,        // 드래그 선택 차단
    copy: true,          // 복사·잘라내기 차단
    hotkey: true,        // 단축키 차단
    print: true,         // 인쇄 차단
    toast: true          // 안내 메시지 표시
  };

  /* ============================================
     0. 예외 요소 판별
     - 입력창 / contenteditable
     - .allow-select 가 붙은 영역과 그 하위 전체
     - 광고 영역(ins.adsbygoogle)
     ============================================ */
  const ALLOW_SEL =
    'input, textarea, select, option, [contenteditable="true"], ' +
    '.allow-select, .adsbygoogle, .ad-zone, .ad-inline';

  function isEditable(el) {
    if (!el) return false;

    /* 텍스트 노드 → 부모 엘리먼트로 승격 */
    if (el.nodeType === 3) el = el.parentElement;
    if (!el || !el.tagName) return false;

    if (/^(INPUT|TEXTAREA|SELECT|OPTION)$/.test(el.tagName)) return true;
    if (el.isContentEditable) return true;

    /* 상위 요소까지 확인 (v2 대비 보완) */
    if (el.closest && el.closest(ALLOW_SEL)) return true;

    return false;
  }

  /* ============================================
     1. 보호용 CSS 주입
     ============================================ */
  function injectStyle() {
    const css = [
      'body{',
      '-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;',
      '-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent;',
      '}',

      /* 입력창·예외영역은 정상 동작 */
      'input,textarea,select,[contenteditable="true"],.allow-select,.allow-select *{',
      '-webkit-user-select:text !important;-moz-user-select:text !important;',
      '-ms-user-select:text !important;user-select:text !important;',
      '-webkit-touch-callout:default;',
      '}',

      'img,svg,canvas{',
      '-webkit-user-drag:none;user-drag:none;',
      '}',

      /* 안내 토스트 */
      '.cbt-protect-toast{',
      'position:fixed;left:50%;bottom:34px;',
      'transform:translateX(-50%) translateY(14px);',
      'background:rgba(17,24,39,.92);color:#fff;',
      'font-size:.82rem;font-weight:600;line-height:1.4;',
      'padding:11px 18px;border-radius:24px;',
      'box-shadow:0 6px 20px rgba(0,0,0,.25);',
      'opacity:0;pointer-events:none;z-index:2147483647;',
      'white-space:nowrap;max-width:90vw;',
      'transition:opacity .22s ease,transform .22s ease;',
      '}',
      '.cbt-protect-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',

      /* 인쇄 차단 */
      CONFIG.print ? '@media print{body{display:none !important;}' +
        'html::after{content:"인쇄가 제한된 콘텐츠입니다.";display:block;' +
        'padding:40px;font-size:16px;font-family:sans-serif;}}' : ''
    ].join('');

    const style = document.createElement('style');
    style.setAttribute('data-cbt-protect', '1');
    style.textContent = css;

    if (document.head) {
      document.head.appendChild(style);
    } else {
      document.addEventListener('DOMContentLoaded', function () {
        document.head.appendChild(style);
      });
    }
  }

  injectStyle();

  /* ============================================
     2. 안내 토스트
     ============================================ */
  let toastEl = null;
  let toastTimer = null;

  function toast(msg) {
    if (!CONFIG.toast || !document.body) return;

    if (!toastEl || !document.body.contains(toastEl)) {
      toastEl = document.createElement('div');
      toastEl.className = 'cbt-protect-toast';
      document.body.appendChild(toastEl);
    }

    toastEl.textContent = msg;
    /* 리플로우 후 애니메이션 */
    void toastEl.offsetWidth;
    toastEl.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (toastEl) toastEl.classList.remove('show');
    }, 1600);
  }

  /* ============================================
     3. 마우스 우클릭 금지
     ============================================ */
  if (CONFIG.contextmenu) {
    document.addEventListener('contextmenu', function (e) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      toast('🔒 우클릭이 제한된 페이지입니다');
    }, { capture: true });
  }

  /* ============================================
     4. 드래그 / 선택 / 복사 / 잘라내기 금지
     ============================================ */
  document.addEventListener('dragstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  }, { capture: true });

  if (CONFIG.select) {
    document.addEventListener('selectstart', function (e) {
      if (!isEditable(e.target)) e.preventDefault();
    }, { capture: true });
  }

  if (CONFIG.copy) {
    document.addEventListener('copy', function (e) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      toast('🔒 복사가 제한된 콘텐츠입니다');
    }, { capture: true });

    document.addEventListener('cut', function (e) {
      if (isEditable(e.target)) return;
      e.preventDefault();
      toast('🔒 복사가 제한된 콘텐츠입니다');
    }, { capture: true });
  }

  /* ============================================
     5. 모바일 롱탭(길게 누르기) 복사 메뉴 차단
     ============================================ */
  let touchTimer = null;

  document.addEventListener('touchstart', function (e) {
    if (isEditable(e.target)) return;

    /* 멀티터치로 선택 시도 차단 */
    if (e.touches && e.touches.length > 1) {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }

    touchTimer = setTimeout(function () {
      const sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    }, 400);
  }, { passive: true });

  ['touchend', 'touchmove', 'touchcancel'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      if (touchTimer) { clearTimeout(touchTimer); touchTimer = null; }
    }, { passive: true });
  });

  /* ============================================
     6. 단축키 차단
     F12 / Ctrl+Shift+I,J,C,K,E / Ctrl+U,S,P / Ctrl+C,X,A
     ============================================ */
  if (CONFIG.hotkey) {
    document.addEventListener('keydown', function (e) {
      const k = (e.key || '').toUpperCase();
      const editable = isEditable(e.target);

      /* 개발자도구 */
      if (k === 'F12') {
        e.preventDefault();
        toast('🔒 사용할 수 없는 기능입니다');
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.shiftKey) {
        if (['I', 'J', 'C', 'K', 'E'].indexOf(k) > -1) {
          e.preventDefault();
          toast('🔒 사용할 수 없는 기능입니다');
          return;
        }
      }

      /* 소스보기(U) · 저장(S) · 인쇄(P) */
      if ((e.ctrlKey || e.metaKey) && ['U', 'S', 'P'].indexOf(k) > -1) {
        e.preventDefault();
        toast('🔒 사용할 수 없는 기능입니다');
        return;
      }

      /* 복사(C) · 잘라내기(X) · 전체선택(A) — 입력창은 허용 */
      if ((e.ctrlKey || e.metaKey) && ['C', 'X', 'A'].indexOf(k) > -1 && !editable) {
        e.preventDefault();
        toast('🔒 복사가 제한된 콘텐츠입니다');
        return;
      }
    }, { capture: true });
  }

  /* ============================================
     7. 이미지 보호 (동적 추가분까지 적용)
     ============================================ */
  function guardImages(root) {
    (root || document).querySelectorAll('img').forEach(function (img) {
      if (img.dataset.cbtGuard) return;
      img.dataset.cbtGuard = '1';
      img.setAttribute('draggable', 'false');
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    guardImages(document);

    /* 본문이 나중에 렌더링되는 페이지(study.html 등) 대응 */
    if (window.MutationObserver) {
      const mo = new MutationObserver(function (list) {
        for (let i = 0; i < list.length; i++) {
          if (list[i].addedNodes && list[i].addedNodes.length) {
            guardImages(document);
            break;
          }
        }
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
  });

  /* ============================================
     8. 콘솔 경고
     ============================================ */
  try {
    console.log(
      '%c⚠️ 본 사이트의 콘텐츠는 저작물입니다.\n무단 복제·배포를 금지합니다.',
      'color:#e11d48;font-size:14px;font-weight:bold;line-height:1.6;'
    );
  } catch (e) {}

})();
