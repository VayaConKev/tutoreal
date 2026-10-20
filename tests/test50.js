// 47단계: 너그러운 피드백 (chapters 탭 feedback_style = gentle). 63단계(v0.68)부터 총평은 고정 문장 대신 구체적으로, 모든 피드백 끝에 글 규칙
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('654c57f')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));        // 지금 쓰는 시트
w.run('setup');
const ch = w.tabs.chapters, H = ch[0];
console.log('setup 뒤 chapters 칸:', H.slice(-3).join(', '));
assert.equal(H[H.length - 1], 'feedback_style');
const col = H.indexOf('feedback_style');
// 비교가 흔들리지 않게 2장 시나리오는 하나만 켜고, 체크리스트를 넣는다
w.tabs.scenarios.forEach((r) => { if (r[1] === 'ch02' && r[0] !== 'ch02-s01') r[w.tabs.scenarios[0].indexOf('active')] = false; });
ch.find((r) => r[0] === 'ch02')[H.indexOf('checklist')] = '왼쪽으로 눕기 | Please lie on your left side.\n녹내장 묻기 | Have you ever been diagnosed with glaucoma?';
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const lines = [{ who: 'me', text: 'This is gastritis. It mean stomach is a little red.' }, { who: 'ai', text: 'I see.' }];
// 피드백을 받고, AI에 보낸 지시문을 같이 돌려준다
const feedbackFor = (chapterId) => {
  let sys = ''; w.fetchHook = (url, p) => { if (url.includes('generateContent')) sys = p.systemInstruction.parts[0].text; return null; };
  const talk = post({ action: 'talk', code: 'stu', chapter_id: chapterId }); assert(talk.ok, JSON.stringify(talk));
  const r = post({ action: 'feedback', code: 'stu', session_id: talk.session_id, lines }); assert(r.ok, JSON.stringify(r));
  return { sys, fb: r.feedback };
};
// ① 칸이 빈 챕터 = 지금과 같은 피드백 (예전 서버가 보내던 지시문과 한 글자도 다르지 않은지)
const oldW = makeWorld(baseline('654c57f')); Object.assign(oldW.tabs, JSON.parse(JSON.stringify(w.tabs)));
let oldSys = ''; oldW.fetchHook = (url, p) => { if (url.includes('generateContent')) oldSys = p.systemInstruction.parts[0].text; return null; };
const opost = (b) => oldW.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const ot = opost({ action: 'talk', code: 'stu', chapter_id: 'ch02' }); assert(opost({ action: 'feedback', code: 'stu', session_id: ot.session_id, lines }).ok);
const normal = feedbackFor('ch02');
const cut = (x) => x.split('\nWriting rules')[0];   // v0.68부터 모든 피드백 끝에 글 규칙(해요체 등)이 붙는다
assert.equal(cut(normal.sys), oldSys, '빈 칸이면 글 규칙 앞까지는 지시문이 v0.43과 같음');
assert(normal.sys.includes('Writing rules') && normal.sys.includes('해요체'));
assert.equal(normal.fb.gentle, false);
assert(normal.sys.includes('it is false.') && !normal.sys.includes('GENTLE'));
console.log('빈 칸(2장): 지시문이 예전과 똑같음, gentle=false');
// ② gentle
ch.find((r) => r[0] === 'ch02')[col] = ' Gentle ';                // 대소문자·띄어쓰기는 상관없음
const g = feedbackFor('ch02');
assert.equal(g.fb.gentle, true);
assert(g.sys.includes('GENTLE') && !g.sys.includes('그렇게 설명해도') && g.sys.includes('의미가 충분히 통해요!') && g.sys.includes('수검자가 알아듣기') && g.sys.includes('아래 추천 표현도 참고해 보세요.'));
assert(g.sys.includes('Be generous') && !g.sys.includes('it is false.'), '체크리스트도 너그럽게');
assert(g.sys.startsWith(oldSys.split('\nGuidance checklist')[0]), '기본 지시문은 그대로, 뒤에만 붙음');
assert(g.fb.checklist.length > 0);
console.log('gentle(2장): 총평 세 가지·고칠 점 대신 다른 표현·너그러운 체크리스트가 지시문에 붙음, gentle=true, 체크리스트', g.fb.checklist.length, '항목');
// ③ 다른 챕터는 그대로
assert.equal(feedbackFor('ch01').fb.gentle, false);
console.log('1장: 그대로');
console.log('\n--- gentle일 때 붙는 부분 ---\n' + g.sys.slice(g.sys.indexOf('Guidance checklist')));
console.log('\n모든 확인 통과');
