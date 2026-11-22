// 112단계 (서버 v0.69): settings current_chapter — 지금 수업 중인 챕터. 챕터 목록 응답에 current_chapter를 더 보낸다
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const w = makeWorld(CODE); w.run('setup');

// ① setup이 settings에 current_chapter 줄을 만든다 (처음 값은 빈칸). 두 번 돌려도 하나
const rows = () => w.tabs.settings.filter((r) => r[0] === 'current_chapter');
assert.equal(rows().length, 1, 'current_chapter 줄 하나'); assert.equal(rows()[0][1], '', '처음 값은 빈칸');
w.run('setup'); assert.equal(rows().length, 1, '두 번 돌려도 하나');
console.log('setup: settings에 current_chapter (빈칸)');

// 영어 학생, 일본어 학생, 선생님. 일본어 챕터(ja01) 하나, 학생에게 안 보이는 미리 보기 챕터(ch09) 하나
const ch = w.tabs.chapters, H = ch[0];
const copy = (from, id, fields) => { const r = ch.find((x) => x[0] === from).slice(); r[0] = id; Object.entries(fields).forEach(([k, v]) => { r[H.indexOf(k)] = v; }); ch.push(r); };
copy('ch01', 'ja01', { course: 'ja', published: true });
copy('ch01', 'ch09', { published: 'preview' });
const st = w.tabs.students; const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
add({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' });
add({ student_id: 'J1', display_name: '일본어 학생', access_code: 'jstu', status: 'active', course: 'ja' });
const setCur = (v) => { rows()[0][1] = v; };
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const cur = (code) => { const r = post({ action: 'chapters', code }); assert(r.ok, r.error); return r.current_chapter; };

// ② 빈칸이면 모두 빈 글 (앱은 지금처럼 Beginner 첫 장)
assert.deepEqual([cur('stu'), cur('jstu'), cur('teach')], ['', '', '']);
// ③ 하나만 적으면 그 챕터. 볼 수 없는 사람(다른 과정)은 빈 글
setCur('ch02');
assert.deepEqual([cur('stu'), cur('jstu'), cur('teach')], ['ch02', '', 'ch02']);
// ④ 쉼표로 여러 개: 그 사람에게 보이는 첫 챕터 (띄어쓰기 무시)
setCur(' ch02 , ja01 ');
assert.deepEqual([cur('stu'), cur('jstu'), cur('teach')], ['ch02', 'ja01', 'ch02']);
// ⑤ 미리 보기 챕터는 선생님만, 없는 챕터는 건너뛴다
setCur('ch09, nope, ch01');
assert.deepEqual([cur('stu'), cur('teach')], ['ch01', 'ch09']);
console.log('current_chapter: 빈칸 → 빈 글 / 과정·미리 보기에 맞춰 그 사람에게 보이는 첫 챕터');
// ⑥ 챕터 목록의 다른 값은 그대로 (current_chapter만 더해짐)
const keys = Object.keys(post({ action: 'chapters', code: 'stu' })).sort();
assert.deepEqual(keys, ['chapters', 'current_chapter', 'daily_word', 'learning_path', 'ok', 'server']);
console.log('모든 확인 통과');
