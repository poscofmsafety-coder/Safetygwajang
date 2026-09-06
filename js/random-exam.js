(function () {
  "use strict";

  const INDEX_URL = "./data/index.json";
  const STORAGE_KEY = "industrialSafetyRandomExam";
  const ANSWER_STORAGE_KEY = "industrialSafetyRandomAnswers";

  const SUBJECT_MAP = {
    "안전관리론": "산업재해 예방 및 안전보건교육",
    "인간공학 및 시스템안전공학": "인간공학 및 위험성 평가·관리",
    "기계위험방지기술": "기계·기구 및 설비 안전 관리",
    "전기위험방지기술": "전기설비 안전 관리",
    "화학설비위험방지기술": "화학설비 안전 관리",
    "건설안전기술": "건설공사 안전 관리",

    // 이미 신규 과목명으로 저장된 JSON도 처리
    "산업재해 예방 및 안전보건교육":
      "산업재해 예방 및 안전보건교육",
    "인간공학 및 위험성 평가·관리":
      "인간공학 및 위험성 평가·관리",
    "기계·기구 및 설비 안전 관리":
      "기계·기구 및 설비 안전 관리",
    "전기설비 안전 관리":
      "전기설비 안전 관리",
    "화학설비 안전 관리":
      "화학설비 안전 관리",
    "건설공사 안전 관리":
      "건설공사 안전 관리"
  };

  const SUBJECTS = [
    {
      name: "산업재해 예방 및 안전보건교육",
      range: [1, 20]
    },
    {
      name: "인간공학 및 위험성 평가·관리",
      range: [21, 40]
    },
    {
      name: "기계·기구 및 설비 안전 관리",
      range: [41, 60]
    },
    {
      name: "전기설비 안전 관리",
      range: [61, 80]
    },
    {
      name: "화학설비 안전 관리",
      range: [81, 100]
    },
    {
      name: "건설공사 안전 관리",
      range: [101, 120]
    }
  ];

  function shuffle(array) {
    const copied = [...array];

    for (let i = copied.length - 1; i > 0; i--) {
      const randomIndex = Math.floor(Math.random() * (i + 1));

      [copied[i], copied[randomIndex]] = [
        copied[randomIndex],
        copied[i]
      ];
    }

    return copied;
  }

  function normalizeFilePath(item) {
    let fileName;

    if (typeof item === "string") {
      fileName = item;
    } else {
      fileName =
        item.file ||
        item.path ||
        item.url ||
        item.filename ||
        item.dataFile;
    }

    if (!fileName) {
      return null;
    }

    if (/^https?:\/\//i.test(fileName)) {
      return fileName;
    }

    if (fileName.startsWith("/data/")) {
      return `.${fileName}`;
    }

    if (fileName.startsWith("data/")) {
      return `./${fileName}`;
    }

    return `./data/${fileName}`;
  }

  async function fetchJson(url) {
    const response = await fetch(url, {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error(
        `${url} 로딩 실패: HTTP ${response.status}`
      );
    }

    return response.json();
  }

  async function loadExamFileList() {
    const indexData = await fetchJson(INDEX_URL);

    let list;

    if (Array.isArray(indexData)) {
      list = indexData;
    } else if (Array.isArray(indexData.exams)) {
      list = indexData.exams;
    } else if (Array.isArray(indexData.files)) {
      list = indexData.files;
    } else if (Array.isArray(indexData.data)) {
      list = indexData.data;
    } else {
      throw new Error(
        "data/index.json에서 시험 파일 목록을 찾지 못했습니다."
      );
    }

    const paths = list
      .map(normalizeFilePath)
      .filter(Boolean)
      .filter((path) => path.endsWith(".json"))
      .filter((path) => !path.endsWith("/index.json"));

    if (paths.length === 0) {
      throw new Error("등록된 기출문제 JSON 파일이 없습니다.");
    }

    return [...new Set(paths)];
  }

  async function loadQuestionBank() {
    const filePaths = await loadExamFileList();

    const results = await Promise.allSettled(
      filePaths.map(async (path) => {
        const exam = await fetchJson(path);

        if (!exam || !Array.isArray(exam.questions)) {
          throw new Error(`${path}에 questions 배열이 없습니다.`);
        }

        return {
          path,
          exam
        };
      })
    );

    const loadedExams = [];
    const failedFiles = [];

    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        loadedExams.push(result.value);
      } else {
        failedFiles.push({
          path: filePaths[index],
          reason: result.reason?.message || "알 수 없는 오류"
        });
      }
    });

    if (failedFiles.length > 0) {
      console.warn("일부 문제 파일 로딩 실패:", failedFiles);
    }

    if (loadedExams.length === 0) {
      throw new Error("사용 가능한 기출문제 파일이 없습니다.");
    }

    const questionBank = [];

    loadedExams.forEach(({ path, exam }) => {
      exam.questions.forEach((originalQuestion) => {
        const newSubject =
          SUBJECT_MAP[originalQuestion.subject];

        if (!newSubject) {
          console.warn(
            "알 수 없는 과목명:",
            originalQuestion.subject,
            path,
            originalQuestion.no
          );

          return;
        }

        questionBank.push({
          ...originalQuestion,

          // 랜덤 시험에서 사용할 신규 과목명
          subject: newSubject,

          // 원본 추적용 정보
          sourceExamId: exam.examId || path,
          sourceTitle: exam.title || "",
          sourceNo: originalQuestion.no,
          sourceFile: path
        });
      });
    });

    return {
      questionBank,
      loadedFileCount: loadedExams.length,
      failedFiles
    };
  }

  function makeQuestionKey(question) {
    const normalizedText = String(question.question || "")
      .replace(/\s+/g, " ")
      .trim();

    /*
     * 같은 문제가 여러 회차에 중복 수록되어 있으면
     * 문제 본문을 기준으로 중복을 제거합니다.
     */
    return `${question.subject}::${normalizedText}`;
  }

  function removeDuplicates(questions) {
    const uniqueMap = new Map();

    questions.forEach((question) => {
      const key = makeQuestionKey(question);

      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, question);
      }
    });

    return [...uniqueMap.values()];
  }

  function createRandomExam(questionBank) {
    const selectedQuestions = [];

    SUBJECTS.forEach((subjectInfo) => {
      const candidates = questionBank.filter(
        (question) =>
          question.subject === subjectInfo.name
      );

      const uniqueCandidates =
        removeDuplicates(candidates);

      if (uniqueCandidates.length < 20) {
        throw new Error(
          `${subjectInfo.name} 문항이 부족합니다. ` +
          `중복 제거 후 ${uniqueCandidates.length}문항입니다.`
        );
      }

      const selected = shuffle(uniqueCandidates).slice(0, 20);

      selectedQuestions.push(...selected);
    });

    const questions = selectedQuestions.map(
      (question, index) => ({
        ...question,
        no: index + 1
      })
    );

    return {
      examId: `random-${Date.now()}`,
      title: "랜덤 기출문제",
      duration: 150,
      passingScore: 60,
      subjects: SUBJECTS,
      questions,
      randomExam: true,
      createdAt: new Date().toISOString()
    };
  }

  async function createNewRandomExam() {
    const { questionBank, loadedFileCount, failedFiles } =
      await loadQuestionBank();

    const exam = createRandomExam(questionBank);

    exam.loadedFileCount = loadedFileCount;

    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(exam)
    );

    sessionStorage.removeItem(ANSWER_STORAGE_KEY);

    if (failedFiles.length > 0) {
      console.warn(
        `${failedFiles.length}개 파일을 제외하고 랜덤 시험을 생성했습니다.`
      );
    }

    return exam;
  }

  function getSavedRandomExam() {
    const saved = sessionStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return null;
    }

    try {
      return JSON.parse(saved);
    } catch (error) {
      console.warn("저장된 랜덤 시험 복원 실패:", error);
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  }

  async function getOrCreateRandomExam() {
    const savedExam = getSavedRandomExam();

    if (savedExam) {
      return savedExam;
    }

    return createNewRandomExam();
  }

  async function resetRandomExam() {
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ANSWER_STORAGE_KEY);

    return createNewRandomExam();
  }

  /*
   * 다른 JS 파일에서 사용할 수 있도록 window에 공개합니다.
   */
  window.RandomExam = {
    loadQuestionBank,
    createRandomExam,
    createNewRandomExam,
    getSavedRandomExam,
    getOrCreateRandomExam,
    resetRandomExam,
    subjects: SUBJECTS
  };
})();
