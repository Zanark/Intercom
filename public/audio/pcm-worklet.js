class IntercomPcm extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(1024);
    this.used = 0;
    this.stopped = false;
    this.port.onmessage = ({ data }) => {
      if (data !== 'stop') return;
      this.stopped = true;
      this.flush();
      this.port.postMessage('stopped');
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.buffer.slice(0, this.used);
    this.port.postMessage(samples, [samples.buffer]);
    this.used = 0;
  }
  process(inputs) {
    if (this.stopped) return false;
    const input = inputs[0]?.[0];
    if (input) for (const sample of input) {
      this.buffer[this.used++] = sample;
      if (this.used === this.buffer.length) this.flush();
    }
    return true;
  }
}
registerProcessor('intercom-pcm', IntercomPcm);
