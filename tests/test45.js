const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW); w.run('setup');
const st = w.tabs.students; const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'T1', display_name: 't', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
add({ student_id: 'N1', display_name: 'n', access_code: 'nurse', status: 'active', course: 'en' });
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const FB = { summary: '나중에 받은 피드백', strengths: [], fixes: [], keywords: [{ keyword: 'left side', used: true }], next_practice: [] };
let busy = true;
w.fetchHook = (url) => url.includes(':generateContent') ? (busy ? [400, {}] : [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(FB) }] } }], usageMetadata: {} }]) : null;
const lines = [{ who: 'me', text: 'Please lie on your left side.' }];
const se = w.tabs.sessions, H = se[0];
const cell = (sid, k) => se.find((r) => r[0] === sid)[H.indexOf(k)];
const kwRows = (sid) => w.tabs.keyword_checks.slice(1).filter((r) => r[0] === sid).length;

// 1) 피드백 실패한 채로 공유 → 시트 feedback 빈칸
const a = post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
assert(!post({ action: 'feedback', code: 'nurse', session_id: a, lines }).ok);
post({ action: 'share', code: 'nurse', session_id: a, confidence: 2, difficulty: '', lines });
console.log('공유 직후 feedback 칸:', JSON.stringify(cell(a, 'feedback')), '/ keyword_checks', kwRows(a));
assert(!cell(a, 'feedback') && kwRows(a) === 0);
// 나중에 '내 기록'에서 피드백 받기 → 시트에 채워짐 + 핵심 단어 체크
busy = false;
const r = post({ action: 'feedback', code: 'nurse', session_id: a, lines });
console.log('나중에 받기:', r.ok, '/ feedback 칸:', JSON.parse(cell(a, 'feedback')).summary, '/ keyword_checks', kwRows(a));
assert(r.ok && JSON.parse(cell(a, 'feedback')).summary === '나중에 받은 피드백' && kwRows(a) === 9);   // 챕터의 핵심 단어 9개마다 한 줄 (공유할 때와 같음)
// 선생님 공유된 대화에도 보임
const t = post({ action: 'student_talks', code: 'teach', student_id: 'N1' }).talks.find((x) => x.session_id === a);
assert(t.feedback && t.feedback.summary === '나중에 받은 피드백');
// 한 번 더 요청 → 저장된 결과, 시트·체크 중복 없음
post({ action: 'feedback', code: 'nurse', session_id: a, lines });
assert(kwRows(a) === 9);

// 2) 공유하지 않은 대화 → 시트에 쓰지 않음
const b = post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
assert(post({ action: 'feedback', code: 'nurse', session_id: b, lines }).ok);
console.log('공유 안 한 대화: feedback 칸', JSON.stringify(cell(b, 'feedback')), '/ keyword_checks', kwRows(b));
assert(!cell(b, 'feedback') && kwRows(b) === 0);

// 3) 다른 학생의 대화로는 못 받음
add({ student_id: 'N2', display_name: 'm', access_code: 'other', status: 'active', course: 'en' });
assert.equal(post({ action: 'feedback', code: 'other', session_id: a, lines }).error, 'NOT_YOURS');
console.log('모든 확인 통과');
