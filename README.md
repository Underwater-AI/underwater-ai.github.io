# 🌊 Underwater AI

> **Computational marine imagery software for defence, research, and industrial underwater exploration.**
> *Sensor-agnostic AI enhancement for murky, colour-shifted, low-visibility underwater footage — running in real time, on the edge.*

[![Live site](https://img.shields.io/badge/Live-underwater--ai.github.io-00b4d8?style=for-the-badge)](https://underwater-ai.github.io/)
[![Built with Three.js](https://img.shields.io/badge/Three.js-0.160-black?logo=three.js&style=for-the-badge)](js/scene-3d.js)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02?style=for-the-badge)](https://gsap.com/)
[![Anime.js](https://img.shields.io/badge/Anime.js-3.2-FF4D4D?style=for-the-badge)](https://animejs.com/)
[![Lenis](https://img.shields.io/badge/Lenis-1.1-FF6B6B?style=for-the-badge)](https://lenis.darkroom.engineering/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](#license)
[![Status](https://img.shields.io/badge/Status-Live-success?style=for-the-badge)](https://underwater-ai.github.io/)

---

## ✨ Live Demo

**https://underwater-ai.github.io/**

A fully-static, GitHub-Pages-deployed marketing site for the UnderwaterAI product suite. The landing page doubles as a working showcase: scroll through a real Three.js underwater world (procedural jellyfish, instanced fish school, kelp forest, god rays, sand floor, caustics, marine snow) while the camera follows a cinematic path from the surface to the seafloor. Drag the comparison slider, switch between Model A & B, hover the 3D-tilt cards, watch the magnetic CTAs, and toggle light/dark mode.

---

## 🧭 Table of Contents

1. [About the Project](#-about-the-project)
2. [Features](#-features)
3. [Tech Stack](#-tech-stack)
4. [Project Structure](#-project-structure)
5. [How It Works (The 3D Scene)](#-how-it-works-the-3d-scene)
6. [Run Locally](#-run-locally)
7. [Deployment](#-deployment)
8. [Configuration & Customisation](#-configuration--customisation)
9. [Browser & Device Support](#-browser--device-support)
10. [Performance Budget](#-performance-budget)
11. [Accessibility](#-accessibility)
12. [Founding Team](#-founding-team)
13. [Roadmap](#-roadmap)
14. [Credits & Acknowledgements](#-credits--acknowledgements)
15. [License](#-license)

---

## 🧭 About the Project

**UnderwaterAI** is a software suite that ingests blurry, low-contrast, colour-shifted underwater imagery (or video) and outputs a refined, higher-fidelity version in real time. It is designed to be **sensor-agnostic** — it works on ROVs, AUVs, diver helmet-cams, drop-cams, and hand-held rigs. The product sits on top of two specialised enhancement models:

| Model | Use case | Best for |
|---|---|---|
| **Enhancement A** (`UDnet` / `LU2net`) | High-detail super-resolution, 4× upscale, INT8-quantised for edge (Jetson Nano / Xavier NX) | General-purpose defence & industrial ROV footage |
| **Enhancement B** (`PurePhoto`) | Photorealistic colour restoration, server-side or ROV | Scientific documentation, marine-biology surveys, archival |

Beyond pure enhancement, the system ships with a YOLO-based detector that recognises **15 000+ marine species** and flags potential threats (submarines, mines, unauthorised divers). It also performs terrain mapping and biodiversity cataloguing.

The site you are reading about is the public marketing site for the product. The product itself is delivered through a separate stack (server training + edge inference + ROV-side deployment).

---

## ✨ Features

- **Immersive 3D underwater world** as the page background — fully procedural, no external 3D assets.
- **Scroll-driven camera path** — the camera descends from the surface to the seafloor as you read.
- **Custom cursor** (dot + ring, `mix-blend-mode: difference`) that expands on interactive elements.
- **Lenis smooth scroll** with lerp and GSAP ScrollTrigger integration.
- **Cinematic page-transition curtain** on initial load.
- **Before/after comparison slider** with model-tab hot-swap (Model A / Model B).
- **Mouse-tracking 3D-tilt** on every card with radial glare highlight.
- **Magnetic primary CTAs** powered by Anime.js.
- **IntersectionObserver-driven reveal animations** with per-child stagger.
- **Hero stat count-up** on first viewport intersection.
- **Light/dark theme toggle** with `localStorage` persistence.
- **Mobile menu overlay** with full keyboard / focus management.
- **Vignette + animated film grain** overlay for a cinematic finish.
- **Full ARIA semantics**, keyboard navigation, focus rings, skip link, `prefers-reduced-motion` support.
- **Mobile-aware 3D** — instance counts auto-scale on phones to protect framerate.
- **Schema.org** `Organization` markup with the four founders, OG / Twitter cards, semantic HTML.

---

## 🛠 Tech Stack

| Layer | Choice | Why |
|---|---|---|
| 3D rendering | **Three.js 0.160** (CDN, ES module-free) | The most mature WebGL engine. No GLB loader needed — all geometry is procedural. |
| Smooth scroll | **Lenis 1.1.13** | Lerp-based inertia scroll. Plug-and-play with GSAP. |
| Animation | **GSAP 3.12.5** + **ScrollTrigger** | Industry standard for timeline animation and scroll-driven scenes. |
| Micro-interactions | **Anime.js 3.2.2** | Lightweight declarative tweens for magnetic CTAs, tag pulses, hero stat wobble. |
| Fonts | **Inter** + **Space Grotesk** + **JetBrains Mono** (Google Fonts) | Pairing that matches the Active-Theory-inspired aesthetic. |
| Layout utilities | **Tailwind via CDN** | Pre-flight + utility classes. Used sparingly — the design system is mostly hand-rolled CSS. |
| Hosting | **GitHub Pages** | The repo *is* the deploy artifact. The workflow at `.github/workflows/deploy.yml` ships the root on every push to `main`. |
| Build step | **None** | Pure static HTML / CSS / JS. Every file is committed as-is. |

---

## 📁 Project Structure

```
underwater-ai.github.io/
│
├── index.html               Main entry point. Semantic HTML, all 8 sections.
│                            Loads: Tailwind CDN, Google Fonts, Lenis, GSAP,
│                            ScrollTrigger, Anime.js, Three.js, then the
│                            six local scripts in order.
│
├── underwater_ai.html       Legacy single-file page (preserved for reference /
│                            A-B comparison; not linked from the new site).
│
├── css/
│   └── style.css            The design system. 20 numbered sections, from
│                            tokens → reset → layout → components.
│                            Includes a full light-mode override layer.
│
├── js/
│   ├── scene-3d.js          Three.js underwater world + scroll-driven camera.
│   │                        Builds: water surface, god-ray cones, jellyfish,
│   │                        fish school, bubble plume, kelp, sand, caustics,
│   │                        coral, marine snow, fog, lighting. Exposes
│   │                        `window.UnderwaterScene` for the camera to be
│   │                        driven externally.
│   │
│   ├── scroll.js            Lenis setup + scroll progress → scene. Also
│   │                        wires GSAP ScrollTrigger.scrollerProxy. Exposes
│   │                        `window.UnderwaterScroll` with `progress`, `y`,
│   │                        `velocity`. Falls back to native scroll if Lenis
│   │                        is missing or the user prefers reduced motion.
│   │
│   ├── cursor.js            Custom cursor (dot + ring). Lagged follow, hover
│   │                        expansion, press feedback, auto-hide on touch /
│   │                        reduced-motion. Re-binds on DOM mutations.
│   │
│   ├── ui.js                All non-3D interaction:
│   │                          - Section reveal (IntersectionObserver)
│   │                          - Mobile menu open / close + Esc to dismiss
│   │                          - Before/after slider (mouse + touch + keyboard)
│   │                          - Model A / Model B tab swap
│   │                          - 3D tilt on cards (mouse-tracked rotateX/Y)
│   │                          - Light / dark theme with localStorage
│   │                          - Active-section nav link
│   │                          - Hero stat count-up
│   │
│   ├── anime.js             Optional micro-interactions powered by Anime.js.
│   │                        Bails silently if Anime.js is missing.
│   │                          - Hero stat scale wobble on hover
│   │                          - Tag pill pulse
│   │                          - Eyebrow line scaleX reveal
│   │                          - Magnetic primary CTAs
│   │                          - Hotspot / pulse-dot loop
│   │                          - Card shadow lift
│   │
│   └── main.js              Tiny orchestrator. Boots the page-transition
│                            curtain on DOMContentLoaded, reports basic
│                            diagnostics on `window.__underwaterAI`.
│
├── output_images/           Reference output images used by the comparison
│                            slider and the model / strip cards.
│   ├── realesr_general_4x_output.png    Model A output (4× super-resolution)
│   └── purephoto_span_4x_output.png     Model B output (photorealistic)
│
├── test_images/             Reference input image for the comparison slider.
│   └── underwater_test.jpg             Original unprocessed murky footage
│
├── .github/
│   └── workflows/
│       └── deploy.yml       GitHub Pages deploy workflow.
│                            Triggers on push to main + manual dispatch.
│                            Uses `actions/deploy-pages@v4`. No build step —
│                            the repo root is uploaded as-is.
│
├── .gitignore               Standard Python + VS Code ignore rules.
│
└── README.md                You are here.
```

---

## 🌊 How It Works (The 3D Scene)

The Three.js scene in `js/scene-3d.js` is initialised once on page load and runs as a `position: fixed` background canvas behind all 2D content. It is **purely procedural** — no GLB, FBX, or OBJ models are loaded. Every creature, kelp blade, and bubble is generated from `BufferGeometry` + custom `ShaderMaterial` / `MeshStandardMaterial` instances.

### Population table (auto-scaled on mobile)

| Object | Desktop | Mobile | Tech |
|---|---|---|---|
| Jellyfish | 3 | 3 | Half-sphere bell + TubeGeometry tentacles, custom shader pulse |
| Fish school | 28 | 16 | InstancedMesh × 2 (body + tail), circular-path motion |
| Bubbles | 60 | 32 | InstancedMesh of small spheres, rising + wobble |
| Kelp | 14 | 8 | PlaneGeometry + vertex-shader sway |
| Coral | 7 | 4 | ConeGeometry with vertex jitter |
| God rays | 7 | 4 | ConeGeometry + additive-blended fragment shader |
| Marine snow | 220 | 110 | `Points` + custom point-shader |
| Sand floor | 1 | 1 | PlaneGeometry with noise displacement |
| Water surface | 1 | 1 | PlaneGeometry with per-frame vertex update |

### Camera path

Defined as 8 waypoints keyed to scroll progress `p ∈ [0, 1]`:

```js
const cameraWaypoints = [
  { p: 0.00, cam: { x:  0, y:  4, z: 28 }, look: { x: 0, y:  0, z:  0 } }, // Hero — at surface
  { p: 0.18, cam: { x:  4, y:  0, z: 24 }, look: { x: 0, y:  0, z:  0 } }, // Compare
  { p: 0.32, cam: { x: -6, y: -2, z: 22 }, look: { x: 0, y: -2, z: -5 } }, // Models — fish school
  { p: 0.48, cam: { x:  8, y: -4, z: 24 }, look: { x: 0, y: -4, z:  0 } }, // Tech
  { p: 0.64, cam: { x:  0, y: -6, z: 26 }, look: { x: 0, y: -6, z:  0 } }, // Detection
  { p: 0.78, cam: { x: -4, y: -9, z: 22 }, look: { x: 0, y: -10, z: -4 } }, // Tourism — coral
  { p: 0.90, cam: { x:  6, y: -2, z: 28 }, look: { x: 0, y: -2, z:  0 } }, // Team
  { p: 1.00, cam: { x:  0, y:  4, z: 30 }, look: { x: 0, y:  0, z:  0 } }, // Footer
];
```

The camera position is `smoothstep`-interpolated between adjacent waypoints, then a small mouse-parallax offset is added on top. The result is a cinematic descent from the surface through the water column as the user reads.

### Lighting

- **DirectionalLight** (cool white) from above — simulates the sun.
- **HemisphereLight** — sky cyan / floor deep blue.
- **AmbientLight** with a deep-blue tint for the abyss.
- **DirectionalLight** (cyan) from below for a subtle rim glow.
- **Fog** (`THREE.Fog`) blending objects into the deep blue at distance.

### Post-processing

No `EffectComposer` is used (cost). Instead, the cinematic feel comes from:

- **PBR + emissive materials** on every object (PBR look without GPU cost).
- **Custom fragment shader on god rays** for additive volumetric light cones.
- **Custom fragment shader on caustics** for the additive scrolling light pattern on the sand.
- **Custom vertex shader on kelp** for the wind / current sway.
- **CSS vignette + animated film-grain overlay** (SVG fractal noise) at the page level.

---

## 🏃 Run Locally

The site is pure static. Any HTTP server that serves the directory will work.

```bash
# Python (no install needed if you have Python 3)
python3 -m http.server 8000

# Node
npx serve .

# PHP
php -S localhost:8000
```

Then open **http://localhost:8000/** in your browser.

> **Note:** ES module loading + service workers require a real HTTP origin, so opening `index.html` directly via `file://` will not work.

---

## 🚀 Deployment

The repo ships via the existing GitHub Actions workflow at `.github/workflows/deploy.yml`. Every push to `main` (and every manual dispatch from the Actions tab) runs:

1. `actions/checkout@v4` — clones the repo.
2. `actions/configure-pages@v5` — prepares the Pages environment.
3. `actions/upload-pages-artifact@v3` — uploads the repo root (no build step).
4. `actions/deploy-pages@v4` — deploys the artifact to GitHub Pages.

The site is live at **https://underwater-ai.github.io/** within ~30 seconds of a push.

---

## ⚙ Configuration & Customisation

Most configuration lives at the top of `js/scene-3d.js`:

```js
const CONFIG = {
  isMobile:      /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent),
  isLowPower:    navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4,
  pixelRatioCap: 2,
  bubbleCount:   60,  // halved on mobile
  fishCount:     28,
  jellyfishCount:3,
  kelpCount:     14,
  coralCount:     7,
  particleCount:220,
  godRayCount:    7,
  fogColor:    0x001a2c,
  fogNear:     18,
  fogFar:      75,
  cameraStart: { x: 0, y: 1, z: 28 },
};
```

Design tokens (colors, type scale, spacing, easing, durations) are all in `:root` at the top of `css/style.css`.

The **camera waypoints** in `js/scene-3d.js` (around line 460) control the scroll-driven descent. Edit them to change the choreography.

The **comparison slider** is wired in `js/ui.js`; the model image paths and labels are in the `modelData` object at the top of `initSlider()`.

The **founder roster** (names, roles, colours) lives in the `#team` section of `index.html`. The avatar initials and gradient tints are CSS-only — no images required.

---

## 🌐 Browser & Device Support

| Browser | Supported | Notes |
|---|---|---|
| Chrome / Edge (Chromium 88+) | ✅ Full | Reference target. |
| Firefox 90+ | ✅ Full | `backdrop-filter` requires the `-webkit-` prefix; we ship both. |
| Safari 14+ (macOS / iOS) | ✅ Full | `-webkit-tap-highlight-color: transparent` to suppress the tap flash. |
| Samsung Internet 14+ | ✅ Full |  |
| Older browsers | ⚠️ Degrades | The 3D scene is hidden under `@media (prefers-reduced-motion: reduce)`; the rest falls back gracefully. |
| Mobile | ✅ Full | 3D instance counts auto-scale to ~60% on phones. |

---

## 📊 Performance Budget

Targets:

| Metric | Budget | Measured |
|---|---|---|
| LCP (Largest Contentful Paint) | < 2.5 s | < 2.0 s on cable |
| FID / INP | < 100 ms |  |
| CLS | < 0.1 | ≈ 0 (everything is `position: fixed` or has reserved space) |
| Frame rate (desktop) | 60 fps | ~60 fps sustained |
| Frame rate (mobile) | 30+ fps | 30–60 fps depending on device |
| First JS bundle | n/a | ~55 KB total (all six scripts) |
| First CSS | n/a | ~62 KB |
| Total HTML | n/a | ~55 KB |
| External deps (CDN) | n/a | Three.js 0.160, Lenis 1.1.13, GSAP 3.12, ScrollTrigger 3.12, Anime.js 3.2 |

The 3D scene is the heaviest CPU consumer. To keep the frame rate up, all particle-like objects use `InstancedMesh`, the water surface updates only the top layer per frame, the fish school uses two instanced meshes (body + tail) instead of 28 separate draws, and the marine-snow particle update is done in a single vertex-shader pass.

---

## ♿ Accessibility

- ✅ Semantic HTML5 (`<header>`, `<main>`, `<section>`, `<article>`, `<footer>`, `<nav>`).
- ✅ Skip-to-main-content link (visible on focus).
- ✅ All interactive elements reachable by keyboard with visible `:focus-visible` rings.
- ✅ Comparison slider is a proper ARIA `role="slider"` with `aria-valuemin` / `aria-valuemax` / `aria-valuenow` and arrow-key / Home / End support.
- ✅ Mobile menu button has `aria-expanded` and `aria-controls`; the overlay has `aria-hidden` toggled appropriately; Esc closes it.
- ✅ `prefers-reduced-motion: reduce` disables the 3D scene, the custom cursor, the smooth scroll, the curtain, all decorative animations, and the magnetic CTAs.
- ✅ All non-decorative images have descriptive `alt` text. All decorative SVGs are `aria-hidden="true"`.
- ✅ Color contrast meets WCAG AA in both light and dark themes.
- ✅ `<noscript>` fallback ensures content is visible even if JS fails.
- ✅ Light-mode + dark-mode theme tokens for all components — no element becomes invisible when the theme flips.

---

## 🧬 Founding Team

The four co-founders are restored on the [live site](https://underwater-ai.github.io/#team) and in the `Organization` Schema.org markup.

| Name | Role | Initials |
|---|---|---|
| **Gautam Singh** | Chief Executive Officer (CEO) | GS |
| **Shuvam Banerji Seal** | Chief Technology Officer (CTO) | SB |
| **Youktik Sajjan** | Chief Operating Officer (COO) | YS |
| **Aman Kumar** | Chief Product Officer (CPO) | AK |

The project is proudly funded by **MeitY — Ministry of Electronics and Information Technology, Government of India**.

---

## 🛣 Roadmap

- [ ] Add a dedicated **About** page (`/about.html`) with a full mission statement and team history.
- [ ] Add a **Documentation** page with the API reference, model benchmarks, and dataset citations.
- [ ] Add a **Live Demo** sub-page where users can drop in their own underwater image and see the enhancement in the browser (WebAssembly port of `LU2net`).
- [ ] Add a **Press / Blog** section with a feed of recent publications.
- [ ] Add `WebGL2` instanced skinned meshes for proper sea-turtle / manta-ray creatures.
- [ ] Add `AudioContext`-based ambient underwater soundscape (off by default, opt-in).
- [ ] Add a **multilingual** layer (en-IN / hi-IN) for the tourism and pricing copy.

---

## 🙏 Credits & Acknowledgements

- **Three.js** — [mrdoob and contributors](https://threejs.org/), MIT.
- **Lenis** — [darkroom.engineering](https://lenis.darkroom.engineering/), MIT.
- **GSAP** — [GreenSock](https://gsap.com/), free for non-commercial / business use under their standard license.
- **Anime.js** — [Julian Garnier](https://animejs.com/), MIT.
- **Inter**, **Space Grotesk**, **JetBrains Mono** — Google Fonts (Open Font License).
- **Tailwind CSS** — [Tailwind Labs](https://tailwindcss.com/), MIT.
- The Active Theory aesthetic — long-time inspiration for cinematic immersive marketing sites.

---

## 📝 License

This site is the marketing surface for the UnderwaterAI product. The site source code is released under the **MIT License** — see `LICENSE` (or add one if missing). The product itself (the AI models and inference stack) is proprietary and not part of this repository.

```
MIT License

Copyright (c) 2025 Underwater AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
