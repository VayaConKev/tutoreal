// 71단계: 오늘의 단어 test_account — 선생님·테스터 계정이면 true (앱이 시험용 '다시 하기'를 보여 줌), 학생은 false, 서버 v0.53
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const w = makeWorld(CODE);
w.run('setup');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
const st = w.tabs.students;
const add = (id, code, course, role) => st.push(st[0].map((k) => ({ student_id: id, display_name: id, access_code: code, status: 'active', course, role })[k] ?? ''));
add('S1', 'stu', 'en', ''); add('T1', 'tch', '', 'teacher'); add('Q1', 'tst', 'en', 'tester');
const get = (code) => { const r = w.run('doPost', { postData: { contents: JSON.stringify({ action: 'chapters', code }) } }).body; assert(r.ok, JSON.stringify(r)); return r; };
set('daily_word_start', kst(0));
// 미리 보기: 선생님·테스터만 받고 둘 다 test_account
assert.equal(get('tch').daily_word.test_account, true); assert.equal(get('tst').daily_word.test_account, true);
assert.equal(get('stu').daily_word, null);
// 학생에게 연 뒤에도 선생님·테스터는 test_account, 학생은 false
set('daily_word_published', true);
assert.equal(get('tch').daily_word.test_account, true); assert.equal(get('tst').daily_word.test_account, true);
assert.equal(get('stu').daily_word.test_account, false);
console.log('test_account: 선생님 true · 테스터 true · 학생 false (미리 보기·공개 모두)');
assert.equal(get('tch').server, 'v0.53');
console.log('모든 확인 통과');
