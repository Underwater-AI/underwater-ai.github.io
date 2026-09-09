/**
 * theme.js — Light/dark switching.
 *
 * Dark is the film's native state; light is the same dive seen in sunlit
 * shallow water. The stored choice wins, otherwise the OS preference does, and
 * the 3D scene is told about the change so the water matches the page.
 */
const KEY = 'uw-theme';
const listeners = new Set();

export function currentTheme() {
  return document.documentElement.dataset.theme || 'dark';
}

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

function persist(mode) {
  try { localStorage.setItem(KEY, mode); } catch { /* private mode */ }
}

export function applyTheme(mode, { persist: save = true, animate = true } = {}) {
  const root = document.documentElement;

  if (animate) {
    root.classList.add('theme-switching');
    // One frame is enough for the paint to land with transitions suppressed.
    requestAnimationFrame(() => requestAnimationFrame(
      () => root.classList.remove('theme-switching')
    ));
  }

  root.dataset.theme = mode;
  root.style.colorScheme = mode;
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', mode === 'light' ? '#eef4f7' : '#03060b');

  const btn = document.getElementById('theme-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(mode === 'light'));
    btn.setAttribute('aria-label',
      mode === 'light' ? 'Switch to dark theme' : 'Switch to light theme');
  }

  if (save) persist(mode);
  for (const fn of listeners) fn(mode);
}

/** Subscribe to theme changes (the 3D scene uses this). */
export function onThemeChange(fn) {
  listeners.add(fn);
  fn(currentTheme());
  return () => listeners.delete(fn);
}

export function initTheme() {
  /* Dark is the default regardless of the OS preference: the whole piece is a
     night dive, and opening it in a light palette would misrepresent it. Light
     mode stays a first-class, remembered choice — just an opt-in one. */
  applyTheme(stored() === 'light' ? 'light' : 'dark',
    { persist: false, animate: false });

  document.getElementById('theme-toggle')?.addEventListener('click', () => {
    applyTheme(currentTheme() === 'light' ? 'dark' : 'light');
  });

  window.UWTheme = { current: currentTheme, apply: applyTheme };
}
