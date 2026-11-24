// 117단계 (서버 v0.70): 대본 줄(대본·큐카드 카드와 AI 지시문)에서 단어 문항을 뺀다. 남은 줄의 번호와 기본 답은 그대로
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const w = makeWorld(CODE); w.run('setup');
const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row('chapters', { chapter_id: 'ja01', order: 1, title: '호명', goal: '- 이름 묻기', keywords: 'お名前', scene: 'x', published: true, ai_captions: 'show', course: 'ja' });
row('scenarios', { scenario_id: 'ja01-s01', chapter_id: 'ja01', name: '田中 由美', sex: 'female', dob: '1985-03-02', country: 'Japan', exam: 'stomach endoscopy', level: 1, active: true,
  answers: 'd03: 田中由美です。\nd04: 1985年3月2日です。' });
// 단어 둘 (하나는 kind 칸으로, 하나는 '단어:'로 자동), 문장 둘, kind=sentence로 적은 '단어:' 줄 하나 (칸이 이긴다)
row('drills', { drill_id: 'ja01-d01', chapter_id: 'ja01', order: 1, situation: '성함', sentence: '[お名前]', active: true, kind: 'word' });
row('drills', { drill_id: 'ja01-d02', chapter_id: 'ja01', order: 2, situation: '단어: 생년월일', sentence: '[生年月日]', active: true });
row('drills', { drill_id: 'ja01-d03', chapter_id: 'ja01', order: 3, situation: '성함을 물어볼 때', sentence: '[お名前]をお願いします。', active: true });
row('drills', { drill_id: 'ja01-d04', chapter_id: 'ja01', order: 4, situation: '생년월일을 물어볼 때', sentence: '[生年月日]をお願いします。', active: true });
row('drills', { drill_id: 'ja01-d05', chapter_id: 'ja01', order: 5, situation: '단어: 대기', sentence: 'こちらでお待ちください。', active: true, kind: 'sentence' });
const st = w.tabs.settings; const set = (k, v) => { const r = st.find((x) => x[0] === k); if (r) r[1] = v; else st.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000); set('default_daily_limit_min', 6000);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function talk(mode) {
  let setup = null;
  w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) setup = p.bidiGenerateContentSetup; return null; };
  const r = post({ action: 'talk', code: 'teach', chapter_id: 'ja01', mode });
  assert(r.ok, JSON.stringify(r));
  return { r, sys: setup.systemInstruction.parts[0].text };
}
for (const mode of ['script', 'cue']) {
  const { r, sys } = talk(mode);
  assert.deepEqual(r.script.map((l) => l.n), ['d03', 'd04', 'd05'], mode + ': 단어 줄(d01·d02)은 빠지고 kind=sentence 줄은 남는다');
  assert.equal(r.script[0].answer, '田中由美です。'); assert.equal(r.script[1].answer, '1985年3月2日です。');
  assert.equal(r.script[0].nurse, 'お名前をお願いします。');
  assert(!/^お名前$/m.test(sys) && !sys.includes('生年月日\n'), mode + ': 지시문에 단어 한 줄 대사가 없다');
}
console.log('대본·큐카드: 단어 문항은 대본 줄과 지시문에서 빠지고, 남은 줄의 번호·기본 답은 그대로');
// 챕터 목록(문장 연습)에는 단어 문항이 그대로 (따라 읽기에서 쓴다)
const ch = post({ action: 'chapters', code: 'teach' }).chapters.find((c) => c.chapter_id === 'ja01');
assert.deepEqual(ch.drills.map((d) => d.kind), ['word', 'word', 'sentence', 'sentence', 'sentence']);
console.log('챕터 목록: 단어 문항은 그대로 (kind=word)');
console.log('모든 확인 통과');
