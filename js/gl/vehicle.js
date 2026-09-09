/**
 * gl/vehicle.js — The ABYSS-1 hull.
 *
 * This used to be a separate turntable act with its own scene and a scissored
 * viewport. It is not any more: the vehicle lives in the reef, and the camera
 * that backed out of its eye simply orbits it, so the whole journey is one
 * continuous shot. What remains here is what that needs — decode the Draco GLB,
 * normalise it, and build the environment its metals reflect.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function createVehicle({ renderer }) {
  const root = new THREE.Group();
  root.name = 'ABYSS_1';

  let ready = false;
  let manifest = null;
  let environment = null;

  /* Anodised aluminium and titanium with nothing to reflect render black, so
     the hull needs an image-based light, not just lamps. This is the single
     biggest factor in the vehicle reading as metal rather than as plastic. */
  if (renderer) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
  }

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

    const scene = gltf.scene;

    /* Normalise. Frame on the chassis rather than the whole bounding box: the
       tether rises well above the hull, and centring on that would sink the
       vehicle out of every shot it appears in. */
    const box = new THREE.Box3().setFromObject(scene);
    const size = box.getSize(new THREE.Vector3());
    const chassis = scene.getObjectByName('chassis');
    const centre = chassis
      ? new THREE.Box3().setFromObject(chassis).getCenter(new THREE.Vector3())
      : box.getCenter(new THREE.Vector3());

    scene.position.sub(centre);
    scene.scale.setScalar(3.0 / Math.max(size.x, size.z));

    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      o.material.envMapIntensity = 1.15;
    });

    root.add(scene);
    ready = true;
    return gltf;
  }

  /** A crude stand-in, so a failed download never leaves the reef empty. */
  function loadFallback() {
    const g = new THREE.Group();
    g.name = 'chassis';
    g.add(new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 1.1, 2.0),
      new THREE.MeshStandardMaterial({ color: 0x7d8b95, metalness: 0.8, roughness: 0.4 })
    ));
    const foam = new THREE.Mesh(
      new THREE.BoxGeometry(2.0, 0.5, 1.7),
      new THREE.MeshStandardMaterial({ color: 0xf0a92b, roughness: 0.9 })
    );
    foam.position.y = 0.75;
    g.add(foam);
    root.add(g);
    ready = true;
  }

  /**
   * A copy of the hull for the reef scene. Geometry and materials are shared
   * with the source; only the transform is independent.
   */
  function makeWorldInstance(scale = 1) {
    if (!ready) return null;
    const clone = root.clone(true);
    clone.name = 'ABYSS1_world';
    clone.position.set(0, 0, 0);
    clone.rotation.set(0, 0, 0);
    clone.scale.setScalar(scale);
    return clone;
  }

  return {
    load,
    loadFallback,
    makeWorldInstance,
    get environment() { return environment; },
    get ready() { return ready; },
    get manifest() { return manifest; },
    setManifest(m) { manifest = m; },
  };
}
