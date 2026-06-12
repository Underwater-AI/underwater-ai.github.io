# Changelog

All notable changes to this site are documented here. Dates are YYYY-MM-DD.

## 2025-06-12 (later) — v3.1 — Dramatic visual overhaul (bioluminescent)

### Changed
- **Color palette overhaul**: deep midnight `#020410` → bioluminescent teal `#00f0e0` as primary. New accents: coral pink `#ff3d6e`, golden amber `#ffd60a`, cyan-glow `#00ffd5`, bioluminescent purple `#c084fc`. Cream-white text. All glass surfaces and borders now tint teal-glow.
- **Hero typography**: display font-size now `clamp(3.5rem, 11vw, 11rem)` (was 6.5rem max) — viewport-spanning. Title `line-height: 0.88`. New shimmering 5-stop gradient text effect on the accent word.
- **Primary button**: cyan-glow gradient with bioluminescent glow shadow.
- **Hero stats bar**: now has gradient backdrop + blur for depth.
- **Scroll cue**: cyan-glow color (was muted gray).
- **All PBR materials now glow under RoomEnvironment IBL** thanks to the new envMapIntensity values.
- **3D scene population**: jellyfish 5 (was 3), particles 380 (was 220), bubbles 90 (was 60), kelp 18 (was 14), coral 9 (was 7), god rays 9 (was 7).
- **Real BarramundiFish.glb (12.5 MB)** loaded and instanced — 18 fish swimming in circular paths with tail wag.

### Added
- **Giant hero jellyfish** (4.5× scale) prominently in the foreground at (2, 1.5, 12).
- **Bioluminescent plankton** — 90 extra-bright glowing cyan particles with twinkle animation.
- **Data streams** — 6 vertical streams of glowing particles flowing upward, representing AI data flow.
- **3 floating data tiles** in the hero (DEPTH, LATENCY, SPECIES) with glass-morphism, fade-in animation, and gentle floating loop.
- **Decorative SVG wave** at the bottom of the hero section.
- **Per-section accent dividers** — 120px-wide glowing accent bar at the top of each section, unique color per section.
- **Split-letter text reveals** — every section title is now split into per-character `<span class="char">` wrappers, cascading in with 3D flip animation on viewport intersection.

### Performance
- Mobile auto-scales 3D instance counts by ~50%.
- All scripts use `defer` for non-blocking parse.
- `prefers-reduced-motion: reduce` disables 3D, cursor, smooth scroll, and decorative animations.

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
