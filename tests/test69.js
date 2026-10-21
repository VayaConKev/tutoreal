// 69단계: 오늘의 단어 예시에 salty·spicy 추가 (생활 습관 안내 '맵고 짠 음식은 피하세요'), 서버 v0.52
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const w = makeWorld(CODE);
w.run('setup');
const words = w.tabs.words.slice(1).map((r) => r[1]);
console.log('예시 단어', words.length, '개, 끝:', words.slice(-3).join(', '));
assert.equal(words.length, 22); assert.deepEqual(words.slice(-2), ['salty', 'spicy']);
assert(words.every((x) => /^[a-z]{5}$/.test(x)), '모두 영어 5글자');
assert.equal(new Set(words).size, words.length, '겹치는 단어 없음');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
const st = w.tabs.students;
st.push(st[0].map((k) => ({ student_id: 'T1', display_name: '선생님', access_code: 'tch', status: 'active', course: '', role: 'teacher' })[k] ?? ''));
set('daily_word_start', kst(-21));   // #22 = spicy
const r = w.run('doPost', { postData: { contents: JSON.stringify({ action: 'chapters', code: 'tch' }) } }).body;
console.log('#22:', r.daily_word.word, JSON.stringify(r.daily_word.sentences));
assert.equal(r.daily_word.word, 'spicy'); assert.equal(r.daily_word.sentences.length, 2);
assert.equal(r.server, 'v0.52');
console.log('모든 확인 통과');
