/**
 * shot.mjs — Dev helper: drive the page to a scroll position and screenshot it.
 * Usage: node tools/shot.mjs <name> <scrollFraction> [width] [height]
 */
import { chromium } from 'playwright';
import fs from 'node:fs';

const [name = 'shot', frac = '0', w = '1440', h = '900'] = process.argv.slice(2);
const BASE = process.env.BASE_URL || 'http://localhost:4173/';
const OUT = process.env.SHOT_DIR || '/tmp/uw-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));

await page.goto(BASE, { waitUntil: 'load', timeout: 60000 });
await page.waitForFunction(() => document.documentElement.dataset.uwReady === 'true', { timeout: 45000 })
  .catch(() => console.log('  (uwReady never set)'));
await page.waitForTimeout(1200);

if (+frac > 0) {
  await page.evaluate((f) => {
    const max = document.documentElement.scrollHeight - innerHeight;
    window.UWLenis
      ? window.UWLenis.scrollTo(max * f, { immediate: true })
      : window.scrollTo(0, max * f);
  }, +frac);
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.UnderwaterAI?.ocean?.snap?.());
  await page.waitForTimeout(2200);
}

if (process.env.MURK !== undefined) {
  await page.evaluate((m) => window.UnderwaterAI?.stage?.setMurk(+m), process.env.MURK);
  await page.waitForTimeout(600);
}

const file = `${OUT}/${name}.png`;
await page.screenshot({ path: file });
console.log(`saved ${file}`);
if (errors.length) {
  console.log('CONSOLE ERRORS:');
  for (const e of [...new Set(errors)].slice(0, 12)) console.log('  -', e);
} else {
  console.log('no console errors');
}
await browser.close();
