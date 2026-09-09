/**
 * livedetect.js — Detection boxes that lock onto the live 3D creatures.
 *
 * This is the moment the story is built around: once the water clears, the
 * rover starts naming what it sees. Each box is projected from the actual
 * bounding box of a creature in the scene every frame, so a label can never
 * point at empty water, and boxes that would overlap are pushed apart.
 */
import * as THREE from 'three';
import { packLabels } from './labelpack.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3();
const CORNERS = Array.from({ length: 8 }, () => new THREE.Vector3());

export function createLiveDetect({ overlay, ocean, avoid = '.dock' }) {
  if (!overlay || !ocean) return null;

  const nodes = new Map();          // creature object -> DOM box
  let engaged = 0;                  // 0 = off, 1 = every target locked
  let revealed = 0;

  function ensureNode(target, index) {
    let el = nodes.get(target);
    if (el) return el;

    const sp = target.userData.species;
    el = document.createElement('div');
    el.className = `det det--live${sp.kind ? ` det--${sp.kind}` : ''}`;
    // Corner brackets rather than a closed rectangle: that is how tracking
    // overlays actually read, and it keeps the animal visible inside the box.
    el.innerHTML =
      '<span class="det__c det__c--tl"></span><span class="det__c det__c--tr"></span>' +
      '<span class="det__c det__c--bl"></span><span class="det__c det__c--br"></span>' +
      `<span class="det__tag">` +
        `<b class="det__id">TRK-${String(index + 1).padStart(2, '0')}</b>` +
        `<span class="det__name">${sp.name}</span>` +
        `<b class="det__conf">${sp.conf.toFixed(1)}%</b>` +
      `</span>` +
      `<span class="det__meta">` +
        `<i class="det__latin">${sp.latin}</i>` +
        `<span class="det__bar"><i style="width:${sp.conf}%"></i></span>` +
      `</span>`;
    overlay.append(el);
    nodes.set(target, el);
    return el;
  }

  /** Screen-space AABB of a 3D object, in overlay pixels. */
  function projectBox(target, camera, w, h) {
    _box.setFromObject(target);
    if (_box.isEmpty()) return null;

    const { min, max } = _box;
    CORNERS[0].set(min.x, min.y, min.z); CORNERS[1].set(max.x, min.y, min.z);
    CORNERS[2].set(min.x, max.y, min.z); CORNERS[3].set(max.x, max.y, min.z);
    CORNERS[4].set(min.x, min.y, max.z); CORNERS[5].set(max.x, min.y, max.z);
    CORNERS[6].set(min.x, max.y, max.z); CORNERS[7].set(max.x, max.y, max.z);

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const c of CORNERS) {
      _v.copy(c).project(camera);
      // Any corner behind the camera makes the projection meaningless.
      if (_v.z > 1) return null;
      const sx = (_v.x * 0.5 + 0.5) * w;
      const sy = (-_v.y * 0.5 + 0.5) * h;
      if (sx < x0) x0 = sx;
      if (sy < y0) y0 = sy;
      if (sx > x1) x1 = sx;
      if (sy > y1) y1 = sy;
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  return {
    /** Story hook: 0 = detector off, 1 = fully engaged. */
    setEngaged(v) { engaged = Math.min(1, Math.max(0, v)); },
    get engaged() { return engaged; },
    get lockCount() { return revealed; },

    update() {
      const w = overlay.clientWidth;
      const h = overlay.clientHeight;
      if (!w || !h) return;

      /* The instrument panel owns its part of the canopy. A detection box laid
         over the copy is exactly the text/UI collision this design is meant to
         avoid, so those detections are simply dropped this frame. */
      const host = overlay.getBoundingClientRect();
      const blocks = [];
      for (const el of document.querySelectorAll(avoid)) {
        const r = el.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        if (r.bottom < host.top || r.top > host.bottom) continue;
        if (r.right < host.left || r.left > host.right) continue;
        blocks.push({
          x: r.left - host.left, y: r.top - host.top,
          w: r.width, h: r.height,
        });
      }
      const blocked = (b) => blocks.some((k) => {
        const ox = Math.max(0, Math.min(b.x + b.w, k.x + k.w) - Math.max(b.x, k.x));
        const oy = Math.max(0, Math.min(b.y + b.h, k.y + k.h) - Math.max(b.y, k.y));
        // A label needs its own clear run to the left of the box, too.
        return (ox * oy) > b.w * b.h * 0.22;
      });

      const camera = ocean.camera;
      const targets = ocean.targets || [];
      // Targets light up progressively, so detection reads as work being done.
      const budget = Math.round(engaged * targets.length);

      const placed = [];
      let live = 0;

      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const el = ensureNode(target, i);

        if (i >= budget) { el.classList.remove('is-on'); continue; }

        const b = projectBox(target, camera, w, h);
        // Reject anything off-frame or too small to be a credible detection.
        const ok = b
          && b.w > 26 && b.h > 26
          && b.w < w * 0.72 && b.h < h * 0.82
          && b.x + b.w > 12 && b.x < w - 12
          && b.y + b.h > 12 && b.y < h - 12;

        if (!ok || blocked(b)) { el.classList.remove('is-on'); continue; }

        el.style.left = `${b.x}px`;
        el.style.top = `${b.y}px`;
        el.style.width = `${b.w}px`;
        el.style.height = `${b.h}px`;
        el.classList.add('is-on');
        // A tag that would sit above the top edge flips inside its own box.
        el.classList.toggle('det--tag-inside', b.y < 26);
        placed.push({ el, ...b });
        live++;
      }

      // Labels are packed by the shared helper, the same one Abyssal Studio
      // uses, so both detectors behave identically.
      packLabels(placed, { height: 22, gap: 6, bounds: { w, h } });

      revealed = live;
    },
  };
}
