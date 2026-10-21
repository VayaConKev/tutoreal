// 66단계: 검사 결과 슬립의 소지품 번호는 1~12 (병원 수납함이 12칸), 서버 v0.49에서 바뀜
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const w = makeWorld(CODE);
w.run('setup');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const SH = w.tabs.scenarios[0]; const col = (n) => SH.indexOf(n);
w.tabs.scenarios.forEach((r) => { if (r[1] === 'ch02') r[col('slip')] = 'G + S'; });
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const lockers = Array.from({ length: 200 }, () => {
  const r = post({ action: 'talk', code: 'stu', chapter_id: 'ch02' });
  assert(r.ok, JSON.stringify(r));
  return r.slip.locker;
});
const seen = [...new Set(lockers)].sort((a, b) => a - b);
console.log('소지품 번호 200번 뽑기에서 나온 번호:', seen.join(', '));
assert(lockers.every((n) => Number.isInteger(n) && n >= 1 && n <= 12), '1~12 밖의 번호가 나옴');
assert(seen.length >= 10, '번호가 고르게 섞이지 않음');
console.log('모든 확인 통과');
