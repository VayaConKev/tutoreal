// 가짜 시트 시험을 모두 돌린다: node tests/run-all.js (저장소 맨 위에서)
// 시험마다 따로 실행하고, 마지막 줄이 '모든 확인 통과'인지 본다.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const files = fs.readdirSync(__dirname).filter((f) => /^test\d+\.js$/.test(f)).sort();
let failed = 0;
for (const f of files) {
  let out = '';
  try {
    out = execFileSync(process.execPath, [path.join(__dirname, f)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    out = String(err.stdout || '') + String(err.stderr || '');
  }
  const ok = out.trim().split('\n').pop() === '모든 확인 통과';
  if (!ok) failed++;
  console.log(`${ok ? '통과' : '실패'}  ${f}${ok ? '' : '\n' + out.trim().split('\n').slice(-8).join('\n')}`);
}
console.log(failed ? `\n${failed}개 실패` : `\n모두 통과 (${files.length}개)`);
process.exitCode = failed ? 1 : 0;
