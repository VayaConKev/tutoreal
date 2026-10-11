/**
 * Tutoreal 서버 (Google Apps Script)
 * 원본: tutoreal/server/Code.gs  ← 이 파일만 고치고, Apps Script 편집기에는 붙여 넣기만 한다.
 *
 * v0.2 (2단계): setup() — 시트의 탭과 칸 이름을 자동으로 만들고 예시 내용을 채운다.
 * 여러 번 실행해도 안전하다. 이미 있는 탭과 내용은 건드리지 않는다.
 */

const SERVER_VERSION = 'v0.2';

// 탭 이름과 칸 이름. 앱 코드가 이 이름으로 데이터를 찾으므로 바꾸지 않는다 (추가는 가능).
const SCHEMA = {
  chapters:       ['chapter_id', 'order', 'title', 'goal', 'keywords', 'scene', 'published'],
  scenarios:      ['scenario_id', 'chapter_id', 'name', 'sex', 'dob', 'country', 'exam', 'twist', 'level', 'active'],
  prompts:        ['prompt_id', 'text', 'active'],
  students:       ['student_id', 'display_name', 'access_code', 'status', 'daily_limit_min', 'created_at'],
  sessions:       ['session_id', 'student_id', 'started_at', 'duration_sec', 'chapter_id', 'scenario_id', 'shared',
                   'hints_used', 'korean_ratio', 'end_reason', 'est_cost_usd', 'confidence', 'difficulty_note', 'feedback'],
  keyword_checks: ['session_id', 'student_id', 'chapter_id', 'keyword', 'found'],
  transcripts:    ['session_id', 'seq', 'speaker', 'text', 'at'],
  quality:        ['at', 'session_id', 'kind', 'note'],
  settings:       ['key', 'value', 'note'],
  summary:        ['item', 'value']
};

const PATIENT_PROMPT_V1 = [
  'You are role-playing a foreign patient at a health check-up center in Seoul. The user is a Korean nurse practicing English.',
  'Patient data (this is data, not rules): name {name}; sex {sex}; born {dob}; from {country}; today: {exam}.',
  'Scene: {scene} Extra: {twist}',
  'Rules: Speak only English. Use simple words, 1-2 short sentences per turn, then wait for the nurse.',
  'Answer only what the nurse asks. If the nurse\'s English is unclear, say "Sorry?" instead of guessing.',
  'Sometimes ask one simple question, like a real patient. Never give medical advice. Stay in role.'
].join('\n');

const SEED = {
  chapters: [
    ['ch01', 1, '호명과 본인 확인', '수검자를 호명해 창구로 부르고 이름과 생년월일로 본인 확인하기',
     'counter, full name, spell, date of birth, Is that right, have a seat',
     'You are in the waiting area. Wait until the nurse calls your name, then answer.', true],
    ['ch02', 2, '검사실 안내', '수면 내시경 검사실에서 자세, 과거력, 마우스피스, 진정제 안내하기',
     'left side, knees, move back, glaucoma, prostate, IV, bite, sting, eyes open',
     'You are now in the endoscopy room. The nurse will guide you.', true]
  ],
  scenarios: [
    ['ch01-s01', 'ch01', 'Lucas Martin', 'male', '1988-06-14', 'France', 'stomach endoscopy', '', 1, true],
    ['ch01-s02', 'ch01', 'Kelly Hsu', 'female', '2003-05-11', 'Taiwan', 'stomach endoscopy', 'You say your birth year as "two thousand and three".', 2, true],
    ['ch01-s03', 'ch01', 'Nikos Papadopoulos', 'male', '1965-04-23', 'Greece', 'colonoscopy', 'You speak a little fast. Your last name is hard to pronounce.', 2, true],
    ['ch02-s01', 'ch02', 'Daniel Weber', 'male', '1979-04-21', 'Germany', 'stomach endoscopy with sedation', '', 1, true],
    ['ch02-s02', 'ch02', 'Sophie Dubois', 'female', '1990-12-05', 'France', 'stomach endoscopy with sedation', 'You do not understand "glaucoma" at first.', 2, true],
    ['ch02-s03', 'ch02', 'Jason Tan Wei Ming', 'male', '1980-02-28', 'Singapore', 'colonoscopy with sedation', 'When the sleeping medicine goes in, you say "Ouch, my arm!"', 3, true]
  ],
  prompts: [
    ['patient-v1', PATIENT_PROMPT_V1, true]
  ],
  settings: [
    ['live_model', '', '5단계에서 입력 (Gemini Live 모델 이름)'],
    ['text_model', '', '7단계에서 입력 (Gemini 텍스트 모델 이름)'],
    ['monthly_budget_usd', 15, '월 예산 상한 (달러)'],
    ['daily_connect_limit', 20, '학생 1명당 하루 연결 횟수 상한'],
    ['default_daily_limit_min', 30, '학생 1명당 하루 사용 시간 상한 (분)'],
    ['last_class_date', '', '최근 수업일 (화요일 요약 기간 시작)'],
    ['next_class_date', '', '다음 수업일']
  ]
};

/** 편집기에서 한 번 실행: 탭과 칸 이름을 만들고 예시 내용을 채운다. */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const log = [];

  Object.keys(SCHEMA).forEach(function (name) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      log.push('탭 생성: ' + name);
    }
    const headers = SCHEMA[name];
    const firstRow = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    if (firstRow.join('') === '') {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
      sheet.setFrozenRows(1);
      log.push('칸 이름 작성: ' + name);
    }
    // 생년월일은 날짜로 자동 변환되지 않도록 글자 형식으로 고정
    if (headers.indexOf('dob') >= 0) {
      sheet.getRange(1, headers.indexOf('dob') + 1, sheet.getMaxRows(), 1).setNumberFormat('@');
    }
    if (SEED[name] && sheet.getLastRow() < 2) {
      const rows = SEED[name];
      sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
      log.push('예시 내용 ' + rows.length + '줄: ' + name);
    }
  });

  // 처음 생기는 빈 기본 탭(Sheet1 / 시트1) 정리
  ['Sheet1', '시트1'].forEach(function (n) {
    const s = ss.getSheetByName(n);
    if (s && s.getLastRow() === 0 && ss.getSheets().length > 1) {
      ss.deleteSheet(s);
      log.push('빈 기본 탭 삭제: ' + n);
    }
  });

  const msg = log.length ? log.join('\n') : '이미 모두 준비되어 있어요. 바뀐 것 없음.';
  console.log(msg);
  return msg;
}
