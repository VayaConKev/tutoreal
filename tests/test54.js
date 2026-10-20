// 63단계: 피드백 글 규칙 (해요체, 지시어로 시작하지 않기, 영어 받아쓰기 오류) + gentle 총평
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const old = makeWorld(baseline('7e508aa')); old.run('setup');
const w = makeWorld(CODE);
Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
w.run('setup');
const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50); set('daily_connect_limit', 100);
const st = w.tabs.students;
st.push(st[0].map((k) => ({ student_id: 'S1', display_name: '학생', access_code: 'stu', status: 'active', course: 'en' })[k] ?? ''));
st.push(st[0].map((k) => ({ student_id: 'S2', display_name: '대표', access_code: 'zhs', status: 'active', course: 'zh' })[k] ?? ''));
const post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
const H = w.tabs.chapters[0];
const lines = [{ who: 'me', text: '스틸을 코스프레하고 스틸 카운트를' }, { who: 'ai', text: 'Sorry?' }];
const sysFor = (code, ch) => {
  let sys = ''; w.fetchHook = (url, p) => { if (url.includes('generateContent')) sys = p.systemInstruction.parts[0].text; return null; };
  const t = post({ action: 'talk', code, chapter_id: ch }); assert(t.ok, JSON.stringify(t));
  const r = post({ action: 'feedback', code, session_id: t.session_id, lines }); assert(r.ok, JSON.stringify(r)); return sys;
};
const tail = (sys) => sys.slice(sys.indexOf('Writing rules'));
// 영어 보통
let sys = sysFor('stu', 'ch02');
assert(sys.includes('해요체') && sys.includes('하십시오체') && sys.includes('그렇게, 이렇게, 이 부분') && sys.includes('Speech recognition') && sys.includes('발음이 명확하게 인식되지 않은 구간이 있어요.'));
console.log('영어(보통) 끝에 붙는 규칙:\n' + tail(sys) + '\n');
// 영어 gentle
w.tabs.chapters.find((r) => r[0] === 'ch02')[H.indexOf('feedback_style')] = 'gentle';
sys = sysFor('stu', 'ch02');
assert(!sys.includes('그렇게 설명해도') && !sys.includes('이 부분은') && sys.includes('위염 결과를 쉬운 말로 풀어 설명해서') && sys.includes('수검자가 알아듣기') && sys.includes('아래 추천 표현도 참고해 보세요.'));
assert(sys.indexOf('GENTLE') < sys.indexOf('Writing rules'), '글 규칙이 맨 끝');
console.log('영어(gentle): 고정 문장(그렇게 설명해도… / 이 부분은…) 없음, 구체적인 예시 문장, 글 규칙이 맨 끝\n');
// 중국어: 해요체·지시어 규칙은 있고 받아쓰기 규칙은 없음
{ const c = w.tabs.chapters.find((r) => r[0] === 'ch01').slice(); c[0] = 'zh01'; c[H.indexOf('course')] = 'zh'; c[H.indexOf('feedback_style')] = ''; w.tabs.chapters.push(c);
  const SC = w.tabs.scenarios; const sc = SC.find((r) => r[1] === 'ch01').slice(); sc[0] = 'zh01-s01'; sc[1] = 'zh01'; sc[SC[0].indexOf('country')] = 'China'; SC.push(sc); }
const zhCh = w.tabs.chapters.find((r) => String(r[H.indexOf('course')]) === 'zh');
if (zhCh) {
  zhCh[H.indexOf('published')] = true;
  if (!w.tabs.scenarios.some((r) => r[1] === zhCh[0] && r[w.tabs.scenarios[0].indexOf('active')] !== false)) console.log('(중국어 시나리오 없음)');
  sys = sysFor('zhs', zhCh[0]);
  assert(sys.includes('해요체') && !sys.includes('Speech recognition'));
  console.log('중국어(' + zhCh[0] + '): 해요체·지시어 규칙 O, 받아쓰기 규칙 X');
} else console.log('(가짜 시트에 중국어 챕터가 없어 건너뜀)');
console.log('모든 확인 통과');
