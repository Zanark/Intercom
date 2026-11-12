import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeWave, Recording } from '../../src/voice/recording';

afterEach(() => vi.unstubAllGlobals());

function microphone(rate = 16000) {
  const track = { label: 'Synthetic input', getSettings: () => ({ sampleRate: 48000, channelCount: 1 }),
    addEventListener: vi.fn(), removeEventListener: vi.fn(), stop: vi.fn() };
  const stream = { getAudioTracks: () => [track], getTracks: () => [track] };
  const port = { onmessage: null as ((event: { data: Float32Array | string }) => void) | null,
    postMessage: () => queueMicrotask(() => port.onmessage?.({ data: 'stopped' })), close: vi.fn() };
  const close = vi.fn(async () => {});
  vi.stubGlobal('document', { baseURI: 'file:///synthetic/index.html' });
  vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: vi.fn(async () => stream) } });
  vi.stubGlobal('AudioContext', class {
    sampleRate = rate;
    state = 'running';
    audioWorklet = { addModule: async () => {} };
    createMediaStreamSource() { return { connect: () => {} }; }
    async resume() {}
    async close() { this.state = 'closed'; await close(); }
  });
  vi.stubGlobal('AudioWorkletNode', class {
    port = port;
    connect() {}
    disconnect() {}
  });
  return { track, port, close };
}

describe('recorded PCM transport', () => {
  it('encodes mono PCM, clips amplitudes and preserves ordered chunks', () => {
    const wave = encodeWave([new Float32Array([-2, -0.5]), new Float32Array([0, 0.5, 2])], 16000);
    const view = new DataView(wave);
    expect(new TextDecoder().decode(wave.slice(0, 4))).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(wave.byteLength - 8);
    expect(view.getUint32(24, true)).toBe(16000);
    expect(view.getUint32(40, true)).toBe(10);
    expect(Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true))).toEqual([-32768, -16384, 0, 16384, 32767]);
  });

  it('distinguishes browser input rate from recognition PCM and measures actual signal, clipping and duration', async () => {
    const input = microphone();
    const recording = new Recording(() => {}, () => {});
    await recording.start('exact-synthetic-device');
    const samples = Float32Array.from({ length: 8192 }, (_, index) => [0, 0.5, -1, 1][index % 4]);
    input.port.onmessage?.({ data: samples });
    const wave = await recording.stop();
    expect(recording.input).toMatchObject({ deviceRate: 48000, captureRate: 16000 });
    expect(recording.diagnostics).toMatchObject({ seconds: 8192 / 16000, rms: 0.75, peak: 1, clipped: 0.5 });
    expect(new DataView(wave).getUint32(24, true)).toBe(16000);
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(input.close).toHaveBeenCalledOnce();
  });

  it('rejects silence while retaining honest zero-level diagnostics and releasing input', async () => {
    const input = microphone();
    const recording = new Recording(() => {}, () => {});
    await recording.start('default');
    input.port.onmessage?.({ data: new Float32Array(8192) });
    await expect(recording.stop()).rejects.toThrow('No usable microphone signal');
    expect(recording.diagnostics).toMatchObject({ peak: 0, rms: 0, clipped: 0 });
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(input.close).toHaveBeenCalledOnce();
  });

  it('snapshots only usable audio without releasing input or consuming the final recording', async () => {
    const input = microphone();
    const recording = new Recording(() => {}, () => {});
    await recording.start('default');
    input.port.onmessage?.({ data: new Float32Array(16000) });
    expect(recording.snapshot()).toBeNull();
    input.port.onmessage?.({ data: new Float32Array(16000).fill(0.5) });
    const preview = recording.snapshot()!;
    expect(preview.byteLength).toBe(44 + 32000 * 2);
    expect(input.track.stop).not.toHaveBeenCalled();
    input.port.onmessage?.({ data: new Float32Array(8000).fill(-0.5) });
    const final = await recording.stop();
    expect(final.byteLength).toBe(44 + 40000 * 2);
    expect(new DataView(preview).getInt16(preview.byteLength - 2, true)).toBe(16384);
    expect(new DataView(final).getInt16(final.byteLength - 2, true)).toBe(-16384);
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(() => recording.snapshot()).toThrow('No active recording');
  });

  it.each([16000, 48000])('keeps five minutes at %i Hz, caps an overrun once and preserves the final boundary samples', async (rate) => {
    const input = microphone(rate);
    const disconnected = vi.fn();
    const limit = vi.fn();
    const recording = new Recording(() => {}, disconnected, limit);
    await recording.start('default');
    input.port.onmessage?.({ data: new Float32Array(rate * 299).fill(0.25) });
    expect(limit).not.toHaveBeenCalled();
    expect(recording.diagnostics.seconds).toBe(299);
    const tail = new Float32Array(rate + 128).fill(-0.5);
    tail[rate - 1] = 0.75;
    input.port.onmessage?.({ data: tail });
    input.port.onmessage?.({ data: new Float32Array(1024).fill(1) });
    expect(limit).toHaveBeenCalledOnce();
    expect(disconnected).not.toHaveBeenCalled();
    expect(recording.diagnostics.seconds).toBe(300);
    const wave = await recording.stop();
    expect(wave.byteLength).toBe(44 + rate * 300 * 2);
    expect(new DataView(wave).getInt16(wave.byteLength - 2, true)).toBe(24575);
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(input.close).toHaveBeenCalledOnce();
  });

  it('cancels a long recording without retaining a usable snapshot or keeping input open', async () => {
    const input = microphone();
    const recording = new Recording(() => {}, () => {});
    await recording.start('default');
    input.port.onmessage?.({ data: new Float32Array(16000 * 299).fill(0.5) });
    await recording.cancel();
    expect(() => recording.snapshot()).toThrow('No active recording');
    await expect(recording.stop()).rejects.toThrow('No active recording');
    expect(input.track.stop).toHaveBeenCalledOnce();
    expect(input.close).toHaveBeenCalledOnce();
  });
});
