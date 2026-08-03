#!/usr/bin/env bash
# Underwater AI — Automated Smoke Tests
# Requires: node (globally available)
# Run:    bash tests/smoke-check.sh
# Prereq: npm (used on first run to install playwright)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TEMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIR"' EXIT

# Install playwright if needed (cache-friendly)
if [ ! -d "$SCRIPT_DIR/../node_modules/playwright" ]; then
  echo "[test] Installing playwright (one-time)..."
  (cd "$TEMP_DIR" && npm init -y -s && npm install -s playwright 2>/dev/null)
  PW_DIR="$TEMP_DIR"
else
  PW_DIR="$SCRIPT_DIR/.."
fi

cat > "$TEMP_DIR/test.mjs" <<'EOF'
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
let passed = 0, failed = 0;
function check(label, condition, detail = '') {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.log(`  ❌ ${label} — ${detail}`); }
}

console.log('\n═══ PAGE LOAD ═══');
const start = Date.now();
const resp = await page.goto('http://underwaterai.org/', { waitUntil: 'domcontentloaded', timeout: 60000 });
check('HTTP 200', resp.status() === 200);
check('DOMContentLoaded < 10s', Date.now() - start < 10000, `${((Date.now()-start)/1000).toFixed(1)}s`);
check('Title exists', (await page.title()).includes('Underwater AI'));
await page.waitForTimeout(5000);

console.log('\n═══ CORE ELEMENTS ═══');
check('#scene-canvas', await page.$('#scene-canvas') !== null);
check('nav bar', await page.$('nav') !== null);
check('footer', await page.$('footer') !== null);
check('h1 present', (await page.$eval('h1', el => el.innerText).catch(() => '')).includes('Reveal'));

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

console.log('\n═══ SECTIONS ═══');
for (const id of ['hero','about','compare','models','technology','detection','tourism','customers','team']) {
  check(`#${id}`, await page.$(`#${id}`) !== null);
}

console.log('\n═══ COMPARE SLIDER ═══');
await page.evaluate(() => document.querySelector('#compare')?.scrollIntoView());
await page.waitForTimeout(1500);
check('Slider role=slider', await page.$eval('[role="slider"]', s => s.getAttribute('role')).catch(() => false) === 'slider');
check('Tab switch works', await page.evaluate(() => {
  const b = [...document.querySelectorAll('#compare button')].find(x => x.innerText.includes('B'));
  if (b) { b.click(); return true; }
  return false;
}));

console.log('\n═══ THEME TOGGLE ═══');
const before = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x =>
    /theme|light|dark|mode/i.test((x.className||'')+' '+(x.getAttribute('aria-label')||''))
  )?.click();
});
await page.waitForTimeout(500);
const after = await page.evaluate(() => document.documentElement.classList.contains('light-mode'));
check('Theme toggles', before !== after);

console.log('\n═══ MOBILE ═══');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(500);
check('Hamburger visible', await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x =>
    /hamburger|menu/i.test((x.className||'')+' '+(x.getAttribute('aria-label')||''))
  );
  return b && b.offsetParent !== null;
}));
await page.evaluate(() => {
  [...document.querySelectorAll('button')].find(x =>
    /hamburger|menu/i.test((x.className||'')+' '+(x.getAttribute('aria-label')||''))
  )?.click();
});
await page.waitForTimeout(700);
check('Mobile menu opens', await page.evaluate(() => !!(document.querySelector('[aria-expanded="true"]'))).catch(() => false));

console.log('\n═══ ACCESSIBILITY ═══');
check('Skip link', await page.$('[href*="#main"]') !== null);
check('Heading hierarchy', await page.evaluate(() => document.querySelectorAll('h1').length >= 1 && document.querySelectorAll('h2').length >= 3));
check('JSON-LD schema', await page.evaluate(() => {
  const s = document.querySelector('script[type="application/ld+json"]');
  if (!s) return false;
  try { return JSON.parse(s.textContent)['@type'] === 'Organization'; } catch { return false; }
}));

console.log('\n═══ ERRORS ═══');
let errorCount = 0;
page.on('pageerror', e => { errorCount++; console.log(`  ❌ ${e.message.slice(0,120)}`); });
await page.reload({ waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);
check('No JS errors', errorCount === 0, `${errorCount} errors`);

console.log(`\n═══════════════════════════`);
console.log(`  ✅ ${passed}   ❌ ${failed}`);
console.log(`═══════════════════════════\n`);

await browser.close();
process.exit(failed > 0 ? 1 : 0);
EOF

node "$TEMP_DIR/test.mjs"
