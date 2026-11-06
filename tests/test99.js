// 99단계: chapters 탭 level 칸 — setup이 기존 칸을 건드리지 않고 더함, 서버가 값을 정리해 보냄, Intermediate 챕터도 대화·피드백·선생님 요약이 그대로
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = '0edf36a';   // 서버 v0.62 (98단계 커밋)
const old = makeWorld(baseline(BASE)); old.run('setup');
const before = JSON.parse(JSON.stringify(old.tabs.chapters));
assert(!before[0].includes('level'), 'v0.62 시트에는 level 칸이 없음');

const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');
// ① 이미 쓰던 시트: 맨 오른쪽에 level만 더해지고 앞 칸과 내용은 그대로
const H = w.tabs.chapters[0];
assert.equal(H[H.length - 1], 'level');
assert.deepEqual(H.slice(0, -1), before[0]);
before.slice(1).forEach((row, i) => row.forEach((v, j) => assert.deepEqual(w.tabs.chapters[i + 1][j], v)));
console.log('setup: 기존 칸·내용 그대로, 맨 오른쪽에 level');

const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('live_model', 'x'); set('text_model', 'y'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row('students', { student_id: 'S1', display_name: '학생', access_code: 'stud', status: 'active', course: 'en' });
row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
const chapter = (id, order, level, published) => row('chapters', { chapter_id: id, order, title: id, goal: '-', keywords: 'list', scene: 'x', published, ai_captions: 'tap', course: 'en', level });
chapter('ci01', 1, ' Intermediate ', true);    // 앞뒤 빈칸·대문자
chapter('ci02', 2, 'intermediate', 'preview'); // 미리 보기
chapter('ca01', 1, 'advanced', true);
chapter('cx01', 9, 'intermedate', true);       // 잘못 쓴 값
row('scenarios', { scenario_id: 'ci01-s01', chapter_id: 'ci01', name: 'Test Patient', sex: 'male', dob: '1980-01-01', country: 'France', exam: 'stomach endoscopy with sedation', level: 1, active: true });

const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
// ② 값 정리: 빈칸은 beginner, 대문자·빈칸은 정리, 모르는 값은 beginner
const list = (code) => post({ action: 'chapters', code }).chapters;
const byId = (l) => Object.fromEntries(l.map((c) => [c.chapter_id, c.level]));
const student = byId(list('stud'));
console.log('학생이 받는 level:', JSON.stringify(student));
assert.equal(student.ch01, 'beginner'); assert.equal(student.ch02, 'beginner');
assert.equal(student.ci01, 'intermediate'); assert.equal(student.ca01, 'advanced'); assert.equal(student.cx01, 'beginner');
// ③ 미리 보기는 level이 있어도 선생님에게만
assert(!('ci02' in student), '미리 보기는 학생에게 안 보임');
assert.equal(byId(list('teach')).ci02, 'intermediate');

// ④ Intermediate 챕터도 대화 시작, 피드백, 선생님 요약이 그대로
const t = post({ action: 'talk', code: 'stud', chapter_id: 'ci01' }); assert(t.ok, JSON.stringify(t));
const fb = post({ action: 'feedback', code: 'stud', session_id: t.session_id, lines: [{ who: 'me', text: 'Please look at this list.' }] });
assert(fb.ok, JSON.stringify(fb));
const end = post({ action: 'end', code: 'stud', session_id: t.session_id, duration_sec: 60, end_reason: 'user' });
assert(end.ok, JSON.stringify(end));
const res = post({ action: 'summary', code: 'teach', course: 'en' });
assert(res.ok, JSON.stringify(res));
const sum = res.summary;
const stat = sum.chapterStats.find((c) => c.chapter_id === 'ci01');
assert(stat && stat.count === 1, '선생님 요약에 Intermediate 챕터 기록이 보임');
assert(sum.chapterStats.some((c) => c.chapter_id === 'ch01'), 'Beginner 챕터도 그대로');
console.log('Intermediate 챕터: 대화·피드백·선생님 요약 확인');
console.log('\n모든 확인 통과');
