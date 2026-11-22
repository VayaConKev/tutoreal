// 105단계: 대화 모드 — talk의 mode(script 대본 / cue 큐카드 / free 자유), scenarios answers·variants, sessions mode, 대본 줄(script)
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = '2a2afdd';   // 서버 v0.66 (v1.09 커밋)

// 지금 쓰는 시트 (v0.66) + 일본어 챕터
const old = makeWorld(baseline(BASE)); old.run('setup');
const row = (tabs, tab, obj) => { const t = tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row(old.tabs, 'students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row(old.tabs, 'chapters', { chapter_id: 'ja01', order: 1, title: '호명', goal: '- 이름 묻기', keywords: 'お名前', scene: 'x', published: true, ai_captions: 'show', course: 'ja' });
row(old.tabs, 'scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan', exam: 'stomach endoscopy', twist: 'You are a little nervous.', level: 1, active: true });
row(old.tabs, 'drills', { drill_id: 'ja01-d01', chapter_id: 'ja01', order: 1, situation: '성함을 물어볼 때', sentence: '[お名前]をお願いします。', pron: '[Onamae] o onegai shimasu.', active: true });
const SC = old.tabs.scenarios; const ACT = SC[0].indexOf('active');
SC.filter((r) => /^ch01-s0[23]$/.test(r[0])).forEach((r) => { r[ACT] = false; });   // 1장은 ch01-s01 하나만
SC.find((r) => r[0] === 'ch01-s01')[SC[0].indexOf('twist')] = 'You are in a hurry.';
const st = old.tabs.settings; const set = (k, v) => { const r = st.find((x) => x[0] === k); if (r) r[1] = v; else st.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000); set('default_daily_limit_min', 6000);
const sessionsHead = old.tabs.sessions[0].slice(); const scenariosHead = SC[0].slice();

function world(code) {
  const w = makeWorld(code);
  Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
  w.run('setup');
  return w;
}
const now = world(CODE);
const prev = world(baseline(BASE));

// ① setup: scenarios에 answers·variants, sessions에 mode (기존 칸 순서 그대로, 두 번 돌려도 그대로)
assert.deepEqual(now.tabs.scenarios[0], scenariosHead.concat(['answers', 'variants']));
assert.deepEqual(now.tabs.sessions[0], sessionsHead.concat(['mode']));
now.run('setup');
assert.equal(now.tabs.scenarios[0].length, scenariosHead.length + 2); assert.equal(now.tabs.sessions[0].length, sessionsHead.length + 1);
console.log('setup: scenarios에 answers·variants, sessions에 mode (두 번 돌려도 그대로)');

const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function talk(w, ch, mode) {
  let setup = null;
  w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) setup = p.bidiGenerateContentSetup; return null; };
  const r = post(w, { action: 'talk', code: 'teach', chapter_id: ch, ...(mode === undefined ? {} : { mode }) });
  assert(r.ok, JSON.stringify(r));
  return { r, setup, sys: setup.systemInstruction.parts[0].text };
}

// ② answers가 빈 시트: 모드를 보내도, 안 보내도 지시문·설정이 v0.66과 같다
for (const mode of [undefined, 'script', 'cue', 'free']) {
  assert.deepEqual(talk(now, 'ch01', mode).setup, talk(prev, 'ch01', undefined).setup, 'answers 빈칸 · ' + mode);
}
console.log('answers가 빈 시나리오: 어느 모드든 지시문이 v0.66과 똑같음');

// 시트에 기본 답·변형을 채운다 (1장 TSV 초안과 같은 모양)
const H = now.tabs.scenarios[0]; const s01 = now.tabs.scenarios.find((r) => r[0] === 'ch01-s01');
s01[H.indexOf('answers')] = 'd01: Yes, that\'s me.\nd02: Lucas Martin.\nd04: The 14th of June, 1988.\nI have no allergies.';
s01[H.indexOf('variants')] = 'Say "Sorry?" once when the nurse calls you.\nSpell your last name quickly.';

// ③ 모드 없음 · 잘못된 모드: 지금과 같다 (twist 그대로, 모드 지시 없음)
const base = talk(prev, 'ch01', undefined);
for (const mode of [undefined, 'SCRIPTX', '']) {
  const a = talk(now, 'ch01', mode);
  assert.deepEqual(a.setup, base.setup, 'mode ' + JSON.stringify(mode));
  assert.equal(a.r.mode, ''); assert.equal(a.r.script, null);
}
console.log('모드 없음·잘못된 모드: 지시문이 v0.66과 똑같고 script 없음');

// ④ 대본: twist 빠짐, 짝지은 기본 답, 변형 없음
const sc = talk(now, 'ch01', 'script');
assert(!sc.sys.includes('You are in a hurry.'), '대본은 twist 없음');
assert(sc.sys.includes('Practice mode: SCRIPT'));
assert(sc.sys.includes('These practice-mode rules come last and win over the rules above (for example, do not ask your own questions in this mode).'), '대본: 모드 규칙이 우선 (v0.68)');
assert(sc.sys.indexOf('Sometimes ask one simple question') < sc.sys.indexOf('win over the rules above'), '시트 지시문 뒤에 붙는다');
assert(sc.sys.includes('- Nurse: "Could you tell me your full name, please?" → You: "Lucas Martin."'));
assert(sc.sys.includes('- I have no allergies.'), '번호 없는 기본 사실');
assert(!sc.sys.includes('Spell your last name quickly'), '대본은 변형 없음');
assert.equal(sc.r.mode, 'script');
console.log('대본 지시:\n' + sc.sys.slice(sc.sys.indexOf('Practice mode')));
// 대본 줄: 켜진 문장 순서대로, 대괄호 뺀 대사, 큐(비면 situation), 짝지은 답
const lines = sc.r.script;
assert(lines.length >= 5 && lines.every((l) => l.n && l.nurse && l.cue && !/[[\]]/.test(l.nurse)));
assert.deepEqual(lines.find((l) => l.n === 'd02'), { n: 'd02', nurse: 'Could you tell me your full name, please?', cue: '수검자의 성함을 물어볼 때', answer: 'Lucas Martin.' });
assert.equal(lines.find((l) => l.n === 'd03').answer, '');
assert(!JSON.stringify(sc.r).includes('hurry') && !JSON.stringify(sc.r).includes('Spell your last name quickly'), '숨은 설정·변형은 앱에 보내지 않음');
assert.equal(sc.r.patient.sex, 'male');
// drills cue 칸이 있으면 그것을 쓴다
const D = now.tabs.drills; D.find((r) => r[0] === 'ch01-d02')[D[0].indexOf('cue')] = '성함 묻기';
assert.equal(talk(now, 'ch01', 'script').r.script.find((l) => l.n === 'd02').cue, '성함 묻기');
console.log('대본 줄', lines.length, '개: 대사 · 큐 · 짝지은 답 (숨은 설정·변형은 보내지 않음)');

// ⑤ 큐카드: twist 빠짐, 기본 답 + 변형 한 번
const cu = talk(now, 'ch01', 'cue');
assert(!cu.sys.includes('You are in a hurry.') && cu.sys.includes('Practice mode: CUE CARD'));
assert(cu.sys.includes('These practice-mode rules come last and win over the rules above.') && !cu.sys.includes('do not ask your own questions'), '큐카드: 우선 규칙, 질문은 막지 않음');
assert(cu.sys.includes('→ You: "Lucas Martin."') && cu.sys.includes('Once during the talk, you may use ONE of these variations'));
assert(cu.sys.includes('- Spell your last name quickly.'));

// ⑥ 자유: twist 그대로 + 변형 가끔 + 기본 답은 참고
const fr = talk(now, 'ch01', 'free');
assert(fr.sys.includes('You are in a hurry.') && !fr.sys.includes('Practice mode'));
assert(!fr.sys.includes('win over the rules above'), '자유는 우선 규칙 없음');
assert(fr.sys.includes('Facts you may use') && fr.sys.includes('Variations: during the talk, naturally use one or two'));
assert(fr.sys.startsWith(base.sys), '자유는 지금 지시문 뒤에 붙이기만');
console.log('큐카드: twist 없음 + 변형 한 번 / 자유: 지금 지시문 + 기본 답 참고 + 변형 가끔');

// ⑦ sessions mode: 모드를 보낸 대화만
const se = now.tabs.sessions; const M = se[0].indexOf('mode'); const SID = se[0].indexOf('session_id');
const modeOf = (id) => se.find((r) => r[SID] === id)[M];
assert.equal(modeOf(sc.r.session_id), 'script'); assert.equal(modeOf(cu.r.session_id), 'cue'); assert.equal(modeOf(fr.r.session_id), 'free');
assert.equal(modeOf(talk(now, 'ch01', undefined).r.session_id), '');
console.log('sessions mode: script / cue / free, 모드 없음은 빈칸');

// ⑧ 일본어 챕터에도 모드 지시가 붙는다
const JH = now.tabs.scenarios[0]; const j = now.tabs.scenarios.find((r) => r[0] === 'ja01-s01');
j[JH.indexOf('answers')] = 'd01: 田中由美です。';
const ja = talk(now, 'ja01', 'script');
assert(ja.sys.includes('Japanese patient') && ja.sys.includes('→ You: "田中由美です。"') && !ja.sys.includes('a little nervous'));
assert.deepEqual(ja.r.script, [{ n: 'd01', nurse: 'お名前をお願いします。', cue: '성함을 물어볼 때', answer: '田中由美です。' }]);
console.log('일본어 ja01 대본: ja-partner 지시문 + 대본 지시, 대본 줄 1개');

// ⑨ showModePrompt: AI를 부르지 않고 세 모드 지시문을 실행 기록에
let called = false; now.fetchHook = () => { called = true; return null; };
const before = now.stats.logs.length;
now.run('showModePrompt');
const logs = now.stats.logs.slice(before);
assert(!called, 'AI를 부르지 않음');
assert(logs.length === 3 && logs[0].includes('대본 (script)') && logs[1].includes('큐카드 (cue)') && logs[2].includes('자유 (free)'));
console.log('showModePrompt: 세 모드 지시문을 실행 기록에 (AI 부르지 않음)');

console.log('\n모든 확인 통과');
