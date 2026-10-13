import { useEffect, useRef } from "react";
import * as THREE from "three";
import { reducedMotion } from "../lib/useGsap";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const COLORS: Record<OrbState, number> = {
  idle: 0x8b8b94,
  listening: 0xd4a24c,
  thinking: 0xf4efe6,
  speaking: 0xd4a24c,
};

/** A small point-cloud sphere that breathes with the call state. Fully disposed on unmount. */
export default function Orb({ state = "idle", size = 220 }: { state?: OrbState; size?: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    } catch {
      return; // no WebGL: the orb just doesn't render
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(size, size);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10);
    camera.position.z = 3.2;

    const geo = new THREE.IcosahedronGeometry(1, 5);
    const base = Float32Array.from(geo.attributes.position.array);
    const mat = new THREE.PointsMaterial({ size: 0.022, color: COLORS.idle, transparent: true, opacity: 0.9 });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const still = reducedMotion();
    const color = new THREE.Color();
    let frame = 0;
    let raf = 0;
    const pos = geo.attributes.position as THREE.BufferAttribute;

    const tick = () => {
      frame += 1;
      const s = stateRef.current;
      const amp = s === "speaking" ? 0.09 : s === "listening" ? 0.05 : s === "thinking" ? 0.03 : 0.015;
      const speed = s === "thinking" ? 0.08 : 0.04;
      for (let i = 0; i < pos.count; i++) {
        const x = base[i * 3], y = base[i * 3 + 1], z = base[i * 3 + 2];
        const k = 1 + amp * Math.sin(frame * speed + x * 4 + y * 3);
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      pos.needsUpdate = true;
      points.rotation.y += s === "thinking" ? 0.012 : 0.003;
      color.setHex(COLORS[s]);
      mat.color.lerp(color, 0.08);
      renderer.render(scene, camera);
      if (!still && !document.hidden) raf = requestAnimationFrame(tick);
    };
    const onVis = () => { if (!document.hidden && !still) { cancelAnimationFrame(raf); raf = requestAnimationFrame(tick); } };
    document.addEventListener("visibilitychange", onVis);
    tick();

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [size]);

  return <div ref={mount} aria-hidden style={{ width: size, height: size }} className="mx-auto" />;
}
