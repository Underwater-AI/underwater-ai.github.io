/* ============================================================================
   UNDERWATER AI — IMMERSIVE 3D SCENE (v2 — Realistic)
   Photorealistic underwater world using Three.js + GLTFLoader +
   RoomEnvironment for IBL, MeshPhysicalMaterial with transmission
   for glass-like bubbles, a real GLB fish, and a custom water shader
   with skybox reflection + refracted caustics.
   ============================================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
  pixelRatioCap: 2,
  bubbleCount: 60,
  fishCount: 18,
  jellyfishCount: 3,
  kelpCount: 14,
  coralCount: 7,
  particleCount: 220,
  godRayCount: 7,
  fogColor: 0x002438,
  fogNear: 18,
  fogFar: 70,
  cameraStart: { x: 0, y: 4, z: 28 },
  cameraLookStart: { x: 0, y: 0, z: 0 },
};

// Mobile 3D population reduction
if (CONFIG.isMobile) {
  CONFIG.bubbleCount = 32;
  CONFIG.fishCount = 8;
  CONFIG.kelpCount = 8;
  CONFIG.coralCount = 4;
  CONFIG.particleCount = 110;
  CONFIG.godRayCount = 4;
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
  antialias: !CONFIG.isMobile,
  alpha: false,
  powerPreference: 'high-performance',
  stencil: false,
});
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
Scene.renderer = renderer;

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

// ---------------------------------------------------------------------------
// 8. JELLYFISH — improved with translucent transmission
//    Higher poly count, glowing bell, realistic tentacles
// ---------------------------------------------------------------------------
function buildJellyfish() {
  const group = new THREE.Group();
  const hue = 180 + Math.random() * 50;

  // Bell — high-poly half sphere
  const bellGeo = new THREE.SphereGeometry(1, 48, 32, 0, Math.PI * 2, 0, Math.PI / 2);
  // Soften the silhouette by displacing vertices outward a bit
  const pos = bellGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.sqrt(x*x + y*y + z*z);
    // Slightly flatten the bottom
    if (y < 0.3) {
      pos.setX(i, x * 1.08);
      pos.setZ(i, z * 1.08);
    }
  }
  bellGeo.computeVertexNormals();

  const bellMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
    emissive: new THREE.Color(`hsl(${hue}, 90%, 55%)`),
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.6,
    roughness: 0.25,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });
  const bell = new THREE.Mesh(bellGeo, bellMat);
  group.add(bell);

  // Inner bioluminescent core
  const glowGeo = new THREE.SphereGeometry(0.45, 16, 16);
  const glowMat = new THREE.MeshBasicMaterial({
    color: new THREE.Color(`hsl(${hue}, 100%, 80%)`),
    transparent: true,
    opacity: 0.55,
  });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.position.y = -0.2;
  group.add(glow);

  // Tentacles — long flowing curves with high segment count
  const tentacleCount = 12;
  const tentacles = [];
  for (let i = 0; i < tentacleCount; i++) {
    const baseAngle = (i / tentacleCount) * Math.PI * 2;
    const baseR = 0.7;
    const points = [];
    const segs = 32;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const r = baseR - t * 0.45;
      const angle = baseAngle + Math.sin(t * 3) * 0.3;
      points.push(new THREE.Vector3(
        Math.cos(angle) * r,
        -t * 3.0,
        Math.sin(angle) * r
      ));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeo = new THREE.TubeGeometry(curve, 48, 0.022, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(`hsl(${hue}, 80%, 70%)`),
      emissive: new THREE.Color(`hsl(${hue}, 90%, 55%)`),
      emissiveIntensity: 0.35,
      transparent: true,
      opacity: 0.55,
      roughness: 0.4,
      metalness: 0.0,
    });
    const tent = new THREE.Mesh(tubeGeo, tubeMat);
    tent.userData = {
      phase: Math.random() * Math.PI * 2,
      baseAngle,
      points: points.map(p => p.clone()),
      segs,
    };
    group.add(tent);
    tentacles.push(tent);
  }

  group.userData = {
    bell, glow, tentacles, hue,
    phase: Math.random() * Math.PI * 2,
    basePos: new THREE.Vector3(),
  };
  return group;
}
const jellyfish = [];
for (let i = 0; i < CONFIG.jellyfishCount; i++) {
  const j = buildJellyfish();
  const scale = 1.4 + Math.random() * 1.0;
  j.scale.setScalar(scale);
  j.position.set(
    (Math.random() - 0.5) * 30,
    4 - i * 4,
    (Math.random() - 0.5) * 20 - 5
  );
  j.userData.basePos.copy(j.position);
  scene.add(j);
  jellyfish.push(j);
}

// ---------------------------------------------------------------------------
// 9. FISH — load the real BarramundiFish.glb and instance it
// ---------------------------------------------------------------------------
const fishGroup = new THREE.Group();
fishGroup.userData = { fishData: [], loaded: false };
scene.add(fishGroup);

const fishLoader = new GLTFLoader();
let fishModel = null;
let fishAnimTime = 0;

fishLoader.load(
  'assets/3d/BarramundiFish.glb',
  (gltf) => {
    fishModel = gltf.scene;
    // Find the actual fish mesh inside the GLB and prepare a template
    fishModel.traverse((child) => {
      if (child.isMesh) {
        // Ensure the material casts/receives shadows if needed; for now keep default
        child.castShadow = true;
        child.receiveShadow = false;
      }
    });
    // The Khronos BarramundiFish is ~30 units long — scale down
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
  },
  (progress) => {
    const pct = (progress.loaded / progress.total) * 100;
    if (Math.random() < 0.1) console.log(`[fish] ${pct.toFixed(0)}%`);
  },
  (err) => {
    console.warn('[underwater-ai] Fish model failed to load — falling back to procedural fish', err);
    buildFallbackFish();
  }
);

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
// 11. KELP — vertex-shader animated ribbons with PBR material
// ---------------------------------------------------------------------------
function buildKelp() {
  const group = new THREE.Group();
  const items = [];
  for (let i = 0; i < CONFIG.kelpCount; i++) {
    const height = 5 + Math.random() * 6;
    const width = 0.6 + Math.random() * 0.4;
    const geo = new THREE.PlaneGeometry(width, height, 1, 24);
    geo.translate(0, height / 2, 0);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime:      { value: 0 },
        uPhase:     { value: Math.random() * Math.PI * 2 },
        uBaseColor: { value: new THREE.Color(0x0d4a3a) },
        uTipColor:  { value: new THREE.Color(0x2dd4bf) },
        uBend:      { value: 0.3 + Math.random() * 0.4 },
        uHeight:    { value: height },
        uFogColor:  { value: new THREE.Color(0x002438) },
        uFogFar:    { value: 70 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uPhase;
        uniform float uBend;
        uniform float uHeight;
        varying float vY;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying float vDist;
        void main() {
          vec3 p = position;
          float t = (p.y + uHeight * 0.5) / uHeight;
          float wave = sin(uTime * 0.6 + uPhase + t * 4.0) * uBend * t;
          float wave2 = cos(uTime * 0.4 + uPhase * 0.7 + t * 2.0) * uBend * 0.6 * t;
          p.x += wave;
          p.z += wave2;
          vY = t;
          vWorldNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWorldPos = wp.xyz;
          vDist = length(cameraPosition - wp.xyz);
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        uniform vec3 uFogColor;
        uniform float uFogFar;
        varying float vY;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPos;
        varying float vDist;
        void main() {
          float facing = abs(vWorldNormal.z);
          vec3 col = mix(uBaseColor, uTipColor, vY);
          col *= 0.5 + 0.5 * facing;
          // Manual fog
          float fogFactor = 1.0 - exp(-pow(vDist / uFogFar, 2.0) * 1.5);
          col = mix(col, uFogColor, clamp(fogFactor, 0.0, 1.0));
          gl_FragColor = vec4(col, 0.92);
        }
      `,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 60,
      -10,
      (Math.random() - 0.5) * 30 - 10
    );
    mesh.rotation.y = Math.random() * Math.PI;
    mesh.userData = { mat };
    group.add(mesh);
    items.push(mesh);
  }
  group.userData = { items };
  return group;
}
const kelp = buildKelp();
scene.add(kelp);

// ---------------------------------------------------------------------------
// 12. SAND FLOOR — displaced plane with PBR material + caustics
// ---------------------------------------------------------------------------
function buildSandFloor() {
  const geo = new THREE.PlaneGeometry(160, 120, 80, 50);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const y = (Math.sin(x * 0.15) * 0.4 +
               Math.cos(z * 0.13) * 0.3 +
               Math.sin(x * 0.04 + z * 0.04) * 0.7);
    pos.setY(i, y);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc8a878,
    emissive: 0x223344,
    emissiveIntensity: 0.05,
    roughness: 0.85,
    metalness: 0.0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -12;
  return mesh;
}
const sand = buildSandFloor();
scene.add(sand);

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
// 13. CORAL — high-detail organic shapes with proper PBR
// ---------------------------------------------------------------------------
function buildCoral() {
  const items = [];
  const palette = [
    0xff5577, 0x8844cc, 0xff9944, 0x44aaff,
    0xff66aa, 0x66ddaa, 0xffaa33, 0xaa55ff,
  ];
  for (let i = 0; i < CONFIG.coralCount; i++) {
    const h = 0.8 + Math.random() * 1.8;
    const segs = 5 + Math.floor(Math.random() * 4);
    const geo = new THREE.ConeGeometry(0.5 + Math.random() * 0.4, h, segs, 3);
    // Vertex jitter
    const pos = geo.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const y = pos.getY(v);
      if (y < h / 2 - 0.1) {
        pos.setX(v, pos.getX(v) + (Math.random() - 0.5) * 0.2);
        pos.setZ(v, pos.getZ(v) + (Math.random() - 0.5) * 0.2);
        if (Math.random() < 0.4) {
          pos.setY(v, pos.getY(v) + (Math.random() - 0.5) * 0.1);
        }
      }
    }
    geo.computeVertexNormals();
    const col = palette[Math.floor(Math.random() * palette.length)];
    const mat = new THREE.MeshStandardMaterial({
      color: col,
      emissive: col,
      emissiveIntensity: 0.20,
      roughness: 0.55,
      metalness: 0.0,
      flatShading: true,  // makes facets look more organic
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(
      (Math.random() - 0.5) * 50,
      -11.5 + h / 2,
      (Math.random() - 0.5) * 25 - 8
    );
    mesh.scale.setScalar(0.8 + Math.random() * 0.6);
    mesh.rotation.y = Math.random() * Math.PI;
    scene.add(mesh);
    items.push(mesh);

    // Add a few small "branches" coming off the coral
    const branchCount = 2 + Math.floor(Math.random() * 3);
    for (let b = 0; b < branchCount; b++) {
      const branchGeo = new THREE.ConeGeometry(0.15, 0.6 + Math.random() * 0.4, 4, 2);
      const branchMesh = new THREE.Mesh(branchGeo, mat);
      const angle = (b / branchCount) * Math.PI * 2;
      branchMesh.position.set(
        mesh.position.x + Math.cos(angle) * 0.3,
        mesh.position.y + h * 0.3,
        mesh.position.z + Math.sin(angle) * 0.3
      );
      branchMesh.rotation.z = (Math.random() - 0.5) * 0.5;
      branchMesh.rotation.x = (Math.random() - 0.5) * 0.5;
      branchMesh.scale.setScalar(0.6 + Math.random() * 0.4);
      scene.add(branchMesh);
    }
  }
  return items;
}
const coral = buildCoral();

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
// 15. SCROLL-DRIVEN CAMERA PATH
// ---------------------------------------------------------------------------
const cameraWaypoints = [
  { p: 0.00, cam: { x:  0, y:  4, z: 28 }, look: { x: 0, y:  0, z:  0 } },
  { p: 0.18, cam: { x:  4, y:  0, z: 24 }, look: { x: 0, y:  0, z:  0 } },
  { p: 0.32, cam: { x: -6, y: -2, z: 22 }, look: { x: 0, y: -2, z: -5 } },
  { p: 0.48, cam: { x:  8, y: -4, z: 24 }, look: { x: 0, y: -4, z:  0 } },
  { p: 0.64, cam: { x:  0, y: -6, z: 26 }, look: { x: 0, y: -6, z:  0 } },
  { p: 0.78, cam: { x: -4, y: -9, z: 22 }, look: { x: 0, y: -10, z: -4 } },
  { p: 0.90, cam: { x:  6, y: -2, z: 28 }, look: { x: 0, y: -2, z:  0 } },
  { p: 1.00, cam: { x:  0, y:  4, z: 30 }, look: { x: 0, y:  0, z:  0 } },
];
const _tmpA = new THREE.Vector3();
const _tmpB = new THREE.Vector3();
function lerpWaypoint(p) {
  p = Math.max(0, Math.min(1, p));
  let i = 0;
  while (i < cameraWaypoints.length - 1 && cameraWaypoints[i + 1].p < p) i++;
  const a = cameraWaypoints[i];
  const b = cameraWaypoints[Math.min(i + 1, cameraWaypoints.length - 1)];
  const range = b.p - a.p || 1;
  const t = (p - a.p) / range;
  const e = t * t * (3 - 2 * t);
  _tmpA.set(a.cam.x, a.cam.y, a.cam.z).lerp(
    _tmpB.set(b.cam.x, b.cam.y, b.cam.z), e
  );
  camera.position.copy(_tmpA);
  const la = new THREE.Vector3(a.look.x, a.look.y, a.look.z);
  const lb = new THREE.Vector3(b.look.x, b.look.y, b.look.z);
  camera.lookAt(la.lerp(lb, e));
}

// ---------------------------------------------------------------------------
// 16. ANIMATION LOOP
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
const dummy = new THREE.Object3D();
const _camPos = new THREE.Vector3();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  elapsed += dt;
  fishAnimTime += dt;

  // Smooth mouse lerp
  Scene.mouse.x += (Scene.mouse.tx - Scene.mouse.x) * 0.04;
  Scene.mouse.y += (Scene.mouse.ty - Scene.mouse.y) * 0.04;

  // Camera path
  lerpWaypoint(Scene.scrollProgress);
  if (!prefersReducedMotion) {
    camera.position.x += Scene.mouse.x * 0.6;
    camera.position.y += Scene.mouse.y * 0.3;
  }
  // Update water uniform with current camera position (for fresnel)
  camera.getWorldPosition(_camPos);
  waterMat.uniforms.uCameraPos.value.copy(_camPos);
  waterMat.uniforms.uTime.value = elapsed;

  // God rays: subtle drift
  godRays.forEach((r, idx) => {
    r.userData.mat.uniforms.uTime.value = elapsed;
    r.position.x = r.userData.baseX + Math.sin(elapsed * 0.1 + idx) * 0.3;
  });

  // Jellyfish: pulse bell + sway tentacles
  jellyfish.forEach((j, idx) => {
    const ud = j.userData;
    const pulse = 1 + Math.sin(elapsed * 1.2 + ud.phase) * 0.08;
    ud.bell.scale.set(pulse, 1 / pulse, pulse);
    ud.glow.material.opacity = 0.4 + Math.sin(elapsed * 1.5 + ud.phase) * 0.18;
    ud.tentacles.forEach((t) => {
      t.rotation.x = Math.sin(elapsed * 0.7 + t.userData.phase) * 0.18;
      t.rotation.z = Math.sin(elapsed * 0.5 + t.userData.phase + 1) * 0.18;
    });
    j.position.x = ud.basePos.x + Math.sin(elapsed * 0.3 + idx) * 1.2;
    j.position.y = ud.basePos.y + Math.sin(elapsed * 0.4 + idx * 0.7) * 0.6;
    j.rotation.y = elapsed * 0.05 + idx;
  });

  // Fish — real GLB model animation (circular paths + tail wag)
  if (fishGroup.userData.loaded) {
    fishGroup.userData.fishData.forEach((f, i) => {
      const t = elapsed * f.speed + f.offset;
      const x = f.center.x + Math.cos(t) * f.radius;
      const z = f.center.z + Math.sin(t) * f.radius;
      const y = f.center.y + Math.sin(t * 1.3) * f.bobAmp;
      f.mesh.position.set(x, y, z);
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

  // Kelp
  kelp.userData.items.forEach((m) => {
    m.userData.mat.uniforms.uTime.value = elapsed;
  });

  // Marine snow
  marineSnow.material.uniforms.uTime.value = elapsed;

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
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.pixelRatioCap));
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
