// 새 버전을 바로 받게 하는 서비스 워커.
// GitHub Pages는 파일을 10분 동안 휴대폰에 저장해 두고 쓰게 하므로, 업데이트 직후에 예전 파일과 새 파일이 섞일 수 있다.
// 이 파일은 앱의 파일을 받을 때마다 GitHub에 "바뀌었나요?"를 먼저 묻게 한다 (안 바뀌었으면 저장된 파일을 그대로 쓴다).
// 오프라인 저장은 하지 않는다. 서버(Apps Script)·Gemini 같은 다른 주소의 요청은 건드리지 않는다.
//
// 문제가 생겨 이 기능을 끄고 싶으면: 아래 fetch 처리 부분을 지우고 self.registration.unregister()만 남긴다.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req.url, { cache: 'no-cache' }).catch(() => fetch(req)));
});
