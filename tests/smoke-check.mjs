// Underwater AI — Automated Smoke Tests
// Usage:
//   cd /tmp/pw-test && node /store/shuvam/underwater-ai.github.io/tests/smoke-check.mjs
// Or install playwright: npm init -y && npm i playwright && node tests/smoke-check.mjs

import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

let passed = 0, failed = 0;

function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label} — ${detail}`); }
}

// ── 1. PAGE LOAD ──
console.log('\n═══ PAGE LOAD ═══');
const start = Date.now();
const resp = await page.goto('http://underwaterai.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
check('HTTP 200', resp.status() === 200);
check('DOMContentLoaded < 10s', Date.now() - start < 10000);
check('Title exists', (await page.title()).includes('Underwater AI'));
await page.waitForTimeout(5000);

// ── 2. CORE ELEMENTS ──
console.log('\n═══ CORE ELEMENTS ═══');
check('#scene-canvas', await page.$('#scene-canvas') !== null);
check('nav bar', await page.$('nav') !== null);
check('footer', await page.$('footer') !== null);
check('h1 present', (await page.$eval('h1', el => el.innerText).catch(() => '')).includes('Reveal'));

// ── 3. 3D SCENE ──
console.log('\n═══ 3D SCENE ═══');
check('UnderwaterScene', await page.evaluate(() => typeof window.UnderwaterScene === 'object'));
check('UnderwaterScroll', await page.evaluate(() => typeof window.UnderwaterScroll === 'object'));
check('WebGL context', await page.evaluate(() => {
  const gl = document.querySelector('#scene-canvas').getContext('webgl2');
  return gl && !gl.isContextLost();
}));
check('Scene ready', await page.evaluate(() => window.UnderwaterScene?.isReady === true));
check('Model loader', await page.evaluate(() => window.UnderwaterModelLoader?.total === 8));
await page.waitForTimeout(8000);
const loaded = await page.evaluate(() => window.UnderwaterModelLoader?.loaded || 0);
check('8/8 models loaded', loaded === 8, `${loaded}/8`);

// ── 4. SECTIONS ──
console.log('\n═══ SECTIONS ═══');
const sections = ['hero', 'about', 'compare', 'models', 'technology', 'detection', 'tourism', 'customers', 'team'];
for (const id of sections) {
  check(`#${id}`, await page.$(`#${id}`) !== null);
}

// ── 5. BEFORE/AFTER SLIDER ──
console.log('\n═══ COMPARE SLIDER ═══');
await page.evaluate(() => document.querySelector('#compare')?.scrollIntoView());
await page.waitForTimeout(1500);
check('Slider role=slider', await page.$eval('[role="slider"]', s => s.getAttribute('role')).catch(() => false) === 'slider');
check('Tab switch works', await page.evaluate(() => {
  const b = [...document.querySelectorAll('#compare button')].find(x => x.innerText.includes('B'));
  if (b) { b.click(); return true; }
  return false;
}));

// ── 6. THEME TOGGLE ──
console.log('\n═══ THEME TOGGLE ═══');
const before = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    /theme|light|dark|mode/i.test((x.className || '') + ' ' + (x.getAttribute('aria-label') || ''))
  );
  b?.click();
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
check('Theme toggles', before !== after);

// ── 7. MOBILE ──
console.log('\n═══ MOBILE ═══');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
check('Hamburger visible', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    /hamburger|menu/i.test((x.className || '') + ' ' + (x.getAttribute('aria-label') || ''))
  );
  return b && b.offsetParent !== null;
}));
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    /hamburger|menu/i.test((x.className || '') + ' ' + (x.getAttribute('aria-label') || ''))
  );
  b?.click();
});
await page.waitForTimeout(700);
check('Mobile menu opens', await page.evaluate(() => {
  const m = document.querySelector('[class*="menu"][class*="open"], [class*="overlay"][class*="open"]');
  return !!(m || document.querySelector('[aria-expanded="true"]'));
}));

// ── 8. ACCESSIBILITY ──
console.log('\n═══ ACCESSIBILITY ═══');
check('Skip link', await page.$('[href*="#main"]') !== null);
check('Heading hierarchy', await page.evaluate(() => {
  return document.querySelectorAll('h1').length >= 1 && document.querySelectorAll('h2').length >= 3;
}));
check('JSON-LD schema', await page.evaluate(() => {
  const s = document.querySelector('script[type="application/ld+json"]');
  if (!s) return false;
  try { return JSON.parse(s.textContent)['@type'] === 'Organization'; }
  catch { return false; }
}));

// ── 9. NO CONSOLE ERRORS ──
console.log('\n═══ ERRORS ═══');
let errorCount = 0;
page.on('pageerror', e => {
  errorCount++;
  console.log(`  ❌ page error: ${e.message.slice(0, 120)}`);
});
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
check('No JS errors', errorCount === 0, `${errorCount} errors`);

// ── SUMMARY ──
console.log(`\n═══════════════════════════`);
console.log(`  ✅ ${passed}   ❌ ${failed}`);
console.log(`═══════════════════════════\n`);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
