// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk } from './api.js';
import { LiveSession } from './live.js';

const $ = (sel) => document.querySelector(sel);
const views = { login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail'), talk: $('#view-talk') };
let chapters = [];
let currentChapter = null;
let live = null;        // 진행 중인 음성 대화
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
  TOKEN_FAILED: '음성 연결 준비에 실패했어요. 잠시 뒤 다시 해 주세요.'
};
const errorText = (err) => ERROR_TEXT[err.name] || ERROR_TEXT[err.message] || `연결에 문제가 있어요. (${err.message})`;

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  $('#who').hidden = name === 'login' || name === 'talk';
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

function startClock() {
  const started = Date.now();
  clearInterval(clock);
  clock = setInterval(() => {
    const sec = Math.floor((Date.now() - started) / 1000);
    $('#talk-time').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }, 1000);
}

async function beginTalk() {
  if (live || !currentChapter) return;
  // 오디오는 버튼을 누른 이 순간에 켜야 한다 (iOS). 그래서 다른 일보다 먼저 만든다.
  live = new LiveSession({
    onStatus: (s) => {
      if (s === 'ready') { setTalkStatus('연결됐어요. 먼저 말을 걸어 보세요.'); startClock(); }
      if (s === 'goaway') setTalkStatus('곧 연결이 끝나요.');
    },
    onEnd: endedTalk
  });

  $('#talk-chapter').textContent = `${currentChapter.order}장 · ${currentChapter.title}`;
  $('#talk-name').textContent = '수검자 준비 중…';
  $('#talk-dob').textContent = '–';
  $('#talk-exam').textContent = '–';
  $('#talk-time').textContent = '0:00';
  $('#talk-end').hidden = false;
  $('#talk-back').hidden = true;
  show('talk');

  const session = live;
  try {
    setTalkStatus('마이크 준비 중…');
    await session.openMic();
    if (session.ended) return;   // 준비 중에 '끝내기'를 누른 경우
    setTalkStatus('수검자를 부르는 중…');
    const { token, model, patient, server } = await startTalk(loadCode(), currentChapter.chapter_id);
    if (session.ended) return;
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

function endedTalk(reason) {
  clearInterval(clock);
  live = null;
  setTalkStatus(reason ? `대화가 끝났어요. ${reason}` : '대화가 끝났어요. 수고하셨어요!');
  $('#talk-end').hidden = true;
  $('#talk-back').hidden = false;
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
$('#logout').addEventListener('click', logout);
$('#back').addEventListener('click', () => show('list'));
$('#talk-start').addEventListener('click', beginTalk);
$('#talk-end').addEventListener('click', () => { if (live) live.stop(''); });
$('#talk-back').addEventListener('click', () => show('detail'));
window.addEventListener('pagehide', () => { if (live) live.stop(''); });

setVersion();
show('login');
const saved = loadCode();
if (saved) {
  $('#login-code').value = saved;
  enter(saved);
}
