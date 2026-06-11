/* ============================================================================
   UNDERWATER AI — UI CONTROLLER
   Section reveal (IntersectionObserver), nav scroll state, mobile menu,
   before/after slider, model tabs, light/dark theme, 3D-tilt cards.
   ============================================================================ */
(function (global) {
  'use strict';

  const UI = {
    onScroll(y) {
      const nav = document.getElementById('nav');
      if (nav) nav.classList.toggle('is-scrolled', y > 60);
    },
    init() {
      initReveal();
      initMenu();
      initSlider();
      initTilt();
      initTheme();
      initNavActive();
      initHeroStats();
    },
  };
  global.UnderwaterUI = UI;

  // ---------------------------------------------------------------------------
  // 1. SECTION REVEAL (IntersectionObserver)
  // ---------------------------------------------------------------------------
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!('IntersectionObserver' in window) || els.length === 0) {
      els.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach((el) => io.observe(el));
  }

  // ---------------------------------------------------------------------------
  // 2. MOBILE MENU
  // ---------------------------------------------------------------------------
  function initMenu() {
    const menuBtn = document.querySelector('[data-menu-btn]');
    const overlay = document.querySelector('[data-menu-overlay]');
    if (!menuBtn || !overlay) return;
    let open = false;
    function set(v) {
      open = v;
      overlay.classList.toggle('is-open', open);
      document.body.classList.toggle('no-scroll', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      overlay.setAttribute('aria-hidden', String(!open));
    }
    menuBtn.addEventListener('click', () => set(!open));
    overlay.querySelectorAll('a').forEach((a) => {
      a.addEventListener('click', () => set(false));
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && open) set(false);
    });
  }

  // ---------------------------------------------------------------------------
  // 3. BEFORE/AFTER COMPARISON SLIDER
  // ---------------------------------------------------------------------------
  function initSlider() {
    const stages = document.querySelectorAll('[data-compare]');
    stages.forEach((stage) => {
      const divider = stage.querySelector('[data-divider]');
      const handle  = stage.querySelector('[data-handle]');
      const afterImg = stage.querySelector('[data-after]');
      if (!divider || !handle || !afterImg) return;

      const modelData = {
        1: {
          src: 'output_images/realesr_general_4x_output.png',
          label: 'MODEL A ENHANCED',
          info: '<strong>Enhancement Model A</strong> &mdash; High-detail underwater super-resolution',
        },
        2: {
          src: 'output_images/purephoto_span_4x_output.png',
          label: 'MODEL B ENHANCED',
          info: '<strong>Enhancement Model B</strong> &mdash; Photorealistic colour enhancement',
        },
      };

      function setProgress(pct) {
        pct = Math.max(0, Math.min(100, pct));
        divider.style.left = `${pct}%`;
        handle.style.left = `${pct}%`;
        afterImg.style.clipPath = `inset(0 ${100 - pct}% 0 0)`;
        handle.setAttribute('aria-valuenow', String(Math.round(pct)));
      }

      function updateFromPointer(clientX) {
        const rect = stage.getBoundingClientRect();
        const pct = ((clientX - rect.left) / rect.width) * 100;
        setProgress(pct);
      }

      let dragging = false;
      const startDrag = (e) => {
        dragging = true;
        stage.style.cursor = 'grabbing';
        if (e.cancelable) e.preventDefault();
      };
      const stopDrag = () => {
        dragging = false;
        stage.style.cursor = '';
      };
      const onMove = (e) => {
        if (!dragging) return;
        const x = e.touches ? e.touches[0].clientX : e.clientX;
        updateFromPointer(x);
      };
      const onClick = (e) => {
        if (e.target.closest('[data-handle]')) return;
        updateFromPointer(e.clientX);
      };

      stage.addEventListener('mousedown', (e) => {
        if (e.target.closest('[data-handle]')) startDrag(e);
      });
      stage.addEventListener('touchstart', (e) => {
        if (e.target.closest('[data-handle]')) startDrag(e);
      }, { passive: false });
      window.addEventListener('mousemove', onMove);
      window.addEventListener('touchmove', onMove, { passive: true });
      window.addEventListener('mouseup', stopDrag);
      window.addEventListener('touchend', stopDrag);
      stage.addEventListener('click', onClick);

      // Keyboard
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('role', 'slider');
      handle.setAttribute('aria-label', 'Image comparison slider');
      handle.setAttribute('aria-valuemin', '0');
      handle.setAttribute('aria-valuemax', '100');
      handle.setAttribute('aria-valuenow', '50');
      handle.addEventListener('keydown', (e) => {
        const cur = parseFloat(handle.style.left) || 50;
        let next = cur;
        if (e.key === 'ArrowLeft')  next = cur - 5;
        if (e.key === 'ArrowRight') next = cur + 5;
        if (e.key === 'Home')       next = 0;
        if (e.key === 'End')        next = 100;
        if (next !== cur) {
          e.preventDefault();
          setProgress(next);
        }
      });

      // Tabs — search up to the section so we can find a sibling tab bar
      const section = stage.closest('section') || document;
      const tabBar = section.querySelector('[data-tabs]');
      if (tabBar) {
        tabBar.querySelectorAll('[data-tab]').forEach((tab) => {
          tab.addEventListener('click', () => {
            const num = tab.dataset.tab;
            const data = modelData[num];
            if (!data) return;
            tabBar.querySelectorAll('[data-tab]').forEach((t) => {
              t.classList.toggle('is-active', t === tab);
              t.setAttribute('aria-selected', String(t === tab));
            });
            afterImg.src = data.src;
            afterImg.alt = data.label;
            const labelEl = stage.querySelector('[data-label-enhanced]');
            if (labelEl) labelEl.textContent = data.label;
            const infoEl = section.querySelector('[data-model-info]');
            if (infoEl) infoEl.innerHTML = data.info;
          });
        });
      }

      // Initial position
      setProgress(50);
    });
  }

  // ---------------------------------------------------------------------------
  // 4. 3D TILT CARDS (mouse-tracking glare)
  // ---------------------------------------------------------------------------
  function initTilt() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const isTouch = window.matchMedia('(hover: none)').matches;
    if (isTouch) return;

    document.querySelectorAll('[data-tilt]').forEach((card) => {
      let raf = null;
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          const rotY = (x - 50) * 0.08;
          const rotX = -(y - 50) * 0.08;
          card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(-4px)`;
          card.style.setProperty('--mx', `${x}%`);
          card.style.setProperty('--my', `${y}%`);
        });
      });
      card.addEventListener('mouseleave', () => {
        card.style.transform = '';
      });
    });
  }

  // ---------------------------------------------------------------------------
  // 5. LIGHT/DARK THEME
  // ---------------------------------------------------------------------------
  function initTheme() {
    const html = document.documentElement;
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const sun = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');
    function updateUI() {
      const light = html.classList.contains('light-mode');
      btn.setAttribute('aria-pressed', String(light));
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      if (sun && moon) {
        sun.style.display  = light ? 'none' : '';
        moon.style.display = light ? '' : 'none';
      }
    }
    btn.addEventListener('click', () => {
      const isLight = html.classList.toggle('light-mode');
      html.style.colorScheme = isLight ? 'light' : 'dark';
      try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch (e) {}
      updateUI();
    });
    updateUI();
  }

  // ---------------------------------------------------------------------------
  // 6. ACTIVE NAV LINK
  // ---------------------------------------------------------------------------
  function initNavActive() {
    const links = document.querySelectorAll('.nav__link[href^="#"]');
    if (links.length === 0) return;
    const targets = Array.from(links).map((l) => {
      const id = l.getAttribute('href').slice(1);
      return { link: l, el: document.getElementById(id) };
    }).filter((t) => t.el);

    if (!('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          links.forEach((l) => l.classList.toggle('is-active', l.getAttribute('href') === `#${id}`));
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });
    targets.forEach((t) => io.observe(t.el));
  }

  // ---------------------------------------------------------------------------
  // 7. HERO STAT COUNTER (count-up on first reveal)
  // ---------------------------------------------------------------------------
  function initHeroStats() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) return;
    const stats = document.querySelectorAll('.hero__stat-num');
    if (stats.length === 0) return;

    function animateOne(el) {
      const target = parseFloat(el.dataset.count);
      if (isNaN(target)) return;
      // Find numeric span and unit span
      const numSpan = el.querySelector('span:first-child');
      const unitSpan = el.querySelector('.unit');
      if (!numSpan) return;
      const isFloat = target % 1 !== 0;
      const duration = 1400;
      const start = performance.now();
      const startVal = 0;
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
        const v = startVal + (target - startVal) * e;
        numSpan.textContent = isFloat ? v.toFixed(2) : Math.round(v);
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    const statsBar = stats[0]?.parentElement?.parentElement;
    if (!statsBar || !('IntersectionObserver' in window)) {
      stats.forEach(animateOne);
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          stats.forEach(animateOne);
          io.disconnect();
        }
      });
    }, { threshold: 0.3 });
    io.observe(statsBar);
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UI.init());
  } else {
    UI.init();
  }
})(window);
