// 서버(Apps Script)와 주고받는 일만 담당한다.
import { SERVER_URL } from './config.js';

async function callServer(action, params = {}, timeoutMs = 15000) {
  const url = new URL(SERVER_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
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

export async function getChapters() {
  const data = await callServer('chapters');
  return { chapters: data.chapters || [], server: data.server };
}
