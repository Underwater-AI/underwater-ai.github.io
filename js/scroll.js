/* ============================================================================
   UNDERWATER AI — SMOOTH SCROLL CONTROLLER
   Wraps Lenis for buttery smooth scrolling and exposes a normalized
   scroll-progress value (0..1) for the 3D camera path + section reveal logic.
   ============================================================================ */
(function (global) {
  'use strict';

  const Scroll = {
    progress: 0,        // 0..1 over the document
    velocity: 0,
    y: 0,
    isReady: false,
  };
  global.UnderwaterScroll = Scroll;

  // Reduced motion: skip Lenis entirely, use native scroll.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function updateProgress() {
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    Scroll.y = window.scrollY || window.pageYOffset || 0;
    Scroll.progress = Math.max(0, Math.min(1, Scroll.y / max));
    // Update 3D scene camera path
    if (global.UnderwaterScene && global.UnderwaterScene.setScroll) {
      global.UnderwaterScene.setScroll(Scroll.progress);
    }
    // Update nav scroll-state
    if (global.UnderwaterUI && global.UnderwaterUI.onScroll) {
      global.UnderwaterUI.onScroll(Scroll.y);
    }
    // Update scroll cue
    const cue = document.querySelector('.scroll-cue');
    if (cue) {
      cue.style.opacity = Scroll.y > 80 ? '0' : '';
    }
  }

  // ---------------------------------------------------------------------------
  // Lenis (or fallback)
  // ---------------------------------------------------------------------------
  if (typeof global.Lenis !== 'undefined' && !prefersReducedMotion) {
    const lenis = new global.Lenis({
      duration: 1.4,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      direction: 'vertical',
      gestureDirection: 'vertical',
      smooth: true,
      smoothTouch: false,
      touchMultiplier: 2,
      wheelMultiplier: 1,
    });

    function raf(time) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    lenis.on('scroll', () => {
      updateProgress();
    });

    // Anchor links → smooth scroll
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const targetId = link.getAttribute('href');
      if (targetId.length < 2) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      lenis.scrollTo(target, { offset: -70, duration: 1.5 });
    });

    Scroll.lenis = lenis;
  } else {
    // Native fallback
    window.addEventListener('scroll', updateProgress, { passive: true });
    // Anchor links
    document.addEventListener('click', (e) => {
      const link = e.target.closest('a[href^="#"]');
      if (!link) return;
      const targetId = link.getAttribute('href');
      if (targetId.length < 2) return;
      const target = document.querySelector(targetId);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth' });
    });
  }

  // Initial
  updateProgress();
  window.addEventListener('load', updateProgress);
  window.addEventListener('resize', updateProgress);

  // GSAP ScrollTrigger integration (if GSAP is loaded)
  if (typeof global.gsap !== 'undefined' && typeof global.ScrollTrigger !== 'undefined') {
    global.gsap.registerPlugin(global.ScrollTrigger);
    if (global.ScrollTrigger && global.UnderwaterScroll && global.UnderwaterScroll.lenis) {
      global.ScrollTrigger.scrollerProxy(document.body, {
        scrollTop(value) {
          if (arguments.length && value !== undefined) {
            global.UnderwaterScroll.lenis.scrollTo(value, { immediate: true });
          }
          return global.UnderwaterScroll.y;
        },
        getBoundingClientRect() {
          return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
        },
      });
    }
  }

  Scroll.isReady = true;
})(window);
