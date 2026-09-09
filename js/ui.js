/**
 * ui.js — Page chrome that has nothing to do with the 3D: the mobile menu,
 * download-size chips, and small keyboard affordances.
 */

export function initMenu() {
  const burger = document.getElementById('burger');
  const menu = document.getElementById('menu');
  if (!burger || !menu) return;

  const setOpen = (open) => {
    menu.classList.toggle('is-open', open);
    menu.setAttribute('aria-hidden', String(!open));
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    document.documentElement.style.overflow = open ? 'hidden' : '';
    if (open) menu.querySelector('.menu__link')?.focus();
  };

  burger.addEventListener('click', () => setOpen(!menu.classList.contains('is-open')));
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) setOpen(false); });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.classList.contains('is-open')) {
      setOpen(false);
      burger.focus();
    }
  });

  // A menu left open across a breakpoint change would trap the page.
  matchMedia('(min-width: 62rem)').addEventListener('change', (e) => {
    if (e.matches) setOpen(false);
  });
}

/** Label each download chip from the build manifest — no extra requests. */
export function applyDownloadSizes(manifest) {
  const human = (n) => (!n ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const map = {
    'dl-stl-size': manifest?.downloads?.stl,
    'dl-glb-size': manifest?.downloads?.glb,
    'dl-draco-size': manifest?.downloads?.draco,
  };
  for (const [id, bytes] of Object.entries(map)) {
    const el = document.getElementById(id);
    if (el) el.textContent = human(bytes);
  }
}

/** Fill the mesh spec row from the generated part manifest. */
export function applyManifest(manifest) {
  const el = document.getElementById('spec-tris');
  if (!el || !manifest) return;
  el.textContent = `${manifest.triangles.toLocaleString()} tris`;
}
