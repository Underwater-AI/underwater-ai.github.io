/**
 * site.spec.mjs — Underwater AI end-to-end suite.
 *
 * Run with `npm test` (which starts the static server for you) or point it at
 * a deployed origin:  BASE_URL=https://underwaterai.org node tests/site.spec.mjs
 *
 * The suite is deliberately opinionated about two things the design depends on:
 *   1. no text ever overflows its container (checked with Pretext, not eyeballs)
 *   2. no chapter introduces horizontal scroll at any supported width
 */
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const HEADFUL = process.env.HEADFUL === '1';

/**
 * SMOKE=1 trims the run to "is the deployed thing actually working".
 *
 * The full layout matrix, both themes and the contrast audit all run against
 * the exact same code before it ships, so re-running them against production
 * only proves the network works. What is worth re-checking after a deploy is
 * that every asset resolves from the real origin and the story still plays.
 */
const SMOKE = process.env.SMOKE === '1';

const ALL_VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1180, height: 820 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'phone', width: 390, height: 844 },
  { name: 'phone-sm', width: 320, height: 690 },
];
const VIEWPORTS = SMOKE
  ? [ALL_VIEWPORTS[0], ALL_VIEWPORTS[3]]
  : ALL_VIEWPORTS;

const SECTIONS = [
  'descent', 'murk', 'enhance', 'identify', 'reveal',
  'vehicle', 'perception', 'reconstruct', 'suite', 'deploy', 'team', 'contact',
];

/* ── Tiny assertion harness ──────────────────────────────────────────────── */
let passed = 0;
const failures = [];
let group = '';

const g = (name) => { group = name; console.log(`\n── ${name}`); };
function ok(label, cond, detail = '') {
  if (cond) { passed++; console.log(`   PASS  ${label}`); }
  else {
    failures.push(`${group} > ${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`   FAIL  ${label}${detail ? ` — ${detail}` : ''}`);
  }
}
const eq = (label, actual, expected) =>
  ok(label, Object.is(actual, expected), `expected ${expected}, got ${actual}`);

/* ── Helpers ─────────────────────────────────────────────────────────────── */
async function newPage(browser, viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, ...opts });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('requestfailed', (r) => {
    // Aborts triggered by navigating away are not site errors.
    const err = r.failure()?.errorText || '';
    if (!/ERR_ABORTED/.test(err)) errors.push(`requestfailed: ${r.url()} ${err}`);
  });
  page.errors = errors;
  return page;
}

async function boot(page, timeout = 60000) {
  await page.goto(BASE, { waitUntil: 'load', timeout });
  await page.waitForFunction(
    () => document.documentElement.dataset.uwReady === 'true', { timeout }
  );
  await page.waitForTimeout(900);
  await useNativeScroll(page);
}

/**
 * Hand scrolling back to the browser for the duration of the suite.
 *
 * Lenis applies its scroll target on the animation ticker, so a programmatic
 * jump lands in the DOM a frame or two later than the call — and ScrollTrigger,
 * reading a cached scroll position, can miss it entirely. Under CI's software
 * renderer that gap is large enough to desynchronise every assertion. Removing
 * the smoothing layer leaves the actual story logic (every ScrollTrigger, every
 * chapter callback) under test, driven by real scroll events.
 */
async function useNativeScroll(page) {
  await page.evaluate(() => {
    if (window.UWLenis) {
      window.UWLenis.destroy?.();
      window.UWLenis = null;
    }
    document.documentElement.classList.remove('lenis', 'lenis-smooth', 'lenis-stopped');
    /* The stylesheet sets scroll-behavior: smooth for no-JS anchor links.
       Lenis normally overrides it; with Lenis gone it would animate every
       programmatic scroll, so window.scrollTo would return before the page had
       arrived and every subsequent measurement would be of a moving target. */
    document.documentElement.style.scrollBehavior = 'auto';
    window.ScrollTrigger?.refresh();
  });
  await page.waitForTimeout(400);
}

/**
 * Scroll to a section (optionally N viewports into it) deterministically.
 *
 * CI renders in software at a few frames a second, and ScrollTrigger advances
 * scrubbed values on the animation ticker — so a plain scroll-and-wait is
 * flaky here for reasons that have nothing to do with the site. Pumping
 * ScrollTrigger explicitly and snapping the eased camera values makes the
 * assertions depend on state rather than on frame rate.
 */
/**
 * Scroll to an absolute position and wait until the page has actually arrived.
 *
 * Under CI's software renderer a scroll is applied by the compositor a frame or
 * more after the call returns, and frames are scarce. Reading scrollY straight
 * after window.scrollTo therefore reports the old position, so anything that
 * decides its next move from that reading thrashes. Wait for the position to
 * land, then move on.
 */
async function scrollToY(page, y) {
  /* Clamp to the document inside the page, not out here. Its height changes as
     sticky runways and late images settle, so a target computed a moment ago
     can already sit past the end — and then the wait below could never be
     satisfied and burned its whole timeout on every single sample. */
  const landed = await page.evaluate((v) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    const target = Math.max(0, Math.min(v, max));
    window.scrollTo(0, target);
    return target;
  }, y);

  await page
    // Poll on a timer, not on rAF: frames are scarce in software rendering, so
    // rAF polling adds half a second of latency to every scroll.
    .waitForFunction((v) => Math.abs(window.scrollY - v) < 3, landed,
      { timeout: 6000, polling: 100 })
    .catch(() => { /* close enough; carry on */ });

  await page.evaluate(() => window.ScrollTrigger?.update());
}

/**
 * Scroll to a section (optionally N viewports into it).
 *
 * Walks there in viewport-sized steps rather than teleporting: a single jump
 * can clear a chapter's whole range inside one update, which no reader does and
 * which hides ordering bugs instead of catching them.
 */
async function goTo(page, id, offset = 0) {
  const { from, target } = await page.evaluate(([sel, off]) => {
    const el = document.querySelector(sel);
    const to = el
      ? el.getBoundingClientRect().top + scrollY - 40 + innerHeight * off
      : scrollY;
    return { from: window.scrollY, target: to, step: innerHeight * 0.75 };
  }, [`#${id}`, offset]);

  const step = 675;
  const legs = Math.max(1, Math.ceil(Math.abs(target - from) / step));
  for (let i = 1; i <= legs; i++) {
    await scrollToY(page, from + ((target - from) * i) / legs);
  }

  // Settle eased camera values so assertions depend on state, not frame rate.
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    window.ScrollTrigger?.update();
    window.UnderwaterAI?.ocean?.snap?.();
  });
  await page.waitForTimeout(500);
}

/* ── WCAG contrast ───────────────────────────────────────────────────────── */
const channel = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
function contrast(fg, bg) {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}
const parseRGB = (s) => (s.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number);

const CONTRAST_TARGETS = [
  '.hero__sub', '.btn--primary', '.btn--ghost', '.nav__link', '.dock__body',
  '.chapter-sub', '.person__b', '.footer__list a', '.spec__v', '.stage-card__d',
  '.metric__label', '.app__d', '.goal__d', '.skip-link', '.det__name',
];

/** Foreground colour plus every background stop actually behind a selector. */
const sampleContrast = (page) => page.evaluate((sels) => sels.map((sel) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, missing: true };
  const cs = getComputedStyle(el);
  const stops = [];
  for (let n = el; n; n = n.parentElement) {
    const ncs = getComputedStyle(n);
    const img = ncs.backgroundImage;
    if (img && img !== 'none') {
      const found = (img.match(/rgba?\([^)]+\)/g) || []).filter((f) => {
        const a = (f.match(/[\d.]+/g) || []).map(Number);
        return a.length < 4 || a[3] > 0.55;
      });
      // An opaque gradient is this element's background; stop walking up.
      if (found.length) { stops.push(...found); break; }
    }
    const c = ncs.backgroundColor;
    if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) {
      const a = (c.match(/[\d.]+/g) || []).map(Number);
      // A 2%-opacity tint is not the surface the text sits on; keep walking.
      if (a.length < 4 || a[3] > 0.6) { stops.push(c); break; }
    }
  }
  if (!stops.length) stops.push(getComputedStyle(document.body).backgroundColor);
  return { sel, fg: cs.color, stops, size: parseFloat(cs.fontSize), weight: cs.fontWeight };
}), CONTRAST_TARGETS);

const overflowPx = (page) => page.evaluate(() =>
  document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* ── Suite ───────────────────────────────────────────────────────────────── */
const browser = await chromium.launch({
  headless: !HEADFUL,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

try {
  /* 1 — Boot and document integrity ------------------------------------- */
  g('Boot and document');
  const page = await newPage(browser, { width: 1440, height: 900 });
  const res = await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60000 });
  eq('HTTP 200', res.status(), 200);
  ok('title names the company', (await page.title()).includes('Underwater AI'));

  ok('boot screen shown before ready', await page.isVisible('#boot'));
  await page.waitForFunction(
    () => document.documentElement.dataset.uwReady === 'true', { timeout: 60000 }
  );
  await page.waitForTimeout(1800);
  ok('boot screen dismissed after ready', !(await page.isVisible('#boot')));
  ok('smooth scrolling is active by default',
    await page.evaluate(() => !!window.UWLenis));
  await useNativeScroll(page);

  eq('exactly one h1', await page.locator('h1').count(), 1);
  ok('skip link present', await page.locator('a.skip-link').count() === 1);
  ok('meta description present',
    !!(await page.getAttribute('meta[name="description"]', 'content')));

  const noAlt = await page.$$eval('img', (els) =>
    els.filter((e) => !e.hasAttribute('alt')).length);
  eq('every img has alt text', noAlt, 0);

  const namelessButtons = await page.$$eval('button', (els) => els.filter((e) =>
    !e.textContent.trim() && !e.getAttribute('aria-label')).length);
  eq('every button has an accessible name', namelessButtons, 0);

  /* 2 — Every chapter exists -------------------------------------------- */
  g('Chapters');
  for (const id of SECTIONS) {
    ok(`#${id} present`, await page.locator(`#${id}`).count() === 1);
  }

  /* 3 — 3D stage --------------------------------------------------------- */
  g('3D stage');
  const gl = await page.evaluate(() => {
    const c = document.getElementById('gl');
    const ctx = c?.getContext('webgl2') || c?.getContext('webgl');
    return { has: !!ctx, lost: ctx ? ctx.isContextLost() : true };
  });
  ok('WebGL context created', gl.has);
  ok('WebGL context not lost', !gl.lost);
  ok('UnderwaterAI surface exposed', await page.evaluate(() => !!window.UnderwaterAI?.ready));

  const hull = await page.evaluate(() => ({
    ready: window.UnderwaterAI?.vehicle?.ready,
    tris: window.UnderwaterAI?.vehicle?.manifest?.triangles,
    inScene: !!window.UnderwaterAI?.ocean?.hasVehicle,
  }));
  ok('ABYSS-1 hull decoded from Draco', hull.ready === true);
  ok('hull manifest reports geometry', hull.tris > 5000, `tris=${hull.tris}`);
  ok('hull also present in the reef scene', hull.inScene);

  /* 4 — The story beats -------------------------------------------------- */
  g('Story');
  await goTo(page, 'murk', 0.8);
  const murk = await page.evaluate(() => window.UnderwaterAI.murk);
  ok('water is murky in the problem chapter', murk > 0.75, `murk=${murk}`);
  ok('cockpit is live once inside the rover',
    await page.evaluate(() => document.getElementById('cockpit').classList.contains('is-live')));

  await goTo(page, 'enhance', 1.4);
  const after = await page.evaluate(() => ({
    murk: window.UnderwaterAI.murk,
    beats: { ...window.UnderwaterAI.story.beats },
  }));
  ok('water clears after restoration', after.murk < 0.25,
    `murk=${after.murk} beats=${JSON.stringify(after.beats)}`);
  ok('AI module reports active', await page.evaluate(() =>
    document.getElementById('ai-badge').classList.contains('is-active')));

  await goTo(page, 'identify', 0.5);
  const locks = await page.evaluate(() => window.UnderwaterAI.liveDetect?.lockCount ?? 0);
  ok('detector locks onto live creatures', locks >= 1, `locks=${locks}`);
  const boxes = await page.locator('#live-overlay .det--live.is-on').count();
  ok('detection boxes rendered', boxes >= 1, `boxes=${boxes}`);

  /* Deep enough into the chapter that the blink has finished and the camera
     is out. Sampling mid-transition makes the threshold a coin flip. */
  await goTo(page, 'reveal', 1.3);
  const reveal = await page.evaluate(() => window.UnderwaterAI.ocean.reveal);
  ok('camera pulls back to third person', reveal > 0.75, `reveal=${reveal}`);
  eq('canopy has retired', await page.evaluate(() =>
    Number(getComputedStyle(document.getElementById('cockpit')).opacity) < 0.2), true);

  /* The vehicle is no longer a separate stage — the camera simply orbits it
     in the same reef, which is what makes the journey continuous. */
  await goTo(page, 'vehicle', 1.2);
  const orbit = await page.evaluate(() => window.UnderwaterAI.ocean.orbit);
  ok('camera orbits the vehicle', orbit > 0.15, `orbit=${orbit}`);
  eq('still the same reef act', await page.evaluate(() => window.UnderwaterAI.act), 'ocean');
  const cues = await page.locator('#rov-hotspots .hotspot.is-on').count();
  ok('a part is called out during the orbit', cues >= 1, `visible cues=${cues}`);

  await goTo(page, 'vehicle', 2.7);
  const dive = await page.evaluate(() => window.UnderwaterAI.ocean.dive);
  ok('camera flies back in toward the lens', dive > 0.4, `dive=${dive}`);

  await goTo(page, 'reconstruct', 0.7);
  eq('reconstruction act takes the stage',
    await page.evaluate(() => window.UnderwaterAI.act), 'recon');

  /* 5 — Abyssal Studio --------------------------------------------------- */
  g('Abyssal Studio');
  await goTo(page, 'perception', 0.3);
  await page.waitForTimeout(2500);
  ok('species pass auto-runs on arrival',
    await page.locator('#ws-overlay .det.is-on').count() >= 1);

  await page.click('.tool[data-tool="geology"]');
  await page.waitForTimeout(3500);
  const geo = await page.locator('#ws-overlay .det--geo').count();
  ok('geology pass produces its own detections', geo >= 1, `geo boxes=${geo}`);

  await page.click('.tool[data-tool="clear"]');
  await page.waitForTimeout(600);
  eq('clear empties the workspace', await page.locator('#ws-overlay .det').count(), 0);

  /* 6 — Downloadable model assets ---------------------------------------- */
  g('Model downloads');
  for (const [file, magic] of [
    ['assets/models/rov.glb', 'glTF'],
    ['assets/models/rov.draco.glb', 'glTF'],
    ['assets/models/rov.stl', null],
  ]) {
    const r = await page.request.get(new URL(file, BASE).href);
    ok(`${file} served`, r.ok(), `status ${r.status()}`);
    const buf = await r.body();
    ok(`${file} is non-trivial`, buf.length > 10000, `${buf.length} bytes`);
    if (magic) ok(`${file} has a glTF header`, buf.subarray(0, 4).toString() === magic);
  }
  const man = await (await page.request.get(new URL('assets/models/rov.json', BASE).href)).json();
  ok('part manifest lists named assemblies', man.parts?.length >= 8, `${man.parts?.length} parts`);

  /* 7 — Performance budget ----------------------------------------------- */
  /* Frame rate here is meaningless (CI renders in software), so the budget is
     expressed in the things that are actually portable: draw calls and
     triangles submitted per frame. */
  g('Render budget');
  await goTo(page, 'identify', 0.4);
  const stats = await page.evaluate(() => ({ ...window.UnderwaterAI.stage.stats }));
  ok('draw calls within budget', stats.calls < 400, `calls=${stats.calls}`);
  ok('triangles within budget', stats.triangles < 400000, `tris=${stats.triangles}`);

  ok('no console errors during the run', page.errors.length === 0,
    page.errors.slice(0, 3).join(' | '));
  await page.context().close();

  /* 8 — Layout integrity at every supported width ------------------------ */
  for (const vp of VIEWPORTS) {
    g(`Layout — ${vp.name} (${vp.width}x${vp.height})`);
    const p = await newPage(browser, { width: vp.width, height: vp.height });
    await boot(p);

    /* Sweep the whole document rather than hopping section to section: it is
       faster, and it also samples the joins between chapters, which is exactly
       where sticky panels and pinned runways tend to misbehave. */
    let worstOverflow = 0;
    const textProblems = [];
    const SAMPLES = SMOKE ? 8 : 14;

    const maxY = await p.evaluate(() =>
      document.documentElement.scrollHeight - innerHeight);

    for (let i = 0; i <= SAMPLES; i++) {
      await scrollToY(p, (maxY * i) / SAMPLES);
      await p.evaluate(() => window.UnderwaterAI?.ocean?.snap?.());
      worstOverflow = Math.max(worstOverflow, await overflowPx(p));
      const found = await p.evaluate(() => window.UWTypography?.auditOverflow?.() ?? []);
      textProblems.push(...found);
    }

    eq('no horizontal scroll anywhere', worstOverflow, 0);
    ok('no text overflows its container', textProblems.length === 0,
      textProblems.slice(0, 3).map((t) => `${t.tag}.${t.cls}:"${t.text}" ${t.needs}>${t.has}`).join(' | '));
    ok('no console errors', p.errors.length === 0, p.errors.slice(0, 2).join(' | '));
    await p.context().close();
  }

  /* 9 — Themes and contrast --------------------------------------------- */
  if (!SMOKE) {
  g('Theme and contrast');
  const th = await newPage(browser, { width: 1280, height: 900 });
  await boot(th);
  eq('dark is the default theme',
    await th.evaluate(() => document.documentElement.dataset.theme), 'dark');

  await th.click('#theme-toggle');
  await th.waitForTimeout(700);
  eq('toggle switches to light',
    await th.evaluate(() => document.documentElement.dataset.theme), 'light');
  eq('choice is persisted',
    await th.evaluate(() => localStorage.getItem('uw-theme')), 'light');

  for (const theme of ['dark', 'light']) {
    await th.evaluate((t) => window.UWTheme.apply(t), theme);
    await th.waitForTimeout(500);
    const rows = await sampleContrast(th);
    const low = [];
    for (const r of rows) {
      if (r.missing) continue;
      const cr = Math.min(...r.stops.map((b) => contrast(parseRGB(r.fg), parseRGB(b))));
      const large = r.size >= 24 || (r.size >= 18.66 && Number(r.weight) >= 700);
      if (cr < (large ? 3.0 : 4.5)) low.push(`${r.sel} ${cr.toFixed(2)}:1`);
    }
    ok(`${theme}: body text meets WCAG AA`, low.length === 0, low.join(', '));
    eq(`${theme}: no horizontal scroll`, await overflowPx(th), 0);
    const txt = await th.evaluate(() => window.UWTypography?.auditOverflow?.() ?? []);
    ok(`${theme}: no text overflow`, txt.length === 0,
      txt.slice(0, 2).map((t) => `${t.tag}:"${t.text}"`).join(' | '));
  }
  await th.context().close();
  }

  /* 10 — Reduced motion --------------------------------------------------- */
  g('Reduced motion');
  const rm = await newPage(browser, { width: 1280, height: 800 }, { reducedMotion: 'reduce' });
  await boot(rm);
  ok('page still becomes ready', await rm.evaluate(() => !!window.UnderwaterAI?.ready));
  ok('smooth-scroll hijacking disabled', await rm.evaluate(() => !window.UWLenis));
  ok('content is visible without animation', await rm.evaluate(() => {
    const el = document.querySelector('#suite .stage-card');
    return el && getComputedStyle(el).opacity === '1';
  }));

  /* The 3D keeps rendering under reduced motion — a frozen reef reads as a
     broken page — but the drift that happens whether or not you are scrolling
     must be negligible. Sampled at rest, so any movement here is ambient. */
  const drift = await rm.evaluate(() => new Promise((resolve) => {
    const cam = window.UnderwaterAI?.ocean?.camera;
    if (!cam) { resolve(0); return; }
    const a = cam.position.clone();
    setTimeout(() => resolve(a.distanceTo(cam.position)), 1500);
  }));
  // Measured: ~0.02 with the preference set, ~0.25 without. 0.1 separates them
  // cleanly, so this fails if the damping is ever dropped.
  ok('ambient camera drift is damped', drift < 0.1, `drift=${drift.toFixed(3)}`);
  eq('no horizontal scroll', await overflowPx(rm), 0);
  await rm.context().close();

  /* 11 — No-JS fallback -------------------------------------------------- */
  g('No JavaScript');
  const nojs = await newPage(browser, { width: 1280, height: 800 }, { javaScriptEnabled: false });
  /* 'load', not 'domcontentloaded': the no-JS fallback is expressed entirely in
     CSS, and DOMContentLoaded can fire before the stylesheet has been applied.
     Locally the sheet is instant and this passed; over a network it raced. */
  await nojs.goto(BASE, { waitUntil: 'load' });
  await nojs.waitForFunction(() => document.styleSheets.length > 0, null, { timeout: 15000 })
    .catch(() => { /* asserted below either way */ });
  ok('headline still readable', (await nojs.locator('h1').innerText()).length > 5);
  ok('team section still in the document', await nojs.locator('#team').count() === 1);
  ok('boot screen does not trap the reader',
    await nojs.evaluate(() => getComputedStyle(document.getElementById('boot')).display) === 'none');
  await nojs.context().close();
} finally {
  await browser.close();
}

/* ── Report ──────────────────────────────────────────────────────────────── */
console.log(`\n${'═'.repeat(56)}`);
console.log(`  ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  console.log('\n  Failures:');
  for (const f of failures) console.log(`   · ${f}`);
}
console.log(`${'═'.repeat(56)}\n`);
process.exit(failures.length ? 1 : 0);
