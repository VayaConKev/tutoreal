const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const NEW = CODE;
function world(activeScenario) {
  const w = makeWorld(NEW); w.run('setup');
  const ch = w.tabs.chapters, H = ch[0];
  ch.find((r) => r[0] === 'ch02')[H.indexOf('checklist')] = [
    '저를 바라보면서 왼쪽으로 누워주세요. | Please lie down on your left side, facing me.',
    '(선택) 왼쪽 어깨도 난간에 닿게 조금 밀겠습니다. | I\'ll push your left shoulder back a little.',
    '혹시 녹내장 진단 받으신 적이 있으실까요? | Have you ever been diagnosed with glaucoma?',
    '(남성) 녹내장이나 전립선 비대증 진단 받으신 적이 있으실까요? | Have you ever been diagnosed with glaucoma or an enlarged prostate?',
    '(선택) (여성) 여성 전용 시험 항목 | test',
    '눈은 뜨고 계세요. | Please keep your eyes open.'
  ].join('\n');
  const sc = w.tabs.scenarios, SH = sc[0];
  sc.forEach((r, i) => { if (i && r[1] === 'ch02') r[SH.indexOf('active')] = r[0] === activeScenario; });
  const st = w.tabs.students; st.push(st[0].map((k) => ({ student_id: 'N1', display_name: 'n', access_code: 'nurse', status: 'active', course: 'en' })[k] ?? ''));
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('text_model', 'gemini-3.8-flash'); set('live_model', 'x'); set('monthly_budget_usd', 50);
  w.post = (b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
  return w;
}
// 챕터 목록: 6개 모두, 성별 표시와 선택 표시가 따로 나뉨
const w0 = world('ch02-s01');
const list = w0.post({ action: 'chapters', code: 'nurse' }).chapters.find((c) => c.chapter_id === 'ch02').checklist;
console.log('챕터 화면 항목:'); list.forEach((i) => console.log(`  ${i.text}  [sex=${i.sex || '-'}${i.optional ? ', 선택' : ''}]`));
assert.equal(list.length, 6); assert.equal(list[3].sex, 'male'); assert.equal(list[3].text, '녹내장이나 전립선 비대증 진단 받으신 적이 있으실까요?');
assert.equal(list[4].sex, 'female'); assert.equal(list[4].optional, true); assert.equal(list[4].text, '여성 전용 시험 항목');

for (const [scId, label, expect] of [['ch02-s01', '남성 Daniel', 5], ['ch02-s02', '여성 Sophie', 5]]) {
  const w = world(scId);
  const t = w.post({ action: 'talk', code: 'nurse', chapter_id: 'ch02' });
  assert.equal(t.scenario_id, scId);
  const fb = w.post({ action: 'feedback', code: 'nurse', session_id: t.session_id, lines: [{ who: 'me', text: 'Hello' }] }).feedback;
  const req = w.stats.fetches.filter((f) => f.url.includes(':generateContent')).pop();
  const sys = req.p.systemInstruction.parts[0].text; const part = sys.slice(sys.indexOf('Guidance checklist'));
  console.log(`\n${label}: 피드백 항목 ${fb.checklist.length}개 →`, fb.checklist.map((c) => c.item + (c.sex ? `(${c.sex})` : '')).join(' / '));
  console.log('  AI에게 보낸 목록:\n' + part.split('\n').slice(1, 1 + fb.checklist.length).map((l) => '    ' + l).join('\n'));
  assert.equal(fb.checklist.length, expect);
  if (label.startsWith('남성')) { assert(fb.checklist.some((c) => c.sex === 'male')); assert(!fb.checklist.some((c) => c.sex === 'female')); assert(part.includes('4. 녹내장이나 전립선')); }
  else { assert(!fb.checklist.some((c) => c.sex === 'male')); assert(fb.checklist.some((c) => c.sex === 'female')); assert(!part.includes('전립선')); }
}
console.log('\n모든 확인 통과');
