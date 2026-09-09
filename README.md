# 🌊 Underwater AI

> **Computational marine imagery for defence, research and industry.**
> Real-time underwater restoration, species and threat identification, and
> image-to-3D seafloor reconstruction — running on the vehicle, on the edge.

[![Live site](https://img.shields.io/badge/live-underwaterai.org-38e1ff?style=for-the-badge)](https://underwaterai.org/)
[![Three.js](https://img.shields.io/badge/three.js-0.160-black?logo=three.js&style=for-the-badge)](https://threejs.org/)
[![GSAP](https://img.shields.io/badge/GSAP-3.12-88CE02?style=for-the-badge)](https://gsap.com/)
[![License](https://img.shields.io/badge/license-MIT-blue?style=for-the-badge)](LICENSE)

---

## What this is

A scroll-driven film about what water does to an image, and what we do about it.

You open on the surface, climb into an ROV, and descend. The water takes the
picture apart. Then the restoration models come online, the frame is rebuilt in
front of you, and the detector starts naming what swims past — boxes locked onto
real animals in a real 3D scene, not onto invented coordinates. Then the camera
blinks, backs out of your own eye, and shows you the machine you were inside.

Everything on the page is generated: the reef, the animals, the vehicle. There
are no purchased models and no megabyte texture downloads.

## The chapters

| # | Chapter | What happens |
|---|---------|--------------|
| 00 | Boot | Real asset progress, staged as a dive computer coming up |
| 01 | Descent | Hero. The surface, and the way down |
| 02 | The problem | First person inside the rover. Light, colour and contrast are stripped out |
| 03 | Restoration | A wipe sweeps the frame and the water gets out of the way |
| 04 | Identify | Detection locks onto live creatures in the 3D scene |
| 05 | The reveal | Readout coarsens, the lids close, the camera leaves the rover's eye |
| 06 | The vehicle | The same camera orbits the hull it just revealed; parts are called out one at a time, then it flies back in through the dome port |
| 07 | Abyssal Studio | The analysis workbench: species, geology and threat passes |
| 08 | Reconstruction | One frame becomes a depth field, a point cloud, then a mesh |
| 09–12 | Platform, deployment, team, contact | The company behind it |

Chapters 04 to 07 are one unbroken camera move. There is no cut between "inside
the rover" and "looking at the rover" — the exit is hidden inside a blink, and
the vehicle inspection happens in the same water, with the same camera, before
it flies back into the lens it started behind.

## The vehicle is real geometry

`ABYSS-1` is generated parametrically by [`tools/build-rov.mjs`](tools/build-rov.mjs)
— chassis, syntactic foam, titanium housings, six vectored thrusters, a
five-function manipulator, sonar, DVL and CTD — and exported three ways:

| File | Purpose |
|------|---------|
| [`assets/models/rov.draco.glb`](assets/models/rov.draco.glb) | Draco-compressed, what the browser downloads (~61% smaller) |
| [`assets/models/rov.glb`](assets/models/rov.glb) | Uncompressed glTF, the source of truth |
| [`assets/models/rov.stl`](assets/models/rov.stl) | Binary STL for printing or CAD |
| [`assets/models/rov.json`](assets/models/rov.json) | Part manifest: named assemblies, triangle counts, dimensions |

Regenerate with `npm run build:rov`. CI fails the build if the committed model
no longer matches what the generator produces.

## Running it

```bash
npm install
npm run serve      # http://localhost:4173
npm test           # full end-to-end suite (starts its own server)
npm run test:live  # smoke the production deployment
npm run build:rov  # regenerate the ABYSS-1 model and its exports
```

`SMOKE=1` trims the run to "is the deployed thing actually working" — the story
beats, every asset, and layout at two widths. The full matrix, both themes and
the contrast audit already ran against that same code before it shipped, so
repeating them against production only proves the network works.

Two capture tools are included for looking at changes rather than asserting on
them — both write PNGs to `/tmp/uw-shots`:

```bash
npm run tour 1440 900   # screenshot every beat of the film at a given size
npm run shot hero 0.4   # one shot, at a fraction of the page
```

## What the tests actually check

The suite ([`tests/site.spec.mjs`](tests/site.spec.mjs)) is opinionated about
the things this design depends on:

- **No text ever overflows its container**, at five viewport widths, measured
  with [Pretext](https://github.com/chenglou/pretext) rather than by eye
- **No chapter introduces horizontal scroll**, at any of those widths
- **WCAG AA contrast** for body copy in both themes, including gradient fills
- Every story beat reaches its intended state: the water clears, the detector
  locks on, the camera pulls back, orbits the hull and flies into its lens
- The downloadable models are served, non-trivial and have valid headers
- Draw-call and triangle budgets (frame rate is meaningless in CI's software
  renderer; these are the portable numbers)
- Reduced-motion and no-JavaScript both still produce a complete, readable page

## How it is built

No bundler, no framework. ES modules over an import map, served as-is.

```
index.html            One document, every chapter
css/style.css         Design system. Themed via channel tokens, not overrides
js/
  app.js              Entry: boot the dive, then hand over to the story
  story.js            The scroll score — every chapter is a ScrollTrigger
  dock.js             Chapter panels, collapsed to a heading on small screens
  loader.js           Weighted boot loader with real byte progress
  typo.js             Pretext-driven heading fitting and overflow auditing
  theme.js            Light/dark switching, and telling the 3D about it
  livedetect.js       Detection boxes locked onto live 3D creatures
  labelpack.js        Shared label collision packing
  workstation.js      Abyssal Studio, the analysis workbench
  ui.js               Menu, download chips, part manifest
  gl/
    core.js           One renderer, several acts, one post pass
    ocean.js          The reef: seabed, coral, kelp, schools, light shafts
    creatures.js      Jellyfish, turtles, manta, seahorses — built from anatomy
    vehicle.js        ABYSS-1: Draco decode, normalise, studio IBL
    reconstruct.js    Image to depth field to point cloud to mesh
vendor/               Pretext and the Draco decoder, vendored for offline use
tools/                Model generator, dev server, test runner, capture tools
```

### The one dial the whole film turns on

`uMurk` in [`js/gl/core.js`](js/gl/core.js) — a single uniform that takes the
scene from "drowned in water" to "restored". It models what water actually does:
wavelength-dependent absorption, additive backscatter haze, turbidity blur and
marine snow. The restoration chapter animates a wipe edge across it.

Three more uniforms in the same pass carry the rest of the film: `uPixel`
coarsens the sensor readout, `uIris` closes a pair of eyelids, and `uTunnel`
narrows the frame to a lens barrel. When all four are idle the entire pass and
its render-target round trip are skipped, so most of the page costs nothing.

### The panel gets out of the way on a phone

A chapter panel that carries a title, a paragraph, meters and a list takes a
third of a phone screen, and the screen is the product. On small viewports each
panel collapses to its heading — chapter, title, chevron, about a tenth of the
screen — and opens on a tap. Opening one is read as "I want the detail", so
later chapters arrive open until the reader closes one again.

The markup for this is built in [`js/dock.js`](js/dock.js) rather than written
into the HTML, so the document stays a plain readable page: without JavaScript
every panel is simply open. The 3D framing reads the panel's real height each
frame, so the subject sits clear of whatever it is actually covering.

### One writer for the stage

Chapters do not set the camera or the water themselves. Each records only its own
scroll progress, and one function derives the whole stage from them. Five
chapters writing the same globals meant the result depended on the order
ScrollTrigger happened to fire — which changes with the document height, and
fails silently when it does.

## Credits

Built by the Underwater AI team. Funded by MeitY, Government of India.

- **Gautam Singh** — Chief Executive Officer
- **Shuvam Banerji Seal** — Chief Technology Officer
- **Youktik Sajjan** — Chief Operating Officer
- **Aman Kumar** — Chief Product Officer

Third-party code vendored under `vendor/` keeps its own licence.
Everything else is MIT — see [LICENSE](LICENSE).
