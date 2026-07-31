/* ============================================================================
   UNDERWATER AI — IMMERSIVE 3D SCENE (v2 — Realistic)
   Photorealistic underwater world using Three.js + GLTFLoader +
   RoomEnvironment for IBL, MeshPhysicalMaterial with transmission
   for glass-like bubbles, a real GLB fish, and a custom water shader
   with skybox reflection + refracted caustics.
   ============================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// Guard: bail if Three.js failed to load (impossible since this is ESM).
// Reduced motion — short-circuit heavy cosmetic motion.
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Public state surface
const Scene = {
  camera: null,
  renderer: null,
  isReady: false,
  scrollProgress: 0,
  mouse: { x: 0, y: 0, tx: 0, ty: 0 },
  setScroll(p) { this.scrollProgress = p; },
  setMouse(x, y) { this.mouse.tx = x; this.mouse.ty = y; },
};
window.UnderwaterScene = Scene;

// ---------------------------------------------------------------------------
// CONFIG
// ---------------------------------------------------------------------------
const CONFIG = {
  isMobile: /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
  isLowPower: navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4,
  pixelRatioCap: 2,
  bubbleCount: 60,
  fishCount: 10,              // reduced from 14 — still dense, less geometry load
  jellyfishCount: 4,
  kelpCount: 10,               // reduced from 12 — GLB kelp is high-poly
  coralCount: 6,                // reduced from 7
  particleCount: 280,
  godRayCount: 7,
  dataStreamCount: 5,
  heroJellyfishSize: 4.5,
  fogColor: 0x010820,
  fogNear: 18,
  fogFar: 70,
  cameraStart: { x: 0, y: 4, z: 28 },
  cameraLookStart: { x: 0, y: 0, z: 0 },
};

// Mobile / low-power reduction — aggressive
if (CONFIG.isMobile || CONFIG.isLowPower) {
  CONFIG.bubbleCount = 24;
  CONFIG.fishCount = 4;
  CONFIG.kelpCount = 5;
  CONFIG.coralCount = 3;
  CONFIG.particleCount = 100;
  CONFIG.godRayCount = 3;
  CONFIG.dataStreamCount = 3;
  CONFIG.pixelRatioCap = 1.25;
}

// ---------------------------------------------------------------------------
// 1. CORE
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene-canvas');
if (!canvas) {
  // No canvas on the page — bail.
  throw new Error('[underwater-ai] #scene-canvas not found');
}

const scene = new THREE.Scene();
scene.background = new THREE.Color(CONFIG.fogColor);
scene.fog = new THREE.Fog(CONFIG.fogColor, CONFIG.fogNear, CONFIG.fogFar);

const camera = new THREE.PerspectiveCamera(
  55, window.innerWidth / window.innerHeight, 0.1, 250
);
camera.position.set(CONFIG.cameraStart.x, CONFIG.cameraStart.y, CONFIG.cameraStart.z);
camera.lookAt(CONFIG.cameraLookStart.x, CONFIG.cameraLookStart.y, CONFIG.cameraLookStart.z);
Scene.camera = camera;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false, // off on all devices; CSS handles smoothness
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
  logarithmicDepthBuffer: false,
});
renderer.setSize(window.innerWidth, window.innerHeight, false);

// Adaptive pixel ratio — dynamic resolution scaling
let adaptivePixelRatio = Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap);
renderer.setPixelRatio(adaptivePixelRatio);

renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
Scene.renderer = renderer;

// FPS monitor → drop pixel ratio when struggling, recover when comfortable
let frameCount = 0;
let lastFpsCheck = performance.now();
let currentFps = 60;
function monitorFps() {
  frameCount++;
  const now = performance.now();
  if (now - lastFpsCheck >= 2000) {
    currentFps = frameCount * 1000 / (now - lastFpsCheck);
    frameCount = 0;
    lastFpsCheck = now;
    if (currentFps < 30 && adaptivePixelRatio > 1) {
      adaptivePixelRatio = Math.max(1, adaptivePixelRatio - 0.25);
      renderer.setPixelRatio(adaptivePixelRatio);
      console.log(`[perf] pixel ratio ↓ ${adaptivePixelRatio.toFixed(2)} (fps: ${currentFps.toFixed(0)})`);
    } else if (currentFps > 55 && adaptivePixelRatio < CONFIG.pixelRatioCap) {
      adaptivePixelRatio = Math.min(CONFIG.pixelRatioCap, adaptivePixelRatio + 0.25);
      renderer.setPixelRatio(adaptivePixelRatio);
      console.log(`[perf] pixel ratio ↑ ${adaptivePixelRatio.toFixed(2)} (fps: ${currentFps.toFixed(0)})`);
    }
  }
}
window.__underwaterPerformance = { get fps() { return currentFps; }, get pixelRatio() { return adaptivePixelRatio; } };

// ---------------------------------------------------------------------------
// 2. IBL ENVIRONMENT — RoomEnvironment for PBR reflections
//    Required for bubbles, water, and the real GLB fish to look realistic.
// ---------------------------------------------------------------------------
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();
const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = envTex;
pmremGenerator.dispose();

// ---------------------------------------------------------------------------
// 3. LIGHTING
// ---------------------------------------------------------------------------
const ambient = new THREE.AmbientLight(0x4488aa, 0.30);
scene.add(ambient);

const hemi = new THREE.HemisphereLight(0x88ddff, 0x002030, 0.65);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xc8e8ff, 1.0);
sun.position.set(4, 30, 8);
scene.add(sun);

const deepFill = new THREE.DirectionalLight(0x00b4d8, 0.18);
deepFill.position.set(-10, -5, -10);
scene.add(deepFill);

// Subtle warm fill from below (bouncing off sand)
const sandBounce = new THREE.DirectionalLight(0xc8a878, 0.18);
sandBounce.position.set(0, -20, 0);
scene.add(sandBounce);

// ---------------------------------------------------------------------------
// 4. SKY / FOG VOLUME — simple gradient sphere for the IBL & background
//    (Without this, the water reflection would be a single color.)
// ---------------------------------------------------------------------------
const skyGeo = new THREE.SphereGeometry(200, 32, 16);
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    uTopColor:    { value: new THREE.Color(0x4488aa) },
    uMidColor:    { value: new THREE.Color(0x002438) },
    uBottomColor: { value: new THREE.Color(0x000408) },
  },
  vertexShader: `
    varying vec3 vWorld;
    void main() {
      vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform vec3 uTopColor;
    uniform vec3 uMidColor;
    uniform vec3 uBottomColor;
    varying vec3 vWorld;
    void main() {
      float h = normalize(vWorld).y; // -1 (down) → 1 (up)
      vec3 c;
      if (h > 0.0) {
        c = mix(uMidColor, uTopColor, smoothstep(0.0, 1.0, h));
      } else {
        c = mix(uMidColor, uBottomColor, smoothstep(0.0, 1.0, -h));
      }
      gl_FragColor = vec4(c, 1.0);
    }
  `,
});
const sky = new THREE.Mesh(skyGeo, skyMat);
scene.add(sky);

// ---------------------------------------------------------------------------
// 5. CAUSTICS TEXTURE (procedural, animated)
// ---------------------------------------------------------------------------
function makeCausticTexture() {
  const size = 512;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      // Multi-octave sin/cos interference pattern
      const a = Math.sin((u * 6 + v * 4) * Math.PI) * 0.5 + 0.5;
      const b = Math.sin((u * 9 - v * 7) * Math.PI) * 0.5 + 0.5;
      const c2 = Math.sin((u * 4 + v * 11) * Math.PI) * 0.5 + 0.5;
      const k = Math.pow(a * b * c2, 0.5);
      const i = (y * size + x) * 4;
      const val = Math.floor(k * 255);
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const causticTex = makeCausticTexture();
causticTex.repeat.set(8, 6);

// ---------------------------------------------------------------------------
// 6. WATER SURFACE — real ocean shader
//    - High-segment plane (200×200)
//    - Vertex shader: gerstner-like sum of sine waves
//    - Fragment shader: sky reflection + depth-based color + fresnel
//    - Animated normal map sampling for surface ripple
//    - Transparent (depthWrite: false) so the scene behind is visible
// ---------------------------------------------------------------------------
const waterGeo = new THREE.PlaneGeometry(160, 160, 200, 200);
waterGeo.rotateX(-Math.PI / 2);

const waterMat = new THREE.ShaderMaterial({
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
  uniforms: {
    uTime:         { value: 0 },
    uColorDeep:    { value: new THREE.Color(0x001a2c) },
    uColorShallow: { value: new THREE.Color(0x00b4d8) },
    uColorFoam:    { value: new THREE.Color(0xeefffa) },
    uSkyColor:     { value: new THREE.Color(0x4488aa) },
    uSunDir:       { value: new THREE.Vector3(4, 30, 8).normalize() },
    uCameraPos:    { value: new THREE.Vector3() },
    uFogColor:     { value: new THREE.Color(0x002438) },
    uFogNear:      { value: 18 },
    uFogFar:       { value: 70 },
  },
  vertexShader: `
    uniform float uTime;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveHeight;

    // Sine wave — used for the gerstner sum
    float wave(vec2 p, vec2 dir, float wavelength, float steepness, float speed, float t) {
      float k = 6.2831853 / wavelength;
      float phase = dot(dir, p) * k - t * speed;
      return steepness * sin(phase);
    }

    vec3 gerstnerDisplace(vec3 p, float t) {
      float h = 0.0;
      h += wave(p.xy, normalize(vec2( 1.0,  0.6)),  8.0, 0.30, 1.10, t);
      h += wave(p.xy, normalize(vec2(-0.7,  1.0)),  5.0, 0.22, 1.35, t);
      h += wave(p.xy, normalize(vec2( 0.5, -1.0)), 12.0, 0.18, 0.75, t);
      h += wave(p.xy, normalize(vec2(-0.3, -0.5)), 18.0, 0.10, 0.55, t);
      p.y += h;
      vWaveHeight = h;
      return p;
    }

    void main() {
      vec3 pos = position;
      pos = gerstnerDisplace(pos, uTime);
      // Approx normal via finite difference
      float e = 0.5;
      vec3 px = gerstnerDisplace(position + vec3(e, 0.0, 0.0), uTime);
      vec3 pz = gerstnerDisplace(position + vec3(0.0, 0.0, e), uTime);
      vNormal = normalize(cross(px - pos, pz - pos));
      vec4 worldPos = modelMatrix * vec4(pos, 1.0);
      vWorldPos = worldPos.xyz;
      gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
  `,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uColorDeep;
    uniform vec3 uColorShallow;
    uniform vec3 uColorFoam;
    uniform vec3 uSkyColor;
    uniform vec3 uSunDir;
    uniform vec3 uCameraPos;
    uniform vec3 uFogColor;
    uniform float uFogNear;
    uniform float uFogFar;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    varying float vWaveHeight;

    // Procedural normal-map style perturbation
    vec3 perturbNormal(vec3 n, vec2 uv) {
      float a = sin(uv.x * 18.0 + uTime * 0.7) * cos(uv.y * 22.0 - uTime * 0.5);
      float b = cos(uv.x * 26.0 - uTime * 0.4) * sin(uv.y * 16.0 + uTime * 0.6);
      vec3 t1 = vec3(a, 0.0, b);
      return normalize(n + t1 * 0.18);
    }

    void main() {
      vec3 viewDir = normalize(uCameraPos - vWorldPos);
      vec3 n = normalize(vNormal);
      vec3 perturbedN = perturbNormal(n, vWorldPos.xz * 0.5);

      // Fresnel (Schlick)
      float F0 = 0.02;
      float cosTheta = max(dot(perturbedN, viewDir), 0.0);
      float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

      // Reflection direction
      vec3 reflectDir = reflect(-viewDir, perturbedN);

      // Sky color sampled procedurally based on reflection direction
      float skyY = clamp(reflectDir.y, -1.0, 1.0);
      vec3 skyCol = mix(
        vec3(0.0, 0.10, 0.18),    // below horizon
        vec3(0.30, 0.55, 0.72),    // above horizon
        smoothstep(-0.1, 0.4, skyY)
      );
      // Bright sun spot in the sky reflection
      float sunDot = max(dot(reflectDir, uSunDir), 0.0);
      vec3 sunGlint = vec3(1.0, 0.9, 0.6) * pow(sunDot, 64.0) * 1.4;

      // Water body color (deep → shallow, modulated by fresnel)
      vec3 waterCol = mix(uColorDeep, uColorShallow, fresnel * 0.8);

      // Foam at wave crests
      float foam = smoothstep(0.6, 1.2, vWaveHeight + 0.3);
      vec3 foamCol = mix(uColorFoam, vec3(1.0), 0.6) * foam;

      // Specular highlight from the sun
      float specPow = pow(max(dot(reflectDir, uSunDir), 0.0), 80.0);
      vec3 specular = vec3(1.0, 0.95, 0.8) * specPow * 0.6;

      // Final color: mix sky and water by fresnel + foam + specular
      vec3 col = mix(waterCol, skyCol, fresnel);
      col = mix(col, foamCol, foam);
      col += specular + sunGlint;

      // Manual exponential fog (so we can keep fog:false on the material)
      float dist = length(uCameraPos - vWorldPos);
      float fogFactor = 1.0 - exp(-pow(dist / uFogFar, 2.0) * 1.5);
      col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));

      gl_FragColor = vec4(col, 0.92);
    }
  `,
});
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = 14;
scene.add(water);

// ---------------------------------------------------------------------------
// 7. GOD RAYS — additive cones pointing down from the surface
//    Now with a depth-based fade so they look like real volumetric light
// ---------------------------------------------------------------------------
function buildGodRays() {
  const rays = [];
  for (let i = 0; i < CONFIG.godRayCount; i++) {
    const h = 28 + Math.random() * 12;
    const r = 4 + Math.random() * 4;
    const geo = new THREE.ConeGeometry(r, h, 16, 1, true);
    geo.translate(0, -h / 2, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
      uniforms: {
        uTime:   { value: 0 },
        uColor:  { value: new THREE.Color(0x88ddff) },
        uHeight: { value: h },
        uOpacity:{ value: 0.10 + Math.random() * 0.10 },
      },
      vertexShader: `
        varying float vY;
        varying vec3 vWorld;
        void main() {
          vY = (position.y + ${h.toFixed(1)}) / ${h.toFixed(1)};
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorld = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vY;
        varying vec3 vWorld;
        void main() {
          // Fade with depth: brightest at top, fade as it descends
          float topFade = smoothstep(0.0, 0.2, 1.0 - vY);
          // Add slight horizontal scintillation
          float a = topFade * 0.8;
          a *= 0.6 + 0.4 * sin(vY * 10.0 + uTime * 0.4);
          a *= uOpacity;
          // Slight bluish shift as the ray descends (depth tint)
          vec3 col = mix(uColor, vec3(0.2, 0.6, 0.9), 1.0 - vY);
          gl_FragColor = vec4(col, a);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 50,
      14,
      (Math.random() - 0.5) * 30 - 5
    );
    mesh.rotation.z = (Math.random() - 0.5) * 0.2;
    mesh.userData = { baseX: mesh.position.x, mat };
    scene.add(mesh);
    rays.push(mesh);
  }
  return rays;
}
const godRays = buildGodRays();

// Shared DRACOLoader for all compressed GLBs
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/');

// ---------------------------------------------------------------------------
// MODEL LOADING TRACKER — reports progress for the loading UI
// ---------------------------------------------------------------------------
const ModelLoader = {
  total: 8, // fish, jellyfish, kelp, coral, seafloor, turtle, manta, submarine
  loaded: 0,
  onProgress: null,
  report(name) {
    this.loaded++;
    console.log(`[model-loader] ${name} loaded (${this.loaded}/${this.total})`);
    if (this.onProgress) this.onProgress(this.loaded, this.total);
  },
};
window.UnderwaterModelLoader = ModelLoader;

function lazyLoad(fn) {
  if ('requestIdleCallback' in window) {
    requestIdleCallback(fn, { timeout: 2000 });
  } else {
    setTimeout(fn, 100);
  }
}

// ---------------------------------------------------------------------------
// 8. JELLYFISH — load real GLB model from Meshy AI
//    Falls back to procedural if GLB fails to load
// ---------------------------------------------------------------------------
const jellyfishGroup = new THREE.Group();
jellyfishGroup.userData = { jellyData: [], loaded: false };
scene.add(jellyfishGroup);

const jellyLoader = new GLTFLoader();
jellyLoader.setDRACOLoader(dracoLoader);
let jellyfishModel = null;

// Procedural fallback (used if GLB fails)
function buildProceduralJellyfish() {
  const group = new THREE.Group();
  const hue = 180 + Math.random() * 50;
  const bellGeo = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = bellGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < 0.3) { pos.setX(i, x * 1.08); pos.setZ(i, z * 1.08); }
  }
  bellGeo.computeVertexNormals();
  const bellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
    emissive: new THREE.Color(`hsl(${hue}, 90%, 55%)`),
    emissiveIntensity: 0.5, transparent: true, opacity: 0.6,
    roughness: 0.25, metalness: 0.0, side: THREE.DoubleSide,
  });
  group.add(new THREE.Mesh(bellGeo, bellMat));
  const glowGeo = new THREE.SphereGeometry(0.45, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(`hsl(${hue}, 100%, 80%)`),
    transparent: true, opacity: 0.55,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = -0.2;
  group.add(glow);
  for (let i = 0; i < 12; i++) {
    const baseAngle = (i / 12) * Math.PI * 2;
    const points = [];
    for (let s = 0; s <= 32; s++) {
      const t = s / 32;
      points.push(new THREE.Vector3(
        Math.cos(baseAngle + Math.sin(t * 3) * 0.3) * (0.7 - t * 0.45),
        -t * 3.0,
        Math.sin(baseAngle + Math.sin(t * 3) * 0.3) * (0.7 - t * 0.45)
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.022, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
      emissive: new THREE.Color(`hsl(${hue}, 90%, 55%)`),
      emissiveIntensity: 0.35, transparent: true, opacity: 0.55,
      roughness: 0.4, metalness: 0.0,
    });
    group.add(new THREE.Mesh(tubeGeo, tubeMat));
  }
  group.userData = { isProcedural: true, hue, phase: Math.random() * Math.PI * 2, basePos: new THREE.Vector3() };
  return group;
}

function buildFallbackJellyfish() {
  const total = CONFIG.jellyfishCount;
  const jellyData = [];
  for (let i = 0; i < total; i++) {
    const j = buildProceduralJellyfish();
    let scale, position;
    if (i === 0) {
      scale = CONFIG.heroJellyfishSize;
      position = new THREE.Vector3(2, 1.5, 12);
      j.userData.isHero = true;
    } else {
      scale = 1.2 + Math.random() * 1.0;
      position = new THREE.Vector3(
        (Math.random() - 0.5) * 30, 4 - i * 4, (Math.random() - 0.5) * 20 - 5
      );
    }
    j.scale.setScalar(scale);
    j.position.copy(position);
    j.userData.basePos.copy(j.position);
    jellyfishGroup.add(j);
    jellyData.push({ mesh: j, center: position.clone(), scale, phase: j.userData.phase });
  }
  jellyfishGroup.userData.jellyData = jellyData;
  jellyfishGroup.userData.loaded = true;
  console.log('[underwater-ai] Using procedural jellyfish (GLB unavailable)');
}

lazyLoad(() => {
jellyLoader.load(
  'assets/3d/jellyfish-v2.glb',
  (gltf) => {
    jellyfishModel = gltf.scene;
    jellyfishModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        // Make the jellyfish glow — add emissive to all materials
        if (child.material) {
          child.material = child.material.clone();
          child.material.emissive = new THREE.Color(0x00b4d8);
          child.material.emissiveIntensity = 0.35;
          child.material.transparent = true;
          child.material.opacity = 0.8;
          child.material.side = THREE.DoubleSide;
        }
      }
    });
    // Scale to a reasonable base size
    const box = new THREE.Box3().setFromObject(jellyfishModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const targetSize = 1.5;
    const s = targetSize / maxDim;
    jellyfishModel.scale.setScalar(s);

    const total = CONFIG.jellyfishCount;
    const jellyData = [];
    for (let i = 0; i < total; i++) {
      const clone = jellyfishModel.clone(true);
      clone.traverse((c) => {
        if (c.isMesh && c.material) c.material = c.material.clone();
      });
      let scale, position;
      if (i === 0) {
        scale = CONFIG.heroJellyfishSize;
        position = new THREE.Vector3(2, 1.5, 12);
        clone.userData.isHero = true;
      } else {
        scale = 1.2 + Math.random() * 1.0;
        position = new THREE.Vector3(
          (Math.random() - 0.5) * 30, 4 - i * 4, (Math.random() - 0.5) * 20 - 5
        );
      }
      clone.scale.setScalar(scale);
      clone.position.copy(position);
      const data = {
        mesh: clone,
        center: position.clone(),
        scale,
        phase: Math.random() * Math.PI * 2,
      };
      jellyData.push(data);
      jellyfishGroup.add(clone);
    }
    jellyfishGroup.userData.jellyData = jellyData;
    jellyfishGroup.userData.loaded = true;
    console.log('[underwater-ai] Jellyfish GLB loaded —', total, 'instances');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('jellyfish');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Jellyfish GLB failed — using procedural fallback', err);
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('jellyfish');
    buildFallbackJellyfish();
  }
);
}); // end lazyLoad jellyfish

// ---------------------------------------------------------------------------
// 9. FISH — load the real BarramundiFish.glb and instance it
// ---------------------------------------------------------------------------
const fishGroup = new THREE.Group();
fishGroup.userData = { fishData: [], loaded: false };
scene.add(fishGroup);

const fishLoader = new GLTFLoader();
fishLoader.setDRACOLoader(dracoLoader);
let fishModel = null;
let fishAnimTime = 0;

lazyLoad(() => {
fishLoader.load(
  'assets/3d/fish-school.glb',
  (gltf) => {
    fishModel = gltf.scene;
    // Ensure materials cast shadows and are properly lit
    fishModel.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = false;
        if (child.material) child.material.fog = true;
      }
    });
    // Scale tuna to a reasonable school-fish size
    const targetSize = 1.0;
    const box = new THREE.Box3().setFromObject(fishModel);
    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const s = targetSize / maxDim;
    fishModel.scale.setScalar(s);

    // Build a per-fish data array — we'll render a clone per fish, but
    // limit total fish count for performance
    const dummy = new THREE.Object3D();
    const totalFish = CONFIG.fishCount;
    const fishData = [];
    for (let i = 0; i < totalFish; i++) {
      const f = {
        center: new THREE.Vector3(
          (Math.random() - 0.5) * 40,
          (Math.random() - 0.5) * 14 - 2,
          (Math.random() - 0.5) * 30 - 10
        ),
        radius: 4 + Math.random() * 8,
        speed: 0.15 + Math.random() * 0.25,
        offset: Math.random() * Math.PI * 2,
        bobAmp: 0.4 + Math.random() * 0.6,
        tilt: (Math.random() - 0.5) * 0.2,
        scale: 0.7 + Math.random() * 0.7,
        wagPhase: Math.random() * Math.PI * 2,
        wagSpeed: 2.0 + Math.random() * 2.0,
      };
      fishData.push(f);
      const clone = fishModel.clone(true);
      // Each clone gets its own material instance so it can have a tint
      clone.traverse((c) => {
        if (c.isMesh && c.material) {
          c.material = c.material.clone();
        }
      });
      clone.position.copy(f.center);
      clone.scale.setScalar(f.scale);
      fishGroup.add(clone);
      f.mesh = clone;
    }
    fishGroup.userData.fishData = fishData;
    fishGroup.userData.loaded = true;
    console.log('[underwater-ai] Fish model loaded —', totalFish, 'instances');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('fish');
  },
  (progress) => {
    const pct = (progress.loaded / progress.total) * 100;
    if (Math.random() < 0.1) console.log(`[fish] ${pct.toFixed(0)}%`);
  },
  (err) => {
    console.warn('[underwater-ai] Fish model failed to load — falling back to procedural fish', err);
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('fish');
    buildFallbackFish();
  }
);
}); // end lazyLoad fish

function buildFallbackFish() {
  // Tiny procedural fallback (used only if GLB load fails)
  const total = CONFIG.fishCount;
  const fishData = [];
  for (let i = 0; i < total; i++) {
    const f = {
      center: new THREE.Vector3(
        (Math.random() - 0.5) * 40,
        (Math.random() - 0.5) * 14 - 2,
        (Math.random() - 0.5) * 30 - 10
      ),
      radius: 4 + Math.random() * 8,
      speed: 0.15 + Math.random() * 0.25,
      offset: Math.random() * Math.PI * 2,
      bobAmp: 0.4 + Math.random() * 0.6,
      tilt: (Math.random() - 0.5) * 0.2,
      scale: 0.6 + Math.random() * 0.6,
      wagPhase: Math.random() * Math.PI * 2,
      wagSpeed: 3.0 + Math.random() * 2.0,
      mesh: new THREE.Group(),
    };
    const body = new THREE.ConeGeometry(0.18, 0.7, 6);
    body.rotateZ(-Math.PI / 2);
    const bodyMesh = new THREE.Mesh(body, new THREE.MeshStandardMaterial({
      color: 0x66ccee, emissive: 0x114466, emissiveIntensity: 0.4,
    }));
    f.mesh.add(bodyMesh);
    f.mesh.position.copy(f.center);
    f.mesh.scale.setScalar(f.scale);
    fishGroup.add(f.mesh);
    fishData.push(f);
  }
  fishGroup.userData.fishData = fishData;
  fishGroup.userData.loaded = true;
}

// ---------------------------------------------------------------------------
// 9b. SEA TURTLE — slow graceful glide (2 instances, foreground mid-water)
// ---------------------------------------------------------------------------
const turtleGroup = new THREE.Group();
turtleGroup.userData = { data: [], loaded: false };
scene.add(turtleGroup);

const turtleLoader = new GLTFLoader();
turtleLoader.setDRACOLoader(dracoLoader);

lazyLoad(() => {
turtleLoader.load(
  'assets/3d/sea-turtle.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.castShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = 1.4 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(s);

    const data = [];
    for (let i = 0; i < 2; i++) {
      const clone = model.clone(true);
      clone.traverse((c) => { if (c.isMesh && c.material) c.material = c.material.clone(); });
      const d = {
        mesh: clone,
        center: new THREE.Vector3(i === 0 ? -6 : 10, -2 - i * 2, -4 - i * 3),
        radius: 6 + i * 3,
        speed: 0.06 + i * 0.02,
        offset: Math.random() * Math.PI * 2,
        bobAmp: 0.8,
        flapPhase: Math.random() * Math.PI * 2,
        scale: 1.0 - i * 0.25,
      };
      clone.position.copy(d.center);
      clone.scale.setScalar(d.scale);
      turtleGroup.add(clone);
      data.push(d);
    }
    turtleGroup.userData.data = data;
    turtleGroup.userData.loaded = true;
    console.log('[underwater-ai] Sea turtle loaded — 2 instances');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('sea turtle');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Sea turtle GLB failed — skipping', err.message);
    turtleGroup.userData.loaded = true; // mark loaded so we don't block; just skip rendering
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('sea turtle');
  }
);
}); // end lazyLoad turtle

// ---------------------------------------------------------------------------
// 9c. MANTA RAY — one large majestic glider in deep water
// ---------------------------------------------------------------------------
const mantaGroup = new THREE.Group();
mantaGroup.userData = { data: null, loaded: false };
scene.add(mantaGroup);

const mantaLoader = new GLTFLoader();
mantaLoader.setDRACOLoader(dracoLoader);

lazyLoad(() => {
mantaLoader.load(
  'assets/3d/manta-ray.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.castShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = 3.2 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(s);

    const d = {
      mesh: model,
      center: new THREE.Vector3(0, -6, -8),
      radiusX: 14,
      radiusZ: 9,
      speed: 0.045,
      offset: Math.random() * Math.PI * 2,
      rollAmp: 0.18,
    };
    model.position.copy(d.center);
    mantaGroup.add(model);
    mantaGroup.userData.data = d;
    mantaGroup.userData.loaded = true;
    console.log('[underwater-ai] Manta ray loaded');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('manta ray');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Manta ray GLB failed — skipping', err.message);
    mantaGroup.userData.loaded = true;
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('manta ray');
  }
);
}); // end lazyLoad manta

// ---------------------------------------------------------------------------
// 9d. SUBMARINE — distant threat silhouette drifting across the abyss
// ---------------------------------------------------------------------------
const subGroup = new THREE.Group();
subGroup.userData = { data: null, loaded: false };
scene.add(subGroup);

const subLoader = new GLTFLoader();
subLoader.setDRACOLoader(dracoLoader);

lazyLoad(() => {
subLoader.load(
  'assets/3d/submarine.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        // Darken for silhouette effect
        if (c.material.color) c.material.color.multiplyScalar(0.35);
        c.castShadow = false;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const s = 7.0 / Math.max(size.x, size.y, size.z);
    model.scale.setScalar(s);

    const d = {
      mesh: model,
      startX: -38,
      endX: 38,
      y: -9,
      z: -22,
      speed: 0.012,   // very slow crossing
      t: 0,
    };
    model.position.set(d.startX, d.y, d.z);
    subGroup.add(model);
    subGroup.userData.data = d;
    subGroup.userData.loaded = true;
    console.log('[underwater-ai] Submarine loaded');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('submarine');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Submarine GLB failed — skipping', err.message);
    subGroup.userData.loaded = true;
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('submarine');
  }
);
}); // end lazyLoad submarine

// ---------------------------------------------------------------------------
// 10. BUBBLES — MeshPhysicalMaterial with transmission (real glass)
// ---------------------------------------------------------------------------
function buildBubbles() {
  const geo = new THREE.SphereGeometry(1, 20, 14);
  // Glass-like bubble: high transmission needs the special render-target
  // path in three.js. For broad compatibility we use PhysicalMaterial
  // WITHOUT transmission (still get clearcoat + envMap for the glass look)
  // and add a soft opacity falloff for a believable bubble.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.42,
    roughness: 0.02,
    metalness: 0.1,
    envMapIntensity: 1.4,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, CONFIG.bubbleCount);
  const dummy = new THREE.Object3D();
  const data = [];
  for (let i = 0; i < CONFIG.bubbleCount; i++) {
    const b = {
      x: (Math.random() - 0.5) * 40,
      y: (Math.random() - 0.5) * 26 + 2,
      z: (Math.random() - 0.5) * 30 - 8,
      r: 0.06 + Math.random() * 0.30,
      speed: 0.6 + Math.random() * 1.2,
      wobble: Math.random() * Math.PI * 2,
    };
    data.push(b);
    dummy.position.set(b.x, b.y, b.z);
    dummy.scale.setScalar(b.r);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, data, dummy };
}
const bubbles = buildBubbles();
scene.add(bubbles.mesh);

// ---------------------------------------------------------------------------
// 11. KELP — load real GLB model, with procedural fallback
// ---------------------------------------------------------------------------
const kelpGroup = new THREE.Group();
kelpGroup.userData = { items: [], loaded: false };
scene.add(kelpGroup);

const kelpLoader = new GLTFLoader();
kelpLoader.setDRACOLoader(dracoLoader);

function buildFallbackKelp() {
  const items = [];
  for (let i = 0; i < CONFIG.kelpCount; i++) {
    const height = 5 + Math.random() * 6;
    const width = 0.6 + Math.random() * 0.4;
    const geo = new THREE.PlaneGeometry(width, height, 1, 24);
    geo.translate(0, height / 2, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false,
      uniforms: {
        uTime: { value: 0 }, uPhase: { value: Math.random() * Math.PI * 2 },
        uBaseColor: { value: new THREE.Color(0x0d4a3a) },
        uTipColor: { value: new THREE.Color(0x2dd4bf) },
        uBend: { value: 0.3 + Math.random() * 0.4 },
        uHeight: { value: height },
        uFogColor: { value: new THREE.Color(0x002438) }, uFogFar: { value: 70 },
      },
      vertexShader: `
        uniform float uTime, uPhase, uBend, uHeight;
        varying float vY; varying vec3 vWorldNormal, vWorldPos; varying float vDist;
        void main() {
          vec3 p = position;
          float t = (p.y + uHeight * 0.5) / uHeight;
          p.x += sin(uTime * 0.6 + uPhase + t * 4.0) * uBend * t;
          p.z += cos(uTime * 0.4 + uPhase * 0.7 + t * 2.0) * uBend * 0.6 * t;
          vY = t; vWorldNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(p, 1.0); vWorldPos = wp.xyz;
          vDist = length(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform vec3 uBaseColor, uTipColor, uFogColor; uniform float uFogFar;
        varying float vY; varying vec3 vWorldNormal; varying float vDist;
        void main() {
          float facing = abs(vWorldNormal.z);
          vec3 col = mix(uBaseColor, uTipColor, vY) * (0.5 + 0.5 * facing);
          float fogFactor = 1.0 - exp(-pow(vDist / uFogFar, 2.0) * 1.5);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.92);
        }`,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 60, -10, (Math.random() - 0.5) * 30 - 10);
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.userData = { mat, isProcedural: true, phase: Math.random() * Math.PI * 2 };
    kelpGroup.add(mesh);
    items.push(mesh);
  }
  kelpGroup.userData.items = items;
  kelpGroup.userData.loaded = true;
  console.log('[underwater-ai] Using procedural kelp');
}

lazyLoad(() => {
kelpLoader.load(
  'assets/3d/kelp.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.side = THREE.DoubleSide;
        child.material.transparent = true;
        child.material.opacity = 0.9;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetH = 6;
    const s = targetH / Math.max(size.y, 0.1);
    model.scale.setScalar(s);

    const items = [];
    for (let i = 0; i < CONFIG.kelpCount; i++) {
      const clone = model.clone(true);
      clone.traverse((c) => { if (c.isMesh && c.material) c.material = c.material.clone(); });
      clone.position.set(
        (Math.random() - 0.5) * 60, -10, (Math.random() - 0.5) * 30 - 10
      );
      clone.rotation.y = Math.random() * Math.PI;
      clone.userData = { phase: Math.random() * Math.PI * 2, isProcedural: false };
      kelpGroup.add(clone);
      items.push(clone);
    }
    kelpGroup.userData.items = items;
    kelpGroup.userData.loaded = true;
    console.log('[underwater-ai] Kelp GLB loaded —', CONFIG.kelpCount, 'instances');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('kelp');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Kelp GLB failed — using procedural fallback', err);
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('kelp');
    buildFallbackKelp();
  }
);
}); // end lazyLoad kelp

// ---------------------------------------------------------------------------
// 12. SEAFLOOR — load real GLB model, with procedural fallback
// ---------------------------------------------------------------------------
const seafloorGroup = new THREE.Group();
scene.add(seafloorGroup);

const seafloorLoader = new GLTFLoader();
seafloorLoader.setDRACOLoader(dracoLoader);

function buildFallbackSeafloor() {
  const geo = new THREE.PlaneGeometry(160, 120, 80, 50);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = (Math.sin(x * 0.15) * 0.4 + Math.cos(z * 0.13) * 0.3 + Math.sin(x * 0.04 + z * 0.04) * 0.7);
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0xc8a878, emissive: 0x223344, emissiveIntensity: 0.05, roughness: 0.85, metalness: 0.0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -12;
  seafloorGroup.add(mesh);
  console.log('[underwater-ai] Using procedural seafloor');
}

lazyLoad(() => {
seafloorLoader.load(
  'assets/3d/seafloor-v2.glb',
  (gltf) => {
    const model = gltf.scene;
    // Apply uniform material treatment so it blends with the scene fog + lighting
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        // Kill over-bright emissive — let scene lighting do the work
        if (child.material.emissive) {
          child.material.emissive = new THREE.Color(0x0a1628);
          child.material.emissiveIntensity = 0.12;
        }
        // Sand-tinted, high roughness for believable underwater floor
        if (child.material.color) {
          child.material.color.multiplyScalar(0.85);
        }
        child.material.roughness = 0.92;
        child.material.metalness = 0.02;
        child.receiveShadow = true;
        child.castShadow = false;
      }
    });
    // Proper centering + scale — fill a wide area without vertical stretching
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const center = new THREE.Vector3();
    box.getCenter(center);
    // Center at origin in X/Z, keep Y position tight to seafloor plane
    model.position.x = -center.x;
    model.position.z = -center.z;
    // Uniform scaling — use the larger horizontal dimension, cap it
    const targetHoriz = 90;   // 90 square units of floor coverage
    const sH = targetHoriz / Math.max(size.x, size.z, 0.01);
    model.scale.setScalar(sH);
    // Clamp vertical scale so bumps don't spike into camera
    model.scale.y = Math.min(model.scale.y * 0.8, 3);
    // Position at the seafloor level
    model.position.y = -13;
    seafloorGroup.add(model);
    console.log('[underwater-ai] Seafloor GLB loaded (centered, fog-blended)');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('seafloor');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Seafloor GLB failed — using procedural fallback', err);
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('seafloor');
    buildFallbackSeafloor();
  }
);
}); // end lazyLoad seafloor

// Animated caustics projected on sand (separate transparent plane)
const causticMat = new THREE.MeshBasicMaterial({
  map: causticTex,
  transparent: true,
  opacity: 0.30,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  side: THREE.DoubleSide,
});
const causticGeo = new THREE.PlaneGeometry(140, 100);
causticGeo.rotateX(-Math.PI / 2);
const causticMesh = new THREE.Mesh(causticGeo, causticMat);
causticMesh.position.y = -11.7;
scene.add(causticMesh);

// ---------------------------------------------------------------------------
// 13. CORAL — load real GLB model, with procedural fallback
// ---------------------------------------------------------------------------
const coralGroup = new THREE.Group();
coralGroup.userData = { items: [], loaded: false };
scene.add(coralGroup);

const coralLoader = new GLTFLoader();
coralLoader.setDRACOLoader(dracoLoader);

function buildFallbackCoral() {
  const palette = [0xff5577, 0x8844cc, 0xff9944, 0x44aaff, 0xff66aa, 0x66ddaa, 0xffaa33, 0xaa55ff];
  for (let i = 0; i < CONFIG.coralCount; i++) {
    const h = 0.8 + Math.random() * 1.8;
    const segs = 5 + Math.floor(Math.random() * 4);
    const geo = new THREE.ConeGeometry(0.5 + Math.random() * 0.4, h, segs, 3);
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      if (y < h / 2 - 0.1) {
        pos.setX(v, pos.getX(v) + (Math.random() - 0.5) * 0.2);
        pos.setZ(v, pos.getZ(v) + (Math.random() - 0.5) * 0.2);
        if (Math.random() < 0.4) pos.setY(v, pos.getY(v) + (Math.random() - 0.5) * 0.1);
      }
    }
    geo.computeVertexNormals();
    const col = palette[Math.floor(Math.random() * palette.length)];
    const mat = new THREE.MeshStandardMaterial({
      color: col, emissive: col, emissiveIntensity: 0.20,
      roughness: 0.55, metalness: 0.0, flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set((Math.random() - 0.5) * 50, -11.5 + h / 2, (Math.random() - 0.5) * 25 - 8);
    mesh.scale.setScalar(0.8 + Math.random() * 0.6);
    mesh.rotation.y = Math.random() * Math.PI;
    coralGroup.add(mesh);
    coralGroup.userData.items.push(mesh);
  }
  coralGroup.userData.loaded = true;
  console.log('[underwater-ai] Using procedural coral');
}

lazyLoad(() => {
coralLoader.load(
  'assets/3d/coral.glb',
  (gltf) => {
    const model = gltf.scene;
    model.traverse((child) => {
      if (child.isMesh && child.material) {
        child.material = child.material.clone();
        child.material.emissive = child.material.color.clone();
        child.material.emissiveIntensity = 0.15;
      }
    });
    const box = new THREE.Box3().setFromObject(model);
    const size = new THREE.Vector3();
    box.getSize(size);
    const targetSize = 1.5;
    const s = targetSize / Math.max(Math.max(size.x, size.y, size.z), 0.1);
    model.scale.setScalar(s);

    const items = [];
    for (let i = 0; i < CONFIG.coralCount; i++) {
      const clone = model.clone(true);
      clone.traverse((c) => { if (c.isMesh && c.material) c.material = c.material.clone(); });
      // Randomize color tint per instance
      const hue = Math.random() * 360;
      clone.traverse((c) => {
        if (c.isMesh && c.material && c.material.color) {
          const col = new THREE.Color().setHSL(hue / 360, 0.7, 0.5);
          c.material.color.copy(col);
          c.material.emissive.copy(col);
        }
      });
      clone.position.set(
        (Math.random() - 0.5) * 50,
        -11.5,
        (Math.random() - 0.5) * 25 - 8
      );
      clone.rotation.y = Math.random() * Math.PI;
      clone.scale.setScalar(0.8 + Math.random() * 0.6);
      coralGroup.add(clone);
      items.push(clone);
    }
    coralGroup.userData.items = items;
    coralGroup.userData.loaded = true;
    console.log('[underwater-ai] Coral GLB loaded —', CONFIG.coralCount, 'instances');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('coral');
  },
  undefined,
  (err) => {
    console.warn('[underwater-ai] Coral GLB failed — using procedural fallback', err);
    console.log('CORAL TRACE');
    if (window.UnderwaterModelLoader) window.UnderwaterModelLoader.report('coral');
    buildFallbackCoral();
  }
);
}); // end lazyLoad coral

// ---------------------------------------------------------------------------
// 14. MARINE SNOW — drifting particles
// ---------------------------------------------------------------------------
function buildMarineSnow() {
  const count = CONFIG.particleCount;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 60;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 40 - 5;
    sizes[i] = 0.05 + Math.random() * 0.12;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      uniform float uTime;
      varying float vSize;
      void main() {
        vec3 p = position;
        p.y -= mod(uTime * 0.4 + position.x * 0.1, 30.0) - 15.0;
        p.x += sin(uTime * 0.3 + position.z) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * 50.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
        vSize = size;
      }
    `,
    fragmentShader: `
      varying float vSize;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = 0.45 * (1.0 - d * 2.0);
        gl_FragColor = vec4(0.7, 0.85, 1.0, a);
      }
    `,
  });
  return new THREE.Points(geo, mat);
}
const marineSnow = buildMarineSnow();
scene.add(marineSnow);

// ---------------------------------------------------------------------------
// 14b. BIOLUMINESCENT PLANKTON — bright glowing particles (the "wow" factor)
// ---------------------------------------------------------------------------
function buildBioluminescentPlankton() {
  const count = CONFIG.isMobile ? 50 : 90;
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 50;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30 - 5;
    sizes[i] = 0.15 + Math.random() * 0.30;
    phases[i] = Math.random() * Math.PI * 2;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      attribute float size;
      attribute float phase;
      uniform float uTime;
      varying float vGlow;
      void main() {
        vec3 p = position;
        p.y -= mod(uTime * 0.3 + position.x * 0.05, 30.0) - 15.0;
        p.x += sin(uTime * 0.4 + phase) * 0.4;
        p.z += cos(uTime * 0.3 + phase * 1.3) * 0.3;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = size * 80.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
        vGlow = 0.5 + 0.5 * sin(uTime * 2.0 + phase * 3.0);
      }
    `,
    fragmentShader: `
      varying float vGlow;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c);
        if (d > 0.5) discard;
        float a = (1.0 - d * 2.0) * (0.4 + 0.6 * vGlow);
        // Bioluminescent color: cyan-green glow
        gl_FragColor = vec4(0.4, 1.0, 0.9, a);
      }
    `,
  });
  return new THREE.Points(geo, mat);
}
const plankton = buildBioluminescentPlankton();
scene.add(plankton);

// ---------------------------------------------------------------------------
// 14c. DATA STREAMS — vertical flowing particles (representing AI data flow)
// ---------------------------------------------------------------------------
function buildDataStreams() {
  const group = new THREE.Group();
  const streamCount = CONFIG.dataStreamCount;
  for (let i = 0; i < streamCount; i++) {
    const x = (Math.random() - 0.5) * 40;
    const y = (Math.random() - 0.5) * 20;
    const z = (Math.random() - 0.5) * 25 - 5;
    const count = 30;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    for (let j = 0; j < count; j++) {
      positions[j * 3 + 0] = x + (Math.random() - 0.5) * 0.4;
      positions[j * 3 + 1] = y - j * 0.6;  // vertical stream
      positions[j * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      phases[j] = j * 0.1;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x00ffd5) } },
      vertexShader: `
        attribute float phase;
        uniform float uTime;
        varying float vGlow;
        void main() {
          vec3 p = position;
          // Animate upward
          float yOffset = mod(uTime * 2.0 + phase, 18.0) - 9.0;
          p.y += yOffset;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 4.0 / -mv.z * 30.0;
          gl_Position = projectionMatrix * mv;
          vGlow = sin(yOffset * 0.5) * 0.5 + 0.5;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        varying float vGlow;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          if (d > 0.5) discard;
          float a = (1.0 - d * 2.0) * vGlow * 0.6;
          gl_FragColor = vec4(uColor, a);
        }
      `,
    });
    const points = new THREE.Points(geo, mat);
    points.userData = { mat };
    group.add(points);
  }
  return group;
}
const dataStreams = buildDataStreams();
scene.add(dataStreams);

// ---------------------------------------------------------------------------
// 15. SCROLL-DRIVEN CAMERA — dramatic cinematic spline system
//    • CatmullRom splines for position & lookAt (continuous, buttery motion)
//    • Banking roll in turns  • Velocity-driven FOV  • Section snap-zooms
// ---------------------------------------------------------------------------

// Cinematic path — verified against actual scene bounds & creature positions
const cameraSplinePoints = [
  // [x, y, z] — scroll progress is uniform along the spline
  [  0,   7,  33 ],  // 0.00  HERO — above surface, wide open
  [  7,   4,  27 ],  // 0.09  dive begins, swoop right
  [ -8,   1,  23 ],  // 0.18  hard left bank through bubble fields
  [  6,  -1,  19 ],  // 0.27  snap back right, kelp forest approach
  [ -9,  -3,  24 ],  // 0.36  deep swing left, god rays in frame
  [  8,  -5,  21 ],  // 0.45  push right through fish school
  [ -6,  -7,  19 ],  // 0.54  turtle territory
  [  4,  -9,  22 ],  // 0.63  manta ray sweep
  [  0, -11,  17 ],  // 0.72  seafloor approach, dramatic low angle
  [ -7, -10,  23 ],  // 0.81  coral garden glide
  [  8,  -6,  26 ],  // 0.88  ascent begins, wide arc
  [  0,   5,  31 ],  // 1.00  surface, home again
];
const lookSplinePoints = [
  [  0,  3,   0 ],
  [ -2,  2,  -3 ],
  [  3,  0,  -6 ],
  [ -3, -2,  -8 ],
  [  2, -4, -10 ],
  [ -4, -6,  -6 ],
  [  5, -8,  -5 ],
  [ -3, -10, -7 ],
  [  3, -12,  -4 ],
  [  0, -11,   3 ],  // look back at coral
  [ -4,  -4,  -2 ],
  [  0,   2,   0 ],  // settle at origin
];

const camPath = new THREE.CatmullRomCurve3(
  cameraSplinePoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false, 'centripetal', 0.5
);
const lookPath = new THREE.CatmullRomCurve3(
  lookSplinePoints.map(([x, y, z]) => new THREE.Vector3(x, y, z)),
  false, 'centripetal', 0.5
);

// Hoisted allocations — zero garbage per frame
const _camPos   = new THREE.Vector3();
const _camTarget = new THREE.Vector3(); // fresh per-frame camera target (no aliasing)
const _lookPos  = new THREE.Vector3();
const _nextPos  = new THREE.Vector3();   // sample slightly ahead for banking
const _sideVec  = new THREE.Vector3();   // normalized strafe direction
const _upVec    = new THREE.Vector3();   // up vector for roll
const _fwdVec   = new THREE.Vector3();

// Camera state
let cameraRoll = 0;
let currentFov = camera.fov;
let prevScrollP = 0;
let scrollVel = 0;

function updateCamera(scrollP, dt, elapsed) {
  
  // Smooth velocity tracking
  scrollVel += ((scrollP - prevScrollP) / Math.max(dt, 0.001) - scrollVel) * 0.06;
  prevScrollP = scrollP;

  // Snap zoom: brief FOV push at section boundaries (every 11% of scroll)
  const sectionPhase = (scrollP * 9) % 1;
  const snapZoom = Math.exp(-Math.pow((sectionPhase - 0.02) * 14, 2)) * 4;
  const targetFov = 55 + Math.abs(scrollVel) * 8 + snapZoom;
  currentFov += (targetFov - currentFov) * 0.05;
  if (Math.abs(currentFov - camera.fov) > 0.05) {
    camera.fov = currentFov;
    camera.updateProjectionMatrix();
  }

  // Sample the position spline — use getPoint (not getPointAt) for guaranteed interpolation
  const pt = camPath.getPoint(scrollP);
  _camTarget.copy(pt);

  // DEBUG: log once

  // Underwater micro-drift — gentle organic bob, always present
  if (!prefersReducedMotion) {
    _camTarget.x += Math.sin(elapsed * 0.4) * 0.18;
    _camTarget.y += Math.sin(elapsed * 0.55) * 0.11;
    _camTarget.z += Math.cos(elapsed * 0.45) * 0.14;
  }
  camera.position.copy(_camTarget);

  // Sample look-at target
  const lpt = lookPath.getPoint(scrollP);
  _lookPos.copy(lpt);

  // Gentle mouse parallax — subtle, never fights the spline
  if (!prefersReducedMotion) {
    const depthScale = 0.3 + (1 - scrollP) * 0.5;
    camera.position.x += Scene.mouse.x * 0.7 * depthScale;
    camera.position.y += Scene.mouse.y * 0.4 * depthScale;
  }

  camera.lookAt(_lookPos);

  // Sample ahead for banking computation
  const aheadPt = camPath.getPoint(Math.min(scrollP + 0.015, 1));
  _nextPos.copy(aheadPt);
  _sideVec.subVectors(_nextPos, _camTarget).normalize();
  _upVec.set(0, 1, 0);
  _sideVec.cross(_upVec).normalize();

  // Bank into turns
  const lateralVel = _sideVec.dot(_fwdVec.subVectors(_nextPos, _camTarget).normalize());
  const targetRoll = -lateralVel * 1.4 + scrollVel * 0.02;
  cameraRoll += (targetRoll - cameraRoll) * 0.08;
  camera.rotation.z += cameraRoll;
}

// ---------------------------------------------------------------------------
// 16. ANIMATION LOOP
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
const dummy = new THREE.Object3D();
const frustum = new THREE.Frustum();
const projView = new THREE.Matrix4();

// Frustum check: is this object's center inside the camera's view?
function isVisible(obj) {
  projView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  frustum.setFromProjectionMatrix(projView);
  const sphere = new THREE.Sphere(new THREE.Vector3().setFromMatrixPosition(obj.matrixWorld), 2);
  return frustum.intersectsSphere(sphere);
}

function animate() {
  requestAnimationFrame(animate);
  if (document.hidden) return;
  monitorFps();
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  fishAnimTime += dt;

  // Smooth mouse lerp
  Scene.mouse.x += (Scene.mouse.tx - Scene.mouse.x) * 0.06;
  Scene.mouse.y += (Scene.mouse.ty - Scene.mouse.y) * 0.06;

  // Camera — spline-driven cinematic path
  updateCamera(Scene.scrollProgress, dt, elapsed);

  // Atmosphere: exposure based on scroll velocity
  const scrollVelAbs = Math.abs(scrollVel);
  renderer.toneMappingExposure += (0.95 + scrollVelAbs * 0.3 - renderer.toneMappingExposure) * 0.08;
  scrollVel *= 0.92;

  // Update water uniform with current camera position (for fresnel)
  camera.getWorldPosition(_camPos);
  waterMat.uniforms.uCameraPos.value.copy(_camPos);
  waterMat.uniforms.uTime.value = elapsed;

  // God rays: subtle drift
  godRays.forEach((r, idx) => {
    r.userData.mat.uniforms.uTime.value = elapsed;
    r.position.x = r.userData.baseX + Math.sin(elapsed * 0.1 + idx) * 0.3;
  });

  // Jellyfish: swimming motion + mouse interaction + pulse
  if (jellyfishGroup.userData.loaded) {
    const mx = Scene.mouse.x;
    const my = Scene.mouse.y;
    jellyfishGroup.userData.jellyData.forEach((j, idx) => {
      const m = j.mesh;
      // Swimming: sinusoidal path with depth-dependent speed
      const swimSpeed = j.isHero ? 0.25 : 0.15 + idx * 0.03;
      const swimRadius = j.isHero ? 2.0 : 1.2;
      const swimVertAmp = j.isHero ? 0.8 : 0.4;
      m.position.x = j.center.x + Math.sin(elapsed * swimSpeed + j.phase) * swimRadius;
      m.position.y = j.center.y + Math.sin(elapsed * swimSpeed * 0.7 + j.phase * 0.5) * swimVertAmp;
      m.position.z = j.center.z + Math.cos(elapsed * swimSpeed * 0.5 + j.phase) * 0.6;
      // Mouse repulsion: jellyfish drift away from cursor
      const dx = m.position.x - mx * 15;
      const dy = m.position.y - my * 8;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 8) {
        const push = (8 - dist) / 8 * 1.5;
        m.position.x += (dx / dist) * push;
        m.position.y += (dy / dist) * push;
      }
      // Face direction of movement
      const targetRotY = Math.atan2(
        Math.cos(elapsed * swimSpeed + j.phase) * swimRadius,
        -Math.sin(elapsed * swimSpeed * 0.5 + j.phase) * 0.6
      );
      m.rotation.y += (targetRotY - m.rotation.y) * 0.02;
      // Subtle tilt on movement axis
      m.rotation.z = Math.sin(elapsed * swimSpeed + j.phase) * 0.08;
      m.rotation.x = Math.sin(elapsed * swimSpeed * 0.6 + j.phase + 1) * 0.05;
      // Bell contraction pulse (scale breathing)
      const pulse = 1 + Math.sin(elapsed * 1.8 + j.phase) * 0.08;
      const pulseY = 1 + Math.sin(elapsed * 1.8 + j.phase + 0.5) * 0.05;
      m.scale.set(j.scale * pulse, j.scale * pulseY, j.scale * pulse);
    });
  }

  // Fish — real GLB model animation (circular paths + tail wag)
  if (fishGroup.userData.loaded) {
    fishGroup.userData.fishData.forEach((f, i) => {
      const t = elapsed * f.speed + f.offset;
      const x = f.center.x + Math.cos(t) * f.radius;
      const z = f.center.z + Math.sin(t) * f.radius;
      const y = f.center.y + Math.sin(t * 1.3) * f.bobAmp;
      f.mesh.position.set(x, y, z);

      // Frustum cull: hide + skip anim math for creatures outside camera view
      f.mesh.visible = isVisible(f.mesh);
      if (!f.mesh.visible) return;

      // Face direction of motion
      const tangX = -Math.sin(t) * f.radius * f.speed;
      const tangZ =  Math.cos(t) * f.radius * f.speed;
      f.mesh.rotation.y = Math.atan2(tangX, tangZ);
      // Tail wag — small Y-axis sway (the GLB fish model has the tail in -X direction)
      const wag = Math.sin(elapsed * f.wagSpeed + f.wagPhase) * 0.15;
      f.mesh.rotation.y += wag * 0.3;
      f.mesh.rotation.z = f.tilt + Math.sin(elapsed * f.wagSpeed * 0.5 + f.wagPhase) * 0.08;
    });
  }

  // Sea turtles — slow graceful glides
  if (turtleGroup.userData.loaded && turtleGroup.userData.data.length) {
    turtleGroup.userData.data.forEach((d) => {
      const t = elapsed * d.speed + d.offset;
      d.mesh.position.x = d.center.x + Math.sin(t) * d.radius;
      d.mesh.position.z = d.center.z + Math.cos(t) * d.radius;
      d.mesh.position.y = d.center.y + Math.sin(t * 1.4) * d.bobAmp;
      d.mesh.rotation.y = -t + Math.PI / 2; // face travel direction
      // flipper "flap": gentle roll oscillation
      d.mesh.rotation.z = Math.sin(elapsed * 2.2 + d.flapPhase) * 0.08;
      d.mesh.rotation.x = Math.sin(elapsed * 1.1 + d.flapPhase) * 0.04;
    });
  }

  // Manta ray — majestic elliptical glide with banking
  if (mantaGroup.userData.loaded && mantaGroup.userData.data) {
    const d = mantaGroup.userData.data;
    const t = elapsed * d.speed + d.offset;
    d.mesh.position.x = d.center.x + Math.cos(t) * d.radiusX;
    d.mesh.position.z = d.center.z + Math.sin(t) * d.radiusZ;
    d.mesh.position.y = d.center.y + Math.sin(t * 2.0) * 0.5;
    d.mesh.rotation.y = -t; // face along path
    // banking into turns
    d.mesh.rotation.z = Math.sin(t * 2) * d.rollAmp;
  }

  // Submarine — slow ominous drift across the background, wraps around
  if (subGroup.userData.loaded && subGroup.userData.data) {
    const d = subGroup.userData.data;
    d.t += dt * d.speed * 100;
    const range = d.endX - d.startX;
    const x = d.startX + (d.t % (range + 30)) - 15; // extra off-screen margin
    if (x > d.endX + 15) d.t = 0;
    d.mesh.position.set(x, d.y, d.z);
    d.mesh.rotation.y = Math.PI / 2; // nose pointing travel direction
  }

  // Bubbles — rise, wobble, glass material reflects env
  bubbles.data.forEach((b, i) => {
    b.y += b.speed * dt;
    if (b.y > 14) {
      b.y = -12;
      b.x = (Math.random() - 0.5) * 40;
      b.z = (Math.random() - 0.5) * 30 - 8;
    }
    const wx = b.x + Math.sin(elapsed * 0.8 + b.wobble) * 0.4;
    const wy = b.y;
    const wz = b.z + Math.cos(elapsed * 0.6 + b.wobble) * 0.3;
    dummy.position.set(wx, wy, wz);
    dummy.scale.setScalar(b.r);
    dummy.updateMatrix();
    bubbles.mesh.setMatrixAt(i, dummy.matrix);
  });
  bubbles.mesh.instanceMatrix.needsUpdate = true;

  // Kelp — sway animation
  if (kelpGroup.userData.loaded) {
    kelpGroup.userData.items.forEach((m) => {
      if (m.userData.isProcedural && m.userData.mat) {
        m.userData.mat.uniforms.uTime.value = elapsed;
      } else {
        // GLB kelp: gentle rotation sway
        m.rotation.z = Math.sin(elapsed * 0.4 + (m.userData.phase || 0)) * 0.08;
        m.rotation.x = Math.sin(elapsed * 0.3 + (m.userData.phase || 0) * 0.7) * 0.04;
      }
    });
  }

  // Marine snow + plankton + data streams (throttled — every other frame)
  if (frameCount % 2 === 0) {
    marineSnow.material.uniforms.uTime.value = elapsed;
    plankton.material.uniforms.uTime.value = elapsed;
    dataStreams.children.forEach((p) => {
      p.userData.mat.uniforms.uTime.value = elapsed;
    });
  }

  // Caustics scroll
  causticTex.offset.x = (elapsed * 0.02) % 1;
  causticTex.offset.y = (elapsed * 0.015) % 1;

  renderer.render(scene, camera);
}
animate();
Scene.isReady = true;

// ---------------------------------------------------------------------------
// 17. RESIZE
// ---------------------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(adaptivePixelRatio);
}
window.addEventListener('resize', onResize);

// ---------------------------------------------------------------------------
// 18. MOUSE
// ---------------------------------------------------------------------------
window.addEventListener('mousemove', (e) => {
  const x = (e.clientX / window.innerWidth) * 2 - 1;
  const y = (e.clientY / window.innerHeight) * 2 - 1;
  Scene.setMouse(x, -y);
});
