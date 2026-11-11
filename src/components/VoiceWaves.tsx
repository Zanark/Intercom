import { useEffect, useRef } from 'react';

export function VoiceWaves({ active, level, paused }: { active: boolean; level: number; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const input = useRef(0);
  const redraw = useRef<(() => void) | null>(null);

  useEffect(() => {
    input.current = Math.min(1, Math.max(0, level / 0.15));
    redraw.current?.();
  }, [level]);

  useEffect(() => {
    const surface = canvas.current;
    if (!active || !surface) return;
    const context = surface.getContext('2d');
    if (!context) {
      console.error('Microphone wave visualization is unavailable; recording controls remain usable.');
      return;
    }
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let time = 0;
    let width = 0;
    let height = 0;
    let energy = input.current;

    function draw() {
      if (!context || !surface || !width || !height) return;
      context.clearRect(0, 0, width, height);
      const half = width / 2;
      const amplitude = height * 0.34 * energy;
      context.save();
      context.translate(half, height / 2);
      for (const direction of [-1, 1]) {
        context.save();
        context.scale(direction, 1);
        const gradient = context.createLinearGradient(0, 0, half, 0);
        gradient.addColorStop(0, '#b7fff0');
        gradient.addColorStop(0.25, '#70ecd9');
        gradient.addColorStop(0.65, '#49b8ee');
        gradient.addColorStop(1, '#49b8ee00');
        context.strokeStyle = gradient;
        for (let band = 0; band < 18; band++) {
          context.beginPath();
          for (let step = 0; step <= 80; step++) {
            const distance = step / 80;
            const envelope = Math.sin(Math.PI * distance);
            const wave = Math.sin(distance * 13 - time * 3 + band * 0.13)
              + 0.3 * Math.sin(distance * 24 - time * 4 + band * 0.08);
            const y = envelope * (wave * amplitude * 0.68 + (band - 8.5) * energy * 0.8);
            if (step === 0) context.moveTo(0, y);
            else context.lineTo(distance * half, y);
          }
          context.globalAlpha = band === 8 ? 0.8 : 0.08 + energy * 0.14;
          context.lineWidth = band === 8 ? 1.6 : 0.65;
          context.stroke();
        }
        context.restore();
      }
      context.restore();
    }

    function animate(now: number) {
      frame = requestAnimationFrame(animate);
      if (now - last < 1000 / 30) return;
      const elapsed = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;
      time += elapsed;
      energy += (input.current - energy) * 0.3;
      draw();
    }

    function schedule() {
      cancelAnimationFrame(frame);
      frame = 0;
      last = 0;
      if (paused || document.hidden) return;
      energy = input.current;
      draw();
      if (!reduced.matches) frame = requestAnimationFrame(animate);
    }

    function resize() {
      if (!surface || !context) return;
      const bounds = surface.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      const scale = Math.min(devicePixelRatio || 1, 1.5);
      surface.width = Math.round(width * scale);
      surface.height = Math.round(height * scale);
      context.setTransform(scale, 0, 0, scale, 0, 0);
      schedule();
    }

    redraw.current = () => {
      if (reduced.matches && !paused && !document.hidden) {
        energy = input.current;
        draw();
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(surface);
    document.addEventListener('visibilitychange', schedule);
    reduced.addEventListener('change', schedule);
    resize();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener('visibilitychange', schedule);
      reduced.removeEventListener('change', schedule);
      redraw.current = null;
    };
  }, [active, paused]);

  return active ? <canvas ref={canvas} className="voice-waves" aria-hidden="true" /> : null;
}
