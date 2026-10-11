// 서버(Apps Script)와 주고받는 일만 담당한다.
import { SERVER_URL } from './config.js';

async function send(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
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
async function postServer(action, body = {}, timeoutMs = 15000) {
  return send(SERVER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...body })
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
  return { token: data.token, model: data.model, patient: data.patient, server: data.server };
}
