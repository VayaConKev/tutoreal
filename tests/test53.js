// 60단계: 발음 코칭 실패 — 붐빔은 PRON_BUSY, 그 밖은 PRON_FAILED, 실패마다 quality 탭에 진단 한 줄
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('cd9b396')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('monthly_budget_usd', 50);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const audio = Buffer.alloc(32000).toString('base64');
const q = () => w.tabs.quality.slice(1).filter((r) => r[w.tabs.quality[0].indexOf('kind')] === 'pron');
const noteOf = (r) => r[w.tabs.quality[0].indexOf('note')];
let calls = 0;
// 1) 계속 붐빔(503)
w.fetchHook = (url) => { if (url.includes('generateContent')) { calls++; return [503, { error: { code: 503, message: 'overloaded' } }]; } return null; };
let r = post({ action: 'pronounce', code: 'stu', drill_id: 'ch02-d01', level: 'blank', audio });
console.log('503 계속:', r.error, '/ AI 호출', calls, '번 / quality:', noteOf(q().at(-1)));
assert.equal(r.error, 'PRON_BUSY'); assert.equal(q().length, 1); assert(/PRON|AI_BUSY/.test(noteOf(q().at(-1))) && /503/.test(noteOf(q().at(-1))) && /ch02-d01/.test(noteOf(q().at(-1))));
// 2) 다른 오류(400)
calls = 0; w.fetchHook = (url) => { if (url.includes('generateContent')) { calls++; return [400, { error: { code: 400, message: 'bad request' } }]; } return null; };
r = post({ action: 'pronounce', code: 'stu', drill_id: 'ch02-d01', level: 'blank', audio });
console.log('400:', r.error, '/ AI 호출', calls, '번 / quality:', noteOf(q().at(-1)));
assert.equal(r.error, 'PRON_FAILED'); assert.equal(q().length, 2); assert(/AI_FAILED/.test(noteOf(q().at(-1))) && /400/.test(noteOf(q().at(-1))));
// 3) 한 번 붐빈 뒤 성공 → 성공, 진단 줄 없음
calls = 0; w.fetchHook = (url) => { if (url.includes('generateContent') && ++calls === 1) return [503, {}]; return null; };
r = post({ action: 'pronounce', code: 'stu', drill_id: 'ch02-d01', level: 'blank', audio });
console.log('503 한 번 뒤 성공:', r.ok, '/ quality pron 줄', q().length);
assert(r.ok); assert.equal(q().length, 2);
// 4) diag_log FALSE면 남기지 않음
set('diag_log', false); w.fetchHook = (url) => (url.includes('generateContent') ? [503, {}] : null);
r = post({ action: 'pronounce', code: 'stu', drill_id: 'ch02-d01', level: 'blank', audio });
console.log('diag_log FALSE:', r.error, '/ quality pron 줄', q().length); assert.equal(r.error, 'PRON_BUSY'); assert.equal(q().length, 2);
// pron_checks에는 전처럼 failed로 남음
const pc = w.tabs.pron_checks; console.log('pron_checks failed 줄:', pc.slice(1).filter((x) => x[pc[0].indexOf('overall')] === 'failed').length);
console.log('모든 확인 통과');
