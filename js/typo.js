/**
 * typo.js — Typography fitting powered by Pretext.
 *
 * Pretext measures multiline text without touching the DOM, so we can ask
 * "how wide is the tightest box that still fits this heading?" and "does this
 * label overflow its container?" without forcing a single layout reflow.
 *
 * Two jobs:
 *   1. fitHeadings()  — shrink-wrap display headings so a long word can never
 *      punch out of its column at any viewport width.
 *   2. auditOverflow() — a check that flags text which would collide with its
 *      container. Exposed on window so the Playwright suite can gate on it.
 */
import { prepareWithSegments, measureLineStats } from 'pretext';

const cache = new Map();

function measure(text, font, width) {
  const key = `${font}||${text}`;
  let prepared = cache.get(key);
  if (!prepared) {
    prepared = prepareWithSegments(text, font);
    cache.set(key, prepared);
  }
  return measureLineStats(prepared, width);
}

/** Build the CSS font shorthand Pretext expects, from computed style. */
function fontString(cs, sizePx) {
  const size = sizePx ?? parseFloat(cs.fontSize);
  const style = cs.fontStyle !== 'normal' ? `${cs.fontStyle} ` : '';
  return `${style}${cs.fontWeight} ${size}px ${cs.fontFamily}`;
}

/**
 * Shrink a heading's font-size until its longest line fits the space it has.
 * Only ever scales down — the CSS clamp() already chose the ideal size.
 */
export function fitHeadings(root = document) {
  for (const el of root.querySelectorAll('[data-fit]')) {
    el.style.removeProperty('font-size');
    const cs = getComputedStyle(el);
    const avail = el.clientWidth
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 0) continue;

    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const base = parseFloat(cs.fontSize);
    let size = base;

    // measureLineStats gives the widest laid-out line; step down until it fits.
    for (let i = 0; i < 14; i++) {
      const { maxLineWidth } = measure(text, fontString(cs, size), avail);
      if (maxLineWidth <= avail) break;
      size *= Math.max(0.86, avail / maxLineWidth);
    }

    if (size < base - 0.5) {
      el.style.fontSize = `${size.toFixed(2)}px`;
      el.dataset.fitApplied = (size / base).toFixed(3);
    } else {
      delete el.dataset.fitApplied;
    }
  }
}

/**
 * Report every leaf element whose text would overflow its own box.
 * Used by the Playwright suite as a hard gate against text/UI collisions.
 */
export function auditOverflow(root = document) {
  const problems = [];
  const sel = 'h1,h2,h3,h4,h5,p,span,a,button,li,figcaption';

  for (const el of root.querySelectorAll(sel)) {
    if (el.children.length) continue;                     // leaf text nodes only
    const text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.clientWidth) continue;
    // Deliberate clipping or scrolling is not a collision.
    if (cs.textOverflow === 'ellipsis') continue;
    if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') continue;
    if (el.closest('[data-allow-clip]')) continue;

    const avail = el.clientWidth
      - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    if (avail <= 1) continue;

    const { maxLineWidth } = measure(text, fontString(cs), avail);
    // 1px of slack absorbs sub-pixel rounding between Pretext and the engine.
    if (maxLineWidth > avail + 1) {
      problems.push({
        text: text.slice(0, 60),
        tag: el.tagName.toLowerCase(),
        cls: String(el.className || '').slice(0, 40),
        needs: Math.round(maxLineWidth),
        has: Math.round(avail),
      });
    }
  }
  return problems;
}

export function initTypography() {
  fitHeadings();

  let raf = 0;
  addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => fitHeadings());
  }, { passive: true });

  // Surface for the automated suite.
  window.UWTypography = { fitHeadings, auditOverflow };
}
