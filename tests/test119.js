// 119단계 (서버 v0.71): 대화 전 화면의 EMR — 챕터 목록에 켜진 시나리오의 차트 칸만, talk에 scenario_id를 보내면 그 시나리오로
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const w = makeWorld(CODE); w.run('setup');
const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row('chapters', { chapter_id: 'ch77', order: 77, title: '시험', goal: '- 시험', keywords: 'x', scene: 'x', published: true, ai_captions: 'show', course: 'en' });
const sc = (id, o) => row('scenarios', { scenario_id: id, chapter_id: 'ch77', name: 'Pat ' + id, sex: 'female', dob: '1990-01-02', country: 'USA', twist: 'SECRET TWIST', level: 1, active: true, answers: 'd01: SECRET ANSWER', ...o });
sc('a', { exam: 'stomach endoscopy with sedation' });
sc('b', { exam: 'colonoscopy without sedation', sex: 'male' });
sc('c', { exam: 'Result: chronic gastritis (만성 위염) SECRET RESULT' });
sc('d', { exam: 'Result: polyp SECRET RESULT', slip: 'G/C - GU Scar' });
sc('e', { exam: 'colonoscopy', active: false });
const st = w.tabs.settings; const set = (k, v) => { const r = st.find((x) => x[0] === k); if (r) r[1] = v; else st.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000); set('default_daily_limit_min', 6000);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;

// ① 챕터 목록: 켜진 시나리오만, 차트 칸만 (숨은 설정·기본 답·결과는 없다)
const ch = post({ action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ch77');
const byId = Object.fromEntries(ch.scenarios.map((s) => [s.scenario_id, s]));
assert.deepEqual(Object.keys(byId), ['a', 'b', 'c', 'd'], '꺼진 시나리오는 빠진다');
assert.deepEqual(byId.a, { scenario_id: 'a', name: 'Pat a', sex: 'female', dob: '1990-01-02', exam: 'stomach endoscopy', sedation: 'with' });
assert.deepEqual([byId.b.exam, byId.b.sedation, byId.b.sex], ['colonoscopy', 'without', 'male']);
assert.deepEqual([byId.c.exam, byId.c.sedation], ['', ''], '검사 칸에 결과가 있으면 검사는 빈칸');
assert.deepEqual([byId.d.exam, byId.d.sedation], ['stomach endoscopy and colonoscopy', 'without'], '슬립: G/C와 +/−에서');
assert(!JSON.stringify(ch.scenarios).includes('SECRET'), '숨은 설정·기본 답·결과는 보내지 않는다');
const other = post({ action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ch01');
assert(Array.isArray(other.scenarios) && other.scenarios.length > 0, '다른 챕터도 scenarios 목록');
console.log('챕터 목록: 켜진 시나리오의 이름 · 성별 · 생년월일 · 검사 · 수면 여부만 (결과·숨은 설정 없음)');

// ② talk: scenario_id를 보내면 그 시나리오, 꺼졌거나 다른 챕터·없는 id면 무작위(켜진 것 중)
w.fetchHook = () => null;
const talk = (extra) => { const r = post({ action: 'talk', code: 'teach', chapter_id: 'ch77', mode: 'script', ...extra }); assert(r.ok, JSON.stringify(r)); return r.scenario_id; };
for (let i = 0; i < 5; i++) assert.equal(talk({ scenario_id: 'b' }), 'b');
for (const bad of ['e', 'ch01-s01', 'nope']) for (let i = 0; i < 5; i++) assert(['a', 'b', 'c', 'd'].includes(talk({ scenario_id: bad })), bad);
for (let i = 0; i < 5; i++) assert(['a', 'b', 'c', 'd'].includes(talk({})));
console.log('talk: scenario_id가 그 챕터의 켜진 시나리오면 그대로, 아니면 무작위');
console.log('모든 확인 통과');
