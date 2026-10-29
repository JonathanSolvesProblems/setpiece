import { World } from '@iwsdk/core';
import { signal } from '@preact/signals-core';
import type { Signal } from '@preact/signals-core';
import projectOptions from 'virtual:iwsdk-project';
import { ControlsSystem } from './controls.js';
import { PlacementSystem, StageStatus } from './placement.js';
import { PreviewCameraSystem } from './preview-camera.js';
import { SlateSystem } from './slate.js';
import { ViewfinderSystem } from './viewfinder.js';
import type { Shot } from './viewfinder.js';

const BOARD_SLOTS = 6;

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  // Shared state between the control panel and the viewfinder.
  const globals = world.globals as Record<string, unknown>;
  globals.lensMm = signal(35);
  globals.snapRequested = signal(0);
  globals.eyelineText = signal<string[]>([]);
  globals.shotList = signal<string[]>([]);
  globals.shotFrames = signal<Shot[]>([]);
  globals.stageStatus = signal<string>(StageStatus.Floating);
  globals.resetStageRequested = signal(0);

  world
    .registerSystem(PlacementSystem, { priority: 10 })
    .registerSystem(ViewfinderSystem, { priority: 20 })
    .registerSystem(SlateSystem, { priority: 25 })
    .registerSystem(PreviewCameraSystem, { priority: 26 })
    .registerSystem(ControlsSystem, { priority: 30 });

  // The page's own controls: Enter XR, lenses, snap and reset, wired to the
  // same signals the headset panel uses; the slate's fields along the frame
  // and the storyboard under it, kept current from those signals.
  const enter = document.getElementById('enter-xr') as HTMLButtonElement | null;
  const hint = document.getElementById('xr-hint');
  // A browser without passthrough cannot enter the session; the honest action
  // there is to carry the link to a headset that can.
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  Promise.resolve(xr ? xr.isSessionSupported('immersive-ar').catch(() => false) : false).then((supported) => {
    if (supported || enter == null) return;
    enter.textContent = 'Copy the link for your Quest';
    enter.dataset.mode = 'copy';
    if (hint) hint.textContent = 'This browser cannot run the headset session. Paste the link into the Meta Quest Browser, sit at a table, and the set lands on it.';
  });
  enter?.addEventListener('click', async () => {
    if (enter.dataset.mode !== 'copy') {
      world.launchXR();
      return;
    }
    try {
      await navigator.clipboard.writeText(location.href);
      if (hint) hint.textContent = 'Copied. Open it in the Meta Quest Browser, sitting at a table.';
    } catch {
      if (hint) hint.textContent = `Copy this address into the Meta Quest Browser: ${location.href}`;
    }
  });
  const lensMm = globals.lensMm as Signal<number>;
  const snapRequested = globals.snapRequested as Signal<number>;
  const resetStageRequested = globals.resetStageRequested as Signal<number>;
  const shotFrames = globals.shotFrames as Signal<Shot[]>;
  const eyelineText = globals.eyelineText as Signal<string[]>;
  const lensButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.lenses .lens'));
  for (const button of lensButtons) {
    button.addEventListener('click', () => {
      lensMm.value = Number(button.dataset.lens);
    });
  }
  document.getElementById('page-snap')?.addEventListener('click', () => {
    snapRequested.value += 1;
  });
  document.getElementById('page-reset')?.addEventListener('click', () => {
    resetStageRequested.value += 1;
  });
  const fieldShot = document.getElementById('f-shot');
  const fieldEyeline = document.getElementById('f-eyeline');
  const cells = Array.from(document.querySelectorAll<HTMLLIElement>('#board li'));
  const shotListElement = document.getElementById('shotlist');
  lensMm.subscribe((mm) => {
    for (const button of lensButtons) button.setAttribute('aria-pressed', String(Number(button.dataset.lens) === mm));
  });
  shotFrames.subscribe((shots) => {
    if (fieldShot) fieldShot.textContent = `${Math.min(shots.length, BOARD_SLOTS)} of ${BOARD_SLOTS}`;
    if (shotListElement) {
      const rows = shots.map((shot) => {
        const row = document.createElement('li');
        const index = document.createElement('span');
        index.className = 'i';
        index.textContent = String(shot.index);
        const text = document.createElement('span');
        text.textContent =
          `${shot.lensMm} mm, camera ${shot.cameraHeightM.toFixed(1)} m high, ` +
          `${shot.distanceToCreatureM.toFixed(1)} m from the creature`;
        row.append(index, text);
        return row;
      });
      if (rows.length === 0) {
        const empty = document.createElement('li');
        empty.className = 'empty';
        empty.textContent = 'No frames yet. Pick a lens and snap one.';
        rows.push(empty);
      }
      shotListElement.replaceChildren(...rows);
    }
    for (let i = 0; i < cells.length; i++) {
      const cell = cells[i];
      const shot = shots[i];
      const number = document.createElement('span');
      number.className = 'n';
      number.textContent = String(shot ? shot.index : i + 1);
      if (shot == null) {
        cell.classList.remove('filled');
        cell.replaceChildren(number);
        continue;
      }
      const image = document.createElement('img');
      image.src = shot.dataUrl;
      image.alt = `Frame ${shot.index}, ${shot.lensMm} mm`;
      const caption = document.createElement('span');
      caption.className = 'cap';
      caption.textContent = `${shot.lensMm} mm · ${shot.cameraHeightM.toFixed(1)} m high`;
      cell.classList.add('filled');
      cell.replaceChildren(number, image, caption);
    }
  });
  eyelineText.subscribe((lines) => {
    const match = lines[0] ? /^([^:]+): look (up|down) (\d+) deg/.exec(lines[0]) : null;
    if (fieldEyeline) fieldEyeline.textContent = match ? `${match[1]} looks ${match[2]} ${match[3]}°` : 'place an actor';
  });

  // Debug and test hook: lets scripts drive the app from the page.
  (globalThis as Record<string, unknown>).setpiece = { world };
});
