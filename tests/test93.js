// 93단계: 일본어 과정(course 칸 ja) — setup이 ja-partner-v1을 더하고, ja 챕터의 대화는 일본어 받아쓰기 + 일본어 지시문. 영어·중국어는 그대로
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('6c583c7')); old.run('setup'); old.run('addChineseSample');   // 지금 쓰는 시트 (서버 v0.57)
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
const before = w.tabs.prompts.length;
w.run('setup');
const added = w.tabs.prompts.slice(before).map((r) => r[0]);
console.log('setup 뒤 추가된 지시문:', added.join(', '));
assert.deepEqual(added, ['ja-partner-v1']);
const ids = w.tabs.prompts.slice(1).map((r) => r[0]); assert.equal(new Set(ids).size, ids.length, '같은 이름 두 줄 없음');
w.run('setup'); assert.equal(w.tabs.prompts.length, before + 1, '두 번 돌려도 한 줄');

const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row('students', { student_id: 'S1', display_name: '학생', access_code: 'stu-en', status: 'active', course: 'en' });
row('students', { student_id: 'S2', display_name: '일본어', access_code: 'stu-ja', status: 'active', course: 'ja' });
row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row('chapters', { chapter_id: 'ja01', order: 1, title: '호명과 본인 확인', goal: '- 이름 묻기', keywords: 'お名前, 生年月日',
  scene: 'You are in the waiting area. Wait until the nurse calls your name, then answer.', published: 'preview', ai_captions: 'show', course: 'ja' });
row('scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan',
  exam: 'stomach endoscopy', twist: '', level: 1, active: true });

const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const talk = (code, ch) => {
  let setup = null; w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) setup = p.bidiGenerateContentSetup; return null; };
  const r = post({ action: 'talk', code, chapter_id: ch });
  return { r, setup };
};

// ① 일본어 챕터: 일본어 + 한국어 받아쓰기, 자막은 일본어, 일본인 수검자 지시문 (빈칸 모두 채움)
const ja = talk('teach', 'ja01');
assert(ja.r.ok, JSON.stringify(ja.r));
const sys = ja.setup.systemInstruction.parts[0].text;
console.log('ja01 받아쓰기:', ja.setup.inputAudioTranscription.languageCodes.join(' + '), '/ 자막:', ja.setup.outputAudioTranscription.languageCodes.join(''));
assert.deepEqual(ja.setup.inputAudioTranscription.languageCodes, ['ja-JP', 'ko-KR']);
assert.deepEqual(ja.setup.outputAudioTranscription.languageCodes, ['ja-JP']);
assert(ja.setup.inputAudioTranscription.customVocabulary.includes('田中 由美') && ja.setup.inputAudioTranscription.customVocabulary.includes('お名前'));
assert(sys.includes('Japanese patient') && sys.includes('こう言えます：') && sys.includes('田中 由美') && sys.includes('1985-03-02'));
assert(!/\{(name|sex|dob|country|exam|scene|twist|keywords)\}/.test(sys), '빈칸이 모두 채워짐');
console.log('ja01 지시문: ja-partner-v1 (일본인 수검자, 빈칸 모두 채움)');

// ② 일본어 과정 학생은 preview 챕터를 못 본다 (선생님·테스터만). published=TRUE면 대화 가능, 영어 학생은 여전히 못 함
assert.equal(talk('stu-ja', 'ja01').r.error, 'NO_CHAPTER');
w.tabs.chapters.find((r) => r[0] === 'ja01')[w.tabs.chapters[0].indexOf('published')] = true;
assert(talk('stu-ja', 'ja01').r.ok);
assert.equal(talk('stu-en', 'ja01').r.error, 'NO_CHAPTER');
const list = (code) => post({ action: 'chapters', code }).chapters.map((c) => c.chapter_id + ':' + c.course);
console.log('일본어 학생의 챕터:', list('stu-ja').join(', '), '/ 영어 학생:', list('stu-en').join(', '));
assert.deepEqual(list('stu-ja'), ['ja01:ja']);
assert(!list('stu-en').some((c) => c.startsWith('ja')));
assert(list('teach').includes('ja01:ja'), '선생님은 모든 과정');

// ③ 영어·중국어는 그대로
const en = talk('stu-en', 'ch01');
assert.deepEqual(en.setup.inputAudioTranscription.languageCodes, ['en-US', 'ko-KR']);
assert(!en.setup.systemInstruction.parts[0].text.includes('Japanese'));
w.tabs.scenarios.find((r) => r[0] === 'zh01-s02')[w.tabs.scenarios[0].indexOf('active')] = false;   // 대만 시나리오는 꺼서 본토(zh-CN)만
const zh = talk('teach', 'zh01');
assert.deepEqual(zh.setup.inputAudioTranscription.languageCodes, ['zh-CN', 'ko-KR']);
assert(zh.setup.systemInstruction.parts[0].text.includes('Mandarin'));
console.log('영어 ch01: en-US + ko-KR / 중국어 zh01: zh-CN + ko-KR (그대로)');

// ④ 일본어 지시문을 끄면 영어로 대신하지 않고 NO_PROMPT
w.tabs.prompts.find((r) => r[0] === 'ja-partner-v1')[2] = false;
assert.equal(talk('teach', 'ja01').r.error, 'NO_PROMPT');
console.log('ja-partner를 끄면: NO_PROMPT (영어 지시문으로 대신하지 않음)');
console.log('\n모든 확인 통과');
