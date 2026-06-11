/* ============================================================================
   UNDERWATER AI — ANIME.JS MICRO-INTERACTIONS
   Polished effects that GSAP doesn't shine at: character-by-character
   hero text, button magnetic pull, magnetic cursor-following on CTAs.
   Gracefully degrades if Anime.js fails to load.
   ============================================================================ */
(function () {
  'use strict';

  if (typeof window.anime === 'undefined') {
    return; // Anime.js not loaded — bail silently
  }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) return;

  // ---------------------------------------------------------------------------
  // 1. Hero stat number "wobble" on hover
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.hero__stat-num').forEach((stat) => {
    stat.addEventListener('mouseenter', () => {
      window.anime({
        targets: stat,
        scale: [1, 1.06, 1],
        duration: 600,
        easing: 'easeOutElastic(1, .6)',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Tag pill pulse on hover
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.tag').forEach((tag) => {
    tag.addEventListener('mouseenter', () => {
      window.anime({
        targets: tag,
        scale: [1, 1.08],
        duration: 220,
        easing: 'easeOutQuad',
      });
    });
    tag.addEventListener('mouseleave', () => {
      window.anime({
        targets: tag,
        scale: [1.08, 1],
        duration: 220,
        easing: 'easeOutQuad',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Section eyebrow line grow on first reveal
  // ---------------------------------------------------------------------------
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const line = entry.target.querySelector('.eyebrow__line');
        if (line && !line.dataset.animated) {
          line.dataset.animated = '1';
          window.anime({
            targets: line,
            scaleX: [0, 1],
            duration: 700,
            easing: 'easeOutExpo',
            delay: 200,
          });
        }
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('.eyebrow').forEach((el) => {
    // Reset line to scale 0 initially
    const line = el.querySelector('.eyebrow__line');
    if (line) line.style.transform = 'scaleX(0)';
    observer.observe(el);
  });

  // ---------------------------------------------------------------------------
  // 4. Magnetic CTA buttons — gentle pull toward cursor
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.btn--primary').forEach((btn) => {
    const strength = 12;
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      window.anime({
        targets: btn,
        translateX: x / (rect.width / strength),
        translateY: y / (rect.height / strength),
        duration: 200,
        easing: 'easeOutQuad',
      });
    });
    btn.addEventListener('mouseleave', () => {
      window.anime({
        targets: btn,
        translateX: 0,
        translateY: 0,
        duration: 400,
        easing: 'easeOutElastic(1, .6)',
      });
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Stagger hero CTA pulse animation loop
  // ---------------------------------------------------------------------------
  function loopPulse() {
    document.querySelectorAll('.hero__cta .btn--primary .pulse-dot::before').forEach(el => {});
    // Use the dots in the navigation / status bar
    document.querySelectorAll('.eyebrow__dot, .pulse, .hotspot').forEach((el, i) => {
      window.anime({
        targets: el,
        scale: [1, 1.4, 1],
        opacity: [1, 0.5, 1],
        duration: 1800,
        delay: i * 60,
        easing: 'easeInOutQuad',
        loop: true,
      });
    });
  }
  // Delay so it doesn't conflict with the initial page-load reveal
  setTimeout(loopPulse, 1500);

  // ---------------------------------------------------------------------------
  // 6. Card hover lift refinement (in addition to CSS)
  // ---------------------------------------------------------------------------
  document.querySelectorAll('.model-card, .tech-card, .solution, .member').forEach((card) => {
    card.addEventListener('mouseenter', () => {
      window.anime({
        targets: card,
        boxShadow: '0 30px 60px -20px rgba(0, 180, 216, 0.25)',
        duration: 400,
        easing: 'easeOutQuad',
      });
    });
    card.addEventListener('mouseleave', () => {
      window.anime({
        targets: card,
        boxShadow: '0 0 0 rgba(0, 180, 216, 0)',
        duration: 400,
        easing: 'easeOutQuad',
      });
    });
  });
})();
