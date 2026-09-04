/* CBT API 접속 설정 v6 — 서버(/api/ai) 상태만 확인 */
(function () {
  'use strict';

  var PROXY_URL = '/api/ai';

  var state = {
    checking: true,
    proxy: false,
    keyConfigured: false,
    msg: '',
    models: []
  };

  function finish(patch) {
    for (var k in patch) state[k] = patch[k];
    state.checking = false;
    return state;
  }

  var probe;

  if (location.protocol === 'file:') {
    probe = Promise.resolve(finish({
      proxy: false,
      msg: '로컬 파일(file://)에서는 서버 기능을 사용할 수 없습니다.'
    }));
  } else {
    probe = fetch(PROXY_URL, { method: 'GET', cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        return finish({
          proxy: !!(j && j.ok && (j.ready || j.keyConfigured)),
          keyConfigured: !!(j && (j.ready || j.keyConfigured)),
          models: (j && j.models) || [],
          msg: (j && j.ok && !(j.ready || j.keyConfigured))
            ? '서버에 GROQ_API_KEY 환경변수가 적용되지 않았습니다.'
            : ''
        });
      })
      .catch(function (e) {
        return finish({
          proxy: false,
          msg: '서버 응답 없음 (' + ((e && e.message) || 'network') + ')'
        });
      });
  }

  window.CBT_API = {
    PROXY_URL: PROXY_URL,
    state:      function () { return state; },
    hasProxy:   function () { return state.proxy; },
    hasShared:  function () { return state.proxy; },
    ready:      function () { return probe; },
    debug:      function () { console.log('[CBT_API]', state); return state; }
  };
})();
