// 67단계: 오늘의 단어 — words 탭·예시 단어, settings daily_word_published(처음엔 preview)·daily_word_start, chapters 응답의 daily_word, 서버 v0.50
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

// 예전 서버로 만든 시트에 새 setup을 돌리면 words 탭과 설정 줄이 생긴다
const old = makeWorld(baseline('0cb05d8')); old.run('setup');   // 서버 v0.49 (오늘의 단어 전)
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
delete w.tabs.words;
const msg = w.run('setup');
console.log('setup:', String(msg).split('\n').filter((l) => /words|daily_word/.test(l)).join(' / '));
assert(w.tabs.words && w.tabs.words[0].join() === 'order,word,meaning,sentence,course,active');
assert.equal(w.tabs.words.length - 1, 20, '예시 단어 20개');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
assert(s.find((r) => r[0] === 'daily_word_start'), 'daily_word_start 설정 줄');
assert.equal(s.find((r) => r[0] === 'daily_word_published')[1], 'preview', '처음에는 학생에게 숨김');

const st = w.tabs.students;
const add = (id, code, course, role) => st.push(st[0].map((k) => ({ student_id: id, display_name: id, access_code: code, status: 'active', course, role })[k] ?? ''));
add('S1', 'stu', 'en', ''); add('S2', 'zhs', 'zh', ''); add('T1', 'tch', '', 'teacher'); add('Q1', 'tst', 'en', 'tester');
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const today = (code) => { const r = post({ action: 'chapters', code }); assert(r.ok, JSON.stringify(r)); return r.daily_word; };

// 처음(preview): 선생님·테스터만, 미리 보기 표시 / 학생은 없음
set('daily_word_start', kst(0));
assert.equal(today('tch').preview, true); assert.equal(today('tst').word, 'knees'); assert.equal(today('stu'), null);
set('daily_word_published', false); assert.equal(today('tch'), null); assert.equal(today('tst'), null);
set('daily_word_published', ''); assert.equal(today('tch'), null);
console.log('preview: 선생님·테스터만 / FALSE·빈칸: 아무에게도');
set('daily_word_published', true);
// 오늘이 #1 (TRUE: 모든 영어 과정 학생)
let d = today('stu');
console.log('오늘이 #1:', JSON.stringify(d));
assert.equal(d.no, 1); assert.equal(d.preview, false); assert.equal(d.word, 'knees'); assert.equal(d.meaning, '무릎'); assert.equal(d.date, kst(0));
// 시작한 지 2일째(#3) / 목록 끝을 넘으면 처음부터 (#21 → 1번째 단어)
set('daily_word_start', kst(-2)); d = today('stu'); assert.equal(d.no, 3); assert.equal(d.word, 'sting');
set('daily_word_start', kst(-20)); d = today('stu'); assert.equal(d.no, 21); assert.equal(d.word, 'knees');
console.log('#3:', 'sting', '/ #21: 처음으로 돌아가 knees');
// 선생님도 받고, 중국어 과정 학생은 받지 않는다
set('daily_word_start', kst(0));
assert.equal(today('tch').word, 'knees'); assert.equal(today('zhs'), null);
// 아직 #1 날짜 전이거나 비우면 없음
set('daily_word_start', kst(1)); assert.equal(today('stu'), null);
set('daily_word_start', ''); assert.equal(today('stu'), null);
console.log('선생님 받음 / 중국어 과정·시작 전·빈칸: 없음');
// 5글자가 아닌 단어, 꺼진 단어는 건너뛰고 setup이 알려 준다
const W = w.tabs.words;
W[1][1] = 'stomach'; W[2][5] = false;            // knees → stomach(7글자), smile 끄기
set('daily_word_start', kst(0));
assert.equal(today('stu').word, 'sting', '첫 쓸 수 있는 단어');
const msg2 = String(w.run('setup'));
console.log('setup 다시:', msg2.split('\n').filter((l) => l.includes('words')).join(' / '));
assert(/건너뛰는 단어 — stomach/.test(msg2));
// 날짜가 시트에서 날짜 값으로 바뀌어 있어도 된다
set('daily_word_start', new Date(kst(-1) + 'T00:00:00+09:00'));
assert.equal(today('stu').no, 2);
console.log('날짜 값으로 바뀐 칸도 읽음');
assert.equal(post({ action: 'chapters', code: 'stu' }).server, 'v0.50');
console.log('모든 확인 통과');
