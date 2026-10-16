// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk, endTalk, getFeedback, shareTalk, getSummary, checkPronunciation, setAvatar, getGloss, getStudentTalks } from './api.js';
import { LiveSession } from './live.js';
import { Recorder } from './recorder.js';

const $ = (sel) => document.querySelector(sel);
const views = {
  login: $('#view-login'), list: $('#view-list'), detail: $('#view-detail'), talk: $('#view-talk'), review: $('#view-review'),
  history: $('#view-history'), record: $('#view-record'),
  teacher: $('#view-teacher'), tchapter: $('#view-tchapter'), tstudent: $('#view-tstudent'), tsession: $('#view-tsession'),
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
  AI_BUSY: 'AI가 지금 붐벼서 피드백을 받지 못했어요. 잠시 뒤 "다시 시도"를 눌러 주세요.',
  NO_SESSION: '서버에서 이 대화의 기록을 찾지 못해서 피드백을 받을 수 없어요.',
  DAILY_CONNECT_LIMIT: '오늘 대화 횟수를 다 썼어요. 내일 다시 만나요.',
  DAILY_TIME_LIMIT: '오늘 사용 시간을 다 썼어요. 내일 다시 만나요.',
  MONTHLY_BUDGET: '이번 달 사용할 수 있는 시간을 모두 썼어요. 선생님께 알려 주세요.',
  NOT_TEACHER: '선생님 코드로만 볼 수 있어요.',
  DAILY_PRON_LIMIT: '오늘 발음 코칭 횟수를 다 썼어요. "정답 보기"로 계속 연습할 수 있어요.',
  PRON_FAILED: '발음 확인에 실패했어요. 잠시 뒤 다시 해 주세요.',
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
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
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
  box.innerHTML = list.map((c, i) => `
    ${many && (i === 0 || list[i - 1].course !== c.course) ? `<p class="eyebrow course-label">${COURSE_NAME[c.course] || c.course} 과정</p>` : ''}
    <button class="chapter" data-id="${escapeHtml(c.chapter_id)}">
      <span class="chapter-no">${escapeHtml(c.order)}</span>
      <span class="chapter-text">
        <span class="chapter-title">${escapeHtml(c.title)}</span>
        <span class="chapter-goal">${goalHtml(c.goal)}</span>
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
  $('#detail-goal').innerHTML = goalHtml(c.goal);
  $('#detail-keywords').innerHTML = c.keywords.map((k) => `<span class="chip">${escapeHtml(k)}</span>`).join('');
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
  $('#drill-open').textContent = `문장 연습 · ${n}문장`;
  show('detail');
}

async function loadChapters() {
  const box = $('#chapter-list');
  box.innerHTML = '<p class="state">챕터를 불러오는 중…</p>';
  try {
    const { chapters: list, server } = await getChapters(loadCode());
    chapters = list;
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
      if (s === 'ready') { t.readyAt = Date.now(); setTalkStatus('연결됐어요. 먼저 말을 걸어 보세요.'); startClock(t); }
      if (s === 'goaway') setTalkStatus('곧 연결이 끝나요.');
    },
    onEnd: (reason, info) => { t.aiSec = session.recv; endedTalk(reason, info, t); reportEnd(t); },
    onText: addText,
    onTurnEnd: endTurn
  });

  $('#talk-head').hidden = false;
  $('#talk-chapter').textContent = `${currentChapter.order}장 · ${currentChapter.title}`;
  $('#talk-name').textContent = `${partnerTitle()} 준비 중…`;
  $('#talk-avatar').innerHTML = '';
  $('#talk-meta').textContent = '–';
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
    // 영어: 생년월일 · 검사 / 중국어: 역할·장소 (생년월일 칸은 비어 있다)
    $('#talk-meta').textContent = [patient.dob, patient.exam].filter(Boolean).join(' · ') || '–';
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
      box.innerHTML = `<p class="state">${escapeHtml(errorText(err))}</p>` +
        (err.message === 'FEEDBACK_LIMIT' ? '' : '<button class="secondary" id="feedback-retry">다시 시도</button>') +
        // 이번에 못 받아도 끝이 아니라는 안내 (40단계): 기록은 '완료' 때 저장되고, 내 기록에서 다시 받을 수 있다
        '<p class="hint fb-later">\'완료\'를 누르면 이 대화가 \'내 기록\'에 저장돼요. 나중에 \'내 기록\'에서 피드백을 다시 받을 수 있어요.</p>';
      const retry = $('#feedback-retry');
      if (retry) retry.addEventListener('click', () => loadFeedback(data));
    });
  return data.feedbackJob;
}

/** 체크리스트 항목 옆의 작은 표시: 선택(가끔만 하는 안내), 남성·여성(그 성별의 상대에게만, 34단계) */
function checklistTags(item) {
  const SEX = { male: `남성 ${partnerTitle()}만`, female: `여성 ${partnerTitle()}만` };
  return (item.sex ? ` <span class="opt-tag">${SEX[item.sex] || ''}</span>` : '') +
    (item.optional ? ' <span class="opt-tag">선택</span>' : '');
}

/** 안내 체크리스트 결과 (33단계): 했음 ✓ / 빠짐 ✗ / 선택 항목을 안 함 –. 숫자는 선택이 아닌 항목만 센다. */
function checklistHtml(list) {
  if (!list || !list.length) return '';
  const required = list.filter((c) => !c.optional);
  const STATE = { done: ['✓', '했어요'], miss: ['✗', '빠졌어요'], opt: ['–', ''] };   // 선택 항목은 글 옆의 '선택' 표시로 충분
  return `<p class="fb-title">안내 체크리스트 ${required.filter((c) => c.done).length} / ${required.length}</p>
    <ul class="fb-check">${list.map((c) => {
      const state = c.done ? 'done' : c.optional ? 'opt' : 'miss';
      return `<li class="${state}"><span class="mark" aria-hidden="true">${STATE[state][0]}</span>
        <span class="txt">${escapeHtml(c.item)}${checklistTags(c)}
          ${c.en ? `<span class="ck-en" lang="en">${escapeHtml(c.en)}</span>` : ''}</span>
        <span class="chk-state">${STATE[state][1]}</span></li>`;
    }).join('')}</ul>`;
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
 * 피드백 기다림 화면 (36단계). 앱 색의 파도 두 줄(라이트: 남색+청록, 다크: 회청색+청록), 걸린 시간,
 * 5초마다 바뀌는 복습 문장. 진행률(%)은 알 수 없으므로 보여 주지 않는다. '동작 줄이기'를 켠 휴대폰에서는 멈춘 그림.
 * 끝낼 때 부르는 함수를 돌려준다.
 */
function startWaitScreen(box, data) {
  const tips = waitTips(data.chapter);
  box.innerHTML = `<div class="fb-wait">
      <svg class="fb-wave" viewBox="0 0 240 100" aria-hidden="true"><path class="back"/><path class="front"/></svg>
      <p class="fb-wait-msg">AI가 대화를 읽고 있어요… <span class="fb-elapsed">0초</span></p>
      <p class="fb-wait-hint">1분 안팎 걸릴 수 있어요.</p>
      ${tips.length ? `<p class="fb-tip-label">기다리는 동안 한 번 더 말해 봐요</p>
        <div class="fb-tip" aria-live="polite"><span class="tip-ko"></span><span class="tip-target"></span><span class="tip-py"></span></div>` : ''}
    </div>`;
  const paths = box.querySelectorAll('.fb-wave path');
  const tipEl = box.querySelector('.fb-tip');
  const elapsedEl = box.querySelector('.fb-elapsed');
  const still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 뒤쪽 선(작고 느림)과 앞쪽 선(크고 빠름). 가운데가 크게 출렁이고 양 끝은 모인다.
  const LINES = [{ amp: 16, k: 1.4, speed: 1.4, shift: 1.6 }, { amp: 34, k: 1.7, speed: 2.0, shift: 0 }];
  const wave = (l, t) => {
    let d = '';
    for (let i = 0; i <= 48; i++) {
      const u = i / 48;
      const env = Math.pow(Math.sin(Math.PI * u), 1.6) * (0.75 + 0.25 * Math.sin(t * 0.9 + l.shift));
      d += `${i ? ' L' : 'M'}${(8 + 224 * u).toFixed(1)} ${(50 + l.amp * env * Math.sin(2 * Math.PI * l.k * u - t * l.speed + l.shift)).toFixed(1)}`;
    }
    return d;
  };
  let raf = 0;
  let running = true;
  const draw = (ms) => {
    if (!running) return;
    // 숨겨진 단계(1~3단계)에 있는 동안은 그리지 않는다
    if (box.offsetParent !== null || still) paths.forEach((p, i) => p.setAttribute('d', wave(LINES[i], still ? 1 : ms / 1000)));
    if (!still) raf = requestAnimationFrame(draw);
  };
  draw(1000);
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
  return () => { running = false; cancelAnimationFrame(raf); clearInterval(tick); clearInterval(rotate); };
}

function feedbackHtml(fb) {
  const used = fb.keywords.filter((k) => k.used).length;
  return `
    <p class="fb-summary">${escapeHtml(fb.summary)}</p>
    ${checklistHtml(fb.checklist)}
    ${fb.strengths.length ? `<p class="fb-title">잘한 점</p>
      <ul class="fb-list">${fb.strengths.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ul>` : ''}
    ${fb.fixes.length ? `<p class="fb-title">더 좋은 표현</p>
      ${fb.fixes.map((f) => `<div class="fb-fix">
        <p class="fb-said">${escapeHtml(f.said)}</p>
        <p class="fb-better">→ ${escapeHtml(f.better)}</p>
        ${f.better_py ? `<p class="fb-py">${escapeHtml(f.better_py)}</p>` : ''}
        <p class="fb-why">${escapeHtml(f.why)}</p></div>`).join('')}` : ''}
    ${fb.keywords.length ? `<p class="fb-title">핵심 단어 ${used} / ${fb.keywords.length}</p>
      <div class="chips">${fb.keywords.map((k) =>
        `<span class="chip${k.used ? '' : ' unused'}">${k.used ? '✓ ' : ''}${escapeHtml(k.keyword)}</span>`).join('')}</div>` : ''}
    ${fb.next_practice.length ? `<p class="fb-title">다음에 연습할 문장</p>
      ${fb.next_practice.map((n) => `<p class="fb-next">${escapeHtml(n.en)}${n.py ? `<span class="py">${escapeHtml(n.py)}</span>` : ''}<span class="ko">${escapeHtml(n.ko)}</span></p>`).join('')}` : ''}`;
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

/* ── 기록: 이 휴대폰에 최근 30개까지 (공유 여부와 관계없이). 공유를 고르면 시트에도 저장한다. ── */

const HISTORY_KEY = 'tutoreal.history';
const HISTORY_MAX = 30;

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
    // 휴대폰 저장 공간이 모자라면 오래된 기록부터 지운다.
    for (let n = Math.min(list.length, HISTORY_MAX); n > 0; n--) {
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, n))); return; } catch { /* 줄여서 다시 */ }
    }
  } catch { /* 저장 못 해도 진행 */ }
}

async function finishReview() {
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
    show('detail');
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
const me = { name: '', avatar: '', course: 'en' };
// 대화 상대를 부르는 말: 영어 과정은 수검자(환자), 중국어 과정은 상대
// 지금 연 챕터의 과정. 선생님은 영어·중국어 챕터를 모두 쓰므로 학생의 과정이 아니라 챕터를 따른다 (30단계).
let viewCourse = '';   // 내 기록을 다시 볼 때 그 기록의 과정
const courseNow = () => viewCourse || (currentChapter && currentChapter.course) || me.course;
const partnerWord = () => (courseNow() === 'en' ? '환자' : '상대');
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
  if (!entry.feedback) parts.push('피드백 없음');
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

/* ── 내 기록에서 피드백 받기 (40단계): 피드백이 없는 대화만. 받으면 이 휴대폰의 기록에 저장한다.
   공유한 대화였다면 서버가 시트에도 채운다 (선생님 화면에 반영). ── */
let recordOpen = '';   // 지금 열려 있는 기록의 대화 번호 (기다리는 사이 다른 기록을 열었는지 확인)

function showRecordNoFeedback(e, message = '') {
  const box = $('#record-feedback');
  box.innerHTML = `<p class="state">${escapeHtml(message || '이 대화는 아직 피드백이 없어요.')}</p>
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
    if (recordOpen === e.sessionId) showRecordNoFeedback(e, errorText(err));
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
      fb.checklist.forEach((c) => out.push(`${c.done ? '✓' : c.optional ? '–' : '✗'} ${c.item}${c.optional ? ' (선택)' : ''}${c.en ? ` / ${c.en}` : ''}`));
    }
    if (fb.strengths.length) out.push('', '잘한 점', ...fb.strengths.map((x) => `- ${x}`));
    if (fb.fixes.length) {
      out.push('', '더 좋은 표현');
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
  // 다시 보는 화면이므로 환자 말도 가리지 않고 모두 보여 준다.
  // 대화 후 2/4에서 고른 어려웠던 부분은 '어려웠어요'로 표시된다.
  $('#record-lines').innerHTML = (e.lines || []).map((l) => `
    <div class="line ${l.who === 'me' ? 'me' : 'ai'}${l.hard ? ' picked' : ''}">${lineInner(l)}</div>`).join('');
  viewCourse = '';
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
      : drill.phase === 'recording' ? '<p class="recording">● 듣고 있어요. 문장을 말한 뒤 "다 말했어요"를 눌러 주세요.</p>'
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
    $('#rec-start').addEventListener('click', startCoach);
    if ($('#drill-hint')) $('#drill-hint').addEventListener('click', () => { drill.hintShown = true; renderDrill(); });
    $('#drill-reveal').addEventListener('click', () => { drill.revealed = true; drill.coachError = ''; renderDrill(); speak(plainSentence(d.sentence)); });
  } else {
    actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">🔊 다시 듣기</button>
      <button class="secondary" id="rec-start">🎤 다시 말해 보기</button></div>
      <div class="row"><button class="secondary" id="drill-hard">어려웠어요</button>
      <button class="primary" id="drill-easy">쉬웠어요</button></div>`;
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
  // 중국어 과정은 휴대폰의 중국어 음성으로 조금 더 천천히
  u.lang = courseNow() === 'zh' ? 'zh-CN' : 'en-US';
  u.rate = courseNow() === 'zh' ? 0.8 : 0.9;
  speechSynthesis.speak(u);
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
    $('#teacher-body').innerHTML = '<p class="state">요약을 불러오는 중…</p>';
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
  $('#teacher-period').textContent = `${s.period.label} · ${s.generated_at} 기준`;
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
    <div class="card t-card"><h3>공유된 대화</h3><div id="tstudent-talks"><p class="state">불러오는 중…</p></div></div>`;
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
  teacher: () => openTeacher(false), logout: confirmLogout
};
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
$('#record-share').addEventListener('click', shareRecord);
$('#back').addEventListener('click', () => show('list'));
$('#talk-start').addEventListener('click', beginTalk);
$('#talk-end').addEventListener('click', () => { if (live) { talk.endReason = 'user'; live.stop(''); } });
$('#talk-back').addEventListener('click', () => show('detail'));
$('#talk-next').addEventListener('click', openReview);
window.addEventListener('pagehide', () => { if (live) { talk.endReason = 'left'; live.stop(''); } });

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
