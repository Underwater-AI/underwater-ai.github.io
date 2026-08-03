/* ============================================================================
   UNDERWATER AI — IMMERSIVE 3D SCENE (Performance-First)
   Optimised for 60fps: low triangle count, instanced rendering,
   adaptive quality, no heavy PBR materials.
   ============================================================================ */
import * as THREE from 'three';

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ---- Public surface ---- */
const Scene = {
  camera: null, renderer: null, isReady: false,
  scrollProgress: 0,
  mouse: { x: 0, y: 0, tx: 0, ty: 0 },
  setScroll(p) { this.scrollProgress = p; },
  setMouse(x, y) { this.mouse.tx = x; this.mouse.ty = y; },
};
window.UnderwaterScene = Scene;

/* ---- Config ---- */
const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
const isLowPower = (navigator.hardwareConcurrency || 8) <= 4;
const DPR = isLowPower ? 1.0 : Math.min(window.devicePixelRatio, 1.5);

const C = {
  bubbleCount:   isLowPower ? 12 : (isMobile ? 16 : 24),
  fishCount:     isLowPower ? 3  : (isMobile ? 4  : 8),
  jellyfishCount:3,
  kelpCount:     isLowPower ? 4  : (isMobile ? 5  : 8),
  coralCount:    isLowPower ? 3  : (isMobile ? 3  : 5),
  particleCount: isLowPower ? 40 : (isMobile ? 50 : 80),
  godRayCount:   isLowPower ? 2  : (isMobile ? 3  : 5),
  heroJellySize: 3,
  waterSeg:      isLowPower ? 24 : (isMobile ? 30 : 40),  // was 200×200
  fogColor: 0x000818,
  camStart: [0, 3, 26],
  camLook:  [0, 0, 0],
};

/* ---- Canvas & Renderer ---- */
const canvas = document.getElementById('scene-canvas');
if (!canvas) throw new Error('No canvas');

const scene = new THREE.Scene();
scene.background = new THREE.Color(C.fogColor);
scene.fog = new THREE.Fog(C.fogColor, 12, 65);

const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 200);
camera.position.set(...C.camStart);
camera.lookAt(...C.camLook);
Scene.camera = camera;

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: false, alpha: false,
  powerPreference: 'high-performance',
  stencil: false, premultipliedAlpha: false, preserveDrawingBuffer: false,
});
renderer.setSize(innerWidth, innerHeight, false);
renderer.setPixelRatio(DPR);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
Scene.renderer = renderer;

/* ---- Lighting ---- */
scene.add(new THREE.AmbientLight(0x4488aa, 0.3));
scene.add(new THREE.HemisphereLight(0x88ddff, 0x001020, 0.5));
const sun = new THREE.DirectionalLight(0xc8e8ff, 0.9);
sun.position.set(5, 25, 8);
scene.add(sun);

/* ---- Sky sphere (low-poly) ---- */
{
  const geo = new THREE.SphereGeometry(180, 16, 10);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uTop:    { value: new THREE.Color(0x2266aa) },
      uMid:    { value: new THREE.Color(0x000818) },
      uBottom: { value: new THREE.Color(0x000208) },
    },
    vertexShader: `
      varying float vY;
      void main() {
        vY = normalize(position).y;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop, uMid, uBottom;
      varying float vY;
      void main() {
        vec3 c = vY > 0.0 ? mix(uMid, uTop, vY) : mix(uMid, uBottom, -vY);
        gl_FragColor = vec4(c, 1.0);
      }
    `,
  });
  scene.add(new THREE.Mesh(geo, mat));
}

/* ---- Water surface (low-segment plane) ---- */
const waterMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, side: THREE.DoubleSide,
  uniforms: {
    uTime: { value: 0 },
    uColor: { value: new THREE.Color(0x001a2c) },
    uLight: { value: new THREE.Color(0x00b4d8) },
    uFogColor: { value: new THREE.Color(C.fogColor) },
    uCameraPos: { value: new THREE.Vector3() },
  },
  vertexShader: `
    uniform float uTime;
    varying float vWave;
    varying vec3 vWPos;
    void main() {
      vec3 p = position;
      float w = sin(p.x * 0.06 + uTime * 0.5) * 0.25
              + sin(p.z * 0.05 + uTime * 0.3) * 0.18
              + sin(p.x * 0.03 + p.z * 0.04 + uTime * 0.2) * 0.15;
      p.y += w;
      vWave = w;
      vWPos = (modelMatrix * vec4(p, 1.0)).xyz;
      gl_Position = projectionMatrix * viewMatrix * vec4(vWPos, 1.0);
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColor, uLight, uFogColor, uCameraPos;
    varying float vWave;
    varying vec3 vWPos;
    void main() {
      vec3 vd = uCameraPos - vWPos;
      float dist = length(vd);
      vec3 view = vd / dist;

      // Simple Fresnel approximation
      float fresnel = pow(1.0 - max(dot(vec3(0.0, 1.0, 0.0), view), 0.0), 3.0);
      vec3 skyCol = mix(vec3(0.0, 0.12, 0.22), vec3(0.2, 0.45, 0.6), fresnel);

      // Sun glint
      vec3 reflectDir = reflect(-view, vec3(0.0, 1.0, 0.0));
      vec3 sunDir = normalize(vec3(5.0, 25.0, 8.0));
      float sunDot = max(dot(reflectDir, sunDir), 0.0);
      vec3 sunGlint = vec3(1.0, 0.9, 0.6) * pow(sunDot, 128.0) * 0.8;

      // Water color
      float depth = smoothstep(20.0, 65.0, dist);
      vec3 col = mix(uColor, uLight, fresnel * 0.5);
      col = mix(col, skyCol, fresnel * 0.6);
      col += sunGlint;
      col = mix(col, uFogColor, depth);
      float alpha = 0.85 + fresnel * 0.1;
      gl_FragColor = vec4(col, alpha);
    }
  `,
});
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(140, 140, C.waterSeg, C.waterSeg).rotateX(-Math.PI / 2),
  waterMat
);
water.position.y = 12;
scene.add(water);

/* ---- God rays (additive cones) ---- */
const godRays = [];
for (let i = 0; i < C.godRayCount; i++) {
  const h = 26 + Math.random() * 10;
  const geo = new THREE.ConeGeometry(3 + Math.random() * 3, h, 8, 1, true);
  geo.translate(0, -h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0.06 + Math.random() * 0.08 } },
    vertexShader: `
      varying float vY;
      void main() {
        vY = (position.y + ${h.toFixed(1)}) / ${h.toFixed(1)};
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime, uAlpha;
      varying float vY;
      void main() {
        float a = smoothstep(0.0, 0.3, 1.0 - vY);
        a *= 0.6 + 0.4 * sin(vY * 8.0 + uTime * 0.3);
        gl_FragColor = vec4(0.53, 0.87, 1.0, a * uAlpha);
      }
    `,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((Math.random() - 0.5) * 40, 12, (Math.random() - 0.5) * 25 - 5);
  m.userData = { mat, baseX: m.position.x };
  scene.add(m);
  godRays.push(m);
}

/* ---- Jellyfish (high-poly bell, no PBR) ---- */
const jellyfish = [];
function buildJellyfish() {
  const g = new THREE.Group();
  const hue = 180 + Math.random() * 50;
  const col = new THREE.Color().setHSL(hue / 360, 0.8, 0.65);
  const emissive = new THREE.Color().setHSL(hue / 360, 0.9, 0.45);

  // Bell
  const bellGeo = new THREE.SphereGeometry(1, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  const bellMat = new THREE.MeshBasicMaterial({
    color: col, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
  });
  const bell = new THREE.Mesh(bellGeo, bellMat);
  g.add(bell);

  // Glow core
  const glowGeo = new THREE.SphereGeometry(0.35, 8, 8);
  const glowMat = new THREE.MeshBasicMaterial({
    color: emissive, transparent: true, opacity: 0.5,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = -0.2;
  g.add(glow);

  // Tentacles (simple lines, not tubes)
  const tentacles = [];
  for (let i = 0; i < 8; i++) {
    const points = [];
    const angle = (i / 8) * Math.PI * 2;
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      points.push(new THREE.Vector3(
        Math.cos(angle) * (0.7 - t * 0.4),
        -t * 2.5,
        Math.sin(angle) * (0.7 - t * 0.4)
      ));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.5 });
    const line = new THREE.Line(geo, mat);
    line.userData = { phase: Math.random() * Math.PI * 2, baseAngle: angle };
    g.add(line);
    tentacles.push(line);
  }
  g.userData = { bell, glow, tentacles, phase: Math.random() * Math.PI * 2, basePos: new THREE.Vector3() };
  return g;
}

// Fixed positions so the camera tour can visit each jellyfish deterministically:
// 0 = HERO (big, right-center, near camera) | 1 = SECOND (upper-left)
// 2 = deep-right | 3 = far-left background
const JELLY_SPOTS = [
  { scale: C.heroJellySize, pos: [2, 1, 10], hero: true },
  { scale: 1.4,             pos: [-5, 2, 14], hero: false },
  { scale: 1.1,             pos: [6, -2, 12], hero: false },
  { scale: 1.0,             pos: [-7, -4, 16], hero: false },
];
for (let i = 0; i < C.jellyfishCount; i++) {
  const j = buildJellyfish();
  const spot = JELLY_SPOTS[i] || { scale: 1.0, pos: [(Math.random() - 0.5) * 30, 2 - i * 3, (Math.random() - 0.5) * 20 - 5], hero: false };
  const isHero = !!spot.hero;
  j.scale.setScalar(spot.scale);
  j.position.set(...spot.pos);
  j.userData.isHero = isHero;
  j.userData.basePos.copy(j.position);
  scene.add(j);
  jellyfish.push(j);
}

/* ---- Fish (procedural, instanced — no GLB) ---- */
const fishGroup = new THREE.Group();
const fishData = [];
{
  const bodyGeo = new THREE.ConeGeometry(0.15, 0.6, 4);
  bodyGeo.rotateZ(-Math.PI / 2);
  const bodyMat = new THREE.MeshBasicMaterial({ color: 0x4488cc, transparent: true, opacity: 0.8 });
  const bodyMesh = new THREE.InstancedMesh(bodyGeo, bodyMat, C.fishCount);
  const tailGeo = new THREE.ConeGeometry(0.12, 0.22, 3);
  tailGeo.rotateZ(Math.PI / 2);
  const tailMat = new THREE.MeshBasicMaterial({ color: 0x5599dd, transparent: true, opacity: 0.7 });
  const tailMesh = new THREE.InstancedMesh(tailGeo, tailMat, C.fishCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < C.fishCount; i++) {
    const f = {
      center: new THREE.Vector3((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 12 - 1, (Math.random() - 0.5) * 20 - 8),
      radius: 3 + Math.random() * 6, speed: 0.12 + Math.random() * 0.2,
      offset: Math.random() * Math.PI * 2, bobAmp: 0.3 + Math.random() * 0.5,
      scale: 0.5 + Math.random() * 0.6, wagSpeed: 2.5 + Math.random() * 2,
      wagPhase: Math.random() * Math.PI * 2,
    };
    fishData.push(f);
    dummy.position.copy(f.center);
    dummy.scale.setScalar(f.scale);
    dummy.updateMatrix();
    bodyMesh.setMatrixAt(i, dummy.matrix);
    tailMesh.setMatrixAt(i, dummy.matrix);
  }
  bodyMesh.instanceMatrix.needsUpdate = true;
  tailMesh.instanceMatrix.needsUpdate = true;
  fishGroup.add(bodyMesh, tailMesh);
}
scene.add(fishGroup);

/* ---- Bubbles (instanced, MeshBasicMaterial) ---- */
const bubbleData = [];
const bubbleMesh = (() => {
  const geo = new THREE.SphereGeometry(1, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.45 });
  const mesh = new THREE.InstancedMesh(geo, mat, C.bubbleCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < C.bubbleCount; i++) {
    const b = {
      x: (Math.random() - 0.5) * 30,
      y: (Math.random() - 0.5) * 22 + 2,
      z: (Math.random() - 0.5) * 25 - 8,
      r: 0.04 + Math.random() * 0.2,
      speed: 0.4 + Math.random() * 0.8,
      wobble: Math.random() * Math.PI * 2,
    };
    bubbleData.push(b);
    dummy.position.set(b.x, b.y, b.z);
    dummy.scale.setScalar(b.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, dummy };
})();
scene.add(bubbleMesh.mesh);

/* ---- Kelp (simple animated planes) ---- */
const kelpMats = [];
for (let i = 0; i < C.kelpCount; i++) {
  const h = 4 + Math.random() * 5;
  const w = 0.4 + Math.random() * 0.3;
  const geo = new THREE.PlaneGeometry(w, h, 1, 16);
  geo.translate(0, h / 2, 0);
  const hue = 130 + Math.random() * 30;
  const mat = new THREE.MeshBasicMaterial({
    color: new THREE.Color().setHSL(hue / 360, 0.5, 0.25 + Math.random() * 0.1),
    transparent: true, opacity: 0.85, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(geo, mat);
  m.position.set((Math.random() - 0.5) * 50, -10, (Math.random() - 0.5) * 25 - 8);
  m.rotation.y = Math.random() * Math.PI;
  m.userData = { phase: Math.random() * Math.PI * 2, h, w };
  scene.add(m);
  kelpMats.push(m);
}

/* ---- Sand floor ---- */
{
  const geo = new THREE.PlaneGeometry(120, 80, 20, 16);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, Math.sin(x * 0.12) * 0.3 + Math.cos(z * 0.1) * 0.25);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x9a7856 });
  const m = new THREE.Mesh(geo, mat);
  m.position.y = -11;
  scene.add(m);
}

/* ---- Caustics (scrolling texture on floor) ---- */
const causticTex = (() => {
  const sz = 256;
  const c = document.createElement('canvas');
  c.width = c.height = sz;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(sz, sz);
  for (let y = 0; y < sz; y++) {
    for (let x = 0; x < sz; x++) {
      const u = x / sz, v = y / sz;
      const a = Math.sin((u * 6 + v * 4) * Math.PI) * 0.5 + 0.5;
      const b = Math.sin((u * 9 - v * 7) * Math.PI) * 0.5 + 0.5;
      const k = Math.sqrt(a * b);
      const val = Math.floor(k * 255);
      const i = (y * sz + x) * 4;
      img.data[i] = val; img.data[i + 1] = val; img.data[i + 2] = val; img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
const causticMat = new THREE.MeshBasicMaterial({
  map: causticTex, transparent: true, opacity: 0.22,
  blending: THREE.AdditiveBlending, depthWrite: false,
});
const causticMesh = new THREE.Mesh(new THREE.PlaneGeometry(100, 80).rotateX(-Math.PI / 2), causticMat);
causticMesh.position.y = -10.8;
scene.add(causticMesh);

/* ---- Coral garden (fixed spots so the camera tour visits them) ---- */
{
  const colors = [0xff5577, 0x8844cc, 0xff9944, 0xff66aa, 0x44aaff];
  const spots = [
    { x: -3, z: -6 }, { x: 0, z: -8 }, { x: 4, z: -7 }, { x: -5, z: -10 },
    { x: 3, z: -12 }, { x: 0, z: -13 }, { x: -2, z: -15 }, { x: 2, z: -16 },
  ];
  for (let i = 0; i < C.coralCount; i++) {
    const h = 0.6 + Math.random() * 1.2;
    const geo = new THREE.ConeGeometry(0.4 + Math.random() * 0.3, h, 4, 1);
    const mat = new THREE.MeshBasicMaterial({ color: colors[i % colors.length] });
    const m = new THREE.Mesh(geo, mat);
    const s = spots[i] || { x: (Math.random() - 0.5) * 10, z: -6 - Math.random() * 10 };
    m.position.set(s.x, -10.5 + h / 2, s.z);
    m.scale.setScalar(0.7 + Math.random() * 0.5);
    scene.add(m);
  }
}

/* ---- Sea turtles — graceful gliders (lightweight primitives) ---- */
const turtleData = [];
{
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x2e8b57, transparent: true, opacity: 0.9 });
  const skinMat  = new THREE.MeshBasicMaterial({ color: 0x7fb069, transparent: true, opacity: 0.85 });
  for (let t = 0; t < 2; t++) {
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 7), shellMat);
    shell.scale.set(1.25, 0.55, 0.9);
    shell.position.y = 0.08;
    g.add(shell);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), skinMat);
    head.position.set(0.58, 0.06, 0);
    g.add(head);
    const flippers = [];
    const fpos = [[0.4, 0.58, 0.9], [0.4, -0.58, -0.9], [-0.4, 0.58, 2.2], [-0.4, -0.58, -2.2]];
    for (const fp of fpos) {
      const fl = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.14), skinMat);
      fl.position.set(fp[0], 0.02, fp[1]);
      fl.rotation.y = fp[2];
      g.add(fl);
      flippers.push(fl);
    }
    g.userData = { flippers, phase: Math.random() * Math.PI * 2, basePos: new THREE.Vector3() };
    g.position.set(t === 0 ? -4 : 5, -5 - t * 2, -4 - t * 4);
    g.scale.setScalar(1.5 - t * 0.3);
    g.userData.basePos.copy(g.position);
    scene.add(g);
    turtleData.push(g);
  }
}

/* ---- Manta ray — majestic glider ---- */
const mantaData = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1a2f4a, transparent: true, opacity: 0.9, side: THREE.DoubleSide });
  const wingGeo = new THREE.ConeGeometry(1, 0.12, 6, 1, true);
  const left = new THREE.Mesh(wingGeo, mat);
  left.scale.set(0.5, 1, 2.2);
  left.rotation.y = Math.PI / 2;
  left.position.x = -1.1;
  left.rotation.z = 0.15;
  g.add(left);
  const right = left.clone();
  right.position.x = 1.1;
  right.rotation.z = -0.15;
  g.add(right);
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), mat);
  body.scale.set(0.6, 0.35, 1.2);
  g.add(body);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.04, 1.1, 4), mat);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, -0.02, -1);
  g.add(tail);
  g.userData = { basePos: new THREE.Vector3(), phase: Math.random() * Math.PI * 2 };
  g.position.set(0, -7, -8);
  g.scale.setScalar(2.2);
  g.userData.basePos.copy(g.position);
  scene.add(g);
  return g;
})();

/* ---- Whale — enormous gentle giant ---- */
const whaleData = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0x1d3a5f, transparent: true, opacity: 0.92 });
  const bellyMat = new THREE.MeshBasicMaterial({ color: 0x9fb8c9, transparent: true, opacity: 0.9 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 9), mat);
  body.scale.set(2.6, 0.85, 0.95);
  g.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), mat);
  head.position.set(2.05, 0.05, 0);
  head.scale.set(1.1, 0.85, 0.9);
  g.add(head);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.7, 7, 5), bellyMat);
  belly.scale.set(2.2, 0.45, 0.8);
  belly.position.set(0.3, -0.26, 0);
  g.add(belly);
  const flukeGeo = new THREE.ConeGeometry(0.2, 0.06, 4, 1, true);
  const flukeL = new THREE.Mesh(flukeGeo, mat);
  flukeL.rotation.z = Math.PI / 2;
  flukeL.position.set(-2.45, 0.2, 0.48);
  flukeL.scale.set(1, 1, 2.2);
  g.add(flukeL);
  const flukeR = flukeL.clone();
  flukeR.position.z = -0.48;
  g.add(flukeR);
  const finGeo = new THREE.ConeGeometry(0.18, 0.7, 5);
  const finL = new THREE.Mesh(finGeo, mat);
  finL.rotation.z = 1.4;
  finL.position.set(0.4, -0.28, 1.05);
  g.add(finL);
  const finR = finL.clone();
  finR.rotation.z = -1.4;
  finR.position.z = -1.05;
  g.add(finR);
  g.userData = { flukes: [flukeL, flukeR], basePos: new THREE.Vector3(), phase: Math.random() * Math.PI * 2 };
  g.position.set(-10, -4, -18);
  g.scale.setScalar(3.0);
  g.rotation.y = 0.4;
  g.userData.basePos.copy(g.position);
  scene.add(g);
  return g;
})();

/* ---- Seahorses — tiny whimsical bobs near the kelp corridor ---- */
const seahorseData = [];
{
  const mat = new THREE.MeshBasicMaterial({ color: 0xe8a33d, transparent: true, opacity: 0.9 });
  for (let s = 0; s < 3; s++) {
    const g = new THREE.Group();
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.06, 0.16, 0),
      new THREE.Vector3(0.05, 0.34, 0), new THREE.Vector3(-0.02, 0.5, 0),
      new THREE.Vector3(-0.1, 0.62, 0), new THREE.Vector3(-0.17, 0.55, 0),
    ]);
    const body = new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.06, 4, false), mat);
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 5), mat);
    head.position.set(-0.04, 0.7, 0);
    g.add(head);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), mat);
    fin.position.set(0.09, 0.4, 0);
    fin.rotation.z = 0.4;
    g.add(fin);
    g.userData = { basePos: new THREE.Vector3(), phase: Math.random() * Math.PI * 2 };
    g.position.set(s === 0 ? -3.5 : s === 1 ? 6.5 : -1, -8 - s * 1.2, -8 - s * 3);
    g.scale.setScalar(0.8 + s * 0.15);
    g.rotation.y = (s - 1) * 0.5;
    g.userData.basePos.copy(g.position);
    scene.add(g);
    seahorseData.push(g);
  }
}

/* ---- Marine snow (Points) ---- */
const marineSnow = (() => {
  const count = C.particleCount;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 50;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x88bbcc, size: 0.15, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  return new THREE.Points(geo, mat);
})();
scene.add(marineSnow);

/* ---- Bioluminescent plankton (Points, bright) ---- */
const plankton = (() => {
  const count = isLowPower ? 25 : 50;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 25;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 25 - 5;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.PointsMaterial({
    color: 0x00ffdd, size: 0.35, transparent: true, opacity: 0.7,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  return { points: new THREE.Points(geo, mat), geo };
})();
scene.add(plankton.points);

/* ---- Data streams (3 vertical columns of Points) ---- */
const dataStreams = [];
for (let i = 0; i < (isLowPower ? 0 : 3); i++) {
  const x = (i - 1) * 15 + (Math.random() - 0.5) * 4;
  const z = (Math.random() - 0.5) * 20 - 5;
  const count = 20;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  for (let j = 0; j < count; j++) {
    pos[j * 3] = x + (Math.random() - 0.5) * 0.3;
    pos[j * 3 + 1] = j * 0.6;
    pos[j * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x00ffd5, size: 0.2, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const pts = new THREE.Points(geo, mat);
  dataStreams.push(pts);
  scene.add(pts);
}

/* ---- Camera tour — visits the landmarks: hero → second jellyfish → kelp corridor
        → fish school → coral garden → main hero jellyfish → whale → surface ---- */
const WP = [
  { p: 0.00, cam: [1, 3, 26], look: [2, 1, 10] },    // HERO — main jellyfish ahead
  { p: 0.14, cam: [-5, 2, 18], look: [-5, 2, 14] },  // SECOND jellyfish (upper-left)
  { p: 0.30, cam: [2, -1, 15], look: [3, -3, -4] },  // kelp corridor
  { p: 0.46, cam: [-4, -4, 18], look: [0, -4, -6] }, // fish school
  { p: 0.62, cam: [3, -8, 14], look: [0, -10, -7] }, // coral garden (deep)
  { p: 0.78, cam: [-4, -4, 20], look: [2, 1, 10] },  // back to MAIN hero jellyfish
  { p: 0.90, cam: [6, -1, 24], look: [-10, -4, -18] }, // whale in background
  { p: 1.00, cam: [0, 3, 28], look: [0, 0, 0] },     // surface finale
];
function lerpWP(p) {
  p = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < WP.length - 1 && WP[i + 1].p < p) i++;
  const a = WP[i], b = WP[Math.min(i + 1, WP.length - 1)];
  const t = (b.p - a.p) > 0 ? (p - a.p) / (b.p - a.p) : 0;
  const e = t * t * (3 - 2 * t); // smoothstep
  camera.position.set(
    a.cam[0] + (b.cam[0] - a.cam[0]) * e,
    a.cam[1] + (b.cam[1] - a.cam[1]) * e,
    a.cam[2] + (b.cam[2] - a.cam[2]) * e,
  );
  const la = a.look, lb = b.look;
  camera.lookAt(
    la[0] + (lb[0] - la[0]) * e,
    la[1] + (lb[1] - la[1]) * e,
    la[2] + (lb[2] - la[2]) * e,
  );
}

/* ---- Animation loop ---- */
const clock = new THREE.Clock();
let elapsed = 0;
const dummy = new THREE.Object3D();
const _camPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;

  Scene.mouse.x += (Scene.mouse.tx - Scene.mouse.x) * 0.04;
  Scene.mouse.y += (Scene.mouse.ty - Scene.mouse.y) * 0.04;

  // Camera
  lerpWP(Scene.scrollProgress);
  if (!prefersReducedMotion) {
    camera.position.x += Scene.mouse.x * 0.5;
    camera.position.y += Scene.mouse.y * 0.25;
  }
  camera.getWorldPosition(_camPos);
  waterMat.uniforms.uTime.value = elapsed;
  waterMat.uniforms.uCameraPos.value.copy(_camPos);

  // Water surface wave update (only if significant change)
  if (!prefersReducedMotion && elapsed % 0.05 < dt) {
    const pos = water.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const w = Math.sin(x * 0.06 + elapsed * 0.5) * 0.25
              + Math.sin(z * 0.05 + elapsed * 0.3) * 0.18
              + Math.sin(x * 0.03 + z * 0.04 + elapsed * 0.2) * 0.15;
      pos.setY(i, w);
    }
    pos.needsUpdate = true;
    water.geometry.computeVertexNormals();
  }

  // God rays
  godRays.forEach((r) => {
    r.userData.mat.uniforms.uTime.value = elapsed;
    r.position.x = r.userData.baseX + Math.sin(elapsed * 0.1) * 0.3;
  });

  // Jellyfish pulse
  jellyfish.forEach((j) => {
    const ud = j.userData;
    const pulse = 1 + Math.sin(elapsed * 1.2 + ud.phase) * 0.08;
    ud.bell.scale.set(pulse, 1 / pulse, pulse);
    ud.glow.material.opacity = 0.35 + Math.sin(elapsed * 1.5 + ud.phase) * 0.15;
    ud.tentacles.forEach((t) => {
      t.rotation.x = Math.sin(elapsed * 0.7 + t.userData.phase) * 0.15;
      t.rotation.z = Math.sin(elapsed * 0.5 + t.userData.phase + 1) * 0.15;
    });
    j.position.x = ud.basePos.x + Math.sin(elapsed * 0.3) * 1.0;
    j.position.y = ud.basePos.y + Math.sin(elapsed * 0.4) * 0.5;
    j.rotation.y = elapsed * 0.05;
  });

  // Fish school
  fishData.forEach((f, i) => {
    const t = elapsed * f.speed + f.offset;
    const x = f.center.x + Math.cos(t) * f.radius;
    const z = f.center.z + Math.sin(t) * f.radius;
    const y = f.center.y + Math.sin(t * 1.3) * f.bobAmp;
    dummy.position.set(x, y, z);
    const tx = -Math.sin(t) * f.radius * f.speed;
    const tz = Math.cos(t) * f.radius * f.speed;
    dummy.rotation.y = Math.atan2(tx, tz) + Math.sin(elapsed * f.wagSpeed + f.wagPhase) * 0.12;
    dummy.rotation.z = Math.sin(elapsed * f.wagSpeed * 0.5 + f.wagPhase) * 0.08;
    dummy.scale.setScalar(f.scale);
    dummy.updateMatrix();
    fishGroup.children[0].setMatrixAt(i, dummy.matrix);
    fishGroup.children[1].setMatrixAt(i, dummy.matrix);
  });
  fishGroup.children[0].instanceMatrix.needsUpdate = true;
  fishGroup.children[1].instanceMatrix.needsUpdate = true;

  // Sea turtles — graceful circular glides + flipper flaps
  turtleData.forEach((t, ti) => {
    const ud = t.userData;
    const a = elapsed * 0.12 + ud.phase;
    t.position.x = ud.basePos.x + Math.sin(a) * 3.5;
    t.position.z = ud.basePos.z + Math.cos(a) * 3.5;
    t.position.y = ud.basePos.y + Math.sin(a * 1.4) * 0.45;
    t.rotation.y = -a + Math.PI / 2;
    ud.flippers.forEach((f, fi) => {
      f.rotation.z = (fi % 2 === 0 ? 1 : -1) * (0.5 + Math.sin(elapsed * 2.2 + ud.phase + fi) * 0.35);
    });
  });

  // Manta ray — majestic elliptical glide with banking
  const ma = elapsed * 0.09 + mantaData.userData.phase;
  mantaData.position.x = Math.cos(ma) * 8;
  mantaData.position.z = mantaData.userData.basePos.z + Math.sin(ma) * 5.5;
  mantaData.position.y = mantaData.userData.basePos.y + Math.sin(ma * 1.8) * 0.5;
  mantaData.rotation.y = -ma;
  mantaData.rotation.z = 0.15 * Math.sin(ma * 2);

  // Whale — slow deliberate crossing, tail fluke sway
  const wd = whaleData.userData;
  whaleData.position.x = wd.basePos.x + Math.sin(elapsed * 0.05 + wd.phase) * 5;
  whaleData.position.y = wd.basePos.y + Math.sin(elapsed * 0.07 + wd.phase) * 0.7;
  whaleData.rotation.z = Math.sin(elapsed * 0.05 + wd.phase) * 0.04;
  wd.flukes.forEach((fl, fi) => {
    fl.rotation.z = Math.PI / 2 + (fi % 2 === 0 ? 0.4 : -0.4) + Math.sin(elapsed * 2.4 + wd.phase) * 0.15;
  });

  // Seahorses — gentle bobbing
  seahorseData.forEach((s) => {
    const sd = s.userData;
    s.position.y = sd.basePos.y + Math.sin(elapsed * 1.3 + sd.phase) * 0.13;
    s.rotation.z = Math.sin(elapsed * 0.8 + sd.phase) * 0.05;
  });

  // Bubbles
  bubbleData.forEach((b, i) => {
    b.y += b.speed * dt;
    if (b.y > 12) { b.y = -11; b.x = (Math.random() - 0.5) * 30; b.z = (Math.random() - 0.5) * 25 - 8; }
    dummy.position.set(b.x + Math.sin(elapsed * 0.8 + b.wobble) * 0.3, b.y, b.z + Math.cos(elapsed * 0.6 + b.wobble) * 0.2);
    dummy.scale.setScalar(b.r);
    dummy.updateMatrix();
    bubbleMesh.mesh.setMatrixAt(i, dummy.matrix);
  });
  bubbleMesh.mesh.instanceMatrix.needsUpdate = true;

  // Kelp sway
  kelpMats.forEach((m) => {
    const ud = m.userData;
    m.rotation.x = Math.sin(elapsed * 0.5 + ud.phase) * 0.12;
    m.rotation.z = Math.cos(elapsed * 0.4 + ud.phase * 0.7) * 0.1;
  });

  // Marine snow drift
  const sp = marineSnow.geometry.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    sp.setY(i, sp.getY(i) - dt * 0.3);
    if (sp.getY(i) < -13) sp.setY(i, 12);
    sp.setX(i, sp.getX(i) + Math.sin(elapsed * 0.2 + i) * dt * 0.1);
  }
  sp.needsUpdate = true;

  // Plankton drift
  const pp = plankton.geo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    pp.setY(i, pp.getY(i) - dt * 0.15);
    if (pp.getY(i) < -13) pp.setY(i, 12);
    pp.setX(i, pp.getX(i) + Math.sin(elapsed * 0.3 + i * 0.7) * dt * 0.15);
    pp.setZ(i, pp.getZ(i) + Math.cos(elapsed * 0.25 + i * 0.5) * dt * 0.1);
  }
  pp.needsUpdate = true;

  // Data streams drift
  dataStreams.forEach((pts) => {
    const p = pts.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + dt * 1.5;
      p.setY(i, y > 14 ? -14 : y);
    }
    p.needsUpdate = true;
  });

  // Caustics scroll
  causticTex.offset.x = (elapsed * 0.015) % 1;
  causticTex.offset.y = (elapsed * 0.012) % 1;

  renderer.render(scene, camera);
}
if (!prefersReducedMotion) animate();

/* ---- Resize ---- */
window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.setPixelRatio(DPR);
});

/* ---- Mouse ---- */
window.addEventListener('mousemove', (e) => {
  Scene.setMouse((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
});

Scene.isReady = true;
