/* ============================================================================
   UNDERWATER AI — ENTRY POINT
   Loads the page transition curtain, waits for assets, then reveals.
   Coordinates boot order across all modules.
   ============================================================================ */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Page transition curtain: cover by default, slide away on load
  function bootCurtain() {
    const curtain = document.querySelector('.curtain');
    if (!curtain) return;
    if (prefersReducedMotion) {
      curtain.style.display = 'none';
      return;
    }
    // Curtain is already covering (translateY(0) by default).
    // After a short beat, sweep it down off-screen to reveal the page.
    requestAnimationFrame(() => {
      // Wait a beat so the first paint of the page settles under the curtain
      const start = document.readyState === 'complete' ? 150 : 350;
      setTimeout(() => {
        curtain.classList.add('is-closing');
        // Remove from DOM after the sweep finishes
        setTimeout(() => {
          if (curtain.parentNode) curtain.remove();
        }, 800);
      }, start);
    });
  }

  function start() {
    bootCurtain();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Expose tiny diagnostics for the smoke test
  window.__underwaterAI = {
    ready: false,
    bootTime: Date.now(),
  };
  window.addEventListener('load', () => {
    window.__underwaterAI.ready = true;
    window.__underwaterAI.bootMs = Date.now() - window.__underwaterAI.bootTime;
  });

  // Soft error reporting — log but never break the page
  window.addEventListener('error', (e) => {
    console.error('[underwater-ai]', e.message, e.filename, e.lineno);
  });
})();
