// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk, endTalk, getFeedback, shareTalk, getSummary, checkPronunciation, setAvatar } from './api.js';
import { LiveSession } from './live.js';
import { Recorder } from './recorder.js';

const $ = (sel) => document.querySelector(sel);
const views = {
  login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail'), talk: $('#view-talk'), review: $('#view-review'),
  history: $('#view-history'), record: $('#view-record'),
  teacher: $('#view-teacher'), tchapter: $('#view-tchapter'), tstudent: $('#view-tstudent'),
  drill: $('#view-drill'), avatar: $('#view-avatar')
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

const ERROR_TEXT = {
  INVALID_CODE: '접속 코드가 맞지 않아요.',
  TOO_MANY_TRIES: '잘못된 시도가 많아요. 10분 뒤에 다시 해 주세요.',
  TIMEOUT: '서버 응답이 늦어요. 잠시 뒤 다시 해 주세요.',
  NotAllowedError: '마이크 사용이 허용되지 않았어요. 브라우저 설정에서 이 사이트의 마이크를 허용해 주세요.',
  NotFoundError: '마이크를 찾지 못했어요.',
  NO_SCENARIO: '이 챕터에 준비된 시나리오가 없어요.',
  TOKEN_FAILED: '음성 연결 준비에 실패했어요. 잠시 뒤 다시 해 주세요.',
  FEEDBACK_FAILED: '피드백을 만들지 못했어요.',
  FEEDBACK_LIMIT: '이 대화의 피드백을 여러 번 실패했어요. 다음 대화에서 다시 받아 보세요.',
  DAILY_CONNECT_LIMIT: '오늘 대화 횟수를 다 썼어요. 내일 다시 만나요.',
  DAILY_TIME_LIMIT: '오늘 사용 시간을 다 썼어요. 내일 다시 만나요.',
  MONTHLY_BUDGET: '이번 달 사용할 수 있는 시간을 모두 썼어요. 선생님께 알려 주세요.',
  NOT_TEACHER: '선생님 코드로만 볼 수 있어요.',
  DAILY_PRON_LIMIT: '오늘 발음 코칭 횟수를 다 썼어요. "정답 보기"로 계속 연습할 수 있어요.',
  PRON_FAILED: '발음 확인에 실패했어요. 잠시 뒤 다시 해 주세요.',
  BAD_AUDIO: '녹음이 제대로 되지 않았어요. 다시 해 주세요.'
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
  teacher: 'teacher', tchapter: 'teacher', tstudent: 'teacher'
};

function show(name) {
  Object.entries(views).forEach(([key, el]) => { el.hidden = key !== name; });
  const tab = TAB_OF[name];
  $('#tabbar').hidden = !tab;
  document.body.classList.toggle('has-tabbar', !!tab);
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
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
    const { name, role, avatar, server } = await login(code);
    saveCode(code);
    me.name = name;
    me.avatar = avatar;
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
    submit.textContent = '들어가기';
  }
}

function logout() {
  saveCode('');
  $('#tab-teacher').hidden = true;
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
  const n = (c.drills || []).length;
  $('#drill-open').hidden = !n;
  $('#drill-open').textContent = `문장 연습 · ${n}문장`;
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
  endTalk(loadCode(), t.sessionId, sec, reason, Math.round(t.aiSec || 0));
}

async function beginTalk() {
  if (live || !currentChapter) return;
  const t = { sessionId: null, scenarioId: '', patient: null, readyAt: 0, endReason: '', reported: false, limitSec: 0, limitKind: '' };
  talk = t;
  // 오디오는 버튼을 누른 이 순간에 켜야 한다 (iOS). 그래서 다른 일보다 먼저 만든다.
  live = new LiveSession({
    onStatus: (s) => {
      if (s === 'ready') { t.readyAt = Date.now(); setTalkStatus('연결됐어요. 먼저 말을 걸어 보세요.'); startClock(t); }
      if (s === 'goaway') setTalkStatus('곧 연결이 끝나요.');
    },
    onEnd: (reason, info) => { t.aiSec = session.recv; endedTalk(reason, info, t); reportEnd(t); },
    onText: addText,
    onTurnEnd: endTurn
  });

  $('#talk-head').hidden = false;
  $('#talk-chapter').textContent = `${currentChapter.order}장 · ${currentChapter.title}`;
  $('#talk-name').textContent = '수검자 준비 중…';
  $('#talk-avatar').innerHTML = '';
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
    const { token, model, patient, sessionId, scenarioId, server, limitSec, limitKind } = await startTalk(loadCode(), currentChapter.chapter_id);
    t.sessionId = sessionId;
    t.scenarioId = scenarioId || '';
    t.patient = patient;
    t.limitSec = limitSec || 0;
    t.limitKind = limitKind || '';
    if (session.ended) return reportEnd(t);   // 준비 중에 끝난 경우에도 시작 기록을 마무리한다
    setVersion(server);
    $('#talk-name').textContent = patient.name;
    $('#talk-avatar').innerHTML = patientAvatar(patient.name, scenarioId);
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
  review.data = spoke ? {
    sessionId: t.sessionId, scenarioId: t.scenarioId, chapter: currentChapter, patient: t.patient, lines: transcript.lines.slice(),
    durationSec: t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0
  } : null;
  $('#talk-end').hidden = true;
  $('#talk-next').hidden = !spoke;
  $('#talk-back').hidden = spoke;
  $('#talk-status').scrollIntoView({ block: 'center', behavior: 'smooth' });   // 아래로 내려가 있어도 끝난 문구가 보이게
}

/* ── 대화 후 화면: 1/3 자기 평가 → 2/3 피드백 → 3/3 공유 선택 ── */
// review.data: { sessionId, scenarioId, chapter, patient, lines, durationSec, confidence(1~3), difficulty, feedback, shared }

const review = { step: 1, data: null };

function openReview() {
  if (!review.data) return;
  document.querySelectorAll('.face, .choice').forEach((b) => b.classList.remove('selected'));
  $('#difficulty').value = '';
  $('#review-msg').textContent = '';
  $('#share-msg').textContent = '';
  goStep(1);
  show('review');
  loadFeedback();   // 자기 평가를 하는 동안 미리 만든다
}

/* 2/3 피드백: 대화 글자를 서버로 보내 AI 피드백을 받는다 (저장은 하지 않는다). */
async function loadFeedback() {
  const data = review.data;
  const box = $('#feedback');
  box.innerHTML = '<p class="state">피드백을 만드는 중…</p>';
  try {
    const lines = data.lines.map((l) => ({ who: l.who, text: l.text }));
    data.feedback = await getFeedback(loadCode(), data.sessionId, lines);
    if (review.data === data) $('#feedback').innerHTML = feedbackHtml(data.feedback);
  } catch (err) {
    console.warn(err);
    if (review.data !== data) return;
    box.innerHTML = `<p class="state">${escapeHtml(errorText(err))}</p>` +
      (err.message === 'FEEDBACK_LIMIT' ? '' : '<button class="secondary" id="feedback-retry">다시 시도</button>');
    const retry = $('#feedback-retry');
    if (retry) retry.addEventListener('click', loadFeedback);
  }
}

function feedbackHtml(fb) {
  const used = fb.keywords.filter((k) => k.used).length;
  return `
    <p class="fb-summary">${escapeHtml(fb.summary)}</p>
    ${fb.strengths.length ? `<p class="fb-title">잘한 점</p>
      <ul class="fb-list">${fb.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
    ${fb.fixes.length ? `<p class="fb-title">더 좋은 표현</p>
      ${fb.fixes.map((f) => `<div class="fb-fix">
        <p class="fb-said">${escapeHtml(f.said)}</p>
        <p class="fb-better">→ ${escapeHtml(f.better)}</p>
        <p class="fb-why">${escapeHtml(f.why)}</p></div>`).join('')}` : ''}
    ${fb.keywords.length ? `<p class="fb-title">핵심 단어 ${used} / ${fb.keywords.length}</p>
      <div class="chips">${fb.keywords.map((k) =>
        `<span class="chip${k.used ? '' : ' unused'}">${k.used ? '✓ ' : ''}${escapeHtml(k.keyword)}</span>`).join('')}</div>` : ''}
    ${fb.next_practice.length ? `<p class="fb-title">다음에 연습할 문장</p>
      ${fb.next_practice.map((n) => `<p class="fb-next">${escapeHtml(n.en)}<span class="ko">${escapeHtml(n.ko)}</span></p>`).join('')}` : ''}`;
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
  finishReview();
}

/* ── 기록: 이 휴대폰에 최근 30개까지 (공유 여부와 관계없이). 공유를 고르면 시트에도 저장한다. ── */

const HISTORY_KEY = 'tutoreal.history';
const HISTORY_MAX = 30;

function saveLocal(d) {
  const entry = {
    sessionId: d.sessionId, scenarioId: d.scenarioId, chapterId: d.chapter.chapter_id, chapterOrder: d.chapter.order,
    chapterTitle: d.chapter.title, at: new Date().toISOString(), durationSec: d.durationSec,
    patient: d.patient, confidence: d.confidence, difficulty: d.difficulty, shared: d.shared,
    lines: d.lines.map((l) => ({ who: l.who, text: l.text })), feedback: d.feedback || null
  };
  try {
    const list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]').filter((e) => e.sessionId !== entry.sessionId);
    list.unshift(entry);
    // 휴대폰 저장 공간이 모자라면 오래된 기록부터 지운다.
    for (let n = Math.min(list.length, HISTORY_MAX); n > 0; n--) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, n))); return; } catch { /* 줄여서 다시 */ }
    }
  } catch { /* 저장 못 해도 진행 */ }
}

async function finishReview() {
  const d = review.data;
  if (d.shared === undefined) {
    $('#share-msg').textContent = '공유할지 하나를 골라 주세요.';
    return;
  }
  const btn = $('#review-next');
  btn.disabled = true;
  btn.textContent = '저장 중…';
  try {
    if (d.shared) await shareTalk(loadCode(), d.sessionId, d.confidence, d.difficulty, d.lines.map((l) => ({ who: l.who, text: l.text })));
    saveLocal(d);
    review.data = null;
    show('detail');
  } catch (err) {
    console.warn(err);
    $('#share-msg').textContent = `저장하지 못했어요. 다시 눌러 주세요. (${errorText(err)})`;
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

/* ── 내 기록 보기: 이 휴대폰에 저장된 지난 대화 (최근 30개) ── */

const CONFIDENCE = { 1: '😣 어려웠어요', 2: '🙂 보통이에요', 3: '😄 자신 있어요' };

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
const me = { name: '', avatar: '' };

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

/** 첫 화면 인사: 큰 캐릭터 + 'Kevin, nice to see you!' */
function renderMe() {
  $('#greet-avatar').innerHTML = studentAvatar(me.name, me.avatar);
  $('#greet-hi').textContent = me.name ? `${me.name}, nice to see you!` : '';
}

/* 내 캐릭터 고르기: 누르면 "이 캐릭터로 바꿀까요?" → 예 → 저장 → "바꿨어요!" → 확인 → 챕터 목록 */
function openAvatarPicker() {
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

/** 아래쪽 탭 바의 '코드 바꾸기': 실수로 누르기 쉬워서 한 번 묻는다 */
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
  return parts.join(' · ');
}

function openHistory() {
  const list = loadHistory();
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
      </button>`).join('');
    box.querySelectorAll('.record').forEach((btn) => {
      btn.addEventListener('click', () => openRecord(list[Number(btn.dataset.i)]));
    });
  }
  show('history');
}

function openRecord(e) {
  $('#record-head').innerHTML = `${avatarHtml(e)}
    <div>
      <p class="eyebrow">${chapterNo(e)} · ${escapeHtml(e.chapterTitle || '')}</p>
      <h3>${escapeHtml((e.patient && e.patient.name) || '')}</h3>
      <p class="talk-meta">${escapeHtml(recordMeta(e))}</p>
      ${e.difficulty ? `<p class="talk-meta">어려웠던 점: ${escapeHtml(e.difficulty)}</p>` : ''}
    </div>`;
  $('#record-feedback').innerHTML = e.feedback ? feedbackHtml(e.feedback) : '<p class="state">이 대화는 피드백이 없어요.</p>';
  // 다시 보는 화면이므로 환자 말도 가리지 않고 모두 보여 준다.
  $('#record-lines').innerHTML = (e.lines || []).map((l) => `
    <div class="line ${l.who === 'me' ? 'me' : 'ai'}">
      <span class="who">${l.who === 'me' ? '나' : '환자'}</span><span class="text">${escapeHtml(l.text)}</span>
    </div>`).join('');
  show('record');
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
  $('#level-desc').textContent = LEVEL_DESC[drill.level];
  const card = $('#drill-card');
  const actions = $('#drill-actions');
  if (drill.pos >= drill.queue.length) {
    $('#drill-count').textContent = '';
    card.innerHTML = `<h3>다 했어요!</h3>
      <p class="goal">${drill.total}문장 중 어려웠던 문장 ${drill.hard}개. 어려웠던 문장은 다음 연습 때 먼저 나와요.</p>`;
    actions.innerHTML = `<button class="secondary" id="drill-again">한 번 더 연습</button>
      ${drill.level === 'blank' ? '<button class="secondary" id="drill-level2">2단계 도전하기 (통째로 말하기)</button>' : ''}
      <button class="primary" id="drill-to-talk">대화 시작하기</button>`;
    $('#drill-again').addEventListener('click', startDrill);
    if ($('#drill-level2')) $('#drill-level2').addEventListener('click', () => { drill.level = 'korean'; startDrill(); });
    $('#drill-to-talk').addEventListener('click', () => { show('detail'); beginTalk(); });
    return;
  }
  const d = drill.queue[drill.pos];
  const parts = parseSentence(d.sentence);
  const firstRound = drill.queue.filter((x) => !x.again).length;
  $('#drill-count').textContent = d.again ? '한 번 더' : `${Math.min(drill.pos + 1, firstRound)} / ${firstRound}`;

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
  const hint = parts.filter((p) => p.blank).map((p) => p.blank.split(/\s+/).map((w) => w[0] + '_'.repeat(Math.max(0, w.length - 1))).join(' ')).join(' · ');

  const c = drill.coach;
  const coachHtml = c ? `<div class="coach ${c.overall}">
      <p class="coach-title">${COACH_TITLE[c.overall] || COACH_TITLE.retry}</p>
      ${c.message ? `<p class="coach-msg">${escapeHtml(c.message)}</p>` : ''}
      ${c.heard ? `<p class="coach-heard">들린 문장: "${escapeHtml(c.heard)}"</p>` : ''}
      ${c.words.map((w) => `<p class="coach-word"><b>${escapeHtml(w.word)}</b> → <span class="resp">${escapeHtml(w.respelling)}</span>
        <span class="tip">${escapeHtml(w.tip)}</span></p>`).join('')}
    </div>` : '';

  card.innerHTML = `
    ${coachHtml}
    <p class="situation-label">상황</p>
    <p class="situation">${escapeHtml(d.situation)}</p>
    ${sentence ? `<p class="sentence-label">${drill.revealed ? '정답' : '영어 문장'}</p><p class="sentence">${sentence}</p>` : ''}
    ${drill.revealed ? (d.pron ? `<p class="drill-pron">발음: ${escapeHtml(d.pron)}</p>` : '')
      : drill.phase === 'recording' ? '<p class="recording">● 듣고 있어요. 문장을 말한 뒤 "다 말했어요"를 눌러 주세요.</p>'
      : drill.phase === 'checking' ? '<p class="drill-say">발음을 확인하는 중…</p>'
      : `<p class="drill-say">${drill.level === 'blank' ? '소리 내어 문장 전체를 말해 보세요.' : '영어 문장 전체를 소리 내어 말해 보세요.'}</p>
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
      <div class="row">${drill.hintShown ? '' : '<button class="secondary" id="drill-hint">힌트 (첫 글자)</button>'}
      <button class="secondary" id="drill-reveal">정답 보기</button></div>`;
    $('#rec-start').addEventListener('click', startCoach);
    if ($('#drill-hint')) $('#drill-hint').addEventListener('click', () => { drill.hintShown = true; renderDrill(); });
    $('#drill-reveal').addEventListener('click', () => { drill.revealed = true; drill.coachError = ''; renderDrill(); speak(plainSentence(d.sentence)); });
  } else {
    actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">🔊 다시 듣기</button>
      <button class="secondary" id="rec-start">🎤 다시 말해 보기</button></div>
      <div class="row"><button class="secondary" id="drill-hard">어려웠어요</button>
      <button class="primary" id="drill-easy">바로 떠올랐어요</button></div>`;
    $('#drill-listen').addEventListener('click', () => speak(plainSentence(d.sentence)));
    $('#rec-start').addEventListener('click', startCoach);
    $('#drill-hard').addEventListener('click', () => nextDrill(true));
    $('#drill-easy').addEventListener('click', () => nextDrill(false));
  }
}

/* 발음 코칭: 녹음 → 서버 → AI 코칭. 소리는 저장하지 않는다. */
async function startCoach() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  drill.coachError = '';
  const rec = new Recorder();
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

/** 휴대폰에 들어 있는 영어 읽기 음성으로 문장을 읽어 준다 (무료, 인터넷 불필요). */
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

/* ── 선생님 화면: 시트 summary 탭과 같은 계산 결과 (선생님 코드만) ── */
// 학생 상세는 지금은 요약에 있는 숫자로만 그린다. 나중에 학생 한 명의 공유 기록(피드백·대화)을 주는 요청을 따로 추가해
// openStudent() 아래에 '공유된 대화' 목록을 붙인다 (모양은 내 기록 보기와 같게).

let teacherData = null;

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
    $('#teacher-body').innerHTML = '<p class="state">요약을 불러오는 중…</p>';
    show('teacher');
  }
  try {
    teacherData = await getSummary(loadCode(), refresh);
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
  $('#teacher-period').textContent = `${s.period.label} · ${s.generated_at} 기준`;
  $('#teacher-body').innerHTML = `
    <div class="card t-card">
      <div class="tiles">
        <span><span class="tile-n">${s.totals.students}</span><span class="tile-l">연습한 학생</span></span>
        <span><span class="tile-n">${s.totals.count}회</span><span class="tile-l">연습</span></span>
        <span><span class="tile-n">${s.totals.minutes}분</span><span class="tile-l">시간</span></span>
      </div>
      <p class="t-note">예상 비용 $${s.totals.cost_usd}</p>
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
    <p class="t-note">공유된 대화의 피드백과 대화 내용 보기는 다음 버전에서 추가돼요.</p>`;
  show('tstudent');
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
  teacher: () => openTeacher(false), logout: confirmLogout
};
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => TAB_ACTION[b.dataset.tab]()));
$('#greet-avatar').addEventListener('click', openAvatarPicker);
$('#drill-open').addEventListener('click', startDrill);
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

$('#record-back').addEventListener('click', openHistory);
$('#back').addEventListener('click', () => show('list'));
$('#talk-start').addEventListener('click', beginTalk);
$('#talk-end').addEventListener('click', () => { if (live) { talk.endReason = 'user'; live.stop(''); } });
$('#talk-back').addEventListener('click', () => show('detail'));
$('#talk-next').addEventListener('click', openReview);
window.addEventListener('pagehide', () => { if (live) { talk.endReason = 'left'; live.stop(''); } });

setVersion();
loadAvatars().then(renderMe);
show('login');
const saved = loadCode();
if (saved) {
  $('#login-code').value = saved;
  enter(saved);
}
