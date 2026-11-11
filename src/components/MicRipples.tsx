import { useEffect, useId, useRef, type RefObject } from 'react';
import { WaterSurface } from '../domain/water-surface';

export function MicRipples({ active, level, paused, target }: {
  active: boolean; level: number; paused: boolean; target: RefObject<HTMLSpanElement | null>;
}) {
  const id = useId();
  const surface = useRef<SVGSVGElement>(null);
  const image = useRef<SVGFEImageElement>(null);
  const lighting = useRef<HTMLCanvasElement>(null);
  const input = useRef(level);
  const start = useRef<(() => void) | null>(null);

  useEffect(() => {
    input.current = level;
    start.current?.();
  }, [level]);

  useEffect(() => {
    const shell = target.current;
    const element = surface.current;
    const map = image.current;
    const light = lighting.current;
    if (!active || paused || !shell || !element || !map || !light) return;
    const canvas = document.createElement('canvas');
    const water = new WaterSurface();
    canvas.width = canvas.height = water.size;
    const context = canvas.getContext('2d');
    light.width = light.height = water.size;
    const lightContext = light.getContext('2d');
    if (!context || !lightContext) {
      console.error('Microphone water refraction is unavailable; recording controls remain usable.');
      return;
    }
    const pixels = context.createImageData(water.size, water.size);
    const shades = lightContext.createImageData(water.size, water.size);
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = 0;
    let debt = 0;
    let lastDrop = -Infinity;
    let lastSound = 0;
    let paints = 0;
    function clear() {
      cancelAnimationFrame(frame);
      frame = last = debt = 0;
      lastDrop = -Infinity;
      water.clear();
      shell?.style.removeProperty('--water-refraction');
      map?.removeAttribute('href');
      lightContext?.clearRect(0, 0, water.size, water.size);
      if (element) {
        element.dataset.active = 'false';
        element.dataset.energy = '0';
      }
    }
    function animate(now: number) {
      frame = 0;
      if (!context || !lightContext || !shell || !element || !map) return;
      if (!last || now - last >= 1000 / 30) {
        debt += last ? Math.min(now - last, 100) : 1000 / 30;
        last = now;
        if (input.current >= .025) {
          lastSound = now;
          if (now - lastDrop >= 240) {
            water.drop(Math.min(1, input.current));
            element.dataset.strength = String(Math.min(1, input.current));
            lastDrop = now;
          }
        }
        if (now - lastSound >= 1600) { clear(); return; }
        while (debt >= 1000 / 90) {
          water.step();
          debt -= 1000 / 90;
        }
        const fade = Math.min(1, Math.max(0, (1600 - (now - lastSound)) / 1000));
        water.render(pixels.data, shades.data, fade);
        context.putImageData(pixels, 0, 0);
        lightContext.putImageData(shades, 0, 0);
        map.setAttribute('href', canvas.toDataURL());
        shell.style.setProperty('--water-refraction', `url("#${id}")`);
        element.dataset.active = 'true';
        element.dataset.energy = String(water.energy * fade);
        element.dataset.frames = String(++paints);
      }
      frame = requestAnimationFrame(animate);
    }
    function kick() {
      if (!frame && input.current >= .025 && !reduced.matches && !document.hidden) {
        lastSound = performance.now();
        frame = requestAnimationFrame(animate);
      }
    }
    function schedule() {
      clear();
      kick();
    }
    start.current = kick;
    reduced.addEventListener('change', schedule);
    schedule();
    return () => {
      start.current = null;
      clear();
      reduced.removeEventListener('change', schedule);
    };
  }, [active, paused, id, target]);

  return <><svg className="mic-ripples" ref={surface} aria-hidden="true" focusable="false" data-active="false" data-energy="0">
    <defs>
      <filter id={id} x="-20%" y="-20%" width="140%" height="140%" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
        <feImage ref={image} x="0" y="0" width="1" height="1" preserveAspectRatio="none" result="water" />
        <feDisplacementMap in="SourceGraphic" in2="water" scale=".065" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </defs>
  </svg><canvas className="mic-water-light" ref={lighting} aria-hidden="true" /></>;
}
