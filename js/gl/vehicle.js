/**
 * gl/vehicle.js — Act two: ABYSS-1 on a turntable.
 *
 * The GLB arrives as an ArrayBuffer the boot loader already streamed, so this
 * module never re-downloads it. Rendering is scissored to the on-page viewport
 * frame, and hotspot markers are projected from the real named nodes inside the
 * model — so a label can never drift away from the part it points at.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createVehicle({ viewportEl, renderer }) {
  const scene = new THREE.Scene();
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 1.15, 6.8);

  /* The hull is mostly anodised aluminium and titanium. Metal with no
     environment to reflect renders black, so the studio needs an IBL, not just
     lamps — this is the single biggest factor in the vehicle reading as metal. */
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

  /* Studio rig: key, rim and fill, plus a cyan uplight for the brand read. */
  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a2432, 1.6));
  const key = new THREE.DirectionalLight(0xffffff, 4.2);
  key.position.set(4, 6, 5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x66e6ff, 5.0);
  rim.position.set(-5, 2, -4);
  scene.add(rim);
  const fill = new THREE.PointLight(0x38e1ff, 60, 26, 1);
  fill.position.set(0, -2.6, 2.5);
  scene.add(fill);

  const turntable = new THREE.Group();
  scene.add(turntable);

  const model = new THREE.Group();
  turntable.add(model);

  /* A faint ground disc so the vehicle is not floating in a void. */
  {
    const g = new THREE.RingGeometry(1.2, 3.4, 48);
    const m = new THREE.MeshBasicMaterial({
      color: 0x1a5f78, transparent: true, opacity: 0.16,
      side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const ring = new THREE.Mesh(g, m);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.5;
    scene.add(ring);
  }

  const partNodes = new Map();
  const propNodes = [];
  let ready = false;
  let manifest = null;

  async function load(glbBuffer) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('vendor/draco/');
    draco.setDecoderConfig({ type: 'wasm' });

    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    const gltf = await new Promise((resolve, reject) => {
      loader.parse(glbBuffer, '', resolve, reject);
    });
    draco.dispose();

    const root = gltf.scene;

    // Normalise: centre on the origin and scale to a predictable screen size.
    // Frame on the chassis, not the whole bounding box — the tether rises well
    // above the vehicle, and centring on that would sink the hull out of shot.
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const chassis = root.getObjectByName('chassis');
    const centre = chassis
      ? new THREE.Box3().setFromObject(chassis).getCenter(new THREE.Vector3())
      : box.getCenter(new THREE.Vector3());

    const scale = 3.0 / Math.max(size.x, size.z);
    root.position.sub(centre);
    root.scale.setScalar(scale);

    root.traverse((o) => {
      if (o.name?.endsWith('_prop')) propNodes.push(o);
      if (!partNodes.has(o.name) && o.name) partNodes.set(o.name, o);
      if (o.isMesh) {
        o.frustumCulled = true;
        if (o.material) {
          o.material.envMapIntensity = 1.15;
          // Emissive parts (lamp lenses, accents) should read as lit.
          if (o.material.emissive && o.material.emissiveIntensity > 0) {
            o.material.toneMapped = true;
          }
        }
      }
    });

    model.add(root);
    ready = true;
    return gltf;
  }

  /**
   * A copy of the hull for the reef scene, so the pull-back reveal can show the
   * vehicle that has been carrying the camera all along. Geometry and materials
   * are shared with the studio copy; only the transform is independent.
   */
  function makeWorldInstance(scale = 1) {
    if (!ready) return null;
    const clone = model.clone(true);
    clone.name = 'ABYSS1_world';
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(scale);
    return clone;
  }

  /* If the hull ever fails to arrive, the section must still show something. */
  function loadFallback() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x7d8b95, metalness: 0.8, roughness: 0.4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 2.0), mat);
    const foam = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.5, 1.7),
      new THREE.MeshStandardMaterial({ color: 0xf0a92b, roughness: 0.9 })
    );
    foam.position.y = 0.75;
    const g = new THREE.Group();
    g.add(body, foam);
    g.name = 'chassis';
    model.add(g);
    partNodes.set('chassis', g);
    ready = true;
  }

  /* ── Scroll-driven turntable + explode ─────────────────────────────────── */
  let spin = 0, targetSpin = 0;
  let explode = 0, targetExplode = 0;
  let tilt = 0, targetTilt = 0;

  const _v = new THREE.Vector3();
  const _c = new THREE.Vector3();

  function viewport() {
    if (!viewportEl) return null;
    const r = viewportEl.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { x: 0, y: 0, w: 0, h: 0 };
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    // WebGL's origin is bottom-left; the DOM's is top-left.
    return { x: r.left, y: innerHeight - r.bottom, w: r.width, h: r.height };
  }

  /**
   * Place DOM hotspot markers over their real parts, in screen space, then
   * resolve label collisions. Two labels stacked on each other is the most
   * likely text collision on the page, so it is handled explicitly rather
   * than left to chance.
   */
  const LABEL_H = 26;      // label box height plus breathing room

  function projectHotspots(nodes) {
    if (!ready || !viewportEl) return;
    const r = viewportEl.getBoundingClientRect();
    if (r.width < 2) return;

    const placed = [];
    for (const el of nodes) {
      const part = partNodes.get(el.dataset.hotspot);
      if (!part) { el.classList.remove('is-on'); continue; }

      new THREE.Box3().setFromObject(part).getCenter(_c);
      _v.copy(_c).project(camera);

      const x = (_v.x * 0.5 + 0.5) * r.width;
      const y = (-_v.y * 0.5 + 0.5) * r.height;
      const visible = _v.z < 1 && x > 10 && x < r.width - 10 && y > 14 && y < r.height - 14;

      el.classList.toggle('is-on', visible);
      if (!visible) continue;
      // Flip the label inward near the right edge so it can never hang out.
      const flip = x > r.width * 0.58;
      el.classList.toggle('hotspot--flip', flip);
      placed.push({ el, x, y, flip });
    }

    // Nudge overlapping labels apart vertically, nearest-to-top wins its spot.
    placed.sort((a, b) => a.y - b.y);
    for (let i = 1; i < placed.length; i++) {
      const cur = placed[i];
      for (let j = 0; j < i; j++) {
        const prev = placed[j];
        // Only labels on the same side of the model can actually collide.
        if (prev.flip !== cur.flip) continue;
        if (Math.abs(cur.x - prev.x) > 190) continue;
        if (cur.y - prev.y < LABEL_H) cur.y = prev.y + LABEL_H;
      }
    }
    for (const p of placed) {
      p.el.style.left = `${p.x}px`;
      p.el.style.top = `${Math.min(p.y, r.height - 14)}px`;
    }
  }

  return {
    scene,
    camera,
    clearColor: 0x050b12,
    viewport,
    load,
    loadFallback,
    projectHotspots,
    makeWorldInstance,
    /** The studio IBL, shared with the reef scene so metals read there too. */
    get environment() { return scene.environment; },
    get ready() { return ready; },
    get manifest() { return manifest; },
    setManifest(m) { manifest = m; },
    /** Story hook: 0 at section entry, 1 at section exit. */
    setProgress(p) {
      targetSpin = p * Math.PI * 1.9;
      targetExplode = Math.sin(Math.min(1, Math.max(0, p)) * Math.PI) * 0.55;
      targetTilt = -0.12 + p * 0.34;
    },
    resize() { /* aspect is recomputed each frame from the DOM box */ },
    update(t, dt) {
      spin += (targetSpin - spin) * Math.min(1, dt * 3);
      explode += (targetExplode - explode) * Math.min(1, dt * 3);
      tilt += (targetTilt - tilt) * Math.min(1, dt * 3);

      turntable.rotation.y = spin + t * 0.09;
      turntable.rotation.x = tilt;
      model.position.y = Math.sin(t * 0.6) * 0.045;

      // Thrusters idle-spin; they speed up as the section is explored.
      for (const p of propNodes) p.rotation.z += dt * (2.2 + explode * 18);

      fill.intensity = 52 + Math.sin(t * 1.7) * 10;
    },
  };
}
