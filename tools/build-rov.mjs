/**
 * build-rov.mjs — Procedural author-time generator for the ABYSS-1 ROV.
 *
 * Builds the work-class ROV entirely from parametric primitives, then emits:
 *   assets/models/rov.glb        — uncompressed glTF binary (source of truth)
 *   assets/models/rov.draco.glb  — Draco-compressed, shipped to the browser
 *   assets/models/rov.stl        — binary STL for 3D printing / CAD import
 *   assets/models/rov.json       — part manifest (hotspots + tri counts) for the site
 *
 * Run:  npm run build:rov
 */
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import gltfPipeline from 'gltf-pipeline';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets', 'models');

/* Node has Blob but not FileReader; GLTFExporter's binary path needs it. */
if (typeof globalThis.FileReader === 'undefined') {
  globalThis.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      blob.arrayBuffer().then((buf) => {
        this.result = buf;
        this.onloadend?.();
      });
    }
  };
}

/* ── Hull dimensions (metres) ───────────────────────────────────────────── */
const W = 2.20;   // beam  (x)
const H = 1.30;   // height (y)
const L = 2.00;   // length (z)
const TUBE = 0.055;

/* ── Materials ──────────────────────────────────────────────────────────── */
const M = {
  frame:   new THREE.MeshStandardMaterial({ name: 'AnodisedAlu',  color: 0x8e9aa3, metalness: 0.92, roughness: 0.42 }),
  foam:    new THREE.MeshStandardMaterial({ name: 'SyntacticFoam', color: 0xf0a92b, metalness: 0.02, roughness: 0.86 }),
  housing: new THREE.MeshStandardMaterial({ name: 'Ti6Al4V',      color: 0xc2ccd4, metalness: 1.0,  roughness: 0.24 }),
  glass:   new THREE.MeshStandardMaterial({ name: 'BorosilDome',  color: 0x0a1a24, metalness: 0.15, roughness: 0.04 }),
  rubber:  new THREE.MeshStandardMaterial({ name: 'Polyurethane', color: 0x11161a, metalness: 0.0,  roughness: 0.92 }),
  prop:    new THREE.MeshStandardMaterial({ name: 'NickelAlBronze', color: 0x39434b, metalness: 0.85, roughness: 0.35 }),
  accent:  new THREE.MeshStandardMaterial({ name: 'Accent',       color: 0x00e5ff, metalness: 0.3,  roughness: 0.28,
                                            emissive: 0x00b4d8, emissiveIntensity: 0.6 }),
  lens:    new THREE.MeshStandardMaterial({ name: 'LEDLens',      color: 0xffffff, metalness: 0.0,  roughness: 0.1,
                                            emissive: 0xdff4ff, emissiveIntensity: 1.0 }),
};

/* ── Primitive helpers ──────────────────────────────────────────────────── */
const deg = (d) => (d * Math.PI) / 180;

function mesh(geo, mat, name, pos = [0, 0, 0], rot = [0, 0, 0]) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(...rot);
  return m;
}

/** Cylindrical strut of length `len` running along `axis` ('x'|'y'|'z'). */
function strut(len, r, axis, pos, name, mat = M.frame, seg = 12) {
  const geo = new THREE.CylinderGeometry(r, r, len, seg, 1, false);
  const rot = axis === 'x' ? [0, 0, deg(90)] : axis === 'z' ? [deg(90), 0, 0] : [0, 0, 0];
  return mesh(geo, mat, name, pos, rot);
}

/** Box with chamfered look, cheap: a box + slight scale, no bevel geometry. */
function block(w, h, d, mat, name, pos, rot = [0, 0, 0]) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, name, pos, rot);
}

/* ── Assembly ───────────────────────────────────────────────────────────── */
const rov = new THREE.Group();
rov.name = 'ABYSS_1';

/* 1 — Open tubular chassis ------------------------------------------------ */
const frame = new THREE.Group();
frame.name = 'chassis';
const hx = W / 2 - TUBE, hy = H / 2 - TUBE, hz = L / 2 - TUBE;

for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    frame.add(strut(L, TUBE, 'z', [sx * hx, sy * hy, 0], `rail_long_${sx > 0 ? 'r' : 'l'}${sy > 0 ? 't' : 'b'}`));
  }
  for (const sz of [-1, 1]) {
    frame.add(strut(H - TUBE * 2, TUBE * 0.85, 'y', [sx * hx, 0, sz * hz], `post_${sx > 0 ? 'r' : 'l'}${sz > 0 ? 'f' : 'a'}`));
  }
}
for (const sy of [-1, 1]) {
  for (const sz of [-1, 1]) {
    frame.add(strut(W, TUBE, 'x', [0, sy * hy, sz * hz], `rail_cross_${sy > 0 ? 't' : 'b'}${sz > 0 ? 'f' : 'a'}`));
  }
}
/* Corner joint spheres tidy up the tube intersections. */
let ji = 0;
for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
  frame.add(mesh(new THREE.SphereGeometry(TUBE * 1.25, 10, 8), M.frame, `joint_${ji++}`, [sx * hx, sy * hy, sz * hz]));
}
rov.add(frame);

/* 2 — Syntactic-foam buoyancy pack --------------------------------------- */
const foam = new THREE.Group();
foam.name = 'buoyancy_pack';
foam.add(block(W * 0.88, 0.30, L * 0.80, M.foam, 'foam_core', [0, hy - 0.02, -0.03]));
foam.add(block(W * 0.60, 0.14, L * 0.52, M.foam, 'foam_crown', [0, hy + 0.20, -0.03]));
/* Grip channels moulded into the pack read as accent strips. */
for (const sx of [-1, 1]) {
  foam.add(block(0.05, 0.33, L * 0.80, M.rubber, `foam_channel_${sx > 0 ? 'r' : 'l'}`, [sx * W * 0.30, hy - 0.02, -0.03]));
}
rov.add(foam);

/* 3 — Pressure housings --------------------------------------------------- */
const hull = new THREE.Group();
hull.name = 'pressure_housings';
for (const sx of [-1, 1]) {
  const tag = sx > 0 ? 'stbd' : 'port';
  hull.add(mesh(new THREE.CylinderGeometry(0.185, 0.185, 1.05, 20, 1, false), M.housing,
    `housing_${tag}`, [sx * 0.46, -0.02, -0.06], [deg(90), 0, 0]));
  /* End caps + bolt flanges */
  for (const sz of [-1, 1]) {
    hull.add(mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.05, 20), M.frame,
      `flange_${tag}_${sz > 0 ? 'f' : 'a'}`, [sx * 0.46, -0.02, -0.06 + sz * 0.53], [deg(90), 0, 0]));
  }
}
rov.add(hull);

/* 4 — Forward camera dome + bezel ---------------------------------------- */
const optics = new THREE.Group();
optics.name = 'optics';
optics.add(mesh(new THREE.SphereGeometry(0.17, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.glass,
  'camera_dome', [0, 0.06, hz - 0.02], [deg(90), 0, 0]));
optics.add(mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.10, 24), M.housing,
  'camera_bezel', [0, 0.06, hz - 0.10], [deg(90), 0, 0]));
optics.add(mesh(new THREE.TorusGeometry(0.172, 0.012, 8, 28), M.accent,
  'camera_ring', [0, 0.06, hz - 0.03]));
/* Multibeam sonar head, top-forward. */
optics.add(mesh(new THREE.CylinderGeometry(0.09, 0.10, 0.16, 16), M.housing,
  'sonar_head', [0, 0.40, hz - 0.06], [deg(72), 0, 0]));
optics.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.02, 16), M.accent,
  'sonar_face', [0, 0.425, hz + 0.02], [deg(72), 0, 0]));
rov.add(optics);

/* 5 — Thrusters ----------------------------------------------------------- */
/** One ducted thruster: shroud, hub, four blades (blades kept as a named node
 *  so the site can spin them independently). */
function thruster(name, pos, rot, radius = 0.155) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.rotation.set(...rot);

  g.add(mesh(new THREE.CylinderGeometry(radius, radius, 0.22, 20, 1, true), M.frame, `${name}_duct`, [0, 0, 0], [deg(90), 0, 0]));
  g.add(mesh(new THREE.TorusGeometry(radius, 0.016, 8, 22), M.frame, `${name}_lip_f`, [0, 0, 0.11]));
  g.add(mesh(new THREE.TorusGeometry(radius, 0.016, 8, 22), M.frame, `${name}_lip_a`, [0, 0, -0.11]));
  g.add(mesh(new THREE.CylinderGeometry(0.055, 0.048, 0.26, 14), M.housing, `${name}_motor`, [0, 0, -0.02], [deg(90), 0, 0]));

  const props = new THREE.Group();
  props.name = `${name}_prop`;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const blade = block(radius * 0.86, 0.012, 0.075, M.prop, `${name}_blade_${i}`,
      [Math.cos(a) * radius * 0.48, Math.sin(a) * radius * 0.48, 0.02], [0, 0, a]);
    blade.rotateOnAxis(new THREE.Vector3(1, 0, 0), deg(26));
    props.add(blade);
  }
  props.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.06, 12), M.prop, `${name}_hub`, [0, 0, 0.02], [deg(90), 0, 0]));
  g.add(props);
  return g;
}

const drive = new THREE.Group();
drive.name = 'propulsion';
/* Four vectored horizontal units, canted 45° for holonomic surge/sway/yaw. */
const VEC = [
  ['thr_fwd_stbd', [ hx - 0.03,  0.02,  hz - 0.30], [0, deg(-45), 0]],
  ['thr_fwd_port', [-hx + 0.03,  0.02,  hz - 0.30], [0, deg( 45), 0]],
  ['thr_aft_stbd', [ hx - 0.03,  0.02, -hz + 0.30], [0, deg(-135), 0]],
  ['thr_aft_port', [-hx + 0.03,  0.02, -hz + 0.30], [0, deg( 135), 0]],
];
for (const [n, p, r] of VEC) drive.add(thruster(n, p, r));
/* Two vertical units for heave. */
drive.add(thruster('thr_vert_stbd', [ 0.78, -0.30, -0.12], [deg(90), 0, 0], 0.135));
drive.add(thruster('thr_vert_port', [-0.78, -0.30, -0.12], [deg(90), 0, 0], 0.135));
rov.add(drive);

/* 6 — LED light pods ------------------------------------------------------ */
const lighting = new THREE.Group();
lighting.name = 'lighting';
for (const sx of [-1, 1]) {
  const tag = sx > 0 ? 'stbd' : 'port';
  lighting.add(mesh(new THREE.CylinderGeometry(0.085, 0.095, 0.20, 16), M.housing,
    `lamp_${tag}_body`, [sx * 0.80, 0.30, hz - 0.14], [deg(84), 0, 0]));
  lighting.add(mesh(new THREE.CylinderGeometry(0.082, 0.082, 0.02, 16), M.lens,
    `lamp_${tag}_lens`, [sx * 0.80, 0.312, hz - 0.04], [deg(84), 0, 0]));
}
rov.add(lighting);

/* 7 — Five-function manipulator ------------------------------------------ */
const arm = new THREE.Group();
arm.name = 'manipulator';
arm.position.set(0.58, -hy + 0.06, hz - 0.34);
arm.add(mesh(new THREE.CylinderGeometry(0.10, 0.11, 0.16, 14), M.housing, 'arm_turret', [0, 0.08, 0]));
const upper = block(0.10, 0.46, 0.13, M.frame, 'arm_upper', [0, 0.34, 0.02], [deg(-22), 0, 0]);
arm.add(upper);
arm.add(mesh(new THREE.SphereGeometry(0.065, 12, 10), M.accent, 'arm_elbow', [0, 0.55, 0.11]));
const fore = block(0.085, 0.40, 0.11, M.frame, 'arm_fore', [0, 0.68, 0.30], [deg(-64), 0, 0]);
arm.add(fore);
for (const sx of [-1, 1]) {
  arm.add(block(0.032, 0.17, 0.05, M.prop, `arm_jaw_${sx > 0 ? 'r' : 'l'}`,
    [sx * 0.045, 0.80, 0.47], [deg(-72), 0, sx * deg(12)]));
}
rov.add(arm);

/* 8 — Landing skids ------------------------------------------------------- */
const skids = new THREE.Group();
skids.name = 'skids';
for (const sx of [-1, 1]) {
  const tag = sx > 0 ? 'stbd' : 'port';
  skids.add(strut(L * 0.94, 0.05, 'z', [sx * 0.80, -hy - 0.20, 0], `skid_${tag}`, M.rubber));
  for (const sz of [-1, 1]) {
    skids.add(strut(0.22, 0.038, 'y', [sx * 0.80, -hy - 0.10, sz * (hz - 0.28)], `skid_leg_${tag}_${sz > 0 ? 'f' : 'a'}`));
  }
}
rov.add(skids);

/* 9 — Tether termination -------------------------------------------------- */
const tether = new THREE.Group();
tether.name = 'tether';
tether.add(mesh(new THREE.CylinderGeometry(0.10, 0.13, 0.18, 16), M.housing, 'tether_gland', [0, hy + 0.32, -0.28]));
{
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, hy + 0.38, -0.28),
    new THREE.Vector3(0.05, hy + 0.62, -0.44),
    new THREE.Vector3(-0.06, hy + 0.84, -0.68),
    new THREE.Vector3(0.04, hy + 0.98, -0.98),
  ]);
  tether.add(mesh(new THREE.TubeGeometry(curve, 28, 0.035, 8, false), M.rubber, 'tether_umbilical'));
}
rov.add(tether);

/* 10 — CTD / sensor rack -------------------------------------------------- */
const sensors = new THREE.Group();
sensors.name = 'sensor_rack';
sensors.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 12), M.housing, 'ctd_probe', [-0.62, 0.30, hz - 0.20], [deg(90), 0, 0]));
sensors.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 12), M.accent, 'ctd_tip', [-0.62, 0.30, hz - 0.02], [deg(90), 0, 0]));
sensors.add(block(0.26, 0.14, 0.18, M.housing, 'doppler_dvl', [0, -hy + 0.10, -0.30]));
sensors.add(mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.04, 10), M.accent, 'dvl_face', [0, -hy + 0.02, -0.30]));
rov.add(sensors);

/* ── Stats ──────────────────────────────────────────────────────────────── */
let tris = 0, meshes = 0;
const parts = [];
rov.traverse((o) => {
  if (!o.isMesh) return;
  meshes++;
  const g = o.geometry;
  const t = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  tris += t;
});
for (const group of rov.children) {
  let gt = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    gt += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());
  parts.push({
    name: group.name,
    triangles: Math.round(gt),
    size: [+size.x.toFixed(3), +size.y.toFixed(3), +size.z.toFixed(3)],
  });
}
const bounds = new THREE.Box3().setFromObject(rov);
const bsize = bounds.getSize(new THREE.Vector3());

/* ── Export ─────────────────────────────────────────────────────────────── */
fs.mkdirSync(OUT, { recursive: true });

const scene = new THREE.Scene();
scene.name = 'ABYSS_1_Scene';
scene.add(rov);

const glb = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true });
const glbBuf = Buffer.from(glb);
fs.writeFileSync(path.join(OUT, 'rov.glb'), glbBuf);

/* Draco-compress the mesh data for the web build. */
const { glbToGltf, gltfToGlb } = gltfPipeline;
const { gltf } = await glbToGltf(glbBuf);
const draco = await gltfToGlb(gltf, {
  dracoOptions: { compressionLevel: 10, quantizePositionBits: 14, quantizeNormalBits: 10 },
});
fs.writeFileSync(path.join(OUT, 'rov.draco.glb'), Buffer.from(draco.glb));

/* Binary STL — one watertight-ish solid for printing / CAD. */
const stl = new STLExporter().parse(scene, { binary: true });
fs.writeFileSync(path.join(OUT, 'rov.stl'), Buffer.from(stl.buffer ?? stl));

const manifest = {
  name: 'ABYSS-1',
  downloads: {
    stl: (stl.buffer ?? stl).byteLength,
    glb: glbBuf.length,
    draco: draco.glb.length,
  },
  subtitle: 'Work-class inspection ROV',
  generated: new Date().toISOString().slice(0, 10),
  units: 'metres',
  dimensions: { beam: +bsize.x.toFixed(2), height: +bsize.y.toFixed(2), length: +bsize.z.toFixed(2) },
  triangles: Math.round(tris),
  meshes,
  parts,
};
fs.writeFileSync(path.join(OUT, 'rov.json'), JSON.stringify(manifest, null, 2));

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
console.log(`ABYSS-1 built — ${meshes} meshes, ${Math.round(tris).toLocaleString()} triangles`);
console.log(`  bounds        ${bsize.x.toFixed(2)} × ${bsize.y.toFixed(2)} × ${bsize.z.toFixed(2)} m`);
console.log(`  rov.glb       ${kb(glbBuf.length)}`);
console.log(`  rov.draco.glb ${kb(draco.glb.length)}  (${(100 - (draco.glb.length / glbBuf.length) * 100).toFixed(1)}% smaller)`);
console.log(`  rov.stl       ${kb((stl.buffer ?? stl).byteLength)}`);
