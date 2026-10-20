const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW); w.run('setup');
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'N1', display_name: 'n', access_code: 'nurse', status: 'active', course: 'en' })[k] ?? ''));
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const FB = JSON.stringify({ summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [] });
let mode = 'ok';
w.fetchHook = (url) => url.includes(':generateContent') ? (mode === 'ok' ? [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: FB }] } }], usageMetadata: {} }] : [400, {}]) : null;
const lines = [{ who: 'me', text: 'Hi' }];
// 1) 예전 서버가 남긴 '3번 실패'(fbn_)가 있어도 바로 받음
const a = post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
w.cache['fbn_' + a] = '3';
const r = post({ action: 'feedback', code: 'nurse', session_id: a, lines });
console.log('예전 횟수 3이 남은 대화:', r.ok); assert(r.ok);
// 2) 진짜 오류 3번 → FEEDBACK_LIMIT, 횟수는 30분(1800초)만 기억
const b = post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
mode = 'bad';
let ttl = null; const put = w.run.bind(w);
for (let i = 0; i < 3; i++) post({ action: 'feedback', code: 'nurse', session_id: b, lines });
const r2 = post({ action: 'feedback', code: 'nurse', session_id: b, lines });
console.log('진짜 오류 3번 뒤:', r2.error, '/ 기억된 횟수', w.cache['fbt_' + b]); assert(r2.error === 'FEEDBACK_LIMIT' && w.cache['fbt_' + b] === '3');
// 30분이 지나 기억이 사라지면 다시 받을 수 있음
delete w.cache['fbt_' + b]; mode = 'ok';
const r3 = post({ action: 'feedback', code: 'nurse', session_id: b, lines });
console.log('30분 뒤 (기억 사라짐):', r3.ok); assert(r3.ok);
console.log('모든 확인 통과');
