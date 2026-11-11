import { memo, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { graphCapacity, spherePosition } from '../domain/model';
import type { MeshSnapshot, Profile } from '../domain/model';

interface Props {
  graph: MeshSnapshot;
  activeSlots: number[];
  selectedId: string;
  profile: Profile;
  motion: boolean;
  paused: boolean;
  navigationHost: HTMLDivElement | null;
}

function Mesh(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const settings = useRef(props);
  const redraw = useRef<() => void>(() => {});
  const navigate = useRef<(action: 'in' | 'out' | 'reset') => void>(() => {});
  const label = useRef<HTMLDivElement>(null);
  const dismiss = useRef<() => void>(() => {});
  const labelId = useId();
  const helpId = useId();
  const [inspection, setInspection] = useState<{ index: number; pinned: boolean } | null>(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(100);
  const inspectedContext = inspection && (props.graph.contexts[inspection.index] ?? {
    name: 'Intercom', subtitle: 'Voice assistant hub', color: '#91ffe4', basePath: undefined,
  });

  useEffect(() => {
    settings.current = props;
    redraw.current();
  }, [props]);

  useEffect(() => { redraw.current(); }, [inspection]);

  useEffect(() => {
    const host = container.current!;
    const { contexts, edges, demo } = settings.current.graph;
    const capacity = demo ? graphCapacity : Math.max(1, contexts.length);
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
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(0, 0.3, 8.6);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = true;
    controls.enableDamping = false;
    controls.minDistance = 0.15;
    controls.maxDistance = 12;
    controls.rotateSpeed = 0.6;
    controls.enableZoom = true;
    controls.zoomToCursor = true;
    controls.saveState();
    const initialDistance = controls.getDistance();

    const world = new THREE.Group();
    world.rotation.set(0.12, -0.5, 0.12);
    scene.add(world);
    const positions = Array.from({ length: capacity }, (_, slot) => new THREE.Vector3(...spherePosition(slot, capacity)));
    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    function keepGeometry<T extends THREE.BufferGeometry>(geometry: T): T { geometries.push(geometry); return geometry; }
    function keepMaterial<T extends THREE.Material>(material: T): T { materials.push(material); return material; }

    const geometry = keepGeometry(new THREE.SphereGeometry(0.023, 6, 4));
    const material = keepMaterial(new THREE.MeshBasicMaterial({ color: '#78a4ad', transparent: true, opacity: 0.62 }));
    const dots = new THREE.InstancedMesh(geometry, material, capacity);
    const matrix = new THREE.Matrix4();
    positions.forEach((point, index) => {
      matrix.makeTranslation(point.x, point.y, point.z);
      dots.setMatrixAt(index, matrix);
    });
    dots.instanceMatrix.needsUpdate = true;
    if (demo) world.add(dots);

    const edgePoints: THREE.Vector3[] = [];
    const used = new Set<string>();
    for (let index = 0; demo && index < positions.length; index++) {
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
    const byId = new Map(contexts.map((context) => [context.id, positions[context.slot]]));
    if (!demo) for (const edge of edges) {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (source && target) edgePoints.push(source, target);
    }
    const lineGeometry = keepGeometry(new THREE.BufferGeometry().setFromPoints(edgePoints));
    world.add(new THREE.LineSegments(lineGeometry, keepMaterial(new THREE.LineBasicMaterial({
      color: '#6f9caa', transparent: true, opacity: 0.17,
    }))));

    const origin = new THREE.Vector3();
    const spokePoints = demo ? contexts.flatMap((context) => [
      origin, positions[context.slot],
      positions[context.slot], positions[context.slot + 1],
      positions[context.slot + 1], positions[context.slot + 2],
    ]) : [];
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
    const targets = [...markers, core];
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const projected = new THREE.Vector3();
    let cursor: { x: number; y: number } | null = null;
    let gesture: { id: number; x: number; y: number; dragged: boolean } | null = null;
    let inspected: number | null = null;
    let pinned = false;
    let keyboard = false;
    let pointerFocus = false;

    const canvas = renderer.domElement;
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', demo
      ? 'Synthetic spherical context graph. Drag to orbit; scroll to zoom; right-drag to pan. Bright paths are demo events, not live reads.'
      : `Actual local Context Mesh: ${contexts.length} contexts and ${edges.length} evidence-backed relationships. Drag to orbit; scroll to zoom; right-drag to pan. Bright spokes show observed job activity or tool-reported locations, not topology traversal.`);
    canvas.setAttribute('aria-describedby', helpId);

    function showInspection(index: number | null, pin = false) {
      if (inspected === index && pinned === pin) return;
      inspected = index;
      pinned = pin;
      canvas.setAttribute('aria-describedby', index === null ? helpId : `${helpId} ${labelId}`);
      setInspection(index === null ? null : { index, pinned: pin });
      requestRender();
    }
    function pick(x: number, y: number) {
      if (lost) return null;
      const bounds = canvas.getBoundingClientRect();
      if (!bounds.width || !bounds.height || x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return null;
      pointer.set((x - bounds.left) / bounds.width * 2 - 1, -(y - bounds.top) / bounds.height * 2 + 1);
      world.updateMatrixWorld(true);
      camera.updateMatrixWorld();
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(targets, false)[0];
      return hit ? targets.findIndex((target) => target === hit.object) : null;
    }
    function positionLabel() {
      if (inspected === null || !label.current) return;
      targets[inspected].getWorldPosition(projected).project(camera);
      const popup = label.current;
      const visible = Math.abs(projected.x) <= 1 && Math.abs(projected.y) <= 1 && projected.z >= -1 && projected.z <= 1;
      popup.style.visibility = visible ? 'visible' : 'hidden';
      const x = (projected.x + 1) * host.clientWidth / 2 + 12;
      const y = (1 - projected.y) * host.clientHeight / 2 - popup.offsetHeight - 12;
      popup.style.left = `${Math.max(8, Math.min(x, host.clientWidth - popup.offsetWidth - 8))}px`;
      popup.style.top = `${Math.max(8, Math.min(y, host.clientHeight - popup.offsetHeight - 8))}px`;
    }
    function clearInspection() {
      cursor = null;
      gesture = null;
      keyboard = false;
      showInspection(null);
    }
    dismiss.current = () => {
      clearInspection();
      pointerFocus = true;
      canvas.focus({ preventScroll: true });
      pointerFocus = false;
    };
    function onPointerDown(event: PointerEvent) {
      if (gesture) { gesture.dragged = true; return; }
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
      keyboard = false;
      pointerFocus = true;
      canvas.focus({ preventScroll: true });
      pointerFocus = false;
    }
    function onPointerMove(event: PointerEvent) {
      cursor = { x: event.clientX, y: event.clientY };
      keyboard = false;
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.dragged = true;
      if (gesture && !pinned) showInspection(null);
      requestRender();
    }
    function onPointerUp(event: PointerEvent) {
      if (gesture?.id !== event.pointerId) return;
      const click = gesture?.id === event.pointerId && !gesture.dragged && event.button === 0;
      gesture = null;
      if (click) {
        const index = pick(event.clientX, event.clientY);
        if (pinned && inspected === index) clearInspection();
        else showInspection(index, index !== null);
      }
    }
    function onPointerLeave() {
      cursor = null;
      if (!pinned && !keyboard) showInspection(null);
      canvas.style.cursor = '';
    }
    function onPointerCancel() { gesture = null; onPointerLeave(); }
    function onFocus() {
      if (lost || pointerFocus || pinned) return;
      keyboard = true;
      const index = contexts.findIndex((context) => context.id === settings.current.selectedId);
      showInspection(index < 0 ? 0 : index);
    }
    function onBlur() { keyboard = false; if (!pinned) showInspection(null); }
    function onKey(event: KeyboardEvent) {
      if (lost) return;
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        cursor = null;
        keyboard = true;
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1
          : ((inspected ?? 0) + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1) + targets.length) % targets.length;
        showInspection(index);
      } else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        cursor = null;
        keyboard = true;
        if (pinned) clearInspection();
        else showInspection(inspected ?? 0, true);
      }
    }
    function onEscape(event: KeyboardEvent) {
      if (event.key === 'Escape' && inspected !== null) {
        event.preventDefault();
        clearInspection();
      }
    }
    const haloMaterial = keepMaterial(new THREE.MeshBasicMaterial({ color: '#6fe9d2', transparent: true, opacity: 0.035, depthWrite: false }));
    const halo = new THREE.Mesh(keepGeometry(new THREE.SphereGeometry(0.28, 20, 12)), haloMaterial);
    world.add(halo);
    const activeMaterial = keepMaterial(new THREE.LineBasicMaterial({ color: '#93ffe6', transparent: true, opacity: 0.95 }));
    const activeGeometry = keepGeometry(new THREE.BufferGeometry());
    const activeLine = new THREE.LineSegments(activeGeometry, activeMaterial);
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
      markers.forEach((marker, index) => marker.scale.setScalar(Math.max(contexts[index].id === selectedId ? 1.65 : 1, inspected === index ? 1.35 : 1)));
      core.scale.setScalar(inspected === contexts.length ? 1.2 : 1);
      const pathKey = activeSlots.join(':');
      if (pathKey !== previousPath) {
        previousPath = pathKey;
        const points = [origin, ...activeSlots.map((slot) => positions[slot])];
        activeGeometry.setFromPoints(demo ? points.slice(1).flatMap((point, index) => [points[index], point]) : activeSlots.flatMap((slot) => [origin, positions[slot]]));
        activeGeometry.computeBoundingSphere();
      }
      activeLine.visible = activeSlots.length > 0;
      tracer.visible = demo && activeSlots.length > 0;
      const animate = !reducedMotion.matches && (motion || (demo && activeSlots.length > 0));
      if (animate && motion) world.rotation.y += Math.min((now - last) / 1000, 0.05) * 0.045;
      if (demo && activeSlots.length) {
        const points = [origin, ...activeSlots.map((slot) => positions[slot])];
        const progress = ((now / 1800) % 1) * (points.length - 1);
        const segment = Math.floor(progress);
        tracer.position.lerpVectors(points[segment], points[Math.min(segment + 1, points.length - 1)], progress - segment);
      }
      last = now;
      renderer.render(scene, camera);
      if (cursor && !gesture && !pinned && !keyboard) {
        const index = pick(cursor.x, cursor.y);
        canvas.style.cursor = index === null ? '' : 'pointer';
        showInspection(index);
      }
      positionLabel();
      if (animate) {
        clearTimeout(timer);
        timer = setTimeout(requestRender, 1000 / budget.fps);
      }
    }
    function onVisibility() {
      cursor = null;
      gesture = null;
      if (!pinned) showInspection(null);
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      frame = 0;
      if (!document.hidden) requestRender();
    }
    function onLost(event: Event) {
      event.preventDefault();
      lost = true;
      clearInspection();
      onVisibility();
      setError('The 3D graphics context was lost. Relaunch the prototype to restore it; demo controls remain available.');
    }
    function onControlsChange() {
      setZoom(Math.round(initialDistance / controls.getDistance() * 100));
      requestRender();
    }
    navigate.current = (action) => {
      if (lost) return;
      if (action === 'reset') {
        world.rotation.set(0.12, -0.5, 0.12);
        controls.reset();
      } else {
        const offset = camera.position.clone().sub(controls.target);
        const distance = THREE.MathUtils.clamp(offset.length() * (action === 'in' ? 0.8 : 1.25), controls.minDistance, controls.maxDistance);
        camera.position.copy(controls.target).add(offset.setLength(distance));
        controls.update();
      }
      requestRender();
    };
    redraw.current = requestRender;
    const resize = new ResizeObserver(requestRender);
    resize.observe(host);
    controls.addEventListener('change', onControlsChange);
    document.addEventListener('visibilitychange', onVisibility);
    reducedMotion.addEventListener('change', requestRender);
    renderer.domElement.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointercancel', onPointerCancel);
    canvas.addEventListener('focus', onFocus);
    canvas.addEventListener('blur', onBlur);
    canvas.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onEscape);
    requestRender();
    return () => {
      redraw.current = () => {};
      navigate.current = () => {};
      dismiss.current = () => {};
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      resize.disconnect();
      controls.dispose();
      document.removeEventListener('visibilitychange', onVisibility);
      reducedMotion.removeEventListener('change', requestRender);
      renderer.domElement.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('focus', onFocus);
      canvas.removeEventListener('blur', onBlur);
      canvas.removeEventListener('keydown', onKey);
      document.removeEventListener('keydown', onEscape);
      geometries.forEach((item) => item.dispose());
      materials.forEach((item) => item.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [helpId, labelId]);

  const navigation = <div className="mesh-navigation" role="group" aria-label="Graph view controls">
    <button className="quiet-button" aria-label="Zoom in graph" title="Zoom in" disabled={!!error} onClick={() => navigate.current('in')}>+</button>
    <output aria-label="Graph zoom">{zoom}%</output>
    <button className="quiet-button" aria-label="Zoom out graph" title="Zoom out" disabled={!!error} onClick={() => navigate.current('out')}>-</button>
    <button className="quiet-button" aria-label="Reset view" title="Reset view" disabled={!!error} onClick={() => navigate.current('reset')}>{props.navigationHost ? <span aria-hidden="true">&#8634;</span> : 'Reset view'}</button>
  </div>;
  return <><div className="mesh-viewport" ref={container}>
    <span className="sr-only" id={helpId}>Hover a colored node for its name; click to pin its label. Focus the graph and use arrow keys to inspect nodes, Enter to pin, Escape to dismiss. Inspection does not change your work target.</span>
    {inspection && inspectedContext && <div ref={label} id={labelId} className={`mesh-node-label${inspection.pinned ? ' pinned' : ''}`} role={inspection.pinned ? 'region' : 'tooltip'} aria-label={inspection.pinned ? 'Pinned node details' : undefined} style={{ visibility: 'hidden', borderColor: inspectedContext.color }}>
      <strong><i style={{ background: inspectedContext.color }} />{inspectedContext.name}</strong>
      <span>{inspectedContext.subtitle}</span>
      {inspection.pinned ? <>{inspectedContext.basePath && <small>{inspectedContext.basePath}</small>}<button aria-label="Close node label" title="Close node label (Escape)" onClick={() => dismiss.current()}>×</button></> : <small>Click to pin</small>}
    </div>}
    {error && <p className="mesh-error" role="alert">{error}</p>}
  </div>{props.navigationHost ? createPortal(navigation, props.navigationHost) : navigation}</>;
}

export default memo(Mesh);
