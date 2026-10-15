import { useEffect, useRef } from "react";
import { reducedMotion } from "../lib/theme";

// WebGL visuals drawn entirely on the GPU by one fragment shader (no 3D library, ~2 KB).
// variant 0 = "ticker ribbons" backdrop, variant 1 = sound-reactive voice orb.

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `precision mediump float;
uniform vec2 u_res; uniform float u_time; uniform float u_level; uniform float u_variant;
uniform vec3 u_bg; uniform vec3 u_brass; uniform vec3 u_you; uniform vec3 u_buyer; uniform float u_mode;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }

vec3 accent(){
  // mode: 0 idle (brass), 1 you (teal), 2 buyer (coral), 3 thinking (brass, brighter)
  vec3 c = u_brass;
  c = mix(c, u_you, step(0.5, u_mode) * (1.0 - step(1.5, u_mode)));
  c = mix(c, u_buyer, step(1.5, u_mode) * (1.0 - step(2.5, u_mode)));
  return c;
}

void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  vec2 p = (gl_FragCoord.xy - 0.5*u_res) / min(u_res.x, u_res.y);
  float t = u_time;
  vec3 col = u_bg;
  vec3 acc = accent();

  if (u_variant < 0.5) {
    // Ticker ribbons: layered price-chart-like lines drifting across the screen.
    for (int i = 0; i < 5; i++){
      float fi = float(i);
      float y = 0.15 + fi*0.17 + 0.06*sin(uv.x*3.0 + t*0.25 + fi*1.7) + 0.08*(fbm(vec2(uv.x*2.5 + t*0.06 + fi*3.1, fi)) - 0.5);
      float d = abs(uv.y - y);
      float w = 0.0025 + 0.0015*fi;
      float line = smoothstep(w*6.0, 0.0, d) * 0.85 + smoothstep(0.10, 0.0, d) * 0.12;
      vec3 c = mod(fi, 3.0) < 1.0 ? u_brass : (mod(fi, 3.0) < 2.0 ? u_you : u_buyer);
      col = mix(col, c, clamp(line * (0.6 + 0.2*sin(t*0.5 + fi)), 0.0, 1.0));
    }
    col = mix(col, u_bg, smoothstep(0.35, 1.0, length(p)) * 0.6); // vignette
  } else {
    // Voice orb: a noisy blob whose edge swells with the live audio level.
    float a = atan(p.y, p.x);
    float lvl = u_level;
    float think = step(2.5, u_mode);
    float wob = fbm(vec2(a*2.0 + t*0.6, t*0.35)) * (0.06 + lvl*0.22) + think*0.03*sin(a*6.0 + t*4.0);
    float r = 0.30 + lvl*0.08 + wob;
    float d = length(p);
    float body = smoothstep(r, r - 0.02, d);
    float rim = smoothstep(0.035, 0.0, abs(d - r)) ;
    float glow = exp(-6.0*max(d - r, 0.0)) * (0.25 + lvl*0.9);
    float swirl = fbm(p*3.0 + vec2(t*0.2, -t*0.15));
    vec3 inner = mix(u_bg, acc, 0.18 + 0.25*swirl + lvl*0.35);
    col = mix(col, acc, glow*0.6);
    col = mix(col, inner, body);
    col = mix(col, acc, rim*(0.7 + lvl*0.3));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

function hex(v: string): [number, number, number] {
  const m = v.trim().replace("#", "");
  const n = parseInt(m.length === 3 ? m.split("").map((c) => c + c).join("") : m, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export type GLMode = "idle" | "you" | "buyer" | "thinking";
const MODE: Record<GLMode, number> = { idle: 0, you: 1, buyer: 2, thinking: 3 };

export default function GLCanvas({ variant, level = 0, mode = "idle", className = "", scale = 0.6, fps = 60 }: {
  variant: "ribbons" | "orb"; level?: number; mode?: GLMode; className?: string; scale?: number; fps?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef({ level, mode });
  live.current = { level, mode };

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power", preserveDrawingBuffer: false });
    if (!gl) { canvas.style.display = "none"; return; } // no WebGL: the page looks fine without it

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "shader");
      return s;
    };
    let prog: WebGLProgram;
    try {
      prog = gl.createProgram()!;
      gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    } catch {
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW); // one big triangle
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const U = (n: string) => gl.getUniformLocation(prog, n);
    const u = { res: U("u_res"), time: U("u_time"), level: U("u_level"), variant: U("u_variant"), mode: U("u_mode"), bg: U("u_bg"), brass: U("u_brass"), you: U("u_you"), buyer: U("u_buyer") };

    const setColors = () => {
      const css = getComputedStyle(document.documentElement);
      gl.uniform3fv(u.bg, hex(css.getPropertyValue("--bg")));
      gl.uniform3fv(u.brass, hex(css.getPropertyValue("--brass")));
      gl.uniform3fv(u.you, hex(css.getPropertyValue("--you")));
      gl.uniform3fv(u.buyer, hex(css.getPropertyValue("--buyer")));
    };
    setColors();
    gl.uniform1f(u.variant, variant === "orb" ? 1 : 0);

    const resize = () => {
      const s = Math.min(window.devicePixelRatio || 1, 2) * scale;
      const w = Math.max(1, Math.round(canvas.clientWidth * s)), h = Math.max(1, Math.round(canvas.clientHeight * s));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(u.res, w, h);
    };
    resize();

    const still = reducedMotion();
    const t0 = performance.now();
    let raf = 0, last = 0, smooth = 0, visible = true, running = true;
    const frameGap = 1000 / fps;
    const draw = (now: number) => {
      raf = 0;
      if (!running) return;
      if (now - last >= frameGap - 1) {
        last = now;
        smooth += (live.current.level - smooth) * 0.3;
        gl.uniform1f(u.time, still ? 4 : (now - t0) / 1000);
        gl.uniform1f(u.level, still ? 0 : Math.min(1, smooth));
        gl.uniform1f(u.mode, MODE[live.current.mode]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      }
      if (!still && visible && !document.hidden) raf = requestAnimationFrame(draw);
    };
    const kick = () => { if (!raf && running) raf = requestAnimationFrame(draw); };
    kick();
    const stillTimer = still ? setInterval(kick, 500) : null; // reduced motion: static image that still follows state/theme

    const ro = new ResizeObserver(() => { resize(); kick(); });
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); });
    io.observe(canvas);
    const onVis = () => kick();
    document.addEventListener("visibilitychange", onVis);
    const themeObs = new MutationObserver(() => { setColors(); kick(); });
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const onLost = (e: Event) => { e.preventDefault(); running = false; canvas.style.display = "none"; };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      if (stillTimer) clearInterval(stillTimer);
      ro.disconnect(); io.disconnect(); themeObs.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("webglcontextlost", onLost);
      gl.deleteBuffer(buf); gl.deleteProgram(prog);
      gl.getExtension("WEBGL_lose_context")?.loseContext(); // free the GPU context right away
    };
  }, [variant, scale, fps]);

  return <canvas ref={ref} aria-hidden className={`block ${className}`} />;
}
