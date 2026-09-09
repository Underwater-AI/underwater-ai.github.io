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

  let depthFrac = 0;       // 0 at the surface, 1 on the reef floor (drives the HUD)
  let restored = 0;        // 0 murky, 1 restored

  function paintHUD() {
    const depth = lerp(12, 2412, depthFrac);
    const set = (k, v) => { if (hudFields[k]) hudFields[k].textContent = v; };

    set('depth', String(Math.round(depth)).padStart(4, '0'));
    set('tether', String(Math.round(depth * 1.18 + 40)).padStart(4, '0'));
    set('temp', lerp(27.4, 3.1, depthFrac).toFixed(1));
    set('ntu', (lerp(0.4, 11.6, depthFrac) * (1 - restored * 0.93)).toFixed(1));
    set('hdg', String(Math.round(43 + depthFrac * 78) % 360).padStart(3, '0'));
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
  const step = (v, a, b) => clamp01((v - a) / (b - a));

  /* ── One writer for the stage ───────────────────────────────────────────
     Every chapter wants to set murk, pixelation, the iris and the camera. If
     each one writes those directly, the result depends on the order
     ScrollTrigger happens to fire its triggers in — which changes whenever the
     document's height changes, and fails silently when it does.
     So chapters only record their own progress here, and a single function
     derives the whole stage from them. The current chapter is simply the last
     one that has been entered, which is unambiguous however the triggers fire. */
  const CHAPTERS = ['descent', 'murk', 'enhance', 'identify', 'reveal',
                    'vehicle', 'perception', 'suite'];
  const at = Object.fromEntries(CHAPTERS.map((c) => [c, 0]));

  function applyStage() {
    let current = 'descent';
    for (const c of CHAPTERS) if (at[c] > 0) current = c;
    const p = at[current];

    let murkV = 1, wipeV = -1, pixelV = 0, irisV = 0;
    let revealV = 0, orbitV = 0, diveV = 0, tunnelV = 0;
    let engage = 0, oceanP = 0, canopy = 1, ai = 'standby';

    switch (current) {
      case 'descent':
        murkV = lerp(0.58, 0.78, p);
        oceanP = p * 0.16;
        depthFrac = p * 0.28;
        break;

      case 'murk':
        murkV = lerp(0.78, 1.0, p);
        oceanP = 0.16 + p * 0.30;
        depthFrac = 0.28 + p * 0.50;
        break;

      case 'enhance': {
        // 0.00-0.16 hold · 0.16-0.74 sweep the wipe · then settle clear
        const sweep = clamp01((p - 0.16) / 0.58);
        restored = sweep;
        if (sweep <= 0.001) { murkV = 1; wipeV = -1; ai = 'standby'; }
        else if (sweep < 0.999) { murkV = 1; wipeV = 1 - sweep; ai = 'armed'; }
        else { murkV = 0; wipeV = -1; ai = 'active'; }
        oceanP = 0.46 + p * 0.40;
        depthFrac = 0.78 + p * 0.22;
        break;
      }

      case 'identify':
        murkV = 0;
        ai = 'active';
        restored = 1;
        engage = clamp01(p / 0.66);
        oceanP = 0.86 + p * 0.10;
        depthFrac = 1;
        break;

      case 'reveal': {
        /* A cut hidden inside a blink: the readout coarsens, the lids close,
           the camera leaves the pilot's eye while the frame is dark, then the
           lids open on a coarse third-person image that resolves. */
        murkV = 0;
        ai = 'active';
        restored = 1;
        depthFrac = 1;
        pixelV = Math.max(0, step(p, 0.30, 0.46) - step(p, 0.66, 0.88));
        irisV = Math.max(0, step(p, 0.44, 0.55) - step(p, 0.60, 0.73));
        revealV = step(p, 0.50, 0.66);
        canopy = 1 - step(p, 0.38, 0.52);
        engage = 1 - step(p, 0.32, 0.46);
        oceanP = 0.97 + p * 0.03;
        break;
      }

      case 'vehicle':
        murkV = 0;
        ai = 'active';
        restored = 1;
        depthFrac = 1;
        canopy = 0;
        revealV = 1;
        orbitV = clamp01(p / 0.72);
        diveV = step(p, 0.76, 1.0);
        tunnelV = step(p, 0.82, 1.0);
        pixelV = diveV * 0.9;
        oceanP = 1;
        break;

      case 'perception':
        // Already inside the lens; the readout resolves as the studio takes over.
        murkV = 0;
        ai = 'active';
        restored = 1;
        depthFrac = 1;
        canopy = 0;
        revealV = 1;
        orbitV = 1;
        diveV = 1;
        tunnelV = 1 - p;
        pixelV = 0.9 * (1 - p);
        oceanP = 1;
        break;

      case 'suite':
        /* Everything past the workbench is ordinary page. Back the camera out
           of the dome and leave a calm third-person shot of the vehicle over
           the reef — parked inside the lens, the rest of the site would sit on
           a blurred close-up of the hull. */
        murkV = 0;
        ai = 'active';
        restored = 1;
        depthFrac = 1;
        canopy = 0;
        revealV = 1;
        orbitV = 0;
        diveV = 0;
        oceanP = 1;
        break;
    }

    stage.setMurk(murkV);
    stage.setWipe(wipeV);
    stage.setPixel(pixelV);
    stage.setIris(irisV);
    stage.setTunnel(tunnelV);
    ocean.setProgress(oceanP);
    ocean.setReveal(revealV);
    ocean.setOrbit(orbitV);
    ocean.setDive(diveV);
    liveDetect?.setEngaged(engage);
    showHits(Math.round(engage * hitRows.length));

    cockpit?.classList.toggle('is-live', canopy > 0.02 && current !== 'descent');
    if (cockpit) cockpit.style.opacity = canopy > 0.98 ? '' : String(canopy);
    setAI(ai);
    paintHUD();
  }

  /**
   * Wire a chapter's scroll range to its slot in the stage.
   *
   * All four edge callbacks matter. A fast scroll — a scrollbar drag, a jump
   * to an anchor, a flung phone — can carry the page across a chapter's whole
   * range inside a single update. ScrollTrigger then reports entering and
   * leaving without ever running onUpdate in between, so a chapter that has
   * been passed must be recorded as finished, not as barely begun.
   */
  function chapter(name, config) {
    const set = (v) => { at[name] = v; applyStage(); };
    st({
      trigger: `#${name}`,
      scrub: true,
      ...config,
      onUpdate: (self) => set(self.progress),
      onEnter: () => set(Math.max(at[name], 0.0001)),
      onEnterBack: () => set(Math.min(at[name] || 1, 1)),
      onLeave: () => set(1),
      onLeaveBack: () => set(0),
    });
  }

  chapter('descent', { start: 'top top', end: 'bottom top' });
  chapter('murk', { start: 'top bottom', end: 'bottom bottom' });
  chapter('enhance', { start: 'top top', end: 'bottom bottom' });
  chapter('identify', { start: 'top bottom', end: 'bottom bottom' });
  chapter('reveal', { start: 'top bottom', end: 'bottom bottom' });
  chapter('vehicle', { start: 'top bottom', end: 'bottom bottom' });
  chapter('perception', { start: 'top 85%', end: 'top 30%' });
  chapter('suite', { start: 'top bottom', end: 'bottom bottom' });

  applyStage();

  /* Hotspots track the hull every frame while the orbit is running. */
  const hotspots = [...document.querySelectorAll('#rov-hotspots .hotspot')];
  const trackHotspots = () => {
    ocean.projectHotspots(hotspots);
    requestAnimationFrame(trackHotspots);
  };
  requestAnimationFrame(trackHotspots);

  /* ── Act 7: Abyssal Studio runs its first pass on arrival ──────────────── */
  if (workstation) {
    st({
      trigger: '#ws',
      start: 'top 65%',
      once: true,
      onEnter: () => workstation.run('species'),
    });
  }

  /* ── Act 8: reconstruction ─────────────────────────────────────────────── */
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
    /** Per-chapter scroll progress — the single source the stage derives from. */
    beats: at,
    applyStage,
    get depthFrac() { return depthFrac; },
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
