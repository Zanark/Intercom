export const GLASS_MOTION_MS = 32000;

export function glassMotion(seed: number): Keyframe[] {
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const axes = [0, 1, 2].map(() => ({
    phase: random() * Math.PI * 2,
    secondary: random() * Math.PI * 2,
    amplitude: 38 + random() * 24,
  }));
  const angle = (axis: number, time: number) => {
    const { phase, secondary, amplitude } = axes[axis];
    return amplitude * (Math.sin(time + phase) - Math.sin(phase))
      + 18 * (Math.sin(time * (axis + 2) + secondary) - Math.sin(secondary));
  };
  // Dense samples of periodic smooth fields avoid random-target snaps and a loop seam.
  return Array.from({ length: 641 }, (_, index) => {
    const time = index / 640 * Math.PI * 2;
    return {
      offset: index / 640,
      transform: `rotateX(${angle(0, time)}deg) rotateY(${angle(1, time)}deg) rotateZ(${angle(2, time)}deg)`,
    };
  });
}
