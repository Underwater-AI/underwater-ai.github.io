/* ============================================================================
   UNDERWATER AI — CUSTOM CURSOR
   Dot + ring with mix-blend-mode: difference for cinematic feel.
   Expands on interactive elements. Disabled on touch devices.
   ============================================================================ */
(function (global) {
  'use strict';

  // Touch / reduced motion — bail.
  const isTouch = window.matchMedia('(hover: none)').matches ||
                  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (isTouch || prefersReducedMotion) return;

  const dot = document.querySelector('.cursor-dot');
  const ring = document.querySelector('.cursor-ring');
  if (!dot || !ring) return;

  let dotX = 0, dotY = 0, ringX = 0, ringY = 0;
  let mouseX = 0, mouseY = 0;

  function onMove(e) {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }
  window.addEventListener('mousemove', onMove, { passive: true });

  // Hover targets — anything interactive
  const HOVER_SEL = 'a, button, [role="button"], input, textarea, select, .hotspot, [data-cursor="hover"]';

  function bindHover() {
    document.querySelectorAll(HOVER_SEL).forEach((el) => {
      el.addEventListener('mouseenter', () => {
        ring.classList.add('is-hover');
        if (el.dataset.cursorLabel) {
          ring.dataset.label = el.dataset.cursorLabel;
        }
      });
      el.addEventListener('mouseleave', () => {
        ring.classList.remove('is-hover');
        ring.dataset.label = '';
      });
    });
  }
  bindHover();
  // Re-bind after DOM updates
  const mo = new MutationObserver(bindHover);
  mo.observe(document.body, { childList: true, subtree: true });

  // Click press feedback
  window.addEventListener('mousedown', () => ring.classList.add('is-press'));
  window.addEventListener('mouseup',   () => ring.classList.remove('is-press'));

  // Hide when leaving the window
  document.addEventListener('mouseleave', () => {
    dot.style.opacity = '0';
    ring.style.opacity = '0';
  });
  document.addEventListener('mouseenter', () => {
    dot.style.opacity = '1';
    ring.style.opacity = '1';
  });

  function tick() {
    // Dot — tight follow
    dotX += (mouseX - dotX) * 0.6;
    dotY += (mouseY - dotY) * 0.6;
    dot.style.transform = `translate(${dotX}px, ${dotY}px) translate(-50%, -50%)`;

    // Ring — lazy follow
    ringX += (mouseX - ringX) * 0.18;
    ringY += (mouseY - ringY) * 0.18;
    ring.style.transform = `translate(${ringX}px, ${ringY}px) translate(-50%, -50%)`;

    requestAnimationFrame(tick);
  }
  tick();
})(window);
