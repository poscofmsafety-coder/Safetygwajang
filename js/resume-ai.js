/* Resume AI 엔진 v6 — 서버 프록시 + 개인키 겸용 */
(function () {
  'use strict';

  var LS_KEY   = 'cbt_groq_key';
  var LS_CNT   = 'cbt_ai_count';
  var DAILY    = 15;                       /* 공용 1일 한도 */
  var M_SEARCH = 'groq/compound';          /* 웹검색 가능 모델 */
  var M_PLAIN  = 'llama-3.3-70b-versatile';

  var SYS = '당신은 대한민국 대기업 인사담당자 경력 15년의 채용 컨설턴트입니다. ' +
            '한국어로만 답합니다. 과장·거짓 없이, 제공된 경력 사실만 사용합니다. ' +
            '수치와 행동 중심으로 쓰고, 추상적 미사여구(열정, 최선, 소통의 달인)는 쓰지 않습니다. ' +
            '결과는 마크다운으로 정리합니다.';

  /* ---------- 키 / 사용량 ---------- */
  function today() { return new Date().toISOString().slice(0, 10); }

  function counts() {
    try {
      var o = JSON.parse(localStorage.getItem(LS_CNT) || '{}');
      if (o.d !== today()) o = { d: today(), n: 0 };
      return o;
    } catch (e) { return { d: today(), n: 0 }; }
  }
  function bump() {
    var o = counts(); o.n++;
    try { localStorage.setItem(LS_CNT, JSON.stringify(o)); } catch (e) {}
  }
  function getKey() { try { return localStorage.getItem(LS_KEY) || ''; } catch (e) { return ''; } }
  function setKey(v) {
    try { v ? localStorage.setItem(LS_KEY, String(v).trim()) : localStorage.removeItem(LS_KEY); } catch (e) {}
  }
  function remaining() {
    if (getKey()) return '무제한';
    return Math.max(0, DAILY - counts().n) + '회';
  }

  function keyInfo() {
    var st  = window.CBT_API ? CBT_API.state()
                             : { checking: false, proxy: false, msg: 'api-config.js 로드 실패' };
    if (getKey()) return { usable: true, mode: 'key', checking: false };
    if (st.checking) return { usable: false, checking: true };
    if (!st.proxy) {
      return {
        usable: false, serverDown: true, serverMsg: st.msg,
        error: '서버 AI 연결을 사용할 수 없습니다.\n' +
               'Groq 무료 API 키를 발급해 등록하시면 바로 사용할 수 있습니다.\n' +
               'https://console.groq.com/keys'
      };
    }
    if (counts().n >= DAILY) {
      return {
        usable: false, quota: true,
        error: '오늘 공용 사용 한도(' + DAILY + '회)를 모두 사용했습니다.\n' +
               '개인 키를 등록하시면 제한 없이 이용하실 수 있습니다.'
      };
    }
    return { usable: true, mode: 'proxy', checking: false };
  }

  /* ---------- 진행률(예상 기반) ---------- */
  function ticker(opt) {
    var cb = opt.onProgress;
    if (typeof cb !== 'function') return { stop: function () {} };
    var t0 = Date.now(), exp = opt.expectMs || 30000;
    cb(5, '요청을 보내는 중');
    var id = setInterval(function () {
      var ratio = (Date.now() - t0) / exp;
      var p = 5 + Math.min(0.9, ratio) * 85;
      cb(p, ratio < 0.25 ? '요청을 보내는 중'
            : (opt.stageLabel || '내용을 생성하는 중'));
    }, 400);
    return { stop: function () { clearInterval(id); } };
  }

  /* ---------- 출처 추출 ---------- */
  function pickSources(msg) {
    var out = [], seen = {};
    try {
      var raw = JSON.stringify(msg && msg.executed_tools ? msg.executed_tools : '');
      var re = /https?:\/\/[^\s"'\\)\]]+/g, m;
      while ((m = re.exec(raw))) {
        var u = m[0].replace(/[.,]+$/, '');
        if (seen[u] || u.indexOf('groq.com') >= 0) continue;
        seen[u] = 1;
        var host = u.split('/')[2] || u;
        out.push({ uri: u, title: host });
        if (out.length >= 12) break;
      }
    } catch (e) {}
    return out;
  }

  /* ---------- 호출 ---------- */
  async function call(prompt, opt) {
    opt = opt || {};
    var info = keyInfo();
    if (!info.usable) throw new Error(info.error || 'NO_KEY');

    var payload = {
      model: opt.search ? M_SEARCH : M_PLAIN,
      temperature: (opt.temp == null ? 0.7 : opt.temp),
      max_tokens: 8000,
      messages: [
        { role: 'system', content: SYS },
        { role: 'user', content: prompt }
      ]
    };

    var key = getKey();
    var url, headers;
    if (key) {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key };
    } else {
      url = (window.CBT_API && CBT_API.PROXY_URL) || '/api/ai';
      headers = { 'Content-Type': 'application/json' };
    }

    var tk = ticker(opt);
    try {
      var res  = await fetch(url, { method: 'POST', headers: headers, body: JSON.stringify(payload) });
      var data = null;
      try { data = await res.json(); } catch (e) {}

      if (!res.ok || !data) {
        if (res.status === 401 || res.status === 403) throw new Error('BAD_KEY');
        if (res.status === 429) throw new Error('요청이 많아 잠시 제한되었습니다. 1~2분 후 다시 시도해 주세요.');
        var em = (data && data.error && (data.error.message || data.error)) || ('서버 오류 (HTTP ' + res.status + ')');
        throw new Error(String(em));
      }

      var ch  = (data.choices && data.choices[0]) || {};
      var txt = (ch.message && ch.message.content) || '';
      if (!txt.trim()) throw new Error('빈 응답을 받았습니다. 다시 시도해 주세요.');

      if (!key) bump();
      if (typeof opt.onProgress === 'function') opt.onProgress(97, '정리하는 중');

      return { text: txt.trim(), sources: pickSources(ch.message), model: data.model || payload.model };
    } finally {
      tk.stop();
    }
  }

  /* ---------- 마크다운 → HTML ---------- */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function md(src) {
    var lines = esc(src).split(/\r?\n/), html = '', list = null;

    function closeList() { if (list) { html += '</' + list + '>'; list = null; } }

    lines.forEach(function (raw) {
      var l = raw.replace(/\|/g, ' | ').trim();

      l = l.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
           .replace(/`([^`]+)`/g, '<code>$1</code>');

      if (!l) { closeList(); return; }
      if (/^#{3,}\s+/.test(l)) { closeList(); html += '<h5>' + l.replace(/^#{3,}\s+/, '') + '</h5>'; return; }
      if (/^##\s+/.test(l))    { closeList(); html += '<h4>' + l.replace(/^##\s+/, '') + '</h4>'; return; }
      if (/^#\s+/.test(l))     { closeList(); html += '<h4>' + l.replace(/^#\s+/, '') + '</h4>'; return; }
      if (/^(-{3,}|={3,})$/.test(l)) { closeList(); html += '<hr>'; return; }

      var mo = l.match(/^(\d+)[.)]\s+(.*)$/);
      if (mo) {
        if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; }
        html += '<li>' + mo[2] + '</li>'; return;
      }
      if (/^[-*•]\s+/.test(l)) {
        if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; }
        html += '<li>' + l.replace(/^[-*•]\s+/, '') + '</li>'; return;
      }
      closeList();
      html += '<p>' + l + '</p>';
    });

    closeList();
    return html || '<p>(내용 없음)</p>';
  }

  /* ---------- 프롬프트 ---------- */
  function base(v) {
    return '## 지원 정보\n' +
      '- 회사/직무 : ' + (v.company || '(미입력)') + '\n\n' +
      '## 채용공고 원문\n"""\n' + v.jd + '\n"""\n\n' +
      '## 지원자 경력·경험\n"""\n' + v.career + '\n"""\n\n' +
      '## 작성 항목\n' + v.items + '\n';
  }

  var prompts = {
    strategy: function (v) {
      return base(v) +
        '\n위 정보를 바탕으로 자기소개서 **작성 전략**을 세워 주십시오.\n' +
        '가능하면 해당 회사의 최근 사업·투자·이슈를 웹에서 확인해 반영하고, 확인한 내용은 사실만 적습니다.\n\n' +
        '다음 순서로 작성하십시오.\n' +
        '1. 회사 분석 — 주요 사업, 최근 1년 이슈 3가지, 이 직무가 회사에서 하는 역할\n' +
        '2. 공고 키워드 추출 — 필수요건/우대사항에서 핵심 키워드 7개와 각 키워드의 실제 요구 역량\n' +
        '3. 경력 매칭표 — 키워드별로 지원자의 어떤 경험을 근거로 쓸지, 부족한 부분은 무엇인지\n' +
        '4. 항목별 전략 — 각 작성 항목마다 (a) 핵심 메시지 1줄 (b) 사용할 경험 (c) 소제목 후보 2개 (d) 반드시 넣을 수치\n' +
        '5. 주의사항 — 이 지원자가 감점될 위험 요소 3가지와 보완 방법\n';
    },
    draft: function (v) {
      return base(v) +
        '\n위 정보를 바탕으로 각 작성 항목의 **자기소개서 초안**을 작성해 주십시오.\n\n' +
        '작성 규칙\n' +
        '- 분량 : 항목당 ' + v.len + '자 (±10%)\n' +
        '- 문체 : ' + v.tone + '\n' +
        '- 각 항목은 "## N. 항목명" 으로 시작하고, 바로 아래 줄에 15자 이내 소제목을 [ ] 안에 넣습니다.\n' +
        '- 첫 문장은 두괄식(결론·수치·문제정의)으로 시작합니다.\n' +
        '- 한 문장은 60자 이내로 끊고, STAR(상황-과제-행동-결과) 구조를 지킵니다.\n' +
        '- 제공된 경력에 없는 사실을 만들지 않습니다. 수치가 없으면 [수치 입력] 으로 표시합니다.\n' +
        '- 공고에 등장한 표현을 항목마다 최소 1회 사용합니다.\n' +
        '- 문단 끝에는 회사에 기여할 지점을 연결합니다.\n' +
        '- 각 항목 끝에 "> ✍️ 보완 필요 : ..." 한 줄로 지원자가 채워야 할 부분을 알려 줍니다.\n' +
        '- 마지막에 "## 제출 전 확인" 으로 체크포인트 5개를 정리합니다.\n';
    }
  };

  window.ResumeAI = {
    getKey: getKey, setKey: setKey, keyInfo: keyInfo, remaining: remaining,
    call: call, md: md, prompts: prompts
  };
})();
