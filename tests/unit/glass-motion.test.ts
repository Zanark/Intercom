import { describe, expect, it } from 'vitest';
import { glassMotion } from '../../src/domain/glass-motion';

const angles = (seed: number) => glassMotion(seed).map((frame) =>
  [...String(frame.transform).matchAll(/\((-?[\d.e+-]+)deg\)/g)].map((match) => Number(match[1])));

describe('glass surface motion', () => {
  it('changes direction on all three axes without abrupt turns or a loop seam', () => {
    for (const seed of [0, 42, 0xffffffff]) {
      const frames = angles(seed);
      for (let axis = 0; axis < 3; axis++) {
        expect(frames.at(-1)![axis]).toBeCloseTo(frames[0][axis], 10);
        const velocity = frames.slice(1).map((frame, i) => frame[axis] - frames[i][axis]);
        expect(Math.max(...velocity)).toBeGreaterThan(.1);
        expect(Math.min(...velocity)).toBeLessThan(-.1);
        expect(Math.max(...velocity.map(Math.abs))).toBeLessThan(1.4);
        const acceleration = velocity.map((value, i) => value - velocity[(i + velocity.length - 1) % velocity.length]);
        expect(Math.max(...acceleration.map(Math.abs))).toBeLessThan(.04);
      }
    }
  });

  it('keeps one mount stable but gives different seeds different paths', () => {
    expect(glassMotion(42)).toEqual(glassMotion(42));
    expect(glassMotion(42)).not.toEqual(glassMotion(43));
  });
});
