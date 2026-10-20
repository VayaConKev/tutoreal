const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW); w.run('setup'); w.run('addChineseSample');
const st = w.tabs.students; const row = (o) => st[0].map((k) => o[k] ?? '');
st.push(row({ student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' }));
st.push(row({ student_id: 'S1', display_name: '학생1', access_code: 'stu1', status: 'active', course: 'en' }));
st.push(row({ student_id: 'S2', display_name: '학생2', access_code: 'stu2', status: 'active', course: 'zh' }));
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100); set('default_daily_limit_min', 600);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const FB = { summary: '좋아요', strengths: [], fixes: [], keywords: [], next_practice: [], checklist: [{ item: 'a', en: 'A', optional: false, sex: '', done: true }] };
w.fetchHook = (url) => url.includes(':generateContent') ? [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(FB) }] } }], usageMetadata: {} }] : null;
function talk(code, chapter, lines, share) {
  const sid = post({ action: 'talk', code, chapter_id: chapter }).session_id;
  post({ action: 'feedback', code, session_id: sid, lines });
  if (share) post({ action: 'share', code, session_id: sid, confidence: 2, difficulty: '왼쪽이 헷갈림', lines });
  return sid;
}
// 학생1: 공유 2개 + 공유 안 함 1개, 학생2: 중국어 공유 1개
const a = talk('stu1', 'ch02', [{ who: 'me', text: 'Hello' }, { who: 'ai', text: 'OK.' }, { who: 'me', text: 'Lie on your left.', hard: true }], true);
const b = talk('stu1', 'ch01', [{ who: 'me', text: 'Mr. Martin?' }], false);
const se = w.tabs.sessions; const H = se[0];
se.find((r) => r[0] === a)[H.indexOf('started_at')] = new Date(Date.now() - 3600e3);   // a를 1시간 전으로
const c = talk('stu1', 'ch01', [{ who: 'me', text: 'Please come to counter three.' }, { who: 'ai', text: 'Sure.' }], true);
const z = talk('stu2', 'zh01', [{ who: 'me', text: '您好！' }, { who: 'ai', text: '您好，请坐。', hard: true }], true);

// 학생 코드로는 못 봄
assert.equal(post({ action: 'student_talks', code: 'stu1', student_id: 'S1' }).error, 'NOT_TEACHER');
// 선생님: 학생1 → 공유한 2개만, 최근 것부터
const r = post({ action: 'student_talks', code: 'teach', student_id: 'S1' });
console.log('학생1 공유 대화', r.talks.length, '개:', r.talks.map((t) => `${t.chapter_order}장 ${t.partner} (${t.at})`).join(' / '));
assert(r.ok && r.talks.length === 2 && r.talks[0].session_id === c && r.talks[1].session_id === a);
assert(!r.talks.some((t) => t.session_id === b), '공유 안 한 대화는 없어야 함');
const ta = r.talks[1];
console.log('  대화 줄:', ta.lines.map((l) => `${l.who}:${l.text}${l.hard ? '(어려움)' : ''}`).join(' | '));
console.log('  자기 평가', ta.confidence, '/ 어려웠던 점', ta.difficulty, '/ 피드백 총평', ta.feedback && ta.feedback.summary, '/ 체크리스트', ta.feedback.checklist.length);
assert.deepEqual(ta.lines.map((l) => l.hard), [false, false, true]);
assert(ta.lines[0].who === 'me' && ta.lines[1].who === 'ai' && ta.confidence === 2 && ta.feedback.summary === '좋아요' && ta.course === 'en');
// 학생2 (중국어)
const r2 = post({ action: 'student_talks', code: 'teach', student_id: 'S2' });
console.log('학생2:', r2.talks.map((t) => `${t.course} ${t.chapter_title} ${t.partner}`).join(), '/ 어려운 줄', r2.talks[0].lines.filter((l) => l.hard).map((l) => l.text));
assert(r2.talks.length === 1 && r2.talks[0].course === 'zh' && r2.talks[0].lines[1].hard);
// 없는 학생 → 빈 목록
assert.equal(post({ action: 'student_talks', code: 'teach', student_id: 'NOPE' }).talks.length, 0);
// 최대 20개
for (let i = 0; i < 22; i++) talk('stu1', 'ch01', [{ who: 'me', text: 'hi ' + i }], true);
assert.equal(post({ action: 'student_talks', code: 'teach', student_id: 'S1' }).talks.length, 20);
// hard_lines 칸이 없던 예전 공유 기록도 그대로 보임
const old = talk('stu2', 'zh01', [{ who: 'me', text: '谢谢' }], true);
se.find((r) => r[0] === old)[H.indexOf('hard_lines')] = '';
assert(post({ action: 'student_talks', code: 'teach', student_id: 'S2' }).talks.some((t) => t.session_id === old));
console.log('모든 확인 통과');
