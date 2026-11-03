// 98단계: 체크리스트 세 번째 칸(읽기) — '한국어 | 日本語 | romaji'. 화면에만 보내고 피드백 판단 기준에는 넣지 않음. 두 칸 줄은 v0.61과 같음
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = 'f03556a';   // 서버 v0.61 (96단계 커밋)
const old = makeWorld(baseline(BASE)); old.run('setup');

const JA_CHECK = [
  '성함 묻기 | お名前をお願いします。 | Onamae o onegai shimasu.',
  '(선택) 다시 묻기 | すみません、もう一度お願いします。 | Sumimasen, mō ichido onegai shimasu.',
  '(남성) 전립선 | 前立腺肥大と診断されたことはありますか？ | Zenritsusen hidai to shindan sareta koto wa arimasu ka?',
  '한국어만'
].join('\n');
const EN_CHECK = '저를 바라보면서 왼쪽으로 누워주세요. | Please lie down on your left side, facing me.\n(선택) 어깨 밀기 | I\'ll push your left shoulder back a little.';

function world(code) {
  const w = makeWorld(code);
  Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
  w.run('setup');
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('live_model', 'x'); set('text_model', 'y'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
  const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
  row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
  row('chapters', { chapter_id: 'ja01', order: 1, title: '호명', goal: '-', keywords: 'お名前', scene: 'x', published: 'preview',
    ai_captions: 'show', course: 'ja', checklist: JA_CHECK });
  row('scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: 'Tanaka Kenichi', sex: 'male', dob: '1988-06-14', country: 'Japan',
    exam: 'stomach endoscopy', level: 1, active: true });
  w.tabs.chapters.find((r) => r[0] === 'ch02')[w.tabs.chapters[0].indexOf('checklist')] = EN_CHECK;
  w.tabs.scenarios.filter((r) => /^ch02-s0[2-9]/.test(r[0])).forEach((r) => { r[w.tabs.scenarios[0].indexOf('active')] = false; });
  return w;
}
const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function feedback(w, ch, done) {
  w.fetchHook = null;
  const t = post(w, { action: 'talk', code: 'teach', chapter_id: ch }); assert(t.ok, JSON.stringify(t));
  let system = '';
  w.fetchHook = (url, p) => {
    if (url.includes('auth_tokens')) return null;
    system = p.systemInstruction.parts[0].text;
    const data = { summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [], checklist: done };
    return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } }];
  };
  const r = post(w, { action: 'feedback', code: 'teach', session_id: t.session_id, lines: [{ who: 'me', text: 'はい' }] });
  assert(r.ok, JSON.stringify(r));
  return { fb: r.feedback, system };
}

const w = world(CODE);
// ① 챕터 목록: 세 칸 줄은 en(일본어)·py(로마자)로 나뉨, 표시((선택)·(남성))는 그대로, 한국어만인 줄도 그대로
const ja = post(w, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ja01');
console.log('ja01 체크리스트:', JSON.stringify(ja.checklist));
assert.deepEqual(ja.checklist[0], { text: '성함 묻기', en: 'お名前をお願いします。', py: 'Onamae o onegai shimasu.', optional: false, sex: '' });
assert.equal(ja.checklist[1].optional, true); assert.equal(ja.checklist[1].py, 'Sumimasen, mō ichido onegai shimasu.');
assert.equal(ja.checklist[2].sex, 'male'); assert(ja.checklist[2].en.endsWith('ありますか？'));
assert.deepEqual(ja.checklist[3], { text: '한국어만', en: '', py: '', optional: false, sex: '' });

// ② 피드백: 모범 문장에는 일본어만 (로마자 없음), 결과에는 py
const f = feedback(w, 'ja01', [{ n: 1, done: true }, { n: 2, done: false }, { n: 3, done: true }, { n: 4, done: false }]);
assert(f.system.includes('1. 성함 묻기 (model sentence: お名前をお願いします。)'));
assert(!f.system.includes('Onamae'), '로마자는 판단 기준에 넣지 않음');
assert.deepEqual(f.fb.checklist[0], { item: '성함 묻기', en: 'お名前をお願いします。', optional: false, sex: '', done: true, py: 'Onamae o onegai shimasu.' });
assert(!('py' in f.fb.checklist[3]), '읽기가 없는 줄은 py 칸 없음');
console.log('ja01 피드백 체크리스트:', JSON.stringify(f.fb.checklist.map((c) => [c.item, c.done, c.py || ''])));

// ③ 두 칸 줄(영어 ch02): 챕터 목록의 en, 피드백 지시문과 결과가 v0.61과 같다 (목록에 빈 py 칸만 더해짐)
const prev = world(baseline(BASE));
const enNow = post(w, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ch02').checklist;
const enOld = post(prev, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ch02').checklist;
assert.deepEqual(enNow.map((c) => { const { py, ...rest } = c; assert.equal(py, ''); return rest; }), enOld);
const done = [{ n: 1, done: true }, { n: 2, done: false }];
const a = feedback(w, 'ch02', done), b = feedback(prev, 'ch02', done);
assert.equal(a.system, b.system); assert.deepEqual(a.fb.checklist, b.fb.checklist);
console.log('영어 ch02 (두 칸): 챕터 목록·피드백 지시문·결과가 v0.61과 같음');
console.log('\n모든 확인 통과');
