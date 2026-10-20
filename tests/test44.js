const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const realNow = Date.now; let fake = 0; Date.now = () => realNow() + fake;
const FB = JSON.stringify({ summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [] });
const OK = [200, { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: FB }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 } }];
function world(fallback) {
  const w = makeWorld(NEW); w.run('setup');
  const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'N1', display_name: 'n', access_code: 'nurse', status: 'active', course: 'en' })[k] ?? ''));
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
  if (fallback) set('fallback_text_model', fallback);
  w.onSleep = (ms) => { fake += ms; w.waits.push(ms); }; w.waits = [];
  w.post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
  w.fb = (sid) => w.post({ action: 'feedback', code: 'nurse', session_id: sid, lines: [{ who: 'me', text: 'Hello' }] });
  w.q = (sid) => w.tabs.quality.slice(1).filter((r) => r[1] === sid).map((r) => r[3]);
  w.ai = () => w.stats.fetches.filter((f) => f.url.includes(':generateContent'));
  return w;
}
// setup이 fallback_text_model 줄을 비워서 추가
assert(world().tabs.settings.some((x) => x[0] === 'fallback_text_model' && x[1] === ''));

// 1) 계속 503, 대체 모델 없음 → 5번 시도 (간격이 늘어남), AI_BUSY, 한도에 안 셈
let w = world(); let sid = w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
w.fetchHook = (url) => url.includes(':generateContent') ? [503, { error: { status: 'UNAVAILABLE' } }] : null;
let r = w.fb(sid);
console.log('1) 계속 503:', r.error, '/ 기다린 간격(초):', w.waits.map((x) => (x / 1000).toFixed(1)).join(', '), '/', w.q(sid)[1]);
assert(r.error === 'AI_BUSY' && w.ai().length === 5 && w.waits.length === 4 && w.waits[3] > w.waits[0] * 4);
// 한도에 안 세므로 4번째, 5번째 요청도 계속 시도 가능 (전에는 3번째 뒤 FEEDBACK_LIMIT)
for (let i = 0; i < 3; i++) w.fb(sid);
r = w.fb(sid); console.log('   5번째 요청:', r.error); assert.equal(r.error, 'AI_BUSY');

// 2) 503 두 번 뒤 성공
w = world(); sid = w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id; let n = 0;
w.fetchHook = (url) => url.includes(':generateContent') ? (++n <= 2 ? [503, {}] : OK) : null;
r = w.fb(sid); console.log('2) 503 두 번 뒤 성공:', r.ok, '/', w.q(sid)[1]); assert(r.ok && /시도 3번/.test(w.q(sid)[1]));

// 3) 계속 503 + 대체 모델 gemini-3.6-flash → 대체 모델로 성공
w = world('gemini-3.6-flash'); sid = w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
w.fetchHook = (url) => url.includes(':generateContent') ? (url.includes('gemini-3.6-flash') ? OK : [503, {}]) : null;
r = w.fb(sid); const urls = w.ai().map((f) => f.url.split('/models/')[1].split(':')[0]);
console.log('3) 대체 모델:', r.ok, '/ 요청 모델:', urls.join(' → '), '/', w.q(sid)[1]);
assert(r.ok && urls.length === 6 && urls[5] === 'gemini-3.6-flash' && /대체 모델 gemini-3.6-flash/.test(w.q(sid)[1]));
assert.equal(w.ai()[5].p.generationConfig.thinkingConfig.thinkingLevel, 'low');

// 4) 400 같은 다른 오류 → 다시 시도 안 함, FEEDBACK_FAILED, 한도에 셈
w = world(); sid = w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
w.fetchHook = (url) => url.includes(':generateContent') ? [400, { error: 'bad' }] : null;
r = w.fb(sid); console.log('4) 400:', r.error, '/ AI 요청', w.ai().length, '번 /', w.q(sid)[1]); assert(r.error === 'FEEDBACK_FAILED' && w.ai().length === 1);
w.fb(sid); w.fb(sid); r = w.fb(sid); console.log('   4번째 요청:', r.error); assert.equal(r.error, 'FEEDBACK_LIMIT');

// 5) 발음 코칭: 503이면 PRON_FAILED (시도 3번 그대로)
w = world(); w.fetchHook = (url) => url.includes(':generateContent') ? [503, {}] : null;
r = w.post({ action: 'pronounce', code: 'nurse', drill_id: 'ch02-d01', level: 'blank', audio: Buffer.alloc(32000).toString('base64') });
console.log('5) 발음 코칭 503:', r.error, '/ AI 요청', w.ai().length, '번'); assert(r.error === 'PRON_BUSY' && w.ai().length === 3);   // v0.65부터 붐빔은 PRON_BUSY
Date.now = realNow;
console.log('모든 확인 통과');
