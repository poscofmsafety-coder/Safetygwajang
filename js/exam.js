/* ============================================
   안전과장 CBT - 시험 진행 로직
   exam.js (v5 - 랜덤 문제은행 출제 기능 추가)
   ============================================ */

(function () {
  'use strict';

  /* ============================================
     랜덤 시험 설정
     ============================================ */

  const RANDOM_EXAM_ID = 'random';

  const RANDOM_EXAM_STORAGE_KEY = 'cbt-random-exam-v1';

  /*
   * 랜덤 출제에 사용할 산업안전기사 기출 파일 목록입니다.
   * 새 회차를 추가하면 이 배열에만 파일명을 추가하면 됩니다.
   */
  const RANDOM_POOL_FILES = [
    '2022-03-05',
    '2022-04-24',
    '2023-05-13',
    '2023-07-08',
    '2024-02-17',
    '2024-05-11',
    '2024-07-06',
    '2025-02-08',
    '2025-05-10',
    '2025-08-09',
    '2026-01-31',
    '2026-05-09'
  ];

  /*
   * 구형 과목명과 신규 과목명을 모두 신규 과목명으로 통일합니다.
   */
  const SUBJECT_MAP = {
    '안전관리론': '산업재해 예방 및 안전보건교육',
    '산업재해 예방 및 안전보건교육': '산업재해 예방 및 안전보건교육',

    '인간공학 및 시스템안전공학': '인간공학 및 위험성 평가·관리',
    '인간공학-시스템안전공학': '인간공학 및 위험성 평가·관리',
    '인간공학 및 위험성 평가·관리': '인간공학 및 위험성 평가·관리',

    '기계위험방지기술': '기계·기구 및 설비 안전 관리',
    '기계·기구 및 설비 안전 관리': '기계·기구 및 설비 안전 관리',

    '전기위험방지기술': '전기설비 안전 관리',
    '전기설비 안전 관리': '전기설비 안전 관리',

    '화학설비위험방지기술': '화학설비 안전 관리',
    '화학설비 안전 관리': '화학설비 안전 관리',

    '건설안전기술': '건설공사 안전 관리',
    '건설공사 안전 관리': '건설공사 안전 관리'
  };

  const RANDOM_SUBJECTS = [
    { name: '산업재해 예방 및 안전보건교육', range: [1, 20] },
    { name: '인간공학 및 위험성 평가·관리', range: [21, 40] },
    { name: '기계·기구 및 설비 안전 관리', range: [41, 60] },
    { name: '전기설비 안전 관리', range: [61, 80] },
    { name: '화학설비 안전 관리', range: [81, 100] },
    { name: '건설공사 안전 관리', range: [101, 120] }
  ];

  const QUESTIONS_PER_SUBJECT = 20;

  // ===== 전역 상태 =====
  const state = {
    examId: null,
    examTitle: '',
    mode: 'exam',
    sessionId: null,
    questions: [],
    answers: {},
    bookmarks: {},
    perPage: 2,
    currentPage: 1,
    totalPages: 1,
    startTime: null,
    timerInterval: null,
    autoSaveInterval: null,
    durationMin: null,
    timeLimit: 150 * 60,
    submitted: false,
    isRandomExam: false,
    randomCreatedAt: null,
  };

  const $ = (id) => document.getElementById(id);
  const els = {};

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    els.title = $('exam-title');
    els.timer = $('timer');
    els.modeToggle = $('mode-toggle');
    els.resetBtn = $('reset-btn');
    els.saveBtn = $('save-btn');
    els.homeBtn = $('home-btn');
    els.submitBtn = $('submit-btn');
    els.progressFill = $('progress-fill');
    els.perPage = $('per-page');
    els.jumpBtn = $('jump-input-btn');
    els.answeredCount = $('answered-count');
    els.questionArea = $('question-area');
    els.prevPage = $('prev-page');
    els.nextPage = $('next-page');
    els.pageInfo = $('page-info');

    const params = new URLSearchParams(window.location.search);
    state.examId = params.get('exam');
    state.mode = params.get('mode') || 'exam';
    state.sessionId = params.get('session');

    const forceNew = params.get('new') === '1';

    if (!state.examId) {
      els.questionArea.innerHTML =
        '<p class="loading">❌ 시험 정보가 없습니다. <a href="index.html?audience=jobseeker">홈으로</a></p>';
      return;
    }

    state.isRandomExam = state.examId === RANDOM_EXAM_ID;

    showLoading();

    try {
      await loadExamData(forceNew);
    } catch (err) {
      console.error('시험 데이터 로드 실패:', err);
      showLoadError(err);
      return;
    }

    if (state.isRandomExam && forceNew) {
      cleanUrl();
    }

    if (state.mode === 'wrong' && state.sessionId) {
      filterWrongQuestions();
    }

    if (state.questions.length === 0) {
      els.questionArea.innerHTML =
        '<p class="loading">😅 풀 문제가 없습니다. <a href="index.html?audience=jobseeker">홈으로</a></p>';
      return;
    }

    applyTimeLimit();
    restoreProgress();
    bindEvents();
    updateTitle();

    const jumpTo = params.get('jumpTo');
    if (jumpTo) {
      const targetNo = parseInt(jumpTo, 10);
      const idx = state.questions.findIndex(q => q.no === targetNo);
      if (idx >= 0) {
        state.currentPage = Math.floor(idx / state.perPage) + 1;
      }
    }

    renderPage();
    startTimer();
    startAutoSave();

    ensureKatexReady().then(() => {
      renderPage();
    });

    window.addEventListener('beforeunload', beforeUnloadHandler);
  }

  function showLoading() {
    if (!els.questionArea) return;

    if (state.isRandomExam) {
      els.questionArea.innerHTML = `
        <div class="loading">
          <p>🎲 랜덤 기출문제를 생성하고 있습니다.</p>
          <p>${RANDOM_POOL_FILES.length}개 회차에서 과목별
          ${QUESTIONS_PER_SUBJECT}문항을 추출합니다.</p>
        </div>
      `;
    } else {
      els.questionArea.innerHTML =
        '<p class="loading">문제를 불러오는 중입니다...</p>';
    }
  }

  function showLoadError(err) {
    const msg = escapeHtml(err && err.message ? err.message : '알 수 없는 오류');

    if (state.isRandomExam) {
      els.questionArea.innerHTML = `
        <div class="loading">
          <p>❌ 랜덤 문제를 생성할 수 없습니다.</p>
          <p>${msg}</p>
          <p><a href="index.html?audience=jobseeker">홈으로</a></p>
        </div>
      `;
    } else {
      els.questionArea.innerHTML = `
        <div class="loading">
          <p>❌ 문제 파일을 불러올 수 없습니다.</p>
          <p>파일: <code>data/${escapeHtml(state.examId)}.json</code></p>
          <p>${msg}</p>
          <p><a href="index.html?audience=jobseeker">홈으로</a></p>
        </div>
      `;
    }
  }

  function cleanUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('new');
      window.history.replaceState({}, document.title,
        url.pathname + url.search + url.hash);
    } catch (e) {
      console.warn('URL 정리 실패:', e);
    }
  }

  /* ============================================
     자격증별 시험시간 자동 결정
     ============================================ */

  function applyTimeLimit() {
    const text = `${state.examId || ''} ${state.examTitle || ''}`;
    const count = state.questions.length;
    let min;

    if (state.durationMin && state.durationMin > 0) {
      min = state.durationMin;
    } else if (state.mode === 'wrong') {
      min = Math.max(10, Math.ceil(count * 1.5));
    } else if (/중복기출/.test(text)) {
      min = Math.max(30, Math.ceil(count * 1.5));
    } else if (/위험물산업기사/.test(text)) {
      min = 90;
    } else if (/위험물기능장/.test(text)) {
      min = 60;
    } else if (/산업위생관리기사/.test(text)) {
      min = 150;
    } else if (/인간공학기사/.test(text)) {
      min = 120;
    } else {
      min = 150;
    }

    if (state.mode === 'wrong') {
      min = Math.max(10, Math.ceil(count * 1.5));
    }

    state.timeLimit = min * 60;
  }

  function ensureKatexReady() {
    return new Promise(resolve => {
      if (window.katex) return resolve();
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        if (window.katex || tries > 20) {
          clearInterval(timer);
          resolve();
        }
      }, 100);
    });
  }

  function startAutoSave() {
    state.autoSaveInterval = setInterval(() => {
      if (!state.submitted && Object.keys(state.answers).length > 0) {
        saveProgress();
      }
    }, 30000);
  }

  /* ============================================
     데이터 로드
     ============================================ */

  async function loadExamData(forceNew) {
    if (state.isRandomExam) {
      await loadRandomExam(forceNew);
      return;
    }

    const res = await fetch(`data/${encodeURIComponent(state.examId)}.json`);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    state.examTitle = data.title || state.examId;
    state.questions = Array.isArray(data.questions) ? data.questions : [];
    state.durationMin = Number(data.duration || data.timeLimitMin || 0) || null;

    state.questions.forEach((q, i) => {
      if (typeof q.no !== 'number') q.no = i + 1;
    });
  }

  /*
   * 랜덤 시험 로드 규칙
   * - ?new=1 이면 항상 새로 생성
   * - 저장된 랜덤 시험이 있고 풀던 답안도 남아 있으면 이어서 진행
   * - 그 외에는 새로 생성 (홈에서 다시 들어올 때마다 새 문제)
   */
  async function loadRandomExam(forceNew) {
    let exam = null;

    if (!forceNew) {
      const saved = getSavedRandomExam();
      const hasProgress = hasSavedAnswers(`exam-progress-${RANDOM_EXAM_ID}`);
      if (saved && hasProgress) exam = saved;
    }

    if (!exam) {
      exam = await createRandomExam();
    }

    state.examTitle = exam.title || '랜덤 기출문제';
    state.questions = exam.questions;
    state.durationMin = Number(exam.duration) || 150;
    state.randomCreatedAt = exam.createdAt || null;

    state.questions.forEach((q, i) => {
      q.no = i + 1;
    });
  }

  function hasSavedAnswers(key) {
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      return !!(saved.answers && Object.keys(saved.answers).length > 0);
    } catch (e) {
      return false;
    }
  }

  function getSavedRandomExam() {
    try {
      const raw = localStorage.getItem(RANDOM_EXAM_STORAGE_KEY);
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const expected = RANDOM_SUBJECTS.length * QUESTIONS_PER_SUBJECT;

      if (!parsed || !Array.isArray(parsed.questions) ||
          parsed.questions.length !== expected) {
        localStorage.removeItem(RANDOM_EXAM_STORAGE_KEY);
        return null;
      }

      return parsed;
    } catch (e) {
      localStorage.removeItem(RANDOM_EXAM_STORAGE_KEY);
      return null;
    }
  }

  async function createRandomExam() {
    const bank = await loadQuestionBank();
    const selected = [];

    RANDOM_SUBJECTS.forEach(subject => {
      const pool = dedupe(bank.filter(q => q.subject === subject.name));

      if (pool.length < QUESTIONS_PER_SUBJECT) {
        throw new Error(
          `${subject.name} 문항 부족 (중복 제거 후 ${pool.length}문항)`
        );
      }

      selected.push(...shuffle(pool).slice(0, QUESTIONS_PER_SUBJECT));
    });

    const exam = {
      examId: RANDOM_EXAM_ID,
      title: '랜덤 기출문제',
      duration: 150,
      passingScore: 60,
      subjects: RANDOM_SUBJECTS,
      questions: selected.map((q, i) => ({ ...q, no: i + 1 })),
      createdAt: new Date().toISOString(),
    };

    try {
      localStorage.removeItem(`exam-progress-${RANDOM_EXAM_ID}`);
      localStorage.setItem(RANDOM_EXAM_STORAGE_KEY, JSON.stringify(exam));
    } catch (e) {
      console.warn('랜덤 시험 저장 실패(용량 초과 가능):', e);
    }

    return exam;
  }

  async function loadQuestionBank() {
    const results = await Promise.allSettled(
      RANDOM_POOL_FILES.map(async (id) => {
        const url = `data/${encodeURIComponent(id)}.json?_=${Date.now()}`;
        const res = await fetch(url, { cache: 'no-store' });

        if (!res.ok) throw new Error(`${id}.json HTTP ${res.status}`);

        const data = await res.json();

        if (!data || !Array.isArray(data.questions)) {
          throw new Error(`${id}.json 에 questions 배열이 없습니다.`);
        }

        return { id, data };
      })
    );

    const loaded = [];
    const failed = [];

    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        loaded.push(r.value);
      } else {
        failed.push(`${RANDOM_POOL_FILES[i]} (${r.reason.message})`);
      }
    });

    if (failed.length > 0) {
      console.warn('랜덤 문제은행 일부 로드 실패:', failed);
    }

    if (loaded.length === 0) {
      throw new Error('문제 파일을 하나도 불러오지 못했습니다.');
    }

    const bank = [];

    loaded.forEach(({ id, data }) => {
      data.questions.forEach((q, idx) => {
        if (!q) return;

        const subject = normalizeSubject(q.subject, q.no);
        if (!subject) return;

        bank.push({
          ...q,
          subject: subject,
          sourceExamId: data.examId || id,
          sourceTitle: data.title || '',
          sourceNo: typeof q.no === 'number' ? q.no : idx + 1,
        });
      });
    });

    if (bank.length === 0) {
      throw new Error('사용 가능한 문항이 없습니다.');
    }

    return bank;
  }

  function normalizeSubject(subject, no) {
    if (subject && SUBJECT_MAP[subject]) return SUBJECT_MAP[subject];

    // 과목명이 없거나 인식 불가하면 원본 번호 범위로 분류
    const n = Number(no);
    if (n >= 1 && n <= 20) return RANDOM_SUBJECTS[0].name;
    if (n >= 21 && n <= 40) return RANDOM_SUBJECTS[1].name;
    if (n >= 41 && n <= 60) return RANDOM_SUBJECTS[2].name;
    if (n >= 61 && n <= 80) return RANDOM_SUBJECTS[3].name;
    if (n >= 81 && n <= 100) return RANDOM_SUBJECTS[4].name;
    if (n >= 101 && n <= 120) return RANDOM_SUBJECTS[5].name;

    return null;
  }

  function dedupe(questions) {
    const map = new Map();

    questions.forEach(q => {
      const key = String(q.question || '')
        .normalize('NFKC')
        .replace(/\s+/g, ' ')
        .replace(/[“”]/g, '"')
        .replace(/[‘’]/g, "'")
        .trim()
        .toLowerCase();

      if (key && !map.has(key)) map.set(key, q);
    });

    return [...map.values()];
  }

  function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  /* ============================================
     오답 필터링
     ============================================ */

  function filterWrongQuestions() {
    const session = (window.Storage && window.Storage.getSession)
      ? window.Storage.getSession(state.sessionId)
      : null;

    if (!session || !session.answers) {
      alert('원본 세션 정보를 찾을 수 없어 전체 문제로 진행합니다.');
      state.mode = 'exam';
      return;
    }

    const wrongNos = [];
    state.questions.forEach(q => {
      const picked = session.answers[q.no];
      if (picked !== q.answer) wrongNos.push(q.no);
    });

    if (wrongNos.length === 0) {
      alert('🎉 오답이 없습니다! 전체 문제로 진행합니다.');
      state.mode = 'exam';
      return;
    }

    state.questions = state.questions.filter(q => wrongNos.includes(q.no));
    state.examTitle += ` · 오답 재도전 (${state.questions.length}문항)`;
  }

  /* ============================================
     진행상황 저장 및 복구
     ============================================ */

  function restoreProgress() {
    const key = getStorageKey();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      state.answers = saved.answers || {};
      state.bookmarks = saved.bookmarks || {};
      state.perPage = saved.perPage || 2;
      state.currentPage = saved.currentPage || 1;
      state.startTime = saved.startTime || Date.now();

      const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
      if (elapsed >= state.timeLimit) {
        state.startTime = Date.now();
      }

      if (els.perPage) els.perPage.value = state.perPage;
    } catch (e) {
      state.answers = {};
      state.bookmarks = {};
      state.startTime = Date.now();
    }
    updateTotalPages();
  }

  function saveProgress() {
    const key = getStorageKey();
    const data = {
      answers: state.answers,
      bookmarks: state.bookmarks,
      perPage: state.perPage,
      currentPage: state.currentPage,
      startTime: state.startTime,
      lastSavedAt: Date.now(),
    };
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn('저장 실패:', e);
      return false;
    }
  }

  function getStorageKey() {
    const modeSuffix = state.mode === 'wrong' ? `-wrong-${state.sessionId}` : '';
    return `exam-progress-${state.examId}${modeSuffix}`;
  }

  /* ============================================
     이벤트 바인딩
     ============================================ */

  function bindEvents() {
    els.perPage.addEventListener('change', () => {
      state.perPage = parseInt(els.perPage.value, 10) || 2;
      state.currentPage = 1;
      updateTotalPages();
      renderPage();
      saveProgress();
    });

    els.prevPage.addEventListener('click', () => {
      if (state.currentPage > 1) {
        state.currentPage--;
        renderPage();
        saveProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    els.nextPage.addEventListener('click', () => {
      if (state.currentPage < state.totalPages) {
        state.currentPage++;
        renderPage();
        saveProgress();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    els.jumpBtn.addEventListener('click', () => {
      const total = state.questions.length;
      const input = prompt(`이동할 문제 번호 (1 ~ ${total}):`);
      if (!input) return;
      const target = parseInt(input, 10);
      if (isNaN(target) || target < 1 || target > total) {
        alert('올바른 문제 번호를 입력하세요.');
        return;
      }
      const idx = state.questions.findIndex(q => q.no === target);
      const useIdx = idx >= 0 ? idx : (target - 1);
      state.currentPage = Math.floor(useIdx / state.perPage) + 1;
      renderPage();
      saveProgress();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    els.modeToggle.addEventListener('click', () => {
      if (state.mode === 'wrong') {
        alert('오답 재도전은 실전 모드로만 진행됩니다.');
        return;
      }
      if (state.mode === 'exam') {
        state.mode = 'study';
        els.modeToggle.textContent = '📖 학습모드';
        els.modeToggle.classList.add('btn-primary');
      } else {
        state.mode = 'exam';
        els.modeToggle.textContent = '🎯 실전모드';
        els.modeToggle.classList.remove('btn-primary');
      }
      renderPage();
    });

    els.resetBtn.addEventListener('click', handleReset);

    if (els.saveBtn) {
      els.saveBtn.addEventListener('click', () => {
        const ok = saveProgress();
        const answered = Object.keys(state.answers).length;
        if (ok) {
          showToast(`💾 저장 완료! (${answered}문항 진행 중)`);
        } else {
          showToast('⚠️ 저장에 실패했습니다.', 3000);
        }
      });
    }

    if (els.homeBtn) {
      els.homeBtn.addEventListener('click', () => {
        const answered = Object.keys(state.answers).length;
        const msg = answered > 0
          ? `💾 현재까지 푼 ${answered}문항이 저장됩니다.\n\n나중에 다시 이 시험을 선택하면 이어서 풀 수 있습니다.\n\n홈으로 이동할까요?`
          : '홈으로 이동하시겠습니까?';
        if (!confirm(msg)) return;

        saveProgress();
        clearInterval(state.autoSaveInterval);
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        window.location.href = 'index.html?audience=jobseeker';
      });
    }

    els.submitBtn.addEventListener('click', () => handleSubmit(false));
  }

  function handleReset() {
    if (state.isRandomExam) {
      const makeNew = confirm(
        '🎲 랜덤 기출문제입니다.\n\n' +
        '[확인] 새로운 120문항을 다시 뽑습니다.\n' +
        '[취소] 현재 문제는 유지하고 답안만 지웁니다.'
      );

      if (makeNew) {
        if (!confirm('⚠️ 현재 답안이 모두 삭제됩니다. 계속할까요?')) return;

        localStorage.removeItem(getStorageKey());
        localStorage.removeItem(RANDOM_EXAM_STORAGE_KEY);
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        window.location.href = 'exam.html?exam=random&new=1';
        return;
      }
    }

    if (!confirm('⚠️ 현재 시험의 답안과 진행상황을 모두 지웁니다. 계속할까요?')) return;

    state.answers = {};
    state.bookmarks = {};
    state.currentPage = 1;
    state.startTime = Date.now();
    state.submitted = false;
    saveProgress();
    renderPage();
    showToast('↺ 초기화되었습니다.');
  }

  /* ============================================
     제목
     ============================================ */

  function updateTitle() {
    const min = Math.round(state.timeLimit / 60);
    els.title.textContent =
      `${state.examTitle || state.examId} (${state.questions.length}문항 / ${min}분)`;

    if (state.mode === 'wrong') {
      els.modeToggle.style.display = 'none';
    }
  }

  /* ============================================
     페이지
     ============================================ */

  function updateTotalPages() {
    state.totalPages = Math.max(1,
      Math.ceil(state.questions.length / state.perPage));
    if (state.currentPage > state.totalPages) {
      state.currentPage = state.totalPages;
    }
  }

  function renderPage() {
    updateTotalPages();
    const start = (state.currentPage - 1) * state.perPage;
    const end = Math.min(start + state.perPage, state.questions.length);
    const pageQuestions = state.questions.slice(start, end);

    els.questionArea.innerHTML = '';
    pageQuestions.forEach(q => {
      els.questionArea.appendChild(renderQuestionCard(q));
    });

    els.pageInfo.textContent = `${state.currentPage} / ${state.totalPages}`;
    els.prevPage.disabled = state.currentPage === 1;
    els.nextPage.disabled = state.currentPage === state.totalPages;

    updateProgress();
  }

  /* ============================================
     문제 카드
     ============================================ */

  function renderQuestionCard(q) {
    const card = document.createElement('div');
    card.className = 'question-card';
    if (state.bookmarks[q.no]) card.classList.add('bookmarked');
    card.dataset.no = q.no;

    const header = document.createElement('div');
    header.className = 'question-header';
    header.innerHTML = `
      <div>
        <span class="question-no">${q.no}</span>
        ${q.subject ? `<span class="subject-tag">${escapeHtml(q.subject)}</span>` : ''}
      </div>
      <div class="question-actions">
        <button class="btn-icon bookmark-btn" title="북마크" data-no="${q.no}" type="button">
          ${state.bookmarks[q.no] ? '⭐' : '☆'}
        </button>
      </div>
    `;
    card.appendChild(header);

    const qText = document.createElement('div');
    qText.className = 'question-text';
    qText.textContent = q.question || '';
    card.appendChild(qText);

    if (q.passage) {
      const passageEl = renderPassage(q.passage);
      if (passageEl) card.appendChild(passageEl);
    }

    const choicesDiv = document.createElement('div');
    choicesDiv.className = 'choices';
    (q.choices || []).forEach((choiceText, idx) => {
      const choiceNo = idx + 1;
      const choice = document.createElement('div');
      choice.className = 'choice';
      choice.dataset.no = q.no;
      choice.dataset.choice = choiceNo;

      const picked = state.answers[q.no];
      if (picked === choiceNo) choice.classList.add('selected');

      if (state.mode === 'study' && picked) {
        if (choiceNo === q.answer) choice.classList.add('correct');
        else if (choiceNo === picked) choice.classList.add('wrong');
      }

      choice.innerHTML = `
        <span class="choice-no">${choiceNo}</span>
        <span class="choice-text">${escapeHtml(choiceText)}</span>
      `;
      choice.addEventListener('click', () => handleChoiceClick(q, choiceNo));
      choicesDiv.appendChild(choice);
    });
    card.appendChild(choicesDiv);

    if (q.explanation) {
      const exp = document.createElement('div');
      exp.className = 'explanation';
      if (state.mode === 'study' && state.answers[q.no]) exp.classList.add('show');
      exp.innerHTML = `<span class="label">💡 해설</span>${escapeHtml(q.explanation)}`;
      card.appendChild(exp);
    }

    const bmBtn = header.querySelector('.bookmark-btn');
    bmBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(q.no);
    });

    return card;
  }

  /* ============================================
     passage 렌더링
     ============================================ */

  function renderPassage(passage) {
    if (window.PassageRenderer && typeof window.PassageRenderer.render === 'function') {
      const html = window.PassageRenderer.render(passage);
      if (html) {
        const wrapper = document.createElement('div');
        wrapper.className = 'passage passage-v2';
        wrapper.innerHTML = html;
        return wrapper;
      }
    }

    const box = document.createElement('div');
    box.className = 'passage';

    if (typeof passage === 'string') {
      box.classList.add('type-text');
      box.textContent = passage;
      return box;
    }

    if (Array.isArray(passage)) {
      box.classList.add('type-mixed');
      passage.forEach(item => {
        const el = renderPassageItem(item);
        if (el) box.appendChild(el);
      });
      return box;
    }

    const el = renderPassageItem(passage);
    if (el) box.appendChild(el);
    return box;
  }

  function renderPassageItem(passage) {
    if (!passage) return null;

    if (typeof passage === 'string') {
      const p = document.createElement('div');
      p.textContent = passage;
      return p;
    }

    const type = passage.type || 'text';
    const section = document.createElement('div');
    section.className = `passage-section type-${type}`;

    if (passage.caption) {
      const cap = document.createElement('div');
      cap.className = 'passage-caption';
      cap.textContent = passage.caption;
      section.appendChild(cap);
    }

    if (passage.title) {
      const t = document.createElement('div');
      t.className = 'passage-title';
      t.textContent = passage.title;
      section.appendChild(t);
    }

    if (type === 'list') {
      const list = document.createElement(passage.ordered ? 'ol' : 'ul');
      (passage.items || []).forEach(item => {
        const li = document.createElement('li');
        li.textContent = item;
        list.appendChild(li);
      });
      section.appendChild(list);
      return section;
    }

    if (type === 'table') {
      const table = document.createElement('table');

      if (Array.isArray(passage.headers) && passage.headers.length) {
        const thead = document.createElement('thead');
        const tr = document.createElement('tr');
        passage.headers.forEach(h => {
          const th = document.createElement('th');
          th.textContent = h;
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
      }

      const tbody = document.createElement('tbody');
      (passage.rows || []).forEach(row => {
        const tr = document.createElement('tr');
        (row || []).forEach(cell => {
          const td = document.createElement('td');
          td.textContent = cell;
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      section.appendChild(table);
      return section;
    }

    if (type === 'svg') {
      const wrap = document.createElement('div');
      wrap.className = 'passage-svg';
      wrap.innerHTML = passage.content || '';
      section.appendChild(wrap);
      return section;
    }

    if (type === 'katex') {
      const f = document.createElement('div');
      f.className = passage.display ? 'katex-display-wrapper' : 'katex-inline-wrapper';
      const content = passage.content || '';

      if (window.katex) {
        try {
          window.katex.render(content, f, {
            displayMode: passage.display !== false,
            throwOnError: false,
          });
        } catch (e) {
          f.textContent = content;
        }
      } else {
        f.textContent = content;
      }

      section.appendChild(f);
      return section;
    }

    const text = document.createElement('div');
    text.className = 'passage-text';
    text.textContent = passage.text || passage.content || '';
    section.appendChild(text);
    return section;
  }

  function handleChoiceClick(q, choiceNo) {
    if (state.submitted) return;
    state.answers[q.no] = choiceNo;
    saveProgress();
    renderPage();
    updateProgress();
  }

  function toggleBookmark(no) {
    if (state.bookmarks[no]) {
      delete state.bookmarks[no];
    } else {
      state.bookmarks[no] = true;
    }
    saveProgress();

    if (window.Storage && window.Storage.setGlobalBookmark) {
      const q = state.questions.find(qq => qq.no === no);
      if (q) {
        window.Storage.setGlobalBookmark(
          state.examId, no, !!state.bookmarks[no], q);
      }
    }
    renderPage();
  }

  function updateProgress() {
    const total = state.questions.length;
    const answered = state.questions.filter(q => state.answers[q.no] != null).length;
    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    els.progressFill.style.width = percent + '%';
    els.answeredCount.textContent = `${answered} / ${total} 답변`;
  }

  /* ============================================
     타이머
     ============================================ */

  function startTimer() {
    if (!state.startTime) state.startTime = Date.now();
    updateTimer();
    state.timerInterval = setInterval(updateTimer, 1000);
  }

  function updateTimer() {
    const elapsed = Math.floor((Date.now() - state.startTime) / 1000);
    const remaining = Math.max(0, state.timeLimit - elapsed);

    els.timer.classList.remove('warning', 'danger');
    if (remaining <= 60) els.timer.classList.add('danger');
    else if (remaining <= 300) els.timer.classList.add('warning');

    els.timer.textContent = formatTime(remaining);

    if (remaining === 0) {
      clearInterval(state.timerInterval);
      alert('⏰ 시험 시간이 종료되었습니다. 자동 제출됩니다.');
      handleSubmit(true);
    }
  }

  function formatTime(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  /* ============================================
     제출
     ============================================ */

  function handleSubmit(auto = false) {
    if (state.submitted) return;

    const total = state.questions.length;
    const answered = state.questions.filter(q => state.answers[q.no] != null).length;

    if (!auto) {
      const unanswered = total - answered;
      const msg = unanswered > 0
        ? `⚠️ ${unanswered}문항을 풀지 않았습니다.\n\n정말 제출하시겠습니까?`
        : `총 ${total}문항 모두 답변했습니다.\n\n제출하시겠습니까?`;
      if (!confirm(msg)) return;
    }

    state.submitted = true;
    clearInterval(state.timerInterval);
    clearInterval(state.autoSaveInterval);

    let correct = 0;
    const subjectStats = {};
    const reviewData = [];

    state.questions.forEach(q => {
      const picked = state.answers[q.no] || null;
      const isCorrect = picked === q.answer;
      if (isCorrect) correct++;

      const subj = q.subject || '전체';
      if (!subjectStats[subj]) subjectStats[subj] = { correct: 0, total: 0 };
      subjectStats[subj].total++;
      if (isCorrect) subjectStats[subj].correct++;

      reviewData.push({
        no: q.no,
        subject: subj,
        question: q.question,
        passage: q.passage || null,
        choices: q.choices,
        answer: q.answer,
        picked: picked,
        correct: isCorrect,
        explanation: q.explanation || '',
        bookmarked: !!state.bookmarks[q.no],
        sourceExamId: q.sourceExamId || null,
        sourceNo: q.sourceNo || null,
      });
    });

    const elapsedSec = Math.floor((Date.now() - state.startTime) / 1000);
    const sessionId = 'sess-' + Date.now();

    const resultData = {
      sessionId: sessionId,
      examId: state.examId,
      examTitle: state.examTitle,
      mode: state.mode,
      isRandomExam: state.isRandomExam,
      randomCreatedAt: state.randomCreatedAt,
      total: total,
      correct: correct,
      score: total > 0 ? Math.round((correct / total) * 100) : 0,
      elapsedSec: elapsedSec,
      timeLimitSec: state.timeLimit,
      subjectStats: subjectStats,
      review: reviewData,
      answers: state.answers,
      bookmarks: state.bookmarks,
      submittedAt: Date.now(),
    };

    if (window.Storage && window.Storage.saveSession) {
      window.Storage.saveSession(sessionId, resultData);
    } else {
      localStorage.setItem(`result-${sessionId}`, JSON.stringify(resultData));
    }

    localStorage.removeItem(getStorageKey());
    window.removeEventListener('beforeunload', beforeUnloadHandler);

    window.location.href = `result.html?session=${sessionId}`;
  }

  function beforeUnloadHandler(e) {
    if (state.submitted) return;
    if (Object.keys(state.answers).length === 0) return;
    saveProgress();
    e.preventDefault();
    e.returnValue = '';
    return '';
  }

  /* ============================================
     토스트
     ============================================ */

  let toastTimer = null;
  function showToast(message, duration = 2000) {
    let toast = document.getElementById('cbt-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cbt-toast';
      toast.style.cssText = `
        position: fixed; bottom: 30px; left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: rgba(30, 41, 59, 0.95); color: #fff;
        padding: 12px 24px; border-radius: 8px;
        font-size: 0.95rem; font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 9999; opacity: 0;
        transition: opacity 0.25s ease, transform 0.25s ease;
        pointer-events: none; max-width: 90%; text-align: center;
      `;
      document.body.appendChild(toast);
    }

    toast.textContent = message;

    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(-50%) translateY(20px)';
    }, duration);
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
