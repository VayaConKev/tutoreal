// 101단계: 중국어 과정 없애기 — 영어·일본어의 대화·피드백·발음 코칭·자막 도우미는 v0.64(b5a0e8b)와 글자 하나까지 같고,
// setup은 중국어 줄을 더하지 않으며, 시트에 남은 중국어 챕터·지시문은 쓰지 않는다 (NO_PROMPT).
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const BASE = 'b5a0e8b';   // 서버 v0.64 (중국어 과정이 있던 마지막 커밋)

// ① 코드에 중국어 전용 부분이 남아 있지 않다
const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
for (const word of ['ZH_', 'addChineseSample', 'zh_lang_', 'last_class_date_zh', 'Mandarin']) assert(!CODE.includes(word), 'Code.gs: ' + word);
assert(!/(^|[^_])GLOSS_SCHEMA\b/.test(CODE), 'Code.gs: 중국어 병음용 GLOSS_SCHEMA (일본어 JA_GLOSS_SCHEMA만 남김)');
for (const word of ['localPinyin', 'loadPinyin', 'pinyin-pro', "=== 'zh'"]) assert(!app.includes(word), 'app.js: ' + word);
assert(!fs.existsSync(path.join(__dirname, '..', 'js', 'vendor', 'pinyin-pro.js')), 'pinyin-pro.js 삭제');
console.log('코드: 중국어 지시문·예시·받아쓰기 설정·병음 변환기 없음');

// ② 새 시트: setup이 중국어 지시문·설정을 만들지 않는다
const fresh = makeWorld(CODE); fresh.run('setup');
assert(!fresh.tabs.prompts.some((r) => String(r[0]).startsWith('zh-')), '중국어 지시문 없음');
assert(!fresh.tabs.settings.some((r) => /^zh_|_zh$/.test(String(r[0]))), '중국어 설정 없음');
console.log('새 시트 setup: zh- 지시문, zh_lang_*, last_class_date_zh 없음');

// 지금 쓰는 시트 (v0.64 + 중국어 예시 + 일본어 챕터)를 두 서버(지금 / v0.64)로 똑같이 돌린다
const old = makeWorld(baseline(BASE)); old.run('setup'); old.run('addChineseSample');
const row = (tabs, tab, obj) => { const t = tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row(old.tabs, 'students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row(old.tabs, 'chapters', { chapter_id: 'ja01', order: 1, title: '호명과 본인 확인', goal: '- 이름 묻기', keywords: 'お名前, 生年月日',
  scene: 'x', published: true, ai_captions: 'show', course: 'ja', checklist: '성함 묻기 | お名前をお願いします。 | Onamae o onegai shimasu.' });
row(old.tabs, 'scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan',
  exam: 'stomach endoscopy with sedation', level: 1, active: true });
row(old.tabs, 'drills', { drill_id: 'ja01-d01', chapter_id: 'ja01', order: 1, situation: '성함을 물어볼 때', sentence: '[お名前]をお願いします。',
  pron: '[Onamae] o onegai shimasu.', active: true });
const sc = old.tabs.scenarios; const ACT = sc[0].indexOf('active');
sc.filter((r) => /-s0[2-9]$/.test(r[0])).forEach((r) => { r[ACT] = false; });   // 챕터마다 시나리오 하나만 (같은 지시문이 나오게)
const st = old.tabs.settings; const set = (k, v) => { const r = st.find((x) => x[0] === k); if (r) r[1] = v; else st.push([k, v, '']); };
set('live_model', 'x'); set('text_model', 'y'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000); set('default_daily_limit_min', 6000);

function world(code) {
  const w = makeWorld(code);
  Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
  w.run('setup');
  return w;
}
const now = world(CODE);
const prev = world(baseline(BASE));
// 배포 뒤 setup을 다시 돌려도 남은 중국어 줄은 그대로 (선생님이 직접 지운다), 새로 더하지도 않는다
assert.equal(now.tabs.prompts.length, old.tabs.prompts.length, 'setup이 지시문 줄을 더하거나 빼지 않음');
assert.equal(now.tabs.settings.length, old.tabs.settings.length, 'setup이 설정 줄을 더하거나 빼지 않음');

const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const AI = (data) => [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }],
  usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } }];
function talk(w, ch) {
  let setup = null;
  w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) setup = p.bidiGenerateContentSetup; return null; };
  const r = post(w, { action: 'talk', code: 'teach', chapter_id: ch });
  return { r, setup };
}
function feedback(w, ch) {
  const t = talk(w, ch).r; assert(t.ok, JSON.stringify(t));
  let sent = null;
  w.fetchHook = (url, p) => {
    sent = { system: p.systemInstruction.parts[0].text, schema: p.generationConfig.responseSchema, user: JSON.stringify(p.contents) };
    return AI({ summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [], checklist: [] });
  };
  post(w, { action: 'feedback', code: 'teach', session_id: t.session_id, lines: [{ who: 'me', text: 'Hello.' }, { who: 'ai', text: 'Hi.' }] });
  return sent;
}
function pron(w, id, level) {
  let sent = null;
  w.fetchHook = (url, p) => {
    sent = { system: p.systemInstruction.parts[0].text, first: p.contents[0].parts[0].text };
    return AI({ heard: 'x', said_target: true, overall: 'good', message: 'm', words: [] });
  };
  post(w, { action: 'pronounce', code: 'teach', drill_id: id, level, audio: 'UklGRg==' });
  return sent;
}
function gloss(w, ch) {
  const t = talk(w, ch).r; assert(t.ok, JSON.stringify(t));
  let sent = null;
  w.fetchHook = (url, p) => {
    sent = { system: p.systemInstruction.parts[0].text, schema: p.generationConfig.responseSchema };
    return AI({ romaji: 'Hai.', ko: '네.' });
  };
  const r = post(w, { action: 'gloss', code: 'teach', session_id: t.session_id, text: 'はい。' });
  return { r, sent };
}

// ③ 대화: 지시문·받아쓰기 언어·목소리가 v0.64와 같다
for (const ch of ['ch01', 'ch02', 'ja01']) {
  const a = talk(now, ch); const b = talk(prev, ch);
  assert(a.r.ok && b.r.ok, ch);
  assert.deepEqual(a.setup, b.setup, ch + ' 대화 설정');
}
console.log('대화 ch01·ch02·ja01: 지시문·받아쓰기·자막 설정이 v0.64와 똑같음');

// ④ 피드백: 보통·너그러운(gentle) 모두 지시문·칸이 v0.64와 같다
const FS = now.tabs.chapters[0].indexOf('feedback_style');
for (const gentle of ['', 'gentle']) {
  for (const w of [now, prev]) w.tabs.chapters.filter((r) => ['ch02', 'ja01'].includes(r[0])).forEach((r) => { r[FS] = gentle; });
  for (const ch of ['ch01', 'ch02', 'ja01']) {
    const a = feedback(now, ch); const b = feedback(prev, ch);
    assert.equal(a.system, b.system, ch + ' ' + gentle + ' 지시문');
    assert.deepEqual(a.schema, b.schema, ch + ' ' + gentle + ' 칸');
    assert.equal(a.user, b.user, ch + ' 대화 글자 (Nurse/Patient)');
  }
}
console.log('피드백 ch01·ch02·ja01 (보통·gentle): 지시문·칸·대화 글자가 v0.64와 똑같음');

// ⑤ 발음 코칭: 영어·일본어 두 단계 모두 같다
for (const id of ['ch02-d04', 'ja01-d01']) {
  for (const level of ['blank', 'korean']) assert.deepEqual(pron(now, id, level), pron(prev, id, level), id + ' ' + level);
}
console.log('발음 코칭 ch02-d04·ja01-d01 (빈칸·통째로): v0.64와 똑같음');

// ⑥ 자막 도우미: 일본어는 같고, 영어는 NO_PROMPT
const ga = gloss(now, 'ja01'); const gb = gloss(prev, 'ja01');
assert(ga.r.ok && ga.r.pinyin === 'Hai.'); assert.deepEqual(ga.sent, gb.sent);
assert.equal(gloss(now, 'ch01').r.error, 'NO_PROMPT');
console.log('자막 도우미 ja01: v0.64와 똑같음 (앱에는 pinyin 칸으로) / 영어: NO_PROMPT');

// ⑦ 시트에 남은 중국어: 대화·발음 코칭은 NO_PROMPT, 선생님 챕터 목록에는 아직 보인다 (그래서 배포 전에 비공개로)
assert.equal(talk(now, 'zh01').r.error, 'NO_PROMPT');
let called = false; now.fetchHook = () => { called = true; return null; };
assert.equal(post(now, { action: 'pronounce', code: 'teach', drill_id: 'zh01-d04', level: 'blank', audio: 'UklGRg==' }).error, 'NO_PROMPT');
assert(!called, 'AI를 부르지 않음');
console.log('시트에 남은 중국어 zh01: 대화·발음 코칭 NO_PROMPT');
const PUB = now.tabs.chapters[0].indexOf('published');
now.tabs.chapters.filter((r) => String(r[0]).startsWith('zh')).forEach((r) => { r[PUB] = false; });
const ids = post(now, { action: 'chapters', code: 'teach' }).chapters.map((c) => c.chapter_id);
assert(!ids.some((id) => id.startsWith('zh')) && ids.includes('ch01') && ids.includes('ja01'));
console.log('중국어 챕터를 비공개로 하면 선생님 목록:', ids.join(', '));

console.log('\n모든 확인 통과');
