// 102단계: 학습 단계 유도 준비 — drills 탭 group·kind·cue 칸, settings learning_path_published.
// 이미 쓰던 시트에 setup을 돌리면 칸·줄이 더해지고, 새 칸이 빈 시트에서는 기존 문장 칸이 예전과 같다.
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = 'b5a0e8b';   // 서버 v0.64 (drills 칸은 v0.65와 같다)

// 지금 쓰는 시트 (예전 서버가 만든 시트 + 일본어 챕터·문장)
const old = makeWorld(baseline(BASE)); old.run('setup');
const row = (tabs, tab, obj) => { const t = tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
row(old.tabs, 'students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
row(old.tabs, 'students', { student_id: 'Q1', display_name: '테스터', access_code: 'test', status: 'active', role: 'tester', course: 'en' });
row(old.tabs, 'students', { student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' });
row(old.tabs, 'drills', { drill_id: 'ch01-d07', chapter_id: 'ch01', order: 7, situation: '단어: 창구', sentence: '[counter]', pron: '', active: true });
const drillHead = old.tabs.drills[0].slice();
const settingsCount = old.tabs.settings.length;

const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');

// ① setup: drills 맨 오른쪽에 칸 3개, settings에 줄 1개 (처음 값 preview). 두 번 돌려도 그대로
const H = w.tabs.drills[0];
assert.deepEqual(H.slice(0, drillHead.length), drillHead, '기존 칸 순서 그대로');
assert.deepEqual(H.slice(drillHead.length), ['group', 'kind', 'cue']);
const lp = w.tabs.settings.find((r) => r[0] === 'learning_path_published');
assert(lp && lp[1] === 'preview', 'learning_path_published = preview');
// 더해진 설정 줄은 learning_path_published와 그 뒤 단계에서 더한 줄만 (112단계 current_chapter)
const added = () => w.tabs.settings.slice(settingsCount).map((r) => r[0]);
assert(added().includes('learning_path_published') && added().every((k) => ['learning_path_published', 'current_chapter'].includes(k)), added().join(', '));
const settingsNow = w.tabs.settings.length;
w.run('setup');
assert.equal(w.tabs.drills[0].length, H.length); assert.equal(w.tabs.settings.length, settingsNow);
console.log('setup: drills에', H.slice(drillHead.length).join(', '), '/ settings에 learning_path_published = preview (두 번 돌려도 그대로)');

const post = (world, b) => world.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const list = (world, code) => post(world, { action: 'chapters', code });
const prevWorld = makeWorld(baseline(BASE)); Object.assign(prevWorld.tabs, JSON.parse(JSON.stringify(old.tabs)));

// ② 새 칸이 빈 시트: 기존 칸(drill_id, situation, sentence, pron)은 예전 서버와 같고, group은 빈칸, cue는 situation, kind는 자동
const now = list(w, 'teach'); const before = list(prevWorld, 'teach');
const drillsOf = (r, id) => r.chapters.find((c) => c.chapter_id === id).drills;
for (const ch of ['ch01', 'ch02']) {
  const a = drillsOf(now, ch); const b = drillsOf(before, ch);
  assert.equal(a.length, b.length);
  a.forEach((d, i) => {
    assert.deepEqual({ drill_id: d.drill_id, situation: d.situation, sentence: d.sentence, pron: d.pron }, b[i], ch + ' 기존 칸 그대로');
    assert.equal(d.group, ''); assert.equal(d.cue, d.situation);
  });
}
const kinds = drillsOf(now, 'ch01').map((d) => d.drill_id + ':' + d.kind);
console.log('ch01 문항 유형 (자동):', kinds.join(', '));
assert(kinds.includes('ch01-d07:word') && kinds.includes('ch01-d02:sentence'));
// 다른 칸·챕터 정보도 예전과 같다 (drills만 세 값이 더해짐)
// 119단계에서 더한 scenarios(대화 전 EMR)는 test119에서 본다
const strip = (r) => r.chapters.map(({ scenarios, ...c }) => ({ ...c, drills: c.drills.map((d) => ({ drill_id: d.drill_id, situation: d.situation, sentence: d.sentence, pron: d.pron })) }));
assert.deepEqual(strip(now), strip(before), '챕터 목록의 다른 값은 그대로');

// ③ 시트에 적은 값: group·kind·cue를 그대로 (kind는 word/sentence만, 대소문자 무시, 다른 글자는 자동)
const D = w.tabs.drills; const col = (n) => D[0].indexOf(n);
const set = (id, k, v) => { D.find((r) => r[0] === id)[col(k)] = v; };
set('ch01-d01', 'group', ' 시작 '); set('ch01-d01', 'cue', '창구로 부르기'); set('ch01-d02', 'kind', 'WORD'); set('ch01-d03', 'kind', 'phrase');
set('ch02-d01', 'situation', '단어 : 왼쪽');   // '단어:' 앞뒤 띄어쓰기도 단어 문항
const g = drillsOf(list(w, 'teach'), 'ch01');
const by = (id) => g.find((d) => d.drill_id === id);
assert.equal(by('ch01-d01').group, '시작'); assert.equal(by('ch01-d01').cue, '창구로 부르기');
assert.equal(by('ch01-d02').kind, 'word'); assert.equal(by('ch01-d03').kind, 'sentence');
assert.equal(drillsOf(list(w, 'teach'), 'ch02').find((d) => d.drill_id === 'ch02-d01').kind, 'word');
console.log('시트 값: group "시작", cue "창구로 부르기", kind WORD → word, phrase → 자동(sentence), situation "단어 :" → word');

// ④ learning_path: preview는 선생님·테스터만, TRUE는 모두, FALSE·빈칸은 아무에게도
const LP = w.tabs.settings.find((r) => r[0] === 'learning_path_published');
const who = () => ['teach', 'test', 'stu'].map((c) => list(w, c).learning_path);
for (const [v, on, preview] of [['preview', [true, true, false], true], [true, [true, true, true], false], ['TRUE', [true, true, true], false],
  [false, [false, false, false], false], ['', [false, false, false], false]]) {
  LP[1] = v;
  const r = who();
  assert.deepEqual(r.map((x) => x.on), on, String(v)); assert(r.every((x) => x.preview === preview), String(v) + ' preview');
  console.log(`learning_path_published = ${JSON.stringify(v)}: 선생님 ${r[0].on} / 테스터 ${r[1].on} / 학생 ${r[2].on}`);
}

console.log('\n모든 확인 통과');
