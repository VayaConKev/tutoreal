// 73단계: 오늘의 단어 힌트를 쉬운 영어 설명(words 탭 hint 칸)으로 — 예시 단어마다 설명, 이미 쓰던 시트에는 칸 추가, 서버 v0.54
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const teacher = (w) => { const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'T1', display_name: '선생님', access_code: 'tch', status: 'active', course: '', role: 'teacher' })[k] ?? '')); };
const today = (w) => { const r = w.run('doPost', { postData: { contents: JSON.stringify({ action: 'chapters', code: 'tch' }) } }).body; assert(r.ok, JSON.stringify(r)); return r; };
const set = (w, k, v) => { const r = w.tabs.settings.find((x) => x[0] === k); if (r) r[1] = v; else w.tabs.settings.push([k, v, '']); };

// 새 시트: 예시 단어마다 영어 설명이 있고, 설명에 정답 단어가 들어 있지 않다
const fresh = makeWorld(CODE); fresh.run('setup');
const H = fresh.tabs.words[0]; const col = (n) => H.indexOf(n);
assert.equal(H[H.length - 1], 'hint');
fresh.tabs.words.slice(1).forEach((r) => {
  const word = r[col('word')]; const hint = String(r[col('hint')]);
  assert(hint.length > 10, `${word}: 설명 없음`);
  assert(!hint.toLowerCase().includes(word), `${word}: 설명에 정답이 들어 있음 — ${hint}`);
});
console.log('예시', fresh.tabs.words.length - 1, '개 모두 영어 설명, 정답 단어 안 들어감');
teacher(fresh); set(fresh, 'daily_word_start', kst(0));
let r = today(fresh);
console.log('#1 힌트:', r.daily_word.hint);
assert.equal(r.daily_word.hint, 'Part of your leg. You bend it to sit down.');
assert.equal(r.daily_word.meaning, '무릎', '뜻은 그대로 (다 푼 뒤에 보임)');

// 이미 쓰던 시트 (v0.53, hint 칸 없음): setup이 맨 오른쪽에 hint 칸을 더하고, 빈 힌트는 빈칸으로
const old = makeWorld(baseline('c608fba')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
assert(!w.tabs.words[0].includes('hint'));
const msg = String(w.run('setup'));
console.log('setup:', msg.split('\n').filter((l) => l.includes('words')).join(' / '));
assert.equal(w.tabs.words[0][w.tabs.words[0].length - 1], 'hint');
teacher(w); set(w, 'daily_word_start', kst(0));
r = today(w);
assert.equal(r.daily_word.word, 'knees'); assert.equal(r.daily_word.hint, '', '예전 시트의 단어는 힌트 빈칸 → 앱이 글자 하나를 알려 줌');
assert.match(r.server, /^v0\.5\d$/);
console.log('모든 확인 통과');
