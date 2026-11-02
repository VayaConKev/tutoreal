// 96단계: 일본어 발음 코칭 — ja-pron-v1, pron 칸의 [대괄호]는 빼고 AI에. 영어·중국어 발음 코칭 지시문은 v0.60과 글자 하나까지 같음
const { makeWorld, CODE, baseline } = require('./fakesheet.js');
const assert = require('assert');
const BASE = '06d5dff';   // 서버 v0.60 (95단계 커밋)
const old = makeWorld(baseline(BASE)); old.run('setup'); old.run('addChineseSample');
const before = old.tabs.prompts.length;

function world(code) {
  const w = makeWorld(code);
  Object.assign(w.tabs, JSON.parse(JSON.stringify(old.tabs)));
  w.run('setup');
  const s = w.tabs.settings; const set = (k, v) => { const r = s.find((x) => x[0] === k); if (r) r[1] = v; else s.push([k, v, '']); };
  set('text_model', 'y'); set('monthly_budget_usd', 50);
  const row = (tab, obj) => { const t = w.tabs[tab]; t.push(t[0].map((k) => obj[k] ?? '')); };
  row('students', { student_id: 'T1', display_name: '선생님', access_code: 'teach', status: 'active', role: 'teacher', course: 'en' });
  row('chapters', { chapter_id: 'ja01', order: 1, title: '호명과 본인 확인', goal: '- 이름 묻기', keywords: 'お名前',
    scene: 'x', published: 'preview', ai_captions: 'show', course: 'ja' });
  row('drills', { drill_id: 'ja01-d01', chapter_id: 'ja01', order: 1, situation: '성함을 물어볼 때', sentence: '[お名前]をお願いします。',
    pron: '[Onamae] o onegai shimasu.', active: true });
  return w;
}
const post = (w, b) => w.run('doPost', { postData: { contents: JSON.stringify(b) } }).body;
function pron(w, drillId, level) {
  let sent = null;
  w.fetchHook = (url, p) => {
    sent = { system: p.systemInstruction.parts[0].text, schema: p.generationConfig.responseSchema, first: p.contents[0].parts[0].text };
    const data = { heard: 'Onamae o onegai shimasu.', said_target: true, overall: 'good', message: '좋아요',
      words: [{ word: 'お願いします', respelling: 'onegai shimasu', tip: '…' }] };
    return [200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 500, candidatesTokenCount: 80 } }];
  };
  const r = post(w, { action: 'pronounce', code: 'teach', drill_id: drillId, level, audio: 'UklGRg==' });
  return { r, sent };
}

const w = world(CODE);
const added = w.tabs.prompts.slice(before).map((r) => r[0]);
console.log('setup 뒤 추가된 지시문 (v0.60 시트에):', added.join(', '));
assert.deepEqual(added, ['ja-pron-v1']);

// ① 일본어: ja-pron-v1, pron 대괄호 뺌, 모드는 로마자 안내
const a = pron(w, 'ja01-d01', 'blank');
assert(a.r.ok, JSON.stringify(a.r));
console.log('일본어 코칭:', JSON.stringify(a.r.coach));
assert(a.sent.system.includes('Japanese pronunciation coach'));
assert(a.sent.system.includes('target: "お名前をお願いします。"') && a.sent.system.includes('Key words to check closely: お名前'));
assert(a.sent.system.includes('(the reference): Onamae o onegai shimasu.'), '대괄호를 뺀 로마자');
assert(!a.sent.system.includes('[Onamae]'));
assert(a.sent.system.includes('with romaji for the other words'));
assert(pron(w, 'ja01-d01', 'korean').sent.system.includes('make the whole Japanese sentence'));
assert.equal(a.sent.first, "Here is the learner's audio.");
assert.equal(a.r.coach.overall, 'good'); assert.equal(a.r.coach.words[0].respelling, 'onegai shimasu');
console.log('일본어 지시문: ja-pron-v1, 대괄호 없는 로마자, 1·2단계 모드 문구');

// ② 영어·중국어: 보낸 지시문이 v0.60과 똑같다
const prev = world(baseline(BASE));
for (const id of ['ch02-d04', 'zh01-d04']) {
  for (const level of ['blank', 'korean']) {
    const x = pron(w, id, level).sent; const y = pron(prev, id, level).sent;
    assert.equal(x.system, y.system, id + ' ' + level); assert.equal(x.first, y.first);
  }
}
console.log('영어 ch02-d04·중국어 zh01-d04: 지시문이 v0.60과 똑같음');

// ③ 일본어 지시문을 끄면 NO_PROMPT
w.tabs.prompts.find((r) => r[0] === 'ja-pron-v1')[2] = false;
assert.equal(pron(w, 'ja01-d01', 'blank').r.error, 'NO_PROMPT');
console.log('ja-pron을 끄면: NO_PROMPT');
console.log('\n모든 확인 통과');
