/**
 * gl/creatures.js — The animals the rover meets, built properly.
 *
 * Carried forward from the previous site's scene (jellyfish, turtles, manta,
 * seahorses, plankton) but rebuilt from real anatomy rather than primitives:
 * lathed bells with flared margins, parametric manta wings with cephalic fins,
 * swept-tube seahorses, scuted carapaces. Every creature carries a `species`
 * record so the detector can lock a labelled box onto the actual object.
 */
import * as THREE from 'three';

const rand = (a, b) => a + Math.random() * (b - a);

/* Reduced motion: the animals keep swimming, because a still reef reads as a
   broken page rather than a calm one — but they do it slowly. */
const MOTION = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0.25 : 1;
const TAU = Math.PI * 2;

/** Build a BufferGeometry from a parametric surface fn(u, v, out). */
function parametric(nu, nv, fn) {
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uv = new Float32Array((nu + 1) * (nv + 1) * 2);
  const idx = [];
  const p = new THREE.Vector3();

  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const k = i * (nv + 1) + j;
      fn(i / nu, j / nv, p);
      pos[k * 3] = p.x; pos[k * 3 + 1] = p.y; pos[k * 3 + 2] = p.z;
      uv[k * 2] = i / nu; uv[k * 2 + 1] = j / nv;
    }
  }
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      const a = i * (nv + 1) + j;
      const b = a + nv + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Merge simple position/normal geometries into one buffer. */
export function mergeGeometries(list) {
  let vcount = 0, icount = 0;
  for (const g of list) {
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    vcount += g.attributes.position.count;
    icount += g.index.count;
  }
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const idx = new Uint32Array(icount);

  let vo = 0, io = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += g.attributes.position.count;
    io += gi.length;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ── Jellyfish ───────────────────────────────────────────────────────────── */
/* A lathed bell with a flared margin, radial canals, frilled oral arms and a
   curtain of fine tentacles. Two shells — an inner translucent body and an
   additive outer rim — give the gelatinous read without a transmission pass. */
function buildJellyfish(scale) {
  const g = new THREE.Group();
  const hue = 186 + Math.random() * 46;
  const skin = new THREE.Color().setHSL(hue / 360, 0.72, 0.66);
  const core = new THREE.Color().setHSL((hue + 14) / 360, 0.9, 0.6);

  // Bell profile: domed crown easing into a flared, slightly recurved margin.
  const profile = [];
  const STEPS = 22;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const r = Math.sin(t * Math.PI * 0.5) ** 0.78;
    const y = Math.cos(t * Math.PI * 0.5) * 0.92;
    const flare = t > 0.82 ? (t - 0.82) * 1.5 : 0;   // the margin kicks outward
    profile.push(new THREE.Vector2(Math.max(0.01, r * (1 + flare)), y - flare * 0.3));
  }

  const bellGeo = new THREE.LatheGeometry(profile, 40);
  const bell = new THREE.Mesh(bellGeo, new THREE.MeshStandardMaterial({
    color: skin, roughness: 0.24, metalness: 0,
    transparent: true, opacity: 0.46, side: THREE.DoubleSide,
    depthWrite: false, emissive: core, emissiveIntensity: 0.22,
  }));
  g.add(bell);

  // Outer envelope: additive, back-faced — reads as the wet rim highlight.
  const halo = new THREE.Mesh(bellGeo, new THREE.MeshBasicMaterial({
    color: core, transparent: true, opacity: 0.2,
    side: THREE.BackSide, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  halo.scale.setScalar(1.07);
  g.add(halo);

  // Gonad rings: the four-ring signature of a moon jelly.
  const organs = new THREE.Group();
  const organMat = new THREE.MeshStandardMaterial({
    color: core, roughness: 0.3, transparent: true, opacity: 0.75,
    emissive: core, emissiveIntensity: 0.55, depthWrite: false,
  });
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 8, 16), organMat);
    const a = (i / 4) * TAU;
    ring.position.set(Math.cos(a) * 0.3, -0.06, Math.sin(a) * 0.3);
    ring.rotation.x = Math.PI / 2;
    organs.add(ring);
  }
  g.add(organs);

  // Radial canals etched across the bell — one merged LineSegments.
  {
    const pts = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      let prev = null;
      for (let s = 0; s <= 8; s++) {
        const t = s / 8;
        const r = Math.sin(t * Math.PI * 0.5) ** 0.78;
        const v = new THREE.Vector3(Math.cos(a) * r, Math.cos(t * Math.PI * 0.5) * 0.92, Math.sin(a) * r);
        if (prev) pts.push(prev, v);
        prev = v;
      }
    }
    g.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: core, transparent: true, opacity: 0.3, depthWrite: false })
    ));
  }

  // Four frilled oral arms trailing under the bell.
  const arms = [];
  const armMat = new THREE.MeshStandardMaterial({
    color: skin, roughness: 0.35, transparent: true, opacity: 0.42,
    side: THREE.DoubleSide, depthWrite: false,
    emissive: core, emissiveIntensity: 0.16,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    const geo = parametric(9, 5, (u, v, p) => {
      const wobble = Math.sin(u * 5.2) * 0.16 * u;      // frilled edge
      const w = (0.26 - u * 0.16) * (v - 0.5) * 2;
      p.set(
        Math.cos(a) * (0.22 + u * 0.1) + w * Math.cos(a + 1.57) + wobble * Math.cos(a),
        -0.15 - u * 2.5,
        Math.sin(a) * (0.22 + u * 0.1) + w * Math.sin(a + 1.57) + wobble * Math.sin(a)
      );
    });
    const arm = new THREE.Mesh(geo, armMat);
    g.add(arm);
    arms.push(arm);
  }

  /* Marginal tentacles: 26 filaments in a single LineSegments. The trailing
     sway lives in the vertex shader, so the whole curtain costs one draw call
     instead of one per tentacle — the difference between ~40 calls per jelly
     and 2. */
  const tentUniforms = { uTime: { value: 0 }, uPhase: { value: rand(0, TAU) } };
  {
    const verts = [];
    const angles = [];
    const drops = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * TAU;
      const len = rand(2.2, 4.4);
      let prev = null, prevT = 0;
      for (let s = 0; s <= 9; s++) {
        const t = s / 9;
        const v = new THREE.Vector3(
          Math.cos(a) * (1.02 - t * 0.12), -0.28 - t * len, Math.sin(a) * (1.02 - t * 0.12)
        );
        if (prev) {
          verts.push(prev.x, prev.y, prev.z, v.x, v.y, v.z);
          angles.push(a, a);
          drops.push(prevT, t);
        }
        prev = v; prevT = t;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setAttribute('aAngle', new THREE.Float32BufferAttribute(angles, 1));
    geo.setAttribute('aDrop', new THREE.Float32BufferAttribute(drops, 1));

    const tentMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: {
        ...tentUniforms,
        uColor: { value: skin },
        uOpacity: { value: 0.36 },
      },
      vertexShader: `
        attribute float aAngle;
        attribute float aDrop;
        uniform float uTime;
        uniform float uPhase;
        void main() {
          vec3 p = position;
          float sway = aDrop * aDrop;          // tips move, roots do not
          p.x += sin(uTime * 1.1 + uPhase + aAngle * 2.0) * sway * 0.34;
          p.z += cos(uTime * 0.9 + uPhase + aAngle * 1.7) * sway * 0.30;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        void main() { gl_FragColor = vec4(uColor, uOpacity); }`,
    });
    g.add(new THREE.LineSegments(geo, tentMat));
  }

  g.scale.setScalar(scale);
  g.userData = { kind: 'jelly', bell, halo, organs, arms, tentUniforms, phase: rand(0, TAU) };
  return g;
}

/* ── Sea turtle ──────────────────────────────────────────────────────────── */
/* Domed carapace with raised scutes and a marginal rim, tapered head with a
   beak, and airfoil flippers that sweep rather than flap flat. */
function buildTurtle(scale, shellColor = 0x2f6b4d) {
  const g = new THREE.Group();

  const shellMat = new THREE.MeshStandardMaterial({
    color: shellColor, roughness: 0.62, metalness: 0.04, flatShading: true,
  });
  const skinMat = new THREE.MeshStandardMaterial({ color: 0x6f9464, roughness: 0.78 });
  const plastronMat = new THREE.MeshStandardMaterial({ color: 0xc7bb92, roughness: 0.8 });

  // Carapace: an ellipsoidal dome whose scutes are raised by a radial ripple.
  const carapace = new THREE.Mesh(
    parametric(28, 16, (u, v, p) => {
      const a = u * TAU;
      const t = v * Math.PI * 0.5;
      const scute = 1 + Math.cos(a * 5) * Math.sin(t * 3.2) * 0.055;
      p.set(
        Math.cos(a) * Math.sin(t) * 1.15 * scute,
        Math.cos(t) * 0.52 * scute,
        Math.sin(a) * Math.sin(t) * 0.92 * scute
      );
    }),
    shellMat
  );
  carapace.position.y = 0.06;
  g.add(carapace);

  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 6, 24), shellMat);
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.12, 0.8, 1);
  rim.position.y = 0.05;
  g.add(rim);

  const plastron = new THREE.Mesh(
    new THREE.SphereGeometry(0.94, 14, 8, 0, TAU, Math.PI * 0.5, Math.PI * 0.5), plastronMat
  );
  plastron.scale.set(1.05, 0.2, 0.85);
  g.add(plastron);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.19, 0.34, 10), skinMat);
  neck.rotation.z = -Math.PI / 2 + 0.22;
  neck.position.set(1.05, 0.12, 0);
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 9), skinMat);
  head.scale.set(1.25, 0.9, 0.88);
  head.position.set(1.34, 0.16, 0);
  g.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.24, 8), skinMat);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(1.56, 0.13, 0);
  g.add(beak);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x0d1418, roughness: 0.15 });
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), eyeMat);
    eye.position.set(1.4, 0.22, sz * 0.14);
    g.add(eye);
  }

  // Flippers: tapered airfoils — long at the front, short at the rear.
  const flippers = [];
  const addFlipper = (len, wide, pos, yaw) => {
    const m = new THREE.Mesh(
      parametric(10, 4, (u, v, p) => {
        const taper = 1 - u * 0.62;
        p.set(u * len, (v - 0.5) * 0.055 * taper, (v - 0.5) * wide * taper - u * u * 0.42);
      }),
      skinMat
    );
    m.position.set(...pos);
    m.rotation.y = yaw;
    g.add(m);
    flippers.push(m);
  };
  addFlipper(1.55, 0.62, [0.42, 0.02, 0.62], 0.55);
  addFlipper(1.55, 0.62, [0.42, 0.02, -0.62], -0.55);
  addFlipper(0.78, 0.44, [-0.72, -0.02, 0.55], 1.9);
  addFlipper(0.78, 0.44, [-0.72, -0.02, -0.55], -1.9);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.4, 6), skinMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-1.15, 0, 0);
  g.add(tail);

  g.scale.setScalar(scale * 0.5);
  g.userData = { kind: 'turtle', flippers, phase: rand(0, TAU) };
  return g;
}

/* ── Manta ray ───────────────────────────────────────────────────────────── */
/* One parametric surface for the whole disc: swept, tapered wings blended into
   a thickened central body, plus cephalic fins and a whip tail. */
function buildManta(scale) {
  const g = new THREE.Group();

  const skin = new THREE.MeshStandardMaterial({
    color: 0x1d2f43, roughness: 0.52, metalness: 0.08, side: THREE.DoubleSide,
  });
  const belly = new THREE.MeshStandardMaterial({
    color: 0xd6dee4, roughness: 0.62, side: THREE.DoubleSide,
  });

  const disc = parametric(40, 18, (uu, vv, p) => {
    const u = uu * 2 - 1;
    const span = Math.abs(u);
    const chord = 1 - span * 0.72;              // wings taper outboard
    const sweep = span * span * 0.95;           // trailing edge sweeps back
    const thick = (1 - span) ** 2.2 * 0.34;     // body thickens at the centre
    p.set(
      u * 2.5,
      Math.sin(vv * Math.PI) * thick - vv * 0.05,
      (vv - 0.5) * chord * 1.5 - sweep
    );
  });
  const body = new THREE.Mesh(disc, skin);
  g.add(body);

  const under = new THREE.Mesh(disc.clone(), belly);
  under.scale.set(0.985, -0.62, 0.985);
  under.position.y = -0.02;
  g.add(under);

  // Cephalic fins — the paired lobes a manta reads by.
  const cephalic = [];
  for (const sx of [-1, 1]) {
    const fin = new THREE.Mesh(
      parametric(8, 4, (u, v, p) => {
        p.set(u * 0.5, (v - 0.5) * 0.1, -0.35 - u * 0.75 + Math.sin(u * 2) * 0.1);
      }),
      skin
    );
    fin.position.set(sx * 0.34, 0.02, -0.62);
    fin.rotation.y = sx * 0.42;
    g.add(fin);
    cephalic.push(fin);
  }

  const slitMat = new THREE.MeshBasicMaterial({ color: 0x0a1016 });
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      const slit = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.2), slitMat);
      slit.position.set(sx * (0.34 + i * 0.13), -0.12, -0.1);
      g.add(slit);
    }
  }

  const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.006, 2.6, 6), skin);
  tail.rotation.x = Math.PI / 2;
  tail.position.set(0, 0, 1.5);
  g.add(tail);

  // Cache the rest pose so the wingbeat displaces from it every frame.
  const restY = Float32Array.from(disc.attributes.position.array.filter((_, i) => i % 3 === 1));

  g.scale.setScalar(scale * 0.62);
  g.userData = { kind: 'manta', body, cephalic, restY, phase: rand(0, TAU) };
  return g;
}

/* ── Seahorse ────────────────────────────────────────────────────────────── */
/* A swept tube along the signature S-curve, with bony ridges, a snout, a
   coronet and a fluttering dorsal fin. */
function buildSeahorse(scale) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0xd9a044, roughness: 0.66, flatShading: true });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xf0cf8c, roughness: 0.5, transparent: true, opacity: 0.72, side: THREE.DoubleSide,
  });

  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.10, 1.02, 0),      // head
    new THREE.Vector3(-0.05, 0.78, 0),
    new THREE.Vector3(0.02, 0.44, 0),      // chest
    new THREE.Vector3(0.10, 0.06, 0),
    new THREE.Vector3(0.02, -0.34, 0),
    new THREE.Vector3(-0.22, -0.60, 0),    // the tail curls forward
    new THREE.Vector3(-0.10, -0.80, 0),
    new THREE.Vector3(0.10, -0.70, 0),
  ]);

  const _pt = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _nor = new THREE.Vector3();
  const _bin = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 0, 1);

  const tube = parametric(40, 9, (u, v, p) => {
    spine.getPointAt(u, _pt);
    spine.getTangentAt(u, _tan);
    _nor.copy(UP).cross(_tan).normalize();
    _bin.crossVectors(_tan, _nor);
    const r = (0.055 + Math.sin(u * Math.PI) * 0.105) * (1 - u * 0.45);
    const a = v * TAU;
    // A ridge ring makes the bony plating read at silhouette scale.
    const ridge = 1 + Math.cos(a * 6) * 0.13 + Math.sin(u * 34) * 0.05;
    p.copy(_pt)
      .addScaledVector(_nor, Math.cos(a) * r * ridge)
      .addScaledVector(_bin, Math.sin(a) * r * ridge * 0.85);
  });
  g.add(new THREE.Mesh(tube, mat));

  const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.028, 0.36, 8), mat);
  snout.position.set(0.3, 1.02, 0);
  snout.rotation.z = -1.32;
  g.add(snout);

  const coronet = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.18, 5), mat);
  coronet.position.set(0.04, 1.18, 0);
  coronet.rotation.z = -0.3;
  g.add(coronet);

  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x120d06, roughness: 0.2 });
  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.038, 8, 6), eyeMat);
    eye.position.set(0.13, 1.05, sz * 0.075);
    g.add(eye);
  }

  const dorsal = new THREE.Mesh(
    parametric(10, 3, (u, v, p) => {
      p.set(-0.14 - Math.sin(u * Math.PI) * 0.17, 0.46 - u * 0.82, (v - 0.5) * 0.03);
    }),
    finMat
  );
  g.add(dorsal);

  g.scale.setScalar(scale * 0.62);
  g.userData = { kind: 'seahorse', dorsal, phase: rand(0, TAU) };
  return g;
}

/* ── Reef fish ───────────────────────────────────────────────────────────── */
/* A proper fusiform body: laterally compressed, widest a third back, tapering
   to a narrow peduncle that the forked caudal fin actually attaches to. */
export function buildReefFishGeometry() {
  const L = 1.4;

  const body = parametric(22, 12, (u, v, p) => {
    const a = v * TAU;
    // Girth: blunt snout, maximum a third back, narrow peduncle.
    const g = Math.sin(Math.pow(u, 0.62) * Math.PI) * (1 - u * 0.58) * 0.19;
    p.set(u * L - L * 0.5, Math.sin(a) * g * 1.55, Math.cos(a) * g * 0.6);
  });

  // Forked caudal fin, attached at the peduncle and swept back.
  const caudal = parametric(6, 4, (u, v, p) => {
    const fork = Math.abs(v - 0.5) * 2;               // 0 mid-fin, 1 at the tips
    const spread = 0.06 + u * 0.34 * (0.35 + fork);
    p.set(L * 0.5 - 0.02 + u * 0.4 * (0.4 + fork * 0.6), (v - 0.5) * 2 * spread, 0);
  });

  const dorsal = parametric(8, 3, (u, v, p) => {
    const along = -0.28 + u * 0.62;
    p.set(along, 0.15 + Math.sin(u * Math.PI) * 0.16 * v + 0.06, (v - 0.5) * 0.012);
  });

  const anal = parametric(6, 3, (u, v, p) => {
    const along = 0.06 + u * 0.34;
    p.set(along, -0.13 - Math.sin(u * Math.PI) * 0.1 * v, (v - 0.5) * 0.012);
  });

  const pectoral = parametric(5, 3, (u, v, p) => {
    p.set(-0.16 - u * 0.26, -0.02 - u * 0.06, 0.07 + u * 0.16 * (0.3 + v));
  });
  const pectoral2 = pectoral.clone();
  pectoral2.scale(1, 1, -1);

  return mergeGeometries([body, caudal, dorsal, anal, pectoral, pectoral2]);
}

/* ── Catalogue ───────────────────────────────────────────────────────────── */
const CAST = [
  /* Early — met while the water is still murky, so they read as silhouettes. */
  { build: buildJellyfish, scale: 2.4, pos: [5, 1.6, 2],    drift: 1.2,
    species: { name: 'Moon jellyfish', latin: 'Aurelia aurita', conf: 96.7, kind: '' } },
  { build: buildJellyfish, scale: 1.6, pos: [8, 3.0, -12],  drift: 1.0,
    species: { name: 'Moon jellyfish', latin: 'Aurelia aurita', conf: 94.1, kind: '' } },

  /* Mid — encountered as the restoration wipe crosses the frame. */
  { build: buildTurtle,    scale: 2.1, pos: [6, -1.6, -24], drift: 0.7,
    species: { name: 'Green sea turtle', latin: 'Chelonia mydas', conf: 98.2, kind: 'coral' } },
  { build: buildJellyfish, scale: 2.0, pos: [2, -0.4, -34], drift: 1.4,
    species: { name: 'Crystal jelly', latin: 'Aequorea victoria', conf: 91.8, kind: '' } },

  /* Late — the cluster the detector locks onto. Spread across depth as well as
     across the frame, so their screen-space boxes stay distinct instead of
     piling into one another. */
  { build: buildJellyfish, scale: 1.9, pos: [5, -1.2, -55],  drift: 1.1,
    species: { name: 'Crystal jelly', latin: 'Aequorea victoria', conf: 89.6, kind: '' } },
  { build: buildSeahorse,  scale: 2.4, pos: [-2, -5.2, -62], drift: 0.35,
    species: { name: 'Common seahorse', latin: 'Hippocampus kuda', conf: 88.3, kind: '' } },
  { build: buildManta,     scale: 2.6, pos: [9, -5.4, -70],  drift: 0.9,
    species: { name: 'Reef manta ray', latin: 'Mobula alfredi', conf: 97.4, kind: 'coral' } },
  { build: buildTurtle,    scale: 2.0, pos: [0, 0.6, -78],   drift: 0.7, shell: 0x6b4a2a,
    species: { name: 'Hawksbill turtle', latin: 'Eretmochelys imbricata', conf: 93.5, kind: 'coral' } },
  { build: buildJellyfish, scale: 1.7, pos: [11, -2.2, -86], drift: 1.0,
    species: { name: 'Moon jellyfish', latin: 'Aurelia aurita', conf: 92.2, kind: '' } },
];

/**
 * A closed swim loop around a home position. Animals travel this rather than
 * bobbing in place — the difference between a scene that is alive and one that
 * is a diorama — and the loop is kept small so nobody wanders out of shot.
 */
function swimLoop(home, radius, height) {
  const pts = [];
  const turns = 5 + Math.floor(Math.random() * 3);
  for (let i = 0; i < turns; i++) {
    const a = (i / turns) * TAU + rand(-0.35, 0.35);
    const r = radius * rand(0.62, 1.0);
    pts.push(new THREE.Vector3(
      home.x + Math.cos(a) * r,
      home.y + Math.sin(a * 2 + 0.7) * height,
      home.z + Math.sin(a) * r * rand(0.8, 1.5)
    ));
  }
  const c = new THREE.CatmullRomCurve3(pts, true, 'catmullrom', 0.6);
  c.arcLengthDivisions = 120;
  return c;
}

export function createCreatures(scene, { low = false } = {}) {
  const cast = low ? CAST.filter((_, i) => i !== 1 && i !== 8) : CAST;
  const members = [];

  for (const entry of cast) {
    const g = entry.shell
      ? buildTurtle(entry.scale, entry.shell)
      : entry.build(entry.scale);
    g.position.set(...entry.pos);
    const home = g.position.clone();
    const kind = g.userData.kind;

    g.userData.basePos = home;
    g.userData.drift = entry.drift;
    g.userData.species = entry.species;
    // Jellies barely travel; turtles and mantas cover real ground.
    g.userData.path = swimLoop(
      home,
      kind === 'jelly' ? 2.4 : kind === 'seahorse' ? 1.1 : 6.5,
      kind === 'jelly' ? 1.6 : kind === 'seahorse' ? 0.7 : 2.2
    );
    g.userData.speed = kind === 'manta' ? 0.020
      : kind === 'turtle' ? 0.026
      : kind === 'seahorse' ? 0.010 : 0.014;
    g.userData.u = Math.random();
    g.userData.swim = 0;
    scene.add(g);
    members.push(g);
  }

  /* Bioluminescent plankton — what makes restored water feel alive, not clean. */
  const plankton = (() => {
    const n = low ? 180 : 460;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = rand(-10, 22);
      pos[i * 3 + 1] = rand(-10, 10);
      pos[i * 3 + 2] = rand(-84, 18);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({
      color: 0x8ff2e0, size: 0.14, transparent: true, opacity: 0.8,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    }));
    scene.add(p);
    return p;
  })();

  const _pos = new THREE.Vector3();
  const _tan = new THREE.Vector3();
  const _aim = new THREE.Vector3();

  return {
    members,
    targets: members,
    update(rawT, rawDt) {
      const t = rawT * MOTION;
      const dt = rawDt * MOTION;
      for (const g of members) {
        const u = g.userData;

        // Travel the loop. Everything that swims points where it is going.
        u.u = (u.u + u.speed * dt) % 1;
        u.path.getPointAt(u.u, _pos);
        u.path.getTangentAt(u.u, _tan);

        g.position.copy(_pos);
        if (u.kind === 'turtle' || u.kind === 'manta') {
          _aim.copy(_pos).add(_tan);
          g.lookAt(_aim);
          // Bank into the turn, the way a swimming animal actually does.
          g.rotateY(Math.PI * 0.5);
          g.rotation.z += -_tan.x * 0.28;
        }

        if (u.kind === 'jelly') {
          // The bell contracts and recoils; volume is roughly conserved, and
          // the animal rises on each contraction the way a real jelly swims.
          /* Jellyfish swim by jetting: the bell contracts hard (thrust) and
             relaxes slowly (glide and sink). Integrating that asymmetry gives
             the characteristic rise-and-settle instead of a sine wobble. */
          const s = Math.sin(t * 1.35 + u.phase);
          const squash = 1 + s * 0.14;
          u.bell.scale.set(squash, 1 / squash, squash);
          u.halo.scale.set(squash * 1.07, 1.07 / squash, squash * 1.07);
          u.organs.rotation.y = Math.sin(t * 0.4 + u.phase) * 0.15;
          // The oral arms lag the bell — they trail the pulse, not lead it.
          for (const a of u.arms) a.rotation.y = Math.sin(t * 1.35 + u.phase - 0.9) * 0.16;
          u.tentUniforms.uTime.value = t;

          const thrust = Math.max(0, s) ** 1.6;
          u.swim += (thrust * 1.5 - 0.42) * dt;
          u.swim = Math.max(-0.7, Math.min(1.4, u.swim));
          g.position.y += u.swim;
          g.rotation.z = Math.sin(t * 0.31 + u.phase) * 0.07;
        } else if (u.kind === 'turtle') {
          // Downstroke drives; the body pitches slightly nose-up on each pull.
          const s = Math.sin(t * 0.95 + u.phase);
          const drive = Math.max(0, s);
          u.flippers[0].rotation.z = s * 0.55;
          u.flippers[1].rotation.z = s * 0.55;
          u.flippers[2].rotation.z = s * 0.2;
          u.flippers[3].rotation.z = s * 0.2;
          g.rotation.x += drive * 0.09 - 0.04;
          g.position.y += Math.sin(t * 0.95 + u.phase - 0.5) * 0.03;
        } else if (u.kind === 'manta') {
          // The wingbeat travels outboard along the span, from the rest pose.
          const pos = u.body.geometry.attributes.position;
          const s = t * 1.05 + u.phase;
          for (let i = 0; i < pos.count; i++) {
            const span = Math.abs(pos.getX(i)) / 2.5;
            pos.setY(i, u.restY[i] + Math.sin(s - span * 2.1) * span * span * 0.55);
          }
          pos.needsUpdate = true;
          if ((u.tick = (u.tick || 0) + 1) % 4 === 0) u.body.geometry.computeVertexNormals();
          for (const f of u.cephalic) f.rotation.x = Math.sin(s * 0.8) * 0.16;
          // Wingbeat lifts the whole animal a little on each downstroke.
          g.position.y += Math.sin(s - 0.6) * 0.12;
        } else if (u.kind === 'seahorse') {
          // Seahorses hover: almost no travel, constant dorsal-fin flutter.
          g.rotation.z = Math.sin(t * 0.7 + u.phase) * 0.12;
          g.rotation.y = Math.sin(t * 0.22 + u.phase) * 1.2;
          g.position.y += Math.sin(t * 1.6 + u.phase) * 0.06;
          u.dorsal.rotation.y = Math.sin(t * 14 + u.phase) * 0.34;
        }
      }
      plankton.rotation.y = Math.sin(t * 0.03) * 0.04;
    },
  };
}
