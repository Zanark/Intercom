import { describe, expect, it } from 'vitest';
import { WaterSurface } from '../../src/domain/water-surface';

function radius(water: WaterSurface) {
  let total = 0;
  let distance = 0;
  const centre = (water.size - 1) / 2;
  water.height.forEach((value, i) => {
    const weight = Math.abs(value);
    distance += weight * Math.hypot(i % water.size - centre, Math.floor(i / water.size) - centre);
    total += weight;
  });
  return distance / total;
}

describe('microphone water surface', () => {
  it('propagates a centre disturbance outward symmetrically and damps it away', () => {
    const water = new WaterSurface();
    water.drop(1);
    for (let i = 0; i < 8; i++) water.step();
    const inner = radius(water);
    for (let i = 0; i < 30; i++) water.step();
    expect(radius(water)).toBeGreaterThan(inner + 8);
    for (let y = 0; y < water.size; y++) for (let x = 0; x < water.size; x++) {
      expect(water.height[y * water.size + x]).toBeCloseTo(water.height[y * water.size + water.size - x - 1], 6);
    }
    for (let i = 0; i < 500; i++) water.step();
    expect(water.energy).toBeLessThan(.001);
  });

  it('scales physical displacement with input, encodes opposing slopes and clears to neutral', () => {
    const soft = new WaterSurface();
    const loud = new WaterSurface();
    soft.drop(.2);
    loud.drop(1);
    for (let i = 0; i < 15; i++) { soft.step(); loud.step(); }
    expect(loud.energy).toBeCloseTo(soft.energy * 5, 6);
    const pixels = new Uint8ClampedArray(loud.size * loud.size * 4);
    const lighting = new Uint8ClampedArray(pixels.length);
    loud.render(pixels, lighting, 1);
    const red = pixels.filter((_, i) => i % 4 === 0);
    expect(Math.max(...red)).toBeGreaterThan(150);
    expect(Math.min(...red)).toBeLessThan(106);
    expect(pixels.every((value, i) => i % 4 !== 3 || value === 255)).toBe(true);
    expect(Math.max(...lighting.filter((_, i) => i % 4 === 3))).toBeGreaterThan(10);
    loud.clear();
    loud.render(pixels, lighting, 1);
    expect(loud.energy).toBe(0);
    expect(pixels.every((value, i) => value === (i % 4 === 3 ? 255 : 128))).toBe(true);
    expect(lighting.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
  });

  it('stays bounded during sustained input and can fade refraction without stopping the surface', () => {
    const water = new WaterSurface();
    let peak = 0;
    for (let i = 0; i < 900; i++) {
      if (i % 22 === 0) water.drop(1);
      water.step();
      peak = Math.max(peak, water.energy);
    }
    expect(peak).toBeLessThan(2);
    expect(water.energy).toBeGreaterThan(.001);
    const pixels = new Uint8ClampedArray(water.size * water.size * 4);
    const lighting = new Uint8ClampedArray(pixels.length);
    water.render(pixels, lighting, 0);
    expect(pixels.every((value, i) => value === (i % 4 === 3 ? 255 : 128))).toBe(true);
    expect(lighting.every((value, i) => i % 4 !== 3 || value === 0)).toBe(true);
  });
});
