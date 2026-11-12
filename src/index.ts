import { placingPieces, setFailed, setReady } from './loader.js';
import './fonts.js';
import { BUILD, watchForNewBuild } from './build-check.js';
import { DepthSensingSystem, VisibilityState, World } from '@iwsdk/core';
import { signal } from '@preact/signals-core';
import type { Signal } from '@preact/signals-core';
import projectOptions from 'virtual:iwsdk-project';
import { CoachSystem } from './coach.js';
import { ControlsSystem } from './controls.js';
import { MarksSystem } from './marks.js';
import { PiecesSystem } from './pieces.js';
import { PlacementSystem, StageStatus } from './placement.js';
import { PreviewCameraSystem } from './preview-camera.js';
import { SlateSystem } from './slate.js';
import { canRecordVideo, downloadAnimatic, downloadBoard, downloadShotList } from './exports.js';
import { LifeSizeSystem } from './life-size.js';
import { TakeState, TakeSystem } from './take.js';
import { ReactionsSystem } from './reactions.js';
import { hear } from './spoken.js';
import type { Spoken } from './scene-request.js';
import { SquirmSystem } from './squirm.js';
import { loadJson, StoreKey } from './store.js';
import { TraySystem } from './tray.js';
import { CAMERAS, Rig } from './camera-formats.js';
import { ViewfinderSystem } from './viewfinder.js';
import type { Shot } from './viewfinder.js';

const BOARD_SLOTS = 6;

// Real hands in front of the miniatures, on trial: add ?occlude, or ?occlude=soft, to the address.
// Without it nothing about the session changes, and it stays optional so no headset is turned away.
const occlusion = new URLSearchParams(location.search).get('occlude');
const options =
  occlusion == null
    ? projectOptions
    : {
        ...projectOptions,
        xr: {
          ...projectOptions.xr,
          features: { ...(projectOptions.xr ? projectOptions.xr.features : undefined), depthSensing: { required: false, usage: 'gpu-optimized', format: 'float32' } },
        },
      };

World.create(document.getElementById('scene-container') as HTMLDivElement, options as typeof projectOptions).then((world) => {
  // Shared state between the control panel and the viewfinder.
  const globals = world.globals as Record<string, unknown>;
  globals.lensMm = signal(35);
  globals.snapRequested = signal(0);
  globals.eyelineText = signal<string[]>([]);
  globals.shotList = signal<string[]>([]);
  globals.shotFrames = signal<Shot[]>([]);
  globals.stageStatus = signal<string>(StageStatus.Floating);
  globals.resetStageRequested = signal(0);
  // The headset can scan the room for a table when it has not been told about one.
  globals.roomScanRequested = signal(0);
  globals.roomScanOffered = signal(false);
  globals.newBoardRequested = signal(0);
  globals.coachLine = signal('');
  // What the call sheet is asking for right now: 'actor', 'camera', 'snap' or nothing.
  globals.coachTarget = signal('');
  // A line the call sheet shows for a few seconds, as "LABEL | words"; and a count of setups recalled from the card.
  globals.coachNote = signal('');
  // The tray, the cast and the camera kit.
  globals.trayToggle = signal('');
  globals.trayOn = signal<string[]>([]);
  globals.setReady = signal(false);
  globals.occlusion = signal(occlusion);
  globals.effectsOn = signal(0);
  globals.poseRequested = signal(0);
  globals.squirmOn = signal(loadJson<{ squirm: boolean }>(StoreKey.Settings)?.squirm !== false);
  globals.selectedPaint = signal(-1);
  globals.takeClear = signal(0);
  globals.layoutChanged = signal(0);
  globals.selectedLabel = signal('');
  globals.sizedByHand = signal<{ label: string; scale: number } | null>(null);
  globals.selectedCopies = signal(false);
  globals.copyRequested = signal(0);
  globals.trayPress = signal('');
  globals.sceneStart = signal(-1);
  globals.sceneRequest = signal<Spoken | null>(null);
  globals.cameraOn = signal<string>(CAMERAS[0]);
  globals.selectedStyles = signal(false);
  globals.paintPick = signal(-1);
  globals.sizeRequested = signal(0);
  globals.styleRequested = signal(0);
  globals.trayDress = signal({ cast: {}, finish: {} });
  globals.trayDressRestore = signal(null);
  globals.lookRequested = signal(0);
  globals.castLine = signal('');
  globals.lifeSize = signal(false);
  globals.lifeSizeRequested = signal(0);
  globals.removeSelected = signal(0);
  globals.clearSet = signal(0);
  globals.selectedIsActor = signal(false);
  globals.trayRestore = signal<string[] | null>(null);
  globals.sensorIndex = signal(0);
  globals.cameraRig = signal<string>(Rig.Tripod);
  // The shot briefs: which one is up, how many are printed.
  globals.briefIndex = signal(0);
  globals.briefPrinted = signal(0);
  globals.briefSkip = signal(0);
  globals.setupRecalled = signal(0);
  // The take: what it is doing, how far in it is, and how long it runs, in seconds.
  globals.takeState = signal<string>(TakeState.Idle);
  globals.takeSeconds = signal(0);
  globals.takeEmpty = signal(0);
  globals.lastSpoken = signal('');
  globals.takeLength = signal(0);
  globals.recordRequested = signal(0);
  globals.playRequested = signal(0);

  placingPieces();
  if (occlusion != null) {
    world.registerSystem(DepthSensingSystem, { configData: { enableDepthTexture: true, enableOcclusion: true, useFloat32: true, blurRadius: 20 } });
  }
  world
    .registerSystem(PlacementSystem, { priority: 10 })
    .registerSystem(PiecesSystem, { priority: 12 })
    .registerSystem(TakeSystem, { priority: 14 })
    .registerSystem(TraySystem, { priority: 15 })
    .registerSystem(LifeSizeSystem, { priority: 16 })
    .registerSystem(SquirmSystem, { priority: 17 })
    .registerSystem(ReactionsSystem, { priority: 18 })
    .registerSystem(MarksSystem, { priority: 19 })
    .registerSystem(ViewfinderSystem, { priority: 20 })
    .registerSystem(SlateSystem, { priority: 25 })
    .registerSystem(PreviewCameraSystem, { priority: 26 })
    .registerSystem(CoachSystem, { priority: 28 })
    .registerSystem(ControlsSystem, { priority: 30 });

  // The page's own controls: Enter XR, lenses, snap and reset, wired to the
  // same signals the headset panel uses; the slate's fields along the frame
  // and the storyboard under it, kept current from those signals.
  const enter = document.getElementById('enter-xr') as HTMLButtonElement | null;
  // A headset may not be able to ask for the microphone mid-session, so the page can ask first.
  const mic = document.getElementById('page-mic') as HTMLButtonElement | null;
  if (mic != null) {
    mic.addEventListener('click', () => {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          for (const track of stream.getTracks()) track.stop();
          mic.textContent = 'Microphone allowed';
          mic.disabled = true;
        })
        .catch(() => {
          mic.textContent = 'Microphone not allowed';
        });
    });
  }
  const hint = document.getElementById('xr-hint');
  // A browser without passthrough cannot enter the session; the honest action
  // there is to carry the link to a headset that can.
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  Promise.resolve(xr ? xr.isSessionSupported('immersive-ar').catch(() => false) : false).then((supported) => {
    if (supported && mic != null && navigator.mediaDevices != null) mic.hidden = false;
    if (supported || enter == null) return;
    enter.textContent = 'Copy the link for your Quest';
    enter.dataset.mode = 'copy';
    enter.disabled = false;
    if (hint) hint.textContent = 'This browser cannot run the headset session. Paste the link into the Meta Quest Browser, sit at a table, and the set lands on it.';
  });
  // Starting a session can stop on a question only the person in the headset can
  // answer: the first time, the headset asks whether this browser may use the
  // room's layout. Until they answer, nothing else happens, so the page says so.
  const restingHint = hint?.textContent ?? '';
  let waiting: number | undefined;
  const watchRequest = (): void => {
    if (enter == null) return;
    window.clearInterval(waiting);
    enter.setAttribute('aria-busy', 'true');
    enter.textContent = 'Waiting for the headset';
    if (hint) {
      hint.textContent =
        'If the headset asks to use spatial data, choose Allow: that is how the set finds your table. ' +
        'If you would rather not, the set floats in front of you and you place it by touch.';
    }
    waiting = window.setInterval(() => {
      if (world.sessionRequestPending) return;
      window.clearInterval(waiting);
      enter.removeAttribute('aria-busy');
      enter.textContent = 'Enter XR';
      if (world.session != null) {
        if (hint) hint.textContent = restingHint;
        return;
      }
      if (hint) hint.textContent = 'The session did not start. Put the headset on, then press Enter XR again.';
    }, 400);
  };
  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive && hint && !world.sessionRequestPending && enter?.dataset.mode !== 'copy') {
      hint.textContent = restingHint;
    }
  });
  enter?.addEventListener('click', async () => {
    if (enter.dataset.mode !== 'copy') {
      if (world.sessionRequestPending || world.session != null) return;
      world.launchXR();
      watchRequest();
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
  const newBoardRequested = globals.newBoardRequested as Signal<number>;
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
  // On the page the stage never moves, so starting over means the board and the blocking.
  document.getElementById('page-reset')?.addEventListener('click', () => {
    newBoardRequested.value += 1;
  });
  // A take on the page: drag a figure or the camera with the mouse while it records.
  const takeState = globals.takeState as Signal<string>;
  const takeLength = globals.takeLength as Signal<number>;
  const recordRequested = globals.recordRequested as Signal<number>;
  const playRequested = globals.playRequested as Signal<number>;
  const pageRecord = document.getElementById('page-record') as HTMLButtonElement | null;
  const pagePlay = document.getElementById('page-play') as HTMLButtonElement | null;
  const takeNote = document.getElementById('take-note');
  pageRecord?.addEventListener('click', () => {
    if (takeNote) takeNote.hidden = true;
    recordRequested.value += 1;
  });
  (globals.takeEmpty as Signal<number>).subscribe((times) => {
    if (takeNote && times > 0) takeNote.hidden = false;
  });
  pagePlay?.addEventListener('click', () => {
    playRequested.value += 1;
  });
  const labelTake = (): void => {
    const state = takeState.peek();
    const has = takeLength.peek() > 0;
    if (pageRecord) {
      pageRecord.textContent =
        state === TakeState.Recording ? 'Stop recording' : has ? 'Record over it' : 'Record a take';
      pageRecord.setAttribute('aria-pressed', String(state === TakeState.Recording));
    }
    if (pagePlay) {
      pagePlay.hidden = !has || state === TakeState.Recording;
      pagePlay.textContent = state === TakeState.Playing ? 'Stop the take' : `Play take (${Math.round(takeLength.peek())} s)`;
    }
  };
  takeState.subscribe(labelTake);
  takeLength.subscribe(labelTake);
  // What leaves with the director. The board and the take carry over from the headset.
  const viewfinder = world.getSystem(ViewfinderSystem);
  const saveBoard = document.getElementById('page-save-board') as HTMLButtonElement | null;
  const saveList = document.getElementById('page-save-list') as HTMLButtonElement | null;
  const saveTake = document.getElementById('page-save-take') as HTMLButtonElement | null;
  saveBoard?.addEventListener('click', () => {
    if (viewfinder) downloadBoard(viewfinder);
  });
  saveList?.addEventListener('click', () => downloadShotList((globals.shotFrames as Signal<Shot[]>).peek()));
  saveTake?.addEventListener('click', () => {
    if (viewfinder == null || takeState.peek() === TakeState.Recording) return;
    saveTake.disabled = true;
    saveTake.textContent = `Filming the take, 0 of ${Math.round(takeLength.peek())} s`;
    void downloadAnimatic(
      viewfinder,
      takeLength.peek(),
      () => {
        if (takeState.peek() === TakeState.Idle) playRequested.value += 1;
      },
      () => {
        if (takeState.peek() === TakeState.Playing) playRequested.value += 1;
      },
    ).finally(() => {
      saveTake.disabled = false;
      saveTake.textContent = 'Save animatic';
    });
  });
  takeLength.subscribe((seconds) => {
    if (saveTake) saveTake.hidden = seconds <= 0 || !canRecordVideo();
  });
  (globals.takeSeconds as Signal<number>).subscribe((seconds) => {
    if (saveTake?.disabled) saveTake.textContent = `Filming the take, ${Math.floor(seconds)} of ${Math.round(takeLength.peek())} s`;
  });
  (globals.shotFrames as Signal<Shot[]>).subscribe((shots) => {
    if (saveBoard) saveBoard.hidden = shots.length === 0;
    if (saveList) saveList.hidden = shots.length === 0;
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
          `${shot.lensMm} mm, camera ${shot.cameraHeightM.toFixed(1)} m high` +
          (shot.distanceToCreatureM >= 0 ? `, ${shot.distanceToCreatureM.toFixed(1)} m from the creature` : ', no eyeline ball');
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
    const parts: string[] = [];
    for (const line of lines) {
      const match = /^([^:]+): look (up|down) (\d+) deg/.exec(line);
      if (match) parts.push(`${match[1]} ${match[2]} ${match[3]}°`);
    }
    if (fieldEyeline) fieldEyeline.textContent = parts.length > 0 ? parts.join(' · ') : 'place an actor';
  });

  // The loading card comes off once the set has drawn, not when the code has finished.
  const setIsReady = globals.setReady as Signal<boolean>;
  setIsReady.subscribe((ready) => {
    if (ready) requestAnimationFrame(setReady);
  });

  // Outside a session, a newer build replaces this one. Inside, it waits until the session ends.
  let stale = false;
  const free = (): boolean => stale && world.session == null && !world.sessionRequestPending && takeState.peek() === TakeState.Idle;
  const reloadWhenFree = (): void => {
    if (!free()) return;
    // A piece still in a hand when a session ends is saved on release, about half a second later.
    window.setTimeout(() => {
      if (free()) location.reload();
    }, 1500);
  };
  takeState.subscribe(() => reloadWhenFree());
  watchForNewBuild(() => {
    stale = true;
    reloadWhenFree();
  });
  world.visibilityState.subscribe((state) => {
    if (state === VisibilityState.NonImmersive) reloadWhenFree();
  });

  // Debug and test hook: lets scripts drive the app from the page.
  (globalThis as Record<string, unknown>).setpiece = {
    build: BUILD,
    world,
    viewfinder: world.getSystem(ViewfinderSystem),
    // The same thing the voice button does, from typed words.
    say: (text: string) => hear(world, String(text)),
  };
}).catch(setFailed);
