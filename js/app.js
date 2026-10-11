// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk, endTalk } from './api.js';
import { LiveSession } from './live.js';

const $ = (sel) => document.querySelector(sel);
const views = {
  login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail'), talk: $('#view-talk'), review: $('#view-review')
};
let chapters = [];
let currentChapter = null;
let live = null;        // 진행 중인 음성 대화
let talk = null;        // 진행 중인 대화의 정보 { sessionId, readyAt, endReason, reported, limitSec, limitKind }
let clock = null;       // 경과 시간 타이머

// 접속 코드는 이 기기의 브라우저에만 기억한다 (다음에 열 때 다시 입력하지 않도록).
const CODE_KEY = 'tutoreal.code';
function loadCode() {
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}
function saveCode(code) {
  try { code ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY); } catch { /* 저장 못 해도 동작 */ }
}

const ERROR_TEXT = {
  INVALID_CODE: '접속 코드가 맞지 않아요.',
  TOO_MANY_TRIES: '잘못된 시도가 많아요. 10분 뒤에 다시 해 주세요.',
  TIMEOUT: '서버 응답이 늦어요. 잠시 뒤 다시 해 주세요.',
  NotAllowedError: '마이크 사용이 허용되지 않았어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.',
  NotFoundError: '마이크를 찾지 못했어요.',
  NO_SCENARIO: '이 챕터에 준비된 시나리오가 없어요.',
  TOKEN_FAILED: '음성 연결 준비에 실패했어요. 잠시 뒤 다시 해 주세요.',
  DAILY_CONNECT_LIMIT: '오늘 대화 횟수를 다 썼어요. 내일 다시 만나요.',
  DAILY_TIME_LIMIT: '오늘 사용 시간을 다 썼어요. 내일 다시 만나요.'
};
const LIMIT_TEXT = {
  daily: '오늘 사용 시간을 다 써서 대화를 마쳤어요.',
  session: '대화 한 번은 최대 15분이에요.'
};
const errorText = (err) => ERROR_TEXT[err.name] || ERROR_TEXT[err.message] || `연결에 문제가 있어요. (${err.message})`;

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  $('#who').hidden = name === 'login' || name === 'talk' || name === 'review';
  window.scrollTo(0, 0);
}

function setVersion(server) {
  $('#version').textContent = server ? `앱 ${APP_VERSION} · 서버 ${server}` : `앱 ${APP_VERSION}`;
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
    const { name, server } = await login(code);
    saveCode(code);
    $('#who-name').textContent = `${name} 님`;
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
    submit.textContent = '들어가기';
  }
}

function logout() {
  saveCode('');
  $('#login-code').value = '';
  $('#login-msg').textContent = '';
  show('login');
  $('#login-code').focus();
}

/* ── 챕터 ── */

function renderList() {
  const box = $('#chapter-list');
  if (!chapters.length) {
    box.innerHTML = '<p class="state">아직 공개된 챕터가 없어요.</p>';
    return;
  }
  box.innerHTML = chapters.map((c) => `
    <button class="chapter" data-id="${escapeHtml(c.chapter_id)}">
      <span class="chapter-no">${escapeHtml(c.order)}</span>
      <span class="chapter-text">
        <span class="chapter-title">${escapeHtml(c.title)}</span>
        <span class="chapter-goal">${escapeHtml(c.goal)}</span>
      </span>
      <span class="chevron" aria-hidden="true">›</span>
    </button>`).join('');
  box.querySelectorAll('.chapter').forEach((btn) => {
    btn.addEventListener('click', () => openChapter(btn.dataset.id));
  });
}

function openChapter(id) {
  const c = chapters.find((x) => x.chapter_id === id);
  if (!c) return;
  $('#detail-no').textContent = `${c.order}장`;
  $('#detail-title').textContent = c.title;
  $('#detail-goal').textContent = c.goal;
  $('#detail-keywords').innerHTML = c.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('');
  currentChapter = c;
  show('detail');
}

async function loadChapters() {
  const box = $('#chapter-list');
  box.innerHTML = '<p class="state">챕터를 불러오는 중…</p>';
  try {
    const { chapters: list, server } = await getChapters();
    chapters = list;
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
   환자 차례가 끝나면 두 말풍선을 닫아, 다음 말은 새 말풍선에 쓴다. 글자는 화면에만 있고 저장하지 않는다. */
const transcript = { me: null, ai: null, lines: [] };   // lines: [{ who, text }] — 대화 후 화면에서 쓴다

function addText(who, text) {
  if (who === 'ai' && currentChapter.ai_captions === 'off') return;
  setTalkStatus('');
  let line = transcript[who];
  if (!line) {
    line = document.createElement('div');
    line.className = `line ${who}`;
    line.innerHTML = `<span class="who">${who === 'me' ? '나' : '환자'}</span>` +
      (who === 'ai' ? '<span class="cover">눌러서 자막 보기</span>' : '') + '<span class="text"></span>';
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
}

function endTurn() {
  transcript.me = null;
  transcript.ai = null;
}

/** 사용 시간 기록을 서버에 보낸다. 한 대화에 한 번만. */
function reportEnd(t) {
  if (!t.sessionId || t.reported) return;
  t.reported = true;
  const sec = t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0;
  const reason = t.endReason || (t.readyAt ? 'closed' : 'error');
  endTalk(loadCode(), t.sessionId, sec, reason);
}

async function beginTalk() {
  if (live || !currentChapter) return;
  const t = { sessionId: null, readyAt: 0, endReason: '', reported: false, limitSec: 0, limitKind: '' };
  talk = t;
  // 오디오는 버튼을 누른 이 순간에 켜야 한다 (iOS). 그래서 다른 일보다 먼저 만든다.
  live = new LiveSession({
    onStatus: (s) => {
      if (s === 'ready') { t.readyAt = Date.now(); setTalkStatus('연결됐어요. 먼저 말을 걸어 보세요.'); startClock(t); }
      if (s === 'goaway') setTalkStatus('곧 연결이 끝나요.');
    },
    onEnd: (reason, info) => { endedTalk(reason, info, t); reportEnd(t); },
    onText: addText,
    onTurnEnd: endTurn
  });

  $('#talk-head').hidden = false;
  $('#talk-chapter').textContent = `${currentChapter.order}장 · ${currentChapter.title}`;
  $('#talk-name').textContent = '수검자 준비 중…';
  $('#talk-dob').textContent = '–';
  $('#talk-exam').textContent = '–';
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
    setTalkStatus('수검자를 부르는 중…');
    const { token, model, patient, sessionId, server, limitSec, limitKind } = await startTalk(loadCode(), currentChapter.chapter_id);
    t.sessionId = sessionId;
    t.limitSec = limitSec || 0;
    t.limitKind = limitKind || '';
    if (session.ended) return reportEnd(t);   // 준비 중에 끝난 경우에도 시작 기록을 마무리한다
    setVersion(server);
    $('#talk-name').textContent = patient.name;
    $('#talk-dob').textContent = patient.dob;
    $('#talk-exam').textContent = patient.exam;
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
  // 예상하지 못한 이유로 끝난 경우(연결 끊김 등)에만 연결 정보(보낸·받은 소리 등)를 보여 준다.
  $('#talk-info').textContent = info;
  $('#talk-info').hidden = !reason || !!t.endReason || !t.readyAt;
  // 연결 전에 끝남 (한도, 마이크 거부 등): 빈 환자 차트는 숨기고 이유만 보여 준다.
  if (!t.readyAt && reason) { $('#talk-head').hidden = true; setTalkStatus(reason); }
  else setTalkStatus(reason ? `대화가 끝났어요. ${reason}` : '대화가 끝났어요. 수고하셨어요!');
  // 내가 한 말이 있으면 대화 후 화면(1/3 자기 평가)으로 이어지고, 없으면 챕터로 돌아간다.
  const spoke = transcript.lines.some((l) => l.who === 'me' && l.text.trim());
  review.data = spoke ? { sessionId: t.sessionId, chapter: currentChapter, lines: transcript.lines.slice() } : null;
  $('#talk-end').hidden = true;
  $('#talk-next').hidden = !spoke;
  $('#talk-back').hidden = spoke;
  $('#talk-status').scrollIntoView({ block: 'center', behavior: 'smooth' });   // 아래로 내려가 있어도 끝난 문구가 보이게
}

/* ── 대화 후 화면: 1/3 자기 평가 → 2/3 피드백 → 3/3 공유 선택 ── */
// review.data: { sessionId, chapter, lines, confidence(1~3), difficulty } — 13단계(공유 선택) 전까지는 화면에만 있다.

const review = { step: 1, data: null };

function openReview() {
  if (!review.data) return;
  document.querySelectorAll('.face').forEach((b) => b.classList.remove('selected'));
  $('#difficulty').value = '';
  $('#review-msg').textContent = '';
  goStep(1);
  show('review');
}

function goStep(n) {
  review.step = n;
  document.querySelectorAll('#view-review [data-step]').forEach((el) => { el.hidden = Number(el.dataset.step) !== n; });
  $('#review-step').textContent = `${n} / 3`;
  $('#review-prev').hidden = n === 1;
  $('#review-next').textContent = n === 3 ? '완료' : '다음';
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
  if (review.step < 3) return goStep(review.step + 1);
  review.data = null;   // 완료: 아직 저장하지 않는다 (13단계)
  show('detail');
}

document.querySelectorAll('.face').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.face').forEach((b) => b.classList.toggle('selected', b === btn));
    review.data.confidence = Number(btn.dataset.value);
    $('#review-msg').textContent = '';
  });
});
$('#review-next').addEventListener('click', nextStep);
$('#review-prev').addEventListener('click', () => goStep(review.step - 1));

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
$('#logout').addEventListener('click', logout);
$('#back').addEventListener('click', () => show('list'));
$('#talk-start').addEventListener('click', beginTalk);
$('#talk-end').addEventListener('click', () => { if (live) { talk.endReason = 'user'; live.stop(''); } });
$('#talk-back').addEventListener('click', () => show('detail'));
$('#talk-next').addEventListener('click', openReview);
window.addEventListener('pagehide', () => { if (live) { talk.endReason = 'left'; live.stop(''); } });

setVersion();
show('login');
const saved = loadCode();
if (saved) {
  $('#login-code').value = saved;
  enter(saved);
}
