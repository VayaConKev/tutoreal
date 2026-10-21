// Gemini Live와 음성으로 주고받는 일만 담당한다. 음성은 어디에도 저장하지 않는다.
import { LIVE_WS_URL } from './config.js';

const IN_RATE = 16000;    // Gemini Live가 받는 마이크 형식: 16kHz, 16bit PCM
const OUT_RATE = 24000;   // Gemini Live가 보내는 목소리 형식 (응답에 rate가 적혀 오면 그 값을 쓴다)

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromBase64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

/** 연결이 끊긴 이유를 화면에 보여 줄 글로 바꾼다.
 *  구글 쪽에서 접근을 막은 경우(1008, 'denied access'·'permission'·'API key')는 영어 원문 대신 쉬운 안내 (65단계).
 *  원문(코드·이유)은 문제를 찾을 수 있게 콘솔에 남긴다. 그 밖의 경우는 전처럼 코드와 이유를 그대로 보여 준다. */
function closeText(e) {
  const raw = `${e.code}${e.reason ? ': ' + e.reason : ''}`;
  if (e.code === 1008 || /denied access|permission|api key/i.test(e.reason || '')) {
    console.warn('Gemini Live 연결이 막혔어요', raw);
    return 'AI 연결이 잠시 막혔어요. 선생님께 알려 주세요.';
  }
  return `연결이 끊겼어요 (${raw})`;
}

export class LiveSession {
  // 반드시 버튼을 누른 그 순간에 만든다. iOS는 사용자가 누른 순간에만 소리를 켤 수 있다.
  // ctx는 AI 목소리 재생용. 마이크용 micCtx는 마이크를 켠 뒤에 따로 만든다 (iOS는 마이크보다 먼저 만든
  // 오디오 장치에 마이크 소리를 넘겨주지 않는 경우가 있다).
  // onText(who, text): 'me'(학생) / 'ai'(환자) 말이 글자로 조금씩 도착할 때. onTurnEnd(): 환자 차례가 끝났을 때.
  // onLevel(rms): 마이크 소리 크기 0~1, 0.05초마다 (55단계, 화면의 목소리 막대)
  constructor({ onStatus, onEnd, onText, onTurnEnd, onLevel }) {
    this.onStatus = onStatus;
    this.onLevel = onLevel || (() => {});
    this.onEnd = onEnd;
    this.onText = onText;
    this.onTurnEnd = onTurnEnd;
    this.ctx = this.keepRunning(new AudioContext());
    this.sent = 0;   // 보낸 소리 (초)
    this.recv = 0;   // 받은 소리 (초)
    this.micStats = { calls: 0, empty: 0, chunks: 0, peak: 0 };   // 변환기가 1초마다 알려 주는 진단 숫자
    this.sources = new Set();
    this.playAt = 0;
    this.ready = false;
    this.ended = false;
  }

  /** 오디오 장치를 켜고, iOS가 (마이크 시작·전화·알림 때문에) 멈추면 대화 중에는 다시 켠다. */
  keepRunning(ctx) {
    ctx.resume().catch(() => {});
    ctx.onstatechange = () => {
      if (!this.ended && ctx.state !== 'running' && ctx.state !== 'closed') ctx.resume().catch(() => {});
    };
    return ctx;
  }

  /** 마이크를 켠다. 토큰은 1분 안에 써야 하므로, 허용 창이 뜰 수 있는 마이크를 먼저 준비한다. */
  async openMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.track = this.stream.getAudioTracks()[0];
    if (this.ended) return this.closeMic();
    this.micCtx = this.keepRunning(new AudioContext());
    await this.micCtx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    if (this.ended) return this.closeMic();
    this.mic = new AudioWorkletNode(this.micCtx, 'mic-processor', { processorOptions: { targetRate: IN_RATE } });
    // 메시지 종류는 이름표(type)로 구분한다: pcm = 마이크 소리 덩어리, stats = 진단 숫자, level = 지금 소리 크기
    this.mic.port.onmessage = (e) => {
      if (e.data.type === 'pcm') this.sendAudio(e.data.buffer);
      else if (e.data.type === 'level') this.onLevel(e.data.rms);
      else if (e.data.type === 'stats') this.micStats = e.data;
    };
    // 변환기는 소리를 내보내지 않으므로(무음) 스피커에 이어도 내 목소리가 다시 들리지 않는다. 이어야 작동한다.
    this.micCtx.createMediaStreamSource(this.stream).connect(this.mic).connect(this.micCtx.destination);
  }

  closeMic() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.micCtx) this.micCtx.close().catch(() => {});
  }

  /** 임시 토큰으로 Gemini Live에 직접 연결한다. 지시문은 토큰 안에 고정되어 있어 모델 이름만 보낸다. */
  connect(token, model) {
    if (this.ended) return;
    this.ws = new WebSocket(`${LIVE_WS_URL}?access_token=${encodeURIComponent(token)}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
    this.ws.onmessage = (e) => this.handle(e.data);
    // '끝내기'로 닫은 경우는 stop()이 먼저 불려 여기서 아무 일도 하지 않는다. 그 밖에는 끊긴 이유를 보여 준다.
    this.ws.onclose = (e) => this.stop(closeText(e));
  }

  sendAudio(buffer) {
    if (!this.ready || this.ws.readyState !== WebSocket.OPEN) return;
    this.sent += buffer.byteLength / 2 / IN_RATE;
    this.ws.send(JSON.stringify({
      realtimeInput: { audio: { data: toBase64(buffer), mimeType: `audio/pcm;rate=${IN_RATE}` } }
    }));
  }

  handle(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw));
    } catch {
      return;
    }
    if (msg.setupComplete) {
      this.ready = true;
      this.onStatus('ready');
    }
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) this.stopPlayback();   // 학생이 말을 끊으면 AI 목소리를 바로 멈춘다
      const parts = (sc.modelTurn && sc.modelTurn.parts) || [];
      parts.forEach((p) => {
        if (p.inlineData && /^audio\/pcm/.test(p.inlineData.mimeType || '')) this.play(p.inlineData);
      });
      if (sc.inputTranscription && sc.inputTranscription.text) this.onText('me', sc.inputTranscription.text);
      if (sc.outputTranscription && sc.outputTranscription.text) this.onText('ai', sc.outputTranscription.text);
      if (sc.turnComplete || sc.interrupted) this.onTurnEnd();
    }
    if (msg.goAway) this.onStatus('goaway');
  }

  play({ data, mimeType }) {
    const rate = Number((/rate=(\d+)/.exec(mimeType) || [])[1]) || OUT_RATE;
    const bytes = fromBase64(data);
    const pcm = new Int16Array(bytes.buffer, 0, bytes.length >> 1);
    if (!pcm.length) return;
    this.recv += pcm.length / rate;
    const buf = this.ctx.createBuffer(1, pcm.length, rate);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 0x8000;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.connect(this.ctx.destination);
    const at = Math.max(this.playAt, this.ctx.currentTime + 0.05);
    src.start(at);
    this.playAt = at + buf.duration;
    this.sources.add(src);
    src.onended = () => this.sources.delete(src);
  }

  /** 문제를 찾기 위한 연결 정보: 보낸 소리, 받은 소리, 오디오 상태 */
  info() {
    const t = this.track;
    const mic = t ? `${t.readyState}${t.muted ? ' 음소거' : ''}` : '없음';
    const m = this.micStats;
    return `보낸 소리 ${this.sent.toFixed(1)}초 · 받은 소리 ${this.recv.toFixed(1)}초\n` +
      `마이크 ${mic} · 처리 ${m.calls}/${m.empty} · 덩어리 ${m.chunks} · 크기 ${m.peak}\n` +
      `오디오 ${this.ctx.state}/${this.micCtx ? this.micCtx.state : '-'}`;
  }

  stopPlayback() {
    this.sources.forEach((src) => { try { src.stop(); } catch { /* 이미 끝남 */ } });
    this.sources.clear();
    this.playAt = 0;
  }

  /** 대화를 끝낸다. 마이크·연결·오디오를 모두 닫는다. reason이 있으면 화면에 보여 줄 이유. */
  stop(reason = '') {
    if (this.ended) return;
    this.ended = true;
    this.ready = false;
    const info = this.info();
    this.closeMic();
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000);
    this.stopPlayback();
    this.ctx.close().catch(() => {});
    this.onEnd(reason, info);
  }
}
