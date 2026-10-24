// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk, endTalk, getFeedback, shareTalk, getSummary, checkPronunciation, setAvatar, getGloss, getStudentTalks } from './api.js';
import { LiveSession } from './live.js';
import { Recorder } from './recorder.js';
import { WAIT_CAT_SVG } from './wait-cat.js';

const $ = (sel) => document.querySelector(sel);
const views = {
  login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail'), talk: $('#view-talk'), review: $('#view-review'),
  history: $('#view-history'), record: $('#view-record'),
  teacher: $('#view-teacher'), tchapter: $('#view-tchapter'), tstudent: $('#view-tstudent'), tsession: $('#view-tsession'),
  drill: $('#view-drill'), avatar: $('#view-avatar'), word: $('#view-word')
};
let chapters = [];
let currentChapter = null;
let live = null;        // 진행 중인 음성 대화
let talk = null;        // 진행 중인 대화의 정보 { sessionId, scenarioId, patient, readyAt, endReason, reported, limitSec, limitKind, aiSec }
let clock = null;       // 경과 시간 타이머

// 접속 코드는 이 기기의 브라우저에만 기억한다 (다음에 열 때 다시 입력하지 않도록).
const CODE_KEY = 'tutoreal.code';
function loadCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}
function saveCode(code) {
  try { code ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY); } catch { /* 저장 못 해도 동작 */ }
}
// 자동 로그인: 사용자가 직접 체크했을 때만 (기본 꺼짐). 꺼져 있으면 코드만 미리 채우고 '로그인'을 눌러야 들어간다.
const AUTO_KEY = 'tutoreal.autologin';
function loadAuto() {
  try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}
function saveAuto(on) {
  try { on ? localStorage.setItem(AUTO_KEY, '1') : localStorage.removeItem(AUTO_KEY); } catch { /* 저장 못 해도 동작 */ }
}

const ERROR_TEXT = {
  INVALID_CODE: '접속 코드가 맞지 않아요.',
  TOO_MANY_TRIES: '잘못된 시도가 많아요. 10분 뒤에 다시 해 주세요.',
  TIMEOUT: '서버 응답이 늦어요. 잠시 뒤 다시 해 주세요.',
  NotAllowedError: '마이크 사용이 허용되지 않았어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.',
  NotFoundError: '마이크를 찾지 못했어요.',
  NO_SCENARIO: '이 챕터에 준비된 시나리오가 없어요.',
  TOKEN_FAILED: '음성 연결 준비에 실패했어요. 잠시 뒤 다시 해 주세요.',
  FEEDBACK_FAILED: '피드백을 만들지 못했어요.',
  FEEDBACK_LIMIT: '이 대화의 피드백을 여러 번 실패했어요. 30분쯤 뒤에 다시 받아 보세요.',
  FEEDBACK_BUSY: '피드백을 아직 만드는 중이에요. 잠시 뒤 다시 시도해 주세요.',
  AI_BUSY: '지금 AI에게 요청이 한꺼번에 몰렸어요. 잠시 뒤 "다시 시도"를 눌러 주세요.',
  NO_SESSION: '서버에서 이 대화의 기록을 찾지 못해서 피드백을 받을 수 없어요.',
  DAILY_CONNECT_LIMIT: '오늘 대화 횟수를 다 썼어요. 내일 다시 만나요.',
  DAILY_TIME_LIMIT: '오늘 사용 시간을 다 썼어요. 내일 다시 만나요.',
  MONTHLY_BUDGET: '이번 달 사용할 수 있는 시간을 모두 썼어요. 선생님께 알려 주세요.',
  NOT_TEACHER: '선생님 코드로만 볼 수 있어요.',
  DAILY_PRON_LIMIT: '오늘 발음 코칭 횟수를 다 썼어요. "정답 보기"로 계속 연습할 수 있어요.',
  PRON_FAILED: '발음 확인에 실패했어요. 잠시 뒤 다시 해 주세요.',
  PRON_BUSY: 'AI가 붐벼서 발음을 확인하지 못했어요. 잠시 뒤 다시 해 주세요. "정답 보기"로 계속 연습할 수 있어요.',
  BAD_AUDIO: '녹음이 제대로 되지 않았어요. 다시 해 주세요.',
  NO_PROMPT: '이 과정에서는 아직 준비 중인 기능이에요.'
};
const LIMIT_TEXT = {
  daily: '오늘 사용 시간을 다 써서 대화를 마쳤어요.',
  budget: '이번 달 사용할 수 있는 시간에 맞춰 대화를 마쳤어요.',
  session: '대화 한 번은 최대 15분이에요.'
};
const errorText = (err) => ERROR_TEXT[err.name] || ERROR_TEXT[err.message] || `연결에 문제가 있어요. (${err.message})`;

// 탭 바: 화면마다 어느 탭에 속하는지. 여기에 없는 화면(로그인, 대화, 돌아보기, 문장 연습)에서는 탭 바를 숨긴다.
const TAB_OF = {
  list: 'list', detail: 'list', history: 'history', record: 'history', avatar: 'avatar',
  teacher: 'teacher', tchapter: 'teacher', tstudent: 'teacher', tsession: 'teacher'
};

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  const tab = TAB_OF[name];
  $('#tabbar').hidden = !tab;
  document.body.classList.toggle('has-tabbar', !!tab);
  // 대화·오늘의 단어 화면은 위쪽 로고 줄을 숨겨 대화 글자와 칸이 더 많이 보이게 한다 (80단계, 78단계에는 작은 휴대폰의 오늘의 단어만)
  document.body.classList.toggle('no-brand', name === 'talk' || name === 'word');
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (name === 'list' && chapters.length) renderList();   // 대화·문장 연습을 하고 돌아오면 진행 상황(79단계)을 새로 센다
  window.scrollTo(0, 0);
}

function setVersion(server) {
  $('#version').textContent = server ? `앱 ${APP_VERSION} · 서버 ${server}` : `앱 ${APP_VERSION}`;
}

/**
 * 학습 개요(시트의 goal 칸): 줄바꿈이나 '-'·'•'로 나눈 여러 항목이면 글머리표 목록, 한 문장이면 그대로.
 * 예) '-수검자 호명하기 -이름과 생년월일 확인하기' 또는 칸 안에서 줄바꿈(⌘+Enter)
 */
function goalItems(goal) {
  const text = String(goal || '').trim();
  let parts = text.split(/\r?\n/);
  if (parts.length === 1 && /^[-•]/.test(text)) parts = text.split(/(?:^|\s)[-•]\s*/);
  return parts.map((p) => p.replace(/^[-•]\s*/, '').replace(/[.。]\s*$/, '').trim()).filter(Boolean);
}
function goalHtml(goal) {
  const items = goalItems(goal);
  if (items.length <= 1) return escapeHtml(items[0] || '');
  return `<ul class="goal-list">${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ── 접속 코드 ── */

async function enter(code) {
  const submit = $('#login-submit');
  submit.disabled = true;
  submit.textContent = '확인 중…';
  $('#login-msg').textContent = '';
  try {
    const { name, role, avatar, course, server } = await login(code);
    saveCode(code);
    me.name = name;
    me.avatar = avatar;
    me.course = course;
    renderMe();
    $('#tab-teacher').hidden = role !== 'teacher';   // 화면에서만 숨긴다. 서버도 요청마다 역할을 확인한다.
    setVersion(server);
    show('list');
    loadChapters();
  } catch (err) {
    console.warn(err);
    if (err.message === 'INVALID_CODE') saveCode('');
    $('#login-msg').textContent = errorText(err);
    show('login');
  } finally {
    submit.disabled = false;
    submit.textContent = '로그인';
  }
}

function logout() {
  saveCode('');
  $('#tab-teacher').hidden = true;
  dailyWord = null;   // 다른 과정(중국어) 학생이 같은 휴대폰으로 들어올 수 있다
  renderWordCard();
  $('#login-code').value = '';
  $('#login-msg').textContent = '';
  show('login');
  $('#login-code').focus();
}

/* ── 챕터 ── */

const COURSE_NAME = { en: '영어', zh: '중국어' };

/* 난이도 탭 (38단계): Beginner / Intermediate / Advanced. 난이도를 정하는 방법은 나중에 정한다.
   지금은 챕터에 난이도 값이 없으므로 모두 Beginner. 나중에 시트에 난이도 칸이 생기면 c.level로 나뉜다. */
const DIFF_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
let difficulty = 'beginner';
const levelOf = (c) => (String(c.level || '').trim().toLowerCase() || 'beginner');

function setDifficulty(d) {
  difficulty = d;
  document.querySelectorAll('.diff-tab').forEach((b) => {
    b.classList.toggle('on', b.dataset.diff === d);
    b.setAttribute('aria-pressed', String(b.dataset.diff === d));
  });
  renderList();
}

/* 내 진행 상황 (79단계): 이 휴대폰의 기록(내 기록 최근 100개)과 문장 연습 표시로 챕터마다 센다. 서버에는 없다.
   완료 = 체크리스트의 꼭 할 항목(선택 제외)을 한 대화에서 모두 했다 (피드백의 'N / M'과 같은 기준). 체크리스트가 없는 챕터는 대화 1번 */
function chapterProgress(c, history, marks) {
  const talks = history.filter((e) => e.chapterId === c.chapter_id);
  const drillIds = (c.drills || []).map((d) => d.drill_id);
  const drillsDone = drillIds.filter((id) => marks[id]).length;
  const times = talks.map((e) => Date.parse(e.at)).concat(drillIds.map((id) => (marks[id] || {}).at)).filter(Boolean);
  const allDone = (e) => {
    const required = ((e.feedback && e.feedback.checklist) || []).filter((x) => !x.optional);
    return required.length > 0 && required.every((x) => x.done);
  };
  return {
    talks: talks.length, drillsDone, drillsTotal: drillIds.length, last: times.length ? Math.max(...times) : 0,
    complete: (c.checklist || []).length ? talks.some(allDone) : talks.length > 0
  };
}
function dayLabel(ms) {
  const d = new Date(ms);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days === 0 ? '오늘' : days === 1 ? '어제' : `${d.getMonth() + 1}월 ${d.getDate()}일`;
}
/** 💬 대화 2번 · 📝 문장 12/36 · 10월 23일. 한 번도 안 한 챕터는 빈 글 */
function progressHtml(p) {
  if (!p.talks && !p.drillsDone) return '';
  const parts = [];
  if (p.talks) parts.push(`💬 대화 ${p.talks}번`);
  if (p.drillsTotal) parts.push(`📝 문장 ${p.drillsDone}/${p.drillsTotal}`);
  if (p.last) parts.push(dayLabel(p.last));
  return `<span class="chapter-progress">${parts.map((x) => `<span>${escapeHtml(x)}</span>`).join('')}</span>`;
}

function renderList() {
  const box = $('#chapter-list');
  if (!chapters.length) {
    box.innerHTML = '<p class="state">아직 공개된 챕터가 없어요.</p>';
    return;
  }
  const list = chapters.filter((c) => levelOf(c) === difficulty);
  if (!list.length) {
    box.innerHTML = `<div class="card soon">
        <p class="soon-title">아직 준비 중이에요. Stay tuned!</p>
        <p class="soon-sub">${DIFF_NAME[difficulty]} 챕터는 곧 추가될 예정이에요.<br>지금은 Beginner 챕터로 연습해 주세요.</p>
      </div>`;
    return;
  }
  // 과정이 둘 이상이면(선생님) 과정마다 제목을 붙인다. 서버가 과정별·순서대로 보낸다.
  const many = new Set(list.map((c) => c.course)).size > 1;
  const history = loadHistory();
  const marks = loadDrillMarks();
  box.innerHTML = list.map((c, i) => {
    const p = chapterProgress(c, history, marks);
    // 완료한 챕터는 번호 대신 ✓ (화면 읽기에는 'N장 완료')
    const no = p.complete
      ? `<span class="chapter-no done"><span aria-hidden="true">✓</span><span class="visually-hidden">${escapeHtml(c.order)}장 완료</span></span>`
      : `<span class="chapter-no">${escapeHtml(c.order)}</span>`;
    return `
    ${many && (i === 0 || list[i - 1].course !== c.course) ? `<p class="eyebrow course-label">${COURSE_NAME[c.course] || c.course} 과정</p>` : ''}
    <button class="chapter" data-id="${escapeHtml(c.chapter_id)}">
      ${no}
      <span class="chapter-text">
        <span class="chapter-title">${escapeHtml(c.title)}${c.preview ? ' <span class="opt-tag preview-tag">미리 보기</span>' : ''}</span>
        <span class="chapter-goal">${goalHtml(c.goal)}</span>
        ${progressHtml(p)}
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`;
  }).join('');
  box.querySelectorAll('.chapter').forEach((btn) => {
    btn.addEventListener('click', () => openChapter(btn.dataset.id));
  });
}

function openChapter(id) {
  const c = chapters.find((x) => x.chapter_id === id);
  if (!c) return;
  $('#detail-no').textContent = `${c.order}장`;
  // 미리 보기 챕터 (43단계): 선생님·테스터에게만 보이고 학생에게는 아직 열리지 않았다
  $('#detail-title').innerHTML = escapeHtml(c.title) + (c.preview ? ' <span class="opt-tag preview-tag">미리 보기 · 학생에게는 안 보여요</span>' : '');
  $('#detail-goal').innerHTML = goalHtml(c.goal);
  // 핵심 단어: 누르면 휴대폰 음성으로 읽어 준다 (56단계)
  $('#detail-keywords').innerHTML = c.keywords.map((k) => `<button type="button" class="chip chip-say" data-say="${escapeHtml(k)}" aria-label="${escapeHtml(k)} 발음 듣기">${SPEAKER_ICON}${escapeHtml(k)}</button>`).join('');
  $('#detail-keywords').querySelectorAll('.chip-say').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.chip-say.speaking').forEach((x) => x.classList.remove('speaking'));
    const u = speak(b.dataset.say);
    if (!u) return;
    b.classList.add('speaking');
    u.onend = u.onerror = () => b.classList.remove('speaking');
  }));
  // 안내 체크리스트 (시트의 checklist 칸이 있는 챕터만): 대화 전에 미리 보고 공부한다 (33단계)
  // 한국어 아래에 따라 읽을 영어(en, 시트에서 '한국어 | English'). 지금은 모두 Beginner라 항상 보인다.
  const list = c.checklist || [];
  $('#detail-checklist-box').hidden = !list.length;
  $('#detail-checklist').innerHTML = list.map((item) => `<li>
    <span class="ck-ko">${escapeHtml(item.text)}${checklistTags(item)}</span>
    ${item.en ? `<span class="ck-en" lang="en">${escapeHtml(item.en)}</span>` : ''}</li>`).join('');
  currentChapter = c;
  const n = (c.drills || []).length;
  $('#drill-open').hidden = !n;
  // 화면 아래 버튼 줄(77단계)에서 반 칸만 쓰므로 짧게. 읽기 기능에는 '문장 30개'까지
  $('#drill-open').textContent = `문장 연습 · ${n}`;
  $('#drill-open').setAttribute('aria-label', `문장 연습, 문장 ${n}개`);
  show('detail');
}

/* ── 불러오는 동안의 자리 표시 (59단계): 글자 대신, 곧 보일 카드 모양의 회색 틀에 빛이 지나간다 ──
   화면 읽기 기능에는 '…를 불러오는 중'이라고 읽히고, 회색 틀은 읽지 않는다. */
const skLine = (w) => `<span class="sk sk-line" style="width:${w}%"></span>`;
function skeleton(kind, label) {
  const inner = {
    chapters: [72, 54, 64].map((w) => `<div class="chapter sk-card"><span class="sk sk-circle"></span>
      <span class="sk-lines">${skLine(w)}${skLine(w - 22)}</span></div>`).join(''),
    teacher: `<div class="card t-card sk-card sk-stats">${[0, 1, 2].map(() => `<span class="sk-stat"><span class="sk sk-num"></span>${skLine(70)}</span>`).join('')}</div>` +
      [0, 1].map(() => `<div class="card t-card sk-card"><span class="sk sk-line sk-title"></span>${[82, 68, 76].map(skLine).join('')}</div>`).join(''),
    rows: [78, 60].map(skLine).join('')
  }[kind];
  return `<div class="sk-wrap" role="status"><span class="visually-hidden">${escapeHtml(label)}</span><div aria-hidden="true">${inner}</div></div>`;
}

async function loadChapters() {
  const box = $('#chapter-list');
  box.innerHTML = skeleton('chapters', '챕터를 불러오는 중…');
  try {
    const { chapters: list, server, dailyWord: dw } = await getChapters(loadCode());
    chapters = list;
    dailyWord = dw;
    renderWordCard();
    if (chapters.some((c) => c.course === 'zh')) loadPinyin();   // 중국어 챕터가 있을 때만 병음 변환기를 불러온다
    setVersion(server);
    renderList();
  } catch (err) {
    console.warn(err);
    box.innerHTML = `
      <p class="state">챕터를 불러오지 못했어요. (${escapeHtml(err.message)})</p>
      <button class="secondary" id="retry">다시 시도</button>`;
    $('#retry').addEventListener('click', loadChapters);
  }
}

/* ── 음성 대화 ── */

/**
 * 검사 결과 슬립 (48단계). 검사실 간호사가 적어 회복실 간호사에게 주는 종이처럼:
 * 위 (G / C)에 한 검사에 동그라미, (+ 수면 / - 비수면), 오른쪽 위 소지품 번호, 이름, 생년월일, 큰 결과 글자.
 */
function showSlip(slip, patient) {
  const exams = ['G', 'C'].map((x) => (slip.exams.includes(x) ? `<span class="circ">${x}</span>` : x)).join(' / ');
  const big = slip.results.join(' ');
  // 결과 글자 크기 (52단계): 적은 그대로라 길이가 다양하다 (S, GU Scar, BG / 특이사항 없음).
  // 대문자 한 글자 너비를 1로 어림해 짧으면 이름 옆에 크게, 길면 이름 아래 한 줄 전체에 맞는 크기로.
  const units = [...big].reduce((n, ch) => n + (/[\uac00-\ud7a3]/.test(ch) ? 1.6 : /[A-Z]/.test(ch) ? 1 : /[a-z0-9]/.test(ch) ? 0.85 : /\s/.test(ch) ? 0.45 : 0.55), 0);
  const wide = units > 3.2;
  const px = wide ? Math.max(20, Math.min(48, Math.floor(400 / units))) : Math.min(64, Math.floor(150 / Math.max(units, 1)));
  $('#talk-slip').innerHTML = `
    <div class="slip-top"><span>( ${exams} )</span><span>( ${slip.sedation === '-' ? '−' : slip.sedation || '&nbsp;'} )</span></div>
    <div class="slip-locker"><small>소지품</small>${escapeHtml(String(slip.locker))}</div>
    <div class="slip-body">
      <p>이름: ${escapeHtml(patient.name)}</p>
      <p>생년월일: ${escapeHtml(patient.dob || '')}</p>
      <p class="slip-dx${wide ? ' wide' : ''}" style="font-size: ${px}px" aria-label="결과 ${escapeHtml(big)}">${escapeHtml(big)}</p>
    </div>`;
  $('#talk-slip').hidden = false;
  $('#talk-meta').hidden = true;
  $('#talk-calling').hidden = true;
  $('#talk-slip-legend').textContent = slip.legend || '';
  $('#talk-slip-legend').hidden = !slip.legend;
  $('#talk-go').hidden = false;
}

/* ── 내 목소리 막대 (55단계): 마이크 소리 크기(0.05초마다)를 막대 7개의 높이로 보여 준다 ──
   크기는 RMS(0~1). 말소리는 대개 0.02~0.2라 제곱근으로 펴고, 작은 잡음은 0으로. 올라갈 때는 바로, 내려갈 때는 천천히. */
const METER_HTML = '<span class="voice-meter" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span>';
const METER_WEIGHT = [0.4, 0.65, 0.85, 1, 0.85, 0.65, 0.4];
function makeMeter(find) {
  let shown = 0;
  return (rms) => {
    const el = find();
    if (!el) return;
    const lvl = Math.max(0, Math.min(1, (Math.sqrt(rms) - 0.05) * 2.8));
    shown = Math.max(lvl, shown * 0.8);
    const t = performance.now() / 120;
    el.querySelectorAll('i').forEach((bar, i) => {
      const h = 0.18 + 0.82 * shown * METER_WEIGHT[i] * (0.85 + 0.15 * Math.sin(t + i * 1.7));
      bar.style.transform = `scaleY(${h.toFixed(3)})`;
    });
  };
}

function setTalkStatus(text) {
  $('#talk-status').textContent = text;
}

const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

/** 경과 시간을 '0:42 / 15:00'처럼 보여 주고, 쓸 수 있는 시간이 되면 대화를 끝낸다. 1분 전에 미리 알린다. */
function startClock(t) {
  clearInterval(clock);
  clock = setInterval(() => {
    const sec = Math.floor((Date.now() - t.readyAt) / 1000);
    $('#talk-time').textContent = t.limitSec ? `${mmss(sec)} / ${mmss(t.limitSec)}` : mmss(sec);
    if (!t.limitSec || !live) return;
    if (sec === t.limitSec - 60) setTalkStatus('1분 남았어요.');
    if (sec >= t.limitSec) {
      t.endReason = 'limit';
      live.stop(LIMIT_TEXT[t.limitKind] || LIMIT_TEXT.session);
    }
  }, 1000);
}

/* 받아쓰기·자막: 말이 글자로 조금씩 도착하면 지금 말하는 사람의 말풍선에 이어 붙인다.
   환자 차례가 끝나면 두 말풍선을 닫아, 다음 말은 새 말풍선에 쓴다. 글자는 화면에만 있고 저장하지 않는다.
   중국어 과정: 한자 아래에 병음을 바로 보여 주고(휴대폰에서 변환), 상대의 말이 끝나면 서버에서
   교과서식 병음과 한국어 뜻을 받아 바꿔 넣는다. 뜻은 '뜻 보기'를 눌러야 보인다. */
const transcript = { me: null, ai: null, lines: [] };   // lines: [{ who, text, py?, ko? }] — 대화 후 화면에서 쓴다

function addText(who, text) {
  if (who === 'ai' && currentChapter.ai_captions === 'off') return;
  setTalkStatus('');
  let line = transcript[who];
  if (!line) {
    line = document.createElement('div');
    line.className = `line ${who}`;
    line.innerHTML = `<span class="who">${who === 'me' ? '나' : partnerWord()}</span>` +
      (who === 'ai' ? '<span class="cover">눌러서 자막 보기</span>' : '') + '<span class="text"></span>' +
      (courseNow() === 'zh' ? '<span class="py"></span>' : '') +
      (courseNow() === 'zh' && who === 'ai' ? '<button class="ko-btn" hidden>뜻 보기</button><span class="ko" hidden></span>' : '');
    if (who === 'ai' && currentChapter.ai_captions === 'tap') {
      line.classList.add('covered');
      line.addEventListener('click', () => line.classList.remove('covered'), { once: true });
    }
    $('#transcript').append(line);
    line.entry = { who, text: '' };
    transcript.lines.push(line.entry);
    transcript[who] = line;
    line.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  line.querySelector('.text').textContent += text;
  line.entry.text += text;
  if (courseNow() === 'zh') line.querySelector('.py').textContent = localPinyin(line.entry.text);
}

function endTurn() {
  const ai = transcript.ai;
  transcript.me = null;
  transcript.ai = null;
  if (ai && courseNow() === 'zh') glossLine(ai);
}

/** 상대의 말 한 줄: 서버에서 병음·뜻을 받아 넣고 '뜻 보기' 버튼을 보여 준다. 실패하면 휴대폰 병음을 그대로 둔다. */
function glossLine(line) {
  const t = talk;
  const e = line.entry;
  if (!t || !t.sessionId || !e.text.trim()) return;
  const btn = line.querySelector('.ko-btn');
  const ko = line.querySelector('.ko');
  const showKo = () => { ko.textContent = e.ko || (e.koFailed ? `뜻을 불러오지 못했어요. (${e.koFailed})` : '뜻을 불러오는 중…'); };
  btn.hidden = false;
  btn.addEventListener('click', (ev) => { ev.stopPropagation(); btn.hidden = true; ko.hidden = false; showKo(); });
  getGloss(loadCode(), t.sessionId, e.text)
    .then((g) => {
      e.py = g.pinyin;
      e.ko = g.ko;
      if (g.pinyin) line.querySelector('.py').textContent = g.pinyin;
    })
    .catch((err) => { console.warn('병음·뜻 실패', err); e.koFailed = err.message || 'ERROR'; })
    .finally(showKo);
}

/* 병음 변환 (pinyin-pro, js/vendor). 중국어 과정 학생에게만 불러온다. 불러오기 전에는 빈칸. */
let pinyinLoading = false;
function loadPinyin() {
  if (window.pinyinPro || pinyinLoading) return;
  pinyinLoading = true;
  const el = document.createElement('script');
  el.src = 'js/vendor/pinyin-pro.js';
  el.onerror = () => { pinyinLoading = false; };
  document.head.append(el);
}

/** 한자 → 병음 (한 글자씩, 성조 표시). 한자가 없으면 빈칸. 영어 낱말은 붙여서 그대로 둔다. */
function localPinyin(text) {
  const pp = window.pinyinPro;
  if (!pp || !/[\u3400-\u9fff]/.test(text)) return '';
  const out = [];
  let plain = false;   // 직전이 한자가 아닌 글자(영어 등)였는지
  pp.pinyin(text, { type: 'all' }).forEach((x) => {
    if (x.isZh) { out.push(x.pinyin); plain = false; } else if (/\s/.test(x.origin)) plain = false;
    else if (plain) out[out.length - 1] += x.origin;
    else { out.push(x.origin); plain = true; }
  });
  return out.join(' ').replace(/ ([，。！？、：；…,.!?:;）)」])/g, '$1');
}

/** 사용 시간 기록을 서버에 보낸다. 한 대화에 한 번만. */
function reportEnd(t) {
  if (!t.sessionId || t.reported) return;
  t.reported = true;
  const sec = t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0;
  const reason = t.endReason || (t.readyAt ? 'closed' : 'error');
  endTalk(loadCode(), t.sessionId, sec, reason, Math.round(t.aiSec || 0));
}

async function beginTalk() {
  if (live || !currentChapter) return;
  $('#difficulty').placeholder = courseNow() === 'zh' ? '브랜드 소개 문장이 바로 안 떠올랐어요' : '이름 철자를 묻는 게 어려웠어요';
  const t = { sessionId: null, scenarioId: '', patient: null, readyAt: 0, endReason: '', reported: false, limitSec: 0, limitKind: '' };
  talk = t;
  // 오디오는 버튼을 누른 이 순간에 켜야 한다 (iOS). 그래서 다른 일보다 먼저 만든다.
  live = new LiveSession({
    onStatus: (s) => {
      if (s === 'ready') { t.readyAt = Date.now(); $('#talk-calling').hidden = true; $('#talk-meter').hidden = false; setTalkStatus('연결됐어요. 먼저 말을 걸어 보세요.'); startClock(t); }
      if (s === 'goaway') setTalkStatus('곧 연결이 끝나요.');
    },
    onEnd: (reason, info) => { t.aiSec = session.recv; endedTalk(reason, info, t); reportEnd(t); },
    onLevel: makeMeter(() => (t.readyAt ? $('#talk-meter .voice-meter') : null)),
    onText: addText,
    onTurnEnd: endTurn
  });

  $('#talk-head').hidden = false;
  $('#talk-chapter').textContent = `${currentChapter.order}장 · ${currentChapter.title}`;
  // 영어 과정: '수검자가 오고 있습니다…'와 걸어오는 수검자 그림 (49단계). 수검자가 준비되면(슬립·연결) 또는 끝나면 숨긴다
  const en = courseNow() !== 'zh';
  $('#talk-name').textContent = en ? '수검자가 오고 있습니다…' : `${partnerTitle()} 준비 중…`;
  $('#talk-calling').hidden = !en;
  $('#talk-avatar').innerHTML = '';
  $('#talk-meta').textContent = '–';
  $('#talk-meta').hidden = false;
  $('#talk-slip').hidden = true;
  $('#talk-slip-legend').hidden = true;
  $('#talk-go').hidden = true;
  $('#talk-meter').hidden = true;
  $('#talk-time').textContent = '0:00';
  $('#talk-info').hidden = true;
  $('#transcript').innerHTML = '';
  transcript.lines = [];
  endTurn();
  $('#talk-end').hidden = false;
  $('#talk-next').hidden = true;
  $('#talk-back').hidden = true;
  show('talk');

  const session = live;
  try {
    setTalkStatus('마이크 준비 중…');
    await session.openMic();
    if (session.ended) return;   // 준비 중에 '끝내기'를 누른 경우
    setTalkStatus(`${partnerTitle()}를 부르는 중…`);
    const { token, model, patient, sessionId, scenarioId, server, limitSec, limitKind, slip } = await startTalk(loadCode(), currentChapter.chapter_id);
    const gotAt = Date.now();
    t.sessionId = sessionId;
    t.scenarioId = scenarioId || '';
    t.patient = patient;
    t.limitSec = limitSec || 0;
    t.limitKind = limitKind || '';
    if (session.ended) return reportEnd(t);   // 준비 중에 끝난 경우에도 시작 기록을 마무리한다
    setVersion(server);
    $('#talk-name').textContent = patient.name;
    $('#talk-avatar').innerHTML = patientAvatar(patient.name, scenarioId);
    // 영어: 생년월일 · 검사 / 중국어: 역할·장소 (생년월일 칸은 비어 있다)
    $('#talk-meta').textContent = [patient.dob, patient.exam].filter(Boolean).join(' · ') || '–';
    if (slip) {
      // 검사 결과 슬립 (48단계): 슬립을 먼저 보여 주고, 학생이 '말하기 시작'을 누르면 연결한다.
      // 결과(진단명)는 슬립의 글자로만 보이게 차트 줄은 숨긴다. 토큰은 slip.start_within_sec 안에만 연결할 수 있다.
      showSlip(slip, patient);
      setTalkStatus(`슬립을 확인하고, 준비되면 '말하기 시작'을 눌러 주세요.`);
      await new Promise((resolve) => { $('#talk-go').onclick = resolve; });
      $('#talk-go').hidden = true;
      if (session.ended) return;
      if (Date.now() - gotAt > (slip.start_within_sec - 15) * 1000) {
        return session.stop('슬립을 오래 보고 있어서 연결할 수 있는 시간이 지났어요. 챕터로 돌아가 다시 시작해 주세요.');
      }
    }
    setTalkStatus('연결 중…');
    session.connect(token, model);
  } catch (err) {
    console.warn(err);
    session.stop(errorText(err));
  }
}

function endedTalk(reason, info, t) {
  clearInterval(clock);
  live = null;
  $('#talk-go').hidden = true;
  $('#talk-calling').hidden = true;
  $('#talk-meter').hidden = true;
  // 예상하지 못한 이유로 끝난 경우(연결 끊김 등)에만 연결 정보(보낸·받은 소리 등)를 보여 준다.
  $('#talk-info').textContent = info;
  $('#talk-info').hidden = !reason || !!t.endReason || !t.readyAt;
  // 연결 전에 끝남 (한도, 마이크 거부 등): 빈 환자 차트는 숨기고 이유만 보여 준다.
  if (!t.readyAt && reason) { $('#talk-head').hidden = true; setTalkStatus(reason); }
  else setTalkStatus(reason ? `대화가 끝났어요. ${reason}` : '대화가 끝났어요. 수고하셨어요!');
  // 내가 한 말이 있으면 대화 후 화면(1/4 자기 평가)으로 이어지고, 없으면 챕터로 돌아간다.
  const spoke = transcript.lines.some((l) => l.who === 'me' && l.text.trim());
  review.data = spoke ? {
    sessionId: t.sessionId, scenarioId: t.scenarioId, chapter: currentChapter, patient: t.patient, lines: transcript.lines.slice(),
    durationSec: t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0
  } : null;
  // 피드백은 대화가 끝나는 이 순간부터 만든다. 학생이 대화 후 화면 1~3단계를 하는 동안 준비된다 (31단계).
  if (review.data) loadFeedback(review.data);
  $('#talk-end').hidden = true;
  $('#talk-next').hidden = !spoke;
  $('#talk-back').hidden = spoke;
  $('#talk-status').scrollIntoView({ block: 'center', behavior: 'smooth' });   // 아래로 내려가 있어도 끝난 문구가 보이게
}

/* ── 대화 후 화면: 1/4 자기 평가 → 2/4 어려웠던 부분 고르기 → 3/4 공유 선택 → 4/4 피드백 (31단계) ──
   피드백은 대화가 끝나는 순간부터 미리 만들어, 학생이 1~3단계를 하는 동안 준비되게 한다.
   공유는 마지막 '완료' 때 저장한다. 서버가 만든 피드백을 함께 저장하므로 피드백이 끝난 뒤에 보낸다.
   고른 부분(줄의 hard 표시)은 피드백에 쓰지 않고, 내 기록과 (공유하면) 시트에만 남긴다. */
// review.data: { sessionId, scenarioId, chapter, patient, lines, durationSec, confidence(1~3), difficulty, feedback, shared,
//                feedbackJob(피드백 요청, 끝나면 성공·실패 모두 풀림) }   lines의 각 줄: { who, text, py?, ko?, hard? }

const review = { step: 1, data: null };
const REVIEW_STEPS = 4;

function openReview() {
  if (!review.data) return;
  document.querySelectorAll('.face, .choice').forEach((b) => b.classList.remove('selected'));
  $('#difficulty').value = '';
  $('#review-msg').textContent = '';
  $('#share-msg').textContent = '';
  $('#finish-msg').textContent = '';
  renderPickLines();
  goStep(1);
  show('review');
  if (!review.data.feedbackJob) loadFeedback(review.data);   // 보통은 대화가 끝날 때 이미 시작했다
}

/* 4/4 피드백: 대화 글자를 서버로 보내 AI 피드백을 받는다 (저장은 하지 않는다). 숨겨진 4단계 칸에 미리 그려 둔다. */
function loadFeedback(data) {
  const box = $('#feedback');
  // 기다리는 동안: 파도 애니메이션, 걸린 시간, 복습 문장 (36단계). 붐빌 때는 1분을 넘기기도 한다.
  if (data.stopWait) data.stopWait();   // '다시 시도': 앞의 기다림 화면을 멈춘다
  const stop = startWaitScreen(box, data);
  data.stopWait = stop;
  const lines = data.lines.map((l) => ({ who: l.who, text: l.text }));
  data.feedbackJob = getFeedback(loadCode(), data.sessionId, lines)
    .finally(() => { stop(); if (data.stopWait === stop) data.stopWait = null; })
    .then((fb) => {
      data.feedback = fb;
      if (review.data === data) box.innerHTML = feedbackHtml(fb);
    })
    .catch((err) => {
      console.warn(err);
      if (review.data !== data) return;
      box.innerHTML = busyArt(err) + `<p class="state">${escapeHtml(errorText(err))}</p>` +
        (err.message === 'FEEDBACK_LIMIT' ? '' : '<button class="secondary" id="feedback-retry">다시 시도</button>') +
        // 이번에 못 받아도 끝이 아니라는 안내 (40단계): 기록은 '완료' 때 저장되고, 내 기록에서 다시 받을 수 있다
        '<p class="hint fb-later">\'완료\'를 누르면 이 대화가 \'내 기록\'에 저장돼요. 나중에 \'내 기록\'에서 피드백을 다시 받을 수 있어요.</p>';
      const retry = $('#feedback-retry');
      if (retry) retry.addEventListener('click', () => loadFeedback(data));
    });
  return data.feedbackJob;
}

/**
 * AI가 붐벼서 피드백을 못 받았을 때의 그림 (50단계): 학생들이 고양이에게 서류를 퍼붓는 픽셀 만화.
 * 붐빔(AI_BUSY)과 응답이 너무 늦은 경우(TIMEOUT)에만. 다른 실패는 지금처럼 글만.
 */
function busyArt(err) {
  if (!err || !['AI_BUSY', 'TIMEOUT'].includes(err.message)) return '';
  return '<img class="busy-art" src="img/busy-ai.webp" width="720" height="538" alt="학생들이 고양이에게 대화 리포트와 피드백 문서를 잔뜩 퍼붓는 그림. AI가 붐비는 중이에요.">';
}

/** 체크리스트 항목 옆의 작은 표시: 선택(가끔만 하는 안내), 남성·여성(그 성별의 상대에게만, 34단계) */
function checklistTags(item) {
  const SEX = { male: `남성 ${partnerTitle()}만`, female: `여성 ${partnerTitle()}만` };
  return (item.sex ? ` <span class="opt-tag">${SEX[item.sex] || ''}</span>` : '') +
    (item.optional ? ' <span class="opt-tag">선택</span>' : '');
}

/** 안내 체크리스트 결과 (33단계): 했음 ✓ / 빠짐 ✗ / 선택 항목을 안 함 –. 숫자는 선택이 아닌 항목만 센다. */
function checklistHtml(list, gentle) {
  if (!list || !list.length) return '';
  const required = list.filter((c) => !c.optional);
  // 선택 항목은 글 옆의 '선택' 표시로 충분. 너그러운 피드백 챕터(47단계)는 안 한 항목을 빨간 ✗ 대신 회색으로 부드럽게
  // 한 항목은 왼쪽 ✓만 (63단계: 오른쪽 '했어요'는 ✓와 뜻이 겹쳐서 뺐다)
  const STATE = { done: ['✓', ''], miss: ['✗', '빠졌어요'], soft: ['–', '다음엔 이것도'], opt: ['–', ''] };
  const item = (c) => {
    const state = c.done ? 'done' : c.optional ? 'opt' : gentle ? 'soft' : 'miss';
    return `<li class="${state}"><span class="mark" aria-hidden="true">${STATE[state][0]}</span>
      <span class="txt">${escapeHtml(c.item)}${checklistTags(c)}
        ${c.en ? `<span class="ck-en" lang="en">${escapeHtml(c.en)}</span>` : ''}</span>
      ${STATE[state][1] ? `<span class="chk-state">${STATE[state][1]}</span>` : ''}</li>`;
  };
  // 접기 (61단계): 안 한 필수 항목만 펼쳐 두고, 한 항목·선택 항목은 접어 둔다. 모두 했으면 전부 접힌 채로
  const open = list.filter((c) => !c.done && !c.optional);
  const rest = list.filter((c) => c.done || c.optional);
  const doneN = required.filter((c) => c.done).length;
  const restLabel = rest.every((c) => c.done) ? `완료한 항목 보기 (${rest.length}개)` : `완료·선택 항목 보기 (${rest.length}개)`;
  return `<div class="fb-block fb-checklist">
    <p class="fb-title">안내 체크리스트 ${doneN} / ${required.length}${open.length ? '' : ' <span class="all-done">모두 했어요 ✓</span>'}</p>
    ${open.length ? `<ul class="fb-check">${open.map(item).join('')}</ul>` : ''}
    ${rest.length ? `<details class="fb-more"><summary>${restLabel}</summary><ul class="fb-check">${rest.map(item).join('')}</ul></details>` : ''}
  </div>`;
}

/** 기다리는 동안 보여 줄 복습 문장: 체크리스트(성별 표시가 없는 항목)가 있으면 그것, 없으면 문장 연습. [{ ko, target, py }] */
function waitTips(chapter) {
  const zh = (chapter.course || me.course) === 'zh';
  const plain = (s) => s.replace(/\[([^\]]+)\]/g, '$1');
  const fromChecklist = (chapter.checklist || []).filter((c) => !c.sex && c.en)
    .map((c) => ({ ko: c.text, target: c.en, py: zh ? localPinyin(c.en) : '' }));
  if (fromChecklist.length) return fromChecklist;
  return (chapter.drills || []).filter((d) => /\s/.test(plain(d.sentence).trim()) || zh)   // 단어 하나짜리는 빼고 문장만
    .map((d) => ({ ko: d.situation.replace(/^단어:\s*/, ''), target: plain(d.sentence), py: zh ? d.pron : '' }));
}

/**
 * 피드백 기다림 화면 (36단계, 45단계에 파도 → 고양이). 이마의 로딩 표시가 도는 고양이(js/wait-cat.js), 걸린 시간,
 * 5초마다 바뀌는 복습 문장. 진행률(%)은 알 수 없으므로 보여 주지 않는다.
 * 로딩 표시는 CSS 애니메이션이라 숨겨진 단계에서는 저절로 멈추고, '동작 줄이기'를 켠 휴대폰에서는 멈춘 그림.
 * 끝낼 때 부르는 함수를 돌려준다.
 */
function startWaitScreen(box, data) {
  const tips = waitTips(data.chapter);
  box.innerHTML = `<div class="fb-wait">
      ${WAIT_CAT_SVG}
      <p class="fb-wait-msg">AI가 대화를 읽고 있어요… <span class="fb-elapsed">0초</span></p>
      <p class="fb-wait-hint">1분 안팎 걸릴 수 있어요.</p>
      ${tips.length ? `<p class="fb-tip-label">기다리는 동안 한 번 더 말해 봐요</p>
        <div class="fb-tip" aria-live="polite"><span class="tip-ko"></span><span class="tip-target"></span><span class="tip-py"></span></div>` : ''}
    </div>`;
  const tipEl = box.querySelector('.fb-tip');
  const elapsedEl = box.querySelector('.fb-elapsed');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const started = Date.now();
  const tick = setInterval(() => { elapsedEl.textContent = `${Math.round((Date.now() - started) / 1000)}초`; }, 1000);
  let n = Math.floor(Math.random() * Math.max(tips.length, 1));
  const showTip = () => {
    if (!tipEl) return;
    const t = tips[n % tips.length];
    n++;
    const fill = () => {
      tipEl.querySelector('.tip-ko').textContent = t.ko;
      tipEl.querySelector('.tip-target').textContent = t.target;
      tipEl.querySelector('.tip-py').textContent = t.py || '';
      tipEl.style.opacity = 1;
    };
    if (still) return fill();
    tipEl.style.opacity = 0;
    setTimeout(fill, 350);
  };
  showTip();
  const rotate = tips.length > 1 ? setInterval(showTip, 5000) : 0;
  return () => { clearInterval(tick); clearInterval(rotate); };
}

/** 발음 듣기 버튼 (61단계): 누르면 휴대폰 음성으로 읽는다 (아래 문서 전체 클릭 처리). 과정은 그린 순간의 것으로 */
const sayBtn = (text, label = '발음 듣기') =>
  `<button type="button" class="say-btn" data-say="${escapeHtml(text)}" data-course="${courseNow()}" aria-label="${escapeHtml(label)}">${SPEAKER_ICON}</button>`;

// 고칠 점·다른 표현 묶음의 제목 (63단계: '더 좋은 표현'과 너그러운 챕터의 '이렇게도 말할 수 있어요'를 하나로)
const FIX_TITLE = '추천 표현 및 교정';

/** 추천 표현 한 장: 내가 한 말 → 이렇게 말해 보세요 (발음 듣기) → 이유 */
const fixCard = (f) => `<div class="fb-fix">
  <p class="fb-said"><span class="fb-label">내가 한 말</span>${escapeHtml(f.said)}</p>
  <p class="fb-better"><span class="fb-label">이렇게 말해 보세요</span><span class="fb-better-row"><span>${escapeHtml(f.better)}</span>${sayBtn(f.better)}</span></p>
  ${f.better_py ? `<p class="fb-py">${escapeHtml(f.better_py)}</p>` : ''}
  <p class="fb-why">${escapeHtml(f.why)}</p></div>`;

/**
 * 더 좋은 표현이 여러 개면 옆으로 넘기는 카드 (62단계): 다음 카드가 오른쪽에 살짝 보이고,
 * 아래에 ‹ 점 › 표시. 넘기면 점이 따라오고(아래 문서 전체 스크롤 처리), 화살표를 누르면 한 장씩 넘어간다.
 */
function fixCarousel(fixes) {
  return `<div class="fb-carousel" tabindex="0" aria-label="${FIX_TITLE} ${fixes.length}개, 옆으로 넘겨 보세요">
      ${fixes.map((f, i) => `<div class="fb-slide" aria-label="${i + 1} / ${fixes.length}">${fixCard(f)}</div>`).join('')}
    </div>
    <div class="fb-dots">
      <button type="button" class="fb-arrow" data-step="-1" aria-label="이전 표현">‹</button>
      ${fixes.map((_, i) => `<span class="fb-dot${i ? '' : ' on'}"></span>`).join('')}
      <button type="button" class="fb-arrow" data-step="1" aria-label="다음 표현">›</button>
    </div>`;
}
const carouselIndex = (c) => {
  const slide = c.querySelector('.fb-slide');
  return slide ? Math.round(c.scrollLeft / (slide.offsetWidth + 10)) : 0;
};
// 카드를 넘기면 점 표시를 따라 바꾼다 (스크롤은 위로 전달되지 않아 문서 전체에서 '잡는' 방식으로 듣는다)
document.addEventListener('scroll', (ev) => {
  const c = ev.target;
  if (!(c instanceof Element) || !c.classList.contains('fb-carousel')) return;
  const i = carouselIndex(c);
  c.nextElementSibling.querySelectorAll('.fb-dot').forEach((d, k) => d.classList.toggle('on', k === i));
}, true);
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('.fb-arrow');
  if (!a) return;
  const c = a.parentElement.previousElementSibling;
  const slide = c.querySelector('.fb-slide');
  if (slide) c.scrollBy({ left: Number(a.dataset.step) * (slide.offsetWidth + 10), behavior: 'smooth' });
});

/**
 * 피드백 (61단계에 블록으로 나눔): ① 총평·잘한 점(연한 청록) ② 안내 체크리스트(접기) ③ 더 좋은 표현(내가 한 말 → 추천 문장, 발음 듣기)
 * ④ 핵심 단어·다음에 연습할 문장(발음 듣기). 내용은 전과 같고 모양과 순서만 바뀌었다. 4/4, 내 기록, 선생님 화면이 같이 쓴다.
 */
function feedbackHtml(fb) {
  const used = fb.keywords.filter((k) => k.used).length;
  return `
    <div class="fb-block fb-good">
      <p class="fb-summary">${escapeHtml(fb.summary)}</p>
      ${fb.strengths.length ? `<p class="fb-title">잘한 점</p>
        <ul class="fb-list">${fb.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
    </div>
    ${checklistHtml(fb.checklist, fb.gentle)}
    ${fb.fixes.length ? `<div class="fb-block fb-fixes">
      <p class="fb-title">${FIX_TITLE}${fb.fixes.length > 1 ? ` <span class="fb-count">${fb.fixes.length}개</span>` : ''}</p>
      ${fb.fixes.length > 1 ? fixCarousel(fb.fixes) : fixCard(fb.fixes[0])}
    </div>` : ''}
    ${fb.keywords.length || fb.next_practice.length ? `<div class="fb-block">
      ${fb.keywords.length ? `<p class="fb-title">핵심 단어 ${used} / ${fb.keywords.length}</p>
        <div class="chips">${fb.keywords.map((k) =>
          `<span class="chip${k.used ? '' : ' unused'}">${k.used ? '✓ ' : ''}${escapeHtml(k.keyword)}</span>`).join('')}</div>` : ''}
      ${fb.next_practice.length ? `<p class="fb-title">다음에 연습할 문장</p>
        ${fb.next_practice.map((n) => `<div class="fb-next"><p class="fb-next-row"><span>${escapeHtml(n.en)}</span>${sayBtn(n.en)}</p>${n.py ? `<span class="py">${escapeHtml(n.py)}</span>` : ''}<span class="ko">${escapeHtml(n.ko)}</span></div>`).join('')}` : ''}
    </div>` : ''}`;
}

/** 대화 한 줄 (대화 후 2/4 고르기와 내 기록 보기가 같이 쓴다). 중국어 과정은 병음, 받아 둔 뜻이 있으면 뜻도. */
function lineInner(l) {
  const py = courseNow() === 'zh' ? (l.py || localPinyin(l.text)) : '';
  return `<span class="who">${l.who === 'me' ? '나' : partnerWord()}</span><span class="text">${escapeHtml(l.text)}</span>
    ${py ? `<span class="py">${escapeHtml(py)}</span>` : ''}
    ${l.ko ? `<span class="ko">${escapeHtml(l.ko)}</span>` : ''}
    <span class="pick-mark">어려웠어요</span>`;
}

/* 2/4 어려웠던 부분: 대화를 다시 보여 주고, 누른 줄에 '어려웠어요' 표시 (다시 누르면 취소) */
function renderPickLines() {
  $('#pick-lines').innerHTML = review.data.lines.map((l, i) => (l.text.trim()
    ? `<button type="button" class="line ${l.who === 'me' ? 'me' : 'ai'} hard-pick${l.hard ? ' picked' : ''}" data-i="${i}" aria-pressed="${!!l.hard}">${lineInner(l)}</button>`
    : '')).join('');
  updatePickCount();
}

function updatePickCount() {
  const n = review.data.lines.filter((l) => l.hard).length;
  $('#pick-count').textContent = n ? `고른 부분 ${n}개` : '';
}

$('#pick-lines').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.hard-pick');
  if (!btn || !review.data) return;
  const l = review.data.lines[Number(btn.dataset.i)];
  l.hard = !l.hard;
  btn.classList.toggle('picked', l.hard);
  btn.setAttribute('aria-pressed', String(l.hard));
  updatePickCount();
});

function goStep(n) {
  review.step = n;
  document.querySelectorAll('#view-review [data-step]').forEach((el) => { el.hidden = Number(el.dataset.step) !== n; });
  $('#review-step').textContent = `${n} / ${REVIEW_STEPS}`;
  $('#review-prev').hidden = n === 1;
  $('#review-next').textContent = n === REVIEW_STEPS ? '완료' : '다음';
  // 마지막 쪽(피드백)에서 오늘의 단어를 한 번 권한다 (67단계). 오늘 이미 풀었으면 숨긴다
  $('#word-nudge').hidden = !(n === REVIEW_STEPS && dailyWord && !wordDoneToday());
  // 피드백 다음 문장 연습으로 바로 (82단계). 문장 연습이 없는 챕터는 숨김
  $('#review-drill-box').hidden = !(n === REVIEW_STEPS && review.data && (review.data.chapter.drills || []).length);
  window.scrollTo(0, 0);
}

function nextStep() {
  if (review.step === 1) {
    if (!review.data.confidence) {
      $('#review-msg').textContent = '오늘 대화가 어땠는지 하나를 골라 주세요.';
      return;
    }
    review.data.difficulty = $('#difficulty').value.trim();
  }
  if (review.step === 3 && review.data.shared === undefined) {
    $('#share-msg').textContent = '공유할지 하나를 골라 주세요.';
    return;
  }
  if (review.step < REVIEW_STEPS) return goStep(review.step + 1);
  finishReview();
}

/* ── 기록: 이 휴대폰에 최근 100개까지 (공유 여부와 관계없이). 공유를 고르면 시트에도 저장한다.
   42단계에서 30개 → 100개 (백업 파일로 옮겨 둘 수 있게 되어서). 저장 공간이 모자라면 오래된 것부터 뺀다. ── */

const HISTORY_KEY = 'tutoreal.history';
const HISTORY_MAX = 100;

function saveLocal(d) {
  const entry = {
    sessionId: d.sessionId, scenarioId: d.scenarioId, chapterId: d.chapter.chapter_id, chapterOrder: d.chapter.order, course: d.chapter.course || me.course,
    chapterTitle: d.chapter.title, at: new Date().toISOString(), durationSec: d.durationSec,
    patient: d.patient, confidence: d.confidence, difficulty: d.difficulty, shared: d.shared,
    // 중국어 과정: 서버에서 받은 병음(py)과 뜻(ko)도 함께 남긴다. hard: 대화 후 2/4에서 고른 어려웠던 부분
    lines: d.lines.map((l) => ({
      who: l.who, text: l.text, ...(l.py ? { py: l.py } : {}), ...(l.ko ? { ko: l.ko } : {}), ...(l.hard ? { hard: true } : {})
    })),
    feedback: d.feedback || null
  };
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').filter((e) => e.sessionId !== entry.sessionId);
    list.unshift(entry);
    storeHistory(list);
  } catch { /* 저장 못 해도 진행 */ }
}

/** 기록 목록(최근 것이 앞)을 저장한다. 최대 100개, 휴대폰 저장 공간이 모자라면 오래된 기록부터 뺀다. 저장한 개수를 돌려준다. */
function storeHistory(list) {
  for (let n = Math.min(list.length, HISTORY_MAX); n > 0; n--) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, n))); return n; } catch { /* 줄여서 다시 */ }
  }
  return 0;
}

/* ── 기록 백업 (42단계): 내 기록 전체를 파일 하나(JSON)로 내보내고, 다른 휴대폰에서 불러온다.
   파일은 학생이 공유 창에서 고른 곳(파일 앱, iCloud, 카카오톡 나에게 보내기 등)에만 가고 서버를 거치지 않는다.
   접속 코드는 넣지 않는다. 불러올 때는 모양이 맞는 기록만 받아들이고, 같은 대화는 겹치지 않게 합친다. ── */
const BACKUP_TYPE = 'tutoreal-history';

/* ── 백업 권하기 (57단계): 마지막 백업 시각을 이 휴대폰에 기억해 두고, 그 뒤로 쌓인 기록을 센다 ── */
const BACKUP_AT_KEY = 'tutoreal.backupAt';
const NUDGE_NEW = 10;    // 백업 뒤로 새 기록이 이만큼 쌓이면
const NUDGE_DAYS = 14;   // 또는 마지막 백업이 이만큼 오래됐고 새 기록이 있으면
function lastBackupAt() {
  try { return Number(localStorage.getItem(BACKUP_AT_KEY)) || 0; } catch { return 0; }
}
function renderBackupNudge(list = loadHistory()) {
  const last = lastBackupAt();
  const fresh = list.filter((e) => Date.parse(e.at) > last).length;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
  let text = '';
  if (!last && fresh >= NUDGE_NEW) text = `기록이 ${fresh}개 쌓였어요. 아직 한 번도 백업하지 않았어요.`;
  else if (last && fresh >= NUDGE_NEW) text = `마지막 백업 뒤로 기록이 ${fresh}개 늘었어요.`;
  else if (last && fresh > 0 && days >= NUDGE_DAYS) text = `마지막 백업이 ${days}일 전이에요. 그 뒤로 기록이 ${fresh}개 늘었어요.`;
  $('#backup-nudge').hidden = !text;
  if (text) $('#backup-nudge-text').textContent = `${text} 휴대폰을 바꾸면 기록이 사라지니 지금 백업해 두세요.`;
}
function markBackedUp() {
  try { localStorage.setItem(BACKUP_AT_KEY, String(Date.now())); } catch { /* 기억 못 하면 다음에 또 권함 */ }
  renderBackupNudge();
}

async function exportBackup() {
  const msg = $('#backup-msg');
  msg.textContent = '';
  const list = loadHistory();
  if (!list.length) { msg.textContent = '아직 백업할 기록이 없어요.'; return; }
  const today = new Date().toISOString().slice(0, 10);
  const json = JSON.stringify({ type: BACKUP_TYPE, version: 1, exported_at: new Date().toISOString(), records: list });
  const name = `tutoreal-backup-${today}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Tutoreal 기록 백업' });
      msg.textContent = `기록 ${list.length}개를 백업했어요. 이 파일에는 내 대화가 들어 있으니 다른 사람에게 보내지 마세요.`;
      markBackedUp();
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // 공유 창을 닫음
      console.warn(err);
    }
  }
  // 공유 창으로 파일을 보낼 수 없으면 내려받기
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  msg.textContent = `기록 ${list.length}개를 '${name}' 파일로 내려받았어요.`;
  markBackedUp();
}

/** 불러온 기록 하나를 검사해 필요한 칸만 남긴다. 모양이 맞지 않으면 null. */
function cleanRecord(r) {
  if (!r || typeof r !== 'object' || typeof r.sessionId !== 'string' || !r.sessionId || !Array.isArray(r.lines)) return null;
  if (Number.isNaN(Date.parse(r.at))) return null;
  const str = (v) => (typeof v === 'string' ? v : '');
  const lines = r.lines.filter((l) => l && (l.who === 'me' || l.who === 'ai') && typeof l.text === 'string')
    .map((l) => ({ who: l.who, text: l.text, ...(typeof l.py === 'string' && l.py ? { py: l.py } : {}),
      ...(typeof l.ko === 'string' && l.ko ? { ko: l.ko } : {}), ...(l.hard === true ? { hard: true } : {}) }));
  const fb = r.feedback;
  const fbOk = fb && typeof fb === 'object' && typeof fb.summary === 'string' &&
    ['strengths', 'fixes', 'keywords', 'next_practice'].every((k) => Array.isArray(fb[k]));
  return {
    sessionId: r.sessionId, scenarioId: str(r.scenarioId), chapterId: str(r.chapterId),
    chapterOrder: Number(r.chapterOrder) || '', course: r.course === 'zh' ? 'zh' : 'en', chapterTitle: str(r.chapterTitle),
    at: new Date(r.at).toISOString(), durationSec: Number(r.durationSec) || 0,
    patient: { name: str(r.patient && r.patient.name) }, confidence: [1, 2, 3].includes(r.confidence) ? r.confidence : undefined,
    difficulty: str(r.difficulty), shared: r.shared === true, lines, feedback: fbOk ? fb : null
  };
}

async function importBackup(file) {
  const msg = $('#backup-msg');
  msg.textContent = '';
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    msg.textContent = '백업 파일을 읽지 못했어요. Tutoreal에서 만든 백업 파일인지 확인해 주세요.';
    return;
  }
  if (!data || data.type !== BACKUP_TYPE || !Array.isArray(data.records)) {
    msg.textContent = 'Tutoreal 기록 백업 파일이 아니에요.';
    return;
  }
  const incoming = data.records.map(cleanRecord).filter(Boolean);
  const list = loadHistory();
  const byId = new Map(list.map((e) => [e.sessionId, e]));
  let added = 0;
  let filled = 0;
  incoming.forEach((r) => {
    const have = byId.get(r.sessionId);
    if (!have) { byId.set(r.sessionId, r); added++; return; }
    if (!have.feedback && r.feedback) { have.feedback = r.feedback; filled++; }   // 이 휴대폰에는 없던 피드백만 채운다
  });
  const merged = [...byId.values()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const kept = storeHistory(merged);
  const parts = [added ? `새 기록 ${added}개를 불러왔어요.` : '새로 불러올 기록은 없었어요.'];
  if (filled) parts.push(`피드백 ${filled}개를 채웠어요.`);
  if (incoming.length - added - filled > 0) parts.push(`이미 있던 기록 ${incoming.length - added - filled}개는 그대로 두었어요.`);
  if (data.records.length > incoming.length) parts.push(`읽을 수 없는 기록 ${data.records.length - incoming.length}개는 건너뛰었어요.`);
  if (kept < merged.length) parts.push(`최근 ${kept}개까지만 남겼어요.`);
  openHistory();
  $('#backup-msg').textContent = parts.join(' ');
}

/** 돌아보기를 마치고 저장한다. next: 저장한 뒤 갈 화면 ('word'면 오늘의 단어, 아니면 챕터 화면) */
async function finishReview(next) {
  const d = review.data;
  const btn = $('#review-next');
  btn.disabled = true;
  $('#finish-msg').textContent = '';
  try {
    // 피드백이 아직 만들어지는 중이면 끝날 때까지 기다린다 (공유할 때 피드백도 함께 저장되고, 내 기록에도 남도록).
    // 기다리던 피드백이 도착하면 저장하지 않고 이 화면에 머물러 읽게 한다 (다시 '완료'를 누르면 저장).
    // 피드백이 실패했으면 피드백 없이 저장한다.
    if (d.feedbackJob && !d.feedback) {
      btn.textContent = '피드백을 기다리는 중…';
      await d.feedbackJob;
      if (d.feedback) return;
    }
    btn.textContent = '저장 중…';
    if (d.shared) {
      await shareTalk(loadCode(), d.sessionId, d.confidence, d.difficulty,
        d.lines.map((l) => ({ who: l.who, text: l.text, ...(l.hard ? { hard: true } : {}) })));
    }
    saveLocal(d);
    review.data = null;
    if (next === 'word' && dailyWord) openWord();
    else if (next === 'drill') { openChapter(d.chapter.chapter_id); startDrill(); }
    else show('detail');
  } catch (err) {
    console.warn(err);
    $('#finish-msg').textContent = `저장하지 못했어요. 다시 눌러 주세요. (${errorText(err)})`;
  } finally {
    btn.disabled = false;
    btn.textContent = '완료';
  }
}

document.querySelectorAll('.face').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.face').forEach((b) => b.classList.toggle('selected', b === btn));
    review.data.confidence = Number(btn.dataset.value);
    $('#review-msg').textContent = '';
  });
});
document.querySelectorAll('.choice').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.choice').forEach((b) => b.classList.toggle('selected', b === btn));
    review.data.shared = btn.dataset.value === 'yes';
    $('#share-msg').textContent = '';
  });
});
$('#review-next').addEventListener('click', nextStep);
$('#review-prev').addEventListener('click', () => goStep(review.step - 1));

/* ── 내 기록 보기: 이 휴대폰에 저장된 지난 대화 (최근 100개) ── */

// 자기 평가는 숫자(1~3)로 저장하고 글은 보여 줄 때만 붙인다 → 문구를 바꿔도 예전 기록이 그대로 맞는다 (63단계: 보통이에요 → 무난했어요)
const CONFIDENCE = { 1: '😣 어려웠어요', 2: '🙂 무난했어요', 3: '😄 자신 있어요' };

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}

/** 이름 머리글자 배지 (예: Lucas Martin → LM). size: '' / 'sm' / 'lg' */
function initialsHtml(name, size = '') {
  const initials = String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
  return `<span class="avatar ${size}" aria-hidden="true">${escapeHtml(initials)}</span>`;
}

/* 프로필 캐릭터: 그림 목록은 img/avatars/manifest.json (학생: s01…, 수검자: 시나리오 번호).
   그림이 없으면 머리글자 배지를 쓴다. */
const avatars = { students: {}, patients: {} };
const me = { name: '', avatar: '', course: 'en' };
// 대화 상대를 부르는 말: 영어 과정은 수검자(환자), 중국어 과정은 상대
// 지금 연 챕터의 과정. 선생님은 영어·중국어 챕터를 모두 쓰므로 학생의 과정이 아니라 챕터를 따른다 (30단계).
let viewCourse = '';   // 내 기록을 다시 볼 때 그 기록의 과정
const courseNow = () => viewCourse || (currentChapter && currentChapter.course) || me.course;
const partnerWord = () => (courseNow() === 'en' ? '수검자' : '상대');   // 대화 말풍선의 상대 이름 (63단계: 환자 → 수검자)
const partnerTitle = () => (courseNow() === 'en' ? '수검자' : '상대');

async function loadAvatars() {
  try {
    const res = await fetch('img/avatars/manifest.json');
    const data = await res.json();
    avatars.students = data.students || {};
    avatars.patients = data.patients || {};
  } catch { /* 목록이 없어도 머리글자로 동작 */ }
}

function pictureHtml(path, name, size = '') {
  return path
    ? `<span class="avatar ${size}" aria-hidden="true"><img src="img/avatars/${escapeHtml(path)}" alt=""></span>`
    : initialsHtml(name, size);
}
const studentAvatar = (name, id, size) => pictureHtml(avatars.students[id], name, size);
const patientAvatar = (name, scenarioId, size) => pictureHtml(avatars.patients[scenarioId], name, size);

/** 내 기록의 프로필 자리: 그 대화의 수검자 캐릭터 */
function avatarHtml(entry) {
  return patientAvatar(entry.patient && entry.patient.name, entry.scenarioId);
}

/** 첫 화면 인사: 큰 캐릭터 + 'Kevin 님,' / 'nice to see you!' */
function renderMe() {
  $('#greet-avatar').innerHTML = studentAvatar(me.name, me.avatar);
  $('#greet-name').textContent = me.name ? `${me.name} 님,` : '';
  // 내 캐릭터 화면 위쪽: 지금 캐릭터와 이름 (58단계)
  $('#me-preview').innerHTML = `${studentAvatar(me.name, me.avatar, 'lg')}
    <div><p class="me-preview-label">지금 캐릭터</p><p class="me-preview-name">${escapeHtml(me.name || '')}</p></div>`;
}

/* 내 캐릭터 고르기: 누르면 "이 캐릭터로 바꿀까요?" → 예 → 저장 → "바꿨어요!" → 확인 → 챕터 목록 */
function openAvatarPicker() {
  renderMe();
  const ids = Object.keys(avatars.students).sort();
  const grid = $('#avatar-grid');
  if (!ids.length) {
    grid.innerHTML = '<p class="state" style="grid-column:1/-1">캐릭터 그림을 준비 중이에요. 조금만 기다려 주세요!</p>';
  } else {
    grid.innerHTML = ids.map((id) => `<button class="pick${id === me.avatar ? ' selected' : ''}" data-avatar="${escapeHtml(id)}" aria-label="캐릭터 ${escapeHtml(id)}">
        <img src="img/avatars/${escapeHtml(avatars.students[id])}" alt="" loading="lazy"></button>`).join('') +
      `<button class="pick none${me.avatar ? '' : ' selected'}" data-avatar="">이니셜</button>`;
    grid.querySelectorAll('.pick').forEach((b) => b.addEventListener('click', () => confirmAvatar(b.dataset.avatar)));
  }
  show('avatar');
}

/** 확인 창. pic: 위에 보여 줄 그림 HTML(없으면 ''), buttons: [{ label, cls, onClick, disabled }] */
function showModal(pic, title, text, buttons) {
  $('#modal-pic').innerHTML = pic;
  $('#modal-title').textContent = title;
  $('#modal-text').textContent = text;
  const box = $('#modal-actions');
  box.innerHTML = '';
  buttons.forEach((b) => {
    const el = document.createElement('button');
    el.className = b.cls;
    el.textContent = b.label;
    if (b.disabled) el.disabled = true;
    el.addEventListener('click', b.onClick);
    box.append(el);
  });
  $('#modal').hidden = false;
}
const closeModal = () => { $('#modal').hidden = true; };
const avatarModal = (id, title, text, buttons) => showModal(studentAvatar(me.name, id, 'xl'), title, text, buttons);
const closeAvatarModal = closeModal;

/* ── 마이크 안내 (54단계): 브라우저가 마이크 허용을 묻기 전에, 왜 필요한지 먼저 알려 준다 ──
   허용 상태는 앱을 열 때 미리 알아 둔다. 버튼을 누른 그 순간에 마이크·소리를 켜야 해서(아이폰) 누른 뒤에 기다릴 수 없다.
   상태를 알 수 없는 브라우저(일부 아이폰)는 이 휴대폰에서 한 번만 보여 준다. */
const MIC_INTRO_KEY = 'tutoreal.micIntro';
let micPermission = 'unknown';   // granted / denied / prompt / unknown
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'microphone' }).then((st) => {
    micPermission = st.state;
    st.onchange = () => { micPermission = st.state; };
  }).catch(() => {});
}
const MIC_ICON = '<span class="mic-intro" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg></span>';

/** 마이크를 쓰는 동작(대화 시작, 말하고 확인받기) 앞에 붙인다. 필요하면 안내 창을 먼저 보여 주고, [계속]을 누르면 바로 시작한다. */
function withMicIntro(start) {
  if (micPermission === 'granted') return start();
  if (micPermission === 'denied') {
    return showModal(MIC_ICON, '마이크가 꺼져 있어요',
      '말하기 연습을 하려면 마이크가 필요해요. 아이폰은 설정 → Safari → 마이크에서, 안드로이드는 주소창 왼쪽 아이콘 → 권한에서 마이크를 허용해 주세요.', [
        { label: '닫기', cls: 'secondary', onClick: closeModal },
        { label: '다시 해 보기', cls: 'primary', onClick: () => { closeModal(); start(); } }
      ]);
  }
  let seen = false;
  try { seen = localStorage.getItem(MIC_INTRO_KEY) === '1'; } catch { /* 저장 못 하면 매번 보여 줌 */ }
  if (micPermission === 'unknown' && seen) return start();
  showModal(MIC_ICON, '마이크를 사용할게요',
    '말하기 연습을 하려면 마이크가 필요해요. 다음에 뜨는 창에서 \'허용\'을 눌러 주세요. 녹음한 목소리는 저장하지 않아요.', [
      { label: '나중에', cls: 'secondary', onClick: closeModal },
      { label: '계속', cls: 'primary', onClick: () => {
        try { localStorage.setItem(MIC_INTRO_KEY, '1'); } catch { /* 괜찮음 */ }
        closeModal();
        start();
      } }
    ]);
}

/** 내 캐릭터 화면의 '코드 바꾸기' (53단계 전에는 아래쪽 탭 바): 실수로 누르기 쉬워서 한 번 묻는다 */
function confirmLogout() {
  showModal('', '코드를 바꿀까요?', '이 휴대폰에서 로그아웃되고, 접속 코드를 다시 입력해야 해요. 내 기록은 그대로 남아요.', [
    { label: '아니요', cls: 'secondary', onClick: closeModal },
    { label: '코드 바꾸기', cls: 'primary', onClick: () => { closeModal(); logout(); } }
  ]);
}

function confirmAvatar(id) {
  if (id === me.avatar) return;   // 지금 캐릭터를 다시 누름
  avatarModal(id, id ? '이 캐릭터로 바꿀까요?' : '이니셜로 바꿀까요?', '다른 기기에서도 같은 캐릭터가 보여요.', [
    { label: '아니요', cls: 'secondary', onClick: closeAvatarModal },
    { label: '예, 바꿀게요', cls: 'primary', onClick: () => saveAvatar(id) }
  ]);
}

async function saveAvatar(id) {
  avatarModal(id, '바꾸는 중…', '잠시만 기다려 주세요.', [{ label: '저장 중…', cls: 'primary', disabled: true, onClick() {} }]);
  try {
    await setAvatar(loadCode(), id);
    me.avatar = id;
    renderMe();
    document.querySelectorAll('.pick').forEach((b) => b.classList.toggle('selected', b.dataset.avatar === id));
    avatarModal(id, '프로필 캐릭터를 바꿨어요!', '이름 옆과 선생님 화면에 이 캐릭터가 보여요.', [
      { label: '확인', cls: 'primary', onClick: () => { closeAvatarModal(); show('list'); } }
    ]);
  } catch (err) {
    console.warn(err);
    avatarModal(id, '바꾸지 못했어요', errorText(err), [
      { label: '닫기', cls: 'secondary', onClick: closeAvatarModal },
      { label: '다시 시도', cls: 'primary', onClick: () => saveAvatar(id) }
    ]);
  }
}

function chapterNo(entry) {
  const order = entry.chapterOrder || (chapters.find((c) => c.chapter_id === entry.chapterId) || {}).order;
  return order ? `${order}장` : escapeHtml(entry.chapterTitle || '');
}

function recordMeta(entry) {
  const d = new Date(entry.at);
  const when = `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const parts = [when];
  if (entry.durationSec) parts.push(`${Math.max(1, Math.round(entry.durationSec / 60))}분`);
  if (CONFIDENCE[entry.confidence]) parts.push(CONFIDENCE[entry.confidence]);
  if (!entry.feedback) parts.push('피드백 없음');
  return parts.join(' · ');
}

function openHistory() {
  $('#backup-msg').textContent = '';
  const list = loadHistory();
  renderBackupNudge(list);
  const box = $('#history-list');
  if (!list.length) {
    box.innerHTML = '<p class="state">아직 기록이 없어요. 챕터를 골라 대화를 시작해 보세요.</p>';
  } else {
    box.innerHTML = list.map((e, i) => `
      <button class="record" data-i="${i}">
        ${avatarHtml(e)}
        <span class="record-text">
          <span class="record-title">${chapterNo(e)} · ${escapeHtml((e.patient && e.patient.name) || '')}</span>
          <span class="record-meta">${escapeHtml(recordMeta(e))}</span>
        </span>
        <span class="tag${e.shared ? '' : ' private'}">${e.shared ? '공유' : '나만'}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>`).join('');
    box.querySelectorAll('.record').forEach((btn) => {
      btn.addEventListener('click', () => openRecord(list[Number(btn.dataset.i)]));
    });
  }
  show('history');
}

/* ── 내 기록에서 피드백 받기 (40단계): 피드백이 없는 대화만. 받으면 이 휴대폰의 기록에 저장한다.
   공유한 대화였다면 서버가 시트에도 채운다 (선생님 화면에 반영). ── */
let recordOpen = '';
let recordChapterId = '';   // 지금 열린 기록의 챕터 (82단계, 이어서 연습하기)   // 지금 열려 있는 기록의 대화 번호 (기다리는 사이 다른 기록을 열었는지 확인)

function showRecordNoFeedback(e, message = '', err = null) {
  const box = $('#record-feedback');
  box.innerHTML = `${busyArt(err)}<p class="state">${escapeHtml(message || '이 대화는 아직 피드백이 없어요.')}</p>
    ${e.sessionId ? `<button class="primary" id="record-fb-get">${message ? '다시 시도' : '피드백 받기'}</button>` : ''}`;
  const btn = $('#record-fb-get');
  if (btn) btn.addEventListener('click', () => getRecordFeedback(e));
}

/** 기록의 한 항목을 고쳐 이 휴대폰에 다시 저장한다 (대화 번호로 찾음) */
function updateLocal(sessionId, patch) {
  try {
    const list = loadHistory();
    const item = list.find((x) => x.sessionId === sessionId);
    if (!item) return;
    Object.assign(item, patch);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  } catch { /* 저장 못 해도 화면에는 보인다 */ }
}

async function getRecordFeedback(e) {
  const box = $('#record-feedback');
  // 기다림 화면은 4/4와 같다 (복습 문장은 그 챕터에서). 챕터가 목록에 없으면 문장 없이.
  const chapter = chapters.find((c) => c.chapter_id === e.chapterId) || { course: e.course, checklist: [], drills: [] };
  const stop = startWaitScreen(box, { chapter });
  try {
    const fb = await getFeedback(loadCode(), e.sessionId, (e.lines || []).map((l) => ({ who: l.who, text: l.text })));
    e.feedback = fb;
    updateLocal(e.sessionId, { feedback: fb });
    if (recordOpen !== e.sessionId) return;
    viewCourse = e.course || me.course;
    box.innerHTML = feedbackHtml(fb);
    viewCourse = '';
    $('#record-head .talk-meta').textContent = recordMeta(e);
  } catch (err) {
    console.warn(err);
    if (recordOpen === e.sessionId) showRecordNoFeedback(e, errorText(err), err);
  } finally {
    stop();
  }
}

/* ── 대화 하나 공유·저장 (41단계): 대화와 피드백을 읽기용 글로 만들어 휴대폰의 공유 창에 넘긴다.
   학생이 직접 고른 곳(메모, 카카오톡 나에게 보내기, 메일, 파일 등)에만 간다. 서버를 거치지 않는다.
   공유 창이 없는 브라우저(컴퓨터 등)에서는 글을 복사한다. ── */
let recordEntry = null;   // 지금 열려 있는 기록

/** 기록의 챕터 번호를 글자로 ('2장'). 화면용 chapterNo()는 HTML이라 글에는 쓰지 않는다. */
function plainChapterNo(e) {
  const order = e.chapterOrder || (chapters.find((c) => c.chapter_id === e.chapterId) || {}).order;
  return order ? `${order}장` : '';
}

function recordText(e) {
  viewCourse = e.course || me.course;
  const zh = courseNow() === 'zh';
  const who = (l) => (l.who === 'me' ? '나' : partnerWord());
  const out = ['Tutoreal 대화 기록', `${[plainChapterNo(e), e.chapterTitle].filter(Boolean).join(' · ')} — ${(e.patient && e.patient.name) || ''}`, recordMeta(e)];
  if (e.difficulty) out.push(`어려웠던 점: ${e.difficulty}`);
  out.push('', '[대화]');
  (e.lines || []).forEach((l) => {
    out.push(`${l.hard ? '★ ' : ''}${who(l)}: ${l.text}`);
    const py = zh ? (l.py || localPinyin(l.text)) : '';
    if (py) out.push(`    ${py}`);
    if (l.ko) out.push(`    ${l.ko}`);
  });
  if ((e.lines || []).some((l) => l.hard)) out.push('(★ 어려웠던 부분)');
  out.push('', '[피드백]');
  const fb = e.feedback;
  if (!fb) {
    out.push('아직 피드백이 없어요.');
  } else {
    out.push(fb.summary);
    if ((fb.checklist || []).length) {
      const req = fb.checklist.filter((c) => !c.optional);
      out.push('', `안내 체크리스트 ${req.filter((c) => c.done).length} / ${req.length}`);
      fb.checklist.forEach((c) => out.push(`${c.done ? '✓' : c.optional ? '–' : fb.gentle ? '– (다음엔 이것도)' : '✗'} ${c.item}${c.optional ? ' (선택)' : ''}${c.en ? ` / ${c.en}` : ''}`));
    }
    if (fb.strengths.length) out.push('', '잘한 점', ...fb.strengths.map((x) => `- ${x}`));
    if (fb.fixes.length) {
      out.push('', FIX_TITLE);
      fb.fixes.forEach((f) => out.push(`- 내가 한 말: ${f.said}`, `  → ${f.better}${f.better_py ? ` (${f.better_py})` : ''}`, `  ${f.why}`));
    }
    if (fb.keywords.length) {
      out.push('', `핵심 단어 ${fb.keywords.filter((k) => k.used).length} / ${fb.keywords.length}: ` +
        fb.keywords.map((k) => `${k.used ? '✓' : '✗'} ${k.keyword}`).join(', '));
    }
    if (fb.next_practice.length) {
      out.push('', '다음에 연습할 문장', ...fb.next_practice.map((n) => `- ${n.en}${n.py ? ` (${n.py})` : ''} — ${n.ko}`));
    }
  }
  viewCourse = '';
  return out.join('\n');
}

async function shareRecord() {
  const e = recordEntry;
  if (!e) return;
  const msg = $('#record-share-msg');
  msg.textContent = '';
  const text = recordText(e);
  const title = `Tutoreal ${plainChapterNo(e)} 대화 기록`.replace(/\s+/g, ' ');
  if (navigator.share) {
    try {
      await navigator.share({ title, text });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;   // 공유 창을 닫음
      console.warn(err);
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    msg.textContent = '대화 기록을 복사했어요. 메모나 메신저에 붙여 넣으세요.';
  } catch {
    msg.textContent = '이 브라우저에서는 공유할 수 없어요.';
  }
}

function openRecord(e) {
  recordEntry = e;
  $('#record-share-msg').textContent = '';
  viewCourse = e.course || me.course;   // 이 기록의 과정으로 그린다 (다 그린 뒤 되돌림)
  $('#record-head').innerHTML = `${avatarHtml(e)}
    <div>
      <p class="eyebrow">${chapterNo(e)} · ${escapeHtml(e.chapterTitle || '')}</p>
      <h3>${escapeHtml((e.patient && e.patient.name) || '')}</h3>
      <p class="talk-meta">${escapeHtml(recordMeta(e))}</p>
      ${e.difficulty ? `<p class="talk-meta">어려웠던 점: ${escapeHtml(e.difficulty)}</p>` : ''}
    </div>`;
  recordOpen = e.sessionId;
  if (e.feedback) $('#record-feedback').innerHTML = feedbackHtml(e.feedback);
  else showRecordNoFeedback(e);
  const turns = (e.lines || []).filter((l) => l.text && l.text.trim()).length;
  $('#record-tab-lines').textContent = `💬 대화 전체 (${turns}마디)`;
  setRecordTab('report', false);
  // 다시 보는 화면이므로 환자 말도 가리지 않고 모두 보여 준다.
  // 대화 후 2/4에서 고른 어려웠던 부분은 '어려웠어요'로 표시된다.
  $('#record-lines').innerHTML = (e.lines || []).map((l) => `
    <div class="line ${l.who === 'me' ? 'me' : 'ai'}${l.hard ? ' picked' : ''}">${lineInner(l)}</div>`).join('');
  viewCourse = '';
  // 이 챕터 이어서 연습하기 (82단계): 지금 챕터 목록에 있는 챕터만. 문장 연습이 없으면 다시 대화만
  const c = chapters.find((x) => x.chapter_id === e.chapterId);
  recordChapterId = c ? c.chapter_id : '';
  $('#record-more').hidden = !c;
  $('#record-drill').hidden = !(c && (c.drills || []).length);
  show('record');
  fitPagerHeight();
  showSwipeHintOnce();
}

/* ── 내 기록 상세: 코칭 리포트 / 대화 전체 두 쪽 (61단계 탭, 62단계에 옆으로 넘기기) ──
   터치를 직접 처리한다: 화면 양 끝 20px에서 시작한 터치, 두 손가락, '더 좋은 표현' 카드 넘기기는 무시한다.
   세로로 먼저 움직이면 화면 스크롤로 두고(touch-action: pan-y), 가로로 먼저 움직이면 쪽을 넘긴다.
   두 쪽의 높이가 달라서, 보이는 쪽의 높이에 맞춘다 (안 보이는 쪽 때문에 빈 공간이 생기지 않게). */
const EDGE_PX = 20;
const pager = { index: 0, drag: null };
const PANELS = ['report', 'lines'];

function setPagerPos(pos, animate) {
  $('#record-track').style.transition = animate ? 'transform .28s ease' : 'none';
  $('#record-track').style.transform = `translateX(${-pos * 100}%)`;
  $('#seg-ind').style.transition = animate ? 'transform .28s ease' : 'none';
  $('#seg-ind').style.transform = `translateX(${Math.max(0, Math.min(1, pos)) * 100}%)`;
}
function fitPagerHeight() {
  const panel = document.querySelectorAll('.rec-panel')[pager.index];
  if (panel) $('#record-pager').style.height = `${panel.offsetHeight}px`;
}
function setRecordTab(tab, animate = true) {
  pager.index = Math.max(0, PANELS.indexOf(tab));
  document.querySelectorAll('.seg-tab').forEach((b) => {
    const on = b.dataset.rtab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', String(on));
  });
  document.querySelectorAll('.rec-panel').forEach((p, i) => { p.inert = i !== pager.index; p.setAttribute('aria-hidden', String(i !== pager.index)); });
  setPagerPos(pager.index, animate);
  fitPagerHeight();
  // 아래로 내려가 있었으면 탭이 보이도록 올린다 (다른 쪽의 맨 위부터 보게)
  const tabs = $('#record-tabs');
  if (animate && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
// 내용이 늦게 채워지거나(피드백 받기) 접기를 펼치면 높이가 바뀐다
if (window.ResizeObserver) {
  const ro = new ResizeObserver(() => { if (!views.record.hidden) fitPagerHeight(); });
  document.querySelectorAll('.rec-panel').forEach((p) => ro.observe(p));
}
(() => {
  const el = $('#record-pager');
  el.addEventListener('touchstart', (e) => {
    pager.drag = null;
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX < EDGE_PX || t.clientX > window.innerWidth - EDGE_PX) return;   // 브라우저 '뒤로/앞으로' 몫
    if (e.target.closest('.fb-carousel')) return;                                   // 카드 넘기기 몫
    pager.drag = { x0: t.clientX, y0: t.clientY, t0: Date.now(), dir: '', w: el.clientWidth || 1 };
  }, { passive: true });
  el.addEventListener('touchmove', (e) => {
    const d = pager.drag;
    if (!d || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - d.x0;
    const dy = e.touches[0].clientY - d.y0;
    if (!d.dir) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      d.dir = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'x' : 'y';
      if (d.dir === 'x') hideSwipeHint();
    }
    if (d.dir !== 'x') return;
    d.dx = dx;
    let pos = pager.index - dx / d.w;
    if (pos < 0) pos *= 0.3; else if (pos > PANELS.length - 1) pos = PANELS.length - 1 + (pos - PANELS.length + 1) * 0.3;   // 끝에서는 덜 움직임
    setPagerPos(pos, false);
  }, { passive: true });
  const end = () => {
    const d = pager.drag;
    pager.drag = null;
    if (!d || d.dir !== 'x') return;
    const dx = d.dx || 0;
    const fast = Math.abs(dx) / Math.max(1, Date.now() - d.t0) > 0.5;   // 빠르게 튕기면 짧아도 넘김
    let i = pager.index;
    if (dx < -d.w * 0.2 || (fast && dx < -30)) i += 1;
    else if (dx > d.w * 0.2 || (fast && dx > 30)) i -= 1;
    setRecordTab(PANELS[Math.max(0, Math.min(PANELS.length - 1, i))]);
  };
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
})();

/** 처음 한 번만 (62단계): '옆으로 넘겨서 대화 전체를 볼 수 있어요' + 손가락이 좌우로 움직이는 안내. 2초 뒤 사라진다 */
const SWIPE_HINT_KEY = 'tutoreal.swipeHint';
let swipeHintTimer = 0;
function showSwipeHintOnce() {
  try { if (localStorage.getItem(SWIPE_HINT_KEY) === '1') return; localStorage.setItem(SWIPE_HINT_KEY, '1'); } catch { return; }
  $('#swipe-hint').hidden = false;
  clearTimeout(swipeHintTimer);
  swipeHintTimer = setTimeout(hideSwipeHint, 2200);
}
function hideSwipeHint() {
  clearTimeout(swipeHintTimer);
  $('#swipe-hint').hidden = true;
}

/* ── 문장 연습: 핵심 단어 자리가 빈칸인 문장을 소리 내어 말해 보고 정답을 확인한다 (AI를 쓰지 않음) ──
   sentence의 [대괄호] 부분이 빈칸. 단계: blank(빈칸) / korean(한국어 상황만 보고 문장 전체).
   '어려웠어요'를 누른 문장은 그 회차 끝에 한 번 더 나오고, 다음 회차에는 먼저 나온다 (이 휴대폰에 기억). */

const DRILL_KEY = 'tutoreal.drills';
const drill = {
  level: 'blank', queue: [], pos: 0, revealed: false, hintShown: false, hard: 0, total: 0,
  phase: 'idle', rec: null, timer: null, coach: null, coachError: ''   // 발음 코칭: idle / recording / checking
};
const REC_MAX_MS = 12000;   // 12초가 지나면 녹음을 자동으로 멈춘다
const COACH_TITLE = {
  great: '정확하게 발음했어요! 🎉',
  good: '잘 들려요! 조금만 다듬어 볼까요?',
  retry: '다시 한 번 해 볼까요?'
};
const LEVEL_DESC = {
  blank: '문장 틀을 보면서 핵심 단어를 떠올려요.',
  korean: '상황만 보고 영어 문장을 처음부터 말해요. 실전처럼!'
};
// 과정 언어 이름 (문장 연습 문구에 쓴다)
const langName = () => (courseNow() === 'zh' ? '중국어' : '영어');

function loadDrillMarks() {
  try { return JSON.parse(localStorage.getItem(DRILL_KEY) || '{}'); } catch { return {}; }
}
function saveDrillMark(id, hard) {
  try {
    const marks = loadDrillMarks();
    marks[id] = { hard, at: Date.now() };
    localStorage.setItem(DRILL_KEY, JSON.stringify(marks));
  } catch { /* 저장 못 해도 진행 */ }
}

/** 'Could you tell me your [full name], please?' → [{ text }, { blank: 'full name' }, { text }] */
function parseSentence(s) {
  return s.split(/\[([^\]]+)\]/).map((part, i) => (i % 2 ? { blank: part } : { text: part })).filter((p) => p.blank || p.text);
}
const plainSentence = (s) => s.replace(/\[([^\]]+)\]/g, '$1');

function startDrill() {
  const marks = loadDrillMarks();
  const list = (currentChapter.drills || []).slice();
  // 지난번에 '어려웠어요'였던 문장을 먼저 (나머지는 시트 순서)
  list.sort((a, b) => Number(!!(marks[b.drill_id] || {}).hard) - Number(!!(marks[a.drill_id] || {}).hard));
  drill.queue = list.map((d) => ({ ...d, again: false }));
  drill.pos = 0;
  drill.hard = 0;
  drill.total = list.length;
  drill.coach = null;
  drill.coachError = '';
  cancelRecording();
  $('#drill-back').textContent = `‹ ${currentChapter.order}장`;
  renderDrill();
  show('drill');
}

function renderDrill() {
  document.querySelectorAll('.level').forEach((b) => b.classList.toggle('on', b.dataset.level === drill.level));
  $('#level-desc').textContent = LEVEL_DESC[drill.level].replace('영어', langName());
  const card = $('#drill-card');
  const actions = $('#drill-actions');
  if (drill.pos >= drill.queue.length) {
    $('#drill-count').textContent = '';
    setDrillProgress(1);
    card.innerHTML = `<h3>다 했어요!</h3>
      <p class="goal">${drill.total}문장 중 어려웠던 문장 ${drill.hard}개. 어려웠던 문장은 다음 연습 때 먼저 나와요.</p>`;
    actions.innerHTML = `<button class="secondary" id="drill-again">한 번 더 연습</button>
      ${drill.level === 'blank' ? '<button class="secondary" id="drill-level2">2단계 도전하기 (통째로 말하기)</button>' : ''}
      <button class="primary" id="drill-to-talk">대화 시작하기</button>`;
    $('#drill-again').addEventListener('click', startDrill);
    if ($('#drill-level2')) $('#drill-level2').addEventListener('click', () => { drill.level = 'korean'; startDrill(); });
    $('#drill-to-talk').addEventListener('click', () => { show('detail'); withMicIntro(beginTalk); });
    return;
  }
  const d = drill.queue[drill.pos];
  const parts = parseSentence(d.sentence);
  const firstRound = drill.queue.filter((x) => !x.again).length;
  $('#drill-count').textContent = d.again ? '한 번 더' : `${Math.min(drill.pos + 1, firstRound)} / ${firstRound}`;
  setDrillProgress(d.again ? 1 : Math.min(drill.pos + 1, firstRound) / firstRound);

  let sentence;
  if (drill.revealed) {
    sentence = parts.map((p) => (p.blank ? `<span class="filled">${escapeHtml(p.blank)}</span>` : escapeHtml(p.text))).join('');
  } else if (drill.level === 'blank') {
    sentence = parts.map((p) => (p.blank
      ? p.blank.split(/\s+/).map((w) => `<span class="blank" style="width:${Math.max(2, w.length * 0.6)}em" aria-label="빈칸"></span>`).join(' ')
      : escapeHtml(p.text))).join('');
  } else {
    sentence = '';
  }
  const zh = courseNow() === 'zh';
  // 힌트: 영어는 첫 글자(f___ n___), 중국어는 빈칸 단어의 병음
  const hint = parts.filter((p) => p.blank).map((p) => (zh ? localPinyin(p.blank)
    : p.blank.split(/\s+/).map((w) => w[0] + '_'.repeat(Math.max(0, w.length - 1))).join(' '))).join(' · ');
  // 중국어 1단계: 빈칸이 아닌 부분의 병음을 문장 아래에 (빈칸 자리는 비워 둔다)
  const blankPy = zh && !drill.revealed && drill.level === 'blank'
    ? parts.map((p) => (p.blank ? '<span class="blank py-blank" aria-label="빈칸"></span>' : escapeHtml(localPinyin(p.text)))).join(' ')
    : '';

  const c = drill.coach;
  const coachHtml = c ? `<div class="coach ${c.overall}">
      <p class="coach-title">${COACH_TITLE[c.overall] || COACH_TITLE.retry}</p>
      ${c.message ? `<p class="coach-msg">${escapeHtml(c.message)}</p>` : ''}
      ${c.heard ? `<p class="coach-heard">${zh ? '들린 발음' : '들린 문장'}: "${escapeHtml(c.heard)}"</p>` : ''}
      ${c.words.map((w) => `<p class="coach-word"><b>${escapeHtml(w.word)}</b> → <span class="resp">${escapeHtml(w.respelling)}</span>
        <span class="tip">${escapeHtml(w.tip)}</span></p>`).join('')}
    </div>` : '';

  card.innerHTML = `
    ${coachHtml}
    <p class="situation-label">상황</p>
    <p class="situation">${escapeHtml(d.situation)}</p>
    ${sentence ? `<p class="sentence-label">${drill.revealed ? '정답' : `${langName()} 문장`}</p><p class="sentence">${sentence}</p>` : ''}
    ${blankPy ? `<p class="drill-py">${blankPy}</p>` : ''}
    ${drill.revealed ? (d.pron ? (zh ? `<p class="drill-py">${escapeHtml(d.pron)}</p>` : `<p class="drill-pron">발음: ${escapeHtml(d.pron)}</p>`) : '')
      : drill.phase === 'recording' ? `<p class="recording">${METER_HTML}<span>듣고 있어요. 문장을 말한 뒤 "다 말했어요"를 눌러 주세요.</span></p>`
      : drill.phase === 'checking' ? '<p class="drill-say">발음을 확인하는 중…</p>'
      : `<p class="drill-say">${drill.level === 'blank' ? '소리 내어 문장 전체를 말해 보세요.' : `${langName()} 문장 전체를 소리 내어 말해 보세요.`}</p>
         ${drill.hintShown ? `<p class="drill-hint">${escapeHtml(hint)}</p>` : ''}`}
    ${drill.coachError ? `<p class="hint">${escapeHtml(drill.coachError)}</p>` : ''}`;

  if (drill.phase === 'recording') {
    actions.innerHTML = '<button class="primary" id="rec-stop">다 말했어요</button><button class="secondary" id="rec-cancel">취소</button>';
    $('#rec-stop').addEventListener('click', stopCoach);
    $('#rec-cancel').addEventListener('click', () => { cancelRecording(); renderDrill(); });
  } else if (drill.phase === 'checking') {
    actions.innerHTML = '';
  } else if (!drill.revealed) {
    actions.innerHTML = `<button class="primary" id="rec-start">🎤 말하고 확인받기</button>
      <div class="row">${drill.hintShown ? '' : `<button class="secondary" id="drill-hint">${zh ? '힌트 (병음)' : '힌트 (첫 글자)'}</button>`}
      <button class="secondary" id="drill-reveal">정답 보기</button></div>`;
    $('#rec-start').addEventListener('click', () => withMicIntro(startCoach));
    if ($('#drill-hint')) $('#drill-hint').addEventListener('click', () => { drill.hintShown = true; renderDrill(); });
    $('#drill-reveal').addEventListener('click', () => { drill.revealed = true; drill.coachError = ''; renderDrill(); speak(plainSentence(d.sentence)); });
  } else {
    actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">🔊 다시 듣기</button>
      <button class="secondary" id="rec-start">🎤 다시 말해 보기</button></div>
      <div class="row"><button class="secondary" id="drill-hard">어려웠어요</button>
      <button class="primary" id="drill-easy">쉬웠어요</button></div>`;
    $('#drill-listen').addEventListener('click', () => speak(plainSentence(d.sentence)));
    $('#rec-start').addEventListener('click', () => withMicIntro(startCoach));
    $('#drill-hard').addEventListener('click', () => nextDrill(true));
    $('#drill-easy').addEventListener('click', () => nextDrill(false));
  }
}

/* 발음 코칭: 녹음 → 서버 → AI 코칭. 소리는 저장하지 않는다. */
async function startCoach() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  drill.coachError = '';
  const rec = new Recorder();
  rec.onLevel = makeMeter(() => $('#drill-card .recording .voice-meter'));   // 내 목소리 막대 (55단계)
  drill.rec = rec;
  drill.phase = 'recording';
  renderDrill();
  try {
    await rec.start();
    if (drill.rec !== rec) return rec.cancel();   // 그사이 취소됨
    drill.timer = setTimeout(stopCoach, REC_MAX_MS);
  } catch (err) {
    console.warn(err);
    cancelRecording();
    drill.coachError = errorText(err);
    renderDrill();
  }
}

async function stopCoach() {
  const rec = drill.rec;
  if (!rec || drill.phase !== 'recording') return;
  clearTimeout(drill.timer);
  drill.rec = null;
  const { base64, seconds } = rec.stop();
  if (seconds < 0.5) {
    drill.phase = 'idle';
    drill.coachError = '목소리가 거의 녹음되지 않았어요. 다시 해 주세요.';
    return renderDrill();
  }
  const d = drill.queue[drill.pos];
  drill.phase = 'checking';
  renderDrill();
  try {
    drill.coach = await checkPronunciation(loadCode(), d.drill_id, drill.level, base64);
    drill.revealed = true;   // 코칭과 함께 정답 문장을 보여 준다
  } catch (err) {
    console.warn(err);
    drill.coachError = errorText(err);
  }
  if (drill.queue[drill.pos] !== d) return;   // 그사이 다른 문장으로 넘어감
  drill.phase = 'idle';
  renderDrill();
}

function cancelRecording() {
  clearTimeout(drill.timer);
  if (drill.rec) drill.rec.cancel();
  drill.rec = null;
  drill.phase = 'idle';
}

function nextDrill(hard) {
  const d = drill.queue[drill.pos];
  if (!d.again) {
    saveDrillMark(d.drill_id, hard);
    if (hard) { drill.hard++; drill.queue.push({ ...d, again: true }); }   // 어려웠던 문장은 끝에 한 번 더
  }
  drill.pos++;
  drill.revealed = false;
  drill.hintShown = false;
  drill.coach = null;
  drill.coachError = '';
  renderDrill();
}

/* 휴대폰 읽기 음성 목록 (64단계). 아이폰은 언어(lang)만 정하면 소리 없이 끝나는 일이 있어 음성을 직접 고른다.
   목록은 늦게 채워지기도 해서 바뀔 때마다 다시 읽는다. */
let ttsVoices = [];
function loadVoices() {
  try { ttsVoices = speechSynthesis.getVoices() || []; } catch (e) { ttsVoices = []; }
}
if ('speechSynthesis' in window) {
  loadVoices();
  if (speechSynthesis.addEventListener) speechSynthesis.addEventListener('voiceschanged', loadVoices);
}
/** lang(예: zh-CN)에 맞는 음성. 같은 언어·지역 → 같은 언어(zh-TW 등) 순서로 찾고, 없으면 null. */
function pickVoice(lang) {
  if (!ttsVoices.length) loadVoices();
  const norm = (l) => String(l || '').replace('_', '-').toLowerCase();
  const want = lang.toLowerCase();
  const base = want.split('-')[0];
  return ttsVoices.find((v) => norm(v.lang) === want && v.localService)
    || ttsVoices.find((v) => norm(v.lang) === want)
    || ttsVoices.find((v) => norm(v.lang).startsWith(base + '-'))
    || null;
}

/** 휴대폰 음성으로 읽어 준다 (무료, 인터넷 불필요). 읽기 시작한 말(끝났을 때 알림용)을 돌려준다. 음성 기능이 없으면 null. */
function speak(text, course = courseNow()) {
  if (!('speechSynthesis' in window)) return null;
  const u = new SpeechSynthesisUtterance(text);
  // 중국어 과정은 휴대폰의 중국어 음성으로 조금 더 천천히
  u.lang = course === 'zh' ? 'zh-CN' : 'en-US';
  u.rate = course === 'zh' ? 0.8 : 0.9;
  const voice = pickVoice(u.lang);
  if (voice) { u.voice = voice; u.lang = voice.lang; }
  // 아이폰: cancel() 바로 뒤의 speak()는 소리 없이 넘어가는 일이 있다. 읽는 중일 때만 멈추고 잠깐 뒤에 읽는다.
  if (speechSynthesis.speaking || speechSynthesis.pending) {
    speechSynthesis.cancel();
    setTimeout(() => speechSynthesis.speak(u), 120);
  } else {
    speechSynthesis.speak(u);
  }
  return u;
}
const SPEAKER_ICON = '<svg class="say-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>';

/** 문장 연습 진행 막대 (56단계): 0~1. '1 / 5' 아래에 보인다. */
function setDrillProgress(ratio) {
  $('#drill-progress i').style.width = `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%`;
}

/* ── 선생님 화면: 시트 summary 탭과 같은 계산 결과 (선생님 코드만) ── */
// 학생 상세는 지금은 요약에 있는 숫자로만 그린다. 나중에 학생 한 명의 공유 기록(피드백·대화)을 주는 요청을 따로 추가해
// openStudent() 아래에 '공유된 대화' 목록을 붙인다 (모양은 내 기록 보기와 같게).

let teacherData = null;
let teacherCourse = '';   // 선생님 요약에서 보고 있는 과정 (en/zh). 비우면 서버가 정한다

const chapterLabel = (c) => `${c.order}장 ${c.title}`;
const confText = (v) => (v === null || v === undefined ? '–' : v);

async function openTeacher(refresh = false) {
  const btn = $('#teacher-refresh');
  $('#teacher-msg').textContent = '';
  if (refresh) {
    btn.disabled = true;
    btn.textContent = '정리하는 중… (1분쯤 걸릴 수 있어요)';
  } else {
    $('#teacher-period').textContent = '';
    $('#teacher-body').innerHTML = skeleton('teacher', '요약을 불러오는 중…');
    show('teacher');
  }
  try {
    teacherData = await getSummary(loadCode(), refresh, teacherCourse);
    teacherCourse = teacherData.course || '';
    renderTeacher();
  } catch (err) {
    console.warn(err);
    if (refresh) $('#teacher-msg').textContent = `정리하지 못했어요. (${errorText(err)})`;
    else $('#teacher-body').innerHTML = `<p class="state">${escapeHtml(errorText(err))}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = '새로 정리하기';
  }
}

function renderTeacher() {
  const s = teacherData;
  // 두 줄로 (51단계): 기간 / 만든 시각. 한 줄에 이어 쓰면 휴대폰에서 '기준'이 '기 / 준'처럼 끊겼다
  $('#teacher-period').innerHTML = `${escapeHtml(s.period.label)}<br>${escapeHtml(s.generated_at)} 기준`;
  // 과정이 둘 이상이면 위에 과정 고르기 (영어 / 중국어)
  const courses = s.courses || [];
  $('#teacher-body').innerHTML = `
    ${courses.length > 1 ? `<div class="levels" role="group" aria-label="과정">${courses.map((c) => `
      <button class="level${c.course === s.course ? ' on' : ''}" data-course="${escapeHtml(c.course)}">${escapeHtml(c.label)} 과정</button>`).join('')}</div>` : ''}
    <div class="card t-card">
      <div class="tiles">
        <span><span class="tile-n">${s.totals.students}</span><span class="tile-l">연습한 학생</span></span>
        <span><span class="tile-n">${s.totals.count}회</span><span class="tile-l">연습</span></span>
        <span><span class="tile-n">${s.totals.minutes}분</span><span class="tile-l">시간</span></span>
      </div>
      <p class="t-note">학생 연습만 셉니다 (선생님·테스트 계정 제외)<br>예상 비용 $${s.totals.cost_usd} (테스트 포함)</p>
    </div>
    <div class="card t-card">
      <h3>학생</h3>
      ${s.studentStats.map((st) => `
        <button class="trow" data-student="${escapeHtml(st.student_id)}">
          <span>${studentAvatar(st.name, st.avatar, 'sm')}${escapeHtml(st.name)} ›</span>
          <span class="t-meta">${st.count ? `${st.count}회 ${st.minutes}분 · ${escapeHtml(st.chapters.join(', '))}` : '연습 없음'}</span>
        </button>`).join('')}
    </div>
    <div class="card t-card">
      <h3>챕터</h3>
      ${s.chapterStats.map((c) => `
        <button class="trow" data-chapter="${escapeHtml(c.chapter_id)}">
          <span>${escapeHtml(chapterLabel(c))} ›</span>
          <span class="t-meta">${c.students}명 · ${c.count}회</span>
        </button>`).join('')}
    </div>`;
  document.querySelectorAll('#teacher-body [data-course]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.course === teacherCourse) return;
    teacherCourse = b.dataset.course;
    openTeacher(false);
  }));
  document.querySelectorAll('[data-student]').forEach((b) => b.addEventListener('click', () => openStudent(b.dataset.student)));
  document.querySelectorAll('[data-chapter]').forEach((b) => b.addEventListener('click', () => openTChapter(b.dataset.chapter)));
}

function openTChapter(id) {
  const c = teacherData.chapterStats.find((x) => x.chapter_id === id);
  if (!c) return;
  const kw = c.keywords.map((k) => {
    const pct = k.total ? Math.round((k.used / k.total) * 100) : null;
    return `<div class="kw"><span class="kw-label"><span>${escapeHtml(k.keyword)}</span>
      <span class="t-meta">${pct === null ? '–' : `${pct}% (${k.used}/${k.total})`}</span></span>
      <div class="bar"><i style="width:${pct || 0}%"></i></div></div>`;
  }).join('');
  const ins = c.insight;
  $('#tchapter-body').innerHTML = `
    <div class="card t-card">
      <p class="eyebrow">${c.order}장</p>
      <h3>${escapeHtml(c.title)}</h3>
      <p class="talk-meta">학생 ${c.students}명 · ${c.count}회 · ${c.minutes}분 · 공유 ${c.shared}개 · 자기 평가 ${confText(c.confidence)}</p>
    </div>
    ${c.shared ? `
    <div class="card t-card"><h3>핵심 단어 사용률</h3>${kw}<p class="t-note">공유된 대화 ${c.shared}개 기준</p></div>
    <div class="card t-card"><h3>AI 정리</h3>
      ${ins ? `
        <p class="fb-title">자주 틀린 표현</p>
        ${ins.common_mistakes.map((m) => `<div class="fb-fix">
          <p class="fb-better">${escapeHtml(m.point)} (${m.count}회)</p>
          <p class="fb-said">${escapeHtml(m.example)}</p>
          <p class="fb-why">→ ${escapeHtml(m.better)}</p></div>`).join('')}
        <p class="fb-title">수업 포인트</p>
        <ul class="fb-list">${ins.teaching_points.map((p) => `<li>${escapeHtml(p)}</li>`).join('')}</ul>
        <p class="t-note">공유된 대화 ${ins.shared}개 기준 · ${escapeHtml(ins.at)}</p>`
      : '<p class="state">아직 AI 정리가 없어요. 요약 화면의 \'새로 정리하기\'를 눌러 주세요.</p>'}
    </div>
    ${c.difficulties.length ? `<div class="card t-card"><h3>어려웠던 점</h3>
      <ul class="fb-list">${c.difficulties.map((d) => `<li>${escapeHtml(d.student)}: ${escapeHtml(d.text)}</li>`).join('')}</ul></div>` : ''}`
    : '<div class="card t-card"><p class="state">이 기간에 공유된 대화가 없어요.</p></div>'}`;
  show('tchapter');
}

function openStudent(id) {
  const s = teacherData;
  const st = s.studentStats.find((x) => x.student_id === id);
  if (!st) return;
  const row = s.matrix[id] || {};
  const notes = [];
  s.chapterStats.forEach((c) => c.difficulties.filter((d) => d.student_id === id)
    .forEach((d) => notes.push(`${c.order}장: ${d.text}`)));
  $('#tstudent-body').innerHTML = `
    <div class="card t-card t-head">
      ${studentAvatar(st.name, st.avatar, 'lg')}
      <div>
        <h3>${escapeHtml(st.name)}</h3>
        <p class="talk-meta">${st.count}회 · ${st.minutes}분 · 자기 평가 ${confText(st.confidence)} · 공유 ${st.shared}개</p>
      </div>
    </div>
    <div class="card t-card">
      <h3>챕터별 연습</h3>
      ${s.chapters.map((c) => {
        const cell = row[c.chapter_id];
        return `<div class="trow static"><span>${escapeHtml(chapterLabel(c))}</span>
          <span class="t-meta">${cell ? `${cell.count}회 ${Math.round(cell.sec / 60)}분` : '–'}</span></div>`;
      }).join('')}
    </div>
    ${notes.length ? `<div class="card t-card"><h3>어려웠던 점</h3>
      <ul class="fb-list">${notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul></div>` : ''}
    <div class="card t-card"><h3>공유된 대화</h3><div id="tstudent-talks">${skeleton('rows', '공유된 대화를 불러오는 중…')}</div></div>`;
  show('tstudent');
  loadStudentTalks(id, st.name);
}

/* ── 선생님: 학생이 공유한 대화 (37단계). 요약 기간과 관계없이 최근 20개. 공유하지 않은 대화는 서버가 보내지 않는다. ── */

let studentTalks = { id: '', name: '', talks: [] };
const shortDate = (at) => { const m = /^\d{4}-(\d{2})-(\d{2}) (\d{2}:\d{2})/.exec(at || ''); return m ? `${Number(m[1])}월 ${Number(m[2])}일 ${m[3]}` : at || ''; };
const talkMinutes = (t) => (t.duration_sec ? `${Math.max(1, Math.round(t.duration_sec / 60))}분` : '');

async function loadStudentTalks(id, name) {
  const box = $('#tstudent-talks');
  try {
    const talks = await getStudentTalks(loadCode(), id);
    if (box !== $('#tstudent-talks')) return;   // 그사이 다른 학생을 열었음
    studentTalks = { id, name, talks };
    box.innerHTML = talks.length ? talks.map((t, i) => {
      const hard = t.lines.filter((l) => l.hard).length;
      const meta = [shortDate(t.at), talkMinutes(t), t.confidence ? CONFIDENCE[t.confidence].split(' ')[0] : '', hard ? `어려운 부분 ${hard}` : '']
        .filter(Boolean).join(' · ');
      return `<button class="trow" data-talk="${i}">
          <span>${t.chapter_order ? `${escapeHtml(t.chapter_order)}장 · ` : ''}${escapeHtml(t.partner || t.chapter_title)} ›</span>
          <span class="t-meta">${escapeHtml(meta)}</span>
        </button>`;
    }).join('') + (talks.length >= 20 ? '<p class="t-note">최근 20개까지 보여요.</p>' : '')
      : '<p class="state">아직 공유된 대화가 없어요.</p>';
    box.querySelectorAll('[data-talk]').forEach((b) => b.addEventListener('click', () => openTSession(talks[Number(b.dataset.talk)])));
  } catch (err) {
    console.warn(err);
    box.innerHTML = `<p class="state">${escapeHtml(errorText(err))}</p>`;
  }
}

/** 공유된 대화 하나: 자기 평가·어려웠던 점, 피드백(공유할 때 저장된 그대로), 대화 전체(학생이 고른 줄은 '어려웠어요') */
function openTSession(t) {
  viewCourse = t.course || 'en';   // 이 대화의 과정으로 그린다 (중국어면 병음, '상대')
  const hard = t.lines.filter((l) => l.hard).length;
  $('#tsession-body').innerHTML = `
    <div class="card t-card record-head">
      ${patientAvatar(t.partner, t.scenario_id)}
      <div>
        <p class="eyebrow">${escapeHtml(studentTalks.name)} · ${t.chapter_order ? `${escapeHtml(t.chapter_order)}장 ` : ''}${escapeHtml(t.chapter_title)}</p>
        <h3>${escapeHtml(t.partner)}</h3>
        <p class="talk-meta">${escapeHtml([shortDate(t.at), talkMinutes(t), CONFIDENCE[t.confidence] || ''].filter(Boolean).join(' · '))}</p>
        ${t.difficulty ? `<p class="talk-meta">어려웠던 점: ${escapeHtml(t.difficulty)}</p>` : ''}
      </div>
    </div>
    <div class="card t-card"><h3>피드백</h3>
      ${t.feedback ? feedbackHtml(t.feedback) : '<p class="state">이 대화는 피드백이 저장되지 않았어요.</p>'}</div>
    <div class="card t-card"><h3>대화 전체</h3>
      ${hard ? `<p class="t-note">학생이 어려웠다고 고른 부분 ${hard}개</p>` : ''}
      <div class="transcript">${t.lines.map((l) => `<div class="line ${l.who === 'me' ? 'me' : 'ai'}${l.hard ? ' picked' : ''}">${lineInner(l)}</div>`).join('')
        || '<p class="state">저장된 대화 글자가 없어요.</p>'}</div>
    </div>`;
  viewCourse = '';
  show('tsession');
}

/* ── 화면 모드: 자동(휴대폰 설정) → 라이트 → 다크. 이 휴대폰에만 기억한다 (index.html이 그리기 전에 먼저 적용) ── */

const THEME_KEY = 'tutoreal.theme';
const THEMES = {
  auto: { label: '자동', next: 'light', icon: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 0 0 16z" fill="currentColor"/>' },
  light: { label: '라이트', next: 'dark', icon: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>' },
  dark: { label: '다크', next: 'auto', icon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>' }
};

function currentTheme() {
  const t = document.documentElement.dataset.theme;
  return t === 'light' || t === 'dark' ? t : 'auto';
}

function renderThemeBtn() {
  const t = THEMES[currentTheme()];
  $('#theme-btn').innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${t.icon}</svg><span>${t.label}</span>`;
  $('#theme-btn').setAttribute('aria-label', `화면 모드: ${t.label}. 눌러서 ${THEMES[t.next].label}(으)로 바꾸기`);
}

function nextTheme() {
  const next = THEMES[currentTheme()].next;
  if (next === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = next;
  try { next === 'auto' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, next); } catch { /* 기억 못 해도 동작 */ }
  renderThemeBtn();
}

/* ── 시작 ── */

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const code = $('#login-code').value.trim();
  if (!code) {
    $('#login-msg').textContent = '접속 코드를 입력해 주세요.';
    return;
  }
  enter(code);
});
// 아래쪽 탭 바
const TAB_ACTION = {
  list: () => show('list'), history: openHistory, avatar: openAvatarPicker,
  teacher: () => openTeacher(false)
};
$('#avatar-logout').addEventListener('click', confirmLogout);   // 53단계: 탭 바에서 내 캐릭터 화면으로 옮김
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => TAB_ACTION[b.dataset.tab]()));
$('#greet-avatar').addEventListener('click', openAvatarPicker);
$('#drill-open').addEventListener('click', startDrill);
document.querySelectorAll('.diff-tab').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));
$('#drill-back').addEventListener('click', () => { if (window.speechSynthesis) speechSynthesis.cancel(); cancelRecording(); show('detail'); });
document.querySelectorAll('.level').forEach((b) => b.addEventListener('click', () => {
  cancelRecording();
  drill.level = b.dataset.level;
  drill.revealed = false;
  drill.hintShown = false;
  drill.coach = null;
  drill.coachError = '';
  renderDrill();
}));

$('#teacher-refresh').addEventListener('click', () => openTeacher(true));
$('#tchapter-back').addEventListener('click', () => show('teacher'));
$('#tstudent-back').addEventListener('click', () => show('teacher'));
$('#tsession-back').addEventListener('click', () => show('tstudent'));

$('#record-back').addEventListener('click', openHistory);
// 내 기록에서 이 챕터 이어서 연습하기 (82단계). 다시 대화는 누른 이 순간에 시작한다 (iOS는 버튼을 누를 때만 소리를 켤 수 있다)
$('#record-drill').addEventListener('click', () => { openChapter(recordChapterId); startDrill(); });
$('#record-again').addEventListener('click', () => { openChapter(recordChapterId); withMicIntro(beginTalk); });
$('#record-share').addEventListener('click', shareRecord);
// 피드백 안의 발음 듣기 버튼 (61단계): 4/4, 내 기록, 선생님 화면 어디서든
document.addEventListener('click', (ev) => {
  const b = ev.target.closest('.say-btn');
  if (!b) return;
  document.querySelectorAll('.say-btn.speaking').forEach((x) => x.classList.remove('speaking'));
  const u = speak(b.dataset.say, b.dataset.course || undefined);
  if (!u) return;
  b.classList.add('speaking');
  u.onend = u.onerror = () => b.classList.remove('speaking');
});
// 내 기록 상세의 탭 (61단계): 코칭 리포트 / 대화 전체
document.querySelectorAll('.seg-tab').forEach((b) => b.addEventListener('click', () => setRecordTab(b.dataset.rtab)));
$('#backup-export').addEventListener('click', exportBackup);
$('#backup-nudge-go').addEventListener('click', exportBackup);
$('#backup-import').addEventListener('click', () => { $('#backup-file').value = ''; $('#backup-file').click(); });
$('#backup-file').addEventListener('change', (ev) => { const f = ev.target.files && ev.target.files[0]; if (f) importBackup(f); });
$('#back').addEventListener('click', () => show('list'));
$('#talk-start').addEventListener('click', () => withMicIntro(beginTalk));
$('#talk-end').addEventListener('click', () => { if (live) { talk.endReason = 'user'; live.stop(''); } });
$('#talk-back').addEventListener('click', () => show('detail'));
$('#talk-next').addEventListener('click', openReview);
window.addEventListener('pagehide', () => { if (live) { talk.endReason = 'left'; live.stop(''); } });

/* ── 오늘의 단어 (67단계) ──
   Wordle처럼 5글자 영어 단어를 6번 안에 맞힌다. 하루 한 단어, 모든 학생이 같은 단어 (서버가 한국 시간 기준으로 정함).
   사전에 있는 영어 단어만 입력할 수 있다 (76단계: 'AEIOU' 같은 글자 탐색 꼼수를 막는다). 사전은 data/words5.txt.
   힌트 (73단계): 3번째 시도부터 쉬운 영어 설명을 볼 수 있다 (그 전에는 잠김). 설명이 없는 단어는 글자 하나를 알려 준다.
   한국어 뜻은 너무 쉬워서 힌트로 쓰지 않고, 다 푼 뒤에만 보인다.
   푼 기록과 연속 기록은 이 휴대폰에만 저장한다. AI를 쓰지 않아 비용이 없다. */
const WORD_LEN = 5;
const WORD_TRIES = 6;
const WORD_HINT_AFTER = 2;   // 2번 틀린 뒤, 곧 3번째 시도부터 힌트가 열린다
const WORD_KEY = 'tutoreal.word';         // 오늘 푼 상태 { no, guesses, hint, done, won, pick(보여 줄 수업 문장 번호), replay(시험용 다시 하기) }
const WORD_STATS_KEY = 'tutoreal.wordstats';   // { played, won, streak, best, lastWonNo }
const WORD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
const WORD_MARK = { correct: '🟩', present: '🟨', absent: '⬜' };
const WORD_SAY = { correct: '자리까지 맞음', present: '다른 자리에 있음', absent: '없음' };
let dailyWord = null;   // 서버가 준 오늘의 단어 { no, date, word, meaning, hint, sentence, sentences, preview, test_account } (없으면 null)
let wordTyping = '';
// 입력할 수 있는 단어 (76단계): 게임 화면을 처음 열 때 한 번 불러온다. 못 불러오면 null → 사전 확인 없이 받는다 (게임은 계속되게)
let wordDict = null;
let wordDictLoading = null;
function loadWordDict() {
  if (!wordDictLoading) {
    wordDictLoading = fetch('data/words5.txt')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('HTTP_' + r.status))))
      .then((t) => { wordDict = new Set(t.split(/\s+/).filter(Boolean)); })
      .catch((err) => { console.warn('단어 사전을 불러오지 못했어요', err); wordDictLoading = null; });
  }
  return wordDictLoading;
}
let wordChecking = false;   // 사전을 기다리는 중 (확인을 두 번 눌러도 한 번만)
// 발음 듣기 버튼: 단어 게임은 늘 영어 음성으로 (선생님이 중국어 챕터를 보던 중이어도)
const wordSayBtn = (text, label) =>
  `<button type="button" class="say-btn" data-say="${escapeHtml(text)}" data-course="en" aria-label="${escapeHtml(label)}">${SPEAKER_ICON}</button>`;

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}
function saveJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 저장 못 해도 게임은 된다 */ }
}
/** 오늘 단어의 푼 상태. 저장된 것이 다른 날 단어면 새로 시작한다. */
function wordState() {
  const st = loadJson(WORD_KEY, null);
  if (st && dailyWord && st.no === dailyWord.no) {
    // 잠금 전에 연 힌트(예전 버전의 기록)는 없던 것으로: 3번째 시도부터 다시 눌러서 연다 (74단계)
    if (st.hint && st.guesses.filter((g) => g !== dailyWord.word).length < WORD_HINT_AFTER) st.hint = false;
    return st;
  }
  return { no: dailyWord ? dailyWord.no : 0, guesses: [], hint: false, done: false, won: false };
}
function wordStats() {
  return { played: 0, won: 0, streak: 0, best: 0, lastWonNo: 0, ...loadJson(WORD_STATS_KEY, {}) };
}
/** 지금 이어지는 연속 기록: 어제나 오늘 맞혔을 때만 이어진다. */
function currentStreak(stats) {
  return dailyWord && stats.lastWonNo >= dailyWord.no - 1 ? stats.streak : 0;
}
const wordDoneToday = () => !!dailyWord && wordState().done;

/** 한 줄 채점 (Wordle 규칙): 같은 글자가 여러 번이면 정답에 있는 개수만큼만 노랑·초록 */
function scoreGuess(guess, answer) {
  const res = Array(WORD_LEN).fill('absent');
  const left = {};
  for (let i = 0; i < WORD_LEN; i++) {
    if (guess[i] === answer[i]) res[i] = 'correct';
    else left[answer[i]] = (left[answer[i]] || 0) + 1;
  }
  for (let i = 0; i < WORD_LEN; i++) {
    if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
  }
  return res;
}

/** 챕터 목록 맨 위 카드. 안 풀었으면 권하는 카드, 다 풀면 한 줄로 줄어든다. */
function renderWordCard() {
  const box = $('#word-card-box');
  if (!dailyWord) { box.innerHTML = ''; return; }
  const st = wordState();
  const streak = currentStreak(wordStats());
  const fire = streak > 0 ? `<span class="word-streak">🔥 ${streak}</span>` : '';
  // 미리 보기 (시트 daily_word_published가 preview): 선생님·테스터에게만 보내진다
  const tag = dailyWord.preview ? ' <span class="opt-tag preview-tag">미리 보기</span>' : '';
  box.innerHTML = st.done
    ? `<button class="word-card done" id="word-card">
        <span>✓ 오늘의 단어 #${dailyWord.no} · ${st.won ? st.guesses.length : 'X'}/${WORD_TRIES}${tag}</span>${fire}<span class="chevron" aria-hidden="true">›</span>
      </button>`
    : `<button class="word-card" id="word-card">
        <span class="word-card-text">
          <span class="eyebrow">🎮 오늘의 게임</span>
          <span class="word-card-title">오늘의 단어 #${dailyWord.no}${tag}</span>
          <span class="word-card-sub">5글자 영어 단어 맞히기 · 한 판 쉬어 가기</span>
        </span>${fire}<span class="chevron" aria-hidden="true">›</span>
      </button>`;
  $('#word-card').addEventListener('click', openWord);
}

function openWord() {
  if (!dailyWord) return;
  loadWordDict();
  wordTyping = '';
  $('#word-no').textContent = `#${dailyWord.no} · ${dailyWord.date}`;
  $('#word-msg').textContent = '';
  renderWord();
  show('word');
}

/** pending: 방금 낸 줄을 아직 색 없이 그린다 (뒤집히는 동안. 키보드 색·힌트·끝 화면도 그 줄을 빼고) */
function renderWord(pending = false) {
  const st = wordState();
  const answer = dailyWord.word;
  const shown = pending ? st.guesses.slice(0, -1) : st.guesses;
  const pend = pending ? st.guesses[st.guesses.length - 1] : '';
  const done = st.done && !pending;
  const rows = [];
  for (let r = 0; r < WORD_TRIES; r++) {
    const g = shown[r];
    const pendRow = !!pend && r === shown.length;
    const typing = !g && !pend && r === shown.length && !done ? wordTyping : '';
    const marks = g ? scoreGuess(g, answer) : null;
    const cells = [];
    for (let i = 0; i < WORD_LEN; i++) {
      const ch = g ? g[i] : pendRow ? pend[i] : typing[i] || '';
      const cls = marks ? marks[i] : ch ? 'filled' : '';
      const label = ch ? `${ch.toUpperCase()}${marks ? ' ' + WORD_SAY[marks[i]] : ''}` : '빈칸';
      cells.push(`<span class="word-tile ${cls}" role="img" aria-label="${label}">${escapeHtml(ch.toUpperCase())}</span>`);
    }
    rows.push(`<div class="word-row${typing && r === shown.length ? ' now' : ''}">${cells.join('')}</div>`);
  }
  $('#word-grid').innerHTML = rows.join('');
  // 키보드: 글자마다 지금까지 가장 좋은 결과 색 (초록 > 노랑 > 회색)
  const best = {};
  const rank = { absent: 1, present: 2, correct: 3 };
  shown.forEach((g) => scoreGuess(g, answer).forEach((m, i) => {
    if (!best[g[i]] || rank[m] > rank[best[g[i]]]) best[g[i]] = m;
  }));
  $('#word-keys').hidden = done;
  $('#word-keys').innerHTML = WORD_ROWS.map((row, i) => `<div class="word-key-row">
      ${i === 2 ? '<button class="word-key wide" data-key="enter" aria-label="확인">확인</button>' : ''}
      ${[...row].map((k) => `<button class="word-key ${best[k] || ''}" data-key="${k}" aria-label="${k.toUpperCase()}${best[k] ? ' ' + WORD_SAY[best[k]] : ''}">${k.toUpperCase()}</button>`).join('')}
      ${i === 2 ? '<button class="word-key wide" data-key="back" aria-label="지우기">⌫</button>' : ''}
    </div>`).join('');
  const wrong = shown.filter((g) => g !== answer).length;
  // 힌트 버튼: 다 풀거나 이미 본 뒤에는 숨기고, 3번째 시도 전에는 잠근 채 보여 준다
  const hintBtn = $('#word-hint');
  const locked = wrong < WORD_HINT_AFTER;
  hintBtn.hidden = done || pending || hintOpen(st);
  hintBtn.disabled = locked;
  hintBtn.classList.toggle('locked', locked);
  hintBtn.textContent = locked ? `🔒 힌트 · ${WORD_HINT_AFTER + 1}번째 시도부터 열려요` : '💡 힌트 보기';
  if (hintOpen(st) && !done) $('#word-msg').textContent = wordHintText(st);
  renderWordEnd({ ...st, done });
}

/* 칸 뒤집기 (70단계): 공항·기차역 출발 안내판(split-flap)처럼 위쪽 반이 아래로 접히며 다음 글자가 나온다.
   칸마다 조금씩 늦게 시작해, 무작위 글자를 몇 번 넘긴 뒤 진짜 글자와 결과 색으로 멈춘다.
   '동작 줄이기'를 켠 휴대폰에서는 뒤집지 않고 바로 색을 보여 준다. 뒤집는 동안에는 입력을 받지 않는다. */
const FLAP_MS = 65;      // 반쪽이 한 번 접히는 시간 (한 장 넘기는 데 두 배)
const FLAP_SPINS = 3;    // 진짜 글자 전에 넘기는 무작위 글자 수
const FLAP_GAP = 220;    // 칸마다 시작 간격
let wordFlipping = false;
const reduceMotion = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

/** 한 장 넘기기: from 글자 위로 to 글자가 접혀 내려온다. 각 쪽은 { ch, cls } (cls: filled / board / correct·present·absent) */
function flapOnce(tile, from, to, ms) {
  const half = (part, x) => `<span class="sf ${part} ${x.cls}"><i>${escapeHtml(x.ch.toUpperCase())}</i></span>`;
  tile.className = 'word-tile flipping';
  tile.style.setProperty('--flap', `${ms}ms`);
  tile.innerHTML = half('sf-top', to) + half('sf-bottom', from) + half('sf-flap-top', from) + half('sf-flap-bottom', to);
  return new Promise((resolve) => setTimeout(resolve, ms * 2));
}
async function flipTile(tile, ch, mark) {
  let prev = { ch, cls: 'filled' };
  for (let k = 0; k < FLAP_SPINS; k++) {
    const next = { ch: String.fromCharCode(97 + Math.floor(Math.random() * 26)), cls: 'board' };
    await flapOnce(tile, prev, next, FLAP_MS);
    prev = next;
  }
  await flapOnce(tile, prev, { ch, cls: mark }, Math.round(FLAP_MS * 1.6));   // 마지막 장은 조금 천천히
  tile.className = `word-tile ${mark}`;
  tile.style.removeProperty('--flap');
  tile.textContent = ch.toUpperCase();
  tile.setAttribute('aria-label', `${ch.toUpperCase()} ${WORD_SAY[mark]}`);
}
function flipRow(rowIdx, guess) {
  const marks = scoreGuess(guess, dailyWord.word);
  const tiles = [...document.querySelectorAll('#word-grid .word-row')[rowIdx].children];
  return Promise.all(tiles.map((t, i) =>
    new Promise((res) => setTimeout(res, i * FLAP_GAP)).then(() => flipTile(t, guess[i], marks[i]))));
}

function renderWordEnd(st) {
  const end = $('#word-end');
  end.hidden = !st.done;
  if (!st.done) return;
  const w = dailyWord.word;
  const stats = wordStats();
  const streak = currentStreak(stats);
  // 수업 문장이 여러 개면 그중 하나를 무작위로 (68단계). 고른 문장은 저장해서, 같은 날 다시 열어도 같은 문장
  const list = dailyWord.sentences && dailyWord.sentences.length ? dailyWord.sentences : [dailyWord.sentence].filter(Boolean);
  if (list.length && !(st.pick >= 0 && st.pick < list.length)) {
    st.pick = Math.floor(Math.random() * list.length);
    saveJson(WORD_KEY, st);
  }
  const picked = list.length ? list[st.pick] : '';
  const sentence = picked
    ? escapeHtml(picked).replace(new RegExp(`\\b(${w})\\b`, 'i'), '<strong>$1</strong>') : '';
  end.innerHTML = `
    <p class="word-result">${st.won ? `🎉 ${st.guesses.length}번 만에 맞혔어요!` : '아쉬워요! 내일 또 도전해요.'}</p>
    <div class="word-answer">
      <span class="word-answer-text">${escapeHtml(w.toUpperCase())}</span>
      ${dailyWord.meaning ? `<span class="word-answer-ko">${escapeHtml(dailyWord.meaning)}</span>` : ''}
      ${wordSayBtn(w, `${w} 발음 듣기`)}
    </div>
    ${sentence ? `<p class="word-sentence">${sentence}</p>
      <button type="button" class="say-btn word-say-pill" data-say="${escapeHtml(picked)}" data-course="en" aria-label="문장 듣기">${SPEAKER_ICON}<span>문장 듣기</span></button>` : ''}
    <p class="word-stats">${streak > 0 ? `🔥 ${streak}일 연속` : '연속 기록 없음'} · 맞힌 날 ${stats.won} / ${stats.played} · 최고 ${stats.best}일 연속</p>
    <button class="primary" id="word-share">결과 공유하기</button>
    <p class="hint" id="word-share-msg" role="status"></p>
    <p class="hint">다음 단어는 내일 0시(한국 시간)에 나와요.</p>
    ${dailyWord.test_account ? `<button class="link word-reset" id="word-reset">↺ 다시 하기 · 시험용 (선생님·테스터에게만 보여요)</button>` : ''}`;
  $('#word-share').addEventListener('click', shareWord);
  if (dailyWord.test_account) $('#word-reset').addEventListener('click', resetWordForTest);
}

function wordKey(key) {
  const st = wordState();
  if (st.done || wordFlipping || wordChecking) return;
  $('#word-msg').textContent = hintOpen(st) ? wordHintText(st) : '';
  if (key === 'back') { wordTyping = wordTyping.slice(0, -1); return renderWord(); }
  if (key === 'enter') return submitWord(st);
  if (/^[a-z]$/.test(key) && wordTyping.length < WORD_LEN) { wordTyping += key; renderWord(); }
}

function shakeNowRow(msg) {
  $('#word-msg').textContent = msg;
  const row = document.querySelector('.word-row.now');
  if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
}

async function submitWord(st) {
  if (wordTyping.length < WORD_LEN) return shakeNowRow(`${WORD_LEN}글자를 모두 채워 주세요.`);
  // 사전에 없는 단어는 받지 않는다 (기회도 줄지 않음). 정답 단어는 사전에 없어도 받는다
  if (!wordDict) {
    wordChecking = true;
    await loadWordDict();
    wordChecking = false;
  }
  if (wordDict && wordTyping !== dailyWord.word && !wordDict.has(wordTyping)) return shakeNowRow('사전에 없는 단어예요. 다른 단어를 넣어 보세요.');
  st.guesses.push(wordTyping);
  wordTyping = '';
  const won = st.guesses[st.guesses.length - 1] === dailyWord.word;
  if (won || st.guesses.length >= WORD_TRIES) {
    st.done = true;
    st.won = won;
  }
  // 시험용 다시 하기(replay)로 푼 판은 연속 기록·맞힌 날에 세지 않는다
  if (st.done && !st.replay) {
    const stats = wordStats();
    stats.played++;
    if (won) {
      stats.won++;
      stats.streak = stats.lastWonNo === dailyWord.no - 1 ? stats.streak + 1 : 1;
      stats.lastWonNo = dailyWord.no;
      stats.best = Math.max(stats.best, stats.streak);
    } else {
      stats.streak = 0;
    }
    saveJson(WORD_STATS_KEY, stats);
  }
  saveJson(WORD_KEY, st);
  const after = () => {
    wordFlipping = false;
    renderWord();
    renderWordCard();
    if (won) speak(dailyWord.word, 'en');
  };
  if (reduceMotion()) return after();
  wordFlipping = true;
  renderWord(true);
  flipRow(st.guesses.length - 1, st.guesses[st.guesses.length - 1]).then(after, after);
}

/** 시험용 다시 하기 (71단계, 선생님·테스터만): 오늘 판만 지우고 처음부터. 연속 기록·맞힌 날 기록은 그대로 둔다 */
function resetWordForTest() {
  saveJson(WORD_KEY, { no: dailyWord.no, guesses: [], hint: false, done: false, won: false, replay: true });
  wordTyping = '';
  $('#word-msg').textContent = '';
  renderWord();
  renderWordCard();
  window.scrollTo(0, 0);
}

/** 결과 공유 글: 정답 글자 없이 색만 (아직 안 푼 동료에게 스포일러가 되지 않게) */
function wordShareText() {
  const st = wordState();
  const grid = st.guesses.map((g) => scoreGuess(g, dailyWord.word).map((m) => WORD_MARK[m]).join('')).join('\n');
  return `Tutoreal 오늘의 단어 #${dailyWord.no}  ${st.won ? st.guesses.length : 'X'}/${WORD_TRIES}${hintOpen(st) ? ' 💡' : ''}\n${grid}`;
}
async function shareWord() {
  const text = wordShareText();
  const msg = $('#word-share-msg');
  try {
    if (navigator.share) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    msg.textContent = '결과를 복사했어요. 카톡에 붙여 넣어 보세요.';
  } catch (err) {
    if (err && err.name === 'AbortError') return;   // 공유 창을 그냥 닫음
    try { await navigator.clipboard.writeText(text); msg.textContent = '결과를 복사했어요. 카톡에 붙여 넣어 보세요.'; }
    catch { msg.textContent = '복사하지 못했어요.'; }
  }
}

$('#word-keys').addEventListener('click', (ev) => {
  const b = ev.target.closest('.word-key');
  if (b) wordKey(b.dataset.key);
});
document.addEventListener('keydown', (ev) => {
  if (views.word.hidden || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key === 'Enter' ? 'enter' : ev.key === 'Backspace' ? 'back' : ev.key.toLowerCase();
  if (k === 'enter' || k === 'back' || /^[a-z]$/.test(k)) { ev.preventDefault(); wordKey(k); }
});
/** 힌트를 연 상태인지 (74단계): 연 적이 있어도 아직 3번째 시도 전이면 열리지 않은 것으로 본다.
 *  v0.76에서 잠금 없이 0번째에 연 기록이 휴대폰에 남아 있으면 처음부터 힌트가 보였다. */
function hintOpen(st) {
  return !!st.hint && st.guesses.filter((g) => g !== dailyWord.word).length >= WORD_HINT_AFTER;
}

/** 힌트 글: 쉬운 영어 설명. 없으면 아직 초록으로 맞히지 못한 자리의 글자 하나 (고른 자리는 저장해서 바뀌지 않게) */
function wordHintText(st) {
  if (dailyWord.hint) return `💡 ${dailyWord.hint}`;
  const w = dailyWord.word;
  if (!(st.hintPos >= 0)) {
    const open = [...w].map((_, i) => i).filter((i) => !st.guesses.some((g) => g[i] === w[i]));
    st.hintPos = open.length ? open[0] : 0;
    saveJson(WORD_KEY, st);
  }
  return `💡 ${st.hintPos + 1}번째 글자는 ${w[st.hintPos].toUpperCase()}예요.`;
}
$('#word-hint').addEventListener('click', () => {
  const st = wordState();
  if (st.guesses.filter((g) => g !== dailyWord.word).length < WORD_HINT_AFTER) return;   // 잠긴 동안은 열리지 않게
  st.hint = true;
  saveJson(WORD_KEY, st);
  renderWord();
});
$('#word-back').addEventListener('click', () => { renderWordCard(); show('list'); });
$('#word-nudge-btn').addEventListener('click', () => finishReview('word'));
$('#review-drill').addEventListener('click', () => finishReview('drill'));

setVersion();
renderThemeBtn();
$('#theme-btn').addEventListener('click', nextTheme);
loadAvatars().then(renderMe);
show('login');
// 저장된 코드는 입력칸에 채워 두기만 한다. '다음부터 자동 로그인'을 체크한 사람만 바로 들어간다.
const saved = loadCode();
$('#auto-login').checked = loadAuto();
$('#auto-login').addEventListener('change', (e) => saveAuto(e.target.checked));
if (saved) {
  $('#login-code').value = saved;
  if (loadAuto()) enter(saved);
}
