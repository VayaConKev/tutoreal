const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW); w.run('setup');
const ch = w.tabs.chapters, H = ch[0];
ch.find((r) => r[0] === 'ch02')[H.indexOf('published')] = 'preview';
// 숨김(FALSE) 챕터 하나 추가
const hidden = ch.find((r) => r[0] === 'ch01').slice(); hidden[0] = 'ch09'; hidden[H.indexOf('published')] = false; ch.push(hidden);
const st = w.tabs.students; const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
add({ student_id: 'G1', display_name: '게스트', access_code: 'guest', status: 'active', role: 'Tester', course: 'en' });
add({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' });
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const audio = Buffer.alloc(32000).toString('base64');
for (const [code, label] of [['teach', '선생님'], ['guest', '테스터'], ['stu', '학생']]) {
  const list = post({ action: 'chapters', code }).chapters;
  const ids = list.map((c) => c.chapter_id + (c.preview ? '(미리 보기)' : ''));
  const talk = post({ action: 'talk', code, chapter_id: 'ch02' });
  const pron = post({ action: 'pronounce', code, drill_id: 'ch02-d01', level: 'blank', audio });
  const role = post({ action: 'login', code }).role;
  console.log(`${label}: 챕터 [${ids.join(', ')}] / 2장 대화 ${talk.ok ? '가능' : talk.error} / 2장 발음 ${pron.ok ? '가능' : pron.error} / 앱 역할 ${role}`);
  const sees = list.some((c) => c.chapter_id === 'ch02');
  assert(!list.some((c) => c.chapter_id === 'ch09'), 'FALSE는 아무도 못 봄');
  if (code === 'stu') { assert(!sees && talk.error === 'NO_CHAPTER' && pron.error === 'NO_DRILL' && role === 'student'); }
  else { assert(sees && list.find((c) => c.chapter_id === 'ch02').preview === true && talk.ok && pron.ok); }
  if (code === 'guest') assert.equal(role, 'student');   // 테스터는 선생님 탭이 보이지 않음
  assert(list.find((c) => c.chapter_id === 'ch01').preview === false);
}
assert.equal(post({ action: 'summary', code: 'guest' }).error, 'NOT_TEACHER');
console.log('테스터의 선생님 요약 요청: NOT_TEACHER');
console.log('모든 확인 통과');
