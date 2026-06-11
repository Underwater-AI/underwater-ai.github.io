/* ============================================================================
   UNDERWATER AI — ENTRY POINT
   Loads the page transition curtain, waits for assets, then reveals.
   Coordinates boot order across all modules.
   ============================================================================ */
(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Page transition curtain: open on load
  function bootCurtain() {
    const curtain = document.querySelector('.curtain');
    if (!curtain) return;
    if (prefersReducedMotion) {
      curtain.style.display = 'none';
      return;
    }
    // Ensure curtain is "open" (covering) then sweep it away
    curtain.classList.add('is-open');
    requestAnimationFrame(() => {
      setTimeout(() => {
        curtain.classList.remove('is-open');
        // Remove from DOM after transition
        setTimeout(() => curtain.remove(), 800);
      }, 700);
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
