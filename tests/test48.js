const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW); w.run('setup');
const st = w.tabs.students; const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
add({ student_id: 'G1', display_name: '게스트', access_code: 'guest', status: 'active', role: 'tester', course: 'en' });
add({ student_id: 'S1', display_name: '학생1', access_code: 'stu1', status: 'active', course: 'en' });
add({ student_id: 'S2', display_name: '학생2', access_code: 'stu2', status: 'active', course: 'en' });
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
let insightInputs = [];
w.fetchHook = (url, p) => {
  if (!url.includes(':generateContent')) return null;
  const keys = Object.keys(p.generationConfig.responseSchema.properties);
  if (keys.includes('common_mistakes')) { insightInputs.push(p.contents[0].parts[0].text); return [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ common_mistakes: [], teaching_points: ['x'] }) }] } }], usageMetadata: {} }]; }
  return [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ summary: 's', strengths: [], fixes: [{ said: 'from ' + p.contents[0].parts[0].text.split('\n')[1], better: 'b', why: 'w' }], keywords: [{ keyword: 'left side', used: true }], next_practice: [] }) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 100 } }];
};
function talk(code, ch, text, note) {
  const sid = post({ action: 'talk', code, chapter_id: ch }).session_id;
  const lines = [{ who: 'me', text }];
  post({ action: 'feedback', code, session_id: sid, lines });
  post({ action: 'end', code, session_id: sid, duration_sec: 60, end_reason: 'user', ai_audio_sec: 10 });
  post({ action: 'share', code, session_id: sid, confidence: 2, difficulty: note, lines });
}
talk('teach', 'ch02', 'TEACHER line', '선생님 테스트');
talk('guest', 'ch02', 'GUEST line', '게스트 테스트');
talk('stu1', 'ch02', 'STUDENT1 line', '학생1 어려움');
talk('stu2', 'ch01', 'STUDENT2 line', '');
const sm = post({ action: 'summary', code: 'teach', course: 'en' }).summary;
const c2 = sm.chapterStats.find((c) => c.chapter_id === 'ch02');
console.log('학생 목록:', sm.studentStats.map((x) => x.name).join(', '));
console.log('합계: 학생', sm.totals.students, '/ 연습', sm.totals.count, '회 / 비용 $', sm.totals.cost_usd);
console.log('2장: 연습', c2.count, '회, 학생', c2.students, '명, 공유', c2.shared, ' / 어려웠던 점:', c2.difficulties.map((d) => d.text).join(', '), ' / 핵심 단어 체크', c2.keywords.find((k) => k.keyword === 'left side').total, '개');
assert.deepEqual(sm.studentStats.map((x) => x.student_id).sort(), ['S1', 'S2']);
assert(sm.totals.students === 2 && sm.totals.count === 2);
assert(c2.count === 1 && c2.students === 1 && c2.shared === 1 && c2.difficulties.length === 1 && c2.difficulties[0].text === '학생1 어려움');
assert.equal(c2.keywords.find((k) => k.keyword === 'left side').total, 1);
// 비용은 네 대화 모두
const allCost = w.tabs.sessions.slice(1).reduce((a, r) => a + (Number(r[w.tabs.sessions[0].indexOf('est_cost_usd')]) || 0), 0);
console.log('시트 비용 합계 $', Math.round(allCost * 100) / 100); assert.equal(sm.totals.cost_usd, Math.round(allCost * 100) / 100);
// 새로 정리하기 → AI 정리에 학생 대화만, 시트 summary 탭에도 선생님·게스트 없음
insightInputs = [];
post({ action: 'summary', code: 'teach', refresh: true, course: 'en' });
const allIn = insightInputs.join('\n');
console.log('AI 정리에 들어간 것:', /STUDENT1/.test(allIn) ? '학생1 있음' : '', /TEACHER|GUEST/.test(allIn) ? '선생님/게스트 있음(오류)' : '선생님·게스트 없음');
assert(/STUDENT1/.test(allIn) && !/TEACHER|GUEST/.test(allIn));
const sheet = w.tabs.summary.map((r) => r.join(' ')).join('\n');
assert(!sheet.includes('게스트') && !/선생님 테스트/.test(sheet) && sheet.includes('학생1'));
console.log('시트 summary 탭: 학생1만, 비용 줄:', w.tabs.summary.find((r) => String(r[0]).startsWith('예상 비용'))[0]);
console.log('모든 확인 통과');
