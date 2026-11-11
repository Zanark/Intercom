import { useEffect, useRef } from 'react';
import { glassMotion, GLASS_MOTION_MS } from '../domain/glass-motion';

export function GlassBubble({ paused }: { paused: boolean }) {
  const surface = useRef<HTMLSpanElement>(null);
  const frames = useRef<Keyframe[] | null>(null);
  const elapsed = useRef(0);

  useEffect(() => {
    const element = surface.current;
    if (!element) return;
    if (!frames.current) {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0];
      frames.current = glassMotion(seed);
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let animation: Animation | null = null;
    function schedule() {
      if (animation) {
        elapsed.current = Number(animation.currentTime ?? elapsed.current);
        animation.cancel();
        animation = null;
      }
      if (reduced.matches || !element || !frames.current) return;
      animation = element.animate(frames.current, {
        duration: GLASS_MOTION_MS, iterations: Infinity, easing: 'linear',
      });
      animation.currentTime = elapsed.current;
      if (paused) animation.pause();
    }
    reduced.addEventListener('change', schedule);
    schedule();
    return () => {
      reduced.removeEventListener('change', schedule);
      if (animation) {
        elapsed.current = Number(animation.currentTime ?? elapsed.current);
        animation.cancel();
      }
    };
  }, [paused]);

  return <span className="mic-film" ref={surface}>
    <span className="mic-reflection mic-reflection-pearl" />
    <span className="mic-reflection mic-reflection-violet" />
    <span className="mic-reflection mic-reflection-mint" />
    <span className="mic-reflection mic-reflection-ice" />
    <span className="mic-reflection mic-reflection-back" />
    <span className="mic-reflection mic-reflection-bottom" />
  </span>;
}
