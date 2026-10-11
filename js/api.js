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

async function callServer(action, params = {}, timeoutMs = 15000) {
  const url = new URL(SERVER_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return send(url, {}, timeoutMs);
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

export async function getChapters() {
  const data = await callServer('chapters');
  return { chapters: data.chapters || [], server: data.server };
}

export async function login(code) {
  const data = await postServer('login', { code });
  return { name: data.name, server: data.server };
}

export async function startTalk(code, chapterId) {
  const data = await postServer('talk', { code, chapter_id: chapterId });
  return { token: data.token, model: data.model, patient: data.patient, sessionId: data.session_id, server: data.server };
}

// 대화가 끝났음을 알린다 (사용 시간 기록). 답은 기다리지 않는다.
// v0.9의 sendBeacon은 구글 로그인 정보(쿠키)를 함께 보내 기록이 남지 않았다 → 다른 요청과 같은 방식 + keepalive.
export function endTalk(code, sessionId, durationSec, endReason) {
  postServer('end', { code, session_id: sessionId, duration_sec: durationSec, end_reason: endReason }, 15000, true)
    .catch((err) => console.warn('사용 시간 기록 실패', err));
}
