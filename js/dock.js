/**
 * dock.js — Turns each chapter panel into a disclosure on small screens.
 *
 * On a desktop there is room for the copy and the view at once. On a phone
 * there is not: a panel carrying a title, a paragraph, meters and a list eats
 * half the screen, and the screen is the point. So on small screens a dock
 * collapses to its heading — chapter, title, and a chevron — and opens only
 * when the reader asks for it.
 *
 * The markup is built here rather than in the HTML so the document stays a
 * plain, readable page: without JavaScript every panel is simply open.
 *
 * Structure produced (the canonical accordion shape, heading wrapping button):
 *
 *   <p  class="dock__tag">…</p>
 *   <h2 class="dock__title"><button aria-expanded aria-controls>…</button></h2>
 *   <div class="dock__detail"><div class="dock__detail-inner">…</div></div>
 */

const SMALL = matchMedia('(max-width: 46rem)');

/* One preference for the whole session. Opening one panel says "I want the
   detail"; every later chapter should then arrive open, and closing one says
   the opposite. Re-deciding per chapter would make the reader work for it. */
let prefersOpen = false;

const docks = [];
let uid = 0;

function build(dock) {
  const title = dock.querySelector('.dock__title');
  if (!title || dock.dataset.dockReady) return null;

  const id = `dock-detail-${++uid}`;

  // Everything after the title is detail.
  const detail = document.createElement('div');
  detail.className = 'dock__detail';
  detail.id = id;

  const inner = document.createElement('div');
  inner.className = 'dock__detail-inner';
  detail.append(inner);

  let node = title.nextElementSibling;
  while (node) {
    const next = node.nextElementSibling;
    inner.append(node);
    node = next;
  }
  dock.append(detail);

  // The heading becomes the trigger, keeping its level in the outline.
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'dock__toggle';
  button.setAttribute('aria-controls', id);

  /* The title's contents go inside a single span. Without it the heading's
     text nodes and its <em> each become their own grid item and the title
     splits across the row. */
  const label = document.createElement('span');
  label.className = 'dock__toggle-text';
  while (title.firstChild) label.append(title.firstChild);
  button.append(label);

  const chev = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chev.setAttribute('class', 'dock__chev');
  chev.setAttribute('viewBox', '0 0 24 24');
  chev.setAttribute('aria-hidden', 'true');
  chev.innerHTML =
    '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" ' +
    'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';
  button.append(chev);
  title.append(button);

  // Remember which chapter this panel belongs to, so the story can keep only
  // the current one on screen.
  const section = dock.closest('section[id]');
  if (section) dock.dataset.chapter = section.id;

  const entry = { dock, button, detail, open: true };
  button.addEventListener('click', () => {
    prefersOpen = !entry.open;
    for (const d of docks) apply(d, prefersOpen);
  });

  dock.dataset.dockReady = 'true';
  return entry;
}

function apply(entry, open) {
  entry.open = open;
  entry.dock.dataset.expanded = String(open);
  entry.button.setAttribute('aria-expanded', String(open));
  entry.button.setAttribute('aria-label',
    open ? 'Hide chapter detail' : 'Show chapter detail');
}

function syncToBreakpoint() {
  // Full width: always open, and the heading stops behaving like a control.
  const small = SMALL.matches;
  for (const entry of docks) {
    apply(entry, small ? prefersOpen : true);
    entry.button.tabIndex = small ? 0 : -1;
    entry.button.setAttribute('aria-disabled', String(!small));
  }
  document.documentElement.dataset.dockMode = small ? 'disclosure' : 'open';
}

/**
 * The platform cards carry a description, a three-item list and a row of tags.
 * Four of those stacked is most of a phone screen of text before the reader has
 * decided they care. The description stays — it is what the card is for — and
 * the list and tags go behind a tap.
 *
 * Independent per card, unlike the chapter panels: these four are parallel
 * things a reader may want to compare, not a sequence being stepped through.
 */
export function initCardDetails() {
  if (!SMALL.matches) return 0;
  let n = 0;

  for (const card of document.querySelectorAll('.stage-card')) {
    const list = card.querySelector('.stage-card__list');
    const tags = card.querySelector('.tags');
    if (!list && !tags) continue;

    const id = `card-detail-${++uid}`;
    const detail = document.createElement('div');
    detail.className = 'card__detail';
    detail.id = id;
    const inner = document.createElement('div');
    inner.className = 'card__detail-inner';
    detail.append(inner);
    if (list) inner.append(list);
    if (tags) inner.append(tags);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'card__more';
    button.setAttribute('aria-controls', id);
    button.setAttribute('aria-expanded', 'false');
    button.innerHTML =
      '<span>Details</span>' +
      '<svg class="card__more-chev" viewBox="0 0 24 24" aria-hidden="true">' +
      '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"/></svg>';

    card.dataset.expanded = 'false';
    card.append(button, detail);
    n++;

    button.addEventListener('click', () => {
      const open = card.dataset.expanded !== 'true';
      card.dataset.expanded = String(open);
      button.setAttribute('aria-expanded', String(open));
      button.querySelector('span').textContent = open ? 'Less' : 'Details';
    });
  }
  return n;
}

export function initDocks() {
  for (const dock of document.querySelectorAll('.dock')) {
    const entry = build(dock);
    if (entry) docks.push(entry);
  }
  if (!docks.length) return null;

  syncToBreakpoint();
  SMALL.addEventListener('change', syncToBreakpoint);

  // Escape closes, matching every other dismissible surface on the page.
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !SMALL.matches || !prefersOpen) return;
    prefersOpen = false;
    for (const d of docks) apply(d, false);
  });

  const api = {
    get open() { return SMALL.matches ? prefersOpen : true; },
    get count() { return docks.length; },
    expand() { prefersOpen = true; syncToBreakpoint(); },
    collapse() { prefersOpen = false; syncToBreakpoint(); },
    toggle() { prefersOpen = !prefersOpen; syncToBreakpoint(); },
  };
  window.UWDocks = api;
  return api;
}
