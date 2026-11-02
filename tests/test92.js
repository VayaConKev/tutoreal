// 92단계: 로그인 잠금이 맞는 코드를 막지 않게 — 맞는 접속 코드(active 학생)는 실패 횟수와 상관없이 통과,
// 틀린 코드만 횟수를 세고(10분에 20번) 그 뒤의 틀린 코드는 TOO_MANY_TRIES. 실행 기록에 접속 코드는 남기지 않는다. 서버 v0.57
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');

const w = makeWorld(CODE);
w.run('setup');
const st = w.tabs.students;
const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'S1', display_name: '학생', access_code: 'student-code', status: 'active', course: 'en' });
add({ student_id: 'T1', display_name: '선생님', access_code: 'Teacher-Code', status: 'active', role: 'teacher' });
add({ student_id: 'S2', display_name: '쉬는 학생', access_code: 'resting-code', status: 'paused', course: 'en' });
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const fails = () => Number(w.cache.login_fails || 0);

// 1) 맞는 코드: 통과, 실패 횟수는 그대로 0 (대소문자·앞뒤 공백 무시)
let r = post({ action: 'login', code: '  STUDENT-code ' });
assert(r.ok, '맞는 코드는 통과'); assert.equal(r.name, '학생'); assert.equal(fails(), 0);

// 2) 빈 코드: INVALID_CODE, 세지 않음
r = post({ action: 'login', code: '   ' });
assert.equal(r.error, 'INVALID_CODE'); assert.equal(fails(), 0, '빈 코드는 세지 않음');

// 3) 쉬는 학생(active가 아님)의 코드: 틀린 코드처럼
r = post({ action: 'login', code: 'resting-code' });
assert.equal(r.error, 'INVALID_CODE'); assert.equal(fails(), 1);

// 4) 틀린 코드 19번 더 → 20번째까지 INVALID_CODE, 잠금 줄은 정확히 한 번
const wrong = [];
for (let i = 2; i <= 20; i++) {
  const code = 'wrong-code-' + i;
  wrong.push(code);
  r = post({ action: 'login', code: code });
  assert.equal(r.error, 'INVALID_CODE', i + '번째 틀린 코드');
}
assert.equal(fails(), 20);
const lockLines = () => w.stats.logs.filter((l) => l.includes('[로그인]'));
assert.equal(lockLines().length, 1, '잠금이 걸리는 순간 실행 기록에 한 줄');

// 5) 21번째 틀린 코드: TOO_MANY_TRIES, 횟수는 더 늘지 않음
r = post({ action: 'login', code: 'wrong-code-21' });
assert.equal(r.error, 'TOO_MANY_TRIES'); assert.equal(fails(), 20);
assert.equal(lockLines().length, 1, '잠긴 동안에는 줄을 더 남기지 않음');

// 6) 잠긴 상태에서도 맞는 코드는 모든 요청이 통과 (예전 서버는 여기서 TOO_MANY_TRIES)
r = post({ action: 'login', code: 'student-code' });
assert(r.ok, '잠금 중 학생 로그인'); assert.equal(fails(), 20, '맞는 코드는 횟수를 되돌리지 않음');
r = post({ action: 'chapters', code: 'student-code' });
assert(r.ok, '잠금 중 챕터 목록'); assert(Array.isArray(r.chapters));
r = post({ action: 'login', code: 'teacher-code' });
assert(r.ok, '잠금 중 선생님 로그인'); assert.equal(r.role, 'teacher');

// 7) 10분이 지나 캐시 값이 사라지면 다시 INVALID_CODE부터
delete w.cache.login_fails;
r = post({ action: 'login', code: 'wrong-code-22' });
assert.equal(r.error, 'INVALID_CODE'); assert.equal(fails(), 1);

// 8) 실행 기록에 접속 코드가 하나도 없다
const all = w.stats.logs.join('\n').toLowerCase();
['student-code', 'teacher-code', 'resting-code', 'wrong-code-21', 'wrong-code-22'].concat(wrong)
  .forEach((c) => assert(!all.includes(c), '실행 기록에 접속 코드: ' + c));

console.log('잠금 줄:', lockLines()[0]);
console.log('모든 확인 통과');
