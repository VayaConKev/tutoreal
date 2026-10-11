/**
 * Tutoreal 서버 (Google Apps Script)
 * 원본: tutoreal/server/Code.gs  ← 이 파일만 고치고, Apps Script 편집기에는 붙여 넣기만 한다.
 *
 * v0.2 (2단계): setup() — 시트의 탭과 칸 이름을 자동으로 만들고 예시 내용을 채운다.
 * v0.3 (3단계): doGet() — 웹 앱 주소로 접속하면 서버 상태를 알려준다.
 *               checkApiKey() — 스크립트 속성의 Gemini API 키가 작동하는지 확인한다.
 * v0.4 (4단계): doGet(action=chapters) — 공개된 챕터 목록을 시트에서 읽어 웹앱에 보낸다.
 * v0.5 (5-1단계): doPost(action=login) — 접속 코드를 students 탭에서 확인한다.
 * v0.6 (6단계): doPost(action=talk) — 시나리오를 고르고 Gemini Live 임시 토큰을 발급한다.
 *               testLiveToken() — 편집기에서 토큰 발급이 되는지 확인한다.
 * v0.8 (8단계): 받아쓰기·자막 — 토큰 설정에 음성→글자 변환을 켜고, 챕터 목록에 ai_captions(자막 방식)를 보낸다.
 * v0.9 (9단계): 사용 시간 기록 — 토큰을 줄 때 sessions 탭에 한 줄을 만들고, doPost(action=end)로 사용 시간을 채운다.
 * v0.10 (10단계): 하루 한도 — 오늘의 대화 횟수·사용 시간이 한도에 닿으면 토큰을 주지 않고, 남은 시간만큼만 쓰게 한다.
 * v0.10.1: 받아쓰기에 언어 힌트(영어·한국어)와 단어 힌트(환자 이름·핵심 단어)를 준다.
 * v0.12 (12단계): AI 피드백 — doPost(action=feedback)가 대화 글자를 텍스트 모델(settings의 text_model)로 보내 피드백을 만든다.
 *                 setup()이 prompts 탭에 빠진 지시문(feedback-v1)을 추가한다. testFeedback()으로 편집기에서 확인한다.
 *
 * 비밀 정보 규칙: API 키는 '프로젝트 설정 → 스크립트 속성'의 GEMINI_API_KEY에만 저장한다.
 * 이 코드와 로그에는 절대 키를 적거나 출력하지 않는다.
 */

const SERVER_VERSION = 'v0.12';

// 탭 이름과 칸 이름. 앱 코드가 이 이름으로 데이터를 찾으므로 바꾸지 않는다 (추가는 가능).
const SCHEMA = {
  chapters:       ['chapter_id', 'order', 'title', 'goal', 'keywords', 'scene', 'published', 'ai_captions'],
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

// 피드백 지시문. {goal} {keywords} {name} {dob} {exam} 은 서버가 채운다. 대화 글자는 따로 붙는다.
const FEEDBACK_PROMPT_V1 = [
  'You are an English speaking coach for Korean nurses at a health check-up center in Seoul.',
  'You review one practice conversation between a nurse (the learner) and an AI playing a foreign patient.',
  'Lesson goal (Korean): {goal}',
  'Key expressions: {keywords}',
  'Patient chart: name {name}; born {dob}; exam {exam}.',
  'The transcript comes from speech recognition, so:',
  '- Do not comment on spelling of names, punctuation, or capital letters. Names may be spelled differently from the chart.',
  '- Some English words may be written in Korean letters (for example "오케이" = "okay"). Treat them as English.',
  '- Korean sentences mean the nurse switched to Korean. Suggest an English way to say it.',
  '- Do not judge pronunciation.',
  'Write feedback for the nurse:',
  '- summary: one short sentence in Korean.',
  '- strengths: 1-3 short points in Korean, based on what the nurse actually said.',
  '- fixes: up to 3 items. "said" = the nurse\'s exact words, "better" = a natural, polite English sentence a nurse would use, "why" = one short reason in Korean. Only include real improvements.',
  '- keywords: for each key expression, in the same order, whether the nurse used it or a clear equivalent.',
  '- next_practice: 1-2 useful English sentences for next time ("en") with Korean meaning ("ko").',
  'Be kind and specific. Give feedback only on the nurse\'s lines; patient lines are context.'
].join('\n');

const SEED = {
  chapters: [
    ['ch01', 1, '호명과 본인 확인', '수검자를 호명해 창구로 부르고 이름과 생년월일로 본인 확인하기',
     'counter, full name, spell, date of birth, Is that right, have a seat',
     'You are in the waiting area. Wait until the nurse calls your name, then answer.', true, 'tap'],
    ['ch02', 2, '검사실 안내', '수면 내시경 검사실에서 자세, 과거력, 마우스피스, 진정제 안내하기',
     'left side, knees, move back, glaucoma, prostate, IV, bite, sting, eyes open',
     'You are now in the endoscopy room. The nurse will guide you.', true, 'tap']
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
    ['patient-v1', PATIENT_PROMPT_V1, true],
    ['feedback-v1', FEEDBACK_PROMPT_V1, true]
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
    } else if (name === 'prompts') {
      // 새 버전에서 생긴 지시문(예: feedback-v1)이 없으면 추가한다. 이미 있는 줄은 건드리지 않는다.
      const have = readTable_('prompts').map(function (p) { return String(p.prompt_id); });
      SEED.prompts.forEach(function (row) {
        if (have.indexOf(row[0]) < 0) {
          sheet.appendRow(row);
          log.push('지시문 추가: ' + row[0]);
        }
      });
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


/* ───────────────────────── 3단계: 웹 앱 입구 ───────────────────────── */

/** 웹 앱 주소로 들어오는 요청을 받는다. 지금은 상태 확인(ping)만 한다. */
function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || 'ping';
  try {
    if (action === 'ping') {
      return json_({ ok: true, server: SERVER_VERSION, time: new Date().toISOString() });
    }
    if (action === 'chapters') {
      return json_({ ok: true, server: SERVER_VERSION, chapters: listChapters_() });
    }
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR' });   // 자세한 오류는 로그에만 남긴다
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** 편집기에서 한 번 실행: API 키가 작동하는지 확인하고, 쓸 수 있는 음성(Live) 모델 이름을 보여준다. */
function checkApiKey() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) {
    console.log('API 키가 없어요. 프로젝트 설정 → 스크립트 속성에 GEMINI_API_KEY를 추가해 주세요.');
    return;
  }
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000', {
    headers: { 'x-goog-api-key': key },
    muteHttpExceptions: true
  });
  const code = res.getResponseCode();
  if (code !== 200) {
    console.log('API 키 확인 실패 (응답 코드 ' + code + '). 키를 다시 복사해 붙여 넣었는지 확인해 주세요.');
    return;
  }
  const models = (JSON.parse(res.getContentText()).models || []).map(function (m) { return m.name.replace('models/', ''); });
  const live = models.filter(function (n) { return /live|native-audio/i.test(n); });
  const flash = models.filter(function (n) { return /flash/i.test(n) && !/live|native-audio|tts|image/i.test(n); });
  console.log('OK: API 키가 작동해요. 사용 가능한 모델 ' + models.length + '개');
  console.log('음성(Live) 모델 후보:\n' + (live.length ? live.join('\n') : '(없음)'));
  console.log('텍스트(Flash) 모델 후보:\n' + (flash.length ? flash.slice(0, 15).join('\n') : '(없음)'));
}


/* ───────────────────────── 4단계: 챕터 목록 ───────────────────────── */

/** 시트 탭 하나를 [{칸이름: 값, ...}, ...] 형태로 읽는다. 칸 이름(1행)으로 찾으므로 칸 순서가 바뀌어도 괜찮다. */
function readTable_(name) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  return values.slice(1)
    .filter(function (row) { return row.join('') !== ''; })
    .map(function (row) {
      const obj = {};
      headers.forEach(function (h, i) { if (h) obj[h] = row[i]; });
      return obj;
    });
}

/** TRUE / 'TRUE' / 'true' / 1 을 모두 참으로 본다. */
function isTrue_(v) {
  return v === true || String(v).trim().toUpperCase() === 'TRUE' || String(v).trim() === '1';
}

/** 환자 말 자막 방식: tap(눌러서 보기, 기본) / show(항상 보기) / off(안 보임) */
function captionMode_(v) {
  const mode = String(v || '').trim().toLowerCase();
  return mode === 'show' || mode === 'off' ? mode : 'tap';
}

/** 공개(published)된 챕터만 순서(order)대로. 학생 화면에 필요한 칸만 보낸다. */
function listChapters_() {
  return readTable_('chapters')
    .filter(function (c) { return c.chapter_id && isTrue_(c.published); })
    .sort(function (a, b) { return Number(a.order) - Number(b.order); })
    .map(function (c) {
      return {
        chapter_id: String(c.chapter_id),
        order: Number(c.order),
        title: String(c.title || ''),
        goal: String(c.goal || ''),
        keywords: String(c.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean),
        ai_captions: captionMode_(c.ai_captions)
      };
    });
}


/* ───────────────────────── 5-1단계: 접속 코드 ───────────────────────── */

// 10분 동안 전체 로그인 실패가 이 횟수에 닿으면 잠시 막는다 (코드 무작위 대입 방지).
const LOGIN_FAIL_LIMIT = 20;

/** 접속 코드처럼 주소(URL)에 남으면 안 되는 값은 POST 본문으로 받는다. 접속 코드는 로그에 남기지 않는다. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, error: 'BAD_REQUEST' });   // 본문에 코드가 있을 수 있으므로 로그에 남기지 않는다
  }
  try {
    if (body.action === 'login') {
      const result = login_(body.code);
      result.server = SERVER_VERSION;
      return json_(result);
    }
    if (body.action === 'talk') {
      const result = startTalk_(body.code, String(body.chapter_id || ''));
      result.server = SERVER_VERSION;
      return json_(result);
    }
    if (body.action === 'feedback') {
      return json_(feedback_(body.code, String(body.session_id || ''), body.lines));
    }
    if (body.action === 'end') {
      return json_(endSession_(body.code, String(body.session_id || ''), body.duration_sec, String(body.end_reason || '')));
    }
    return json_({ ok: false, error: 'UNKNOWN_ACTION' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'SERVER_ERROR' });
  }
}

/** 코드가 맞고 상태가 active인 학생이면 이름만 돌려준다. 대소문자와 앞뒤 공백은 무시한다. */
function login_(code) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  return { ok: true, name: String(auth.student.display_name || auth.student.student_id) };
}

/** 접속 코드를 확인하고 학생 정보(students 탭의 한 줄)를 돌려준다. 틀리면 실패 횟수를 센다. */
function auth_(code) {
  code = String(code || '').trim().toLowerCase();
  if (!code) return { ok: false, error: 'INVALID_CODE' };

  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('login_fails') || 0);
  if (fails >= LOGIN_FAIL_LIMIT) return { ok: false, error: 'TOO_MANY_TRIES' };

  const student = findStudent_(code);
  if (!student) {
    cache.put('login_fails', String(fails + 1), 600);
    return { ok: false, error: 'INVALID_CODE' };
  }
  return { ok: true, student: student };
}

function findStudent_(code) {
  const found = readTable_('students').filter(function (s) {
    return String(s.access_code).trim().toLowerCase() === code &&
           String(s.status).trim().toLowerCase() === 'active';
  });
  return found.length ? found[0] : null;
}


/* ───────────────────────── 6단계: Gemini Live 음성 연결 ───────────────────────── */

// Gemini Live의 음성 대화 한 번은 최대 15분 (API 한도). 토큰도 그때까지만 쓸 수 있게 한다.
const LIVE_SESSION_MAX_MIN = 15;

/** prompts 탭에서 이름이 kind(예: 'patient', 'feedback')로 시작하고 active인 첫 지시문. */
function activePrompt_(kind) {
  return readTable_('prompts').filter(function (p) {
    return isTrue_(p.active) && String(p.prompt_id).indexOf(kind) === 0;
  })[0];
}

/** settings 탭을 {key: value} 로 읽는다. */
function getSettings_() {
  const out = {};
  readTable_('settings').forEach(function (r) { if (r.key) out[String(r.key).trim()] = r.value; });
  return out;
}

/** 접속 코드를 확인한 뒤 대화 한 번 분량의 임시 토큰을 준다. */
function startTalk_(code, chapterId) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  const limit = checkDailyLimit_(auth.student);
  if (!limit.ok) return limit;
  const maxSec = Math.min(limit.remainingSec, LIVE_SESSION_MAX_MIN * 60);
  const result = createLiveToken_(chapterId, maxSec);
  if (result.ok) {
    result.session_id = logSessionStart_(auth.student, chapterId, result.scenario_id);
    result.limit_sec = maxSec;                                       // 이 대화에서 쓸 수 있는 최대 시간(초)
    result.limit_kind = maxSec < LIVE_SESSION_MAX_MIN * 60 ? 'daily' : 'session';
  }
  return result;
}

/**
 * 챕터의 활성 시나리오 하나를 무작위로 고르고, 지시문을 채워 임시 토큰 안에 고정한다.
 * 지시문과 시나리오의 숨은 설정(twist)은 브라우저로 보내지 않는다. 브라우저는 토큰과 환자 차트만 받는다.
 */
function createLiveToken_(chapterId, maxSec) {
  maxSec = maxSec || LIVE_SESSION_MAX_MIN * 60;
  const chapter = readTable_('chapters').filter(function (c) {
    return String(c.chapter_id) === chapterId && isTrue_(c.published);
  })[0];
  if (!chapter) return { ok: false, error: 'NO_CHAPTER' };

  const scenarios = readTable_('scenarios').filter(function (s) {
    return String(s.chapter_id) === chapterId && isTrue_(s.active);
  });
  if (!scenarios.length) return { ok: false, error: 'NO_SCENARIO' };
  const sc = scenarios[Math.floor(Math.random() * scenarios.length)];

  const prompt = activePrompt_('patient');
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };

  const settings = getSettings_();
  const model = String(settings.live_model || '').trim().replace(/^models\//, '');
  if (!model) return { ok: false, error: 'NO_LIVE_MODEL' };

  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'NO_API_KEY' };

  const patient = {
    name: String(sc.name || ''),
    sex: String(sc.sex || ''),
    dob: formatDob_(sc.dob),
    country: String(sc.country || ''),
    exam: String(sc.exam || '')
  };
  const instruction = String(prompt.text)
    .replace(/\{name\}/g, patient.name)
    .replace(/\{sex\}/g, patient.sex)
    .replace(/\{dob\}/g, patient.dob)
    .replace(/\{country\}/g, patient.country)
    .replace(/\{exam\}/g, patient.exam)
    .replace(/\{scene\}/g, String(chapter.scene || ''))
    .replace(/\{twist\}/g, String(sc.twist || ''));

  const setup = {
    model: 'models/' + model,
    generationConfig: { responseModalities: ['AUDIO'] },
    systemInstruction: { parts: [{ text: instruction }] },
    // 학생 말 → 글자 (받아쓰기). 언어를 지정하지 않으면 자동 판단하다가 다른 언어(예: 스페인어)로 적는 경우가 있었다.
    // 한국어도 넣어 학생이 한국어로 말하면 한국어로 적히게 한다. 환자 이름·핵심 단어는 더 잘 알아듣도록 단어 힌트로 준다.
    // 모드는 기본값(VERBATIM, 들린 그대로)을 쓴다. SMART는 문법을 다듬어 학생의 실수가 지워진다.
    inputAudioTranscription: {
      languageCodes: ['en-US', 'ko-KR'],
      customVocabulary: [patient.name].concat(
        String(chapter.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean))
    },
    outputAudioTranscription: { languageCodes: ['en-US'] }   // 환자(AI) 말 → 글자 (자막)
  };
  // 목소리: settings 탭의 voice_male / voice_female. 비어 있으면 Gemini 기본 목소리.
  const voice = String(settings[patient.sex.toLowerCase() === 'female' ? 'voice_female' : 'voice_male'] || '').trim();
  if (voice) setup.generationConfig.speechConfig = { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } };

  // bidiGenerateContentSetup을 넣고 fieldMask를 비우면, 브라우저가 보내는 설정 대신 이 설정이 통째로 쓰인다.
  const now = Date.now();
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/auth_tokens', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      uses: 1,
      // 앱이 maxSec에 맞춰 대화를 끝낸다. 토큰은 1분 여유를 두고 만료되어, 앱이 끝내지 못해도 Gemini가 끊는다.
      expireTime: new Date(now + maxSec * 1000 + 60000).toISOString(),
      newSessionExpireTime: new Date(now + 60000).toISOString(),
      bidiGenerateContentSetup: setup
    }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) {
    // 구글의 오류 설명만 남긴다 (키와 토큰은 남기지 않는다).
    console.error('토큰 발급 실패 (응답 코드 ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'TOKEN_FAILED' };
  }
  const token = JSON.parse(res.getContentText()).name;
  if (!token) return { ok: false, error: 'TOKEN_FAILED' };

  return {
    ok: true,
    token: token,
    model: model,
    scenario_id: String(sc.scenario_id),
    patient: { name: patient.name, dob: patient.dob, exam: patient.exam }
  };
}

/** 생년월일이 날짜로 바뀌어 있어도 2003-05-11 형태의 글자로 돌려준다. */
function formatDob_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v || '');
}

/** 편집기에서 한 번 실행: 1장으로 임시 토큰이 발급되는지 확인한다. 토큰 자체는 출력하지 않는다. */
function testLiveToken() {
  const r = createLiveToken_('ch01');
  if (r.ok) {
    console.log('OK: 임시 토큰 발급 성공. 모델 ' + r.model + ', 시나리오 ' + r.scenario_id + ' (' + r.patient.name + ')');
  } else {
    console.log('실패: ' + r.error + ' — 바로 위에 빨간 오류 줄이 있으면 그 내용을 Claude에게 알려 주세요.');
  }
}


/* ───────────────────────── 9단계: 사용 시간 기록 ───────────────────────── */

// 대화가 끝난 이유: user(끝내기) / left(화면을 닫음) / closed(연결이 끊김) / error(연결 전에 실패) / limit(시간 한도)
const END_REASONS = ['user', 'left', 'closed', 'error', 'limit'];

/** 탭의 칸 이름(1행)에 맞춰 한 줄을 추가한다. 없는 칸은 비워 둔다. */
function appendRow_(name, obj) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  sheet.appendRow(headers.map(function (h) { return Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : ''; }));
}

/** 토큰을 줄 때 sessions 탭에 시작 기록을 남긴다. 대화 내용은 남기지 않는다. */
function logSessionStart_(student, chapterId, scenarioId) {
  const id = Utilities.getUuid();
  appendRow_('sessions', {
    session_id: id,
    student_id: String(student.student_id),
    started_at: new Date(),
    chapter_id: chapterId,
    scenario_id: scenarioId,
    shared: false
  });
  return id;
}

/**
 * 대화가 끝나면 사용 시간(초)과 끝난 이유를 채운다. 이미 채워진 줄은 바꾸지 않는다.
 * 앱이 보낸 시간이 실제로 흐른 시간이나 대화 최대 시간보다 길면 그 값으로 자른다.
 */
function endSession_(code, sessionId, durationSec, endReason) {
  const auth = auth_(code);
  if (!auth.ok) return auth;
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('sessions');
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (h) { return String(h).trim(); });
  const col = function (name) { return headers.indexOf(name); };

  for (let i = values.length - 1; i >= 1; i--) {
    const row = values[i];
    if (String(row[col('session_id')]) !== sessionId) continue;
    if (String(row[col('student_id')]) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };
    if (row[col('duration_sec')] !== '') return { ok: true };

    const started = row[col('started_at')];
    const elapsed = started instanceof Date ? (Date.now() - started.getTime()) / 1000 : LIVE_SESSION_MAX_MIN * 60;
    const sec = Math.round(Math.max(0, Math.min(Number(durationSec) || 0, elapsed, LIVE_SESSION_MAX_MIN * 60)));
    sheet.getRange(i + 1, col('duration_sec') + 1).setValue(sec);
    sheet.getRange(i + 1, col('end_reason') + 1).setValue(END_REASONS.indexOf(endReason) >= 0 ? endReason : 'unknown');
    return { ok: true };
  }
  return { ok: false, error: 'NO_SESSION' };
}


/* ───────────────────────── 10단계: 하루 한도 ───────────────────────── */

/**
 * 오늘(시트의 시간대 기준) 이 학생의 대화 횟수와 사용 시간을 sessions 탭에서 센다.
 * 한도: 횟수 = settings의 daily_connect_limit, 시간(분) = students의 daily_limit_min → 없으면 settings의 default_daily_limit_min.
 * 끝 기록이 없는 대화는 실제로 흐른 시간(최대 15분)만큼 쓴 것으로 센다.
 */
function checkDailyLimit_(student) {
  const settings = getSettings_();
  const maxConnect = Number(settings.daily_connect_limit) || 20;
  const maxMin = Number(student.daily_limit_min) || Number(settings.default_daily_limit_min) || 30;
  const tz = SpreadsheetApp.getActiveSpreadsheet().getSpreadsheetTimeZone();
  const today = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');

  let count = 0;
  let usedSec = 0;
  readTable_('sessions').forEach(function (s) {
    if (String(s.student_id) !== String(student.student_id) || !(s.started_at instanceof Date)) return;
    if (Utilities.formatDate(s.started_at, tz, 'yyyy-MM-dd') !== today) return;
    count++;
    usedSec += s.duration_sec !== ''
      ? Number(s.duration_sec) || 0
      : Math.min((Date.now() - s.started_at.getTime()) / 1000, LIVE_SESSION_MAX_MIN * 60);
  });

  if (count >= maxConnect) return { ok: false, error: 'DAILY_CONNECT_LIMIT' };
  const remainingSec = Math.floor(maxMin * 60 - usedSec);
  if (remainingSec < 60) return { ok: false, error: 'DAILY_TIME_LIMIT' };
  return { ok: true, remainingSec: remainingSec };
}


/* ───────────────────────── 12단계: AI 피드백 ───────────────────────── */

// 텍스트 모델이 돌려줄 피드백의 모양 (JSON).
const FEEDBACK_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    strengths: { type: 'ARRAY', items: { type: 'STRING' } },
    fixes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { said: { type: 'STRING' }, better: { type: 'STRING' }, why: { type: 'STRING' } },
        required: ['said', 'better', 'why']
      }
    },
    keywords: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { keyword: { type: 'STRING' }, used: { type: 'BOOLEAN' } }, required: ['keyword', 'used'] }
    },
    next_practice: {
      type: 'ARRAY',
      items: { type: 'OBJECT', properties: { en: { type: 'STRING' }, ko: { type: 'STRING' } }, required: ['en', 'ko'] }
    }
  },
  required: ['summary', 'strengths', 'fixes', 'keywords', 'next_practice']
};

const FEEDBACK_CACHE_SEC = 6 * 3600;   // 같은 대화의 피드백은 6시간 동안 다시 만들지 않고 그대로 준다
const FEEDBACK_MAX_TRIES = 3;          // 실패해도 한 대화에 3번까지만 시도

/**
 * 대화 글자를 받아 피드백을 만든다. 글자는 피드백을 만드는 데만 쓰고 시트에 저장하지 않는다.
 * 챕터와 시나리오는 앱이 보낸 값이 아니라 sessions 탭의 기록에서 찾는다.
 */
function feedback_(code, sessionId, lines) {
  const auth = auth_(code);
  if (!auth.ok) return auth;

  const session = readTable_('sessions').filter(function (s) { return String(s.session_id) === sessionId; })[0];
  if (!session) return { ok: false, error: 'NO_SESSION' };
  if (String(session.student_id) !== String(auth.student.student_id)) return { ok: false, error: 'NOT_YOURS' };

  const cache = CacheService.getScriptCache();
  const cached = cache.get('fb_' + sessionId);
  if (cached) return { ok: true, feedback: JSON.parse(cached) };
  const tries = Number(cache.get('fbn_' + sessionId) || 0);
  if (tries >= FEEDBACK_MAX_TRIES) return { ok: false, error: 'FEEDBACK_LIMIT' };
  cache.put('fbn_' + sessionId, String(tries + 1), FEEDBACK_CACHE_SEC);

  const chapter = readTable_('chapters').filter(function (c) { return String(c.chapter_id) === String(session.chapter_id); })[0];
  const scenario = readTable_('scenarios').filter(function (s) { return String(s.scenario_id) === String(session.scenario_id); })[0];
  if (!chapter || !scenario) return { ok: false, error: 'NO_CHAPTER' };

  const result = makeFeedback_(chapter, scenario, cleanLines_(lines));
  if (result.ok) cache.put('fb_' + sessionId, JSON.stringify(result.feedback), FEEDBACK_CACHE_SEC);
  return result;
}

/** 앱이 보낸 대화 글자를 정리한다: 최대 80줄, 한 줄 400자. */
function cleanLines_(lines) {
  return (Array.isArray(lines) ? lines : []).slice(0, 80)
    .map(function (l) { return { who: l && l.who === 'me' ? 'me' : 'ai', text: String((l && l.text) || '').trim().slice(0, 400) }; })
    .filter(function (l) { return l.text; });
}

function makeFeedback_(chapter, scenario, lines) {
  if (!lines.some(function (l) { return l.who === 'me'; })) return { ok: false, error: 'NO_TALK' };

  const prompt = activePrompt_('feedback');
  if (!prompt) return { ok: false, error: 'NO_PROMPT' };
  const model = String(getSettings_().text_model || '').trim().replace(/^models\//, '');
  if (!model) return { ok: false, error: 'NO_TEXT_MODEL' };
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'NO_API_KEY' };

  const keywords = String(chapter.keywords || '').split(',').map(function (k) { return k.trim(); }).filter(Boolean);
  const system = String(prompt.text)
    .replace(/\{goal\}/g, String(chapter.goal || ''))
    .replace(/\{keywords\}/g, keywords.join(', '))
    .replace(/\{name\}/g, String(scenario.name || ''))
    .replace(/\{dob\}/g, formatDob_(scenario.dob))
    .replace(/\{exam\}/g, String(scenario.exam || ''));
  const transcript = 'Transcript:\n' + lines.map(function (l) { return (l.who === 'me' ? 'Nurse: ' : 'Patient: ') + l.text; }).join('\n');

  const request = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-goog-api-key': key },
    payload: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: transcript }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: FEEDBACK_SCHEMA,
        thinkingConfig: { thinkingLevel: 'low' },   // 빠르고 저렴하게
        maxOutputTokens: 4096
      }
    }),
    muteHttpExceptions: true
  };
  // 모델이 붐비면(503) 또는 잠시 요청이 많으면(429, 500) 잠깐 기다렸다 다시 시도한다: 2초, 4초 뒤 최대 2번 더.
  let res;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) Utilities.sleep(2000 * attempt);
    res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', request);
    if ([429, 500, 503].indexOf(res.getResponseCode()) < 0) break;
  }
  if (res.getResponseCode() !== 200) {
    console.error('피드백 실패 (응답 코드 ' + res.getResponseCode() + '): ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'FEEDBACK_FAILED' };
  }

  let fb;
  try {
    const cand = (JSON.parse(res.getContentText()).candidates || [])[0] || {};
    const text = ((cand.content && cand.content.parts) || [])
      .filter(function (p) { return !p.thought; })
      .map(function (p) { return p.text || ''; }).join('');
    fb = JSON.parse(text);
  } catch (err) {
    console.error('피드백 결과를 읽지 못함: ' + res.getContentText().slice(0, 800));
    return { ok: false, error: 'FEEDBACK_FAILED' };
  }

  // 핵심 단어는 챕터의 목록 순서 그대로, 빠진 단어는 '안 씀'으로 맞춘다.
  const used = {};
  (fb.keywords || []).forEach(function (k) { used[String(k.keyword).trim().toLowerCase()] = k.used === true; });
  return {
    ok: true,
    feedback: {
      summary: String(fb.summary || ''),
      strengths: (fb.strengths || []).map(String).slice(0, 3),
      fixes: (fb.fixes || []).slice(0, 3).map(function (f) { return { said: String(f.said || ''), better: String(f.better || ''), why: String(f.why || '') }; }),
      keywords: keywords.map(function (k) { return { keyword: k, used: used[k.toLowerCase()] === true }; }),
      next_practice: (fb.next_practice || []).slice(0, 2).map(function (n) { return { en: String(n.en || ''), ko: String(n.ko || '') }; })
    }
  };
}

/** 편집기에서 실행: 예시 대화로 피드백이 만들어지는지 확인한다. */
function testFeedback() {
  const chapter = readTable_('chapters').filter(function (c) { return String(c.chapter_id) === 'ch01'; })[0];
  const scenario = readTable_('scenarios').filter(function (s) { return String(s.scenario_id) === 'ch01-s02'; })[0];
  const r = makeFeedback_(chapter, scenario, [
    { who: 'me', text: 'Miss Kelly Shu, please come to the counter.' },
    { who: 'ai', text: "Yes, that's me." },
    { who: 'me', text: 'Tell me birthday.' },
    { who: 'ai', text: 'May eleventh, two thousand and three.' },
    { who: 'me', text: '잠시만요. 오케이, 땡큐.' }
  ]);
  if (r.ok) console.log('OK: 피드백 생성 성공\n' + JSON.stringify(r.feedback, null, 2));
  else console.log('실패: ' + r.error + ' — 바로 위에 빨간 오류 줄이 있으면 그 내용을 Claude에게 알려 주세요.');
}
