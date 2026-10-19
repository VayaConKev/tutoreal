// 문장 연습의 발음 코칭용 녹음: 마이크 소리를 16kHz, 16bit WAV로 모은다 (대화 기능과 같은 마이크 변환기 사용).
// 소리는 서버를 거쳐 AI에 한 번 보내고 어디에도 저장하지 않는다.
const RATE = 16000;

function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** Int16 소리 조각들 → WAV 파일 (44바이트 머리말 + 소리) */
function toWav(chunks) {
  const samples = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const text = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  text(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); text(8, 'WAVE');
  text(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  text(36, 'data'); v.setUint32(40, samples * 2, true);
  let o = 44;
  chunks.forEach((c) => { for (let i = 0; i < c.length; i++, o += 2) v.setInt16(o, c[i], true); });
  return new Uint8Array(buf);
}

export class Recorder {
  /** 마이크를 켜고 녹음을 시작한다. 버튼을 누른 순간에 불러야 한다 (iOS). */
  async start() {
    this.chunks = [];
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
    this.ctx = new AudioContext();
    await this.ctx.resume().catch(() => {});
    await this.ctx.audioWorklet.addModule(new URL('./mic-worklet.js', import.meta.url));
    this.node = new AudioWorkletNode(this.ctx, 'mic-processor', { processorOptions: { targetRate: RATE } });
    this.node.port.onmessage = (e) => {
      if (e.data.type === 'pcm') this.chunks.push(new Int16Array(e.data.buffer));
      else if (e.data.type === 'level' && this.onLevel) this.onLevel(e.data.rms);   // 소리 크기 (55단계)
    };
    this.ctx.createMediaStreamSource(this.stream).connect(this.node).connect(this.ctx.destination);
  }

  /** 녹음을 멈추고 { base64(WAV), seconds }를 돌려준다. */
  stop() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
    const wav = toWav(this.chunks || []);
    return { base64: toBase64(wav), seconds: ((wav.length - 44) / 2) / RATE };
  }

  /** 녹음하지 않고 멈춘다 (화면을 떠날 때). */
  cancel() {
    if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
    if (this.ctx) this.ctx.close().catch(() => {});
  }
}
