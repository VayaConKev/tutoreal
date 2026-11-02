// 95단계: 일본어 피드백 — ja-feedback-v1, 로마자를 better_py·py 칸으로. 영어·중국어 피드백 지시문은 v0.59와 글자 하나까지 같음
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = '903f50a';   // 서버 v0.59
const old = makeWorld(baseline(BASE)); old.run('setup'); old.run('addChineseSample');   // 지금 쓰는 시트
const before = old.tabs.prompts.length;

// 같은 시트·같은 대화로 서버(지금 / v0.59)를 돌려 AI에 보낸 요청을 받는다
function world(code) {
  const w = makeWorld(code);
  Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
  w.run('setup');
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('live_model', 'x'); set('text_model', 'y'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
  const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
  row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
  row('chapters', { chapter_id: 'ja01', order: 1, title: '호명과 본인 확인', goal: '- 이름 묻기', keywords: 'お名前, 生年月日',
    scene: 'x', published: 'preview', ai_captions: 'show', course: 'ja', checklist: '성함 묻기 | お名前をお願いします。' });
  row('scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan',
    exam: 'stomach endoscopy', level: 1, active: true });
  w.tabs.scenarios.filter((r) => /^zh01-s0[2-9]/.test(r[0]) || /^ch01-s0[2-9]/.test(r[0]))
    .forEach((r) => { r[w.tabs.scenarios[0].indexOf('active')] = false; });   // 시나리오 하나씩만 (같은 지시문이 나오게)
  return w;
}
const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function feedback(w, ch, lines, data) {
  w.fetchHook = null;
  const t = post(w, { action: 'talk', code: 'teach', chapter_id: ch }); assert(t.ok, JSON.stringify(t));
  let sent = null;
  w.fetchHook = (url, p) => {
    if (url.includes('auth_tokens')) return null;
    sent = { system: p.systemInstruction.parts[0].text, schema: p.generationConfig.responseSchema, user: JSON.stringify(p.contents) };
    return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data(sent.schema)) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } }];
  };
  const r = post(w, { action: 'feedback', code: 'teach', session_id: t.session_id, lines });
  return { r, sent };
}

const w = world(CODE);
const added = w.tabs.prompts.slice(before).map((r) => r[0]);
console.log('setup 뒤 추가된 지시문 (v0.59 시트에):', added.join(', '));
assert(added.includes('ja-feedback-v1'));   // 그 뒤 단계의 일본어 지시문(96단계 ja-pron-v1 등)도 함께 더해질 수 있다

// ① 일본어: romaji 칸으로 묻고 better_py·py로 돌려줌, 체크리스트도 그대로
const JA = { summary: '이름을 물었어요.', strengths: ['좋아요'], keywords: [{ keyword: 'お名前', used: true }], checklist: [{ n: 1, done: true }],
  fixes: [{ said: '名前は？', better: 'お名前をお願いします。', better_romaji: 'Onamae o onegai shimasu.', why: '더 공손해요.' }],
  next_practice: [{ ja: '生年月日をお願いします。', romaji: 'Seinengappi o onegai shimasu.', ko: '생년월일을 알려 주세요.' }] };
const ja = feedback(w, 'ja01', [{ who: 'me', text: '名前は？' }, { who: 'ai', text: '田中です。' }], () => JA);
assert(ja.r.ok, JSON.stringify(ja.r));
const fb = ja.r.feedback;
console.log('일본어 피드백:', JSON.stringify({ fixes: fb.fixes, next_practice: fb.next_practice }));
assert.deepEqual(Object.keys(ja.sent.schema.properties.fixes.items.properties), ['said', 'better', 'why', 'better_romaji']);
assert.deepEqual(Object.keys(ja.sent.schema.properties.next_practice.items.properties), ['ja', 'romaji', 'ko']);
assert.equal(fb.fixes[0].better_py, 'Onamae o onegai shimasu.');
assert.deepEqual(fb.next_practice[0], { en: '生年月日をお願いします。', py: 'Seinengappi o onegai shimasu.', ko: '생년월일을 알려 주세요.' });
assert.equal(fb.checklist[0].done, true); assert.deepEqual(fb.keywords.map((k) => k.used), [true, false]);
assert(ja.sent.system.includes('Japanese speaking coach') && ja.sent.system.includes('田中 由美'));
assert(ja.sent.system.includes('almost always Japanese speech that was misheard') && ja.sent.system.includes('suggest a Japanese way'));
assert(!ja.sent.system.includes('English speech'));
assert(ja.sent.user.includes('Nurse: 名前は？') && ja.sent.user.includes('Patient: 田中です。'));
assert(!/\{(goal|keywords|name|dob|exam)\}/.test(ja.sent.system), '빈칸이 모두 채워짐');
console.log('일본어 지시문: ja-feedback-v1 + 받아쓰기 규칙(일본어) + 체크리스트, 빈칸 모두 채움');

// ② 영어·중국어: 보낸 지시문·칸이 v0.59와 똑같다
const EN = () => ({ summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [] });
const prev = world(baseline(BASE));
for (const [ch, line] of [['ch01', 'Lucas Martin?'], ['zh01', '您好！']]) {
  const a = feedback(w, ch, [{ who: 'me', text: line }], EN).sent;
  const b = feedback(prev, ch, [{ who: 'me', text: line }], EN).sent;
  assert.equal(a.system, b.system, ch + ' 지시문이 같다');
  assert.deepEqual(a.schema, b.schema, ch + ' 칸이 같다');
}
console.log('영어 ch01·중국어 zh01: 지시문과 칸이 v0.59와 똑같음');

// ③ 일본어 지시문을 끄면 NO_PROMPT
w.tabs.prompts.find((r) => r[0] === 'ja-feedback-v1')[2] = false;
assert.equal(feedback(w, 'ja01', [{ who: 'me', text: 'はい' }], () => JA).r.error, 'NO_PROMPT');
console.log('ja-feedback을 끄면: NO_PROMPT');
console.log('\n모든 확인 통과');
