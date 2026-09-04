(function () {
  'use strict';

  var NOTICE_ID = 'safetygwajang-security-notice';
  var clickTimes = [];
  var lockedUntil = 0;
  var lastContextNotice = 0;

  function injectStyle() {
    if (document.getElementById('safetygwajang-security-style')) return;
    var style = document.createElement('style');
    style.id = 'safetygwajang-security-style';
    style.textContent = [
      '#' + NOTICE_ID + '{position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:min(360px,calc(100vw - 36px));padding:13px 16px;border:1px solid #d8e0e8;border-radius:14px;background:rgba(16,43,75,.97);color:#fff;font-family:"SeoulNamsan","NanumBarunGothic","Nanum Gothic",sans-serif;font-size:14px;line-height:1.55;box-shadow:0 12px 32px rgba(12,32,55,.22);opacity:0;transform:translateY(10px);pointer-events:none;transition:opacity .18s ease,transform .18s ease}',
      '#' + NOTICE_ID + '.show{opacity:1;transform:translateY(0)}',
      'img{-webkit-user-drag:none}',
      '@media (prefers-reduced-motion:reduce){#' + NOTICE_ID + '{transition:none}}'
    ].join('');
    document.head.appendChild(style);
  }

  function noticeElement() {
    injectStyle();
    var el = document.getElementById(NOTICE_ID);
    if (!el) {
      el = document.createElement('div');
      el.id = NOTICE_ID;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('data-security-notice', '');
      document.body.appendChild(el);
    }
    return el;
  }

  var hideTimer = 0;
  function showNotice(message, ms) {
    if (!document.body) return;
    var el = noticeElement();
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2400);
  }

  document.addEventListener('contextmenu', function (e) {
    e.preventDefault();
    var now = Date.now();
    if (now - lastContextNotice > 1400) {
      showNotice('보안을 위해 마우스 우클릭 메뉴가 제한되어 있습니다.');
      lastContextNotice = now;
    }
  }, { capture: true });

  document.addEventListener('dragstart', function (e) {
    var target = e.target;
    if (target && target.tagName === 'IMG') e.preventDefault();
  }, { capture: true });

  document.addEventListener('keydown', function (e) {
    var key = String(e.key || '').toLowerCase();
    var blocked = e.key === 'F12' ||
      (e.ctrlKey && key === 'u') ||
      (e.ctrlKey && key === 's') ||
      (e.ctrlKey && e.shiftKey && (key === 'i' || key === 'j' || key === 'c')) ||
      (e.metaKey && e.altKey && (key === 'i' || key === 'j' || key === 'c'));
    if (!blocked) return;
    e.preventDefault();
    e.stopPropagation();
    showNotice('보안을 위해 해당 브라우저 기능이 제한되어 있습니다.');
  }, { capture: true });

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

    clickTimes.push(now);
    clickTimes = clickTimes.filter(function (t) { return now - t <= 5000; });
    var fast = clickTimes.filter(function (t) { return now - t <= 2200; }).length;

    if (fast >= 14 || clickTimes.length >= 24) {
      lockedUntil = now + 3000;
      clickTimes = [];
      showNotice('비정상적으로 빠른 연속 클릭이 감지되었습니다. 3초 후 다시 이용해 주세요.', 3200);
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }, { capture: true });
})();
