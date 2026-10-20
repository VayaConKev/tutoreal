// 46단계: 환자 지시문 v3 — 이미 쓰던 시트에 setup()을 다시 돌렸을 때와 대화 토큰에 들어가는 지시문 확인
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('73846cc')); old.run('setup');
const P = () => w.tabs.prompts;
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));       // 지금 쓰는 시트 (서버 v0.42로 만든 것)
const row = (id) => P().find((r) => r[0] === id);
row('patient-v1')[2] = false;                                        // v0.15 안내대로 v1은 꺼 둔 상태
const before = P().length;
w.run('setup');
console.log('setup 뒤 prompts 줄 수:', before, '→', P().length, '/ 추가된 줄:', P().slice(before).map((r) => r[0]).join(', '));
assert.equal(P().length, before + 1); assert(row('patient-v3') && row('patient-v3')[2] === true);
assert(row('patient-v2')[1] === old.tabs.prompts.find((r) => r[0] === 'patient-v2')[1], 'v2 내용은 그대로');

const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const sentInstruction = () => {
  let sys = ''; w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) sys = p.bidiGenerateContentSetup.systemInstruction.parts[0].text; return null; };
  const r = w.run('doPost', { postData: { contents: JSON.stringify({ action: 'talk', code: 'stu', chapter_id: 'ch02' }) } }).body;
  assert(r.ok, JSON.stringify(r)); return sys;
};
// ① v2를 끄기 전: 아직 v2 (위에 있는 줄이 먼저)
let sys = sentInstruction();
assert(sys.includes('Never give medical advice') && !sys.includes('Never add disclaimers'));
console.log('v2를 켜 둔 동안: 예전 지시문(v2) 사용');
// ② v2 active → FALSE
row('patient-v2')[2] = false; sys = sentInstruction();
assert(!sys.includes('Never give medical advice') && sys.includes('Never add disclaimers') && sys.includes('You are the patient, not a doctor'));
assert(!/\{(name|sex|dob|country|exam|scene|twist)\}/.test(sys), '빈칸이 모두 채워짐');
assert(sys.includes('Sorry?') && sys.includes('Here is my passport.'), 'v2의 다른 규칙은 그대로');
console.log('v2를 FALSE로 바꾼 뒤: v3 사용, 빈칸 모두 채워짐, v2의 다른 규칙(되묻기·한국어·없는 정보) 유지');
console.log('\n--- 실제로 보낸 지시문 (2장, 무작위 시나리오) ---\n' + sys);
console.log('\n모든 확인 통과');
