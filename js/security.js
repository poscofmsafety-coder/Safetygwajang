(function () {
  'use strict';

  if (window.__SAFETYGWAJANG_SECURITY__) return;
  window.__SAFETYGWAJANG_SECURITY__ = true;

  var NOTICE_ID = 'safetygwajang-security-notice';
  var clickTimes = [];
  var samePointClicks = [];
  var lockedUntil = 0;
  var hideTimer = 0;
  var lastNoticeAt = 0;

  var EDITABLE_SELECTOR = 'input,textarea,select,option,[contenteditable="true"],.allow-select,.allow-select *';
  var MESSAGE = '무단 복제·배포 금지 · 위반 시 법적 책임';

  function isEditable(target) {
    if (!target) return false;
    if (target.nodeType === 3) target = target.parentElement;
    return !!(target && target.closest && target.closest(EDITABLE_SELECTOR));
  }

  function injectStyle() {
    if (document.getElementById('safetygwajang-security-style')) return;
    var style = document.createElement('style');
    style.id = 'safetygwajang-security-style';
    style.textContent = [
      'html{-webkit-touch-callout:none}',
      'body{-webkit-user-select:none!important;-moz-user-select:none!important;-ms-user-select:none!important;user-select:none!important}',
      EDITABLE_SELECTOR + '{-webkit-user-select:text!important;-moz-user-select:text!important;-ms-user-select:text!important;user-select:text!important;-webkit-touch-callout:default!important}',
      'img,svg,canvas,video{-webkit-user-drag:none!important;user-drag:none!important}',
      '#' + NOTICE_ID + '{position:fixed;left:50%;bottom:max(22px,env(safe-area-inset-bottom));z-index:2147483647;max-width:min(520px,calc(100vw - 28px));padding:12px 17px;border:1px solid rgba(255,255,255,.18);border-radius:999px;background:rgba(9,27,45,.96);color:#fff;font-family:"SeoulNamsan","NanumBarunGothic","Malgun Gothic",sans-serif;font-size:13px;font-weight:800;line-height:1.45;text-align:center;box-shadow:0 14px 36px rgba(0,0,0,.28);opacity:0;transform:translate(-50%,12px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
      '#' + NOTICE_ID + '.show{opacity:1;transform:translate(-50%,0)}',
      '@media(max-width:640px){#' + NOTICE_ID + '{font-size:12px;border-radius:14px}}',
      '@media print{body>*{display:none!important}body:after{content:"' + MESSAGE + '";display:block!important;padding:48px 24px;color:#111827;font:800 18px/1.6 sans-serif;text-align:center}}',
      '@media (prefers-reduced-motion:reduce){#' + NOTICE_ID + '{transition:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function ensureUi() {
    injectStyle();
    if (!document.body) return;

    if (!document.getElementById(NOTICE_ID)) {
      var notice = document.createElement('div');
      notice.id = NOTICE_ID;
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      notice.setAttribute('data-security-notice', '');
      document.body.appendChild(notice);
    }

  }

  function showNotice(message, ms) {
    if (!document.body) return;
    ensureUi();
    var el = document.getElementById(NOTICE_ID);
    if (!el) return;
    el.textContent = message || MESSAGE;
    el.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }

  function protectNotice(message) {
    var now = Date.now();
    if (now - lastNoticeAt < 450) return;
    lastNoticeAt = now;
    showNotice(message || MESSAGE);
  }

  function clearSelection() {
    try {
      var sel = window.getSelection && window.getSelection();
      if (sel && sel.removeAllRanges) sel.removeAllRanges();
    } catch (e) {}
  }

  function bestEffortClearClipboard() {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText('').catch(function () {});
      }
    } catch (e) {}
  }

  document.addEventListener('DOMContentLoaded', ensureUi, { once: true });
  if (document.readyState !== 'loading') ensureUi();

  document.addEventListener('contextmenu', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
    clearSelection();
    protectNotice(MESSAGE);
  }, { capture: true });

  document.addEventListener('selectstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  }, { capture: true });

  document.addEventListener('dragstart', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
  }, { capture: true });

  document.addEventListener('copy', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
    if (e.clipboardData) {
      try { e.clipboardData.setData('text/plain', ''); } catch (err) {}
    }
    clearSelection();
    protectNotice(MESSAGE);
  }, { capture: true });

  document.addEventListener('cut', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
    clearSelection();
    protectNotice(MESSAGE);
  }, { capture: true });

  /* 비입력 영역의 paste 이벤트도 차단합니다. 검색창/폼은 정상 입력을 위해 허용합니다. */
  document.addEventListener('paste', function (e) {
    if (isEditable(e.target)) return;
    e.preventDefault();
    protectNotice(MESSAGE);
  }, { capture: true });

  document.addEventListener('keydown', function (e) {
    var key = String(e.key || '').toLowerCase();
    var editable = isEditable(e.target);
    var mod = e.ctrlKey || e.metaKey;
    var devTools = e.key === 'F12' ||
      (mod && e.shiftKey && ['i', 'j', 'c', 'k'].indexOf(key) >= 0) ||
      (e.metaKey && e.altKey && ['i', 'j', 'c'].indexOf(key) >= 0);
    var sourceSavePrint = mod && ['u', 's', 'p'].indexOf(key) >= 0;
    var contentCopy = mod && ['c', 'x', 'a'].indexOf(key) >= 0 && !editable;
    var printScreen = key === 'printscreen';
    var macCapture = e.metaKey && e.shiftKey && ['3', '4', '5'].indexOf(key) >= 0;

    if (!(devTools || sourceSavePrint || contentCopy || printScreen || macCapture)) return;
    e.preventDefault();
    e.stopPropagation();

    if (printScreen || macCapture) {
      bestEffortClearClipboard();
      protectNotice('화면 캡처를 제한했습니다 · ' + MESSAGE);
    } else if (contentCopy) {
      clearSelection();
      protectNotice(MESSAGE);
    } else {
      protectNotice('보안을 위해 해당 기능이 제한되어 있습니다.');
    }
  }, { capture: true });

  document.addEventListener('keyup', function (e) {
    if (String(e.key || '').toLowerCase() !== 'printscreen') return;
    e.preventDefault();
    bestEffortClearClipboard();
    protectNotice('화면 캡처를 제한했습니다 · ' + MESSAGE);
  }, { capture: true });

  document.addEventListener('touchstart', function (e) {
    if (isEditable(e.target)) return;
    if (e.touches && e.touches.length > 1) clearSelection();
  }, { capture: true, passive: true });

  window.addEventListener('beforeprint', function () {
    protectNotice('인쇄·PDF 저장이 제한되어 있습니다.');
  });

  /* 클릭 공격 보호: 기존 동작 유지 */
  document.addEventListener('click', function (e) {
    if (!e.isTrusted) return;
    var now = Date.now();

    if (now < lockedUntil) {
      if (!e.target.closest || !e.target.closest('[data-security-notice]')) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      return;
    }

    var x = Number(e.clientX || 0);
    var y = Number(e.clientY || 0);
    samePointClicks.push({ t: now, x: x, y: y });
    samePointClicks = samePointClicks.filter(function (p) { return now - p.t <= 900; });
    var near = samePointClicks.filter(function (p) {
      return Math.abs(p.x - x) <= 36 && Math.abs(p.y - y) <= 36;
    }).length;

    if (near >= 3) {
      lockedUntil = now + 6000;
      clickTimes = [];
      samePointClicks = [];
      showNotice('비정상적인 3회 연속 클릭이 감지되었습니다. 6초 후 다시 이용해 주세요.', 6200);
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }

    clickTimes.push(now);
    clickTimes = clickTimes.filter(function (t) { return now - t <= 5000; });
    var fast = clickTimes.filter(function (t) { return now - t <= 2200; }).length;

    if (fast >= 14 || clickTimes.length >= 24) {
      lockedUntil = now + 3000;
      clickTimes = [];
      samePointClicks = [];
      showNotice('비정상적으로 빠른 연속 클릭이 감지되었습니다. 3초 후 다시 이용해 주세요.', 3200);
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, { capture: true });
})();
