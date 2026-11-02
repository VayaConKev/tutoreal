// 94단계: 일본어 자막 도우미 — 일본어 대화의 gloss는 ja-gloss-v1(로마자·뜻), 앱에는 pinyin 칸으로. 중국어는 그대로, 영어는 NO_PROMPT
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('6c583c7')); old.run('setup'); old.run('addChineseSample');   // 지금 쓰는 시트 (서버 v0.57)
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
const before = w.tabs.prompts.length;
w.run('setup');
const added = w.tabs.prompts.slice(before).map((r) => r[0]);
console.log('setup 뒤 추가된 지시문:', added.join(', '));
assert.deepEqual(added, ['ja-partner-v1', 'ja-gloss-v1']);

const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row('chapters', { chapter_id: 'ja01', order: 1, title: '호명과 본인 확인', goal: '- 이름 묻기', keywords: 'お名前',
  scene: 'x', published: 'preview', ai_captions: 'show', course: 'ja' });
row('scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan',
  exam: 'stomach endoscopy', level: 1, active: true });

const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const session = (ch) => { w.fetchHook = null; const r = post({ action: 'talk', code: 'teach', chapter_id: ch }); assert(r.ok, JSON.stringify(r)); return r.session_id; };
// 가짜 Gemini: 묻는 칸(romaji 또는 pinyin)에 맞춰 답한다. 보낸 지시문과 칸 이름을 기억한다
let sent = null;
w.fetchHook = null;
const gloss = (sid, text) => {
  w.fetchHook = (url, p) => {
    if (url.includes('auth_tokens')) return null;
    const keys = Object.keys(p.generationConfig.responseSchema.properties);
    sent = { keys, body: JSON.stringify(p) };
    const data = keys.includes('romaji') ? { romaji: 'Tanaka Yumi desu.', ko: '다나카 유미예요.' } : { pinyin: 'Nín hǎo!', ko: '안녕하세요!' };
    return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 300, candidatesTokenCount: 30 } }];
  };
  return post({ action: 'gloss', code: 'teach', session_id: sid, text });
};

// ① 일본어: romaji 칸으로 묻고, 앱에는 pinyin 칸(= 읽기)으로
const ja = gloss(session('ja01'), '田中由美です。');
console.log('일본어 gloss:', JSON.stringify(ja), '/ 물은 칸:', sent.keys.join(', '));
assert(ja.ok); assert.equal(ja.pinyin, 'Tanaka Yumi desu.'); assert.equal(ja.ko, '다나카 유미예요.');
assert.deepEqual(sent.keys, ['romaji', 'ko']);
assert(sent.body.includes('Hepburn romaji') && sent.body.includes('こう言えます'), 'ja-gloss-v1 지시문');

// ② 중국어는 그대로 (pinyin 칸, zh-gloss)
const zh = gloss(session('zh01'), '您好！');
console.log('중국어 gloss:', JSON.stringify(zh), '/ 물은 칸:', sent.keys.join(', '));
assert(zh.ok); assert.equal(zh.pinyin, 'Nín hǎo!'); assert.deepEqual(sent.keys, ['pinyin', 'ko']);
assert(sent.body.includes('Hanyu Pinyin'));

// ③ 영어는 지시문이 없어 NO_PROMPT (그대로)
sent = null;
assert.equal(gloss(session('ch01'), 'Hello.').error, 'NO_PROMPT'); assert.equal(sent, null);
// ④ 일본어 지시문을 끄면 NO_PROMPT (중국어 지시문으로 대신하지 않음)
w.tabs.prompts.find((r) => r[0] === 'ja-gloss-v1')[2] = false;
assert.equal(gloss(session('ja01'), 'はい。').error, 'NO_PROMPT');
console.log('영어: NO_PROMPT / ja-gloss를 끄면: NO_PROMPT');
console.log('\n모든 확인 통과');
