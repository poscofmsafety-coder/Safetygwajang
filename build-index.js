#!/usr/bin/env node
/**
 * data/ 폴더의 YYYY-MM-DD.json 파일들을 스캔하여
 * data/index.json을 자동 생성합니다.
 * 
 * 사용법: node scripts/build-index.js
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

// 과목명 축약 매핑
const SUBJECT_SHORT = {
  '안전관리론': '안전관리론',
  '인간공학 및 시스템안전공학': '인간공학',
  '기계위험방지기술': '기계',
  '전기위험방지기술': '전기',
  '화학설비위험방지기술': '화학',
  '건설안전기술': '건설'
};

function buildIndex() {
  const files = fs.readdirSync(DATA_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse(); // 최신순

  const index = [];
  let errors = 0;

  files.forEach(file => {
    try {
      const filePath = path.join(DATA_DIR, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      const id = data.examId || data.id || file.replace('.json', '');
      const [year, month, day] = id.split('-');
      const dateStr = `${year}년 ${parseInt(month)}월 ${parseInt(day)}일`;

      // 과목명 축약
      const subjects = (data.subjects || []).map(s => {
        const name = typeof s === 'string' ? s : s.name;
        return SUBJECT_SHORT[name] || name;
      });

      index.push({
        id: id,
        title: (data.title || '').replace(/\s*\d{4}년.*$/, '').trim() || '산업안전기사 필기',
        date: dateStr,
        questions: (data.questions || []).length,
        duration: data.duration || 150,
        subjects: subjects
      });

      console.log(`✅ ${file} → ${(data.questions || []).length}문항`);
    } catch (err) {
      console.error(`❌ ${file} 파싱 실패:`, err.message);
      errors++;
    }
  });

  fs.writeFileSync(INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
  console.log(`\n📦 총 ${index.length}개 회차 생성 완료 → data/index.json`);
  if (errors > 0) console.log(`⚠️  ${errors}개 파일에 오류 있음`);
}

buildIndex();
