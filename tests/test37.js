const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
const w = makeWorld(NEW);
w.run('setup');
const ch = w.tabs.chapters; const H = ch[0];
assert(H.includes('checklist')); console.log('setup: chapters 칸', H.slice(-2).join(', '));
const C = (row, k) => H.indexOf(k);
// 영어 2챕터에 체크리스트 (선생님 목록 형식 그대로: 번호, 괄호, (선택))
const ch02 = ch.find((r) => r[0] === 'ch02');
ch02[H.indexOf('checklist')] = [
  '1. 안녕하세요, 침대 옆으로 쭉 들어오세요.',
  '2. 침대에 살짝 걸터 앉아주시고',
  '3) 저를 바라보면서 왼쪽으로 누워주세요 | Please lie down on your left side, facing me.',
  '',
  '- 엉덩이와 등이 침대 난간에 닿도록 뒤로 쭉 가주시고',
  '무릎은 가슴 쪽으로 (혹은 배꼽 쪽으로) 올려주세요.',
  "(선택) 왼쪽 어깨도 난간에 닿게 조금 밀겠습니다 |I'll push your left shoulder back a little.",
  '  혹시 녹내장이나 전립선 비대증 진단 받으신 적이 있으실까요?  '
].join('\n');
const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'N1', display_name: '간호사', access_code: 'nurse', status: 'active', course: 'en' })[k] ?? ''));
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'gemini-live-fake'); set('monthly_budget_usd', 50);
const post = (body) => w.run('doPost', { postData: { contents: JSON.stringify(body) } }).body;

const list = post({ action: 'chapters', code: 'nurse' }).chapters;
const c2 = list.find((c) => c.chapter_id === 'ch02'); const c1 = list.find((c) => c.chapter_id === 'ch01');
console.log('챕터 목록 ch02 체크리스트:'); c2.checklist.forEach((i, n) => console.log('  ' + (n + 1) + '. ' + i.text + (i.optional ? '  [선택]' : '')));
assert.equal(c2.checklist.length, 7); assert.equal(c2.checklist[0].text, '안녕하세요, 침대 옆으로 쭉 들어오세요.');
assert.equal(c2.checklist[2].text, '저를 바라보면서 왼쪽으로 누워주세요');
assert(c2.checklist[5].optional && c2.checklist[5].text.startsWith('왼쪽 어깨'));
assert.deepEqual(c1.checklist, []);
assert.equal(c2.checklist[2].en, 'Please lie down on your left side, facing me.');
assert.equal(c2.checklist[5].en, "I'll push your left shoulder back a little.");
assert.equal(c2.checklist[0].en, '');
console.log('영어 병기: 3번 en =', c2.checklist[2].en, '/ 6번(선택) en =', c2.checklist[5].en, '/ 1번 en 없음');

// ch02 피드백: 지시문에 목록, 스키마에 checklist, 결과는 시트 순서대로 (AI가 빠뜨린 항목은 false, 없는 번호 99는 무시)
const sid = post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' }).session_id;
const fb = post({ action: 'feedback', code: 'nurse', session_id: sid, lines: [{ who: 'me', text: 'Hello, please come in.' }, { who: 'ai', text: 'OK.' }] });
const req = w.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
const sys = req.p.systemInstruction.parts[0].text;
console.log('지시문 끝부분:\n' + sys.slice(sys.indexOf('Guidance checklist')));
assert(req.p.generationConfig.responseSchema.properties.checklist);
assert(sys.includes('6. (optional) 왼쪽 어깨도 난간에 닿게 조금 밀겠습니다 (model sentence: I\'ll push your left shoulder back a little.)'));
assert(sys.includes('3. 저를 바라보면서 왼쪽으로 누워주세요 (model sentence: Please lie down on your left side, facing me.)'));
assert(sys.includes('1. 안녕하세요, 침대 옆으로 쭉 들어오세요.\n'));
console.log('피드백 체크리스트:', fb.feedback.checklist.map((c) => (c.done ? '✓' : c.optional ? '–' : '✗')).join(' '));
assert.deepEqual(fb.feedback.checklist.map((c) => c.done), [true, false, true, false, false, false, false]);
assert.equal(fb.feedback.checklist[5].optional, true);
assert.equal(fb.feedback.checklist[2].en, 'Please lie down on your left side, facing me.');

// ch01(체크리스트 없음): 요청과 결과가 전과 같음
const sid1 = post({ action: 'talk', code: 'nurse', chapter_id: 'ch01' }).session_id;
const fb1 = post({ action: 'feedback', code: 'nurse', session_id: sid1, lines: [{ who: 'me', text: 'Hello' }] });
const req1 = w.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
assert(!req1.p.generationConfig.responseSchema.properties.checklist);
assert(!req1.p.systemInstruction.parts[0].text.includes('Guidance checklist'));
assert.deepEqual(fb1.feedback.checklist, []);
console.log('ch01: 체크리스트 없이 전과 같은 요청 (스키마·지시문 변화 없음)');

// 공유하면 피드백(체크리스트 포함)이 시트에 저장
post({ action: 'share', code: 'nurse', session_id: sid, confidence: 2, difficulty: '', lines: [{ who: 'me', text: 'Hello, please come in.' }] });
const se = w.tabs.sessions; const row = se.find((r) => r[0] === sid);
assert(JSON.parse(row[se[0].indexOf('feedback')]).checklist.length === 7);
console.log('공유: 시트 feedback 칸에 체크리스트 7개 저장');
console.log('모든 확인 통과');
