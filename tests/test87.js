// 87단계: 오늘의 단어 설명하기 — doPost(action=explain_word). 정답 단어를 써도 받아 주고(88단계, 지시문에 한 줄), 하루 횟수 한도(선생님은 없음)와
// 월 예산을 지키며, word_checks 탭에는 학생 글 없이 횟수·비용만. 이미 쓰던 시트에 setup을 다시 돌리면 탭·설정·지시문이 더해진다. 서버 v0.56
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const kst = (offsetDays) => new Date(Date.now() + 9 * 3600e3 + offsetDays * 86400e3).toISOString().slice(0, 10);

// 이미 쓰던 시트 (v0.54)에 새 서버의 setup
const old = makeWorld(baseline('cb6f36b')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
assert(!w.tabs.word_checks);
const msg = String(w.run('setup'));
console.log('setup:', msg.split('\n').filter((l) => /word_checks|explain/.test(l)).join(' / '));
assert.deepEqual(w.tabs.word_checks[0], ['at', 'student_id', 'word_no', 'overall', 'cost_usd']);
assert(w.tabs.prompts.some((r) => r[0] === 'word-explain-v1'));
assert(w.tabs.settings.some((r) => r[0] === 'daily_explain_limit' && r[1] === 3));

const set = (k, v) => { const r = w.tabs.settings.find((x) => x[0] === k); if (r) r[1] = v; else w.tabs.settings.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('monthly_budget_usd', 50);
set('daily_word_published', true); set('daily_word_start', kst(0));   // 오늘 #1 = knees
const st = w.tabs.students;
const add = (o) => st.push(st[0].map((k) => o[k] ?? ''));
add({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' });
add({ student_id: 'T1', display_name: '선생님', access_code: 'tch', status: 'active', course: '', role: 'teacher' });
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;

let sent = null;
w.fetchHook = (url, p) => {
  if (!url.includes('generateContent')) return null;
  sent = p;
  const data = { overall: 'clear', message: '다리를 굽히는 동작으로 잘 설명했어요.', corrected: 'It is part of your leg. You bend it.',
    changes: ['It is를 넣어요: 문장에는 주어와 동사가 필요해요'], alternatives: ['It is in the middle of your leg.', 'Your knees help you sit.'] };
  return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 600, candidatesTokenCount: 120 } }];
};

// 1) 보통 학생: 피드백을 받고, 정답 단어가 섞인 다른 표현은 빠진다
let r = post({ action: 'explain_word', code: 'stu', text: '  Part of   your leg. You bend it. ' });
console.log('피드백:', r.fb.overall, '/', r.fb.corrected, '/ 다른 표현', r.fb.alternatives, '/ 남은 횟수', r.left);
assert(r.ok); assert.equal(r.fb.overall, 'clear'); assert.equal(r.left, 2);
assert.deepEqual(r.fb.alternatives, ['It is in the middle of your leg.']);
const sys = sent.systemInstruction.parts[0].text; const user = sent.contents[0].parts[0].text;
assert(sys.includes('"knees"') && sys.includes('무릎') && sys.includes('You bend it to sit down'), '지시문에 단어·뜻·힌트');
assert(!sys.includes('Part of your leg. You bend it.'), '학생 글은 지시문이 아니라 요청 본문으로');
assert(user.includes('Part of your leg. You bend it.'));
const wc = w.tabs.word_checks; const H = wc[0];
assert.equal(wc.length, 2); assert.equal(wc[1][H.indexOf('word_no')], 1); assert.equal(wc[1][H.indexOf('overall')], 'clear');
assert(!JSON.stringify(wc).includes('bend'), 'word_checks에 학생 글이 남지 않음');

// 2) 88단계: 정답 단어(복수·단수 꼴 포함)를 써도 막지 않는다 — 지시문에 '써도 괜찮다'는 한 줄이 붙고, 횟수는 센다.
//    단어를 쓰지 않은 글(1번)에는 그 줄이 없다
assert(!sys.includes('used the word'), '단어를 안 쓴 글에는 안내 줄 없음');
r = post({ action: 'explain_word', code: 'tch', text: 'KNEES are in the middle of your legs.' });
assert(r.ok, JSON.stringify(r));
const sys2 = sent.systemInstruction.parts[0].text;
assert(sys2.includes('used the word "knees"') && sys2.includes('That is allowed'));
console.log('정답 단어를 쓴 글: 받아 주고, 지시문에 안내 한 줄');
wc.pop();   // 선생님 줄은 아래 학생 횟수 확인과 상관없지만 표를 1번 뒤 상태로 되돌린다

// 3) 너무 긴 글, 빈 글
assert.equal(post({ action: 'explain_word', code: 'stu', text: 'a'.repeat(201) }).error, 'BAD_TEXT');
assert.equal(post({ action: 'explain_word', code: 'stu', text: '   ' }).error, 'BAD_TEXT');

// 4) 하루 3번 → 4번째는 EXPLAIN_LIMIT. 선생님은 제한 없음 (left null)
post({ action: 'explain_word', code: 'stu', text: 'You use it to sit.' });
r = post({ action: 'explain_word', code: 'stu', text: 'It is on your leg.' });
assert(r.ok); assert.equal(r.left, 0);
r = post({ action: 'explain_word', code: 'stu', text: 'Leg part.' });
console.log('4번째:', r.error); assert.equal(r.error, 'EXPLAIN_LIMIT');
for (let i = 0; i < 4; i++) { r = post({ action: 'explain_word', code: 'tch', text: 'Part of your leg.' }); assert(r.ok); assert.equal(r.left, null); }
console.log('선생님 4번 모두 받음');

// 5) AI가 붐비면 EXPLAIN_BUSY, quality 탭에 진단 (글 없이)
w.fetchHook = (url) => (url.includes('generateContent') ? [503, {}] : null);
r = post({ action: 'explain_word', code: 'tch', text: 'Part of your leg.' });
assert.equal(r.error, 'EXPLAIN_BUSY');
const q = w.tabs.quality; const note = q.at(-1)[q[0].indexOf('note')];
console.log('붐빔:', r.error, '/', note); assert(/explain/.test(q.at(-1)[q[0].indexOf('kind')]) && /#1/.test(note) && !/leg/.test(note));

// 6) 설명하기 비용도 월 예산에 들어간다
wc.push([new Date(), 'S9', 1, 'clear', 60]);
r = post({ action: 'explain_word', code: 'tch', text: 'Part of your leg.' });
console.log('예산 초과:', r.error); assert.equal(r.error, 'MONTHLY_BUDGET');
wc.pop();

// 7) 오늘의 단어를 볼 수 없는 학생(공개 전)에게는 NO_WORD
set('daily_word_published', 'preview');
r = post({ action: 'explain_word', code: 'stu', text: 'Part of your leg.' });
assert.equal(r.error, 'NO_WORD');
console.log('모든 확인 통과');
