/**
 * loader.js — Weighted, byte-accurate boot loader.
 *
 * The boot screen is only honest if its bar tracks real work, so every task
 * below reports actual progress: the hull GLB streams its bytes, fonts wait on
 * document.fonts, images wait on decode().
 */

const TASKS = [
  { id: 'libs',    weight: 6,  label: 'Spooling tether',        log: 'uplink established' },
  { id: 'fonts',   weight: 8,  label: 'Calibrating optics',     log: 'lens profile loaded' },
  { id: 'hull',    weight: 46, label: 'Decoding hull geometry', log: 'ABYSS-1 draco stream' },
  { id: 'imagery', weight: 22, label: 'Priming imagery buffers', log: 'frame cache warm' },
  { id: 'scene',   weight: 18, label: 'Charging LED array',     log: 'illumination nominal' },
];

const TOTAL = TASKS.reduce((s, t) => s + t.weight, 0);

export function createLoader(onProgress) {
  const done = new Map();
  let current = TASKS[0];

  const emit = () => {
    let acc = 0;
    for (const t of TASKS) acc += (done.get(t.id) ?? 0) * t.weight;
    onProgress(acc / TOTAL, current);
  };

  return {
    /** Mark a task's fractional completion (0..1). */
    set(id, frac) {
      const task = TASKS.find((t) => t.id === id);
      if (!task) return;
      done.set(id, Math.min(1, Math.max(0, frac)));
      current = task;
      emit();
    },
    tasks: TASKS,
  };
}

/** Wait for the webfonts the layout actually depends on. */
export async function loadFonts() {
  if (!document.fonts) return;
  const faces = [
    '500 1rem "Space Grotesk"',
    '600 1rem "Space Grotesk"',
    '400 1rem Inter',
    '500 1rem Inter',
    '400 1rem "JetBrains Mono"',
  ];
  await Promise.all(faces.map((f) => document.fonts.load(f).catch(() => {})));
  await document.fonts.ready.catch(() => {});
}

/** Stream a binary asset, reporting real byte progress. */
export async function fetchWithProgress(url, onFrac) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);

  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !total) {
    const buf = await res.arrayBuffer();
    onFrac?.(1);
    return buf;
  }

  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onFrac?.(Math.min(0.999, received / total));
  }
  const out = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  onFrac?.(1);
  return out.buffer;
}

/** Decode images off the main thread where the browser allows it. */
export async function preloadImages(urls, onFrac) {
  let n = 0;
  await Promise.all(urls.map(async (src) => {
    try {
      const img = new Image();
      img.decoding = 'async';
      img.src = src;
      await (img.decode?.() ?? new Promise((r) => { img.onload = img.onerror = r; }));
    } catch {
      /* a missing decorative image must never block the dive */
    }
    onFrac?.(++n / urls.length);
  }));
}

/** Human-readable byte size for the download chips. */
export function humanBytes(n) {
  if (!n) return '';
  return n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`;
}
