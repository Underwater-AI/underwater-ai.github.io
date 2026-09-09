/**
 * app.js — Entry point. Boots the dive, then hands the page to the story.
 *
 * Order matters: nothing is shown until the assets the first minute of the film
 * needs are actually in memory, because a cinematic opening that pops in
 * half-loaded is worse than a slightly longer wait.
 */
import { createStage } from './gl/core.js';
import { createOcean } from './gl/ocean.js';
import { createVehicle } from './gl/vehicle.js';
import { createReconstruct } from './gl/reconstruct.js';
import { createLoader, loadFonts, fetchWithProgress, preloadImages } from './loader.js';
import { initTypography, fitHeadings } from './typo.js';
import { initWorkstation } from './workstation.js';
import { initSmoothScroll, initStory, playIntro } from './story.js';
import { createLiveDetect } from './livedetect.js';
import { initMenu, applyDownloadSizes, applyManifest } from './ui.js';
import { initDocks, initCardDetails } from './dock.js';
import { initTheme, onThemeChange } from './theme.js';

const HULL = 'assets/models/rov.draco.glb';
const FRAME = 'output_images/realesr_general_4x_output.png';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── Boot screen wiring ───────────────────────────────────────────────────── */
const bootEl = document.getElementById('boot');
const fillEl = document.getElementById('boot-fill');
const taskEl = document.getElementById('boot-task');
const pctEl = document.getElementById('boot-pct');
const logEl = document.getElementById('boot-log');
const depthEl = document.getElementById('boot-depth-num');
const enterEl = document.getElementById('boot-enter');

const logged = new Set();

const loader = createLoader((frac, task) => {
  const pct = Math.round(frac * 100);
  if (fillEl) fillEl.style.width = `${pct}%`;
  if (pctEl) pctEl.textContent = `${pct}%`;
  if (taskEl && task) taskEl.textContent = task.label;
  // The depth readout descends in step with the load, so the wait is diegetic.
  if (depthEl) depthEl.textContent = String(Math.round(frac * 2412)).padStart(4, '0');
});

function bootLog(text, ok = true) {
  if (!logEl || logged.has(text)) return;
  logged.add(text);
  const li = document.createElement('li');
  li.innerHTML = ok ? `${text} · <b>OK</b>` : text;
  logEl.append(li);
  while (logEl.children.length > 6) logEl.firstElementChild.remove();
}

/* ── Build the 3D acts ────────────────────────────────────────────────────── */
const canvas = document.getElementById('gl');
const lowPower = (navigator.hardwareConcurrency || 8) <= 4
  || matchMedia('(max-width: 40rem)').matches;

let stage = null;
let ocean = null;
let vehicle = null;
let recon = null;

try {
  stage = createStage(canvas);
  ocean = createOcean({ quality: lowPower ? 'low' : 'high' });
  vehicle = createVehicle({ renderer: stage.renderer });
  recon = createReconstruct({ src: FRAME });

  stage.register('ocean', ocean);
  stage.register('recon', recon);
  stage.setAct('ocean');
  stage.setMurk(1);
} catch (err) {
  // No WebGL (or a lost context): the page must still be a complete document.
  console.warn('[UnderwaterAI] 3D stage unavailable:', err);
  canvas?.style.setProperty('display', 'none');
}

/* ── Load everything the opening needs ────────────────────────────────────── */
async function boot() {
  initTheme();
  // Keep the water in step with the page palette.
  onThemeChange((mode) => {
    stage?.setTheme?.(mode);
    ocean?.setTheme?.(mode);
  });
  initMenu();
  initDocks();
  initCardDetails();
  initTypography();

  // 1 — animation libraries (deferred classic scripts, already in flight)
  for (let i = 0; i < 60 && !window.gsap; i++) {
    await new Promise((r) => setTimeout(r, 25));
    loader.set('libs', Math.min(0.9, i / 20));
  }
  loader.set('libs', 1);
  bootLog('Tether uplink');

  // 2 — fonts, before any text measurement happens
  await loadFonts();
  loader.set('fonts', 1);
  bootLog('Optics calibrated');
  fitHeadings();

  // 3 — the hull, streamed with real byte progress
  let manifest = null;
  try {
    const buf = await fetchWithProgress(HULL, (f) => loader.set('hull', f * 0.85));
    if (vehicle) await vehicle.load(buf);
    loader.set('hull', 0.95);
    manifest = await fetch('assets/models/rov.json').then((r) => r.json()).catch(() => null);
    vehicle?.setManifest(manifest);
    applyManifest(manifest);
    applyDownloadSizes(manifest);
    bootLog(`Hull geometry · ${manifest ? manifest.triangles.toLocaleString() : '10,540'} tris`);
  } catch (err) {
    console.warn('[UnderwaterAI] hull load failed, using fallback:', err);
    vehicle?.loadFallback();
    bootLog('Hull geometry · fallback', false);
  }

  /* Attach whichever hull we ended up with — the real one or the stand-in.
     This sits outside the try so a failed download still leaves something for
     the pull-back reveal to show; an empty reveal would be worse than a crude
     one. The studio's environment map is shared so the metals read in both. */
  if (ocean && vehicle?.ready) {
    ocean.attachVehicle(vehicle.makeWorldInstance(1.35));
    if (vehicle.environment) ocean.scene.environment = vehicle.environment;
  }
  loader.set('hull', 1);

  // 4 — imagery
  await preloadImages([FRAME, 'test_images/underwater_test.jpg'], (f) => loader.set('imagery', f * 0.7));
  if (recon) await recon.build();
  loader.set('imagery', 1);
  bootLog('Frame buffers primed');

  // 5 — first frames, so the reveal is never a stutter
  stage?.start();
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  loader.set('scene', 1);
  bootLog('LED array charged');

  return manifest;
}

/* ── Lift the boot screen and start the film ──────────────────────────────── */
let entered = false;

function enterDive() {
  if (entered) return;
  entered = true;

  bootEl?.classList.add('is-leaving');
  setTimeout(() => bootEl?.setAttribute('hidden', ''), reduced ? 0 : 1100);

  const lenis = initSmoothScroll();
  const workstation = initWorkstation(document.getElementById('ws'));
  const liveDetect = ocean
    ? createLiveDetect({ overlay: document.getElementById('live-overlay'), ocean })
    : null;

  const story = initStory({ stage, ocean, vehicle, recon, workstation, liveDetect });
  playIntro();

  // Re-measure once everything is on screen and pins are laid out.
  requestAnimationFrame(() => {
    fitHeadings();
    window.ScrollTrigger?.refresh();
  });

  window.UnderwaterAI = {
    version: '5.0.0',
    stage, ocean, vehicle, recon, workstation, liveDetect, story, lenis,
    ready: true,
    get act() { return stage?.getAct?.() ?? null; },
    get murk() { return stage?.getMurk?.() ?? null; },
  };
  document.documentElement.dataset.uwReady = 'true';
}

boot()
  .catch((err) => {
    console.error('[UnderwaterAI] boot failed:', err);
    bootLog('Boot degraded — continuing', false);
  })
  .finally(() => {
    if (enterEl) {
      enterEl.classList.add('is-ready');
      enterEl.addEventListener('click', enterDive, { once: true });
    }
    if (taskEl) taskEl.textContent = 'All systems nominal';
    // Give the reader a beat to press the button; otherwise take them down.
    setTimeout(enterDive, reduced ? 200 : 2200);
  });

// A hard failure must never leave a reader staring at the boot screen.
setTimeout(() => { if (!entered) enterDive(); }, 15000);
