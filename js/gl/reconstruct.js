/**
 * gl/reconstruct.js — Act three: a single frame becoming a place.
 *
 * The restored still is sampled down to a grid on a 2D canvas. Each cell
 * becomes a point carrying its own colour and an inferred range; scroll then
 * lifts those points off the image plane into relief and skins them with a
 * mesh. Four scroll stages, one geometry.
 */
import * as THREE from 'three';

const GRID_X = 168;
const GRID_Y = 112;

const VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aDepth;
attribute float aJitter;

uniform float uLift;      // 0 = flat image plane, 1 = full relief
uniform float uScatter;   // transient explosion as the cloud forms
uniform float uSize;
uniform float uTime;

varying vec3 vColor;
varying float vDepth;

void main() {
  vColor = aColor;
  vDepth = aDepth;

  vec3 p = position;
  p.z += aDepth * 4.2 * uLift;

  // A brief burst of noise while the points are "finding" their range.
  float burst = uScatter * (0.5 + 0.5 * sin(uTime * 2.0 + aJitter * 30.0));
  p += vec3(
    sin(aJitter * 91.0) * burst,
    cos(aJitter * 57.0) * burst,
    sin(aJitter * 23.0) * burst * 1.6
  );

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (34.0 / max(1.0, -mv.z));
}
`;

const FRAG = /* glsl */ `
precision mediump float;
uniform float uDepthView;   // 0 = true colour, 1 = depth ramp
uniform float uOpacity;
varying vec3 vColor;
varying float vDepth;

void main() {
  vec2 d = gl_PointCoord - 0.5;
  float m = smoothstep(0.5, 0.18, length(d));
  if (m < 0.02) discard;

  // Depth ramp: near is cyan, far is deep violet-blue.
  vec3 ramp = mix(vec3(0.05, 0.16, 0.42), vec3(0.22, 0.90, 1.0), vDepth);
  vec3 col = mix(vColor, ramp, uDepthView);

  gl_FragColor = vec4(col, m * uOpacity);
}
`;

export function createReconstruct({ src }) {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 120);

  const group = new THREE.Group();
  group.rotation.x = -0.12;
  scene.add(group);

  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x04121c, 0.9));
  const key = new THREE.DirectionalLight(0xcfeeff, 1.5);
  key.position.set(3, 6, 5);
  scene.add(key);

  const uniforms = {
    uLift: { value: 0 },
    uScatter: { value: 0 },
    uSize: { value: 2.6 },
    uTime: { value: 0 },
    uDepthView: { value: 0 },
    uOpacity: { value: 1 },
  };

  const points = new THREE.Points(
    new THREE.BufferGeometry(),
    new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    })
  );
  group.add(points);

  /* The skinned surface that appears in the final stage. */
  const meshGeo = new THREE.PlaneGeometry(16, 16 * (GRID_Y / GRID_X), GRID_X - 1, GRID_Y - 1);
  const meshMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.86, metalness: 0.05,
    transparent: true, opacity: 0, flatShading: false, side: THREE.DoubleSide,
  });
  const surface = new THREE.Mesh(meshGeo, meshMat);
  group.add(surface);

  const wire = new THREE.Mesh(
    meshGeo,
    new THREE.MeshBasicMaterial({ color: 0x38e1ff, wireframe: true, transparent: true, opacity: 0 })
  );
  group.add(wire);

  let built = false;

  /** Sample the source frame into the grid; derive a plausible range field. */
  async function build() {
    const img = new Image();
    img.decoding = 'async';
    img.src = src;
    try {
      await (img.decode?.() ?? new Promise((r, j) => { img.onload = r; img.onerror = j; }));
    } catch {
      return false;   // section still renders, just without the photographic cloud
    }

    const c = document.createElement('canvas');
    c.width = GRID_X; c.height = GRID_Y;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, GRID_X, GRID_Y);

    let data;
    try {
      data = ctx.getImageData(0, 0, GRID_X, GRID_Y).data;
    } catch {
      return false;
    }

    const n = GRID_X * GRID_Y;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const dep = new Float32Array(n);
    const jit = new Float32Array(n);

    const W = 16;
    const H = 16 * (GRID_Y / GRID_X);
    const mcol = new Float32Array(n * 3);

    for (let y = 0; y < GRID_Y; y++) {
      for (let x = 0; x < GRID_X; x++) {
        const i = y * GRID_X + x;
        const o = i * 4;
        const r = data[o] / 255, g = data[o + 1] / 255, b = data[o + 2] / 255;

        pos[i * 3] = (x / (GRID_X - 1) - 0.5) * W;
        pos[i * 3 + 1] = -(y / (GRID_Y - 1) - 0.5) * H;
        pos[i * 3 + 2] = 0;

        col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
        mcol[i * 3] = r; mcol[i * 3 + 1] = g; mcol[i * 3 + 2] = b;

        // Marine monocular depth cue: in an artificially lit underwater frame,
        // brightness falls off with range while the blue channel survives it.
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        const blueBias = b - (r + g) * 0.5;
        dep[i] = Math.min(1, Math.max(0, lum * 0.82 - blueBias * 0.45 + 0.12));
        jit[i] = Math.random();
      }
    }

    // Light box blur so the range field reads as a surface, not as pixel noise.
    const smooth = new Float32Array(dep);
    for (let y = 1; y < GRID_Y - 1; y++) {
      for (let x = 1; x < GRID_X - 1; x++) {
        const i = y * GRID_X + x;
        smooth[i] = (
          dep[i] * 4 +
          dep[i - 1] + dep[i + 1] + dep[i - GRID_X] + dep[i + GRID_X]
        ) / 8;
      }
    }
    dep.set(smooth);

    const g = points.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    g.setAttribute('aJitter', new THREE.BufferAttribute(jit, 1));
    g.computeBoundingSphere();

    // The surface shares the same relief so the two never disagree.
    const mp = meshGeo.attributes.position;
    for (let i = 0; i < n; i++) mp.setZ(i, dep[i] * 4.2);
    mp.needsUpdate = true;
    meshGeo.setAttribute('color', new THREE.BufferAttribute(mcol, 3));
    meshGeo.computeVertexNormals();

    built = true;
    return true;
  }

  let p = 0, targetP = 0;

  return {
    scene,
    camera,
    clearColor: 0x03060b,
    build,
    get built() { return built; },
    /** Story hook: 0..1 across the reconstruction chapter. */
    setProgress(v) { targetP = THREE.MathUtils.clamp(v, 0, 1); },
    /** Which of the four steps is active, for the DOM step cards. */
    get stage() { return Math.min(3, Math.floor(p * 4)); },
    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    update(t, dt) {
      p += (targetP - p) * Math.min(1, dt * 2.6);
      uniforms.uTime.value = t;

      // Stage 1 (0.00-0.25) flat colour · 2 (0.25-0.50) depth ramp
      // Stage 3 (0.50-0.75) lift into 3D  · 4 (0.75-1.00) skin the surface
      const s2 = THREE.MathUtils.smoothstep(p, 0.22, 0.42);
      const s3 = THREE.MathUtils.smoothstep(p, 0.46, 0.72);
      const s4 = THREE.MathUtils.smoothstep(p, 0.74, 0.95);

      uniforms.uDepthView.value = s2 * (1 - s4 * 0.8);
      uniforms.uLift.value = s3;
      uniforms.uScatter.value = Math.sin(s3 * Math.PI) * 0.5;
      uniforms.uOpacity.value = 1 - s4 * 0.85;
      uniforms.uSize.value = 2.6 + s3 * 1.2;

      meshMat.opacity = s4 * 0.95;
      wire.material.opacity = Math.sin(s4 * Math.PI) * 0.35;

      // Orbit in as the scene gains a third dimension.
      const orbit = s3 * 0.55;
      const dist = 20 - s3 * 4.5;
      camera.position.set(
        Math.sin(orbit + Math.sin(t * 0.18) * 0.06 * s3) * dist,
        3.2 + s3 * 2.4 + Math.sin(t * 0.24) * 0.3,
        Math.cos(orbit + Math.sin(t * 0.18) * 0.06 * s3) * dist
      );
      camera.lookAt(0, 0.4, 0);
      group.rotation.x = -0.12 - s3 * 0.42;
    },
  };
}
