export const MAX_RECORDING_SECONDS = 300;

export function encodeWave(chunks: Float32Array[], rate: number): ArrayBuffer {
  const count = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + count * 2);
  const view = new DataView(buffer);
  const text = (offset: number, value: string) => [...value].forEach((letter, index) => view.setUint8(offset + index, letter.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, buffer.byteLength - 8, true);
  text(8, 'WAVE'); text(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  text(36, 'data'); view.setUint32(40, count * 2, true);
  let offset = 44;
  for (const chunk of chunks) for (const sample of chunk) {
    const clipped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, Math.round(clipped * (clipped < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return buffer;
}

export interface InputDiagnostics {
  device: string;
  deviceRate: number | null;
  captureRate: number;
  channels: number | null;
}

export class Recording {
  private stream?: MediaStream;
  private context?: AudioContext;
  private node?: AudioWorkletNode;
  private chunks: Float32Array[] = [];
  private count = 0;
  private closed = false;
  private flushed?: () => void;
  peak = 0;
  input?: InputDiagnostics;
  private squares = 0;
  private clipped = 0;
  get diagnostics() {
    return { ...this.input, seconds: this.count / (this.input?.captureRate || 16000),
      rms: this.count ? Math.sqrt(this.squares / this.count) : 0, peak: this.peak,
      clipped: this.count ? this.clipped / this.count : 0 };
  }
  constructor(private level: (rms: number) => void, private ended: () => void, private limitReached = ended) {}

  async start(deviceId: string) {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false,
        ...(deviceId === 'default' ? {} : { deviceId: { exact: deviceId } }),
      },
      video: false,
    });
    if (this.closed) { await this.cancel(); throw new Error('Recording cancelled.'); }
    for (const track of this.stream.getAudioTracks()) track.addEventListener('ended', this.ended);
    this.context = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' });
    const track = this.stream.getAudioTracks()[0];
    const settings = track.getSettings();
    this.input = { device: track.label || 'Selected microphone', deviceRate: settings.sampleRate ?? null,
      captureRate: this.context.sampleRate, channels: settings.channelCount ?? null };
    await this.context.audioWorklet.addModule(new URL('./audio/pcm-worklet.js', document.baseURI).href);
    if (this.closed) { await this.cancel(); throw new Error('Recording cancelled.'); }
    this.node = new AudioWorkletNode(this.context, 'intercom-pcm', { channelCount: 1, channelCountMode: 'explicit' });
    this.node.port.onmessage = ({ data }: MessageEvent<Float32Array | string>) => {
      if (data === 'stopped') { this.flushed?.(); return; }
      if (this.closed || !(data instanceof Float32Array)) return;
      const remaining = this.context!.sampleRate * MAX_RECORDING_SECONDS - this.count;
      if (remaining <= 0 || !data.length) return;
      const samples = data.length > remaining ? data.slice(0, remaining) : data;
      this.count += samples.length;
      this.chunks.push(samples);
      let squares = 0;
      for (const sample of samples) {
        this.peak = Math.max(this.peak, Math.abs(sample));
        squares += sample * sample;
        if (Math.abs(sample) >= 0.99) this.clipped++;
      }
      this.squares += squares;
      this.level(Math.sqrt(squares / samples.length));
      if (this.count === this.context!.sampleRate * MAX_RECORDING_SECONDS) this.limitReached();
    };
    const source = this.context.createMediaStreamSource(this.stream);
    source.connect(this.node);
    this.node.connect(this.context.destination);
    await this.context.resume();
  }

  snapshot(): ArrayBuffer | null {
    if (this.closed || !this.node || !this.context) throw new Error('No active recording.');
    if (this.count < this.context.sampleRate || this.peak < 0.003) return null;
    return encodeWave(this.chunks, this.context.sampleRate);
  }

  async stop() {
    if (this.closed || !this.node || !this.context) throw new Error('No active recording.');
    const rate = this.context.sampleRate;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('The audio worker did not finish. Nothing was sent.')), 1500);
      this.flushed = () => { clearTimeout(timer); resolve(); };
      this.node!.port.postMessage('stop');
    }).finally(() => this.release());
    const wave = encodeWave(this.chunks, rate);
    this.chunks = [];
    if (wave.byteLength < 44 + rate / 2 || this.peak < 0.003) throw new Error('No usable microphone signal. Nothing was sent. Check the selected input and meter, then try again.');
    return wave;
  }

  private async release() {
    this.closed = true;
    this.node?.disconnect();
    this.node?.port.close();
    this.stream?.getTracks().forEach((track) => { track.removeEventListener('ended', this.ended); track.stop(); });
    if (this.context && this.context.state !== 'closed') await this.context.close();
  }

  async cancel() {
    await this.release();
    this.chunks = [];
  }
}
