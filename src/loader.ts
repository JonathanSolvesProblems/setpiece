/**
 * The wait before the set appears. Most of it is the graphics card compiling,
 * which holds the page's thread for seconds at a time, so nothing here can run
 * on a timer. The stripe moves in the browser's compositor instead: each step
 * only says how far to go next, and the browser carries it there by itself
 * while the thread is busy. Steps are real milestones, never a guess at time.
 *
 * Imported first in index.ts so it is running before the engine starts.
 */

/** The panel's type, fetched a file at a time, is the part of this wait the page can count. */
const PANEL_FONTS = 5;
const PANEL_FONT = /\/ui\/fonts\/baked\/[A-Za-z-]+\.json/;
const SLOW_MS = 20_000;
const STUCK_MS = 60_000;

/** Where the stripe is heading, in percent of its track, from the first font to the last step. */
const FONTS_FROM = 20;
const FONTS_TO = 80;
const PLACING = 94;

const root = document.documentElement;
const loader = document.getElementById('loader');
const fill = document.getElementById('loader-fill');
const step = document.getElementById('loader-step');
const note = document.getElementById('loader-note');
const stage = document.querySelector('.stage');
const strip = document.querySelector('.strip');
const enter = document.getElementById('enter-xr') as HTMLButtonElement | null;

let heading = 0;
let fonts = 0;
let finished = false;

function headTo(percent: number, words?: string): void {
  if (finished) return;
  if (percent > heading) {
    heading = percent;
    if (fill) fill.style.transform = `translateX(${percent - 100}%)`;
  }
  if (words != null && step) step.textContent = words;
}

const fontWatch =
  typeof PerformanceObserver === 'undefined'
    ? null
    : new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!PANEL_FONT.test(entry.name)) continue;
          fonts = Math.min(PANEL_FONTS, fonts + 1);
          headTo(FONTS_FROM + ((FONTS_TO - FONTS_FROM) * (fonts + 1)) / (PANEL_FONTS + 1));
        }
      });
try {
  fontWatch?.observe({ type: 'resource', buffered: true });
} catch {
  // An older browser only loses the stripe's finer steps.
}

const slow = window.setTimeout(() => {
  if (note) {
    note.textContent = 'Taking longer than usual. Stay on this page.';
    note.hidden = false;
  }
}, SLOW_MS);
const stuck = window.setTimeout(() => {
  root.dataset.load = 'stuck';
}, STUCK_MS);

headTo(FONTS_FROM, 'Painting the slate');

function stopWatching(): void {
  finished = true;
  fontWatch?.disconnect();
  window.clearTimeout(slow);
  window.clearTimeout(stuck);
}

/** The world exists and the pieces are going onto the slate. */
export function placingPieces(): void {
  headTo(PLACING, 'Placing the stand-ins');
}

/** The set has drawn. The page's controls work from here. */
export function setReady(): void {
  stopWatching();
  delete root.dataset.load;
  if (loader) loader.hidden = true;
  stage?.removeAttribute('aria-busy');
  strip?.removeAttribute('inert');
  if (enter != null && enter.dataset.mode !== 'copy') {
    enter.disabled = false;
    enter.textContent = 'Enter XR';
  }
}

/** Something the set needs did not arrive. */
export function setFailed(error: unknown): void {
  stopWatching();
  console.error('The set did not load', error);
  root.dataset.load = 'failed';
}
