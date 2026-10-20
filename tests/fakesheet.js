// 가짜 구글 시트 + Apps Script 서비스로 Code.gs를 실행한다. 요청마다 새 실행(전역 값 새로)으로 돌린다.
// 실제 시트·Gemini에는 연결하지 않는다. API 키는 'FAKE_KEY'라는 가짜 값.
// CODE: 지금 저장소의 server/Code.gs. baseline(커밋): 그 커밋의 Code.gs (예: '이미 쓰던 시트'를 예전 서버로 만들어 setup을 다시 돌려 보는 시험)
const fs = require('fs'); const vm = require('vm'); const path = require('path'); const os = require('os');
const { execFileSync } = require('child_process');
const CODE = path.join(__dirname, '..', 'server', 'Code.gs');
function baseline(rev) {
  const file = path.join(os.tmpdir(), `tutoreal-Code-${rev}.gs`);
  if (!fs.existsSync(file)) fs.writeFileSync(file, execFileSync('git', ['show', `${rev}:server/Code.gs`], { cwd: path.join(__dirname, '..') }));
  return file;
}
function makeWorld(codePath) {
  const code = fs.readFileSync(codePath, 'utf8');
  const tabs = {}; const stats = { reads: 0, fetches: [] , logs: [] };
  const sheet = (name) => {
    const t = tabs[name]; if (!t) return null;
    const rng = (r, c, nr, nc) => ({
      getValues() { stats.reads++; const out=[]; for (let i=0;i<nr;i++){const row=[];for(let j=0;j<nc;j++)row.push((t[r-1+i]||[])[c-1+j] ?? '');out.push(row);} return out; },
      setValue(v) { while (t.length < r) t.push([]); t[r-1][c-1] = v; return this; },
      setValues(vs) { vs.forEach((row,i)=>row.forEach((v,j)=>{ while(t.length<r+i)t.push([]); t[r-1+i][c-1+j]=v; })); return this; },
      setFontWeight(){return this;}, setNumberFormat(){return this;}, setHorizontalAlignment(){return this;}, setWrap(){return this;}, clearContent(){return this;}
    });
    return {
      getLastRow: () => t.length, getLastColumn: () => Math.max(...t.map((r) => r.length), 0),
      getRange: (r, c, nr = 1, nc = 1) => rng(r, c, nr, nc),
      getDataRange() { return rng(1, 1, t.length, Math.max(...t.map((r) => r.length))); },
      appendRow(row) { t.push(row.slice()); }, setFrozenRows(){}, getMaxRows: () => 1000
    };
  };
  const cache = {};
  const props = {};
  const W = {};
  const g = { Date, JSON, Math, Object, Array, String, Number,
    console: { log: (m) => stats.logs.push(String(m)), error: (m) => stats.logs.push('ERR ' + m), warn(){} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: sheet, getSpreadsheetTimeZone: () => 'Asia/Seoul',
      insertSheet: (n) => { tabs[n] = []; return sheet(n); }, getSheets: () => Object.keys(tabs), deleteSheet(){} }), flush(){} },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; }, remove: (k) => { delete cache[k]; } }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => (k === 'GEMINI_API_KEY' ? 'FAKE_KEY' : (props[k] ?? null)), setProperty: (k, v) => { props[k] = v; } }) },
    LockService: { getScriptLock: () => ({ waitLock(){}, releaseLock(){} }) },
    Session: { getScriptTimeZone: () => 'Asia/Seoul' },
    Utilities: {
      formatDate: (d, tz, f) => { const k = new Date(d.getTime() + 9*3600e3).toISOString(); return f === 'yyyy-MM' ? k.slice(0,7) : k.slice(0,10); },
      getUuid: () => 'u' + Math.random().toString(36).slice(2), sleep: (ms) => { if (W.onSleep) W.onSleep(ms); }
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (s) => ({ setMimeType: () => ({ body: JSON.parse(s) }) }) },
    UrlFetchApp: { fetch: (url, opts) => {
      const p = JSON.parse(opts.payload); stats.fetches.push({ url, p });
      if (W.fetchHook) { const r = W.fetchHook(url, p); if (r) return resp(r[0], r[1]); }
      if (url.includes('auth_tokens')) return resp(200, { name: 'auth_tokens/fake' });
      const schemaKeys = Object.keys(p.generationConfig.responseSchema.properties);
      let data;
      if (schemaKeys.includes('heard')) data = { heard: 'Zhè shì wǒ de míngpiàn.', said_target: true, overall: 'good', message: '좋아요', words: [] };
      else data = { summary: 's', strengths: [], fixes: [], keywords: [], next_practice: [] };
      if (schemaKeys.includes('checklist')) data.checklist = [{ n: 1, done: true }, { n: 3, done: true }, { n: 6, done: false }, { n: 99, done: true }];
      return resp(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(data) }] } }], usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 } });
    } }
  };
  function resp(code, obj) { return { getResponseCode: () => code, getContentText: () => JSON.stringify(obj) }; }
  // 요청 하나 = 새 실행
  function run(fn, ...args) { const ctx = vm.createContext({ ...g }); vm.runInContext(code, ctx); return ctx[fn](...args); }
  return Object.assign(W, { tabs, stats, run, cache, resp });
}
module.exports = { makeWorld, CODE, baseline };
