export class WaterSurface {
  readonly size = 64;
  readonly height = new Float32Array(this.size * this.size);
  private readonly velocity = new Float32Array(this.height.length);
  private readonly damping = new Float32Array(this.height.length);
  energy = 0;

  constructor() {
    const centre = (this.size - 1) / 2;
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) {
      const radius = Math.hypot(x - centre, y - centre) / centre;
      this.damping[y * this.size + x] = radius >= 1 ? 0
        : .995 - Math.max(0, (radius - .75) / .25) ** 2 * .3;
    }
  }

  drop(strength: number) {
    const centre = (this.size - 1) / 2;
    for (let y = 26; y <= 37; y++) for (let x = 26; x <= 37; x++) {
      const distance = Math.hypot(x - centre, y - centre) / 6;
      if (distance < 1) this.height[y * this.size + x] += (1 + Math.cos(distance * Math.PI)) * .25 * strength;
    }
  }

  step() {
    const { size, height, velocity, damping } = this;
    for (let y = 1; y < size - 1; y++) for (let x = 1; x < size - 1; x++) {
      const i = y * size + x;
      const laplacian = height[i - 1] + height[i + 1] + height[i - size] + height[i + size] - height[i] * 4;
      velocity[i] = (velocity[i] + laplacian * .22) * damping[i];
    }
    this.energy = 0;
    for (let i = 0; i < height.length; i++) {
      height[i] = (height[i] + velocity[i]) * damping[i];
      this.energy = Math.max(this.energy, Math.abs(height[i]));
    }
  }

  render(pixels: Uint8ClampedArray, lighting: Uint8ClampedArray, fade: number) {
    const { height, size } = this;
    const lightZ = Math.sqrt(.59);
    // Encode surface slopes as sampling offsets, not painted wave outlines.
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const dx = x > 0 && x < size - 1 ? (height[i - 1] - height[i + 1]) * 4 * fade : 0;
      const dy = y > 0 && y < size - 1 ? (height[i - size] - height[i + size]) * 4 * fade : 0;
      pixels[i * 4] = 128 + Math.max(-127, Math.min(127, dx * 255));
      pixels[i * 4 + 1] = 128 + Math.max(-127, Math.min(127, dy * 255));
      pixels[i * 4 + 2] = 128;
      pixels[i * 4 + 3] = 255;
      const shade = (.4 * dx - .5 * dy + lightZ) / Math.hypot(dx, dy, 1) - lightZ;
      lighting[i * 4] = shade > 0 ? 199 : 5;
      lighting[i * 4 + 1] = shade > 0 ? 238 : 8;
      lighting[i * 4 + 2] = shade > 0 ? 255 : 24;
      lighting[i * 4 + 3] = Math.min(.35, Math.abs(shade) * 1.8) * 255;
    }
  }

  clear() {
    this.height.fill(0);
    this.velocity.fill(0);
    this.energy = 0;
  }
}
