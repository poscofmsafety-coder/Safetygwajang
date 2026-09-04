/* ============================================
   안전과장 CBT - Passage 렌더러
   passage-renderer.js
   
   지원 타입:
   - text     : 일반 텍스트
   - html     : 안전한 HTML (제한적)
   - table    : 표 (headers + rows)
   - list     : 순서/무순서 리스트
   - katex    : 수식 (LaTeX)
   - svg      : 인라인 SVG
   - callout  : 강조 박스 (조건/정의문)
   ============================================ */

(function () {
  'use strict';

  /**
   * passage 데이터를 HTML 문자열로 변환
   * @param {string|Array|Object} passage
   * @returns {string} HTML
   */
  function renderPassage(passage) {
    if (!passage) return '';

    // 하위 호환: 문자열이면 텍스트로 처리
    if (typeof passage === 'string') {
      return `<div class="passage-block passage-text">${escapeHtml(passage).replace(/\n/g, '<br>')}</div>`;
    }

    // 배열이면 각 요소를 순회
    if (Array.isArray(passage)) {
      return passage.map(item => renderItem(item)).join('');
    }

    // 단일 객체면 배열로 감싸서 처리
    if (typeof passage === 'object') {
      return renderItem(passage);
    }

    return '';
  }

  function renderItem(item) {
    if (!item || typeof item !== 'object') return '';

    switch (item.type) {
      case 'text':
        return renderText(item);
      case 'html':
        return renderHtml(item);
      case 'table':
        return renderTable(item);
      case 'list':
        return renderList(item);
      case 'katex':
        return renderKatex(item);
      case 'svg':
        return renderSvg(item);
      case 'callout':
        return renderCallout(item);
      default:
        console.warn('알 수 없는 passage 타입:', item.type);
        return '';
    }
  }

  // ===== 타입별 렌더러 =====

  function renderText(item) {
    const content = escapeHtml(item.content || '').replace(/\n/g, '<br>');
    return `<div class="passage-block passage-text">${content}</div>`;
  }

  function renderHtml(item) {
    // 제한적으로 허용: 태그를 완전히 이스케이프하지 않되 script/onerror 등만 제거
    const safe = sanitizeHtml(item.content || '');
    return `<div class="passage-block passage-html">${safe}</div>`;
  }

  function renderTable(item) {
    const caption = item.caption ? `<caption>${escapeHtml(item.caption)}</caption>` : '';
    const headers = (item.headers || []).map(h => `<th>${escapeHtml(h)}</th>`).join('');
    const headerRow = headers ? `<thead><tr>${headers}</tr></thead>` : '';

    const rows = (item.rows || []).map(row => {
      const cells = row.map(cell => `<td>${escapeHtml(String(cell))}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');

    return `
      <div class="passage-block passage-table-wrap">
        <table class="passage-table">
          ${caption}
          ${headerRow}
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function renderList(item) {
    const tag = item.ordered ? 'ol' : 'ul';
    const items = (item.items || []).map(li => `<li>${escapeHtml(li).replace(/\n/g, '<br>')}</li>`).join('');
    const title = item.title ? `<div class="passage-list-title">${escapeHtml(item.title)}</div>` : '';
    return `
      <div class="passage-block passage-list">
        ${title}
        <${tag}>${items}</${tag}>
      </div>`;
  }

  function renderKatex(item) {
    const content = item.content || '';
    const display = item.display !== false; // 기본 display 모드

    // KaTeX 로드 여부 확인
    if (typeof window.katex === 'undefined') {
      // Fallback: 원본 텍스트 표시
      return `<div class="passage-block passage-katex-fallback"><code>${escapeHtml(content)}</code></div>`;
    }

    try {
      const rendered = window.katex.renderToString(content, {
        displayMode: display,
        throwOnError: false,
        errorColor: '#dc2626',
        strict: 'ignore'
      });
      return `<div class="passage-block passage-katex ${display ? 'katex-display' : 'katex-inline'}">${rendered}</div>`;
    } catch (e) {
      console.warn('KaTeX 렌더링 실패:', e);
      return `<div class="passage-block passage-katex-fallback"><code>${escapeHtml(content)}</code></div>`;
    }
  }

  function renderSvg(item) {
    const alt = item.alt || 'diagram';
    const content = sanitizeSvg(item.content || '');
    const caption = item.caption ? `<div class="passage-svg-caption">${escapeHtml(item.caption)}</div>` : '';
    return `
      <div class="passage-block passage-svg" role="img" aria-label="${escapeHtml(alt)}">
        ${content}
        ${caption}
      </div>`;
  }

  function renderCallout(item) {
    const title = item.title ? `<div class="passage-callout-title">${escapeHtml(item.title)}</div>` : '';
    const content = escapeHtml(item.content || '').replace(/\n/g, '<br>');
    const variant = item.variant || 'info'; // info | condition | definition
    return `
      <div class="passage-block passage-callout passage-callout-${variant}">
        ${title}
        <div class="passage-callout-body">${content}</div>
      </div>`;
  }

  // ===== 유틸 =====

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // 매우 제한적인 HTML 정제 (script, on* 이벤트 제거)
  function sanitizeHtml(html) {
    return String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }

  // SVG 정제 (script, 이벤트 핸들러 제거)
  function sanitizeSvg(svg) {
    return String(svg)
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }

  // ===== 전역 노출 =====
  window.PassageRenderer = {
    render: renderPassage
  };

})();
