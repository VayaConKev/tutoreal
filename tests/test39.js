const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
function world() {
  const w = makeWorld(NEW); w.run('setup');
  const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'N1', display_name: 'n', access_code: 'nurse', status: 'active', course: 'en' })[k] ?? ''));
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50);
  w.set = set;
  w.post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
  w.talk = () => w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
  w.fb = (sid) => w.post({ action: 'feedback', code: 'nurse', session_id: sid, lines: [{ who: 'me', text: 'Please lie on your left side.' }, { who: 'ai', text: 'OK.' }] });
  w.q = (sid) => w.tabs.quality.slice(1).filter((r) => r[1] === sid).map((r) => r[2] + ' | ' + r[3]);
  return w;
}
const okBody = (finish, text) => ({ candidates: [{ finishReason: finish, content: { parts: [{ text }] } }], usageMetadata: { promptTokenCount: 2100, candidatesTokenCount: 1350, thoughtsTokenCount: 900 } });
const FB = JSON.stringify({ summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [] });
const realNow = Date.now; let fake = 0; Date.now = () => realNow() + fake;

// 1) 정상
let w = world(); let sid = w.talk();
w.fetchHook = (url) => url.includes(':generateContent') ? [200, okBody('STOP', FB)] : null;
let r = w.fb(sid);
const req = w.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
console.log('1) 정상:', r.ok, '/ 최대 길이', req.p.generationConfig.maxOutputTokens); w.q(sid).forEach((l) => console.log('   ' + l));
assert(r.ok && req.p.generationConfig.maxOutputTokens === 8192 && w.q(sid).length === 2 && /완료 · .*STOP · 토큰 입력 2100 \/ 출력 1350 \/ 생각 900/.test(w.q(sid)[1]));
assert(!w.cache['fbr_' + sid], '만드는 중 표시가 지워져야 함');
// 같은 대화 다시 요청 → 저장된 결과 (AI 다시 안 부름, 기록 추가 없음)
const n = w.stats.fetches.length; assert(w.fb(sid).ok && w.stats.fetches.length === n && w.q(sid).length === 2);

// 2) 길이 초과로 잘림
w = world(); sid = w.talk();
w.fetchHook = (url) => url.includes(':generateContent') ? [200, okBody('MAX_TOKENS', FB.slice(0, 20))] : null;
r = w.fb(sid); console.log('2) 길이 초과:', r.ok, r.error); w.q(sid).forEach((l) => console.log('   ' + l));
assert(!r.ok && r.error === 'FEEDBACK_FAILED' && /MAX_TOKENS \(길이 초과로 잘림\)/.test(w.q(sid)[1]));

// 3) 503 세 번 (빠르게 실패)
w = world(); sid = w.talk();
w.fetchHook = (url) => url.includes(':generateContent') ? [503, { error: 'busy' }] : null;
r = w.fb(sid); console.log('3) 503:', r.error); w.q(sid).forEach((l) => console.log('   ' + l));
assert(r.error === 'AI_BUSY' && /응답 코드 503 · 시도 5번/.test(w.q(sid)[1]));   // v0.43부터 붐빔은 5번, AI_BUSY

// 4) 첫 시도가 50초 걸리고 503 → 45초 마감이 지나 다시 시도하지 않음
w = world(); sid = w.talk(); let calls = 0;
w.fetchHook = (url) => { if (!url.includes(':generateContent')) return null; calls++; fake += 50000; return [503, {}]; };
r = w.fb(sid); console.log('4) 느린 실패:', r.error, '/ AI 요청', calls, '번'); w.q(sid).forEach((l) => console.log('   ' + l));
assert(calls === 1);

// 5) 다른 요청이 만드는 중 → 기다렸다가 그 결과를 받음
w = world(); sid = w.talk(); w.fetchHook = null;
w.cache['fbr_' + sid] = String(Date.now()); let sleeps = 0;
w.onSleep = () => { sleeps++; fake += 2000; if (sleeps === 4) w.cache['fb_' + sid] = FB; };
const before = w.stats.fetches.length; r = w.fb(sid);
console.log('5) 기다림:', r.ok, '/ AI 새로 부름', w.stats.fetches.length - before, '번'); w.q(sid).forEach((l) => console.log('   ' + l));
assert(r.ok && w.stats.fetches.length === before && /다른 요청이 만든 결과를 받음 · 8초 기다림/.test(w.q(sid)[0]));
// 5-2) 만들던 요청이 실패로 끝남 → 바로 실패 알림
w = world(); sid = w.talk(); w.cache['fbr_' + sid] = '1'; sleeps = 0;
w.onSleep = () => { sleeps++; fake += 2000; if (sleeps === 2) delete w.cache['fbr_' + sid]; };
r = w.fb(sid); console.log('5-2) 만들던 요청 실패:', r.error, '/', sleeps, '번 확인'); assert(r.error === 'FEEDBACK_FAILED' && sleeps === 2);
// 5-3) 100초가 지나도 계속 만드는 중 → BUSY
w = world(); sid = w.talk(); w.cache['fbr_' + sid] = '1'; sleeps = 0;
w.onSleep = () => { sleeps++; fake += 2000; };
r = w.fb(sid); console.log('5-3) 계속 만드는 중:', r.error, '/', sleeps, '번 확인'); assert(r.error === 'FEEDBACK_BUSY' && sleeps === 50);
w.onSleep = null;

// 6) diag_log FALSE → 기록 없음, 피드백은 정상
w = world(); w.set('diag_log', false); sid = w.talk();
w.fetchHook = (url) => url.includes(':generateContent') ? [200, okBody('STOP', FB)] : null;
r = w.fb(sid); console.log('6) 기록 끔:', r.ok, '/ 기록', w.q(sid).length, '줄'); assert(r.ok && w.q(sid).length === 0);
// 7) setup이 diag_log 줄 추가
assert(world().tabs.settings.some((x) => x[0] === 'diag_log'));
// 8) 발음 코칭 등 다른 AI 요청은 그대로 4096
w = world(); w.fetchHook = null;
w.post({ action: 'pronounce', code: 'nurse', drill_id: 'ch02-d01', level: 'blank', audio: Buffer.alloc(32000).toString('base64') });
const preq = w.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
console.log('8) 발음 코칭 최대 길이:', preq.p.generationConfig.maxOutputTokens); assert(preq.p.generationConfig.maxOutputTokens === 4096);
Date.now = realNow;
console.log('모든 확인 통과');
