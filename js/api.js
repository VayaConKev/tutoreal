// 서버(Apps Script)와 주고받는 일만 담당한다.
import { SERVER_URL } from './config.js';

async function send(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // credentials: 'omit' — 구글 로그인 정보(쿠키)를 보내지 않는다. 보내면 Apps Script가 요청을 처리하지 못할 수 있다.
    const res = await fetch(url, { credentials: 'omit', ...init, signal: controller.signal });
    if (!res.ok) throw new Error('HTTP_' + res.status);
    const data = await res.json();
    if (!data.ok) throw new Error(data.error || 'SERVER_ERROR');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('TIMEOUT');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 접속 코드처럼 주소(URL)에 남으면 안 되는 값은 본문(POST)으로 보낸다.
// text/plain으로 보내야 브라우저가 사전 확인(CORS preflight) 없이 Apps Script로 보낼 수 있다.
// keepalive: 화면을 닫는 중이어도 요청을 끝까지 보낸다.
async function postServer(action, body = {}, timeoutMs = 15000, keepalive = false) {
  return send(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body }),
    keepalive
  }, timeoutMs);
}

// 챕터 목록은 접속 코드로만 받는다. 서버가 그 학생 과정(영어/중국어)의 챕터만 준다.
export async function getChapters(code) {
  const data = await postServer('chapters', { code });
  return { chapters: data.chapters || [], server: data.server };
}

export async function login(code) {
  const data = await postServer('login', { code });
  return { name: data.name, role: data.role || 'student', avatar: data.avatar || '', course: data.course || 'en', server: data.server };
}

export async function startTalk(code, chapterId) {
  const data = await postServer('talk', { code, chapter_id: chapterId });
  return {
    token: data.token, model: data.model, patient: data.patient, sessionId: data.session_id, scenarioId: data.scenario_id, server: data.server,
    limitSec: data.limit_sec, limitKind: data.limit_kind
  };
}

// 대화 글자로 AI 피드백을 받는다. 수업 중처럼 붐빌 때는 1분을 넘기기도 해서 2분까지 기다린다 (v0.39, 전에는 60초).
export async function getFeedback(code, sessionId, lines) {
  const data = await postServer('feedback', { code, session_id: sessionId, lines }, 120000);
  return data.feedback;
}

// '공유하기'를 고른 대화의 글자와 자기 평가를 시트에 저장한다. 피드백은 서버가 기억해 둔 것을 쓴다.
export async function shareTalk(code, sessionId, confidence, difficulty, lines) {
  await postServer('share', { code, session_id: sessionId, confidence, difficulty, lines }, 30000);
}

// 선생님 요약 (선생님 코드만). refresh면 AI 정리를 새로 만들고 시트 summary 탭도 새로 쓴다 — 오래 걸릴 수 있다.
// course: 볼 과정 (en/zh). 비우면 선생님 자신의 과정. 새로 정리하기는 모든 과정의 summary 탭을 다시 쓴다.
export async function getSummary(code, refresh = false, course = '') {
  const data = await postServer('summary', { code, refresh, course }, refresh ? 180000 : 30000);
  return data.summary;
}

// 선생님 전용: 학생 한 명의 공유된 대화 (최근 20개). 피드백과 대화 글자가 함께 온다.
export async function getStudentTalks(code, studentId) {
  const data = await postServer('student_talks', { code, student_id: studentId }, 30000);
  return data.talks || [];
}

// 발음 코칭: 녹음한 소리(WAV base64)를 보내 코칭을 받는다. 문장은 서버가 시트에서 찾는다.
export async function checkPronunciation(code, drillId, level, audio) {
  const data = await postServer('pronounce', { code, drill_id: drillId, level, audio }, 60000);
  return data.coach;
}

// 중국어 과정: 상대가 한 말 한 줄의 교과서식 병음과 한국어 뜻. 대화 중에 줄마다 부른다.
export async function getGloss(code, sessionId, text) {
  const data = await postServer('gloss', { code, session_id: sessionId, text }, 30000);
  return { pinyin: data.pinyin || '', ko: data.ko || '' };
}

// 내가 고른 캐릭터 번호(예: s07)를 저장한다. 빈 값이면 머리글자로 돌아간다.
export async function setAvatar(code, avatar) {
  await postServer('set_avatar', { code, avatar });
}

// 대화가 끝났음을 알린다 (사용 시간 기록). 답은 기다리지 않는다.
// v0.9의 sendBeacon은 구글 로그인 정보(쿠키)를 함께 보내 기록이 남지 않았다 → 다른 요청과 같은 방식 + keepalive.
// aiAudioSec: 앱이 받은 AI 목소리 길이(초) — 예상 비용 계산에 쓴다.
export function endTalk(code, sessionId, durationSec, endReason, aiAudioSec) {
  postServer('end', { code, session_id: sessionId, duration_sec: durationSec, end_reason: endReason, ai_audio_sec: aiAudioSec }, 15000, true)
    .catch((err) => console.warn('사용 시간 기록 실패', err));
}
