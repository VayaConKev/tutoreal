// 바뀌는 값은 이 파일 한 곳에만 둔다 (README 규칙 7).
// 서버 주소는 공개돼도 괜찮다. API 키는 절대 여기에 넣지 않는다.
export const APP_VERSION = 'v0.70';
export const SERVER_URL = 'https://script.google.com/macros/s/AKfycbzCJi72ilZwyiHruwlSR2OGWQ_toNa-CvjHej1k6S8l6S-Nk_9BczuJ1p2KDQ69N1cI/exec';
// Gemini Live 연결 주소 (임시 토큰 전용, v1beta). 키는 필요 없고 서버가 준 토큰을 붙여 쓴다.
export const LIVE_WS_URL = 'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
