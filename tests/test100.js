// 100단계: 체크리스트 검사 표시 (수면)(대장)(위) — 시나리오 exam 글자로 가림. 표시가 없는 줄은 이전 서버와 같음
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');

const CHECK = [
  '성함 묻기 | Could you tell me your full name, please?',
  '(대장) 장 정결제 | Did you drink all the medicine we gave you?',
  '(여성) 제왕절개 | Have you ever had a C-section?',
  '(수면) 계란·콩 | Are you allergic to eggs or soy?',
  '(선택) (위) 목 안내 | Your throat may feel a little sore.',
  '(수면) (대장) 둘 다 | Both.'
].join('\n');

function world(code, exam, sex) {
  const w = makeWorld(code); w.run('setup');
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('live_model', 'x'); set('text_model', 'y'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
  const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
  row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
  row('chapters', { chapter_id: 'ci01', order: 1, title: '동의서', goal: '-', keywords: 'list', scene: 'x', published: true, ai_captions: 'tap', course: 'en', checklist: CHECK });
  row('scenarios', { scenario_id: 'ci01-s01', chapter_id: 'ci01', name: 'Test Patient', sex, dob: '1980-01-01', country: 'France', exam, level: 1, active: true });
  return w;
}
const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function feedback(w, chapter) {
  const t = post(w, { action: 'talk', code: 'teach', chapter_id: chapter }); assert(t.ok, JSON.stringify(t));
  let system = '';
  w.fetchHook = (url, p) => {
    if (url.includes('auth_tokens')) return null;
    system = p.systemInstruction.parts[0].text;
    const data = { summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [], checklist: [{ n: 1, done: true }, { n: 2, done: false }] };
    return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } }];
  };
  const r = post(w, { action: 'feedback', code: 'teach', session_id: t.session_id, lines: [{ who: 'me', text: 'Hello' }] });
  w.fetchHook = null;
  assert(r.ok, JSON.stringify(r));
  return { list: r.feedback.checklist, system };
}

// ① 챕터 목록: 모든 줄이 표시와 함께 온다. 표시가 없는 줄에는 when 칸이 없다
const w0 = world(CODE, 'stomach endoscopy with sedation', 'male');
const items = post(w0, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ci01').checklist;
assert.equal(items.length, 6);
assert(!('when' in items[0]) && !('when' in items[2]));
assert.deepEqual(items[1].when, ['colon']);
assert.deepEqual(items[3].when, ['sedation']);
assert.deepEqual(items[4].when, ['stomach']); assert.equal(items[4].optional, true); assert.equal(items[4].text, '목 안내');
assert.deepEqual(items[5].when, ['sedation', 'colon']);

// ② 검사마다 해당 줄만 판단·표시 (글자를 그대로 보고, 비수면에 '수면'이 걸리지 않게)
const cases = [
  ['stomach endoscopy with sedation', 'male', ['성함 묻기', '계란·콩', '목 안내']],
  ['stomach endoscopy without sedation', 'female', ['성함 묻기', '제왕절개', '목 안내']],
  ['colonoscopy with sedation', 'male', ['성함 묻기', '장 정결제', '계란·콩', '둘 다']],
  ['colonoscopy without sedation', 'male', ['성함 묻기', '장 정결제']],
  ['stomach endoscopy and colonoscopy with sedation', 'female', ['성함 묻기', '장 정결제', '제왕절개', '계란·콩', '목 안내', '둘 다']]
];
cases.forEach(([exam, sex, want]) => {
  const f = feedback(world(CODE, exam, sex), 'ci01');
  assert.deepEqual(f.list.map((c) => c.item), want, exam);
  want.forEach((text, i) => assert(f.system.includes(`${i + 1}. ${f.list[i].optional ? '(optional) ' : ''}${text} (model sentence:`), exam + ' 지시문'));
  ['장 정결제', '계란·콩', '목 안내', '제왕절개', '둘 다'].filter((x) => !want.includes(x)).forEach((x) => assert(!f.system.includes(x), exam + ' 지시문에 없어야: ' + x));
  console.log(exam, '/', sex, '→', want.join(', '));
});
const fb = feedback(world(CODE, 'colonoscopy with sedation', 'male'), 'ci01').list;
assert.deepEqual(fb[1].when, ['colon']); assert(!('when' in fb[0]), '표시가 없는 줄의 결과는 지금과 같은 모양');

// ③ 표시가 없는 줄은 이전 서버와 목록·지시문·결과가 같다
const prevPath = baseline('0edf36a');   // 서버 v0.62 (98단계 커밋). 체크리스트 부분은 v0.63과 같다
const PLAIN = '성함 묻기 | Could you tell me your full name, please?\n(선택) (남성) 전립선 | Do you have any prostate problems?';
const plain = (code) => { const w = world(code, 'stomach endoscopy with sedation', 'male'); const t = w.tabs.chapters; const r = t.find((x) => x[0] === 'ci01'); r[t[0].indexOf('checklist')] = PLAIN; return w; };
const a = plain(CODE), b = plain(prevPath);
const ca = post(a, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ci01').checklist;
const cb = post(b, { action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ci01').checklist;
assert.deepEqual(ca, cb);
const fa = feedback(a, 'ci01'), fbb = feedback(b, 'ci01');
assert.equal(fa.system, fbb.system); assert.deepEqual(fa.list, fbb.list);
console.log('표시가 없는 줄: 목록·지시문·결과가 이전 서버와 같음');
console.log('\n모든 확인 통과');
