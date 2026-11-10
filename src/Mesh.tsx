import { memo, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { contexts, graphCapacity, spherePosition } from './model';
import type { Profile } from './model';

interface Props {
  activeSlots: number[];
  selectedId: string;
  profile: Profile;
  motion: boolean;
  paused: boolean;
}

function Mesh(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const settings = useRef(props);
  const redraw = useRef<() => void>(() => {});
  const [error, setError] = useState('');

  useEffect(() => {
    settings.current = props;
    redraw.current();
  }, [props]);

  useEffect(() => {
    const host = container.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(`3D rendering unavailable: ${message}. The context list and demo controls still work.`);
      return;
    }

    renderer.setClearColor(0x000000, 0);
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0.3, 8.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.minDistance = 6.4;
    controls.maxDistance = 12;
    controls.rotateSpeed = 0.6;
    controls.enableZoom = true;

    const world = new THREE.Group();
    world.rotation.set(0.12, -0.5, 0.12);
    scene.add(world);
    const positions = Array.from({ length: graphCapacity }, (_, slot) => new THREE.Vector3(...spherePosition(slot)));
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    function keepGeometry<T extends THREE.BufferGeometry>(geometry: T): T { geometries.push(geometry); return geometry; }
    function keepMaterial<T extends THREE.Material>(material: T): T { materials.push(material); return material; }

    const geometry = keepGeometry(new THREE.SphereGeometry(0.023, 6, 4));
    const material = keepMaterial(new THREE.MeshBasicMaterial({ color: '#78a4ad', transparent: true, opacity: 0.62 }));
    const dots = new THREE.InstancedMesh(geometry, material, graphCapacity);
    const matrix = new THREE.Matrix4();
    positions.forEach((point, index) => {
      matrix.makeTranslation(point.x, point.y, point.z);
      dots.setMatrixAt(index, matrix);
    });
    dots.instanceMatrix.needsUpdate = true;
    world.add(dots);

    const edgePoints: THREE.Vector3[] = [];
    const used = new Set<string>();
    for (let index = 0; index < positions.length; index++) {
      const neighbors = positions.map((point, slot) => ({ slot, distance: point.distanceToSquared(positions[index]) }))
        .filter((point) => point.slot !== index).sort((a, b) => a.distance - b.distance).slice(0, 3);
      for (const neighbor of neighbors) {
        const key = [index, neighbor.slot].sort((a, b) => a - b).join(':');
        if (!used.has(key)) {
          used.add(key);
          edgePoints.push(positions[index], positions[neighbor.slot]);
        }
      }
    }
    const lineGeometry = keepGeometry(new THREE.BufferGeometry().setFromPoints(edgePoints));
    world.add(new THREE.LineSegments(lineGeometry, keepMaterial(new THREE.LineBasicMaterial({
      color: '#6f9caa', transparent: true, opacity: 0.17,
    }))));

    const origin = new THREE.Vector3();
    const spokePoints = contexts.flatMap((context) => [
      origin, positions[context.slot],
      positions[context.slot], positions[context.slot + 1],
      positions[context.slot + 1], positions[context.slot + 2],
    ]);
    world.add(new THREE.LineSegments(
      keepGeometry(new THREE.BufferGeometry().setFromPoints(spokePoints)),
      keepMaterial(new THREE.LineBasicMaterial({ color: '#78b3be', transparent: true, opacity: 0.15 })),
    ));

    const markers = contexts.map((context) => {
      const marker = new THREE.Mesh(
        keepGeometry(new THREE.SphereGeometry(0.066, 12, 8)),
        keepMaterial(new THREE.MeshBasicMaterial({ color: context.color })),
      );
      marker.position.copy(positions[context.slot]);
      world.add(marker);
      return marker;
    });
    const coreMaterial = keepMaterial(new THREE.MeshBasicMaterial({ color: '#91ffe4', transparent: true, opacity: 0.85 }));
    const core = new THREE.Mesh(keepGeometry(new THREE.SphereGeometry(0.105, 18, 12)), coreMaterial);
    world.add(core);
    const haloMaterial = keepMaterial(new THREE.MeshBasicMaterial({ color: '#6fe9d2', transparent: true, opacity: 0.035, depthWrite: false }));
    const halo = new THREE.Mesh(keepGeometry(new THREE.SphereGeometry(0.28, 20, 12)), haloMaterial);
    world.add(halo);
    const activeMaterial = keepMaterial(new THREE.LineBasicMaterial({ color: '#93ffe6', transparent: true, opacity: 0.95 }));
    const activeGeometry = keepGeometry(new THREE.BufferGeometry());
    const activeLine = new THREE.Line(activeGeometry, activeMaterial);
    world.add(activeLine);
    const tracer = new THREE.Mesh(
      keepGeometry(new THREE.SphereGeometry(0.047, 8, 6)),
      keepMaterial(new THREE.MeshBasicMaterial({ color: '#e1fff6' })),
    );
    world.add(tracer);

    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = 0;
    let previousPath = '';
    let currentRatio = 0;
    let lost = false;
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

    function requestRender() {
      if (!frame && !document.hidden && !settings.current.paused && !lost) frame = requestAnimationFrame(render);
    }
    function render(now: number) {
      frame = 0;
      if (settings.current.paused || document.hidden || lost) return;
      const { activeSlots, selectedId, profile, motion } = settings.current;
      const budget = profile === 'Speed / performance' ? { ratio: 1, fps: 24 } : { ratio: 1.5, fps: 30 };
      const ratio = Math.min(devicePixelRatio, budget.ratio);
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      if (currentRatio !== ratio || renderer.domElement.clientWidth !== width || renderer.domElement.clientHeight !== height) {
        currentRatio = ratio;
        renderer.setPixelRatio(ratio);
        renderer.setSize(width, height);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      markers.forEach((marker, index) => marker.scale.setScalar(contexts[index].id === selectedId ? 1.65 : 1));
      const pathKey = activeSlots.join(':');
      if (pathKey !== previousPath) {
        previousPath = pathKey;
        activeGeometry.setFromPoints([origin, ...activeSlots.map((slot) => positions[slot])]);
        activeGeometry.computeBoundingSphere();
      }
      activeLine.visible = activeSlots.length > 0;
      tracer.visible = activeSlots.length > 0;
      const animate = !reducedMotion.matches && (motion || activeSlots.length > 0);
      if (animate && motion) world.rotation.y += Math.min((now - last) / 1000, 0.05) * 0.045;
      if (activeSlots.length) {
        const points = [origin, ...activeSlots.map((slot) => positions[slot])];
        const progress = ((now / 1800) % 1) * (points.length - 1);
        const segment = Math.floor(progress);
        tracer.position.lerpVectors(points[segment], points[Math.min(segment + 1, points.length - 1)], progress - segment);
      }
      last = now;
      renderer.render(scene, camera);
      if (animate) {
        clearTimeout(timer);
        timer = setTimeout(requestRender, 1000 / budget.fps);
      }
    }
    function onVisibility() {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = 0;
      if (!document.hidden) requestRender();
    }
    function onLost(event: Event) {
      event.preventDefault();
      lost = true;
      onVisibility();
      setError('The 3D graphics context was lost. Relaunch the prototype to restore it; demo controls remain available.');
    }
    redraw.current = requestRender;
    const resize = new ResizeObserver(requestRender);
    resize.observe(host);
    controls.addEventListener('change', requestRender);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', requestRender);
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    requestRender();
    return () => {
      redraw.current = () => {};
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      controls.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div className="mesh-viewport" ref={container} role="img" aria-label="Synthetic spherical context graph. Drag to orbit; scroll to zoom. Bright paths are demo events, not live reads.">
    {error && <p className="mesh-error" role="alert">{error}</p>}
  </div>;
}

export default memo(Mesh);
