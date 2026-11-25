// 122단계 (서버 v0.72): 출입증 체크인 준비 — login 응답에 badge(소속 · 역할 · 번호 · SINCE)와 next_class(다음 수업)
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const w = makeWorld(CODE); w.run('setup');

// ① setup: students에 badge_dept · badge_role · badge_no, settings에 next_class_chapter (두 번 돌려도 하나)
const H = w.tabs.students[0];
assert.deepEqual(H.slice(-3), ['badge_dept', 'badge_role', 'badge_no']);
const ncc = () => w.tabs.settings.filter((r) => r[0] === 'next_class_chapter');
assert.equal(ncc().length, 1); assert.equal(ncc()[0][1], '');
w.run('setup');
assert.equal(w.tabs.students[0].length, H.length); assert.equal(ncc().length, 1);
console.log('setup: students에 badge 칸 3개, settings에 next_class_chapter (빈칸)');

const add = (o) => w.tabs.students.push(H.map((k) => o[k] ?? ''));
add({ student_id: 'S1', display_name: '학생', access_code: 'stu-en', status: 'active', course: 'en', created_at: new Date('2026-10-11T03:00:00Z') });
add({ student_id: 'J1', display_name: '일본어 학생', access_code: 'stu-ja', status: 'active', course: 'ja', created_at: '2026-11-2' });
add({ student_id: 'S2', display_name: '학생2', access_code: 'stu-own', status: 'active', course: 'en', badge_dept: ' HEALTH CENTER ', badge_role: 'RN', badge_no: 'TR-07' });
add({ student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
const ch = w.tabs.chapters, CH = ch[0];
const copy = (from, id, fields) => { const r = ch.find((x) => x[0] === from).slice(); r[0] = id; Object.entries(fields).forEach(([k, v]) => { r[CH.indexOf(k)] = v; }); ch.push(r); };
copy('ch01', 'ja01', { course: 'ja', published: true, title: '호명(일본어)' });
copy('ch01', 'ch09', { published: 'preview', title: '미리 보기 챕터' });
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const login = (code) => { const r = post({ action: 'login', code }); assert(r.ok, JSON.stringify(r)); return r; };

// ② badge: 칸이 비면 과정별 기본값, SINCE는 created_at을 'yyyy.MM.dd' (한국 시간), 번호는 빈 글
assert.deepEqual(login('stu-en').badge, { dept: 'ENDOSCOPY UNIT', role: 'Nurse English', no: '', since: '2026.10.11' });
assert.deepEqual(login('stu-ja').badge, { dept: 'JAPANESE STUDY', role: '日本語', no: '', since: '2026.11.02' });
assert.deepEqual(login('stu-own').badge, { dept: 'HEALTH CENTER', role: 'RN', no: 'TR-07', since: '' });
console.log('badge: 칸 값 그대로(앞뒤 공백 뺌), 비면 과정별 기본값, SINCE는 yyyy.MM.dd');

// ③ next_class: 둘 다 비면 null
const set = (k, v) => { const r = w.tabs.settings.find((x) => x[0] === k); if (r) r[1] = v; else w.tabs.settings.push([k, v, '']); };
assert.equal(login('stu-en').next_class, null);
// 날짜만
set('next_class_date', new Date('2026-12-02T15:00:00Z'));   // 한국 시간 12-03 00:00
assert.deepEqual(login('stu-en').next_class, { date: '2026-12-03', chapter_id: '', order: 0, title: '' });
// 챕터: 쉼표 목록 중 그 사람에게 보이는 첫 챕터 (미리 보기는 선생님만, 다른 과정은 건너뜀, 없는 id 건너뜀)
set('next_class_chapter', 'nope, ch09, ja01, ch02');
const en = login('stu-en').next_class;
assert.equal(en.chapter_id, 'ch02'); assert.equal(en.date, '2026-12-03'); assert(en.title && en.order > 0);
assert.equal(login('teach').next_class.chapter_id, 'ch09');
assert.deepEqual(login('stu-ja').next_class, { date: '2026-12-03', chapter_id: 'ja01', order: 1, title: '호명(일본어)' });
// 일본어 과정 날짜: next_class_date_ja가 있으면 그것 (글자 날짜도)
set('next_class_date_ja', '2026-12-05');
assert.equal(login('stu-ja').next_class.date, '2026-12-05');
assert.equal(login('stu-en').next_class.date, '2026-12-03');
console.log('next_class: 날짜(과정별 next_class_date_<과정> 우선), 챕터는 쉼표 목록 중 그 사람에게 보이는 첫 챕터, 둘 다 없으면 null');

// ④ 예전 값은 그대로 (badge · next_class만 더해짐), 틀린 코드는 지금처럼
const r = login('stu-en');
assert.deepEqual(Object.keys(r).sort(), ['avatar', 'badge', 'course', 'name', 'next_class', 'ok', 'role', 'server']);
assert.deepEqual([r.name, r.role, r.course], ['학생', 'student', 'en']);
assert.equal(post({ action: 'login', code: 'wrong' }).error, 'INVALID_CODE');
console.log('모든 확인 통과');
