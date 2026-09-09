/**
 * labelpack.js — Keep detection labels from sitting on top of one another.
 *
 * Both detectors on this site (the live one over the 3D reef and the static one
 * inside Abyssal Studio) draw boxes wherever the subject happens to be, which
 * means their labels will collide sooner or later — most obviously on a narrow
 * screen. This is the shared solution: treat each label as a rectangle, place
 * them top-down, and slide any that would overlap.
 */

let widths = new WeakMap();

/**
 * Forget every cached width.
 *
 * Tag text never changes, so one measurement per label is normally enough —
 * but the styling does change at the small-screen breakpoint, where the track
 * id is dropped. A width measured on the other side of that line would make
 * the packer solve the wrong problem.
 */
export function resetLabelWidths() { widths = new WeakMap(); }

/**
 * @param {Array<{el: Element, x: number, y: number, w: number, h: number}>} boxes
 * @param {{height?: number, gap?: number, bounds?: {w: number, h: number}}} opts
 */
export function packLabels(boxes, opts = {}) {
  const H = opts.height ?? 22;
  const GAP = opts.gap ?? 6;
  const bounds = opts.bounds;

  const items = [];
  for (const b of boxes) {
    const tag = b.el.querySelector('.det__tag');
    if (!tag) continue;
    // Text never changes, so one measurement per element is enough.
    if (!widths.has(tag)) {
      const w = tag.offsetWidth;
      if (w) widths.set(tag, w);
    }
    items.push({ ...b, tag, tw: widths.get(tag) ?? 170 });
  }

  items.sort((a, b) => a.y - b.y);
  const placed = [];

  for (const it of items) {
    // Above the box by default; inside it when there is no room above.
    let y = it.y < H + GAP ? it.y + 4 : it.y - H - 4;
    const x = it.x;

    for (let guard = 0; guard < 16; guard++) {
      const hit = placed.find((p) =>
        x < p.x + p.w && x + it.tw > p.x &&
        y < p.y + p.h && y + H > p.y);
      if (!hit) break;
      y = hit.y + hit.h + GAP;
    }

    /* Where several subjects cluster, that loop can walk a label a long way
       down the frame — past its own box and onto someone else's. A label over
       the wrong animal is a worse failure than a missing one, so it is only
       kept while it still touches the box it belongs to. The brackets stay
       either way, which reads as tracked-but-not-yet-named. */
    const attached = y + H > it.y - GAP - 2 && y < it.y + it.h + GAP + 2;
    it.el.classList.toggle('det--tag-off', !attached);
    if (!attached) continue;

    // Never push a label off the bottom of its own frame.
    if (bounds && y + H > bounds.h - 2) y = Math.max(2, bounds.h - H - 2);

    /* A box can start off the left edge, or run past the right one, and its
       label would then be clipped. Slide the label back inside and record the
       offset relative to its box.

       Which way it slides matters. Clamping straight to the frame drags every
       wide label to the same edge, and a label that no longer sits over its
       own box is worse than one that is slightly cropped — it reads as
       annotating whatever it landed on. So try the box's right edge first,
       which keeps the label spanning its subject, and fall back to the frame
       only when the label is wider than the room available. */
    let lx = x;
    if (bounds) {
      const maxX = bounds.w - it.tw - 2;
      if (lx > maxX) lx = Math.min(Math.max(2, it.x + it.w - it.tw), maxX);
      lx = Math.max(2, Math.min(lx, maxX));
    }

    placed.push({ x: lx, y, w: it.tw, h: H });
    it.el.style.setProperty('--tag-y', `${y - it.y}px`);
    it.el.style.setProperty('--tag-x', `${lx - it.x}px`);
  }

  return placed.length;
}
