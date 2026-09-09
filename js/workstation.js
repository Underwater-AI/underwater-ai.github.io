/**
 * workstation.js — "Abyssal Studio", the analysis workbench.
 *
 * A real analysis pass, staged: pick a tool, a sweep runs over the frame, the
 * console streams what the pipeline is doing, then boxes and inspector rows
 * land together. Boxes are authored against the actual contents of the demo
 * frame (a snapper school, two divers, reef wall and sediment), so the labels
 * point at real things.
 */

import { packLabels } from './labelpack.js';

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* Boxes are percentages of the frame: [left, top, width, height]. */
const PASSES = {
  species: {
    label: 'Species ID',
    console: [
      'detect.species --model yolov8-marine --weights marine15k_v4.2.engine',
      'backend: <b>TensorRT INT8</b> · device: Jetson Orin NX',
      'tiling 1280x853 into 4 tiles @ 640 px, overlap 64',
      'inference <b>47.3 ms</b> · NMS 2.1 ms · 15,412 classes',
      '<b>7 objects</b> above confidence 0.55',
      'export ready: dive_0417_reef.detections.json',
    ],
    hits: [
      { name: 'Bluestripe snapper', latin: 'Lutjanus kasmira · x64', conf: 97.8, kind: '', box: [1.5, 2.5, 30, 35] },
      { name: 'Bluestripe snapper', latin: 'Lutjanus kasmira · x51', conf: 96.4, kind: '', box: [5, 59, 32, 37] },
      { name: 'Yellowfin goatfish', latin: 'Mulloidichthys vanicolensis · x12', conf: 91.2, kind: '', box: [36, 25, 18, 29] },
      { name: 'Diver', latin: 'Homo sapiens · primary', conf: 99.1, kind: '', box: [52, 17, 31, 48] },
      { name: 'Diver', latin: 'Homo sapiens · secondary', conf: 87.4, kind: '', box: [73.5, 50, 16, 22] },
      { name: 'Encrusting coral', latin: 'Porites sp.', conf: 89.5, kind: 'coral', box: [39, 71, 20, 26] },
      { name: 'Soft coral', latin: 'Dendronephthya sp.', conf: 84.6, kind: 'coral', box: [44, 3, 14, 18] },
    ],
  },
  geology: {
    label: 'Geology',
    console: [
      'analyse.substrate --model geo-seg-v2 --resolution 1024',
      'segmenting substrate classes · 9 categories',
      'inference <b>63.8 ms</b> · texture entropy pass 11.4 ms',
      '<b>3 formations</b> classified · confidence >= 0.70',
      'georeference: 11.6721 N, 92.7465 E (+/- 2.4 m, DVL-aided)',
    ],
    hits: [
      { name: 'Carbonate reef wall', latin: 'bioherm framework', conf: 93.7, kind: 'geo', box: [27, 0, 31, 29] },
      { name: 'Coral rubble', latin: 'clastic talus apron', conf: 81.2, kind: 'geo', box: [40, 70, 21, 28] },
      { name: 'Bioclastic sand', latin: 'carbonate sediment plain', conf: 88.9, kind: 'geo', box: [61, 79, 37, 20] },
    ],
  },
  threat: {
    label: 'Threat scan',
    console: [
      'scan.threat --catalogue naval_v3 --sensitivity high',
      'cross-checking sonar return against optical contacts',
      'inference <b>38.9 ms</b> · 0 ordnance signatures matched',
      '<i>2 unregistered divers in restricted volume</i>',
      '1 anthropogenic structure logged for review',
    ],
    hits: [
      { name: 'Unregistered diver', latin: 'contact 01 · bearing 043', conf: 99.1, kind: 'threat', box: [52, 17, 31, 48] },
      { name: 'Unregistered diver', latin: 'contact 02 · bearing 061', conf: 87.4, kind: 'threat', box: [73.5, 50, 16, 22] },
      { name: 'Anthropogenic structure', latin: 'submerged hull section', conf: 76.3, kind: 'threat', box: [56, 0, 23, 15] },
    ],
  },
  restore: {
    label: 'Restore',
    console: [
      'restore.frame --pipeline udnet+lu2net --scale 4x',
      'colour-cast inversion · backscatter removal · SR',
      'inference <b>30.1 ms</b> · PSNR +26.4 dB · UIQM 3.71',
      'frame restored, handing off to perception stage',
    ],
    hits: [],
  },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, reduced ? 0 : ms));

export function initWorkstation(root) {
  if (!root) return null;

  const overlay = root.querySelector('#ws-overlay');
  const scan = root.querySelector('#ws-scan');
  const hitsEl = root.querySelector('#ws-hits');
  const countEl = root.querySelector('#ws-count');
  const consoleEl = root.querySelector('#ws-console');
  const tools = [...root.querySelectorAll('.tool')];
  const viewport = root.querySelector('#ws-viewport');

  let runId = 0;
  let lastPass = null;

  function log(html) {
    const li = document.createElement('li');
    li.innerHTML = html;
    consoleEl.append(li);
    while (consoleEl.children.length > 14) consoleEl.firstElementChild.remove();
  }

  function clear() {
    runId++;
    overlay.replaceChildren();
    hitsEl.replaceChildren();
    countEl.textContent = '0';
    lastPass = null;
    for (const t of tools) t.classList.remove('is-active', 'is-busy');
    scan.style.opacity = '0';
  }

  async function run(toolName) {
    const pass = PASSES[toolName];
    if (!pass) return;

    const id = ++runId;
    lastPass = toolName;

    overlay.replaceChildren();
    hitsEl.replaceChildren();
    countEl.textContent = '0';

    for (const t of tools) t.classList.toggle('is-active', t.dataset.tool === toolName);
    const btn = tools.find((t) => t.dataset.tool === toolName);
    btn?.classList.add('is-busy');

    log(`<b>&gt;</b> ${pass.console[0]}`);

    // Sweep the frame while "inference" runs.
    if (!reduced && viewport) {
      scan.style.opacity = '1';
      const anim = scan.animate(
        [{ transform: 'translateY(0)' }, { transform: `translateY(${viewport.clientHeight}px)` }],
        { duration: 900, easing: 'cubic-bezier(.4,0,.2,1)' }
      );
      await anim.finished.catch(() => {});
      scan.style.opacity = '0';
    }
    if (id !== runId) return;

    for (let i = 1; i < pass.console.length; i++) {
      await sleep(150);
      if (id !== runId) return;
      log(pass.console[i]);
    }

    btn?.classList.remove('is-busy');

    /* On a narrow screen seven boxes over a small frame is a thicket, not a
       result. Draw the most confident few instead — the inspector still lists
       every hit, so nothing is lost, it just stops shouting. */
    const narrow = innerWidth < 560;
    const drawn = narrow
      ? [...pass.hits].sort((a, b) => b.conf - a.conf).slice(0, 4)
      : pass.hits;

    // Land the boxes and inspector rows together, staggered.
    let shown = 0;
    for (const hit of pass.hits) {
      const withBox = drawn.includes(hit);
      if (id !== runId) return;

      let box = null;
      if (withBox) {
        const [x, y, w, h] = hit.box;
        box = document.createElement('div');
        box.className = `det${hit.kind ? ` det--${hit.kind}` : ''}`;
        box.style.cssText = `left:${x}%;top:${y}%;width:${w}%;height:${h}%`;
        const tag = document.createElement('span');
        tag.className = 'det__tag';
        tag.innerHTML =
          `<span class="det__name">${hit.name}</span>` +
          `<b class="det__conf">${hit.conf.toFixed(1)}%</b>`;
        box.append(tag);
        overlay.append(box);
      }

      const row = document.createElement('div');
      row.className = `hit${hit.kind ? ` hit--${hit.kind}` : ''}`;
      row.innerHTML =
        `<span class="hit__swatch"></span>` +
        `<span><span class="hit__name">${hit.name}</span><br>` +
        `<span class="hit__latin">${hit.latin}</span></span>` +
        `<span class="hit__conf">${hit.conf.toFixed(1)}%</span>`;
      hitsEl.append(row);

      await sleep(90);
      if (id !== runId) return;
      box?.classList.add('is-on');
      row.classList.add('is-on');
      countEl.textContent = String(++shown);
      if (box) repack();
    }
  }

  /* Boxes are positioned in percentages, so their pixel geometry changes with
     the viewport — the labels have to be re-packed on every resize too. */
  function repack() {
    const host = overlay.getBoundingClientRect();
    if (host.width < 8) return;
    const boxes = [...overlay.querySelectorAll('.det')].map((el) => {
      const r = el.getBoundingClientRect();
      return { el, x: r.left - host.left, y: r.top - host.top, w: r.width, h: r.height };
    });
    packLabels(boxes, { height: 24, gap: 6, bounds: { w: host.width, h: host.height } });
  }

  let repackRaf = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(repackRaf);
    repackRaf = requestAnimationFrame(repack);
  }, { passive: true });

  for (const t of tools) {
    t.addEventListener('click', () => {
      const name = t.dataset.tool;
      if (name === 'clear') { clear(); log('<b>&gt;</b> workspace cleared'); return; }
      run(name);
    });
  }

  log('<b>&gt;</b> abyssal-studio 2.4 ready');
  log('loaded dive_0417_reef.seq · 1 frame · 1280x853');

  return {
    run,
    clear,
    repack,
    get lastPass() { return lastPass; },
    get count() { return overlay.children.length; },
  };
}
