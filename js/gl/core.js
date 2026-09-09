/**
 * gl/core.js — One WebGL context, several acts, one post pass.
 *
 * The whole film runs through a single renderer. Each "act" (ocean, vehicle,
 * reconstruction) owns a scene and camera and registers itself here; only the
 * active act is rendered. Everything then passes through the murk shader, whose
 * uMurk uniform is the single dial that turns "drowned in water" into "restored
 * by Underwater AI".
 */
import * as THREE from 'three';

export const prefersReducedMotion =
  matchMedia('(prefers-reduced-motion: reduce)').matches;

const MURK_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;

uniform sampler2D tDiffuse;
uniform float uMurk;    // 0 = restored, 1 = full water column
uniform float uWipe;    // < 0 disabled, else x position of the enhancement edge
uniform float uFade;    // act cross-fade
uniform float uPixel;   // 0 = native sensor, 1 = coarse readout
uniform float uIris;    // 0 = lids open, 1 = lids shut
uniform float uTime;
uniform float uAspect;
uniform vec3  uVeil;    // backscatter colour, theme dependent
uniform float uTunnel;  // 0 = open frame, 1 = looking down a lens barrel

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

/* Turbidity blur: a rotating 8-tap ring plus a tighter inner ring. Weights sum
   to 1.0 so the image never gains or loses energy as the radius changes. */
vec3 turbid(vec2 uv, float r) {
  if (r < 0.0005) return texture2D(tDiffuse, uv).rgb;
  vec3 c = texture2D(tDiffuse, uv).rgb * 0.22;
  float a = uTime * 0.05;
  for (int i = 0; i < 6; i++) {
    float ang = a + float(i) * 1.04719755;
    vec2 o = vec2(cos(ang), sin(ang) * uAspect);
    c += texture2D(tDiffuse, uv + o * r).rgb * 0.10;
    c += texture2D(tDiffuse, uv + o * r * 0.45).rgb * 0.03;
  }
  return c;
}

void main() {
  float murk = uMurk;
  float edge = 0.0;

  // The wipe sweeps right to left, so restoration lands on the reef wall
  // first rather than opening onto empty water. uWipe is the edge position.
  if (uWipe >= 0.0) {
    murk = vUv.x > uWipe ? 0.0 : uMurk;
    edge = smoothstep(0.005, 0.0, abs(vUv.x - uWipe));
  }

  /* Sensor readout resolution. Dropping the frame to coarse blocks is the
     visual language this site already uses for "before the AI", so the exit
     from the rover reuses it rather than inventing a new transition. */
  vec2 uv = vUv;
  if (uPixel > 0.002) {
    float blocks = mix(900.0, 24.0, pow(uPixel, 0.6));
    vec2 grid = vec2(blocks * uAspect, blocks);
    uv = (floor(vUv * grid) + 0.5) / grid;
  }

  vec3 col = turbid(uv, murk * 0.0062);

  // Wavelength-dependent absorption — red is gone long before blue.
  col *= vec3(exp(-2.6 * murk), exp(-0.95 * murk), exp(-0.15 * murk));

  // Backscatter is additive haze, not a grey wash: the vehicle's own light
  // returning off suspended solids raises the floor without flattening the
  // highlights, which is why murky footage reads dark-cyan rather than grey.
  vec3 veil = uVeil;
  float haze = murk * (0.78 + 0.13 * sin(vUv.y * 6.0 + uTime * 0.25));
  col = col * (1.0 - murk * 0.55) + veil * haze;

  // Saturation collapses with distance through water.
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(col, vec3(lum), murk * 0.20);

  // Marine snow drifting through the beam — murky water only.
  float snow = 0.0;
  if (murk > 0.01) {
  vec2 sp = vUv * vec2(uAspect, 1.0) * 26.0;
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    vec2 q = sp * (1.0 + fi * 0.6);
    q.y += uTime * (0.06 + fi * 0.05);
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash(id + fi * 17.0);
    vec2 off = (vec2(hash(id + 3.1), hash(id + 7.7)) - 0.5) * 0.6;
    snow += step(0.87, h) * smoothstep(0.10, 0.0, length(f - off));
  }
  }
  col += snow * murk * 0.45;

  // The leading edge of the restoration wipe reads as a bright scanning bar.
  col += edge * vec3(0.35, 0.92, 1.0) * 1.25;

  /* Lens barrel. As the camera flies back into the vehicle's dome port the
     frame narrows to a circular aperture, so the approach reads as entering
     an optic rather than merely getting close to the hull. */
  if (uTunnel > 0.001) {
    float rad = length((vUv - 0.5) * vec2(uAspect, 1.0));
    float bore = mix(1.0, smoothstep(0.62, 0.20, rad), uTunnel);
    col *= bore;
    // A faint ring of light on the glass at the mouth of the barrel.
    col += smoothstep(0.030, 0.0, abs(rad - 0.40)) * vec3(0.10, 0.34, 0.44) * uTunnel;
  }

  /* Eyelid shutter. Two lids close toward the centre line with a wet, lit
     edge — the blink that hides the cut from first to third person. */
  if (uIris > 0.001) {
    float lid = uIris * 0.5;
    float topEdge = 1.0 - lid;
    float botEdge = lid;
    float cover = clamp(
      smoothstep(topEdge - 0.004, topEdge + 0.004, vUv.y) +
      smoothstep(botEdge + 0.004, botEdge - 0.004, vUv.y), 0.0, 1.0);

    // Squeeze the surviving band slightly, the way a real lid compresses it.
    col *= 1.0 - cover;

    float glow = exp(-pow((vUv.y - topEdge) / 0.010, 2.0))
               + exp(-pow((vUv.y - botEdge) / 0.010, 2.0));
    col += glow * vec3(0.22, 0.66, 0.82) * 1.6 * (1.0 - uIris * 0.4);
  }

  gl_FragColor = vec4(max(col, 0.0) * uFade, 1.0);
}
`;

const MURK_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function createStage(canvas) {
  const isCoarse = matchMedia('(pointer: coarse)').matches;
  const lowPower = (navigator.hardwareConcurrency || 8) <= 4;
  const maxDPR = lowPower ? 1 : isCoarse ? 1.4 : 1.75;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: false,
    depth: true,
    stencil: false,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, maxDPR));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.autoClear = false;   // we clear explicitly so acts can use scissors

  const rt = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });

  const post = new THREE.ShaderMaterial({
    vertexShader: MURK_VERT,
    fragmentShader: MURK_FRAG,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      tDiffuse: { value: rt.texture },
      uMurk: { value: 1 },
      uWipe: { value: -1 },
      uFade: { value: 1 },
      uPixel: { value: 0 },
      uIris: { value: 0 },
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uVeil: { value: new THREE.Color(0.007, 0.042, 0.058) },
      uTunnel: { value: 0 },
    },
  });

  const quadScene = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

  const acts = new Map();
  let active = null;
  let running = false;
  const clock = new THREE.Clock();

  // Adaptive quality: if we can't hold frame budget, quietly drop resolution.
  let dpr = renderer.getPixelRatio();
  let slowFrames = 0;

  function resize() {
    const w = innerWidth;
    const h = innerHeight;
    renderer.setSize(w, h, false);
    const p = renderer.getPixelRatio();
    rt.setSize(Math.max(1, Math.round(w * p)), Math.max(1, Math.round(h * p)));
    post.uniforms.uAspect.value = w / Math.max(1, h);
    for (const act of acts.values()) act.resize?.(w, h);
  }

  const clearColor = new THREE.Color();
  let defaultClear = 0x03060b;

  /* Per-frame stats for the scene pass (renderer.info is reset by the post
     pass, so it has to be sampled between the two renders). Also feeds the
     performance assertions in the test suite. */
  const stats = { fps: 0, calls: 0, triangles: 0, act: null, dpr: 1 };
  let fpsFrames = 0;
  let fpsClock = 0;

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);

    // Two clocks on purpose: `dt` is clamped so a stall cannot teleport the
    // animation, while `real` is the honest frame time the fps meter reports.
    const real = clock.getDelta();
    const dt = Math.min(real, 0.05);
    const t = clock.elapsedTime;
    post.uniforms.uTime.value = t;

    const act = acts.get(active);
    if (!act) return;

    act.update?.(t, dt);

    // Once the water is out of the way the murk pass is a no-op, so the whole
    // render-target round trip and fullscreen shader are skipped. On a
    // fill-rate-bound device that is the difference between smooth and not.
    const u = post.uniforms;
    const needsPost = u.uMurk.value > 0.002 || u.uWipe.value >= 0
      || u.uFade.value < 0.999 || u.uPixel.value > 0.002
      || u.uIris.value > 0.001 || u.uTunnel.value > 0.001;

    renderer.setRenderTarget(needsPost ? rt : null);
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);
    renderer.setClearColor(clearColor.set(act.clearColor ?? defaultClear), 1);
    renderer.clear(true, true, false);

    // An act may bind itself to a DOM box, so the model sits exactly inside
    // its on-page frame instead of floating somewhere behind the layout.
    const box = act.viewport?.();
    if (box) {
      if (box.w < 2 || box.h < 2) { renderer.setRenderTarget(null); return; }
      renderer.setViewport(box.x, box.y, box.w, box.h);
      renderer.setScissor(box.x, box.y, box.w, box.h);
      renderer.setScissorTest(true);
    }
    renderer.render(act.scene, act.camera);
    stats.calls = renderer.info.render.calls;
    stats.triangles = renderer.info.render.triangles;
    stats.act = active;
    stats.dpr = renderer.getPixelRatio();
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, innerWidth, innerHeight);

    if (needsPost) {
      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCam);
    }

    fpsFrames++;
    fpsClock += real;
    if (fpsClock >= 0.5) {
      stats.fps = Math.round(fpsFrames / fpsClock);
      fpsFrames = 0;
      fpsClock = 0;
    }

    if (dt > 0.032) {
      if (++slowFrames > 45 && dpr > 0.8) {
        dpr = Math.max(0.8, dpr - 0.25);
        renderer.setPixelRatio(dpr);
        resize();
        slowFrames = 0;
      }
    } else {
      slowFrames = Math.max(0, slowFrames - 1);
    }
  }

  addEventListener('resize', resize, { passive: true });
  resize();

  const stage = {
    renderer,
    register(name, act) {
      acts.set(name, act);
      act.resize?.(innerWidth, innerHeight);
      if (!active) active = name;
    },
    /** Switch acts with a short fade so the cut never flashes. */
    setAct(name) {
      if (active === name || !acts.has(name)) return;
      active = name;
    },
    getAct: () => active,
    stats,
    act: (name) => acts.get(name),
    setMurk(v) { post.uniforms.uMurk.value = v; },
    getMurk: () => post.uniforms.uMurk.value,
    setPixel(v) { post.uniforms.uPixel.value = v; },
    getPixel: () => post.uniforms.uPixel.value,
    setIris(v) { post.uniforms.uIris.value = v; },
    getIris: () => post.uniforms.uIris.value,
    setTunnel(v) { post.uniforms.uTunnel.value = v; },
    getTunnel: () => post.uniforms.uTunnel.value,
    /** Light water scatters far more light back at you than dark water does. */
    setTheme(mode) {
      const light = mode === 'light';
      post.uniforms.uVeil.value.setRGB(
        light ? 0.30 : 0.007,
        light ? 0.46 : 0.042,
        light ? 0.52 : 0.058
      );
      defaultClear = light ? 0xdceef5 : 0x03060b;
    },
    setWipe(v) { post.uniforms.uWipe.value = v; },
    setFade(v) { post.uniforms.uFade.value = v; },
    start() { if (!running) { running = true; clock.start(); requestAnimationFrame(frame); } },
    stop() { running = false; },
    resize,
  };

  // Pause the loop when the tab is hidden — no point burning a GPU on nothing.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stage.stop();
    else stage.start();
  });

  return stage;
}
