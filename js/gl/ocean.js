/**
 * gl/ocean.js — Act one: the reef you are descending through.
 *
 * Everything here is procedural, so there are no megabyte texture downloads and
 * the scene composes itself differently on every visit. Geometry is instanced
 * wherever it repeats, and the whole act is budgeted to stay well inside a
 * mobile GPU's comfort zone.
 */
import * as THREE from 'three';
import { createCreatures, buildReefFishGeometry } from './creatures.js';

/* Deterministic-enough value noise — good for terrain, cheap to evaluate. */
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const h = (a, b) => {
    const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return n - Math.floor(n);
  };
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (
    h(xi, yi) * (1 - u) * (1 - v) +
    h(xi + 1, yi) * u * (1 - v) +
    h(xi, yi + 1) * (1 - u) * v +
    h(xi + 1, yi + 1) * u * v
  );
}
const fbm = (x, y) =>
  noise2(x, y) * 0.55 + noise2(x * 2.1, y * 2.1) * 0.28 + noise2(x * 4.3, y * 4.3) * 0.17;

const rand = (a, b) => a + Math.random() * (b - a);

export function createOcean({ quality = 'high' } = {}) {
  const low = quality === 'low';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x02060c);
  scene.fog = new THREE.FogExp2(0x06202f, 0.0165);

  const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 260);

  /* ── Lighting: ambient water light plus the vehicle's own lamps ───────── */
  const hemi = new THREE.HemisphereLight(0x7fd4f5, 0x05161f, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xd8f2ff, 2.9);
  sun.position.set(6, 40, 10);
  scene.add(sun);
  // Bounce from the sediment keeps the underside of the reef out of pure black.
  const bounce = new THREE.DirectionalLight(0x2b7488, 0.55);
  bounce.position.set(-4, -20, -6);
  scene.add(bounce);

  // The vehicle's own lamps. Decay 1 rather than 2: a physically correct
  // inverse-square falloff leaves nothing lit past a few metres at this scale.
  const lampL = new THREE.PointLight(0xcfeaff, 55, 80, 1);
  const lampR = new THREE.PointLight(0xcfeaff, 55, 80, 1);
  scene.add(lampL, lampR);

  /* ── Seabed ───────────────────────────────────────────────────────────── */
  const SEG = low ? 48 : 84;
  const bedGeo = new THREE.PlaneGeometry(190, 320, SEG, Math.round(SEG * 1.6));
  {
    const pos = bedGeo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const sand = new THREE.Color(0x46626b);
    const deepC = new THREE.Color(0x0d2029);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const h = fbm(x * 0.035, y * 0.035) * 9 + fbm(x * 0.13, y * 0.13) * 2.2;
      // Carve a channel along the flight path, and raise a reef wall to port so
      // the shot always has a foreground edge instead of open water.
      const channel = Math.exp(-(x * x) / 620) * 5.5;
      const ridge = Math.exp(-((x - 21) ** 2) / 120) * (15 + fbm(y * 0.06, 3.2) * 6);
      const z = h - channel + ridge;
      pos.setZ(i, z);
      c.copy(deepC).lerp(sand, THREE.MathUtils.clamp(z / 9 + 0.35, 0, 1));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    bedGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    bedGeo.computeVertexNormals();
  }
  const bed = new THREE.Mesh(
    bedGeo,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.02 })
  );
  bed.rotation.x = -Math.PI / 2;
  bed.position.y = -13;
  scene.add(bed);

  /** Height of the seabed under a world position, for scattering props. */
  const bedHeight = (x, z) =>
    -13 + fbm(x * 0.035, z * 0.035) * 9 + fbm(x * 0.13, z * 0.13) * 2.2
    - Math.exp(-(x * x) / 620) * 5.5
    + Math.exp(-((x - 21) ** 2) / 120) * (15 + fbm(z * 0.06, 3.2) * 6);

  /* ── Coral: three archetypes, instanced ───────────────────────────────── */
  const coralGroup = new THREE.Group();
  scene.add(coralGroup);

  function branchGeo() {
    // A staghorn-ish cluster merged down to one buffer.
    const parts = [];
    for (let i = 0; i < 7; i++) {
      const g = new THREE.CylinderGeometry(0.06, 0.14, rand(1.1, 2.4), 6, 1);
      const m = new THREE.Matrix4();
      const a = (i / 7) * Math.PI * 2;
      m.makeRotationZ(rand(-0.5, 0.5));
      m.multiply(new THREE.Matrix4().makeRotationY(a));
      m.setPosition(Math.cos(a) * rand(0.2, 0.7), rand(0.4, 1.1), Math.sin(a) * rand(0.2, 0.7));
      g.applyMatrix4(m);
      parts.push(g);
    }
    return mergeGeos(parts);
  }

  function mergeGeos(list) {
    let count = 0, idx = 0;
    for (const g of list) {
      count += g.attributes.position.count;
      idx += g.index ? g.index.count : 0;
    }
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const ind = new Uint32Array(idx);
    let po = 0, io = 0, base = 0;
    for (const g of list) {
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      pos.set(p, po * 3); nor.set(n, po * 3);
      const gi = g.index.array;
      for (let i = 0; i < gi.length; i++) ind[io + i] = gi[i] + base;
      base += g.attributes.position.count;
      po += g.attributes.position.count;
      io += gi.length;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setIndex(new THREE.BufferAttribute(ind, 1));
    return out;
  }

  /** Push vertices along their normals by noise: kills the "it's obviously a
   *  sphere" read that low-poly primitives have. */
  function roughen(geo, amp, freq) {
    const pos = geo.attributes.position;
    const nor = geo.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const d = (fbm(x * freq + 11.3, z * freq + 4.7) - 0.5)
              + (fbm(y * freq * 1.7 + 2.1, x * freq * 1.7) - 0.5) * 0.6;
      pos.setXYZ(i,
        x + nor.getX(i) * d * amp,
        y + nor.getY(i) * d * amp,
        z + nor.getZ(i) * d * amp);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();
    return geo;
  }

  /** A table/plate coral: a shallow flared disc with a broken-up rim. */
  function plateGeo() {
    const g = new THREE.CylinderGeometry(1.0, 0.22, 0.42, 14, 2, false);
    g.scale(1, 0.55, 1);
    return roughen(g, 0.22, 0.9);
  }

  /** A cluster of barrel/tube sponges. */
  function spongeGeo() {
    const parts = [];
    for (let i = 0; i < 5; i++) {
      const h = rand(0.7, 1.9);
      const g = new THREE.CylinderGeometry(rand(0.16, 0.3), rand(0.12, 0.22), h, 8, 1, false);
      const a = (i / 5) * Math.PI * 2;
      g.translate(Math.cos(a) * rand(0.15, 0.5), h / 2, Math.sin(a) * rand(0.15, 0.5));
      parts.push(g);
    }
    return roughen(mergeGeos(parts), 0.07, 2.4);
  }

  const CORAL_KINDS = [
    { geo: branchGeo(), color: 0xc86a4a, count: low ? 16 : 34, scale: [0.7, 1.9] },
    { geo: roughen(new THREE.IcosahedronGeometry(1, 2), 0.30, 1.5), color: 0xa8853f, count: low ? 12 : 26, scale: [0.7, 1.7] },
    { geo: plateGeo(), color: 0x9d5068, count: low ? 10 : 22, scale: [0.8, 2.1] },
    { geo: roughen(new THREE.SphereGeometry(1, 14, 10), 0.26, 2.0), color: 0x46807a, count: low ? 12 : 24, scale: [0.5, 1.4] },
    { geo: spongeGeo(), color: 0x8a5f8e, count: low ? 8 : 18, scale: [0.6, 1.5] },
  ];

  const dummy = new THREE.Object3D();
  for (const kind of CORAL_KINDS) {
    const mat = new THREE.MeshStandardMaterial({
      color: kind.color, roughness: 0.85, metalness: 0.03, flatShading: true,
    });
    const inst = new THREE.InstancedMesh(kind.geo, mat, kind.count);
    for (let i = 0; i < kind.count; i++) {
      // Two thirds cling to the port reef wall, where the camera looks;
      // the rest dress the far slopes. Nothing sits in the flight corridor.
      const onWall = Math.random() < 0.72;
      const x = onWall ? rand(13, 30) : (Math.random() < 0.5 ? -1 : 1) * rand(13, 46);
      const z = rand(-120, 60);
      dummy.position.set(x, bedHeight(x, z) + rand(0.1, 0.9), z);
      dummy.rotation.set(rand(-0.25, 0.25), rand(0, Math.PI * 2), rand(-0.25, 0.25));
      dummy.scale.setScalar(rand(kind.scale[0], kind.scale[1]));
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    coralGroup.add(inst);
  }

  /* The reveal bank. The restoration wipe lands somewhere across z -18..-62,
     so that whole stretch carries the densest, most colourful reef we have —
     the payoff shot must never open onto empty water. */
  {
    const PALETTE = [0xd0764a, 0xc79738, 0xab4d6c, 0x3f948a, 0x82558f];
    for (let k = 0; k < CORAL_KINDS.length; k++) {
      const mat = new THREE.MeshStandardMaterial({
        color: PALETTE[k], roughness: 0.78, metalness: 0.04, flatShading: true,
      });
      const n = low ? 9 : 20;
      const inst = new THREE.InstancedMesh(CORAL_KINDS[k].geo, mat, n);
      for (let i = 0; i < n; i++) {
        const x = rand(11, 26);
        const z = rand(-72, -14);
        dummy.position.set(x, bedHeight(x, z) + rand(0.1, 1.2), z);
        dummy.rotation.set(rand(-0.22, 0.22), rand(0, 6.28), rand(-0.22, 0.22));
        dummy.scale.setScalar(rand(0.7, 1.5));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }
    // A warm accent over the bank so restored colour reads as a reward.
    const warm = new THREE.PointLight(0xffd9a8, 32, 80, 1);
    warm.position.set(14, 6, -46);
    scene.add(warm);
  }

  /* ── Kelp: ribbons that sway in the vertex shader ─────────────────────── */
  const kelpUniforms = { uTime: { value: 0 } };
  {
    const n = low ? 16 : 34;
    const geo = new THREE.PlaneGeometry(0.55, 9, 1, 8);
    geo.translate(0, 4.5, 0);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d4632, roughness: 0.92, side: THREE.DoubleSide, transparent: true, opacity: 0.7,
    });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = kelpUniforms.uTime;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
uniform float uTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
float sway = position.y * 0.11;
float ph = instanceMatrix[3][0] * 0.7 + instanceMatrix[3][2] * 0.4;
transformed.x += sin(uTime * 0.9 + ph) * sway * sway * 0.5;
transformed.z += cos(uTime * 0.7 + ph * 1.3) * sway * sway * 0.35;`);
    };
    const inst = new THREE.InstancedMesh(geo, mat, n);
    for (let i = 0; i < n; i++) {
      const onWall = Math.random() < 0.65;
      const x = onWall ? rand(14, 30) : (Math.random() < 0.5 ? -1 : 1) * rand(13, 40);
      const z = rand(-115, 50);
      dummy.position.set(x, bedHeight(x, z), z);
      dummy.rotation.set(0, rand(0, 6.28), 0);
      dummy.scale.set(rand(0.7, 1.4), rand(0.6, 1.5), 1);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    scene.add(inst);
  }

  /* ── Fish school ──────────────────────────────────────────────────────── */
  const FISH = low ? 26 : 60;
  const fishGeo = buildReefFishGeometry();
  fishGeo.rotateY(Math.PI / 2);          // face down +z, the direction of travel
  const fish = new THREE.InstancedMesh(
    fishGeo,
    new THREE.MeshStandardMaterial({ color: 0xe8c268, roughness: 0.45, metalness: 0.22 }),
    FISH
  );
  const fishState = Array.from({ length: FISH }, () => ({
    r: rand(3, 9), a: rand(0, Math.PI * 2), y: rand(-8, 5), z: rand(-95, 20),
    sp: rand(0.25, 0.6), bob: rand(0, 6.28), sc: rand(0.5, 1.1),
  }));
  scene.add(fish);

  /* ── Marine snow ──────────────────────────────────────────────────────── */
  {
    const n = low ? 700 : 1800;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-45, 45);
      pos[i * 3 + 1] = rand(-14, 26);
      pos[i * 3 + 2] = rand(-140, 40);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({
      color: 0xcfe9f5, size: 0.085, transparent: true, opacity: 0.5,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    const snow = new THREE.Points(g, m);
    snow.name = 'snow';
    scene.add(snow);
  }

  /* ── Shafts of surface light ──────────────────────────────────────────── */
  const rays = new THREE.Group();
  let rayUniforms = null;
  {
    const n = low ? 3 : 6;
    // A flat plane reads as a grey slab; these fade out along both axes so
    // they read as light in water instead.
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0x9fe4ff) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying vec2 vUv;
        uniform float uTime;
        uniform vec3 uColor;
        void main() {
          float down = pow(vUv.y, 1.5);                       // brightest near the surface
          float across = pow(sin(vUv.x * 3.14159265), 1.8);   // soft edges
          float flicker = 0.82 + 0.18 * sin(uTime * 0.7 + vUv.x * 9.0);
          gl_FragColor = vec4(uColor, down * across * flicker * 0.16);
        }`,
    });
    rayUniforms = mat.uniforms;
    for (let i = 0; i < n; i++) {
      const g = new THREE.PlaneGeometry(rand(4, 11), 80);
      const m = new THREE.Mesh(g, mat);
      m.position.set(rand(-14, 30), 24, rand(-110, 34));
      m.rotation.set(rand(-0.16, 0.16), rand(0, Math.PI), rand(-0.14, 0.14));
      rays.add(m);
    }
  }
  scene.add(rays);

  /* ── Creatures ────────────────────────────────────────────────────────── */
  const creatures = createCreatures(scene, { low });

  /* ── Camera flight ────────────────────────────────────────────────────── */
  // p: 0 at the surface hero shot, 1 at the restored reef bank.
  let progress = 0;
  let targetProgress = 0;
  const mouse = { x: 0, y: 0, tx: 0, ty: 0 };

  addEventListener('pointermove', (e) => {
    mouse.tx = (e.clientX / innerWidth - 0.5) * 2;
    mouse.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  const camPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-6.0, 4.0, 30),
    new THREE.Vector3(-5.0, 1.5, 12),
    new THREE.Vector3(-4.0, -1.0, -12),
    new THREE.Vector3(-3.0, -2.4, -32),
    new THREE.Vector3(-2.0, -3.2, -46),
  ]);
  const lookPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(4, 1.0, 8),
    new THREE.Vector3(3, -0.8, -14),
    new THREE.Vector3(3, -2.6, -36),
    new THREE.Vector3(4, -4.0, -58),
    new THREE.Vector3(5, -4.6, -74),
  ]);

  const _p = new THREE.Vector3();
  const _l = new THREE.Vector3();
  const _fwd = new THREE.Vector3();
  const _side = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _up = new THREE.Vector3();
  const _rov = new THREE.Vector3();
  const _look = new THREE.Vector3();
  const _orbitPos = new THREE.Vector3();
  const _divePos = new THREE.Vector3();
  const _proj = new THREE.Vector3();
  const _centre = new THREE.Vector3();
  const _hbox = new THREE.Box3();
  const WORLD_UP = new THREE.Vector3(0, 1, 0);

  /* The rover: for most of the film you are inside it, so it is invisible.
     During the reveal the camera backs out of its own eye position and the
     vehicle materialises exactly where that eye was. */
  let rover = null;
  let reveal = 0, targetReveal = 0;
  let orbit = 0, targetOrbit = 0;      // 0..1 = a full turn around the vehicle
  let dive = 0, targetDive = 0;        // 0..1 = back in through the dome port
  const roverProps = [];
  const roverParts = new Map();

  /* The orbit begins exactly where the pull-back ended, so the two moves read
     as one continuous camera rather than a cut. */
  const ORBIT_R0 = 12.24;
  const ORBIT_A0 = 0.35;

  return {
    scene,
    camera,
    /** Story hook: 0 = surface, 1 = settled on the reef. */
    setProgress(v) { targetProgress = THREE.MathUtils.clamp(v, 0, 1); },
    get progress() { return progress; },
    /** Jump the eased values to their targets — used by the visual test suite
     *  so a screenshot never depends on how fast the machine renders. */
    snap() {
      progress = targetProgress;
      reveal = targetReveal;
      orbit = targetOrbit;
      dive = targetDive;
    },
    /** Creature nodes the live detector locks onto. */
    get targets() { return creatures.targets; },
    /**
     * Light mode is the same reef in sunlit shallow water: less water column
     * between you and the scene, so the fog thins and warms and the ambient
     * comes up. It is a re-grade, not a different scene.
     */
    setTheme(mode) {
      const light = mode === 'light';
      scene.fog.color.set(light ? 0x8fc4d8 : 0x06202f);
      scene.fog.density = light ? 0.0118 : 0.0165;
      scene.background.set(light ? 0xa8d6e6 : 0x02060c);
      hemi.intensity = light ? 3.1 : 1.35;
      hemi.groundColor.set(light ? 0x6f97a4 : 0x05161f);
      sun.intensity = light ? 3.6 : 2.9;
      bounce.intensity = light ? 1.1 : 0.55;
      lampL.intensity = lampR.intensity = light ? 26 : 55;
    },
    /** Story hook: 0 = first-person inside the rover, 1 = third-person reveal. */
    setReveal(v) { targetReveal = THREE.MathUtils.clamp(v, 0, 1); },
    get reveal() { return reveal; },
    /** Drop the ABYSS-1 hull into the reef so the reveal has something to show. */
    attachVehicle(obj) {
      if (!obj) return;
      rover = obj;
      rover.visible = false;
      roverProps.length = 0;
      roverParts.clear();
      rover.traverse((o) => {
        if (o.name?.endsWith('_prop')) roverProps.push(o);
        if (o.name && !roverParts.has(o.name)) roverParts.set(o.name, o);
      });
      scene.add(rover);
    },
    get hasVehicle() { return !!rover; },

    /** Story hook: 0..1 drives a full turn around the vehicle. */
    setOrbit(v) { targetOrbit = THREE.MathUtils.clamp(v, 0, 1); },
    get orbit() { return orbit; },
    /** Story hook: 0..1 flies the camera back in through the dome port. */
    setDive(v) { targetDive = THREE.MathUtils.clamp(v, 0, 1); },
    get dive() { return dive; },

    /**
     * Place hotspot markers over the vehicle's real named parts, in viewport
     * coordinates. Markers are hidden when their part is behind the hull or
     * off-frame, so a label never points at something you cannot see.
     */
    projectHotspots(nodes) {
      if (!rover || !rover.visible || orbit < 0.02) {
        for (const el of nodes) el.classList.remove('is-on');
        return 0;
      }
      const w = innerWidth;
      const h = innerHeight;
      const placed = [];

      /* Each part is called out at the point in the turn where it faces the
         camera, one at a time. Showing all seven at once collapses into a
         stacked list that annotates nothing; showing one gives it a moment. */
      const WINDOW = 0.085;

      for (const el of nodes) {
        const part = roverParts.get(el.dataset.hotspot);
        const at = parseFloat(el.dataset.at);
        if (!part) { el.classList.remove('is-on'); continue; }

        // Distance around the loop, so the first and last cues wrap correctly.
        let d = Math.abs(orbit - at);
        if (d > 0.5) d = 1 - d;
        if (d > WINDOW) { el.classList.remove('is-on'); continue; }

        _hbox.setFromObject(part).getCenter(_centre);
        _proj.copy(_centre).project(camera);

        const x = (_proj.x * 0.5 + 0.5) * w;
        const y = (-_proj.y * 0.5 + 0.5) * h;
        const onScreen = _proj.z < 1
          && x > w * 0.06 && x < w * 0.94
          && y > h * 0.12 && y < h * 0.86;

        el.classList.toggle('is-on', onScreen);
        if (!onScreen) continue;

        el.classList.toggle('hotspot--flip', x > w * 0.58);
        // Plateau rather than a peak: a label is fully legible for most of its
        // window and only fades at the very edges, so it never reads as dim.
        const cue = Math.min(1, (1 - d / WINDOW) / 0.35);
        el.style.setProperty('--cue', cue.toFixed(3));
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        placed.push(el);
      }
      return placed.length;
    },
    resize(w, h) {
      camera.aspect = w / Math.max(1, h);
      camera.updateProjectionMatrix();
    },
    update(t, dt) {
      progress += (targetProgress - progress) * Math.min(1, dt * 3.2);
      kelpUniforms.uTime.value = t;
      creatures.update(t, dt);

      mouse.x += (mouse.tx - mouse.x) * Math.min(1, dt * 2.2);
      mouse.y += (mouse.ty - mouse.y) * Math.min(1, dt * 2.2);

      const ease = Math.min(1, dt * 2.2);
      reveal += (targetReveal - reveal) * ease;
      orbit += (targetOrbit - orbit) * ease;
      dive += (targetDive - dive) * ease;

      camPath.getPointAt(progress, _p);
      lookPath.getPointAt(progress, _l);

      // Path frame: forward, right, up — the basis the reveal pulls back along.
      _fwd.copy(_l).sub(_p).normalize();
      _right.crossVectors(_fwd, WORLD_UP).normalize();
      _up.crossVectors(_right, _fwd).normalize();

      // The vehicle sits just ahead of the eye point, flying down the path.
      _rov.copy(_p).addScaledVector(_fwd, 1.6);
      if (rover) {
        rover.visible = reveal > 0.008;
        rover.position.copy(_rov);
        rover.position.y += Math.sin(t * 0.7) * 0.12;
        rover.lookAt(_look.copy(_rov).add(_fwd));
        rover.rotation.z += Math.sin(t * 0.45) * 0.035;
        for (const pr of roverProps) pr.rotation.z += dt * 5.5;
      }

      /* One continuous camera. Three poses, blended in order:
           eye    — inside the vehicle, looking where the pilot looks
           pull   — backed out and to port, seeing the vehicle three-quarter on
           orbit  — a full turn around it
           dive   — back in through the dome port, ending at the lens
         Each stage starts from where the last one left off, so the whole
         journey from first person to inspection and back is unbroken. */
      camera.position.copy(_p)
        .addScaledVector(_fwd, -11.5 * reveal)
        .addScaledVector(_up, 3.4 * reveal)
        .addScaledVector(_right, -4.2 * reveal);

      if (orbit > 0.0005) {
        const a = ORBIT_A0 + orbit * Math.PI * 2;
        const r = ORBIT_R0 - orbit * 1.4;                 // tightens a little
        const h = 3.4 + Math.sin(orbit * Math.PI) * 2.6;  // rises over the top
        _orbitPos.copy(_rov)
          .addScaledVector(_fwd, -Math.cos(a) * r)
          .addScaledVector(_right, -Math.sin(a) * r)
          .addScaledVector(_up, h);
        camera.position.lerp(_orbitPos, orbit);
      }

      if (dive > 0.0005) {
        // The dome port sits at the front of the hull.
        _divePos.copy(_rov).addScaledVector(_fwd, 1.05 + (1 - dive) * 3.2)
          .addScaledVector(_up, 0.12);
        camera.position.lerp(_divePos, dive);
      }

      // A little drift so the shot never feels locked to a rail.
      const sway = 1 - Math.max(orbit, dive) * 0.8;
      camera.position.x += (mouse.x * 1.5 + Math.sin(t * 0.42) * 0.35) * sway;
      camera.position.y += (-mouse.y * 0.9 + Math.sin(t * 0.63) * 0.28) * sway;

      // Aim shifts from "where the pilot was looking" to the vehicle itself.
      _look.lerpVectors(_l, _rov, Math.max(reveal, orbit, dive));
      camera.lookAt(_look);
      // Narrow the lens on the way in, the way a camera pushing in behaves.
      const fov = 58 - dive * 16;
      if (Math.abs(camera.fov - fov) > 0.01) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
      camera.rotation.z = Math.sin(t * 0.31) * 0.012 + mouse.x * 0.02;

      // Lamps stay bolted to the vehicle, so during the reveal you see the
      // beams leaving the rover rather than flaring at the lens.
      lampL.position.copy(_rov).addScaledVector(_fwd, 7).add(_side.set(-3, -0.6, 0));
      lampR.position.copy(_rov).addScaledVector(_fwd, 7).add(_side.set(3, -0.6, 0));

      for (let i = 0; i < FISH; i++) {
        const f = fishState[i];
        f.a += f.sp * dt;
        const x = Math.cos(f.a) * f.r;
        const z = f.z + Math.sin(f.a) * f.r * 0.55;
        const y = f.y + Math.sin(t * 0.8 + f.bob) * 0.5;
        dummy.position.set(x, y, z);
        dummy.lookAt(
          Math.cos(f.a + 0.12) * f.r,
          y + Math.sin(t * 0.8 + f.bob + 0.12) * 0.5,
          f.z + Math.sin(f.a + 0.12) * f.r * 0.55
        );
        // Anything inside the near field is scaled away rather than filling
        // the frame with a single triangle.
        const near = dummy.position.distanceTo(camera.position);
        dummy.scale.setScalar(f.sc * Math.min(1, Math.max(0, (near - 4.5) / 5)));
        dummy.updateMatrix();
        fish.setMatrixAt(i, dummy.matrix);
      }
      fish.instanceMatrix.needsUpdate = true;

      rays.rotation.y = Math.sin(t * 0.06) * 0.05;
      if (rayUniforms) rayUniforms.uTime.value = t;
    },
  };
}
