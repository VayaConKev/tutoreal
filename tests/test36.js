const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
function seed(w) {
  w.run('setup'); w.run('addChineseSample');
  const st = w.tabs.students; const h = st[0];
  st.push(h.map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'abc', status: 'active', course: 'zh' })[k] ?? ''));
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('text_model', 'gemini-3.8-flash'); set('live_model', 'gemini-live-fake'); set('monthly_budget_usd', 50);
}
const post = (w, body) => w.run('doPost', { postData: { contents: JSON.stringify(body) } }).body;
const col = (tab, row, name) => row[tab[0].indexOf(name)];

// 1) setup이 hard_lines 칸을 추가
const w = makeWorld(NEW); seed(w);
assert(w.tabs.sessions[0].includes('hard_lines'), 'hard_lines 칸 없음');
console.log('setup: sessions 칸', w.tabs.sessions[0].slice(-3).join(', '));

// 2) 대화 → 피드백 → 공유 (빈 줄 포함, 2·4번째 보낸 줄을 고름)
const sid = post(w, { action: 'talk', code: 'abc', chapter_id: 'zh01' }).session_id;
const lines = [
  { who: 'me', text: '您好！' },
  { who: 'ai', text: '您好，老板！欢迎来我们工厂。', hard: true },
  { who: 'me', text: '   ' },                       // 빈 줄은 서버가 버린다 → 번호에서 빠짐
  { who: 'me', text: '我们今天来看面料。' },
  { who: 'ai', text: '您想看什么面料？', hard: true },
];
assert(post(w, { action: 'feedback', code: 'abc', session_id: sid, lines }).ok);
assert(post(w, { action: 'share', code: 'abc', session_id: sid, confidence: 2, difficulty: '', lines }).ok);
const se = w.tabs.sessions; const row = se.find((r) => r[0] === sid);
console.log('공유: shared', col(se, row, 'shared'), '/ hard_lines', JSON.stringify(col(se, row, 'hard_lines')), '/ 피드백 저장', !!col(se, row, 'feedback'));
const tr = w.tabs.transcripts.filter((r) => r[0] === sid);
console.log('transcripts:', tr.map((r) => r[1] + ':' + r[3]).join(' | '));
assert.equal(col(se, row, 'hard_lines'), '2,4');       // seq 2 = 您好，老板… , seq 4 = 您想看什么面料？
assert.equal(tr.find((r) => r[1] === 4)[3], '您想看什么面料？');

// 3) 고르지 않으면 빈칸
const sid2 = post(w, { action: 'talk', code: 'abc', chapter_id: 'zh01' }).session_id;
post(w, { action: 'feedback', code: 'abc', session_id: sid2, lines: [{ who: 'me', text: '你好' }] });
post(w, { action: 'share', code: 'abc', session_id: sid2, confidence: 3, difficulty: '', lines: [{ who: 'me', text: '你好' }] });
const row2 = se.find((r) => r[0] === sid2);
console.log('고르지 않음: hard_lines', JSON.stringify(col(se, row2, 'hard_lines')));
assert.equal(col(se, row2, 'hard_lines'), '');

// 4) 예전 앱(hard 없이 보냄)도 그대로 동작
const sid3 = post(w, { action: 'talk', code: 'abc', chapter_id: 'zh01' }).session_id;
assert(post(w, { action: 'share', code: 'abc', session_id: sid3, confidence: 1, difficulty: 'x', lines: [{ who: 'me', text: 'hi' }] }).ok);

// 5) setup을 아직 안 돌린 시트(hard_lines 칸 없음): 공유는 되고 칸만 건너뜀
const w5 = makeWorld(NEW); seed(w5);
const hi = w5.tabs.sessions[0].indexOf('hard_lines'); w5.tabs.sessions[0].splice(hi, 1);
const sid5 = post(w5, { action: 'talk', code: 'abc', chapter_id: 'zh01' }).session_id;
const r5 = post(w5, { action: 'share', code: 'abc', session_id: sid5, confidence: 2, difficulty: '', lines });
console.log('칸 없는 시트에서 공유:', r5.ok, '/ 칸 수 그대로', w5.tabs.sessions[0].length === w5.tabs.sessions.find((r) => r[0] === sid5).length || 'ok');
assert(r5.ok);

// 6) 피드백 요청은 hard 표시와 관계없이 그대로 (지시문에 들어가는 대화 글자에 표시가 섞이지 않음)
const w6 = makeWorld(NEW); seed(w6);
const sid6 = post(w6, { action: 'talk', code: 'abc', chapter_id: 'zh01' }).session_id;
post(w6, { action: 'feedback', code: 'abc', session_id: sid6, lines });
const fbReq = w6.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
const sent = fbReq.p.contents[0].parts[0].text;
console.log('피드백에 보낸 글자:\n' + sent);
assert(!/hard|true/.test(sent));
console.log('모든 확인 통과');
