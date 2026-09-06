/* ============================================
   안전과장 AdSense 무효 트래픽 완화 가드
   - Google 광고 iframe/광고 코드는 직접 변조하지 않음
   - 광고 위에 오버레이/투명막을 만들지 않음
   - 짧은 시간 반복 광고 상호작용이 의심되면 다음 광고 요청을 일시 중단
   - 2회/20초 감지 시 30분 쿨다운 -> 3번째 연속 상호작용 예방
   - 3회/10분 감지 시 60분 쿨다운
   ============================================ */
(function () {
  'use strict';

  if (window.__SG_ADSENSE_GUARD__) return;
  window.__SG_ADSENSE_GUARD__ = true;

  var KEY_EVENTS = 'sg_adsense_guard_events_v1';
  var KEY_BLOCK = 'sg_adsense_guard_until_v1';
  var FAST_WINDOW = 20 * 1000;
  var LONG_WINDOW = 10 * 60 * 1000;
  var FAST_LIMIT = 2;
  var LONG_LIMIT = 3;
  var FAST_COOLDOWN = 30 * 60 * 1000;
  var LONG_COOLDOWN = 60 * 60 * 1000;
  var EVENT_DEBOUNCE = 1600;
  var hoveredAdFrame = null;
  var lastRecordedAt = 0;
  var lastRecordedFrame = null;
  var reloadScheduled = false;

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
  }

  function blockUntil() {
    var value = Number(safeGet(KEY_BLOCK) || 0);
    return Number.isFinite(value) ? value : 0;
  }

  function isBlocked() {
    return Date.now() < blockUntil();
  }

  function installAdBlockCsp() {
    if (!isBlocked() || document.querySelector('meta[data-sg-adsense-guard-csp]')) return;

    /*
     * 현재 HTML의 AdSense 스니펫은 원본 그대로 둡니다.
     * 의심 세션에서만 pagead2.googlesyndication.com 스크립트가 요청되지 않도록
     * 이 시점 이후의 외부 script 허용 출처를 사이트 기능에 필요한 곳으로 제한합니다.
     */
    var meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.setAttribute('data-sg-adsense-guard-csp', '1');
    meta.content = "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://cdn.jsdelivr.net https://cdn.tailwindcss.com https://unpkg.com";
    (document.head || document.documentElement).appendChild(meta);
    document.documentElement.setAttribute('data-adsense-guarded', '1');
  }

  /* 이 파일은 AdSense 로더보다 먼저 동기 실행되므로 쿨다운 세션에서는 광고 요청 자체를 막습니다. */
  installAdBlockCsp();

  function readEvents() {
    var raw = safeGet(KEY_EVENTS);
    if (!raw) return [];
    try {
      var arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      var now = Date.now();
      return arr.map(Number).filter(function (t) {
        return Number.isFinite(t) && t > 0 && now - t <= LONG_WINDOW;
      });
    } catch (e) {
      return [];
    }
  }

  function writeEvents(events) {
    safeSet(KEY_EVENTS, JSON.stringify(events.slice(-12)));
  }

  function setCooldown(ms) {
    var until = Date.now() + ms;
    if (until > blockUntil()) safeSet(KEY_BLOCK, String(until));
    try {
      document.cookie = 'sg_adsense_guard=1; Max-Age=' + Math.ceil(ms / 1000) + '; Path=/; SameSite=Lax; Secure';
    } catch (e) {}
  }

  function isGoogleAdFrame(frame) {
    if (!frame || frame.tagName !== 'IFRAME') return false;

    var src = String(frame.getAttribute('src') || '');
    var name = String(frame.getAttribute('name') || frame.id || '');
    if (/googleads|googlesyndication|doubleclick|googleadservices/i.test(src)) return true;
    if (/google_ads_iframe|aswift|google_ads_frame/i.test(name)) return true;

    try {
      if (frame.closest && frame.closest('ins.adsbygoogle, .adsbygoogle, [data-ad-client]')) return true;
    } catch (e) {}
    return false;
  }

  function showNotice() {
    if (!document.body || document.getElementById('sg-adsense-guard-notice')) return;
    var el = document.createElement('div');
    el.id = 'sg-adsense-guard-notice';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.textContent = '반복적인 광고 상호작용이 감지되어 광고 노출을 잠시 제한합니다.';
    el.style.cssText = [
      'position:fixed','left:50%','bottom:24px','z-index:2147483647',
      'transform:translateX(-50%)','max-width:min(440px,calc(100vw - 32px))',
      'padding:12px 16px','border-radius:12px','background:rgba(17,24,39,.96)',
      'color:#fff','font:600 13px/1.5 sans-serif','text-align:center',
      'box-shadow:0 10px 28px rgba(0,0,0,.24)','pointer-events:none'
    ].join(';');
    document.body.appendChild(el);
  }

  function reloadWithoutAds() {
    if (reloadScheduled) return;
    reloadScheduled = true;
    showNotice();
    setTimeout(function () {
      try { location.reload(); } catch (e) {}
    }, 650);
  }

  function recordProbableAdInteraction(frame) {
    var now = Date.now();

    if (lastRecordedFrame === frame && now - lastRecordedAt < EVENT_DEBOUNCE) return;
    if (now - lastRecordedAt < 700) return;
    lastRecordedFrame = frame;
    lastRecordedAt = now;

    var events = readEvents();
    events.push(now);
    events = events.filter(function (t) { return now - t <= LONG_WINDOW; });
    writeEvents(events);

    var fastCount = events.filter(function (t) { return now - t <= FAST_WINDOW; }).length;
    var longCount = events.length;

    if (longCount >= LONG_LIMIT) {
      setCooldown(LONG_COOLDOWN);
      reloadWithoutAds();
      return;
    }

    if (fastCount >= FAST_LIMIT) {
      setCooldown(FAST_COOLDOWN);
      reloadWithoutAds();
    }
  }

  function bindFrame(frame) {
    if (!isGoogleAdFrame(frame) || frame.dataset.sgAdGuardBound === '1') return;
    frame.dataset.sgAdGuardBound = '1';

    frame.addEventListener('mouseenter', function () { hoveredAdFrame = frame; }, { passive: true });
    frame.addEventListener('mouseleave', function () {
      if (hoveredAdFrame === frame) hoveredAdFrame = null;
    }, { passive: true });
  }

  function scanFrames(root) {
    var node = root || document;
    if (node.tagName === 'IFRAME') bindFrame(node);
    if (!node.querySelectorAll) return;
    node.querySelectorAll('iframe').forEach(bindFrame);
  }

  function initDetection() {
    if (isBlocked()) return;
    scanFrames(document);

    if (window.MutationObserver && document.documentElement) {
      var observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
          if (mutation.type === 'attributes' && mutation.target && mutation.target.tagName === 'IFRAME') {
            bindFrame(mutation.target);
            return;
          }
          mutation.addedNodes.forEach(function (node) {
            if (node && node.nodeType === 1) scanFrames(node);
          });
        });
      });
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'name', 'id'] });
    }

    window.addEventListener('blur', function () {
      setTimeout(function () {
        var active = document.activeElement;
        if (isGoogleAdFrame(active)) {
          recordProbableAdInteraction(active);
          return;
        }
        if (hoveredAdFrame && isGoogleAdFrame(hoveredAdFrame)) {
          recordProbableAdInteraction(hoveredAdFrame);
        }
      }, 0);
    }, true);

    window.addEventListener('focus', function () {
      if (isBlocked()) reloadWithoutAds();
    }, true);

    window.addEventListener('pageshow', function (e) {
      if (e.persisted && isBlocked()) reloadWithoutAds();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDetection, { once: true });
  } else {
    initDetection();
  }
})();
