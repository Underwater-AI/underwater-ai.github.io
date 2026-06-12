# Changelog

All notable changes to this site are documented here. Dates are YYYY-MM-DD.

## 2025-06-12 — World-class UI/UX redesign

### Added
- Full Three.js procedural underwater world (water surface, god rays, jellyfish, fish school, bubbles, kelp, sand, caustics, coral, marine snow).
- Scroll-driven camera path with 8 waypoints.
- Lenis smooth scroll with lerp + GSAP ScrollTrigger integration.
- Custom cursor (dot + ring) with `mix-blend-mode: difference`.
- Page-transition curtain on initial load.
- IntersectionObserver-driven reveal animations.
- 3D-tilt-on-hover cards with mouse-tracked radial glare.
- Magnetic primary CTAs (Anime.js).
- Hero stat count-up on first viewport intersection.
- Light/dark theme toggle with `localStorage` persistence.
- Mobile menu overlay.
- Schema.org `Organization` markup with the four founders.
- Comprehensive `README.md` documenting every file.
- `LICENSE` (MIT) for the site source.

### Changed
- Single-file `index.html` (1,651 lines) split into:
  - `index.html` (1,046 lines) — semantic structure only.
  - `css/style.css` (2,287 lines) — design system + light/dark tokens.
  - `js/scene-3d.js` (807 lines) — Three.js underwater world.
  - `js/ui.js` (320 lines) — reveals, slider, tabs, theme, tilt.
  - `js/scroll.js` (117 lines) — Lenis + ScrollTrigger.
  - `js/cursor.js` (78 lines) — custom cursor.
  - `js/anime.js` (151 lines) — micro-interactions.
  - `js/main.js` (58 lines) — page-transition curtain.
- All four founder names restored: Gautam Singh, Shuvam Banerji Seal, Youktik Sajjan, Aman Kumar.
- Net index.html: -618 lines (logic extracted to JS modules).

### Performance
- 3D instance counts auto-scale on mobile (60% reduction for bubbles / fish / kelp / coral / particles / god rays).
- All non-critical images use `loading="lazy"`.
- All scripts use `defer` for non-blocking parse.
- `prefers-reduced-motion: reduce` disables 3D, cursor, smooth scroll, and decorative animations.

## Earlier history

See `git log` for the full commit history. The original Tailwind-based single-file site lived in this repo before 2025-06-12.
