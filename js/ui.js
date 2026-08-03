/* ============================================================================
   UNDERWATER AI — UI CONTROLLER
   Section reveal, mobile menu, comparison slider, tabs, tilt, theme,
   nav active link, split-letter titles, stat count-up.
   ============================================================================ */
(function (global) {
  'use strict';

  const UI = {
    onScroll(y) {
      const nav = document.getElementById('nav');
      if (nav) nav.classList.toggle('is-scrolled', y > 60);
    },
    init() {
      splitLetterTitles();
      initReveal();
      initMenu();
      initSliders();
      initTilt();
      initTheme();
      initNavActive();
      initHeroStats();
    },
  };
  global.UnderwaterUI = UI;

  /* ---- Split-letter wrap ---- */
  function splitLetterTitles() {
    document.querySelectorAll('.section-title__main, .hero__title-line > span').forEach((el) => {
      if (el.dataset.split === '1') return;
      el.dataset.split = '1';
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
      const textNodes = [];
      let n;
      while ((n = walker.nextNode())) textNodes.push(n);
      textNodes.forEach((tn) => {
        const text = tn.textContent;
        if (!text || !text.trim()) return;
        const frag = document.createDocumentFragment();
        let ci = el.querySelectorAll('.char').length;
        for (let i = 0; i < text.length; i++) {
          const ch = text[i];
          if (ch === ' ') { frag.appendChild(document.createTextNode(' ')); }
          else { const s = document.createElement('span'); s.className = 'char'; s.textContent = ch; s.style.setProperty('--i', String(ci++)); frag.appendChild(s); }
        }
        tn.parentNode.replaceChild(frag, tn);
      });
    });
  }

  /* ---- Section reveal ---- */
  function initReveal() {
    const els = document.querySelectorAll('.reveal, .reveal-stagger');
    if (!('IntersectionObserver' in window) || els.length === 0) { els.forEach((el) => el.classList.add('is-visible')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach((el) => io.observe(el));
  }

  /* ---- Mobile menu ---- */
  function initMenu() {
    const btn = document.querySelector('[data-menu-btn]');
    const overlay = document.querySelector('[data-menu-overlay]');
    if (!btn || !overlay) return;
    let open = false;
    function set(v) {
      open = v;
      overlay.classList.toggle('is-open', open);
      document.body.classList.toggle('no-scroll', open);
      btn.setAttribute('aria-expanded', String(open));
      overlay.setAttribute('aria-hidden', String(!open));
    }
    btn.addEventListener('click', () => set(!open));
    overlay.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && open) set(false); });
  }

  /* ---- Comparison sliders ---- */
  function initSliders() {
    document.querySelectorAll('[data-compare]').forEach((stage) => {
      const divider = stage.querySelector('[data-divider]');
      const handle  = stage.querySelector('[data-handle]');
      const afterImg = stage.querySelector('[data-after]');
      if (!divider || !handle || !afterImg) return;

      const modelData = {
        1: { src: 'output_images/realesr_general_4x_output.png', label: 'MODEL A ENHANCED', info: '<strong>Enhancement Model A</strong> &mdash; High-detail underwater super-resolution' },
        2: { src: 'output_images/purephoto_span_4x_output.png', label: 'MODEL B ENHANCED', info: '<strong>Enhancement Model B</strong> &mdash; Photorealistic colour enhancement' },
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
        setProgress(((clientX - rect.left) / rect.width) * 100);
      }

      let dragging = false;
      const startDrag = (e) => { dragging = true; stage.style.cursor = 'grabbing'; if (e.cancelable) e.preventDefault(); };
      const stopDrag  = () => { dragging = false; stage.style.cursor = ''; };
      const onMove = (e) => { if (dragging) updateFromPointer(e.touches ? e.touches[0].clientX : e.clientX); };
      const onClick = (e) => { if (!e.target.closest('[data-handle]')) updateFromPointer(e.clientX); };

      stage.addEventListener('mousedown', (e) => { if (e.target.closest('[data-handle]')) startDrag(e); });
      stage.addEventListener('touchstart', (e) => { if (e.target.closest('[data-handle]')) startDrag(e); }, { passive: false });
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
        if (next !== cur) { e.preventDefault(); setProgress(next); }
      });

      // Tabs
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

      setProgress(50);
    });
  }

  /* ---- 3D tilt cards ---- */
  function initTilt() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: none)').matches) return;
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
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  /* ---- Theme toggle ---- */
  function initTheme() {
    const html = document.documentElement;
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    const sun  = document.getElementById('icon-sun');
    const moon = document.getElementById('icon-moon');
    function updateUI() {
      const light = html.classList.contains('light-mode');
      btn.setAttribute('aria-pressed', String(light));
      btn.setAttribute('aria-label', light ? 'Switch to dark mode' : 'Switch to light mode');
      if (sun && moon) { sun.style.display  = light ? 'none' : ''; moon.style.display = light ? '' : 'none'; }
    }
    btn.addEventListener('click', () => {
      const isLight = html.classList.toggle('light-mode');
      html.style.colorScheme = isLight ? 'light' : 'dark';
      try { localStorage.setItem('theme', isLight ? 'light' : 'dark'); } catch (e) {}
      updateUI();
    });
    updateUI();
  }

  /* ---- Active nav link ---- */
  function initNavActive() {
    const links = document.querySelectorAll('.nav__link[href^="#"]');
    if (links.length === 0) return;
    const targets = Array.from(links).map((l) => ({ link: l, el: document.getElementById(l.getAttribute('href').slice(1)) })).filter((t) => t.el);
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

  /* ---- Hero stat count-up ---- */
  function initHeroStats() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const stats = document.querySelectorAll('[data-count]');
    if (stats.length === 0) return;

    function animateOne(el) {
      const target = parseFloat(el.dataset.count);
      if (isNaN(target)) return;
      const numSpan = el.querySelector('span:first-child');
      if (!numSpan) return;
      const isFloat = target % 1 !== 0;
      const duration = 1000;
      const start = performance.now();
      function tick(now) {
        const t = Math.min(1, (now - start) / duration);
        const e = 1 - Math.pow(1 - t, 3); // ease-out-cubic
        const v = target * e;
        numSpan.textContent = isFloat ? v.toFixed(2) : Math.round(v);
        if (t < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    // Group stats by parent
    const groups = new Map();
    stats.forEach((el) => {
      const band = el.closest('.hero__stats, .about__band') || el.parentElement;
      if (!groups.has(band)) groups.set(band, []);
      groups.get(band).push(el);
    });

    if (!('IntersectionObserver' in window)) { stats.forEach(animateOne); return; }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          groups.get(entry.target).forEach(animateOne);
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    groups.forEach((_, band) => {
      io.observe(band);
      // Check if already visible — start immediately
      const rect = band.getBoundingClientRect();
      if (rect.top < window.innerHeight && rect.bottom > 0) {
        groups.get(band).forEach(animateOne);
        io.unobserve(band);
      }
    });
  }

  // Boot
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => UI.init());
  } else {
    UI.init();
  }
})(window);
