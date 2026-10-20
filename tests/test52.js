// 52단계: 슬립 결과를 적은 그대로 + 챕터별 약어 풀이
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('f844b0b')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');
// 1) 해석
const ctx = require('vm').createContext({}); require('vm').runInContext(require('fs').readFileSync(CODE, 'utf8').match(/function parseSlip_[\s\S]*?\n}\n/)[0], ctx);
const cases = { 'G + S': ['G', '+', 'S'], 'G + S P': ['G', '+', 'S P'], 'g − r': ['G', '-', 'r'], 'G + GU Scar': ['G', '+', 'GU Scar'], 'GC + BG / 치질': ['G,C', '+', 'BG / 치질'],
  'C + B1yr': ['C', '+', 'B1yr'], 'G + 음식물 잔류': ['G', '+', '음식물 잔류'], 'GC + A, IM / 특이사항 없음': ['G,C', '+', 'A, IM / 특이사항 없음'], 'IM': ['', '', 'IM'], 'G +': null, '': null };
for (const [v, want] of Object.entries(cases)) {
  const r = ctx.parseSlip_(v); const got = r && [r.exams.join(','), r.sedation, r.results.join('|')];
  console.log(JSON.stringify(v).padEnd(30), '→', JSON.stringify(got)); assert.deepEqual(got, want);
}
// 2) 챕터별 풀이: 시트의 slip_legend가 예전 값(S E A R P)이어도, 기본값으로 바꾸어도
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 1000);
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
const SH = w.tabs.scenarios[0], col = (n) => SH.indexOf(n);
const only = (ch, slip) => { w.tabs.scenarios.forEach((r) => { if (r[1] === ch) r[col('active')] = r[0] === ch + '-s01'; }); w.tabs.scenarios.find((r) => r[0] === ch + '-s01')[col('slip')] = slip; };
const legendOf = (ch) => w.run('doPost', { postData: { contents: JSON.stringify({ action: 'talk', code: 'stu', chapter_id: ch }) } }).body.slip.legend;
console.log('시트의 지금 풀이:', (s.find((r) => r[0] === 'slip_legend') || [])[1]);
only('ch02', 'G + S'); console.log('예전 풀이 + G + S →', legendOf('ch02')); assert.equal(legendOf('ch02'), 'S 표재성 · E 미란성 · A 위축성 · R 역류성 식도염 · P 용종'.split(' · ').filter((x) => x.startsWith('S '))[0]);
const DEF = require('fs').readFileSync(CODE, 'utf8').match(/const SLIP_LEGEND_DEFAULT = ([\s\S]*?);\n/)[1];
set('slip_legend', eval(DEF));
const chk = (slip, want) => { only('ch02', slip); const g = legendOf('ch02'); console.log(('새 풀이 + ' + slip).padEnd(36), '→', g); assert.equal(g, want); };
chk('GC + BG / 특이사항 없음', 'BG 담즙역류성위염');
chk('G + GU Scar', 'GU 위궤양 · GU Scar 위궤양 반흔');
chk('G + DU Scar', 'DU 십이지장궤양 · DU Scar 십이지장궤양 반흔');
chk('G + D', 'D 십이지장염');
chk('G + 음식물 잔류', '');
chk('G + IM, A', 'A 위축성 위염 · IM 장상피화생');
// 한 챕터에 여러 시나리오: 모두 합쳐서
w.tabs.scenarios.forEach((r) => { if (r[1] === 'ch02') r[col('active')] = true; });
w.tabs.scenarios.filter((r) => r[1] === 'ch02').forEach((r, i) => { r[col('slip')] = ['G + BG', 'G + IM', 'G + D'][i]; });
const all = legendOf('ch02'); console.log('시나리오 셋(BG, IM, D) →', all); assert.equal(all, 'IM 장상피화생 · BG 담즙역류성위염 · D 십이지장염');
console.log('모든 확인 통과');
