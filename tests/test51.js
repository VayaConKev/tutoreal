// 48단계: 검사 결과 슬립 — scenarios 탭 slip 칸, 토큰 연결 대기 시간 10분, settings slip_legend
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = baseline('199bdc3');   // 서버 v0.44로 만든 시트
const old = makeWorld(BASE); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');
const SH = w.tabs.scenarios[0];
console.log('scenarios 마지막 칸:', SH[SH.length - 1], '/ slip_legend:', (w.tabs.settings.find((r) => r[0] === 'slip_legend') || [])[1]);
assert.equal(SH[SH.length - 1], 'slip'); assert(w.tabs.settings.find((r) => r[0] === 'slip_legend'));
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const col = (n) => SH.indexOf(n);
// 2장: s01만 켜고 슬립을 적는다 / 1장은 슬립 없음
w.tabs.scenarios.forEach((r) => { if (r[1] === 'ch02' && r[0] !== 'ch02-s01') r[col('active')] = false; });
w.tabs.scenarios.find((r) => r[0] === 'ch02-s01')[col('slip')] = 'G + S';
const talk = (ch) => {
  let tok = null; w.fetchHook = (url, p) => { if (url.includes('auth_tokens')) tok = p; return null; };
  const t0 = Date.now(); const r = post({ action: 'talk', code: 'stu', chapter_id: ch }); assert(r.ok, JSON.stringify(r));
  const lim = r.limit_sec;
  return { r, startSec: (Date.parse(tok.newSessionExpireTime) - t0) / 1000, expSec: (Date.parse(tok.expireTime) - t0) / 1000, lim };
};
const a = talk('ch02');
console.log('슬립 있음:', JSON.stringify(a.r.slip), '/ 연결 시작 가능', Math.round(a.startSec), '초 / 토큰 만료', Math.round(a.expSec), '초 (대화 한도', a.lim, '초)');
assert.deepEqual(a.r.slip.exams, ['G']); assert.equal(a.r.slip.sedation, '+'); assert.deepEqual(a.r.slip.results, ['S']);
assert(a.r.slip.locker >= 1 && a.r.slip.locker <= 12 && a.r.slip.legend.includes('표재성') && a.r.slip.start_within_sec === 600);
assert(Math.abs(a.startSec - 600) < 2 && Math.abs(a.expSec - (600 + a.lim + 60)) < 2);
assert.equal(a.r.patient.exam, 'stomach endoscopy with sedation', '차트 정보는 그대로 (앱이 숨김)');
const b = talk('ch01');
console.log('슬립 없음(1장): slip', b.r.slip, '/ 연결 시작 가능', Math.round(b.startSec), '초 / 토큰 만료', Math.round(b.expSec), '초');
assert.equal(b.r.slip, null); assert(Math.abs(b.startSec - 60) < 2 && Math.abs(b.expSec - (b.lim + 60)) < 2);
// 풀이를 비우면 legend 빈칸
set('slip_legend', ''); assert.equal(talk('ch02').r.slip.legend, '');
console.log('slip_legend를 비우면: 풀이 없음');
// 소지품 번호는 대화마다 바뀜
const lockers = new Set(Array.from({ length: 12 }, () => talk('ch02').r.slip.locker));
console.log('소지품 번호 12번 뽑기:', [...lockers].join(', ')); assert(lockers.size > 1);
console.log('모든 확인 통과');
