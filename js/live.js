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

export class LiveSession {
  // 반드시 버튼을 누른 그 순간에 만든다. iOS는 사용자가 누른 순간에만 소리를 켤 수 있다.
  constructor({ onStatus, onEnd }) {
    this.onStatus = onStatus;
    this.onEnd = onEnd;
    this.ctx = new AudioContext();
    this.ctx.resume();
    // iOS는 마이크를 켜는 순간이나 전화·알림이 올 때 오디오를 멈출 수 있다. 대화 중이면 다시 켠다.
    this.ctx.onstatechange = () => {
      if (!this.ended && this.ctx.state !== 'running' && this.ctx.state !== 'closed') this.ctx.resume().catch(() => {});
    };
    this.sent = 0;   // 보낸 소리 (초)
    this.recv = 0;   // 받은 소리 (초)
    this.sources = new Set();
    this.playAt = 0;
    this.ready = false;
    this.ended = false;
  }

  /** 마이크를 켠다. 토큰은 1분 안에 써야 하므로, 허용 창이 뜰 수 있는 마이크를 먼저 준비한다. */
  async openMic() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    if (this.ctx.state !== 'running') await this.ctx.resume().catch(() => {});
    await this.ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    if (this.ended) return;
    this.mic = new AudioWorkletNode(this.ctx, 'mic-processor', { processorOptions: { targetRate: IN_RATE } });
    this.mic.port.onmessage = (e) => this.sendAudio(e.data);
    const mute = this.ctx.createGain();   // 내 목소리가 스피커로 다시 나오지 않게 소리 0으로 연결
    mute.gain.value = 0;
    this.ctx.createMediaStreamSource(this.stream).connect(this.mic).connect(mute).connect(this.ctx.destination);
  }

  /** 임시 토큰으로 Gemini Live에 직접 연결한다. 지시문은 토큰 안에 고정되어 있어 모델 이름만 보낸다. */
  connect(token, model) {
    if (this.ended) return;
    this.ws = new WebSocket(`${LIVE_WS_URL}?access_token=${encodeURIComponent(token)}`);
    this.ws.binaryType = 'arraybuffer';
    this.ws.onopen = () => this.ws.send(JSON.stringify({ setup: { model: `models/${model}` } }));
    this.ws.onmessage = (e) => this.handle(e.data);
    // '끝내기'로 닫은 경우는 stop()이 먼저 불려 여기서 아무 일도 하지 않는다. 그 밖에는 끊긴 이유를 보여 준다.
    this.ws.onclose = (e) => this.stop(`연결이 끊겼어요 (${e.code}${e.reason ? ': ' + e.reason : ''})`);
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
    return `보낸 소리 ${this.sent.toFixed(1)}초 · 받은 소리 ${this.recv.toFixed(1)}초 · 오디오 ${this.ctx.state}`;
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
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close(1000);
    this.stopPlayback();
    this.ctx.close().catch(() => {});
    this.onEnd(reason, info);
  }
}
