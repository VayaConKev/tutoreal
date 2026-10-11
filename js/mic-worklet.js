// 마이크 소리를 Gemini Live가 받는 형식(16kHz, 16bit PCM)으로 바꿔 0.1초씩 보낸다.
// 브라우저의 오디오 처리 스레드에서 돌아가는 작은 프로그램 (AudioWorklet).
class MicProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const target = options.processorOptions.targetRate;
    this.ratio = sampleRate / target;   // 예: 48000 / 16000 = 3 → 3개를 평균 내어 1개로
    this.pos = 0;
    this.sum = 0;
    this.count = 0;
    this.size = target / 10;   // 0.1초 분량 (16000 / 10 = 1600개)
    this.chunk = new Int16Array(this.size);
    this.len = 0;
    // 문제 찾기용: 처리 횟수, 그중 마이크 소리가 비어 있던 횟수, 보낸 덩어리 수, 대화 중 가장 큰 소리(0~100)
    this.calls = 0;
    this.empty = 0;
    this.chunks = 0;
    this.peak = 0;
    this.reportAt = 0;
  }

  process(inputs) {
    this.calls++;
    if (currentTime >= this.reportAt) {
      this.reportAt = currentTime + 1;
      this.port.postMessage({ type: 'stats', calls: this.calls, empty: this.empty, chunks: this.chunks, peak: Math.round(this.peak * 100) });
    }
    const input = inputs[0] && inputs[0][0];
    if (!input) { this.empty++; return true; }
    for (let i = 0; i < input.length; i++) {
      this.sum += input[i];
      if (Math.abs(input[i]) > this.peak) this.peak = Math.abs(input[i]);
      this.count++;
      this.pos += 1;
      if (this.pos >= this.ratio) {
        this.pos -= this.ratio;
        const s = Math.max(-1, Math.min(1, this.sum / this.count));
        this.chunk[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
        this.sum = 0;
        this.count = 0;
        if (this.len === this.chunk.length) {
          this.port.postMessage({ type: 'pcm', buffer: this.chunk.buffer }, [this.chunk.buffer]);
          this.chunks++;
          // 보낸 그릇은 넘겨줘서 비어 있으므로(길이 0) 정해 둔 크기로 새로 만든다. (v0.6.0~0.6.3 버그)
          this.chunk = new Int16Array(this.size);
          this.len = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('mic-processor', MicProcessor);
