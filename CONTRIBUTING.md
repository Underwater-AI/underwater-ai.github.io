# Contributing

Thanks for your interest in contributing to the Underwater AI marketing site! 🎉

## What lives in this repo

This is the public marketing site for the UnderwaterAI product. It is a static, vanilla HTML / CSS / JS site deployed via GitHub Pages. The product itself (the AI models, training pipeline, edge inference stack) lives in separate private repositories and is **not** part of this codebase.

If you spot a typo, a broken link, a layout bug, or want to improve the UI / UX / accessibility — pull requests are welcome.

## Getting set up locally

The site is pure static. Any HTTP server will do.

```bash
# Clone
git clone https://github.com/Underwater-AI/underwater-ai.github.io.git
cd underwater-ai.github.io

# Serve (any of these)
python3 -m http.server 8000
# or
npx serve .
```

Open **http://localhost:8000/** in your browser.

> Direct `file://` access will not work — the browser will refuse to load the deferred scripts. Use a real HTTP origin.

## Making changes

1. **Fork** the repo and create a feature branch.
2. Edit the relevant files. The structure is:
   - `index.html` — semantic markup for the 8 page sections.
   - `css/style.css` — design system (tokens, components, light/dark).
   - `js/scene-3d.js` — Three.js underwater world + scroll camera path.
   - `js/ui.js` — reveals, slider, tabs, theme toggle, tilt, hero stats.
   - `js/scroll.js` — Lenis + GSAP ScrollTrigger integration.
   - `js/cursor.js` — custom cursor.
   - `js/anime.js` — Anime.js micro-interactions.
   - `js/main.js` — page-transition curtain orchestrator.
3. **Test locally** in a desktop browser and a mobile viewport. Verify:
   - 3D scene renders.
   - Custom cursor follows mouse.
   - Comparison slider drags and tabs swap.
   - Reveal animations fire as you scroll.
   - Light / dark toggle persists across reload.
4. **Commit** with a descriptive message.
5. **Open a pull request** against `main`. The GitHub Actions workflow will deploy your change to https://underwater-ai.github.io/ within ~30 seconds of merge.

## Style guide

- **HTML**: semantic. Use `<section>`, `<article>`, `<header>`, `<main>`, `<footer>`, `<nav>` where appropriate. All interactive elements must have an `aria-label` or visible text.
- **CSS**: the design system lives in `:root` at the top of `style.css`. Reuse tokens (`var(--c-cyan-400)`, `var(--s-5)`, etc.) — do not hardcode.
- **JS**: each file is an IIFE that hangs its public surface off `window.Underwater*` (`UnderwaterScene`, `UnderwaterScroll`, `UnderwaterUI`). No frameworks, no bundlers.
- **No new dependencies** in the deploy workflow. The site has zero build step.

## Accessibility

Pull requests that regress accessibility (focus rings, keyboard nav, ARIA, contrast, reduced-motion handling) will be asked for changes. If you are unsure how your change affects a11y, run the page with VoiceOver / NVDA / a keyboard only and confirm the experience.

## Reporting issues

Open an issue on the GitHub tracker. Please include:

- A short description of the bug or improvement.
- A screenshot / video if it is visual.
- Browser + OS + viewport size.
- For accessibility bugs: the assistive technology in use (e.g. "NVDA 2024.4 on Firefox 124, Windows 11").

## Code of conduct

This project follows the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
