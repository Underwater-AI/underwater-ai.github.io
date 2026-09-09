/**
 * story.js — The scroll score.
 *
 * The film runs first-person: past the hero you are inside the rover looking
 * out through its canopy, and each chapter is a ScrollTrigger that decides how
 * much water sits between you and the reef, what the instruments read, and when
 * the detector starts naming what swims past.
 *
 * Every cockpit chapter is a tall runway with a sticky instrument panel, so no
 * section has to be pinned — the copy stays put while the scene plays behind it.
 */

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

/* ── Smooth scrolling ─────────────────────────────────────────────────────── */
export function initSmoothScroll() {
  const { gsap, ScrollTrigger, Lenis } = window;
  if (!gsap || !ScrollTrigger) return null;
  gsap.registerPlugin(ScrollTrigger);

  if (reduced || !Lenis) return null;

  const lenis = new Lenis({
    lerp: 0.085,
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: false,           // native momentum feels better on phones
  });

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => lenis.raf(time * 1000));
  gsap.ticker.lagSmoothing(0);

  // Anchor links must route through Lenis or they fight the smoothing.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    lenis.scrollTo(target, { offset: -70, duration: 1.3 });
  });

  window.UWLenis = lenis;
  return lenis;
}

/* ── Number counters ──────────────────────────────────────────────────────── */
function countUp(el) {
  const target = parseFloat(el.dataset.count);
  if (Number.isNaN(target)) return;
  const dec = Number(el.dataset.dec || 0);
  const node = el.firstChild;           // keep any trailing unit node intact
  if (!node) return;

  const dur = reduced ? 0 : 1200;
  const t0 = performance.now();

  const tick = (now) => {
    const p = dur ? clamp01((now - t0) / dur) : 1;
    const eased = 1 - Math.pow(1 - p, 3);
    node.nodeValue = (target * eased).toFixed(dec);
    if (p < 1) requestAnimationFrame(tick);
    else node.nodeValue = target.toFixed(dec);
  };
  requestAnimationFrame(tick);
}

/* ── Reveal-on-enter ──────────────────────────────────────────────────────── */
function initReveals() {
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('is-in');

      for (const n of e.target.querySelectorAll('[data-count]')) countUp(n);
      if (e.target.matches('[data-count]')) countUp(e.target);

      for (const bar of e.target.querySelectorAll('[data-loss]')) {
        bar.style.width = `${bar.dataset.loss}%`;
      }
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

  for (const el of document.querySelectorAll('.reveal, .stagger')) io.observe(el);
}

/* ── Navigation chrome ────────────────────────────────────────────────────── */
function initNavState() {
  const nav = document.getElementById('nav');
  const bar = document.getElementById('progress-bar');
  const links = [...document.querySelectorAll('.nav__link')];
  const sections = links
    .map((l) => document.querySelector(l.getAttribute('href')))
    .filter(Boolean);

  let raf = 0;
  const update = () => {
    raf = 0;
    const y = scrollY;
    nav?.classList.toggle('is-stuck', y > 40);

    const max = document.documentElement.scrollHeight - innerHeight;
    if (bar) bar.style.width = `${max > 0 ? clamp01(y / max) * 100 : 0}%`;

    let activeIdx = -1;
    for (let i = 0; i < sections.length; i++) {
      if (sections[i].getBoundingClientRect().top <= innerHeight * 0.4) activeIdx = i;
    }
    links.forEach((l, i) => l.classList.toggle('is-active', i === activeIdx));
  };

  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(update); }, { passive: true });
  update();
}

/* ── The score ────────────────────────────────────────────────────────────── */
export function initStory({ stage, ocean, vehicle, recon, workstation, liveDetect }) {
  const { gsap, ScrollTrigger } = window;

  initReveals();
  initNavState();

  const cockpit = document.getElementById('cockpit');
  const aiBadge = document.getElementById('ai-badge');
  const aiState = document.getElementById('ai-state');
  const dockHits = document.getElementById('dock-hits');

  const hudFields = {};
  for (const el of document.querySelectorAll('[data-hud]')) hudFields[el.dataset.hud] = el;

  let dive = 0;            // 0 at the surface, 1 at the reef floor
  let restored = 0;        // 0 murky, 1 restored

  function paintHUD() {
    const depth = lerp(12, 2412, dive);
    const set = (k, v) => { if (hudFields[k]) hudFields[k].textContent = v; };

    set('depth', String(Math.round(depth)).padStart(4, '0'));
    set('tether', String(Math.round(depth * 1.18 + 40)).padStart(4, '0'));
    set('temp', lerp(27.4, 3.1, dive).toFixed(1));
    set('ntu', (lerp(0.4, 11.6, dive) * (1 - restored * 0.93)).toFixed(1));
    set('hdg', String(Math.round(43 + dive * 78) % 360).padStart(3, '0'));
    set('locks', String(liveDetect?.lockCount ?? 0));
  }

  /** The AI module in the canopy corner is the story's status light. */
  function setAI(mode) {
    if (!aiBadge) return;
    aiBadge.classList.toggle('is-armed', mode === 'armed');
    aiBadge.classList.toggle('is-active', mode === 'active');
    if (aiState) {
      aiState.textContent =
        mode === 'active' ? 'Active' : mode === 'armed' ? 'Engaging' : 'Standby';
    }
  }
  setAI('standby');
  paintHUD();

  /* The detector runs on its own frame loop so boxes track creatures exactly. */
  if (liveDetect) {
    const tick = () => {
      if (stage?.getAct?.() === 'ocean') liveDetect.update();
      paintHUD();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /* Inspector rows in the identify dock, revealed in step with the boxes. */
  const hitRows = [];
  if (dockHits && ocean?.targets) {
    for (const t of ocean.targets) {
      const sp = t.userData.species;
      const row = document.createElement('div');
      row.className = 'dock__hit';
      row.innerHTML = `<i></i><span>${sp.name}</span><b>${sp.conf.toFixed(1)}%</b>`;
      dockHits.append(row);
      hitRows.push(row);
    }
  }
  const showHits = (n) => hitRows.forEach((r, i) => r.classList.toggle('is-on', i < n));

  if (!gsap || !ScrollTrigger) {
    // Without the animation libraries the page still has to be a complete,
    // readable document with a clear scene.
    stage?.setMurk(0);
    cockpit?.classList.add('is-live');
    setAI('active');
    liveDetect?.setEngaged(1);
    showHits(hitRows.length);
    return { paintHUD };
  }

  const st = (config) => ScrollTrigger.create(config);

  /* ── Act 1: descent — still outside the vehicle ────────────────────────── */
  st({
    trigger: '#descent',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    onUpdate: (self) => {
      dive = self.progress * 0.28;
      ocean.setProgress(self.progress * 0.16);
      stage.setMurk(lerp(0.58, 0.78, self.progress));
      paintHUD();
    },
  });

  /* You climb into the rover as the hero leaves the screen. */
  st({
    trigger: '#murk',
    start: 'top 92%',
    onEnter: () => cockpit?.classList.add('is-live'),
    onLeaveBack: () => cockpit?.classList.remove('is-live'),
  });

  /* ── Act 2: the murk deepens ───────────────────────────────────────────── */
  st({
    trigger: '#murk',
    start: 'top bottom',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      dive = 0.28 + self.progress * 0.5;
      ocean.setProgress(0.16 + self.progress * 0.30);
      stage.setMurk(lerp(0.78, 1.0, self.progress));
      paintHUD();
    },
  });

  /* ── Act 3: restoration — the wipe scrubs with the scroll ──────────────── */
  st({
    trigger: '#enhance',
    start: 'top top',
    end: 'bottom bottom',
    scrub: true,   // Lenis already eases the scroll; double-smoothing only adds lag
    onUpdate: (self) => {
      const p = self.progress;
      dive = 0.78 + p * 0.22;

      // 0.00-0.16 hold · 0.16-0.74 sweep the wipe · then settle clear
      const sweep = clamp01((p - 0.16) / 0.58);
      restored = sweep;

      if (sweep <= 0.001) {
        stage.setWipe(-1);
        stage.setMurk(1);
        setAI('standby');
      } else if (sweep < 0.999) {
        stage.setWipe(1 - sweep);   // the edge travels right to left
        stage.setMurk(1);
        setAI('armed');
      } else {
        stage.setWipe(-1);
        stage.setMurk(0);
        setAI('active');
      }

      ocean.setProgress(0.46 + p * 0.40);
      paintHUD();
    },
    onLeaveBack: () => { stage.setWipe(-1); stage.setMurk(1); restored = 0; setAI('standby'); },
  });

  /* ── Act 4: the detector locks on, one creature at a time ──────────────── */
  st({
    trigger: '#identify',
    start: 'top bottom',
    end: 'bottom bottom',
    scrub: true,
    onUpdate: (self) => {
      stage.setWipe(-1);
      stage.setMurk(0);
      restored = 1;
      setAI('active');

      // Ramp in over the first two thirds, then hold every lock.
      const engage = clamp01(self.progress / 0.66);
      liveDetect?.setEngaged(engage);
      showHits(Math.round(engage * hitRows.length));

      // The camera almost holds here: identification needs a steady frame.
      ocean.setProgress(0.86 + self.progress * 0.10);
      ocean.setReveal(0);
      paintHUD();
    },
    onLeaveBack: () => { liveDetect?.setEngaged(0); showHits(0); },
  });

  /* ── Act 5: the pull-back ──────────────────────────────────────────────
     A cut is hidden inside a blink. The sensor readout coarsens, the lids
     close, the camera leaves the pilot's eye while the frame is black, then
     the lids open on a coarse third-person image that resolves. The viewer
     never sees the seam — they just realise they were inside a machine. */
  const step = (v, a, b) => clamp01((v - a) / (b - a));

  st({
    trigger: '#reveal',
    start: 'top bottom',
    end: 'bottom bottom',
    scrub: true,   // Lenis already eases the scroll; double-smoothing only adds lag
    onUpdate: (self) => {
      const p = self.progress;
      stage.setMurk(0);
      stage.setWipe(-1);
      restored = 1;

      /* Timings are in trigger progress, where 0 is the section entering the
         viewport bottom. The blink is held back until the chapter's panel is
         actually on screen, so the reader is watching when it happens. */

      // 1. Readout coarsens, then resolves again on the far side of the blink.
      const coarsen = step(p, 0.30, 0.46);
      const resolve = step(p, 0.66, 0.88);
      stage.setPixel(Math.max(0, coarsen - resolve));

      // 2. The lids close, and open again on the far side.
      const shut = step(p, 0.44, 0.55);
      const open = step(p, 0.60, 0.73);
      stage.setIris(Math.max(0, shut - open));

      // 3. The camera leaves the rover's eye while the frame is dark.
      ocean.setReveal(step(p, 0.50, 0.66));

      // 4. The canopy and its detections belong to the pilot's view only.
      if (cockpit) cockpit.style.opacity = String(1 - step(p, 0.38, 0.52));
      liveDetect?.setEngaged(1 - step(p, 0.32, 0.46));

      ocean.setProgress(0.97 + p * 0.03);
      paintHUD();
    },
    onLeaveBack: () => {
      ocean.setReveal(0);
      stage.setPixel(0);
      stage.setIris(0);
      if (cockpit) cockpit.style.opacity = '';
      liveDetect?.setEngaged(1);
    },
    onLeave: () => { stage.setPixel(0); stage.setIris(0); },
  });

  /* ── The cockpit retires once we leave the water ───────────────────────── */
  st({
    trigger: '#vehicle',
    start: 'top 88%',
    onEnter: () => {
      cockpit?.classList.remove('is-live');
      if (cockpit) cockpit.style.opacity = '';
      stage.setWipe(-1);
      stage.setMurk(0);
      stage.setPixel(0);
      stage.setIris(0);
      restored = 1;
    },
    onLeaveBack: () => cockpit?.classList.add('is-live'),
  });

  /* ── Act 5: the vehicle ────────────────────────────────────────────────── */
  const hotspots = [...document.querySelectorAll('.hotspot')];
  st({
    trigger: '#vehicle',
    start: 'top 80%',
    end: 'bottom 20%',
    scrub: true,
    onEnter: () => stage.setAct('vehicle'),
    onEnterBack: () => stage.setAct('vehicle'),
    onLeave: () => stage.setAct('ocean'),
    onLeaveBack: () => stage.setAct('ocean'),
    onUpdate: (self) => vehicle.setProgress(self.progress),
  });

  const trackHotspots = () => {
    if (stage.getAct() === 'vehicle') vehicle.projectHotspots(hotspots);
    else for (const h of hotspots) h.classList.remove('is-on');
    requestAnimationFrame(trackHotspots);
  };
  requestAnimationFrame(trackHotspots);

  /* ── Act 6: Abyssal Studio runs its first pass on arrival ──────────────── */
  if (workstation) {
    st({
      trigger: '#ws',
      start: 'top 65%',
      once: true,
      onEnter: () => workstation.run('species'),
    });
  }

  /* ── Act 7: reconstruction ─────────────────────────────────────────────── */
  const steps = [...document.querySelectorAll('.step')];
  st({
    trigger: '#reconstruct',
    start: 'top 70%',
    end: 'bottom 40%',
    scrub: true,
    onEnter: () => stage.setAct('recon'),
    onEnterBack: () => stage.setAct('recon'),
    onLeave: () => stage.setAct('ocean'),
    onLeaveBack: () => stage.setAct('ocean'),
    onUpdate: (self) => {
      recon.setProgress(self.progress);
      const active = Math.min(3, Math.floor(self.progress * 4.0));
      steps.forEach((s, i) => s.classList.toggle('is-on', i === active));
    },
  });

  /* Keep measurements honest.
     Every trigger position is computed from the document's layout at refresh
     time. Late webfonts, decoded images and the sticky runways all change that
     height after first paint, and a stale measurement silently desynchronises
     the entire film from the scrollbar. So: refresh on resize, and also
     whenever the document's own height actually changes. */
  let rt = 0;
  const refreshSoon = () => {
    clearTimeout(rt);
    rt = setTimeout(() => ScrollTrigger.refresh(), 200);
  };
  addEventListener('resize', refreshSoon, { passive: true });

  /* A ResizeObserver on the body was tried here and removed: ScrollTrigger's
     refresh re-runs trigger callbacks, so a height change mid-scroll could
     replay an earlier chapter's state over the current one. The one-shot
     refreshes below cover the cases that actually matter. */
  document.fonts?.ready.then(refreshSoon).catch(() => {});
  addEventListener('load', refreshSoon, { once: true });

  return {
    paintHUD,
    setAI,
    get dive() { return dive; },
    get restored() { return restored; },
    refresh: () => ScrollTrigger.refresh(),
  };
}

/* ── Hero intro, played once the boot screen lifts ────────────────────────── */
export function playIntro() {
  const { gsap } = window;
  const lines = document.querySelectorAll('.hero__title .ln > span');
  if (!gsap || reduced) {
    for (const l of lines) l.style.transform = 'none';
    return;
  }
  gsap.set(lines, { yPercent: 108 });
  gsap.to(lines, { yPercent: 0, duration: 1.15, ease: 'expo.out', stagger: 0.09, delay: 0.15 });
  gsap.from('.hero__badge, .hero__sub, .hero__cta, .scroll-cue', {
    opacity: 0, y: 22, duration: 0.9, ease: 'power3.out', stagger: 0.09, delay: 0.5,
  });
}
