/**
 * labelpack.js — Keep detection labels from sitting on top of one another.
 *
 * Both detectors on this site (the live one over the 3D reef and the static one
 * inside Abyssal Studio) draw boxes wherever the subject happens to be, which
 * means their labels will collide sooner or later — most obviously on a narrow
 * screen. This is the shared solution: treat each label as a rectangle, place
 * them top-down, and slide any that would overlap.
 */

const widths = new WeakMap();

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

    // Never push a label off the bottom of its own frame.
    if (bounds && y + H > bounds.h - 2) y = Math.max(2, bounds.h - H - 2);

    placed.push({ x, y, w: it.tw, h: H });
    it.el.style.setProperty('--tag-y', `${y - it.y}px`);
  }

  return placed.length;
}
