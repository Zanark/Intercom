import { describe, expect, it } from 'vitest';
import { encodeWave } from '../../src/voice/recording';

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
});
