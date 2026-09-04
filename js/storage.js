/* ============================================
   안전과장 CBT - 로컬 저장소 관리
   storage.js
   ============================================ */

(function () {
  'use strict';

  const KEYS = {
    SESSIONS: 'cbt-sessions',              // 시험 결과 목록
    BOOKMARKS: 'cbt-global-bookmarks',     // 전역 북마크 (홈 모아보기)
    USER: 'cbt-current-user',              // 현재 로그인 사용자 (Phase 2용)
  };

  // ===== 사용자 스코프 키 =====
  // 로그인 시스템이 붙으면 사용자별로 분리되도록 준비
  function scopedKey(key) {
    const user = getCurrentUser();
    return user ? `${key}-${user}` : key;
  }

  function getCurrentUser() {
    try {
      return localStorage.getItem(KEYS.USER) || null;
    } catch { return null; }
  }

  function setCurrentUser(username) {
    if (username) localStorage.setItem(KEYS.USER, username);
    else localStorage.removeItem(KEYS.USER);
  }

  // ===== 세션 (시험 결과) =====
  function saveSession(sessionId, data) {
    const key = scopedKey(KEYS.SESSIONS);
    let sessions = {};
    try {
      sessions = JSON.parse(localStorage.getItem(key) || '{}');
    } catch { sessions = {}; }
    sessions[sessionId] = data;
    localStorage.setItem(key, JSON.stringify(sessions));
  }

  function getSession(sessionId) {
    const key = scopedKey(KEYS.SESSIONS);
    try {
      const sessions = JSON.parse(localStorage.getItem(key) || '{}');
      return sessions[sessionId] || null;
    } catch { return null; }
  }

  function getAllSessions() {
    const key = scopedKey(KEYS.SESSIONS);
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
  }

  function deleteSession(sessionId) {
    const key = scopedKey(KEYS.SESSIONS);
    try {
      const sessions = JSON.parse(localStorage.getItem(key) || '{}');
      delete sessions[sessionId];
      localStorage.setItem(key, JSON.stringify(sessions));
    } catch {}
  }

  // ===== 북마크 (홈 모아보기용 전역 저장) =====
  // 구조: { "2022-04-24": { 7: { question, subject, choices, answer, explanation }, ... }, ... }
  function setGlobalBookmark(examId, questionNo, isBookmarked, questionObj) {
    const key = scopedKey(KEYS.BOOKMARKS);
    let bm = {};
    try {
      bm = JSON.parse(localStorage.getItem(key) || '{}');
    } catch { bm = {}; }

    if (!bm[examId]) bm[examId] = {};

    if (isBookmarked && questionObj) {
      bm[examId][questionNo] = {
        no: questionObj.no,
        subject: questionObj.subject || '',
        question: questionObj.question || '',
        passage: questionObj.passage || null,
        choices: questionObj.choices || [],
        answer: questionObj.answer,
        explanation: questionObj.explanation || '',
        savedAt: Date.now(),
      };
    } else {
      delete bm[examId][questionNo];
      if (Object.keys(bm[examId]).length === 0) delete bm[examId];
    }

    localStorage.setItem(key, JSON.stringify(bm));
  }

  function getAllBookmarks() {
    const key = scopedKey(KEYS.BOOKMARKS);
    try {
      return JSON.parse(localStorage.getItem(key) || '{}');
    } catch { return {}; }
  }

  function getBookmarkList() {
    // 홈 화면에서 사용: 배열 형태로 평탄화
    const bm = getAllBookmarks();
    const list = [];
    Object.keys(bm).forEach(examId => {
      Object.keys(bm[examId]).forEach(no => {
        list.push({
          examId: examId,
          ...bm[examId][no],
        });
      });
    });
    // 최신순
    list.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    return list;
  }

  function clearBookmark(examId, questionNo) {
    setGlobalBookmark(examId, questionNo, false);
  }

  // ===== 통계 (홈 상단용) =====
  function getStats() {
    const sessions = getAllSessions();
    const arr = Object.values(sessions);
    const total = arr.length;
    const avgScore = total > 0
      ? Math.round(arr.reduce((sum, s) => sum + (s.score || 0), 0) / total)
      : 0;
    const bookmarks = getBookmarkList();
    return {
      totalSessions: total,
      avgScore: avgScore,
      bookmarkCount: bookmarks.length,
    };
  }

  // ===== 전체 초기화 =====
  function clearAll() {
    const user = getCurrentUser();
    if (user) {
      localStorage.removeItem(`${KEYS.SESSIONS}-${user}`);
      localStorage.removeItem(`${KEYS.BOOKMARKS}-${user}`);
    } else {
      localStorage.removeItem(KEYS.SESSIONS);
      localStorage.removeItem(KEYS.BOOKMARKS);
    }
  }

  // ===== 외부 노출 =====
  window.Storage = {
    // 세션
    saveSession,
    getSession,
    getAllSessions,
    deleteSession,
    // 북마크
    setGlobalBookmark,
    getAllBookmarks,
    getBookmarkList,
    clearBookmark,
    // 통계
    getStats,
    // 사용자 (Phase 2)
    getCurrentUser,
    setCurrentUser,
    // 초기화
    clearAll,
  };

})();
