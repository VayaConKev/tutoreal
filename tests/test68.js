// 68단계: 오늘의 단어의 수업 문장을 한 칸에 여러 개 (한 줄에 하나) — 앱이 그중 하나를 무작위로 보여 준다, 서버 v0.51에서 생김
const { makeWorld, CODE } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);
const w = makeWorld(CODE);
w.run('setup');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
const st = w.tabs.students;
st.push(st[0].map((k) => ({ student_id: 'T1', display_name: '선생님', access_code: 'tch', status: 'active', course: '', role: 'teacher' })[k] ?? ''));
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const word = () => { const r = post({ action: 'chapters', code: 'tch' }); assert(r.ok, JSON.stringify(r)); return r; };
// 예시 단어 4번 mouth는 문장 두 개 → #4인 날
set('daily_word_start', kst(-3));
let r = word(); let d = r.daily_word;
console.log('#4:', d.word, JSON.stringify(d.sentences));
assert.equal(d.word, 'mouth');
assert.deepEqual(d.sentences, ['The esophagus is the tube from your mouth to your stomach.', 'Please open your mouth wide.']);
assert.equal(d.sentence, d.sentences[0], 'v0.72 앱은 첫 문장을 그대로 보여 준다');
// 시트에서 줄바꿈(\r\n), 빈 줄, 앞뒤 빈칸이 섞여도 문장만 / 문장이 없는 단어는 빈 목록
w.tabs.words[4][3] = '  First sentence.\r\n\r\n Second one.  \n';
d = word().daily_word;
assert.deepEqual(d.sentences, ['First sentence.', 'Second one.']);
set('daily_word_start', kst(-1)); d = word().daily_word;
assert.equal(d.word, 'smile'); assert.deepEqual(d.sentences, []); assert.equal(d.sentence, '');
console.log('줄바꿈·빈 줄 정리 / 문장 없는 단어: 빈 목록');
console.log('모든 확인 통과');
