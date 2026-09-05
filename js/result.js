/* ============================================
   안전과장 CBT - 결과 화면
   result.js (v3 - 자격증별 합격기준 자동 판정)
   ============================================ */

(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let data = null;
  let chart = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const params = new URLSearchParams(location.search);
    const sessionId = params.get('session');

    data = loadSession(sessionId);

    if (!data) {
      document.querySelector('main.container').innerHTML =
        '<p class="loading">❌ 결과 정보를 찾을 수 없습니다. <a href="index.html?audience=jobseeker">홈으로</a></p>';
      return;
    }

    const rule = getRule(data);
    const judge = grade(data, rule);

    renderSummary(judge, rule);
    renderSubject(judge, rule);
    renderReview('all');
    bindEvents();
  }

  function loadSession(id) {
    if (!id) return null;
    if (window.Storage && window.Storage.getSession) {
      const s = window.Storage.getSession(id);
      if (s) return s;
    }
    try {
      return JSON.parse(localStorage.getItem(`result-${id}`) || 'null');
    } catch (e) {
      return null;
    }
  }

  /* ============================================
     자격증별 합격 기준
     ============================================ */
  function getRule(d) {
    const t = `${d.examId || ''} ${d.examTitle || ''}`;

    if (/중복기출/.test(t)) {
      return {
        name: '중복기출 모음집(연습)',
        pass: 60,
        cutoff: 0,
        useSubject: true,
        desc: '연습용 모음집입니다. 60점 이상을 목표로 하세요.'
      };
    }
    if (/위험물산업기사/.test(t)) {
      return {
        name: '위험물산업기사',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 60문항(3과목) · 90분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/위험물기능장/.test(t)) {
      return {
        name: '위험물기능장',
        pass: 60,
        cutoff: 0,
        useSubject: false,
        perScore: 100 / 60,
        desc: '총 60문항 · 60분 · 과목 구분 없음<br>1문항 약 1.67점 · <b>36문항(60점) 이상 합격</b> · 과락 없음'
      };
    }
    if (/소방설비기사\s*\(?기계분야\)?|소방설비기사\(기계분야\)/.test(t)) {
      return {
        name: '소방설비기사(기계분야)',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 80문항(4과목) · 120분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/소방설비기사\s*\(?전기분야\)?|소방설비기사\(전기분야\)/.test(t)) {
      return {
        name: '소방설비기사(전기분야)',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 80문항(4과목) · 120분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/소방시설관리사/.test(t)) {
      return {
        name: '소방시설관리사 1차',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 125문항(5과목) · 125분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/산업안전지도사/.test(t)) {
      return {
        name: '산업안전지도사 1차',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 75문항(3과목) · 90분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/산업보건지도사/.test(t)) {
      return {
        name: '산업보건지도사 1차',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 75문항(3과목) · 90분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/산업위생관리기사/.test(t)) {
      return {
        name: '산업위생관리기사',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 100문항(5과목) · 150분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/인간공학기사/.test(t)) {
      return {
        name: '인간공학기사',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 80문항(4과목) · 120분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    if (/건설안전기사/.test(t)) {
      return {
        name: '건설안전기사',
        pass: 60,
        cutoff: 40,
        useSubject: true,
        desc: '총 120문항(6과목) · 150분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
      };
    }
    return {
      name: '산업안전기사',
      pass: 60,
      cutoff: 40,
      useSubject: true,
      desc: '총 120문항(6과목) · 150분<br><b>전 과목 평균 60점 이상 + 과목별 40점 이상</b>'
    };
  }

  /* 과목 구분이 의미 없는 데이터인지 판단 */
  function isDummySubject(names) {
    if (names.length <= 1) return true;
    return names.every(n => /임의구분|전체|기타|미분류/.test(n));
  }

  /* ============================================
     채점
     ============================================ */
  function grade(d, rule) {
    const total = d.total || 0;
    const correct = d.correct || 0;
    const percent = total > 0 ? Math.round((correct / total) * 1000) / 10 : 0;

    const stats = d.subjectStats || {};
    const names = Object.keys(stats);
    const useSubject = rule.useSubject && !isDummySubject(names);

    const rows = names.map(n => {
      const s = stats[n];
      const rate = s.total > 0 ? Math.round((s.correct / s.total) * 1000) / 10 : 0;
      return {
        name: n,
        correct: s.correct,
        total: s.total,
        rate: rate,
        isCut: useSubject && rule.cutoff > 0 && rate < rule.cutoff
      };
    });

    const cutList = rows.filter(r => r.isCut);
    const avgOk = percent >= rule.pass;
    const passed = avgOk && cutList.length === 0;

    let reason = '';
    if (!avgOk && cutList.length > 0) {
      reason = `평균 미달(${percent}점) + 과목 과락 ${cutList.length}개`;
    } else if (!avgOk) {
      reason = `평균 60점 미달 (현재 ${percent}점)`;
    } else if (cutList.length > 0) {
      reason = `과목 과락: ${cutList.map(r => r.name).join(', ')}`;
    }

    return { total, correct, percent, rows, cutList, passed, reason, useSubject };
  }

  /* ============================================
     요약 렌더
     ============================================ */
  function renderSummary(j, rule) {
    $('score').textContent = j.correct;
    $('total').textContent = j.total;
    $('percent').textContent = j.percent;
    $('elapsed').textContent = formatTime(data.elapsedSec || 0);

    const status = $('pass-status');
    if (j.passed) {
      status.textContent = '🎉 합격';
      status.style.color = '#a7f3d0';
    } else {
      status.textContent = '😥 불합격';
      status.style.color = '#fecaca';
    }

    if (!j.passed && j.reason) {
      $('fail-reason').style.display = 'inline-block';
      $('fail-reason').textContent = '📌 ' + j.reason;
    }

    const needCount = Math.ceil(j.total * rule.pass / 100);
    $('pass-rule').innerHTML =
      `<b>${rule.name}</b> 기준<br>${rule.desc}<br>` +
      `합격선: ${needCount}문항 / ${j.total}문항`;
  }

  /* ============================================
     과목별 차트 + 표
     ============================================ */
  function renderSubject(j, rule) {
    const section = $('subject-section');

    // 과목 구분이 없는 시험(위험물기능장 등)은 차트 숨김
    if (!j.useSubject) {
      section.querySelector('h3').textContent = '문항별 결과 요약';
      section.querySelector('.chart-wrap').style.display = 'none';

      const wrong = j.total - j.correct;
      $('subject-table-wrap').innerHTML = `
        <table class="subject-table">
          <thead>
            <tr><th>구분</th><th>정답</th><th>오답</th><th>정답률</th><th>합격 여부</th></tr>
          </thead>
          <tbody>
            <tr>
              <td class="name">전체 (과목 구분 없음)</td>
              <td>${j.correct}</td>
              <td>${wrong}</td>
              <td>${j.percent}%</td>
              <td>${j.passed ? '✅ 합격' : '❌ 불합격'}</td>
            </tr>
          </tbody>
        </table>
      `;
      return;
    }

    // 표
    const rowsHtml = j.rows.map(r => `
      <tr class="${r.isCut ? 'cut' : ''}">
        <td class="name">${escapeHtml(r.name)}</td>
        <td>${r.correct} / ${r.total}</td>
        <td>${r.rate}%</td>
        <td>${r.isCut ? '❌ 과락' : (rule.cutoff > 0 ? '✅ 통과' : '-')}</td>
      </tr>
    `).join('');

    $('subject-table-wrap').innerHTML = `
      <table class="subject-table">
        <thead>
          <tr><th>과목</th><th>정답/문항</th><th>정답률</th><th>과락(${rule.cutoff}점) 판정</th></tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr>
            <td class="name">전체 평균</td>
            <td>${j.correct} / ${j.total}</td>
            <td>${j.percent}%</td>
            <td>${j.percent >= rule.pass ? '✅ 60점 이상' : '❌ 60점 미달'}</td>
          </tr>
        </tfoot>
      </table>
    `;

    // 차트
    if (typeof Chart === 'undefined') return;
    const labels = j.rows.map(r => r.name);
    const values = j.rows.map(r => r.rate);
    const type = labels.length >= 3 ? 'radar' : 'bar';

    if (chart) chart.destroy();
    chart = new Chart($('subject-chart'), {
      type: type,
      data: {
        labels: labels,
        datasets: [{
          label: '정답률(%)',
          data: values,
          backgroundColor: 'rgba(0, 169, 206, 0.2)',
          borderColor: '#00A9CE',
          borderWidth: 2,
          pointBackgroundColor: j.rows.map(r => r.isCut ? '#ef4444' : '#00A9CE'),
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: type === 'radar'
          ? { r: { min: 0, max: 100, ticks: { stepSize: 20 } } }
          : { y: { min: 0, max: 100 } },
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }

  /* ============================================
     문제 리뷰
     ============================================ */
  function renderReview(filter) {
    const list = $('review-list');
    const review = Array.isArray(data.review) ? data.review : [];

    let items = review;
    if (filter === 'wrong') items = review.filter(r => !r.correct);
    else if (filter === 'correct') items = review.filter(r => r.correct);
    else if (filter === 'bookmark') items = review.filter(r => r.bookmarked);

    if (items.length === 0) {
      list.innerHTML = '<p class="empty-state">해당하는 문제가 없습니다.</p>';
      return;
    }

    list.innerHTML = '';

    items.forEach(r => {
      const card = document.createElement('div');
      card.className = 'review-item ' + (r.correct ? 'correct' : 'wrong');

      const head = document.createElement('div');
      head.className = 'review-header';
      head.innerHTML = `
        <div>
          <span class="question-no">${r.no}</span>
          ${r.subject ? `<span class="subject-tag">${escapeHtml(r.subject)}</span>` : ''}
          ${r.bookmarked ? '<span class="subject-tag">⭐ 북마크</span>' : ''}
        </div>
        <span class="review-status">${r.correct ? '✅' : '❌'}</span>
      `;
      card.appendChild(head);

      const q = document.createElement('div');
      q.className = 'review-question';
      q.textContent = r.question || '';
      card.appendChild(q);

      if (r.passage) {
        const p = document.createElement('div');
        p.className = 'review-passage';
        if (window.PassageRenderer && typeof window.PassageRenderer.render === 'function') {
          p.innerHTML = window.PassageRenderer.render(r.passage) || '';
        } else {
          p.textContent = typeof r.passage === 'string' ? r.passage : '';
        }
        card.appendChild(p);
      }

      const ch = document.createElement('div');
      ch.className = 'review-choices';
      (r.choices || []).forEach((text, i) => {
        const no = i + 1;
        let cls = 'review-choice';
        let badge = '';
        if (no === r.answer) { cls += ' is-answer'; badge = '<span class="badge-answer">정답</span>'; }
        if (no === r.picked && no !== r.answer) { cls += ' is-picked-wrong'; badge = '<span class="badge-picked">내 선택</span>'; }

        const div = document.createElement('div');
        div.className = cls;
        div.innerHTML = `
          <span class="choice-no">${no}</span>
          <span class="choice-text">${escapeHtml(text)}</span>
          ${badge}
        `;
        ch.appendChild(div);
      });
      card.appendChild(ch);

      const line = document.createElement('div');
      line.className = 'review-answer-line';
      line.innerHTML = `정답: <b>${r.answer}번</b> · 내 선택: <b>${r.picked ? r.picked + '번' : '미응답'}</b>`;
      card.appendChild(line);

      if (r.explanation) {
        const ex = document.createElement('div');
        ex.className = 'review-explanation';
        ex.innerHTML = `<b>💡 해설</b><br>${escapeHtml(r.explanation)}`;
        card.appendChild(ex);
      }

      list.appendChild(card);
    });
  }

  /* ============================================
     이벤트
     ============================================ */
  function bindEvents() {
    document.querySelectorAll('.review-tabs .tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.review-tabs .tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderReview(tab.dataset.filter);
      });
    });

    const retry = $('retry-wrong');
    if (retry) {
      retry.addEventListener('click', () => {
        const wrongCount = (data.review || []).filter(r => !r.correct).length;
        if (wrongCount === 0) {
          alert('🎉 오답이 없습니다!');
          return;
        }
        location.href = `exam.html?exam=${encodeURIComponent(data.examId)}&mode=wrong&session=${encodeURIComponent(data.sessionId)}`;
      });
    }
  }

  /* ===== 유틸 ===== */
  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

})();
