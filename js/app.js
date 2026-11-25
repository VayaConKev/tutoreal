// 화면 전환과 전체 흐름을 담당한다.
import { APP_VERSION } from './config.js';
import { getChapters, login, startTalk, endTalk, getFeedback, shareTalk, getSummary, checkPronunciation, setAvatar, getGloss, getStudentTalks, explainWord } from './api.js';
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
// 학습 단계 유도 (102단계): 서버 settings learning_path_published로 켜진 사람만 on. 화면은 103단계부터 이 값을 본다
let learningPath = { on: false, preview: false };
let classChapterId = '';   // 지금 수업 중인 챕터 (112단계, settings current_chapter). 비면 Beginner 첫 장
let currentChapter = null;
let live = null;        // 진행 중인 음성 대화
let talk = null;        // 진행 중인 대화의 정보 { sessionId, scenarioId, patient, readyAt, endReason, reported, limitSec, limitKind, aiSec }
let clock = null;       // 경과 시간 타이머

// 접속 코드는 이 기기의 브라우저에만 기억한다 (다음에 열 때 다시 입력하지 않도록).
const CODE_KEY = 'tutoreal.code';
// 124단계: 이번에 들어온 코드. 출입증에서 자동 체크인을 끄면 기기에는 저장하지 않고 여기에만 둔다 (서버 요청마다 쓴다)
let codeMem = '';
function loadCode() {
  if (codeMem) return codeMem;
  try { return localStorage.getItem(CODE_KEY) || ''; } catch { return ''; }
}
function saveCode(code) {
  codeMem = code || '';
  try { code ? localStorage.setItem(CODE_KEY, code) : localStorage.removeItem(CODE_KEY); } catch { /* 저장 못 해도 동작 */ }
}
/** 코드를 쓰되 기기에는 store일 때만 남긴다 (124단계) */
function keepCode(code, store) {
  saveCode(store ? code : '');
  codeMem = code;
}
// 자동 로그인: 사용자가 직접 체크했을 때만 (기본 꺼짐). 꺼져 있으면 코드만 미리 채우고 '로그인'을 눌러야 들어간다.
const AUTO_KEY = 'tutoreal.autologin';
function loadAuto() {
  try { return localStorage.getItem(AUTO_KEY) === '1'; } catch { return false; }
}
function saveAuto(on) {
  try { on ? localStorage.setItem(AUTO_KEY, '1') : localStorage.removeItem(AUTO_KEY); } catch { /* 저장 못 해도 동작 */ }
}
// 출입증 체크인 미리 보기 (123단계~): 이 기기에서 선생님·테스터 코드로 들어온 적이 있으면 새 로그인 화면 (128단계에서 모두에게 켜고 지운다).
// 주소 뒤 표시는 쓰지 않는다: 아이폰 홈 화면 앱은 Safari와 저장 공간이 달라 시험할 수 없다
const PASS_PREVIEW_KEY = 'tutoreal.passPreview';
function passOn() {
  try { return localStorage.getItem(PASS_PREVIEW_KEY) === '1'; } catch { return false; }
}
// 출입증 정보 (124단계): 체크인한 사람의 이름 · 캐릭터 · 소속 · 역할 · 번호 · SINCE를 이 기기에. 있으면 '다시 온 학생' 화면. 로그아웃하면 지운다
const PASS_PROFILE_KEY = 'tutoreal.passProfile';
function loadPassProfile() {
  try { const v = JSON.parse(localStorage.getItem(PASS_PROFILE_KEY) || 'null'); return v && v.name ? v : null; } catch { return null; }
}
function savePassProfile(p) {
  try { p ? localStorage.setItem(PASS_PROFILE_KEY, JSON.stringify(p)) : localStorage.removeItem(PASS_PROFILE_KEY); } catch { /* 괜찮음 */ }
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
  NO_PROMPT: '이 과정에서는 아직 준비 중인 기능이에요.',
  BAD_TEXT: '설명은 200자 안으로 써 주세요.',
  NO_WORD: '오늘의 단어를 찾지 못했어요. 챕터 목록으로 돌아갔다가 다시 열어 주세요.',
  EXPLAIN_LIMIT: '오늘 받을 수 있는 피드백을 다 썼어요. 내일 새 단어로 또 해 봐요.',
  EXPLAIN_BUSY: 'AI가 붐벼서 피드백을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.',
  EXPLAIN_FAILED: '피드백을 만들지 못했어요. 잠시 뒤 다시 눌러 주세요.'
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
  // 121단계: 학습 단계 유도가 켜졌으면 문장 연습 화면도 로고 줄을 숨긴다 (로고는 홈 쪽 화면에만)
  document.body.classList.toggle('no-brand', name === 'talk' || name === 'word' || (name === 'drill' && lpOn()));
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (name === 'list' && chapters.length) renderList();   // 대화·문장 연습을 하고 돌아오면 진행 상황(79단계)을 새로 센다
  if (name === 'detail') renderPath();
  if (name === 'login') renderLoginLook();   // 123단계: 출입증 또는 예전 카드   // 학습 단계 목록도 돌아올 때마다 새로 센다 (107단계)
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

/** 로그인 안내 줄: 예전 화면은 빈칸, 출입증은 늘 안내 문구 자리를 두고 글만 바꾼다 (출입증 높이 고정) */
const PASS_HINT = '코드는 선생님께 받은 그대로 입력해 주세요.';
function setLoginMsg(text) {
  $('#login-msg').textContent = text;
  $('#pass-msg-text').textContent = text || PASS_HINT;
}

/* ── 출입증 상태 (125단계): 코드 오류(빨강) / 서버 지연(주황). 높이는 그대로 두고 색 · 띠 문구 · 안내 · 버튼 글자만 바꾼다 ──
   서버 지연이면 코드는 지우지 않고 10초 뒤 저절로 다시 시도한다 (3번까지). 코드를 고치거나 다시 누르면 처음 상태로 */
const PASS_ICON = {
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5h.01"/>',
  error: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>',
  slow: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'
};
const PASS_RETRY_SEC = 10;
const PASS_RETRY_MAX = 3;
const passRetry = { n: 0, timer: 0 };
let passState = '';
function passButtonText() {
  return passState === 'error' ? '다시 체크인' : passState === 'slow' ? '지금 다시 시도' : '체크인';
}
/** kind: '' 처음 / 'error' 코드 오류 / 'slow' 서버 지연. lead는 굵게, rest는 이어서 */
function setPassState(kind, lead = '', rest = '') {
  passState = kind;
  const screen = $('#pass-screen');
  screen.classList.toggle('is-error', kind === 'error');
  screen.classList.toggle('is-slow', kind === 'slow');
  $('#pass-state').textContent = kind === 'error' ? 'CHECK-IN FAILED' : kind === 'slow' ? 'PLEASE WAIT' : 'TUTOREAL PASS';
  $('#pass-msg svg').innerHTML = PASS_ICON[kind || 'info'];
  $('#pass-msg').setAttribute('role', kind === 'error' ? 'alert' : 'status');
  if (kind) $('#pass-msg-text').innerHTML = `<b>${escapeHtml(lead)}</b> ${escapeHtml(rest)}`;
  else $('#pass-msg-text').textContent = PASS_HINT;
  $('#pass-code').setAttribute('aria-invalid', String(kind === 'error'));
  $('#pass-submit').textContent = passButtonText();
}
function stopPassRetry() {
  clearTimeout(passRetry.timer);
  passRetry.timer = 0;
}
/** 체크인 실패를 출입증 모습으로 (125단계) */
function showPassFailure(err, code) {
  stopPassRetry();
  if (err.message === 'INVALID_CODE' || err.message === 'TOO_MANY_TRIES') {
    passRetry.n = 0;
    if (err.message === 'INVALID_CODE') setPassState('error', '확인되지 않은 코드예요.', '글자와 숫자를 한 글자씩 확인해 주세요.');
    else setPassState('error', '잘못된 시도가 많아요.', '10분 뒤에 다시 해 주세요.');
    const pass = $('#pass');
    pass.classList.remove('shake');
    void pass.offsetWidth;   // 같은 오류가 다시 나도 흔들리게
    pass.classList.add('shake');
    return;
  }
  // 그 밖(응답 늦음, 연결 끊김, 서버 오류)은 서버 지연: 10초 뒤 저절로 다시 시도, 3번까지
  if (passRetry.n < PASS_RETRY_MAX) {
    passRetry.n++;
    setPassState('slow', '서버가 잠시 느려요.', `${PASS_RETRY_SEC}초 뒤 자동으로 다시 시도할게요.`);
    passRetry.timer = setTimeout(() => { passRetry.timer = 0; enter(code, true); }, PASS_RETRY_SEC * 1000);
  } else {
    setPassState('slow', '서버에 연결되지 않아요.', "잠시 뒤 '지금 다시 시도'를 눌러 주세요.");
  }
}

/** 로그인 화면 모습 (123단계): 미리 보기 기기면 출입증, 아니면 예전 카드. 띠의 날짜는 오늘 ('11.25 WED') */
const PASS_DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
let passIcon = '';   // 첫 방문의 사진 자리 (사람 모양 그림, index.html 그대로)
function renderLoginLook() {
  const on = passOn();
  $('#login-form').hidden = on;
  $('#pass-screen').hidden = !on;
  if (!on) return;
  const d = new Date();
  $('#pass-stamp').textContent = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${PASS_DAYS[d.getDay()]}`;
  // 124단계: 이 기기에 출입증 정보가 있으면 '다시 온 학생' (이름 · 캐릭터 · 소속 · 역할 · SINCE · No.), 없으면 첫 방문
  if (!passIcon) passIcon = $('#pass-photo').innerHTML;
  const p = loadPassProfile();
  $('#pass-title').textContent = p ? `${p.name} 님, 다시 오셨네요` : '오늘의 3분, 체크인';
  $('#pass-sub').textContent = p ? '오늘도 3분만 체크인해요.' : '출입증에 접속 코드를 찍고 들어가요.';
  const pic = p && p.avatar && avatars.students[p.avatar];
  $('#pass-photo').innerHTML = !p ? passIcon
    : pic ? `<img src="img/avatars/${escapeHtml(pic)}" alt="">` : escapeHtml(String(p.name).trim().charAt(0).toUpperCase());
  $('#pass-dept').textContent = p ? p.dept : 'TUTOREAL MEMBERS';
  $('#pass-name').textContent = p ? p.name : 'NEW MEMBER';
  $('#pass-role').textContent = p ? p.role : '선생님께 받은 코드로 시작해요';
  $('#pass-issue').textContent = `SINCE ${(p && p.since) || '————'} · No. ${(p && p.no) || '———'}`;
  $('#pass-switch').hidden = !p;
  if (p) $('#pass-switch').textContent = `${p.name} 님이 아닌가요? 다른 코드로 체크인`;
}

async function enter(code, auto = false) {
  const pass = passOn();
  const submit = pass ? $('#pass-submit') : $('#login-submit');
  if (pass) {
    stopPassRetry();
    if (!auto) { passRetry.n = 0; setPassState(''); }   // 직접 누르면 처음 모습으로, 자동 다시 시도는 다시 3번
  }
  submit.disabled = true;
  submit.textContent = '확인 중…';
  if (!pass || passState !== 'slow') setLoginMsg('');   // 서버 지연 안내는 다시 시도하는 동안 그대로
  try {
    const { name, role, avatar, course, server, badge } = await login(code);
    // 123단계: 선생님·테스터 코드로 들어오면 이 기기는 다음부터 출입증 화면 (미리 보기)
    if (role === 'teacher' || role === 'tester') { try { localStorage.setItem(PASS_PREVIEW_KEY, '1'); } catch { /* 괜찮음 */ } }
    if (passOn()) {
      passRetry.n = 0;
      setPassState('');
      // 124단계: 출입증에서는 자동 체크인을 켠 사람만 기기에 코드를 남긴다. 출입증 정보는 늘 남겨 다음에 '다시 온 학생'으로
      keepCode(code, loadAuto());
      const b = badge || {};
      savePassProfile({ name, avatar, dept: b.dept || 'TUTOREAL MEMBERS', role: b.role || '', no: b.no || '', since: b.since || '' });
    } else {
      saveCode(code);
    }
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
    if (pass) showPassFailure(err, code);   // 125단계: 코드 오류 / 서버 지연
    else setLoginMsg(errorText(err));
    show('login');
  } finally {
    submit.disabled = false;
    submit.textContent = pass ? passButtonText() : '로그인';
  }
}

function logout() {
  saveCode('');
  savePassProfile(null);   // 124단계: 로그아웃은 보통 다른 사람이 쓰려고 할 때라 출입증 정보도 지운다 → 첫 방문
  $('#tab-teacher').hidden = true;
  dailyWord = null;   // 다른 과정(일본어) 학생이 같은 휴대폰으로 들어올 수 있다
  renderWordCard();
  classChapterId = '';
  $('#continue-box').innerHTML = '';   // 이어서 하기 카드도 다음 사람의 챕터를 받은 뒤 다시 그린다 (109단계)
  $('#login-code').value = '';
  $('#pass-code').value = '';
  stopPassRetry();
  setPassState('');
  setLoginMsg('');
  show('login');
  (passOn() ? $('#pass-code') : $('#login-code')).focus();
}

/* ── 챕터 ── */

const COURSE_NAME = { en: '영어', ja: '일본어' };

/* 난이도 탭 (38단계): Beginner / Intermediate / Advanced. 시트 chapters 탭의 level 칸을 서버가 보내면(99단계) c.level로 나뉜다.
   칸이 비어 있으면 Beginner. 학생마다 정해 주지 않고, 기본 탭은 늘 Beginner. */
const DIFF_NAME = { beginner: 'Beginner', intermediate: 'Intermediate', advanced: 'Advanced' };
let difficulty = 'beginner';
const levelOf = (c) => (String(c.level || '').trim().toLowerCase() || 'beginner');

/** 화면에 보이는 챕터 번호 (111단계): 같은 과정·같은 난이도에서 order가 겹치면 받은 순서(시트 순서)대로 '3-1', '3-2'.
    시트의 order 값은 그대로. 지금 챕터 목록에 없으면(옛 기록의 지워진 챕터 등) 받은 order 그대로, 그것도 없으면 빈 글 */
function chapterNum(id, order) {
  const c = chapters.find((x) => x.chapter_id === id);
  if (!c) return order === undefined || order === null ? '' : String(order);
  const same = chapters.filter((x) => (x.course || 'en') === (c.course || 'en') && levelOf(x) === levelOf(c) && Number(x.order) === Number(c.order));
  return same.length > 1 ? `${c.order}-${same.indexOf(c) + 1}` : String(c.order);
}

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
  if (p.stageTotal) {   // 학습 단계 유도가 켜진 사람 (109단계)
    if (!p.talks && !p.stages && !p.last) return '';
    const parts = [`📝 단계 ${p.stages} / ${p.stageTotal}`];
    if (p.talks) parts.push(`💬 대화 ${p.talks}번`);
    if (p.last) parts.push(dayLabel(p.last));
    return `<span class="chapter-progress">${parts.map((x) => `<span>${escapeHtml(x)}</span>`).join('')}</span>`;
  }
  if (!p.talks && !p.drillsDone) return '';
  const parts = [];
  if (p.talks) parts.push(`💬 대화 ${p.talks}번`);
  if (p.drillsTotal) parts.push(`📝 문장 ${p.drillsDone}/${p.drillsTotal}`);
  if (p.last) parts.push(dayLabel(p.last));
  return `<span class="chapter-progress">${parts.map((x) => `<span>${escapeHtml(x)}</span>`).join('')}</span>`;
}

function renderList() {
  const box = $('#chapter-list');
  renderContinue();
  if (!chapters.length) {
    box.innerHTML = '<p class="state">아직 공개된 챕터가 없어요.</p>';
    return;
  }
  // 챕터가 아직 없는 난이도 탭에 '준비 중' (86단계). 누르면 지금처럼 '준비 중이에요' 카드
  document.querySelectorAll('.diff-tab').forEach((b) => {
    const soon = !chapters.some((c) => levelOf(c) === b.dataset.diff);
    b.classList.toggle('not-ready', soon);
    const tag = b.querySelector('.soon-tag');
    if (soon && !tag) b.insertAdjacentHTML('beforeend', '<small class="soon-tag">준비 중</small>');
    if (!soon && tag) tag.remove();
  });
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
  const lp = lpOn();
  const practice = lp ? loadPractice() : [];
  const steps = lp ? loadSteps() : {};
  box.innerHTML = list.map((c, i) => {
    const p = chapterProgress(c, history, marks);
    // 켜졌으면 '📝 단계 2 / 6 · 💬 대화 2번 · 오늘' (109단계): 문장 수 대신 6단계 중 마친 단계, 날짜는 새 연습 기록까지
    if (lp) { const rows = chapterPath(c).rows; p.stages = rows.filter((r) => r.done).length; p.stageTotal = rows.length; p.last = lastPracticeAt(c, history, practice, steps, marks); }
    // 완료한 챕터는 번호 대신 ✓ (화면 읽기에는 'N장 완료')
    const no = p.complete
      ? `<span class="chapter-no done"><span aria-hidden="true">✓</span><span class="visually-hidden">${escapeHtml(chapterNum(c.chapter_id, c.order))}장 완료</span></span>`
      : `<span class="chapter-no">${escapeHtml(chapterNum(c.chapter_id, c.order))}</span>`;
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
  $('#detail-no').textContent = `${chapterNum(c.chapter_id, c.order)}장`;
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
  // 세 번째 칸이 있으면 그 아래에 읽기 (py, 예: 일본어 과정의 로마자, 98단계)
  const list = c.checklist || [];
  $('#detail-checklist-box').hidden = !list.length;
  currentChapter = c;
  $('#detail-checklist').innerHTML = list.map((item) => `<li>
    <span class="ck-ko">${escapeHtml(item.text)}${checklistTags(item)}</span>
    ${checklistTarget(item)}</li>`).join('');
  const n = (c.drills || []).length;
  $('#drill-open').hidden = !n;
  // 화면 아래 버튼 줄(77단계)에서 반 칸만 쓰므로 짧게. 읽기 기능에는 '문장 30개'까지
  $('#drill-open').textContent = `문장 연습 · ${n}`;
  $('#drill-open').setAttribute('aria-label', `문장 연습, 문장 ${n}개`);
  show('detail');   // 학습 단계 목록은 show('detail')에서 그린다 (107단계)
}

/* ── 학습 단계 6개 (107단계, learningPath.on인 사람만): 문장 연습 1~3 · AI 수검자와 대화 4~6 ──
   완료: 1~3 모든 묶음의 문장을 그 단계에서 마침 (104단계 기록) / 4·5 그 모드로 대화를 끝까지 하고 저장 (106단계 기록)
         / 6 자유: 지금 챕터 완료 기준 (체크리스트 꼭 할 항목을 한 대화에서 모두, 없으면 대화 1번). 모드 기록이 없는 예전 대화도 자유
   다음 단계: 묶음마다 1→2→3, 그다음 묶음. 모든 묶음 뒤 4 → 5 → 6. 약 N분: 남은 문장 × 20초 올림 (최소 1분), 대화는 약 3분 */
const PATH_INFO = {
  read: { name: '듣고 따라 읽기', desc: '휴대폰이 읽어 주는 문장을 따라 읽어요' },
  blank: { name: '빈칸 채우기', desc: '틀을 보며 핵심 단어를 떠올려요' },
  korean: { name: '통째로 말하기', desc: '한국어만 보고 말해요' },
  script: { name: '대본 보며 대화', desc: '화면의 대사를 읽기만 해도 돼요' },
  cue: { name: '큐카드 보며 대화', desc: '한국어 키워드만 보고 말해요' },
  free: { name: '자유 대화', desc: '힌트 버튼만 있어요' }
};
const TALK_MINUTES = 3;
const drillMinutes = (n) => Math.max(1, Math.ceil(n * 20 / 60));

/** 챕터의 단계 6개 상태와 다음 단계 { rows: [{ stage, no, done, sub, group }], next: { stage, group, min, again } } */
function chapterPath(c) {
  const steps = loadSteps();
  const marks = loadDrillMarks();
  const history = loadHistory().filter((e) => e.chapterId === c.chapter_id);
  const groups = (c.drills || []).length ? drillGroups(c) : [];
  const many = groups.length > 1;
  const rows = [];
  let next = null;
  // 다음 단계: 묶음마다 1→2→3
  for (const g of groups) {
    const st = DRILL_STAGES.find((x) => !groupStageDone(c, g, x, steps, marks));
    if (st) {
      const left = stageDrills(c, st, g).filter((d) => !stageDone(d.drill_id, st, steps, marks)).length;
      next = { stage: st, group: g, min: drillMinutes(left) };
      break;
    }
  }
  if (groups.length) {
    DRILL_STAGES.forEach((st, i) => {
      // 115단계: 그 단계에 할 문장이 있는 묶음만 센다 (단어만 있는 묶음을 2·3단계 '완료'로 적지 않게)
      const real = groups.filter((g) => stageDrills(c, st, g).length);
      const doneGroups = real.filter((g) => groupStageDone(c, g, st, steps, marks));
      const cur = real.find((g) => !doneGroups.includes(g));
      const done = cur === undefined;
      let sub = PATH_INFO[st].desc;
      if (done) sub = many ? '모든 묶음 완료' : '완료';
      else {
        const curList = stageDrills(c, st, cur);
        const curDone = curList.filter((d) => stageDone(d.drill_id, st, steps, marks)).length;
        if (doneGroups.length || curDone) {
          sub = [doneGroups.length ? `${doneGroups.map(groupLabel).join('·')} 묶음 완료` : '',
            curDone ? `${many ? `${groupLabel(cur)} ` : ''}${curDone} / ${curList.length}` : ''].filter(Boolean).join(' · ');
        }
      }
      rows.push({ stage: st, no: i + 1, done, sub, group: done ? groups[0] : cur });
    });
  }
  // 대화 4~6
  const required = (c.checklist || []).filter((x) => !x.optional);
  const allDone = (e) => {
    const r = ((e.feedback && e.feedback.checklist) || []).filter((x) => !x.optional);
    return r.length > 0 && r.every((x) => x.done);
  };
  TALK_MODES.forEach((m, i) => {
    const talks = history.filter((e) => (m === 'free' ? !e.mode || e.mode === 'free' : e.mode === m));
    const done = m === 'free' ? (required.length ? talks.some(allDone) : talks.length > 0) : talks.length > 0;
    let sub = PATH_INFO[m].desc;
    if (talks.length) sub = `대화 ${talks.length}번${!done ? ' · 체크리스트를 모두 하면 완료' : ''}`;
    rows.push({ stage: m, no: i + 4, done, sub });
  });
  if (!next) {
    const m = TALK_MODES.find((x) => !rows.find((r) => r.stage === x).done);
    next = m ? { stage: m, min: TALK_MINUTES } : { stage: 'free', min: TALK_MINUTES, again: true };
  }
  return { rows, next, hasDrills: groups.length > 0, many };
}

/* ── 홈 '이어서 하기' 카드 (109단계, UI 예시 ①, learningPath.on인 사람만) ──
   챕터: 이 휴대폰에서 가장 최근에 연습한 챕터. 6단계를 모두 마쳤으면 같은 과정·난이도의 다음 장 (없으면 그 챕터에서 자유 대화 한 번 더).
   기록이 없으면 지금 수업 중인 챕터 (112단계, settings current_chapter), 비었으면 Beginner 첫 장. 단계·묶음은 챕터 화면 '다음 단계' 버튼과 같은 계산 (chapterPath) */
const CONTINUE_SEEN_KEY = 'tutoreal.continueSeen';   // '새 기능' 표시: 카드를 한 번 누르면 이 휴대폰에서는 숨긴다
const toMs = (x) => (typeof x === 'number' ? x : Date.parse(x)) || 0;

/** 이 챕터를 마지막으로 연습한 때 (대화 기록, 문장 연습 기록, 단계 기록, 예전 문장 연습 표시). 없으면 0 */
function lastPracticeAt(c, history, practice, steps, marks) {
  const times = history.filter((e) => e.chapterId === c.chapter_id).map((e) => toMs(e.at))
    .concat(practice.filter((p) => p.chapterId === c.chapter_id).map((p) => toMs(p.at)));
  (c.drills || []).forEach((d) => {
    const st = steps[d.drill_id] || {};
    DRILL_STAGES.forEach((x) => { if (st[x]) times.push(toMs(st[x])); });
    if (marks[d.drill_id]) times.push(toMs(marks[d.drill_id].at));
  });
  return Math.max(0, ...times.filter((t) => t > 0));
}

/** 이어서 할 곳 { c, path, first } 또는 null (챕터가 없음) */
function continueTarget() {
  const history = loadHistory();
  const practice = loadPractice();
  const steps = loadSteps();
  const marks = loadDrillMarks();
  let c = null;
  let at = 0;
  chapters.forEach((x) => { const t = lastPracticeAt(x, history, practice, steps, marks); if (t > at) { c = x; at = t; } });
  if (!c) {
    // 기록이 없으면 지금 수업 중인 챕터 (112단계), 없으면 Beginner 첫 장
    const first = chapters.find((x) => x.chapter_id === classChapterId) || chapters.find((x) => levelOf(x) === 'beginner') || chapters[0];
    return first ? { c: first, path: chapterPath(first), first: true } : null;
  }
  let path = chapterPath(c);
  if (path.next.again) {
    // 서버가 과정별·순서대로 보낸다
    const same = chapters.filter((x) => x.course === c.course && levelOf(x) === levelOf(c));
    const nx = same[same.indexOf(c) + 1];
    if (nx) { c = nx; path = chapterPath(nx); }
  }
  return { c, path, first: false };
}

function renderContinue() {
  const box = $('#continue-box');
  $('#greet-sub').textContent = lpOn() ? '오늘도 한 묶음만 해 봐요.' : '오늘도 한 문장씩 연습해 봐요.';
  const t = lpOn() && chapters.length ? continueTarget() : null;
  if (!t) { box.innerHTML = ''; return; }
  const { c, path, first } = t;
  const { next, rows, many } = path;
  const name = PATH_INFO[next.stage].name;
  const no = (rows.find((r) => r.stage === next.stage) || {}).no || 1;
  const drillStage = DRILL_STAGES.includes(next.stage);
  let sub;
  let ratio;
  if (drillStage) {
    const list = stageDrills(c, next.stage, next.group);
    const steps = loadSteps();
    const marks = loadDrillMarks();
    const done = list.filter((d) => stageDone(d.drill_id, next.stage, steps, marks)).length;
    sub = `${no}단계 ${name} · ${done} / ${list.length} 문장`;
    ratio = list.length ? done / list.length : 0;
  } else {
    sub = `${no}단계 ${name}${next.again ? ' · 한 번 더' : ''}`;
    ratio = rows.filter((r) => r.done).length / rows.length;
  }
  if (first) { sub = `${no}단계 ${name}부터 시작해요`; ratio = 0; }
  let seen = false;
  try { seen = localStorage.getItem(CONTINUE_SEEN_KEY) === '1'; } catch { /* 저장 못 하면 늘 보임 */ }
  const pct = Math.round(ratio * 100);
  box.innerHTML = `<section class="continue-card" aria-labelledby="continue-title">
      <div class="continue-top"><span class="continue-label">${first ? '시작하기' : '이어서 하기'}</span>${seen ? '' : '<span class="continue-new">새 기능</span>'}</div>
      <p class="continue-title" id="continue-title">${escapeHtml(`${chapterNum(c.chapter_id, c.order)}장 · ${drillStage && many && !first ? `${groupLabel(next.group)} 묶음` : c.title}`)}</p>
      <p class="continue-sub">${escapeHtml(sub)}</p>
      <div class="continue-bar" role="progressbar" aria-label="진행" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div>
      <button type="button" class="continue-go" id="continue-go">${first ? `${escapeHtml(chapterNum(c.chapter_id, c.order))}장 시작하기` : '이어서 하기'} · 약 ${next.min}분</button>
    </section>`;
  // 120단계: 카드 어디를 눌러도 들어간다 (버튼을 누르면 이 클릭이 카드까지 올라온다). '새 기능' 표시는 한 번 누르면 숨긴다
  box.querySelector('.continue-card').addEventListener('click', () => {
    try { localStorage.setItem(CONTINUE_SEEN_KEY, '1'); } catch { /* 저장 못 해도 진행 */ }
    openChapter(c.chapter_id);   // 돌아오기를 누르면 그 챕터 화면
    goPathStage(next.stage, next.group);
  });
}

/** 단계로 들어가기: 문장 단계는 그 단계에서 아직 안 끝난 첫 묶음부터, 대화 단계는 그 모드가 고른 시작 전 화면 */
function goPathStage(stage, group) {
  if (DRILL_STAGES.includes(stage)) {
    drill.level = stage;
    drill.group = group !== undefined ? group : (drillGroups(currentChapter)[0] || '');
    startDrill();
  } else {
    openTalk(stage);
  }
}

/** 챕터 화면: 켜졌으면 단계 카드·다음 단계 버튼·접힌 챕터 내용, 꺼졌으면 예전 두 버튼 */
function renderPath() {
  const c = currentChapter;
  const lp = lpOn() && !!c;
  $('#view-detail').classList.toggle('lp', lp);
  $('#path-card').hidden = !lp;
  $('#path-next').hidden = !lp;
  $('#talk-start').hidden = lp;
  if (!lp) {
    $('#detail-more').open = true;
    $('#drill-open').hidden = !(c && (c.drills || []).length);
    return;
  }
  $('#drill-open').hidden = true;
  const { rows, next, hasDrills, many } = chapterPath(c);
  const row = (r) => {
    const now = r.stage === next.stage && !next.again;
    return `<button type="button" class="path-row${now ? ' now' : ''}${r.done ? ' done' : ''}" data-stage="${r.stage}"${r.group !== undefined ? ` data-group="${escapeHtml(r.group)}"` : ''}>
      <span class="path-dot" aria-hidden="true">${r.done ? '✓' : r.no}</span>
      <span class="path-text"><span class="path-name">${PATH_INFO[r.stage].name}</span><span class="path-sub">${escapeHtml(r.sub)}</span></span>
      <span class="visually-hidden">${r.done ? '완료' : now ? '지금 할 단계' : ''}</span>
    </button>`;
  };
  $('#path-card').innerHTML = `${hasDrills ? `<p class="path-label">문장 연습</p>${rows.filter((r) => DRILL_STAGES.includes(r.stage)).map(row).join('')}<hr class="path-hr">` : ''}
    <p class="path-label">AI 수검자와 대화</p>${rows.filter((r) => TALK_MODES.includes(r.stage)).map(row).join('')}`;
  $('#path-card').querySelectorAll('.path-row').forEach((b) => b.addEventListener('click', () => goPathStage(b.dataset.stage, b.dataset.group)));
  // 다음 단계 버튼 (UI 예시): 위 '다음 단계 · 약 N분', 아래 '단계 이름 · 묶음 이름'
  const where = DRILL_STAGES.includes(next.stage) && many ? ` · ${groupLabel(next.group)} 묶음` : '';
  const short = { read: '따라 읽기', blank: '빈칸 채우기', korean: '통째로 말하기', script: '대본 보며 대화', cue: '큐카드 보며 대화', free: '자유 대화' }[next.stage];
  $('#path-next').innerHTML = `<span class="path-next-top">${next.again ? '모든 단계 완료 · 약' : '다음 단계 · 약'} ${next.min}분</span>
    <span class="path-next-main">${short}${where}${next.again ? ' · 한 번 더' : ''}</span>`;
  $('#path-next').onclick = () => goPathStage(next.stage, next.group);
  // 처음 열 때는 챕터 내용을 접어 둔다 (학생이 펼쳐 둔 것은 그 챕터를 보는 동안 유지)
  if ($('#detail-more').dataset.chapter !== c.chapter_id) { $('#detail-more').open = false; $('#detail-more').dataset.chapter = c.chapter_id; }
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
    const { chapters: list, server, dailyWord: dw, learningPath: lp, currentChapter: cur } = await getChapters(loadCode());
    chapters = list;
    learningPath = lp;
    classChapterId = cur;
    dailyWord = dw;
    renderWordCard();
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
   일본어 과정: 상대의 말이 끝나면 서버에서 로마자와 한국어 뜻을 받아 넣는다. 뜻은 '뜻 보기'를 눌러야 보인다. */
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
      (glossCourse() && who === 'ai' ? '<span class="py"></span>' : '') +
      (glossCourse() && who === 'ai' ? '<button class="ko-btn" hidden>뜻 보기</button><span class="ko" hidden></span>' : '');
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
  const ai = transcript.ai;
  transcript.me = null;
  transcript.ai = null;
  if (ai && glossCourse()) glossLine(ai);
  if (talkUi.active) renderTalkCard();   // 대본·큐카드: 내 차례가 끝날 때마다 다음 줄로 (106단계)
}

/** 상대의 말에 읽기·뜻을 붙이는 과정: 일본어(로마자, 94단계). 휴대폰에서 읽기를 만들 수 없어 서버 답이 올 때 보인다. */
const glossCourse = () => courseNow() === 'ja';

/** 상대의 말 한 줄: 서버에서 로마자·뜻을 받아 넣고 '뜻 보기' 버튼을 보여 준다. 서버 칸 이름은 pinyin(= 그 줄의 읽기). */
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
    .catch((err) => { console.warn('로마자·뜻 실패', err); e.koFailed = err.message || 'ERROR'; })
    .finally(showKo);
}

/** 사용 시간 기록을 서버에 보낸다. 한 대화에 한 번만. */
function reportEnd(t) {
  if (!t.sessionId || t.reported) return;
  t.reported = true;
  const sec = t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0;
  const reason = t.endReason || (t.readyAt ? 'closed' : 'error');
  endTalk(loadCode(), t.sessionId, sec, reason, Math.round(t.aiSec || 0));
}

/* ── 대화 모드 (106단계, learningPath.on인 사람만): 대본 / 큐카드 / 자유 ──
   모드는 연결 전에 고른다 (서버가 지시문을 입장권에 고정). 대화 중 탭은 아래 카드 모양만 바꾼다.
   대본 카드: 다음 간호사 대사 + 한국어 큐, '대본 전체 보기'로 수검자 기본 답까지. 다음 줄은 내가 말한 횟수로 대략 (턴별 추적 없음)
   큐카드: 한국어 큐만 / 자유: 힌트 버튼 (챕터 핵심 단어 중 아직 내 자막에 없는 것 하나, AI 비용 없음) */
const TALK_MODES = ['script', 'cue', 'free'];
const TALK_TAB = { script: '대본', cue: '큐카드', free: '자유' };
const TALK_DESC = {
  script: '화면의 대사를 읽기만 해도 돼요. 수검자는 정해진 대답을 해요.',
  cue: '한국어 키워드만 보고 말해요. 수검자가 가끔 다르게 대답해요.',
  free: '대본 없이 말해요. 막히면 힌트 버튼을 눌러요.'
};
const talkUi = { mode: 'script', view: 'script', active: false, started: false, script: [], offset: 0, startGroup: null, scenario: null, expanded: false, hints: 0, hintShown: [] };
/** 이 챕터에서 그 모드로 대화한 적이 있나 (이 휴대폰의 기록) */
const talkModeDone = (chapterId, mode) => loadHistory().some((e) => e.chapterId === chapterId && e.mode === mode);

/** 챕터의 '대화 시작'·문장 연습의 '대화 시작하기'·기록의 '이어서 연습하기': 켜졌으면 모드를 고르는 시작 전 화면, 아니면 예전처럼 바로.
    group: 묶음 완료 화면에서 들어오면 그 묶음 (대본 카드를 그 묶음 첫 줄부터, 108단계) */
function openTalk(pick, group) {
  if (!lpOn()) return withMicIntro(() => beginTalk());
  if (live || !currentChapter) return;
  talkUi.startGroup = typeof group === 'string' ? group : null;
  // 챕터의 단계 줄에서 고른 모드, 아니면 아직 안 해 본 가장 쉬운 모드 (107단계)
  talkUi.mode = TALK_MODES.includes(pick) ? pick : (TALK_MODES.find((m) => !talkModeDone(currentChapter.chapter_id, m)) || 'script');
  talkUi.view = talkUi.mode;
  talkUi.active = false;
  talkUi.started = false;
  $('#view-talk').classList.add('lp');
  $('#talk-head').hidden = true;
  $('#talk-calling').hidden = true;
  $('#transcript').innerHTML = '';
  transcript.lines = [];
  $('#talk-info').hidden = true;
  $('#talk-meter').hidden = true;
  $('#talk-go').hidden = true;
  $('#talk-end').hidden = true;
  $('#talk-next').hidden = true;
  $('#talk-begin').hidden = false;
  $('#talk-back').hidden = true;   // 119단계: 돌아가기는 머리줄 '‹ N장'으로
  $('#talk-card').hidden = true;
  setTalkStatus('');
  // 119단계: 이번 대화의 수검자를 미리 골라 EMR로 보여 주고, 같은 수검자로 대화한다 (예전 서버는 목록이 없어 서버가 고른다)
  const sc = currentChapter.scenarios || [];
  talkUi.scenario = sc.length ? sc[Math.floor(Math.random() * sc.length)] : null;
  $('#view-talk').classList.add('pre');
  setTalkBar('before');
  renderTalkModes();
  show('talk');
}

/** 대화 전 설명 카드 (119단계): 고른 방식 이름·설명, EMR(이름 · 성별 · 생년월일 · 검사 · 수면), 미리 보기 2~3줄, 약 3분, 마이크 안내 */
function renderTalkBrief() {
  const box = $('#talk-brief');
  const mode = talkUi.mode;
  const p = talkUi.scenario;
  const sexKo = p ? ({ male: '남', female: '여' }[String(p.sex || '').toLowerCase()] || '') : '';
  const sed = p ? ({ with: '수면', without: '비수면' }[p.sedation] || '') : '';
  const emr = p ? `<div class="brief-emr"><p class="brief-emr-name"><b>EMR</b>${escapeHtml(p.name)}</p>
      <p class="brief-emr-meta">${escapeHtml([sexKo, p.dob, p.exam, sed].filter(Boolean).join(' · '))}</p></div>` : '';
  // 미리 보기: 단어가 아닌 문장을 대본 순서대로 (묶음 완료 화면에서 왔으면 그 묶음 첫 문장부터) 3줄
  const lines = (currentChapter.drills || []).filter((d) => d.kind !== 'word');
  const first = talkUi.startGroup !== null && talkUi.startGroup !== undefined
    ? Math.max(0, lines.findIndex((d) => (d.group || '') === talkUi.startGroup)) : 0;
  const pick = lines.slice(first, first + 3);
  let preview = '';
  if (mode === 'free') preview = '<p class="brief-free">화면에 대사는 나오지 않고, 힌트 버튼만 있어요.</p>';
  else if (pick.length) {
    preview = `<ol class="brief-lines">${pick.map((d) => `<li>${escapeHtml(mode === 'cue' ? (d.cue || d.situation) : plainSentence(d.sentence))}</li>`).join('')}</ol>`;
  }
  box.innerHTML = `<p class="brief-mode">${PATH_INFO[mode].name}</p>
    <p class="brief-desc">${TALK_DESC[mode]}</p>
    ${emr}
    ${preview ? `<p class="brief-label">${mode === 'script' ? '내 첫 대사' : mode === 'cue' ? '큐카드' : '힌트'} 미리 보기</p>${preview}` : ''}
    <p class="brief-foot">약 ${TALK_MINUTES}분 · 마이크를 써요. 목소리는 저장하지 않아요.</p>`;
  box.hidden = false;
}

/* ── 대화 머리줄 (113단계, 모드 대화만): '‹ N장 | 제목 | 종료' ──
   state: 'before' 시작 전 / 'live' 대화 중 ('‹' 숨김, '종료') / 'after' 끝난 뒤 / 'off' 예전 화면 (아래 '대화 끝내기')
   canLeave: 끝난 뒤 '‹'를 보일지 (말했으면 대화 후 화면으로 가야 기록이 남으므로 숨긴다) */
let quitTimer = 0;
function setTalkBar(state, canLeave = true) {
  setQuitArmed(false);
  $('#talk-bar').hidden = state === 'off' || !currentChapter;
  if ($('#talk-bar').hidden) return;
  $('#talk-bar-back').textContent = `‹ ${chapterNum(currentChapter.chapter_id, currentChapter.order)}장`;
  $('#talk-bar-title').textContent = currentChapter.title;
  $('#talk-bar-back').hidden = state === 'live' || !canLeave;
  $('#talk-quit').hidden = state !== 'live';
}
/** '종료'를 한 번 누른 상태: '정말 종료?'와 말풍선, 3초 뒤 저절로 원래대로 */
function setQuitArmed(on) {
  clearTimeout(quitTimer);
  quitTimer = on ? setTimeout(() => setQuitArmed(false), 3000) : 0;
  $('#talk-quit').classList.toggle('armed', on);
  $('#talk-quit').textContent = on ? '정말 종료?' : '종료';
  $('#talk-quit-tip').hidden = !on;
}

/** 대본 카드의 첫 줄: 묶음 완료 화면에서 들어왔으면 그 묶음의 첫 문장 (서버 대본 줄의 번호 d04와 drill_id 끝을 맞춘다), 아니면 첫 줄 */
function scriptStart(lines, group) {
  if (group === null || group === undefined || !currentChapter) return 0;
  const d = groupDrills(currentChapter, group).find((x) => x.kind !== 'word');   // 117단계: 대본에는 단어 줄이 없다
  const m = d && String(d.drill_id).match(/-(d\d+)$/i);
  const i = m ? lines.findIndex((l) => l.n === m[1].toLowerCase()) : -1;
  return i > 0 ? i : 0;
}

/** 대화 모드 탭: 4 대본 / 5 큐카드 / 6 자유 (해 본 모드는 ✓). 시작 전에는 모드를, 대화 중에는 카드 모양만 고른다 */
function renderTalkModes() {
  const box = $('#talk-modes');
  box.hidden = false;
  const cid = currentChapter ? currentChapter.chapter_id : '';
  const pick = talkUi.started ? talkUi.view : talkUi.mode;
  box.querySelectorAll('.level').forEach((b) => {
    const m = b.dataset.mode;
    const done = talkModeDone(cid, m);
    b.textContent = `${done ? '✓' : TALK_MODES.indexOf(m) + 4} ${TALK_TAB[m]}`;
    b.classList.toggle('on', m === pick);
    b.classList.toggle('done', done);
    b.setAttribute('aria-pressed', String(m === pick));
  });
  $('#talk-mode-desc').hidden = true;   // 119단계: 방식 설명은 대화 전 설명 카드 안으로
  if (talkUi.started) $('#talk-brief').hidden = true;
  else renderTalkBrief();
}

/** 대화 중 아래 카드 (UI 예시의 둥근 시트) */
function renderTalkCard() {
  const card = $('#talk-card');
  if (!talkUi.active) { card.hidden = true; return; }
  card.hidden = false;
  const lines = talkUi.script || [];
  const view = talkUi.view === 'free' || !lines.length ? 'free' : talkUi.view;
  if (view === 'free') {
    const word = talkUi.hintShown[talkUi.hintShown.length - 1];
    card.innerHTML = `${word !== undefined ? `<p class="talk-card-label">힌트</p><p class="talk-card-line">${escapeHtml(word || '핵심 단어를 모두 말했어요!')}</p>` : ''}
      <button class="secondary" id="talk-hint">힌트</button>`;
    $('#talk-hint').addEventListener('click', showTalkHint);
    return;
  }
  const said = transcript.lines.filter((l) => l.who === 'me' && l.text.trim()).length;
  const i = Math.max(0, Math.min(lines.length - 1, said + talkUi.offset));
  const l = lines[i];
  const head = `<div class="talk-card-head"><span>${view === 'script' ? '내 차례 · 이 대사를 읽어 보세요' : '내 차례 · 이렇게 말해 보세요'}</span><b>${i + 1} / ${lines.length}</b></div>`;
  const body = view === 'script'
    ? `<p class="talk-card-line" lang="${courseNow() === 'ja' ? 'ja' : 'en'}">${escapeHtml(l.nurse)}</p><p class="talk-card-sub">${escapeHtml(l.cue)}</p>`
    : `<p class="talk-card-line">${escapeHtml(l.cue)}</p>`;
  const all = view === 'script' ? `<button class="link talk-card-all" id="talk-card-all" aria-expanded="${talkUi.expanded}">${talkUi.expanded ? '대본 접기 ▴' : '대본 전체 보기 ▾'}</button>
    ${talkUi.expanded ? `<ol class="talk-script">${lines.map((x, k) => `<li><button type="button" class="talk-script-line${k === i ? ' now' : ''}" data-i="${k}">
      <span class="who">나</span><span lang="${courseNow() === 'ja' ? 'ja' : 'en'}">${escapeHtml(x.nurse)}</span>
      ${x.answer ? `<span class="who">${partnerWord()}</span><span class="ans">${escapeHtml(x.answer)}</span>` : ''}</button></li>`).join('')}</ol>` : ''}` : '';
  card.innerHTML = head + body + all;
  if ($('#talk-card-all')) $('#talk-card-all').addEventListener('click', () => { talkUi.expanded = !talkUi.expanded; renderTalkCard(); });
  // 펼친 대본에서 줄을 누르면 그 줄로 옮긴다 (턴별 추적 대신)
  card.querySelectorAll('.talk-script-line').forEach((b) => b.addEventListener('click', () => {
    talkUi.offset = Number(b.dataset.i) - said;
    talkUi.expanded = false;
    renderTalkCard();
  }));
}

/** 자유 모드 힌트: 챕터 핵심 단어 중 아직 내 자막에 없는 것 하나 (순서대로). 누른 횟수는 이 휴대폰 기록에만 */
function showTalkHint() {
  const mine = transcript.lines.filter((l) => l.who === 'me').map((l) => l.text.toLowerCase()).join(' ');
  const word = (currentChapter.keywords || []).find((k) => !mine.includes(k.toLowerCase()) && !talkUi.hintShown.includes(k));
  talkUi.hintShown.push(word || '');
  talkUi.hints++;
  renderTalkCard();
}

async function beginTalk(mode = '') {
  if (live || !currentChapter) return;
  if (!TALK_MODES.includes(mode)) mode = '';
  // 학습 단계 유도 (106단계): 모드를 골라 시작했으면 탭·카드를 쓰고, 아니면 예전 화면
  $('#view-talk').classList.toggle('lp', !!mode);
  $('#view-talk').classList.remove('pre');
  $('#talk-brief').hidden = true;
  $('#talk-modes').hidden = !mode;
  $('#talk-mode-desc').hidden = true;
  $('#talk-begin').hidden = true;
  $('#talk-card').hidden = true;
  Object.assign(talkUi, { mode: mode || 'script', view: mode || 'script', active: false, started: !!mode, script: [], offset: 0, expanded: false, hints: 0, hintShown: [] });
  if (mode) renderTalkModes();
  $('#difficulty').placeholder = '이름 철자를 묻는 게 어려웠어요';
  const t = { sessionId: null, scenarioId: '', patient: null, readyAt: 0, endReason: '', reported: false, limitSec: 0, limitKind: '', mode };
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
  $('#talk-head').classList.toggle('emr', !!mode);   // 106단계: 한 줄 EMR
  $('#talk-chapter').textContent = `${chapterNum(currentChapter.chapter_id, currentChapter.order)}장 · ${currentChapter.title}`;
  // '수검자가 오고 있습니다…'와 걸어오는 수검자 그림 (49단계, 영어·일본어). 수검자가 준비되면(슬립·연결) 또는 끝나면 숨긴다
  $('#talk-name').textContent = '수검자가 오고 있습니다…';
  $('#talk-calling').hidden = false;
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
  $('#talk-end').hidden = !!mode;   // 113단계: 모드 대화는 머리줄 '종료'로 끝낸다
  setTalkBar(mode ? 'live' : 'off');
  $('#talk-next').hidden = true;
  $('#talk-back').hidden = true;
  show('talk');

  const session = live;
  try {
    setTalkStatus('마이크 준비 중…');
    await session.openMic();
    if (session.ended) return;   // 준비 중에 '끝내기'를 누른 경우
    setTalkStatus(`${partnerTitle()}를 부르는 중…`);
    const { token, model, patient, sessionId, scenarioId, server, limitSec, limitKind, slip, script } = await startTalk(loadCode(), currentChapter.chapter_id, mode, mode && talkUi.scenario ? talkUi.scenario.scenario_id : '');
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
    // 생년월일 · 검사. 모드 대화(106단계)는 한 줄 EMR: 성별 · 생년월일 · 검사 (1장 본인 확인에 생년월일이 필요해서 넣는다)
    const sexKo = { male: '남', female: '여' }[String(patient.sex || '').toLowerCase()] || '';
    $('#talk-meta').textContent = (mode ? [sexKo, patient.dob, patient.exam] : [patient.dob, patient.exam]).filter(Boolean).join(' · ') || '–';
    if (mode) {   // 대본·큐카드·자유 카드: 입장권을 받으면 바로 보여 준다 (연결되는 동안 첫 대사를 미리 볼 수 있게)
      talkUi.script = Array.isArray(script) ? script : [];
      talkUi.offset = scriptStart(talkUi.script, talkUi.startGroup);
      talkUi.active = true;
      renderTalkCard();
    }
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
  talkUi.active = false;
  $('#talk-card').hidden = true;
  $('#talk-modes').hidden = true;
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
    durationSec: t.readyAt ? Math.round((Date.now() - t.readyAt) / 1000) : 0,
    mode: t.mode || '', hints: t.mode ? talkUi.hints : 0   // 106단계: 대화 모드와 힌트 누른 횟수 (이 휴대폰 기록)
  } : null;
  // 피드백은 대화가 끝나는 이 순간부터 만든다. 학생이 대화 후 화면 1~3단계를 하는 동안 준비된다 (31단계).
  if (review.data) loadFeedback(review.data);
  $('#talk-end').hidden = true;
  setTalkBar(t.mode ? 'after' : 'off', !spoke);
  $('#talk-next').hidden = !spoke;
  $('#talk-back').hidden = spoke || !!t.mode;   // 119단계: 모드 대화는 머리줄 '‹ N장'으로 돌아간다
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

/** 체크리스트의 따라 읽을 문장과 읽기 (98단계: 세 번째 칸 py). lang은 과정 언어 — 일본어 한자가 중국어 글꼴로 보이지 않게 */
function checklistTarget(item) {
  return (item.en ? `<span class="ck-en" lang="${courseNow() === 'en' ? 'en' : courseNow()}">${escapeHtml(item.en)}</span>` : '') +
    (item.py ? `<span class="ck-py">${escapeHtml(item.py)}</span>` : '');
}

/** 체크리스트 항목 옆의 작은 표시: 선택(가끔만 하는 안내), 남성·여성(그 성별의 상대에게만, 34단계), 수면·대장·위(그 검사의 상대에게만, 100단계) */
function checklistTags(item) {
  const SEX = { male: `남성 ${partnerTitle()}만`, female: `여성 ${partnerTitle()}만` };
  const EXAM = { sedation: '수면', colon: '대장 검사', stomach: '위 검사' };
  return (item.when || []).map((w) => ` <span class="opt-tag">${EXAM[w] || ''} ${partnerTitle()}만</span>`).join('') +
    (item.sex ? ` <span class="opt-tag">${SEX[item.sex] || ''}</span>` : '') +
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
        ${checklistTarget(c)}</span>
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

/** 기다리는 동안 보여 줄 복습 문장: 체크리스트(성별·검사 표시가 없는 항목)가 있으면 그것, 없으면 문장 연습. [{ ko, target, py }] */
function waitTips(chapter) {
  const course = chapter.course || me.course;
  const ja = course === 'ja';   // 일본어: 띄어쓰기가 없어 단어 하나짜리를 가릴 수 없으니 모두, 읽기는 pron 칸의 로마자 (96단계)
  const plain = (s) => s.replace(/\[([^\]]+)\]/g, '$1');
  const fromChecklist = (chapter.checklist || []).filter((c) => !c.sex && !c.when && c.en)
    .map((c) => ({ ko: c.text, target: c.en, py: c.py || '' }));
  if (fromChecklist.length) return fromChecklist;
  return (chapter.drills || []).filter((d) => /\s/.test(plain(d.sentence).trim()) || ja)   // 단어 하나짜리는 빼고 문장만
    .map((d) => ({ ko: d.situation.replace(/^단어:\s*/, ''), target: plain(d.sentence), py: ja ? plain(d.pron || '') : '' }));
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

/** 대화 한 줄 (대화 후 2/4 고르기와 내 기록 보기가 같이 쓴다). 받아 둔 읽기(일본어 로마자, 옛 중국어 기록의 병음)와 뜻이 있으면 함께. */
function lineInner(l) {
  const py = l.py || '';
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
  const saved = !!(review.data && review.data.saved);
  $('#review-prev').hidden = n === 1 || saved;
  $('#review-next').textContent = n === REVIEW_STEPS ? (saved ? SAVED_LABEL : '완료') : '다음';
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
    ...(d.mode ? { mode: d.mode } : {}), ...(d.hints ? { hints: d.hints } : {}),   // 106단계: 대화 모드(대본·큐카드·자유)와 힌트 횟수
    // 일본어 과정: 서버에서 받은 로마자(py)와 뜻(ko)도 함께 남긴다. hard: 대화 후 2/4에서 고른 어려웠던 부분
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
  const practice = loadPractice();
  const steps = loadSteps();
  if (!list.length && !practice.length) { msg.textContent = '아직 백업할 기록이 없어요.'; return; }
  const today = new Date().toISOString().slice(0, 10);
  // 버전 2 (104단계): 문장 연습 기록(practice)과 단계 기록(steps)을 더한다. 예전 앱은 records만 읽으므로 그대로 불러올 수 있다
  const json = JSON.stringify({ type: BACKUP_TYPE, version: 2, exported_at: new Date().toISOString(), records: list, practice, steps });
  const name = `tutoreal-backup-${today}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Tutoreal 기록 백업' });
      msg.textContent = `기록 ${list.length}개${practice.length ? `와 문장 연습 ${practice.length}개` : ''}를 백업했어요. 이 파일에는 내 대화가 들어 있으니 다른 사람에게 보내지 마세요.`;
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
  msg.textContent = `기록 ${list.length}개${practice.length ? `와 문장 연습 ${practice.length}개` : ''}를 '${name}' 파일로 내려받았어요.`;
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
    chapterOrder: Number(r.chapterOrder) || '', course: ['zh', 'ja'].includes(r.course) ? r.course : 'en',   // zh: 101단계 전에 저장한 옛 중국어 기록 (그대로 둔다)
    chapterTitle: str(r.chapterTitle),
    at: new Date(r.at).toISOString(), durationSec: Number(r.durationSec) || 0,
    patient: { name: str(r.patient && r.patient.name) }, confidence: [1, 2, 3].includes(r.confidence) ? r.confidence : undefined,
    difficulty: str(r.difficulty), shared: r.shared === true, lines, feedback: fbOk ? fb : null,
    ...(TALK_MODES.includes(r.mode) ? { mode: r.mode } : {}), ...(Number(r.hints) > 0 ? { hints: Number(r.hints) } : {})
  };
}

/** 불러온 문장 연습 기록 하나 (104단계). 모양이 맞지 않으면 null */
function cleanPractice(p) {
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || !p.id || !DRILL_STAGES.includes(p.stage) || Number.isNaN(Date.parse(p.at))) return null;
  const str = (v) => (typeof v === 'string' ? v : '');
  return { id: p.id, chapterId: str(p.chapterId), chapterOrder: Number(p.chapterOrder) || '', chapterTitle: str(p.chapterTitle),
    course: p.course === 'ja' ? 'ja' : 'en', stage: p.stage, group: str(p.group), done: Math.max(0, Number(p.done) || 0),
    total: Math.max(0, Number(p.total) || 0), complete: p.complete === true, at: new Date(p.at).toISOString(), sec: Math.max(0, Number(p.sec) || 0) };
}
/** 단계 기록 합치기: 같은 문장·단계는 더 이른 시각을 남긴다. 더한 개수를 돌려준다 */
function mergeSteps(incoming) {
  if (!incoming || typeof incoming !== 'object') return 0;
  const steps = loadSteps();
  let added = 0;
  Object.keys(incoming).forEach((id) => {
    const v = incoming[id];
    if (!v || typeof v !== 'object') return;
    DRILL_STAGES.forEach((st) => {
      const t = Number(v[st]);
      if (!(t > 0)) return;
      steps[id] = steps[id] || {};
      if (!steps[id][st]) added++;
      if (!steps[id][st] || t < steps[id][st]) steps[id][st] = t;
    });
  });
  saveSteps(steps);
  return added;
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
  // 문장 연습 (버전 2): 같은 회차는 겹치지 않게, 최근 것부터 300개까지
  const inPractice = (Array.isArray(data.practice) ? data.practice : []).map(cleanPractice).filter(Boolean);
  const havePractice = loadPractice();
  const practiceIds = new Set(havePractice.map((p) => p.id));
  const newPractice = inPractice.filter((p) => !practiceIds.has(p.id));
  if (newPractice.length) savePractice(havePractice.concat(newPractice).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)));
  mergeSteps(data.steps);
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
  const parts = [];
  if (added) parts.push(`새 기록 ${added}개를 불러왔어요.`);
  if (newPractice.length) parts.push(`문장 연습 ${newPractice.length}개를 불러왔어요.`);
  if (!parts.length) parts.push('새로 불러올 기록은 없었어요.');
  if (filled) parts.push(`피드백 ${filled}개를 채웠어요.`);
  if (incoming.length - added - filled > 0) parts.push(`이미 있던 기록 ${incoming.length - added - filled}개는 그대로 두었어요.`);
  if (data.records.length > incoming.length) parts.push(`읽을 수 없는 기록 ${data.records.length - incoming.length}개는 건너뛰었어요.`);
  if (kept < merged.length) parts.push(`최근 ${kept}개까지만 남겼어요.`);
  openHistory();
  $('#backup-msg').textContent = parts.join(' ');
}

/** 돌아보기를 마치고 저장한다. next: 저장한 뒤 갈 화면 ('word'면 오늘의 단어, 아니면 챕터 화면) */
/** 대화를 저장한다 (공유를 골랐으면 시트에도). 한 번만 — 저장한 뒤 다시 불려도 그냥 지나간다 (84단계) */
async function saveReview(d) {
  if (d.saved) return;
  if (d.shared) {
    await shareTalk(loadCode(), d.sessionId, d.confidence, d.difficulty,
      d.lines.map((l) => ({ who: l.who, text: l.text, ...(l.hard ? { hard: true } : {}) })));
  }
  saveLocal(d);
  d.saved = true;
}
const SAVED_LABEL = '챕터로 돌아가기';

async function finishReview(next) {
  const d = review.data;
  const btn = $('#review-next');
  btn.disabled = true;
  $('#finish-msg').textContent = '';
  try {
    // 피드백이 아직 만들어지는 중이면 끝날 때까지 기다린다 (공유할 때 피드백도 함께 저장되고, 내 기록에도 남도록).
    // 기다리던 피드백이 도착하면 바로 저장하고, 읽을 수 있게 이 화면에 머문다 (84단계: 전에는 저장하지 않고 머물러서 '완료'를 한 번 더 눌러야 했다).
    // 피드백이 실패했으면 피드백 없이 저장한다.
    if (d.feedbackJob && !d.feedback) {
      btn.textContent = '피드백을 기다리는 중…';
      await d.feedbackJob;
      if (d.feedback) {
        btn.textContent = '저장 중…';
        await saveReview(d);
        $('#review-prev').hidden = true;   // 저장한 뒤에는 앞 단계(공유 선택)로 돌아가지 않는다
        $('#finish-msg').textContent = '피드백이 도착해서 저장했어요. 다 읽었으면 아래 버튼을 눌러 주세요.';
        return;
      }
    }
    btn.textContent = '저장 중…';
    await saveReview(d);
    review.data = null;
    if (next === 'word' && dailyWord) openWord();
    else if (next === 'drill') { openChapter(d.chapter.chapter_id); openDrill(); }
    else show('detail');
  } catch (err) {
    console.warn(err);
    $('#finish-msg').textContent = `저장하지 못했어요. 다시 눌러 주세요. (${errorText(err)})`;
  } finally {
    btn.disabled = false;
    btn.textContent = d.saved ? SAVED_LABEL : '완료';
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
// 지금 연 챕터의 과정. 선생님은 영어·일본어 챕터를 모두 쓰므로 학생의 과정이 아니라 챕터를 따른다 (30단계).
let viewCourse = '';   // 내 기록을 다시 볼 때 그 기록의 과정
const courseNow = () => viewCourse || (currentChapter && currentChapter.course) || me.course;
// 대화 말풍선의 상대 이름 (63단계: 환자 → 수검자). 일본어 과정도 영어 과정과 같은 검진센터 수검자 (93단계)
// 중국어 과정의 '상대'는 101단계에서 과정과 함께 없앴다
const partnerWord = () => '수검자';
const partnerTitle = () => '수검자';

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
    // 화면 읽기 (86단계): 'VoiceOver: 캐릭터 3번, 선택됨'처럼 (전에는 '캐릭터 s03')
    grid.innerHTML = ids.map((id, i) => `<button class="pick${id === me.avatar ? ' selected' : ''}" data-avatar="${escapeHtml(id)}" aria-label="캐릭터 ${i + 1}번" aria-pressed="${id === me.avatar}">
        <img src="img/avatars/${escapeHtml(avatars.students[id])}" alt="" loading="lazy"></button>`).join('') +
      `<button class="pick none${me.avatar ? '' : ' selected'}" data-avatar="" aria-label="그림 없이 이름 머리글자" aria-pressed="${!me.avatar}">이니셜</button>`;
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
  // 창을 연 버튼을 기억했다가 닫을 때 그 자리로 돌아간다. 창이 열리면 첫 버튼에 (86단계, 화면 읽기·키보드)
  if ($('#modal').hidden) modalReturn = document.activeElement;
  $('#modal').hidden = false;
  const first = box.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}
let modalReturn = null;
const closeModal = () => {
  $('#modal').hidden = true;
  if (modalReturn && document.contains(modalReturn) && modalReturn.focus) modalReturn.focus({ preventScroll: true });
  modalReturn = null;
};
// Esc로 닫기 (86단계): '닫기'·'나중에'·'아니요' 같은 보조 버튼을 누른 것과 같게. 보조 버튼이 없으면 그냥 닫는다
document.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Escape' || $('#modal').hidden) return;
  const cancel = $('#modal-actions').querySelector('button.secondary:not([disabled])');
  if (cancel) cancel.click(); else closeModal();
});
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
  // 116단계: 안내는 이 휴대폰에서 한 번만. 아이폰 Safari는 허용을 기억하지 않아 늘 'prompt'라서, 예전에는 말할 때마다 이 창이 떴다
  if (seen) return start();
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
  const no = chapterNum(entry.chapterId, entry.chapterOrder);
  return no ? `${no}장` : escapeHtml(entry.chapterTitle || '');
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

/* 내 기록의 문장 연습 (104단계, 스위치가 켜진 사람만 보임): 대화 기록과 날짜순으로 섞는다 */
const PRACTICE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 19.5V6a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2"/><path d="M8 8h6M8 11.5h5"/></svg>';
function practiceTitle(p) {
  const n = chapterNum(p.chapterId, p.chapterOrder);
  const no = n ? `${n}장` : escapeHtml(p.chapterTitle || '');
  return `${no} · ${p.group ? `${escapeHtml(p.group)} 묶음 · ` : ''}${STAGE_NAME[p.stage] || ''}`;
}
function practiceMeta(p) {
  const d = new Date(p.at);
  const when = `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return [when, `${p.done}문장`, `${Math.max(1, Math.round((p.sec || 0) / 60))}분`].join(' · ');
}
/** 맨 위 요약: 연습한 문장(어느 단계든 한 번 이상) · 마친 묶음·단계 (지금 받은 챕터 기준) */
function practiceSummary() {
  const steps = loadSteps();
  const marks = loadDrillMarks();
  let sentences = 0;
  let units = 0;
  chapters.forEach((c) => {
    (c.drills || []).forEach((d) => { if (DRILL_STAGES.some((st) => stageDone(d.drill_id, st, steps, marks))) sentences++; });
    drillGroups(c).forEach((g) => DRILL_STAGES.forEach((st) => { if (stageDrills(c, st, g).length && groupStageDone(c, g, st, steps, marks)) units++; }));
  });
  return sentences ? `문장 연습: 연습한 문장 ${sentences}개 · 마친 묶음·단계 ${units}개 (이 휴대폰)` : '';
}
/** 문장 연습 줄을 누르면 그 묶음·단계로 이어서 연습 */
function openPractice(p) {
  if (!chapters.some((c) => c.chapter_id === p.chapterId)) return;
  openChapter(p.chapterId);
  drill.level = DRILL_STAGES.includes(p.stage) ? p.stage : 'blank';
  drill.group = drillGroups(currentChapter).includes(p.group) ? p.group : (drillGroups(currentChapter)[0] || '');
  startDrill();
}

function openHistory() {
  $('#backup-msg').textContent = '';
  const list = loadHistory();
  renderBackupNudge(list);
  const box = $('#history-list');
  const practice = lpOn() ? loadPractice() : [];
  const sum = lpOn() ? practiceSummary() : '';
  $('#practice-sum').hidden = !sum;
  $('#practice-sum').textContent = sum;
  // 대화(t: 'talk', i: 대화 기록 번호)와 문장 연습(t: 'drill', p: 연습 기록)을 최근 것부터 섞는다
  const rows = list.map((e, i) => ({ t: 'talk', i, at: Date.parse(e.at) }))
    .concat(practice.map((p) => ({ t: 'drill', p, at: Date.parse(p.at) || 0 })))
    .sort((a, b) => b.at - a.at);
  if (!rows.length) {
    box.innerHTML = '<p class="state">아직 기록이 없어요. 챕터를 골라 대화를 시작해 보세요.</p>';
  } else {
    box.innerHTML = rows.map((r) => (r.t === 'drill' ? `
      <button class="record practice-record" data-p="${escapeHtml(r.p.id)}">
        <span class="avatar practice-icon" aria-hidden="true">${PRACTICE_ICON}</span>
        <span class="record-text">
          <span class="record-title">${practiceTitle(r.p)}</span>
          <span class="record-meta">${escapeHtml(practiceMeta(r.p))}</span>
        </span>
        ${r.p.complete ? '<span class="tag done-tag">✓ 완료</span>' : ''}
        <span class="chevron" aria-hidden="true">›</span>
      </button>` : (() => { const e = list[r.i]; const i = r.i; return `
      <button class="record" data-i="${i}">
        ${avatarHtml(e)}
        <span class="record-text">
          <span class="record-title">${chapterNo(e)} · ${escapeHtml((e.patient && e.patient.name) || '')}</span>
          <span class="record-meta">${escapeHtml(recordMeta(e))}</span>
        </span>
        <span class="tag${e.shared ? '' : ' private'}">${e.shared ? '공유' : '나만'}</span>
        <span class="chevron" aria-hidden="true">›</span>
      </button>`; })())).join('');
    box.querySelectorAll('.record').forEach((btn) => {
      btn.addEventListener('click', () => (btn.dataset.p
        ? openPractice(practice.find((p) => p.id === btn.dataset.p)) : openRecord(list[Number(btn.dataset.i)])));
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
  const no = chapterNum(e.chapterId, e.chapterOrder);
  return no ? `${no}장` : '';
}

function recordText(e) {
  viewCourse = e.course || me.course;
  const who = (l) => (l.who === 'me' ? '나' : partnerWord());
  const out = ['Tutoreal 대화 기록', `${[plainChapterNo(e), e.chapterTitle].filter(Boolean).join(' · ')} — ${(e.patient && e.patient.name) || ''}`, recordMeta(e)];
  if (e.difficulty) out.push(`어려웠던 점: ${e.difficulty}`);
  out.push('', '[대화]');
  (e.lines || []).forEach((l) => {
    out.push(`${l.hard ? '★ ' : ''}${who(l)}: ${l.text}`);
    if (l.py) out.push(`    ${l.py}`);
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
      fb.checklist.forEach((c) => out.push(`${c.done ? '✓' : c.optional ? '–' : fb.gentle ? '– (다음엔 이것도)' : '✗'} ${c.item}${c.optional ? ' (선택)' : ''}${c.en ? ` / ${c.en}` : ''}${c.py ? ` (${c.py})` : ''}`));
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
   '어려웠어요'를 누른 문장은 그 회차 끝에 한 번 더 나오고, 다음 회차에는 먼저 나온다 (이 휴대폰에 기억).
   학습 단계 유도 (103단계, learningPath.on인 사람만): 앞에 read(듣고 따라 읽기) 단계가 더해지고, 시트 group 칸의 묶음 하나씩 연습한다. */

const DRILL_KEY = 'tutoreal.drills';
const drill = {
  level: 'blank', group: '', queue: [], pos: 0, offset: 0, run: null, revealed: false, hintShown: false, hard: 0, total: 0, spoken: null,
  phase: 'idle', rec: null, timer: null, coach: null, coachError: ''   // 발음 코칭: idle / recording / checking
};
const REC_MAX_MS = 12000;   // 12초가 지나면 녹음을 자동으로 멈춘다
const COACH_TITLE = {
  great: '정확하게 발음했어요! 🎉',
  good: '잘 들려요! 조금만 다듬어 볼까요?',
  retry: '다시 한 번 해 볼까요?'
};
const LEVEL_DESC = {
  read: '휴대폰이 읽어 주는 문장을 듣고 그대로 따라 읽어요.',
  blank: '문장 틀을 보면서 핵심 단어를 떠올려요.',
  korean: '상황만 보고 영어 문장을 처음부터 말해요. 실전처럼!'
};
// 과정 언어 이름 (문장 연습 문구에 쓴다)
const langName = () => COURSE_NAME[courseNow()] || '영어';

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

/* 단계·묶음 기록 (104단계): 이 휴대폰에만. 스위치가 꺼진 학생도 저장한다 (켜면 그동안 한 연습이 바로 진행으로 이어지게).
   tutoreal.steps    { drill_id: { read, blank, korean } } — 그 단계를 처음 마친 시각(ms). ✓와 이어서 하기에 쓴다
   tutoreal.practice [{ id, chapterId, chapterOrder, chapterTitle, course, stage, group, done, total, complete, at, sec }]
                     — 문장 연습 한 번마다 한 줄 (최근 300개). 문장을 마칠 때마다 고쳐 써서 중간에 나가도 남는다
   예전 tutoreal.drills 표시는 '빈칸 단계를 했음'으로 읽는다 (intent 결정). */
const STEPS_KEY = 'tutoreal.steps';
const PRACTICE_KEY = 'tutoreal.practice';
const PRACTICE_MAX = 300;
function loadSteps() {
  try { const v = JSON.parse(localStorage.getItem(STEPS_KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function saveSteps(steps) {
  try { localStorage.setItem(STEPS_KEY, JSON.stringify(steps)); } catch { /* 저장 못 해도 진행 */ }
}
function loadPractice() {
  try { const v = JSON.parse(localStorage.getItem(PRACTICE_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function savePractice(list) {
  try { localStorage.setItem(PRACTICE_KEY, JSON.stringify(list.slice(0, PRACTICE_MAX))); } catch { /* 저장 못 해도 진행 */ }
}
/** 이 문장의 이 단계를 마쳤나 (예전 문장 연습 표시는 빈칸 단계) */
function stageDone(id, stage, steps, marks) {
  return !!((steps[id] || {})[stage] || (stage === 'blank' && marks[id]));
}
const groupDrills = (c, g) => ((c && c.drills) || []).filter((d) => (d.group || '') === g);
/** 그 단계에서 연습할 문장 (115단계): 켜진 사람은 단어 문항(kind=word)을 1단계 따라 읽기에만. g를 주면 그 묶음만.
    꺼진 사람은 예전처럼 모든 문장 */
function stageDrills(c, stage, g) {
  return ((c && c.drills) || []).filter((d) => (g === undefined || (d.group || '') === g)
    && (stage === 'read' || d.kind !== 'word' || !lpOn()));
}
/** 그 묶음의 그 단계를 모두 마쳤나. 단어만 있는 묶음의 2·3단계는 할 문장이 없어 끝난 것으로 (115단계) */
function groupStageDone(c, g, stage, steps = loadSteps(), marks = loadDrillMarks()) {
  const list = stageDrills(c, stage, g);
  if (!list.length) return stage !== 'read' && groupDrills(c, g).length > 0;
  return list.every((d) => stageDone(d.drill_id, stage, steps, marks));
}
/** 모든 묶음에서 그 단계를 마쳤나 (단계 탭의 ✓) */
function chapterStageDone(c, stage, steps = loadSteps(), marks = loadDrillMarks()) {
  const list = stageDrills(c, stage);
  if (!list.length) return stage !== 'read' && ((c && c.drills) || []).length > 0;
  return list.every((d) => stageDone(d.drill_id, stage, steps, marks));
}
/** 문장 하나를 마쳤다: 단계 기록 + 이번 회차의 연습 기록을 고쳐 쓴다 */
function markDrillDone(d) {
  const steps = loadSteps();
  steps[d.drill_id] = steps[d.drill_id] || {};
  if (!steps[d.drill_id][drill.level]) steps[d.drill_id][drill.level] = Date.now();
  saveSteps(steps);
  const c = currentChapter;
  const now = Date.now();
  if (!drill.run) {
    drill.run = { id: `p${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, startedAt: now, done: 0 };
  }
  drill.run.done++;
  const entry = {
    id: drill.run.id, chapterId: c.chapter_id, chapterOrder: c.order, chapterTitle: c.title, course: c.course || me.course,
    stage: drill.level, group: drill.group, done: drill.run.done, total: drill.total,
    complete: groupStageDone(c, drill.group, drill.level, steps),
    at: new Date(now).toISOString(), sec: Math.min(3600, Math.round((now - drill.run.startedAt) / 1000))
  };
  if (!lpOn()) { entry.group = ''; entry.complete = chapterStageDone(c, drill.level, steps); }   // 꺼진 사람은 묶음 없이 챕터 전체
  savePractice([entry].concat(loadPractice().filter((p) => p.id !== entry.id)));
}

/** 'Could you tell me your [full name], please?' → [{ text }, { blank: 'full name' }, { text }] */
function parseSentence(s) {
  return s.split(/\[([^\]]+)\]/).map((part, i) => (i % 2 ? { blank: part } : { text: part })).filter((p) => p.blank || p.text);
}
const plainSentence = (s) => s.replace(/\[([^\]]+)\]/g, '$1');

/* 학습 단계 유도 (103단계): 문장 연습 3단계와 묶음. 스위치가 꺼진 사람은 예전처럼 빈칸·통째로 2단계, 묶음 없이 전체 */
const lpOn = () => !!learningPath.on;
const DRILL_STAGES = ['read', 'blank', 'korean'];
const STAGE_TAB = { read: '따라 읽기', blank: '빈칸', korean: '통째로' };   // UI 예시대로 한 줄 짧은 이름. 앞에 번호, 마친 단계는 ✓ (104단계)
const STAGE_NAME = { read: '듣고 따라 읽기', blank: '빈칸 채우기', korean: '통째로 말하기' };
const OLD_TAB = { blank: '1단계 빈칸 채우기', korean: '2단계 통째로 말하기' };
const MIC_SVG = '<svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
/** 챕터의 묶음 이름들: 시트 group 칸, 첫 문장 순서대로 (서버가 order 순으로 보낸다). 빈칸은 '' */
function drillGroups(c) {
  const out = [];
  ((c && c.drills) || []).forEach((d) => { const g = d.group || ''; if (!out.includes(g)) out.push(g); });
  return out;
}
// 묶음 이름이 빈 문장: 모두 비었으면 묶음 하나(칩 없음), 일부만 비었으면 '기타' 묶음
const groupLabel = (g) => g || '기타';

/** 챕터 화면의 '문장 연습' 버튼: 스위치가 켜졌으면 안 끝난 곳부터 (묶음마다 1→2→3, 그다음 묶음). 다 했으면 1단계 첫 묶음 (104단계) */
function openDrill() {
  if (lpOn()) {
    const groups = drillGroups(currentChapter);
    const steps = loadSteps();
    const marks = loadDrillMarks();
    drill.level = 'read';
    drill.group = groups[0] || '';
    outer: for (const g of groups) {
      for (const st of DRILL_STAGES) {
        if (!groupStageDone(currentChapter, g, st, steps, marks)) { drill.level = st; drill.group = g; break outer; }
      }
    }
  } else {
    if (drill.level === 'read') drill.level = 'blank';
    drill.group = '';
  }
  startDrill();
}

function startDrill() {
  const marks = loadDrillMarks();
  const grouped = lpOn();
  // 115단계: 2·3단계에서 이 묶음에 할 문장이 없으면(단어만 있는 묶음) 문장이 있는 첫 묶음으로, 챕터 전체가 단어면 따라 읽기로
  if (grouped && !stageDrills(currentChapter, drill.level, drill.group).length) {
    const g = drillGroups(currentChapter).find((x) => stageDrills(currentChapter, drill.level, x).length);
    if (g !== undefined) drill.group = g;
    else drill.level = 'read';
  }
  const all = grouped ? stageDrills(currentChapter, drill.level, drill.group) : (currentChapter.drills || []);
  // 켜졌으면 그 단계에서 아직 안 한 문장부터 (104단계). 다 한 묶음은 처음부터 전부
  const steps = loadSteps();
  const undone = grouped ? all.filter((d) => !stageDone(d.drill_id, drill.level, steps, marks)) : all;
  const list = undone.length ? undone : all.slice();
  // 지난번에 '어려웠어요'였던 문장을 먼저 (나머지는 시트 순서). 따라 읽기는 시트 순서 그대로
  if (drill.level !== 'read') list.sort((a, b) => Number(!!(marks[b.drill_id] || {}).hard) - Number(!!(marks[a.drill_id] || {}).hard));
  drill.queue = list.map((d) => ({ ...d, again: false }));
  drill.spoken = null;
  drill.run = null;   // 새 회차: 첫 문장을 마치면 연습 기록 한 줄이 생긴다
  drill.pos = 0;
  drill.offset = all.length - list.length;   // 이미 마친 문장 수 (진행 줄 'n / 전체'에 더한다)
  drill.hard = 0;
  drill.total = all.length;
  drill.revealed = false;   // 지난번에 정답·힌트를 본 채로 나갔어도 첫 문장은 처음 상태로 (97단계)
  drill.hintShown = false;
  drill.coach = null;
  drill.coachError = '';
  cancelRecording();
  $('#drill-back').textContent = `‹ ${chapterNum(currentChapter.chapter_id, currentChapter.order)}장`;
  $('#view-drill').classList.toggle('learn-bar', lpOn());   // 121단계: 켜졌으면 '‹ N장 | 제목' 머리줄
  $('#drill-bar-title').hidden = !lpOn();
  $('#drill-bar-title').textContent = currentChapter.title;
  renderDrill();
  show('drill');
}

/** 따라 읽기를 마친 수 (118단계): '문장 6개와 단어 2개를' / '단어 2개를' / '8문장을' (단어가 없으면 예전 그대로) */
function readCount() {
  const list = stageDrills(currentChapter, 'read', drill.group);
  const words = list.filter((d) => d.kind === 'word').length;
  const sents = list.length - words;
  if (!words) return `${list.length}문장을`;
  return sents ? `문장 ${sents}개와 단어 ${words}개를` : `단어 ${words}개를`;
}

/** 카드 아래 안내 문구. 켜졌으면 UI 예시처럼 단계 설명을 겸한다 (단어 문항은 전체가 빈칸) */
function sayText(d, lp) {
  if (!lp) return drill.level === 'blank' ? '소리 내어 문장 전체를 말해 보세요.' : `${langName()} 문장 전체를 소리 내어 말해 보세요.`;
  if (drill.level === 'korean') return `상황만 보고 ${langName()} 문장 전체를 소리 내어 말해 보세요.`;
  return d.kind === 'word' ? '단어 전체가 비어 있어요. 떠올려서 소리 내어 말해 보세요.'
    : '틀은 보이고 핵심 단어만 비어 있어요. 문장 전체를 소리 내어 말해 보세요.';
}

/** 묶음 칩 (103단계): 스위치가 켜졌고 묶음이 둘 이상일 때만. 누르면 그 묶음을 지금 단계로 처음부터 */
function renderDrillGroups(lp) {
  const box = $('#drill-groups');
  // 115단계: 지금 단계에 할 문장이 있는 묶음만 (2·3단계에서 단어만 있는 묶음은 칩이 없다)
  const groups = lp ? drillGroups(currentChapter).filter((g) => stageDrills(currentChapter, drill.level, g).length) : [];
  box.hidden = groups.length < 2;
  if (box.hidden) { box.innerHTML = ''; return; }
  const steps = loadSteps();
  const marks = loadDrillMarks();
  // 지금 단계에서 그 묶음을 마쳤으면 ✓ (UI 예시: 청록)
  box.innerHTML = groups.map((g) => {
    const done = groupStageDone(currentChapter, g, drill.level, steps, marks);
    return `<button type="button" class="group-chip${g === drill.group ? ' on' : ''}${done ? ' done' : ''}" data-group="${escapeHtml(g)}"
    aria-pressed="${g === drill.group}">${done ? '✓ ' : ''}${escapeHtml(groupLabel(g))}</button>`;
  }).join('');
  box.querySelectorAll('.group-chip').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.group === drill.group) return;
    if (window.speechSynthesis) speechSynthesis.cancel();
    drill.group = b.dataset.group;
    startDrill();
  }));
}

/** 묶음 완료 화면 (108단계, UI 예시 ④): 주 버튼은 대본 대화(대본 카드는 이 묶음 첫 줄부터),
    그 아래는 챕터 '다음 단계'와 같은 순서의 다음 문장 단계 (모든 묶음을 마쳤으면 없음), 글자 버튼은 홈으로 */
function renderChunkDone(groups) {
  const c = currentChapter;
  const g = drill.group;
  $('#view-drill').classList.add('chunk-done');
  const { next } = chapterPath(c);
  let more = '';
  if (DRILL_STAGES.includes(next.stage)) {
    more = next.stage === 'read' ? `다음 묶음: ${groupLabel(next.group)}`
      : `다음: ${STAGE_NAME[next.stage]}${groups.length > 1 ? ` · ${groupLabel(next.group)} 묶음` : ''}`;
  }
  const added = drill.run ? drill.run.done : 0;
  $('#drill-card').innerHTML = `<span class="chunk-check" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></span>
    <h3 class="chunk-title">${groups.length > 1 ? `${escapeHtml(groupLabel(g))} 묶음 완료!` : '문장 연습 완료!'}</h3>
    <p class="chunk-sub">${drill.total}문장을 모두 말했어요.${added ? `<br>내 기록에 ${added}문장이 더해졌어요.` : ''}
      ${drill.hard ? `<br>어려웠던 문장 ${drill.hard}개는 다음 연습 때 먼저 나와요.` : ''}</p>`;
  $('#drill-actions').innerHTML = `<div class="chunk-rec">
      <p class="chunk-rec-label">다음 단계 추천</p>
      <p class="chunk-rec-title">방금 연습한 문장으로<br>AI 수검자와 대화해 볼까요?</p>
      <p class="chunk-rec-desc">화면에 대사가 보여요. 읽기만 해도 괜찮아요.</p>
      <button class="primary" id="chunk-talk">대본 보며 대화하기</button>
    </div>
    ${more ? `<button class="secondary" id="chunk-next">${escapeHtml(more)}</button>` : ''}
    <button class="link chunk-stop" id="chunk-stop">오늘은 여기까지</button>`;
  $('#chunk-talk').addEventListener('click', () => { show('detail'); openTalk('script', g); });
  if ($('#chunk-next')) $('#chunk-next').addEventListener('click', () => goPathStage(next.stage, next.group));
  $('#chunk-stop').addEventListener('click', () => show('list'));
  window.scrollTo(0, 0);
}

function renderDrill() {
  const lp = lpOn();
  if (!lp && drill.level === 'read') drill.level = 'blank';
  // 단계 탭: 스위치가 켜졌으면 3개(UI 예시의 짧은 이름), 꺼졌으면 예전 2개. 선생님 요약의 과정 버튼(.level)은 건드리지 않는다
  const steps = loadSteps();
  const marks = loadDrillMarks();
  document.querySelectorAll('#drill-levels .level').forEach((b) => {
    const lv = b.dataset.level;
    b.hidden = !lp && lv === 'read';
    const done = lp && chapterStageDone(currentChapter, lv, steps, marks);
    b.textContent = lp ? `${done ? '✓' : DRILL_STAGES.indexOf(lv) + 1} ${STAGE_TAB[lv]}` : (OLD_TAB[lv] || '');
    b.classList.toggle('done', done);
    b.classList.toggle('on', lv === drill.level);
    b.setAttribute('aria-pressed', String(lv === drill.level));
  });
  renderDrillGroups(lp);
  $('#level-desc').hidden = lp;   // 켜졌으면 단계 설명은 카드 안 안내 문구로
  $('#level-desc').textContent = LEVEL_DESC[drill.level].replace('영어', langName());
  $('#drill-count').classList.toggle('grouped', lp);
  $('#drill-progress').classList.toggle('thick', lp);
  const groups = lp ? drillGroups(currentChapter) : [];
  const groupName = groups.length > 1 ? `${groupLabel(drill.group)} 묶음` : '전체 문장';
  const card = $('#drill-card');
  const actions = $('#drill-actions');
  $('#view-drill').classList.remove('chunk-done');
  if (drill.pos >= drill.queue.length && lp && drill.level === 'korean'
    && DRILL_STAGES.every((st) => groupStageDone(currentChapter, drill.group, st, steps, marks))) {
    renderChunkDone(groups);   // 묶음의 1→2→3을 모두 마쳤으면 묶음 완료 화면 (108단계)
    return;
  }
  if (drill.pos >= drill.queue.length && lp) {
    // 다 했어요 (103단계): 다음 단계가 주 버튼. 1·2단계 뒤, 또는 앞 단계를 건너뛰고 3단계만 마쳤을 때
    $('#drill-count').innerHTML = `<span>${escapeHtml(groupName)}</span><b>${drill.total} / ${drill.total}</b>`;
    setDrillProgress(1);
    // 115단계: 다음 단계는 이 묶음에 할 문장이 있는 단계 (단어만 있는 묶음은 따라 읽기 다음이 없다 → 다음 묶음이 주 버튼)
    const nextStage = DRILL_STAGES.slice(DRILL_STAGES.indexOf(drill.level) + 1).find((st) => stageDrills(currentChapter, st, drill.group).length);
    const gi = groups.indexOf(drill.group);
    const nextGroup = gi >= 0 && gi < groups.length - 1 ? groups[gi + 1] : null;
    const wordsOnly = !nextStage && drill.level === 'read' && nextGroup !== null;
    card.innerHTML = `<h3>다 했어요!</h3>
      <p class="goal">${groups.length > 1 ? `${escapeHtml(groupName)} ` : ''}${drill.level === 'read' ? `${readCount()} 따라 읽었어요.`
        : `${drill.total}문장을 연습했어요.${drill.hard ? ` 어려웠던 문장 ${drill.hard}개는 다음 연습 때 먼저 나와요.` : ''}`}</p>`;
    actions.innerHTML = wordsOnly
      ? `<button class="primary" id="drill-next-group">다음 묶음: ${escapeHtml(groupLabel(nextGroup))}</button>
      <button class="secondary" id="drill-again">한 번 더 연습</button>
      <button class="secondary" id="drill-to-talk">대화 시작하기</button>`
      : `${nextStage ? `<button class="primary" id="drill-next-stage">다음 단계로: ${STAGE_NAME[nextStage]}</button>`
        : '<button class="primary" id="drill-to-talk">대화 시작하기</button>'}
      ${!nextStage && nextGroup !== null ? `<button class="secondary" id="drill-next-group">다음 묶음: ${escapeHtml(groupLabel(nextGroup))}</button>` : ''}
      <button class="secondary" id="drill-again">한 번 더 연습</button>
      ${nextStage ? '<button class="secondary" id="drill-to-talk">대화 시작하기</button>' : ''}`;
    if ($('#drill-next-stage')) $('#drill-next-stage').addEventListener('click', () => { drill.level = nextStage; startDrill(); });
    if ($('#drill-next-group')) $('#drill-next-group').addEventListener('click', () => { drill.level = 'read'; drill.group = nextGroup; startDrill(); });
    $('#drill-again').addEventListener('click', () => startDrill());
    $('#drill-to-talk').addEventListener('click', () => { show('detail'); openTalk(); });
    return;
  }
  if (drill.pos >= drill.queue.length) {
    $('#drill-count').textContent = '';
    setDrillProgress(1);
    card.innerHTML = `<h3>다 했어요!</h3>
      <p class="goal">${drill.total}문장 중 어려웠던 문장 ${drill.hard}개. 어려웠던 문장은 다음 연습 때 먼저 나와요.</p>`;
    actions.innerHTML = `<button class="secondary" id="drill-again">한 번 더 연습</button>
      ${drill.level === 'blank' ? '<button class="secondary" id="drill-level2">2단계 도전하기 (통째로 말하기)</button>' : ''}
      <button class="primary" id="drill-to-talk">대화 시작하기</button>`;
    $('#drill-again').addEventListener('click', () => startDrill());
    if ($('#drill-level2')) $('#drill-level2').addEventListener('click', () => { drill.level = 'korean'; startDrill(); });
    $('#drill-to-talk').addEventListener('click', () => { show('detail'); openTalk(); });
    return;
  }
  const d = drill.queue[drill.pos];
  const parts = parseSentence(d.sentence);
  const firstRound = drill.queue.filter((x) => !x.again).length;
  const countNow = d.again ? '한 번 더' : lp ? `${Math.min(drill.offset + drill.pos + 1, drill.total)} / ${drill.total}`
    : `${Math.min(drill.pos + 1, firstRound)} / ${firstRound}`;
  // 켜졌으면 '과거력 묶음 · 3 / 7' (UI 예시: 왼쪽 묶음 이름, 오른쪽 번호)
  if (lp) $('#drill-count').innerHTML = `<span>${escapeHtml(groupName)}</span><b>${countNow}</b>`;
  else $('#drill-count').textContent = countNow;
  setDrillProgress(d.again ? 1 : lp ? Math.min(drill.offset + drill.pos + 1, drill.total) / drill.total : Math.min(drill.pos + 1, firstRound) / firstRound);

  let sentence;
  if (drill.revealed || drill.level === 'read') {   // 따라 읽기: 문장 전체, 힌트 단어는 정답처럼 강조
    sentence = parts.map((p) => (p.blank ? `<span class="filled">${escapeHtml(p.blank)}</span>` : escapeHtml(p.text))).join('');
  } else if (drill.level === 'blank') {
    sentence = parts.map((p) => (p.blank
      ? p.blank.split(/\s+/).map((w) => `<span class="blank" style="width:${Math.max(2, w.length * 0.6)}em" aria-label="빈칸"></span>`).join(' ')
      : escapeHtml(p.text))).join('');
  } else {
    sentence = '';
  }
  // 일본어 (96단계): pron 칸 = 문장 전체 로마자, 빈칸 자리는 sentence처럼 [대괄호]. 대괄호가 없으면 1단계 로마자·로마자 힌트는 없음
  const ja = courseNow() === 'ja';
  const romaji = ja ? parseSentence(d.pron || '') : [];
  const jaBlanks = romaji.some((p) => p.blank);
  // 힌트: 영어는 첫 글자(f___ n___), 일본어는 빈칸 단어의 로마자
  const hint = ja && jaBlanks ? romaji.filter((p) => p.blank).map((p) => p.blank).join(' · ')
    : parts.filter((p) => p.blank).map((p) => p.blank.split(/\s+/).map((w) => w[0] + '_'.repeat(Math.max(0, w.length - 1))).join(' ')).join(' · ');
  // 일본어 1단계: 빈칸이 아닌 부분의 로마자를 문장 아래에 (빈칸 자리는 비워 둔다)
  const blankPy = !drill.revealed && drill.level === 'blank' && jaBlanks
    ? romaji.map((p) => (p.blank ? '<span class="blank py-blank" aria-label="빈칸"></span>' : escapeHtml(p.text))).join('')
    : '';

  const c = drill.coach;
  const isWord = lp && drill.level === 'read' && d.kind === 'word';   // 118단계: 따라 읽기의 단어 문항은 '단어'로 보인다
  const coachHtml = c ? `<div class="coach ${c.overall}">
      <p class="coach-title">${COACH_TITLE[c.overall] || COACH_TITLE.retry}</p>
      ${c.message ? `<p class="coach-msg">${escapeHtml(c.message)}</p>` : ''}
      ${c.heard ? `<p class="coach-heard">${ja ? '들린 발음' : '들린 문장'}: "${escapeHtml(c.heard)}"</p>` : ''}
      ${c.words.map((w) => `<p class="coach-word"><b>${escapeHtml(w.word)}</b> → <span class="resp">${escapeHtml(w.respelling)}</span>
        <span class="tip">${escapeHtml(w.tip)}</span></p>`).join('')}
    </div>` : '';

  card.innerHTML = `
    ${coachHtml}
    <p class="situation-label">상황</p>
    <p class="situation">${escapeHtml(d.situation)}</p>
    ${sentence ? `<p class="sentence-label">${drill.revealed ? '정답' : `${langName()} ${isWord ? '단어' : '문장'}`}</p><p class="sentence">${sentence}</p>` : ''}
    ${blankPy ? `<p class="drill-py">${blankPy}</p>` : ''}
    ${(drill.revealed || drill.level === 'read') && d.pron
      ? (ja ? `<p class="drill-py">${escapeHtml(plainSentence(d.pron))}</p>` : `<p class="drill-pron">발음: ${escapeHtml(d.pron)}</p>`) : ''}
    ${drill.level === 'read' ? `<p class="drill-say">${SPEAKER_ICON}${isWord ? '핵심 단어예요. 듣고 따라 말해 보세요.' : '한 번 읽어 줬어요. 소리 내어 따라 읽어 보세요.'}</p>
      <p class="sound-tip">소리가 안 나면 무음 모드를 꺼 주세요.</p>` : ''}
    ${drill.level === 'read' ? ''
      // 114단계: 정답을 본 뒤 다시 말할 때도 '듣고 있어요'와 목소리 막대를 보인다. '확인하는 중'은 아래 버튼 자리에만
      : drill.phase === 'recording' ? `<p class="recording">${METER_HTML}<span>듣고 있어요. 문장을 말한 뒤 "다 말했어요"를 눌러 주세요.</span></p>`
      : drill.phase === 'checking' || drill.revealed ? ''
      : `<p class="drill-say">${sayText(d, lp)}</p>
         ${drill.hintShown ? `<p class="drill-hint">${escapeHtml(hint)}</p>` : ''}`}
    ${drill.coachError ? `<p class="hint">${escapeHtml(drill.coachError)}</p>` : ''}`;

  // 따라 읽기 (103단계): 화면이 열리면 한 번 읽어 주고, 코칭 없이 '따라 읽었어요'로 다음 문장 (AI 비용 없음)
  if (drill.level === 'read') {
    actions.innerHTML = `<button class="primary" id="read-next">따라 읽었어요</button>
      <button class="secondary" id="drill-listen">${SPEAKER_ICON}다시 듣기</button>`;
    $('#read-next').addEventListener('click', () => { if (window.speechSynthesis) speechSynthesis.cancel(); markDrillDone(d); drill.pos++; renderDrill(); });
    $('#drill-listen').addEventListener('click', () => speak(plainSentence(d.sentence)));
    if (drill.spoken !== d) { drill.spoken = d; speak(plainSentence(d.sentence)); }
    return;
  }
  const mic = lp ? MIC_SVG : '🎤 ';   // 켜졌으면 UI 예시처럼 마이크 그림 (학생 화면은 그대로)
  if (drill.phase === 'recording') {
    actions.innerHTML = '<button class="primary" id="rec-stop">다 말했어요</button><button class="secondary" id="rec-cancel">취소</button>';
    $('#rec-stop').addEventListener('click', stopCoach);
    $('#rec-cancel').addEventListener('click', () => { cancelRecording(); renderDrill(); });
  } else if (drill.phase === 'checking') {
    // 114단계: 버튼 자리를 비우지 않고 같은 높이의 '확인하는 중' 칸으로 (화면이 덜컹거리지 않게)
    const h = actions.offsetHeight;
    actions.innerHTML = `<div class="drill-wait" role="status" style="min-height: ${h}px"><span class="drill-spin" aria-hidden="true"></span>발음을 확인하는 중…</div>`;
  } else if (!drill.revealed) {
    actions.innerHTML = `<button class="primary" id="rec-start">${mic}말하고 확인받기</button>
      <div class="row">${drill.hintShown ? '' : `<button class="secondary" id="drill-hint">${ja && jaBlanks ? '힌트 (로마자)' : '힌트 (첫 글자)'}</button>`}
      <button class="secondary" id="drill-reveal">정답 보기</button></div>`;
    $('#rec-start').addEventListener('click', () => withMicIntro(startCoach));
    if ($('#drill-hint')) $('#drill-hint').addEventListener('click', () => { drill.hintShown = true; renderDrill(); });
    $('#drill-reveal').addEventListener('click', () => { drill.revealed = true; drill.coachError = ''; renderDrill(); speak(plainSentence(d.sentence)); });
  } else {
    // 114단계 (켜진 사람만): 결과에 따라 진한 버튼 하나. 다시 해 볼 때(retry·정답만 봄)는 '다시 말해 보기',
    // 통과(great·good)면 '쉬웠어요 · 다음 →'. '어려웠어요 · 다음'은 늘 남겨 막히지 않게 (그 문장은 다음 연습 때 먼저)
    const pass = c && (c.overall === 'great' || c.overall === 'good');
    if (lp && !pass) {
      actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">${SPEAKER_ICON}다시 듣기</button>
        <button class="secondary" id="drill-hard">어려웠어요 · 다음</button></div>
        <button class="primary" id="rec-start">${mic}${c ? '다시 말해 보기' : '말해 보기'}</button>`;
    } else if (lp) {
      actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">${SPEAKER_ICON}다시 듣기</button>
        <button class="secondary" id="rec-start">${mic}다시 말해 보기</button></div>
        <div class="row"><button class="secondary" id="drill-hard">어려웠어요 · 다음</button>
        <button class="primary" id="drill-easy">쉬웠어요 · 다음 →</button></div>`;
    } else {
      actions.innerHTML = `<div class="row"><button class="secondary" id="drill-listen">🔊 다시 듣기</button>
        <button class="secondary" id="rec-start">${mic}다시 말해 보기</button></div>
        <div class="row"><button class="secondary" id="drill-hard">어려웠어요</button>
        <button class="primary" id="drill-easy">쉬웠어요</button></div>`;
    }
    $('#drill-listen').addEventListener('click', () => speak(plainSentence(d.sentence)));
    $('#rec-start').addEventListener('click', () => withMicIntro(startCoach));
    $('#drill-hard').addEventListener('click', () => nextDrill(true));
    if ($('#drill-easy')) $('#drill-easy').addEventListener('click', () => nextDrill(false));
  }
}

/* 발음 코칭: 녹음 → 서버 → AI 코칭. 소리는 저장하지 않는다. */
async function startCoach() {
  if (window.speechSynthesis) speechSynthesis.cancel();
  drill.coachError = '';
  drill.coach = null;   // 114단계: 다시 말할 때 지난 결과를 지운다 (남아 있으면 지금 녹음 중인지 헷갈림)
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
    markDrillDone(d);   // 단계·묶음 기록 (104단계)
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
/** lang(예: ja-JP)에 맞는 음성. 같은 언어·지역 → 같은 언어(다른 지역) 순서로 찾고, 없으면 null. */
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
  // 일본어 과정은 휴대폰의 일본어 음성으로 조금 더 천천히
  u.lang = course === 'ja' ? 'ja-JP' : 'en-US';
  u.rate = course === 'en' ? 0.9 : 0.8;
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
let teacherCourse = '';   // 선생님 요약에서 보고 있는 과정 (en/ja). 비우면 서버가 정한다

const chapterLabel = (c) => `${chapterNum(c.chapter_id, c.order)}장 ${c.title}`;
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
  // 과정이 둘 이상이면 위에 과정 고르기 (영어 / 일본어)
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
      <p class="eyebrow">${escapeHtml(chapterNum(c.chapter_id, c.order))}장</p>
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
    .forEach((d) => notes.push(`${chapterNum(c.chapter_id, c.order)}장: ${d.text}`)));
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
  viewCourse = t.course || 'en';   // 이 대화의 과정으로 그린다 (일본어면 로마자)
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

function submitCode(input) {
  const code = input.value.trim();
  if (!code) {
    if (passOn()) { stopPassRetry(); setPassState(''); }
    setLoginMsg('접속 코드를 입력해 주세요.');
    return;
  }
  enter(code);
}
$('#login-form').addEventListener('submit', (e) => { e.preventDefault(); submitCode($('#login-code')); });
$('#pass-form').addEventListener('submit', (e) => { e.preventDefault(); submitCode($('#pass-code')); });   // 123단계 출입증
// 125단계: 코드를 고치면 오류·지연 모습을 풀고 자동 다시 시도도 멈춘다
$('#pass-code').addEventListener('input', () => {
  if (!passState) return;
  stopPassRetry();
  passRetry.n = 0;
  setPassState('');
});
$('#pass').addEventListener('animationend', () => $('#pass').classList.remove('shake'));
// 아래쪽 탭 바
const TAB_ACTION = {
  list: () => show('list'), history: openHistory, avatar: openAvatarPicker,
  teacher: () => openTeacher(false)
};
$('#avatar-logout').addEventListener('click', confirmLogout);   // 53단계: 탭 바에서 내 캐릭터 화면으로 옮김
document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => TAB_ACTION[b.dataset.tab]()));
$('#greet-avatar').addEventListener('click', openAvatarPicker);
$('#drill-open').addEventListener('click', openDrill);
document.querySelectorAll('.diff-tab').forEach((b) => b.addEventListener('click', () => setDifficulty(b.dataset.diff)));
$('#drill-back').addEventListener('click', () => { if (window.speechSynthesis) speechSynthesis.cancel(); cancelRecording(); show('detail'); });
document.querySelectorAll('#drill-levels .level').forEach((b) => b.addEventListener('click', () => {
  cancelRecording();
  if (window.speechSynthesis) speechSynthesis.cancel();
  drill.level = b.dataset.level;
  if (lpOn()) { startDrill(); return; }   // 켜졌으면 단계를 바꾸면 그 묶음을 처음부터 (따라 읽기는 시트 순서, 나머지는 어려웠던 문장 먼저)
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
$('#record-again').addEventListener('click', () => { openChapter(recordChapterId); openTalk(); });
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
$('#talk-start').addEventListener('click', () => openTalk());
// 대화 모드 탭 (106단계): 시작 전에는 모드를, 대화 중에는 아래 카드 모양만 바꾼다
document.querySelectorAll('#talk-modes .level').forEach((b) => b.addEventListener('click', () => {
  if (talkUi.started) talkUi.view = b.dataset.mode;
  else { talkUi.mode = b.dataset.mode; talkUi.view = b.dataset.mode; }
  renderTalkModes();
  renderTalkCard();
}));
$('#talk-begin').addEventListener('click', () => withMicIntro(() => beginTalk(talkUi.mode)));
$('#talk-end').addEventListener('click', () => { if (live) { talk.endReason = 'user'; live.stop(''); } });
// 머리줄 '종료' (113단계): 한마디라도 했으면 3초 안에 한 번 더 눌러야 끝난다. 연결 중이거나 말하기 전이면 바로
$('#talk-quit').addEventListener('click', () => {
  if (!live) return;
  const spoke = transcript.lines.some((l) => l.who === 'me' && l.text.trim());
  if (spoke && !quitTimer) { setQuitArmed(true); return; }
  setQuitArmed(false);
  talk.endReason = 'user';
  live.stop('');
});
$('#talk-bar-back').addEventListener('click', () => { if (!live) show('detail'); });
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
const WORD_KEY = 'tutoreal.word';         // 오늘 푼 상태 { no, guesses, hint, done, won, pick(보여 줄 수업 문장 번호), replay(시험용 다시 하기), explain(87단계: { text, fb, left, skipped }) }
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
// 발음 듣기 버튼: 단어 게임은 늘 영어 음성으로 (선생님이 일본어 챕터를 보던 중이어도)
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
        <span>✓ 오늘의 단어 #${dailyWord.no} · ${st.won ? st.guesses.length : 'X'}/${WORD_TRIES}${st.explain && st.explain.fb ? ' ✍️' : ''}${tag}</span>${fire}<span class="chevron" aria-hidden="true">›</span>
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
  wordExplainEditing = false;
  $('#word-no').textContent = `#${dailyWord.no} · ${dailyWord.date}`;
  $('#word-msg').textContent = '';
  wordToast('');
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
  // 다 푼 뒤에는 쓰지 않은 빈 줄을 그리지 않는다 (89단계: 결과와 설명 칸이 화면 위쪽에 오게)
  for (let r = 0; r < (done ? shown.length : WORD_TRIES); r++) {
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
  if (done) $('#word-msg').textContent = '';   // 다 푼 뒤에는 힌트 글도 치운다 (89단계)
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
  // 설명하기(87단계)를 마치거나 건너뛴 뒤에 수업 문장·기록·공유가 이어진다 (게임 기록은 이미 저장됨)
  const ex = st.explain || {};
  const after = !!(ex.fb || ex.skipped) && !wordExplainEditing;
  end.innerHTML = `
    <p class="word-result">${st.won ? `🎉 ${st.guesses.length}번 만에 맞혔어요!` : '아쉬워요! 정답은 이 단어예요.'}</p>
    <div class="word-answer">
      <span class="word-answer-text">${escapeHtml(w.toUpperCase())}</span>
      ${dailyWord.meaning ? `<span class="word-answer-ko">${escapeHtml(dailyWord.meaning)}</span>` : ''}
      ${wordSayBtn(w, `${w} 발음 듣기`)}
    </div>
    ${explainHtml(ex, st.won)}
    ${!after ? '' : `${sentence ? `<p class="word-sentence"><span class="word-sentence-label">수업에서는 이렇게 써요</span>${sentence}</p>
      <button type="button" class="say-btn word-say-pill" data-say="${escapeHtml(picked)}" data-course="en" aria-label="문장 듣기">${SPEAKER_ICON}<span>문장 듣기</span></button>` : ''}
    <p class="word-stats">${streak > 0 ? `🔥 ${streak}일 연속` : '연속 기록 없음'} · 맞힌 날 ${stats.won} / ${stats.played} · 최고 ${stats.best}일 연속</p>
    <button class="primary" id="word-share">결과 공유하기</button>
    <p class="hint" id="word-share-msg" role="status"></p>
    <button class="secondary" id="word-done-back">챕터 목록으로</button>
    <p class="hint">다음 단어는 내일 0시(한국 시간)에 나와요.</p>`}
    ${dailyWord.test_account ? `<button class="link word-reset" id="word-reset">↺ 다시 하기 · 시험용 (선생님·테스터에게만 보여요)</button>` : ''}`;
  if (after) {
    $('#word-share').addEventListener('click', shareWord);
    $('#word-done-back').addEventListener('click', leaveWord);   // 맨 아래에서도 돌아가게 (89단계: 이 화면에는 아래쪽 탭 바가 없다)
  }
  if (dailyWord.test_account) $('#word-reset').addEventListener('click', resetWordForTest);
  const ta = $('#wx-text');
  if (ta) ta.value = wordExplainDraft;
}

/* ── 오늘의 단어 한 마디로 설명하기 (87단계) ──
   정답이 공개된 뒤(맞혀도, 못 맞혀도) 그 단어를 쉬운 영어 한두 문장으로 설명해 보고 짧은 피드백을 받는다.
   결과 설명의 ③ "It means …"처럼 '어려운 말을 쉬운 말로'의 기초 연습. 선택이라 건너뛸 수 있고, 게임 기록과는 따로다.
   정답 단어는 최대한 쓰지 않도록 권하지만 막지는 않는다 (88단계: "Lunch is …"처럼 단어로 시작하는 습관도 있다). 쓰면 피드백이 한마디 권한다.
   쓴 글과 피드백은 이 휴대폰에만 (오늘 푼 상태의 explain). */
const WORD_FRAMES = ["It's in your ", 'You use it to ', "It's like ", "It's a kind of "];
const WORD_VERDICT = {
  clear: '✓ 뜻이 잘 통해요',
  okay: '✓ 조금 어색하지만 통해요',
  unclear: '뜻이 잘 전해지지 않았어요. 다시 써 볼까요?'
};
let wordExplainDraft = '';     // 쓰는 중인 글 (화면을 다시 그려도 남게)
let wordExplainEditing = false;   // 피드백을 받은 뒤 '다시 써 보기' 또는 건너뛴 뒤 '설명해 보기'로 다시 쓰는 중
let wordExplainBusy = false;

/** won: 못 맞힌 날은 제목을 'Nice try!'로 (89단계: '아쉬워요' 바로 아래 'Good Work!'는 말이 맞지 않았다) */
function explainHtml(ex, won) {
  if (ex.fb && !wordExplainEditing) {
    const fb = ex.fb;
    const fixed = fb.corrected && fb.corrected !== ex.text;
    const alts = (fb.alternatives || []).map((a) =>
      `<div class="fb-better-row"><span>${escapeHtml(a)}</span>${wordSayBtn(a, '문장 듣기')}</div>`).join('');
    // 뜻이 잘 전해지지 않았으면 '다시 써 보기'를 버튼으로 키운다 (91단계: 판정 글이 다시 써 보자고 하는데 작은 링크였다)
    const again = ex.left === 0
      ? '<p class="hint">오늘 받을 수 있는 피드백을 다 썼어요.</p>'
      : `<button class="${fb.overall === 'unclear' ? 'secondary wx-again-btn' : 'link wx-link'}" id="wx-again">↺ 다시 써 보기${ex.left != null ? ` · 오늘 ${ex.left}번 남음` : ''}</button>`;
    return `<div class="wx" id="wx">
      <p class="wx-title">✍️ 내 설명</p>
      <p class="fb-said">${escapeHtml(ex.text)}</p>
      <p class="wx-verdict ${escapeHtml(fb.overall)}">${WORD_VERDICT[fb.overall] || WORD_VERDICT.okay}</p>
      ${fb.message ? `<p class="wx-msg">${escapeHtml(fb.message)}</p>` : ''}
      ${fixed ? `<div class="fb-better"><span class="fb-label">이렇게 고쳐 보면</span>
          <div class="fb-better-row"><span>${escapeHtml(fb.corrected)}</span>${wordSayBtn(fb.corrected, '고친 문장 듣기')}</div></div>
        ${(fb.changes || []).length ? `<ul class="wx-changes">${fb.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('')}</ul>` : ''}`
        : '<p class="wx-ok">고칠 곳 없이 잘 썼어요 👍</p>'}
      ${alts ? `<p class="fb-label wx-alt-title">이렇게도 말할 수 있어요</p><div class="wx-alts">${alts}</div>` : ''}
      ${again}
    </div>`;
  }
  if (ex.skipped && !wordExplainEditing) {
    return '<button class="link wx-link" id="wx-open">✍️ 오늘의 단어를 한 마디로 설명해 보기</button>';
  }
  // 피드백을 기다리는 동안은 틀·입력 칸·건너뛰기를 잠근다 (91단계: 건너뛴 뒤 피드백이 뒤늦게 와서 화면이 두 번 바뀌었다)
  const busy = wordExplainBusy ? ' disabled' : '';
  const frames = WORD_FRAMES.map((f) => `<button type="button" class="chip wx-frame" data-frame="${escapeHtml(f)}"${busy}>${escapeHtml(f.trim())} …</button>`).join('');
  return `<div class="wx" id="wx">
    <p class="wx-title">${won ? 'Good Work!' : 'Nice try!'}<span class="wx-sub">오늘의 단어를 한 마디로 설명해 봅시다!</span></p>
    <p class="wx-desc"><b>오늘의 단어</b>는 최대한 쓰지 않고 설명해 봅시다.</p>
    <div class="wx-frames">${frames}</div>
    <textarea id="wx-text" rows="2" maxlength="200" lang="en" autocomplete="off" autocorrect="off" autocapitalize="sentences" spellcheck="false"${busy}
      aria-label="오늘의 단어 설명" placeholder="It's … / You use it to …"></textarea>
    <p class="hint wx-err" id="wx-err" role="alert"></p>
    <button class="primary" id="wx-send"${busy}>${wordExplainBusy ? '피드백을 만들고 있어요…' : '피드백 받기'}</button>
    ${ex.fb || ex.skipped ? `<button class="link wx-link" id="wx-cancel"${busy}>취소</button>` : `<button class="link wx-link" id="wx-skip"${busy}>건너뛰기</button>`}
  </div>`;
}

function saveExplain(patch) {
  const st = wordState();
  st.explain = { ...(st.explain || {}), ...patch };
  saveJson(WORD_KEY, st);
  return st;
}

async function sendExplain() {
  if (wordExplainBusy) return;
  const text = $('#wx-text').value.replace(/\s+/g, ' ').trim();
  const err = $('#wx-err');
  wordExplainDraft = text;
  if (!text) { err.textContent = '설명을 한두 문장 써 주세요.'; return; }
  wordExplainBusy = true;
  renderWordEnd(wordState());
  try {
    const { fb, left } = await explainWord(loadCode(), text);
    wordExplainBusy = false;
    wordExplainEditing = false;
    wordExplainDraft = '';
    const st = saveExplain({ text, fb, left, skipped: false });
    renderWordEnd(st);
    renderWordCard();
    const box = $('#wx');
    if (box) box.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  } catch (e) {
    wordExplainBusy = false;
    const st = e.message === 'EXPLAIN_LIMIT' && wordState().explain ? saveExplain({ left: 0 }) : wordState();
    renderWordEnd(st);
    $('#wx-err').textContent = errorText(e);
  }
}

$('#word-end').addEventListener('input', (ev) => { if (ev.target.id === 'wx-text') wordExplainDraft = ev.target.value; });
/* 입력 칸을 누르면 휴대폰 키보드가 '피드백 받기'를 가렸다 (91단계). 키보드가 올라온 뒤 보이는 영역(visualViewport) 안으로 버튼까지 올린다 */
function keepExplainSendVisible() {
  const vv = window.visualViewport;
  const btn = $('#wx-send');
  if (!vv || !btn || document.activeElement !== $('#wx-text')) return;
  const over = btn.getBoundingClientRect().bottom + 12 - (vv.offsetTop + vv.height);
  if (over > 0) window.scrollBy({ top: over, behavior: reduceMotion() ? 'auto' : 'smooth' });
}
$('#word-end').addEventListener('focusin', (ev) => { if (ev.target.id === 'wx-text') setTimeout(keepExplainSendVisible, 350); });
if (window.visualViewport) window.visualViewport.addEventListener('resize', keepExplainSendVisible);
$('#word-end').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b || (wordExplainBusy && b.closest('#wx'))) return;
  if (b.classList.contains('wx-frame')) {
    // 설명 틀: 쓰던 글 뒤에 이어 붙이고 바로 이어서 쓸 수 있게
    const ta = $('#wx-text');
    ta.value = (ta.value.trim() ? ta.value.trim() + ' ' : '') + b.dataset.frame;
    wordExplainDraft = ta.value;
    ta.focus();
    ta.setSelectionRange(ta.value.length, ta.value.length);
    return;
  }
  if (b.id === 'wx-send') return sendExplain();
  if (b.id === 'wx-skip') { wordExplainDraft = ''; renderWordEnd(saveExplain({ skipped: true })); return; }
  if (b.id === 'wx-open' || b.id === 'wx-again') {
    wordExplainEditing = true;
    wordExplainDraft = b.id === 'wx-again' ? wordState().explain.text : '';
    renderWordEnd(wordState());
    $('#wx-text').focus();
    return;
  }
  if (b.id === 'wx-cancel') { wordExplainEditing = false; wordExplainDraft = ''; renderWordEnd(wordState()); }
});

function wordKey(key) {
  const st = wordState();
  if (st.done || wordFlipping || wordChecking) return;
  if (key === 'back') { wordTyping = wordTyping.slice(0, -1); return renderWord(); }
  if (key === 'enter') return submitWord(st);
  if (/^[a-z]$/.test(key) && wordTyping.length < WORD_LEN) { wordTyping += key; renderWord(); }
}

/** 오류 안내 (90단계): 칸 위에 잠깐 띄운다. 힌트 글(#word-msg)은 그대로 둔다 (전에는 같은 줄을 써서 힌트가 사라졌다) */
let wordToastTimer = 0;
function wordToast(msg) {
  const t = $('#word-toast');
  clearTimeout(wordToastTimer);
  t.textContent = msg;
  t.hidden = !msg;
  if (msg) wordToastTimer = setTimeout(() => { t.hidden = true; }, 2000);
}
function shakeNowRow(msg) {
  wordToast(msg);
  const row = document.querySelector('.word-row.now');
  if (row) { row.classList.remove('shake'); void row.offsetWidth; row.classList.add('shake'); }
}

async function submitWord(st) {
  if (wordTyping.length < WORD_LEN) return shakeNowRow(`${WORD_LEN}글자를 모두 채워 주세요`);
  // 사전에 없는 단어는 받지 않는다 (기회도 줄지 않음). 정답 단어는 사전에 없어도 받는다
  if (!wordDict) {
    wordChecking = true;
    await loadWordDict();
    wordChecking = false;
  }
  if (wordDict && wordTyping !== dailyWord.word && !wordDict.has(wordTyping)) return shakeNowRow('사전에 없는 단어예요');
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
    // 이번 줄로 힌트가 막 열렸으면 버튼이 두 번 살짝 커지며 알려 준다 (90단계)
    const hintBtn = $('#word-hint');
    if (!st.done && !hintBtn.hidden && st.guesses.length === WORD_HINT_AFTER && !st.guesses.includes(dailyWord.word)) {
      hintBtn.classList.remove('ready'); void hintBtn.offsetWidth; hintBtn.classList.add('ready');
    }
    // 방금 끝났으면 결과·설명 칸으로 내려간다 (89단계: 812px 높이 휴대폰에서도 입력 칸이 화면 아래에 숨었다)
    if (st.done) $('#word-end').scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
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
  wordExplainDraft = '';
  wordExplainEditing = false;
  $('#word-msg').textContent = '';
  wordToast('');
  renderWord();
  renderWordCard();
  window.scrollTo(0, 0);
}

/** 결과 공유 글: 정답 글자 없이 색만 (아직 안 푼 동료에게 스포일러가 되지 않게) */
function wordShareText() {
  const st = wordState();
  const grid = st.guesses.map((g) => scoreGuess(g, dailyWord.word).map((m) => WORD_MARK[m]).join('')).join('\n');
  return `Tutoreal 오늘의 단어 #${dailyWord.no}  ${st.won ? st.guesses.length : 'X'}/${WORD_TRIES}${hintOpen(st) ? ' 💡' : ''}${st.explain && st.explain.fb ? ' ✍️' : ''}\n${grid}`;
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
  if (ev.target.closest && ev.target.closest('textarea, input')) return;   // 설명 칸(87단계)에 쓰는 글자는 게임 키로 쓰지 않는다
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
$('#word-hint').addEventListener('animationend', (ev) => ev.currentTarget.classList.remove('ready'));   // 다시 그려도 또 반짝이지 않게
$('#word-hint').addEventListener('click', () => {
  const st = wordState();
  if (st.guesses.filter((g) => g !== dailyWord.word).length < WORD_HINT_AFTER) return;   // 잠긴 동안은 열리지 않게
  st.hint = true;
  saveJson(WORD_KEY, st);
  renderWord();
});
function leaveWord() { renderWordCard(); show('list'); }
$('#word-back').addEventListener('click', leaveWord);
$('#word-nudge-btn').addEventListener('click', () => finishReview('word'));
$('#review-drill').addEventListener('click', () => finishReview('drill'));

setVersion();
renderThemeBtn();
$('#theme-btn').addEventListener('click', nextTheme);
loadAvatars().then(() => { renderMe(); if (!$('#view-login').hidden) renderLoginLook(); });   // 124단계: 출입증 사진 자리도 캐릭터로
show('login');
// 저장된 코드는 입력칸에 채워 두기만 한다. '다음부터 자동 로그인'을 체크한 사람만 바로 들어간다.
const saved = loadCode();
// 예전 카드와 출입증의 체크박스는 같은 설정. 출입증에서는 이 체크가 코드 저장 여부도 정한다 (124단계)
const syncAuto = (on) => { saveAuto(on); $('#auto-login').checked = on; $('#pass-auto').checked = on; };
syncAuto(loadAuto());
$('#auto-login').addEventListener('change', (e) => syncAuto(e.target.checked));
$('#pass-auto').addEventListener('change', (e) => {
  syncAuto(e.target.checked);
  if (!e.target.checked) keepCode(codeMem, false);   // 124단계: 자동 체크인을 끄면 기기에 남은 코드를 지운다
});
// 124단계: 다른 사람으로 체크인 — 이 기기의 출입증 정보와 코드를 지우고 첫 방문 화면
$('#pass-switch').addEventListener('click', () => {
  stopPassRetry();
  setPassState('');
  saveCode('');
  savePassProfile(null);
  $('#pass-code').value = '';
  setLoginMsg('');
  renderLoginLook();
  $('#pass-code').focus();
});
// 출입증에서 자동 체크인이 꺼져 있으면 예전에 저장된 코드를 지운다 (124단계 규칙, 예전 화면은 그대로)
if (saved && passOn() && !loadAuto()) saveCode('');
if (loadCode()) {
  $('#login-code').value = saved;
  $('#pass-code').value = saved;
  if (loadAuto()) enter(saved);
}
