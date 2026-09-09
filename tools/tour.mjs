/**
 * tour.mjs — Drive the whole film in one browser session and screenshot each
 * beat. Usage: node tools/tour.mjs [width] [height] [outdir]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [w = '1440', h = '900', outdir] = process.argv.slice(2);
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = outdir || `/tmp/uw-shots/tour-${w}x${h}`;
fs.mkdirSync(OUT, { recursive: true });

/* [name, target] — a target is either an element id or a page-height fraction. */
const BEATS = [
  ['01-hero', '#descent'],
  ['02-murk', '#murk'],
  ['02b-murk-deep', { id: '#murk', offset: 1.0 }],
  ['03-enhance-start', { id: '#enhance', offset: 0.2 }],
  ['04-enhance-mid', { id: '#enhance', offset: 0.9 }],
  ['05-enhance-end', { id: '#enhance', offset: 1.6 }],
  ['06-identify-a', { id: '#identify', offset: 0.4 }],
  ['06b-identify-b', { id: '#identify', offset: 1.0 }],
  ['06d-reveal-a', { id: '#reveal', offset: 0.45 }],
  ['06e-reveal-b', { id: '#reveal', offset: 0.95 }],
  ['06c-vehicle', { id: '#vehicle', offset: 0.62 }],
  ['07-perception', { id: '#perception', offset: 0.45 }],
  ['08-reconstruct', { id: '#reconstruct', offset: 0.55 }],
  ['09-reconstruct-late', { id: '#reconstruct', offset: 1.6 }],
  ['10-suite', '#suite'],
  ['11-deploy', '#deploy'],
  ['12-team', '#team'],
  ['13-contact', '#contact'],
];

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('requestfailed', (r) => errors.push(`REQFAIL ${r.url()} ${r.failure()?.errorText}`));

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.uwReady === 'true', { timeout: 45000 })
  .catch(() => console.log('  ! uwReady never set'));
await page.waitForTimeout(3000);

async function goTo(target) {
  await page.evaluate((t) => {
    let y;
    if (typeof t === 'string') {
      y = document.querySelector(t).getBoundingClientRect().top + scrollY - 40;
    } else {
      const el = document.querySelector(t.id);
      y = el.getBoundingClientRect().top + scrollY - 40 + innerHeight * t.offset;
    }
    window.UWLenis ? window.UWLenis.scrollTo(y, { immediate: true }) : window.scrollTo(0, y);
  }, target);
  await page.waitForTimeout(1200);
  // Settle the eased camera values so the shot does not depend on frame rate.
  await page.evaluate(() => window.UnderwaterAI?.ocean?.snap?.());
  await page.waitForTimeout(2200);
}

for (const [name, target] of BEATS) {
  await goTo(target);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  process.stdout.write(`${name} `);
}
console.log('');

// Report layout health at this viewport.
const health = await page.evaluate(() => ({
  overflow: window.UWTypography?.auditOverflow?.() ?? 'n/a',
  hScroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  act: window.UnderwaterAI?.act,
}));
console.log('horizontal overflow px:', health.hScroll);
console.log('text overflow findings:', Array.isArray(health.overflow) ? health.overflow.length : health.overflow);
if (Array.isArray(health.overflow)) {
  for (const p of health.overflow.slice(0, 10)) console.log('   ', JSON.stringify(p));
}
if (errors.length) {
  console.log('ERRORS:');
  for (const e of [...new Set(errors)].slice(0, 15)) console.log('  -', e);
} else console.log('no console errors');

await browser.close();
console.log('shots in', OUT);
