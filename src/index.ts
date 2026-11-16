import { placingPieces, setFailed, setReady } from './loader.js';
import './fonts.js';
import { BUILD, watchForNewBuild } from './build-check.js';
import { DepthSensingSystem, VisibilityState, World } from '@iwsdk/core';
import { signal } from '@preact/signals-core';
import type { Signal } from '@preact/signals-core';
import projectOptions from 'virtual:iwsdk-project';
import { CoachSystem } from './coach.js';
import { ControlsSystem } from './controls.js';
import { DirectorSystem } from './director.js';
import { MadeSystem } from './made.js';
import { MarksSystem } from './marks.js';
import { PiecesSystem } from './pieces.js';
import { PlacementSystem, StageStatus } from './placement.js';
import { PreviewCameraSystem } from './preview-camera.js';
import { SetLightSystem } from './set-light.js';
import { prefetchListener } from './voice.js';
import { micAnswer } from './mic.js';
import { startOver } from './start-over.js';
import { keepOwnKey, ownKey } from './own-key.js';
import { WalkthroughPointerSystem } from './pointer.js';
import { SightlineSystem } from './sightline.js';
import { EffectSoundSystem } from './effect-sound.js';
import { CoverageSystem } from './coverage.js';
import { SetFinderSystem } from './set-finder.js';
import { SlateSystem } from './slate.js';
import { canRecordVideo, downloadAnimatic, downloadBoard, downloadShotList } from './exports.js';
import { LifeSizeSystem } from './life-size.js';
import { TakeState, TakeSystem } from './take.js';
import { ReactionsSystem } from './reactions.js';
import { hear } from './spoken.js';
import type { Spoken } from './scene-request.js';
import { SquirmSystem } from './squirm.js';
import { clearKey, loadJson, StoreKey } from './store.js';
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
  // The set designer is working on a set: the voice button says so.
  globals.designing = signal(false);
  // Start over, pressed on the page: the next person is shown every step again.
  globals.startOver = signal(0);
  // Sets asked for in words, built by the set designer or the library's reader; and whether Talk is on the panel.
  globals.setsBuilt = signal(0);
  // Cover it is shooting the designer's coverage (src/coverage.ts).
  globals.coverageRunning = signal(false);
  // The name of the coverage shot being snapped, so its frame carries it onto the board.
  globals.shotTitle = signal('');
  globals.coverageRequested = signal(0);
  globals.coverageStopRequested = signal(0);
  globals.talkOffered = signal(false);
  // In a session with no microphone allowed: Talk is Next shot, and the call sheet says so.
  globals.micOff = signal(false);
  // The walkthrough is on (a newcomer in a session, until it is skipped or done), and the panel's Skip was pressed.
  globals.walkthrough = signal(false);
  globals.walkthroughSkip = signal(0);
  // The designer is building a set by itself (the first one, as a newcomer lands the set): not the wearer's own.
  globals.ownBuild = signal(false);
  // Whether that first set is built at all: not on this machine's own address, where every test lands the set.
  globals.firstSetOn = signal(location.hostname !== 'localhost');
  // The last note the sheet took, and how many it has taken: the panel repeats each one where the hand is.
  globals.noteSaid = signal('');
  globals.notesPosted = signal(0);
  // What the panel's own line says right now, as "LABEL | words", so a test can read it without reading pixels.
  globals.panelSays = signal('');
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
  // The light the set is in, kept from the last visit (src/set-light.ts).
  globals.setLight = signal<string>(loadJson<string>(StoreKey.Light) ?? 'studio');
  globals.lifeSizeRequested = signal(0);
  // Back to camera, on the panel at full size: the wearer stands at the lens again (src/life-size.ts).
  globals.backToCamera = signal(0);
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
    .registerSystem(MadeSystem, { priority: 21 })
    .registerSystem(DirectorSystem, { priority: 22 })
    .registerSystem(EffectSoundSystem, { priority: 23 })
    .registerSystem(SetLightSystem, { priority: 24 })
    .registerSystem(SlateSystem, { priority: 25 })
    .registerSystem(PreviewCameraSystem, { priority: 26 })
    .registerSystem(CoverageSystem, { priority: 27 })
    .registerSystem(CoachSystem, { priority: 28 })
    .registerSystem(SetFinderSystem, { priority: 29 })
    .registerSystem(WalkthroughPointerSystem, { priority: 29 })
    .registerSystem(SightlineSystem, { priority: 29 })
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
  let restingHint = hint?.textContent ?? '';
  // A browser without passthrough cannot enter the session; the honest action
  // there is to carry the link to a headset that can.
  const xr = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
  Promise.resolve(xr ? xr.isSessionSupported('immersive-ar').catch(() => false) : false).then((supported) => {
    if (supported && mic != null && navigator.mediaDevices != null) mic.hidden = false;
    // A headset that can enter is told what to do there, not which browser to open.
    if (supported && hint != null && hint.textContent === restingHint) {
      restingHint = 'Press Enter XR, then point at a table or the floor and pinch: the set lands there.';
      hint.textContent = restingHint;
    }
    if (supported || enter == null) return;
    enter.textContent = 'Copy the link for your Quest';
    enter.dataset.mode = 'copy';
    enter.disabled = false;
    if (hint) hint.textContent = 'This browser cannot run the headset session. Paste the link into the Meta Quest Browser, sit at a table, and the set lands on it.';
  });
  // Starting a session can stop on a question only the person in the headset can
  // answer: the first time, the headset asks whether this browser may use the
  // room's layout. Until they answer, nothing else happens, so the page says so.
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
  // A second press while the microphone's question is still up is the same wish, not another session.
  let answering = false;
  enter?.addEventListener('click', async () => {
    if (enter.dataset.mode !== 'copy') {
      if (answering || world.sessionRequestPending || world.session != null) return;
      // The headset cannot show the microphone's question once the session has started, so a visitor who has not
      // answered it is asked here, on the page, first. Answering can take longer than the press may start a
      // session for; then the page asks for one more press.
      if (mic != null && !mic.hidden && !mic.disabled && (await micAnswer()) === 'prompt') {
        enter.textContent = 'Answer the microphone';
        if (hint) hint.textContent = 'Setpiece only listens while you pinch Talk, to hear the shot. Allow the microphone and the set comes up.';
        answering = true;
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) track.stop();
          mic.textContent = 'Microphone allowed';
          mic.disabled = true;
        } catch {
          mic.textContent = 'Microphone not allowed';
        } finally {
          answering = false;
        }
        // The answer can take longer than the press may start a session for: the button itself asks for one more.
        if ((navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation?.isActive === false) {
          enter.textContent = 'Press again to enter';
          if (hint) hint.textContent = 'The microphone is answered. Press the button once more and the set comes up.';
          return;
        }
        enter.textContent = 'Enter XR';
        if (hint) hint.textContent = restingHint;
      }
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
  // The shot in words, typed on the page: the same road as a sentence said to Talk in the headset.
  const ask = document.getElementById('page-ask') as HTMLFormElement | null;
  const askText = document.getElementById('page-ask-text') as HTMLInputElement | null;
  const askGo = document.getElementById('page-ask-go') as HTMLButtonElement | null;
  const askNote = document.getElementById('page-ask-note');
  ask?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = askText?.value.trim() ?? '';
    if (text === '') return;
    world.getSystem(ControlsSystem)?.heard(text);
  });
  (globals.panelSays as Signal<string>).subscribe((said) => {
    if (askNote == null || said === '') return;
    const [title = '', words = ''] = said.split(' | ');
    // Where the set stands on a table, and the headset's opening steps, mean nothing on a laptop.
    if (title === 'STAGE' || /^\d OF \d/.test(title)) return;
    askNote.textContent = title === '' ? words : `${title.charAt(0)}${title.slice(1).toLowerCase()}. ${words}`;
  });
  // A visitor's own key, for building past the site's limits: kept in this browser, sent with their requests.
  const keyForm = document.getElementById('own-key-form') as HTMLFormElement | null;
  const keyBox = document.getElementById('own-key') as HTMLInputElement | null;
  const keyNote = document.getElementById('own-key-note');
  const keyResting = keyNote?.textContent ?? '';
  if (keyBox != null && ownKey() !== '') keyBox.placeholder = 'Your key is in use. Empty and Keep to forget it.';
  keyForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (keyBox == null || keyNote == null) return;
    const kept = keepOwnKey(keyBox.value);
    keyNote.textContent = !kept ? 'That is not the shape of an Anthropic key (sk-ant-...). Nothing was kept.' : keyBox.value.trim() === '' ? `Forgotten. ${keyResting}` : 'Kept in this browser. Your requests to the set designer now use your key.';
    if (kept) {
      keyBox.placeholder = keyBox.value.trim() === '' ? 'sk-ant-...' : 'Your key is in use. Empty and Keep to forget it.';
      keyBox.value = '';
    }
  });
  // Shots to try, for a visitor who has not thought of one yet: the shot goes in the box and is built.
  const tries = [...document.querySelectorAll<HTMLButtonElement>('.shot-try')];
  for (const button of tries) {
    button.addEventListener('click', () => {
      if (askText == null || ask == null || (globals.designing as Signal<boolean>).peek()) return;
      askText.value = button.textContent?.trim() ?? '';
      ask.requestSubmit();
    });
  }
  (globals.designing as Signal<boolean>).subscribe((busy) => {
    if (askGo != null) {
      askGo.disabled = busy;
      askGo.textContent = busy ? 'Designing' : 'Build it';
    }
    for (const button of tries) button.disabled = busy;
  });

  document.getElementById('page-snap')?.addEventListener('click', () => {
    snapRequested.value += 1;
  });
  // On the page the stage never moves, so starting over means the board and the blocking.
  // Start over, in the strip under the set and again beside Enter XR, where a headset's window shows it without
  // scrolling: only for a browser that has been here before.
  const fresh = document.getElementById('page-fresh') as HTMLButtonElement | null;
  const beenHere = (): boolean => [StoreKey.Coach, StoreKey.Tray, StoreKey.Board, StoreKey.Stage].some((key) => loadJson<unknown>(key) != null);
  if (fresh != null) fresh.hidden = !beenHere();
  for (const button of [document.getElementById('page-reset'), fresh]) {
    button?.addEventListener('click', () => {
      startOver(globals, false);
      if (hint) hint.textContent = 'Started over: the next Enter XR is a first visit, walkthrough and all.';
      if (button === fresh && fresh != null) fresh.textContent = 'Started over. Now press Enter XR';
    });
  }
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
  // The same two, under the board itself: that is where the eye is when the headset comes off.
  const keep = document.getElementById('board-keep');
  const keepNote = document.getElementById('board-keep-note');
  document.getElementById('board-keep-save')?.addEventListener('click', () => {
    if (viewfinder) downloadBoard(viewfinder);
  });
  document.getElementById('board-keep-list')?.addEventListener('click', () => downloadShotList((globals.shotFrames as Signal<Shot[]>).peek()));
  (globals.shotFrames as Signal<Shot[]>).subscribe((shots) => {
    if (saveBoard) saveBoard.hidden = shots.length === 0;
    if (saveList) saveList.hidden = shots.length === 0;
    if (keep) keep.hidden = shots.length === 0;
    if (shots.length === 0 && keepNote) keepNote.textContent = '';
  });
  // Leaving a session with frames on the board: the page brings the board up and says what to do with it.
  let wasInSession = false;
  world.visibilityState.subscribe((state) => {
    const inSession = state !== VisibilityState.NonImmersive;
    const left = wasInSession && !inSession;
    wasInSession = inSession;
    const frames = (globals.shotFrames as Signal<Shot[]>).peek().length;
    if (!left || frames === 0) return;
    if (keepNote) keepNote.textContent = `Your storyboard: ${frames} frame${frames === 1 ? '' : 's'}. Save it as a picture, or save the shot list for the crew.`;
    document.getElementById('board')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
          (shot.distanceToCreatureM >= 0 ? `, ${shot.distanceToCreatureM.toFixed(1)} m from the creature` : shot.title ? `, ${shot.title}` : ', no eyeline ball');
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
    if (!ready) return;
    requestAnimationFrame(setReady);
    // The listener's model, fetched quietly while the visitor looks around, so their first Talk is quick.
    // Only where a session can start: a laptop that came to read the page is not sent 41 MB it may never use.
    window.setTimeout(() => {
      const api = (navigator as Navigator & { xr?: { isSessionSupported(mode: string): Promise<boolean> } }).xr;
      void Promise.resolve(api ? api.isSessionSupported('immersive-ar').catch(() => false) : false).then((can) => {
        if (can) prefetchListener();
      });
    }, 5000);
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
    // Typed words for the library's own reader, as the tests use it: it never asks the set designer.
    say: (text: string) => hear(world, String(text), true),
    // The same again as the listener does it: the panel says what was heard and what came of it.
    heard: (text: string, library?: boolean) => world.getSystem(ControlsSystem)?.heard(String(text), library === true),
  };
}).catch(setFailed);
