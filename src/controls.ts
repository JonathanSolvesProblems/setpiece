import {
  createSystem,
  Entity,
  Object3D,
  Quaternion,
  setWorldPosition,
  setWorldQuaternion,
  UIKit,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { BRIEFS } from './briefs.js';
import { assetByLabel, ASSETS, assetTitle, PAINTS, searchAssets, SHELF_SLOTS, SHELVES } from './catalog.js';
import type { Shelf } from './catalog.js';
import { CAMERAS, LENSES, Rig, SENSORS } from './camera-formats.js';
import { StageStatus } from './placement.js';
import { understand, wordsToHear } from './scene-request.js';
import type { Spoken } from './scene-request.js';
import { SetPiece, StageAnchor } from './set-components.js';
import { SCENES } from './scenes.js';
import { loadJson, saveJson, StoreKey } from './store.js';
import { Voice } from './voice.js';
import type { VoiceState } from './voice.js';

/**
 * Where the panel sits relative to the stage, as the scene authors it: left of
 * the slate, a little above it, turned in toward the viewer.
 */
const PANEL_OFFSET = new Vector3(-0.38, 0.33, -0.16);
/**
 * The panel hangs from its top edge, this far above the slate, so Snap frame
 * and the tabs stay put when a page changes the panel's height. Metres per
 * panel unit is measured from the panel as it is scaled in the scene.
 */
const PANEL_TOP = 0.71;
const LIFE_CONFIRM_MS = 3000;
/** Search keeps the keys on the panel, so it shows fewer results at once. */
const SEARCH_SLOTS = 4;
const SEARCH_LONGEST = 12;
const PANEL_UNIT = 0.00101;
/** At full size the table is left behind, so the panel stays with the wearer: this far ahead, this far off centre, this far below the eyes. */
const WALK_AHEAD = 0.6;
const WALK_LEFT = 0.32;
const WALK_BELOW = 0.2;
const WALK_FOLLOW = 3;
const PANEL_YAW = (34 * Math.PI) / 180;
const UP = new Vector3(0, 1, 0);

const BOARD_SLOTS = 6;
// Yellow is what is selected or good to go; nothing is yellow for decoration.
const OPTIC_YELLOW = '#d6e13c';
/** The flag's black cloth, and the edge of a block that can be pressed. */
const CLOTH = '#1b1411';
const CHALK_HAZE = '#5a4b3d';
const PLACED_STATUSES = new Set<string>([
  StageStatus.Table,
  StageStatus.Touch,
  StageStatus.Restored,
  StageStatus.Manual,
]);

type Globals = {
  lensMm: Signal<number>;
  snapRequested: Signal<number>;
  eyelineText: Signal<string[]>;
  shotList: Signal<string[]>;
  stageStatus: Signal<string>;
  resetStageRequested: Signal<number>;
  newBoardRequested: Signal<number>;
  coachTarget: Signal<string>;
  takeState: Signal<string>;
  takeLength: Signal<number>;
  roomScanRequested: Signal<number>;
  roomScanOffered: Signal<boolean>;
  lifeSize: Signal<boolean>;
  lifeSizeRequested: Signal<number>;
  recordRequested: Signal<number>;
  playRequested: Signal<number>;
  trayToggle: Signal<string>;
  trayOn: Signal<string[]>;
  removeSelected: Signal<number>;
  clearSet: Signal<number>;
  selectedIsActor: Signal<boolean>;
  selectedPaint: Signal<number>;
  selectedLabel: Signal<string>;
  selectedCopies: Signal<boolean>;
  copyRequested: Signal<number>;
  trayPress: Signal<string>;
  selectedStyles: Signal<boolean>;
  poseRequested: Signal<number>;
  lookRequested: Signal<number>;
  paintPick: Signal<number>;
  sizeRequested: Signal<number>;
  styleRequested: Signal<number>;
  squirmOn: Signal<boolean>;
  cameraOn: Signal<string>;
  sceneRequest: Signal<Spoken | null>;
  sceneStart: Signal<number>;
  castLine: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  briefIndex: Signal<number>;
  briefPrinted: Signal<number>;
  briefSkip: Signal<number>;
};
const TABS = ['shoot', 'camera', 'assets', 'briefs', 'stage'] as const;
/** The tally's red: the record button wears it while a take is being recorded. */
const TALLY_RED = '#e0352b';
const CHALK = '#f6f7ef';
/** Rays prefer the higher order, whatever is nearer. Nothing else on the set is above the board's 5. */
const PANEL_ORDER = 10;
/** While the call sheet asks for a frame, Snap frame flashes this many times a second. */
const SNAP_FLASH_RATE = 1.6;

/** Wires the Setpiece control panel to the shared signals the viewfinder reads. */
export class ControlsSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
}) {
  private stage: Entity | null = null;
  private panelObject: Object3D | null = null;
  private panelPosition = new Vector3();
  private head = new Vector3();
  private forward = new Vector3();
  private panelQuaternion = new Quaternion();
  private panelTurn = new Quaternion().setFromAxisAngle(UP, PANEL_YAW);
  private snapButton: { setProperties(properties: Record<string, unknown>): void } | null = null;
  private snapLit = false;

  /**
   * In the headset the panel travels with the set, so it is beside the slate
   * wherever the table turns out to be, and inside the same narrow field of view.
   * The page hides the panel and has its own controls.
   */
  update(delta: number, time: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    if ((this.globals as Globals).lifeSize.peek()) {
      this.walkWithWearer(delta);
      return;
    }
    const lit =
      (this.globals as Globals).coachTarget.peek() === 'snap' && Math.floor(time * SNAP_FLASH_RATE * 2) % 2 === 0;
    if (lit !== this.snapLit) {
      this.snapLit = lit;
      this.snapButton?.setProperties({ backgroundColor: lit ? OPTIC_YELLOW : CHALK });
    }
    const stageObject = this.stage?.object3D;
    if (stageObject == null) return;
    if (this.panelObject == null) this.panelObject = this.scene.getObjectByName('Controls Panel') ?? null;
    const panel = this.panelObject;
    if (panel == null) return;
    stageObject.updateWorldMatrix(true, false);
    this.panelPosition.copy(PANEL_OFFSET);
    const height = this.panelHeight();
    if (height > 0) this.panelPosition.y = PANEL_TOP - (height * PANEL_UNIT) / 2;
    this.panelPosition.applyMatrix4(stageObject.matrixWorld);
    stageObject.getWorldQuaternion(this.panelQuaternion).multiply(this.panelTurn);
    setWorldPosition(panel, this.panelPosition);
    setWorldQuaternion(panel, this.panelQuaternion);
    // The set is out of sight for the first moment of a session; so is its panel.
    panel.visible = stageObject.visible;
  }

  private panelRoot: { size?: { value?: number[] | undefined } } | null = null;

  /** The panel's laid-out height, in panel units; zero until it has one. */
  private panelHeight(): number {
    return this.panelRoot?.size?.value?.[1] ?? 0;
  }

  /** On a full-size set the panel keeps beside the wearer, lazily, so it can be read and pinched anywhere. */
  private walkWithWearer(delta: number): void {
    const panel = this.panelObject;
    if (panel == null) return;
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    this.forward.normalize();
    const yaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.panelPosition.set(
      this.head.x + this.forward.x * WALK_AHEAD + this.forward.z * WALK_LEFT,
      this.head.y - WALK_BELOW,
      this.head.z + this.forward.z * WALK_AHEAD - this.forward.x * WALK_LEFT,
    );
    panel.getWorldPosition(this.head).lerp(this.panelPosition, 1 - Math.exp(-WALK_FOLLOW * delta));
    setWorldPosition(panel, this.head);
    setWorldQuaternion(panel, this.panelQuaternion.setFromAxisAngle(UP, yaw + 0.35));
    panel.visible = true;
  }

  init(): void {
    for (const stage of this.queries.stages.entities) this.stage = stage;
    this.cleanupFuncs.push(
      this.queries.stages.subscribe('qualify', (stage) => {
        this.stage = stage;
      }),
    );
    const panel = this.world.getSceneObject<UIKitMLAsset>('controls-panel');
    if (panel == null) return;
    const g = this.globals as Globals;
    // The whole panel belongs to the headset; the page has its own controls.
    const root = panel.getElementById('panel-root');
    // Pieces carry generous unseen grab zones. A ray that reaches the panel must
    // press the panel, even when one of those zones is nearer the hand. UIKit
    // sets this on every element itself, so it goes in as an inherited property.
    root?.setProperties({ pointerEventsOrder: PANEL_ORDER });
    this.panelRoot = (root as unknown as { size?: { value?: number[] } }) ?? null;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        root?.setProperties({ display: state === VisibilityState.NonImmersive ? 'none' : 'flex' });
      }),
    );

    for (const mm of LENSES) {
      const button = panel.getElementById(`lens-${mm}`);
      if (button == null) continue;
      const pick = () => {
        g.lensMm.value = mm;
      };
      button.addEventListener('click', pick);
      this.cleanupFuncs.push(() => button.removeEventListener('click', pick));
    }
    this.cleanupFuncs.push(
      g.lensMm.subscribe((mm) => {
        for (const l of LENSES) {
          panel.getElementById(`lens-${l}`)?.setProperties({
            backgroundColor: l === mm ? OPTIC_YELLOW : undefined,
            color: l === mm ? CLOTH : CHALK,
          });
        }
      }),
    );

    const stageStatus = panel.getElementById<UIKit.Text>('stage-status');
    this.cleanupFuncs.push(
      g.stageStatus.subscribe((text) => {
        stageStatus?.setProperties({
          text,
          borderColor: PLACED_STATUSES.has(text) ? OPTIC_YELLOW : CHALK_HAZE,
        });
      }),
    );
    const resetStage = panel.getElementById('btn-reset-stage');
    const requestReset = () => {
      g.resetStageRequested.value = g.resetStageRequested.value + 1;
    };
    resetStage?.addEventListener('click', requestReset);
    this.cleanupFuncs.push(() => resetStage?.removeEventListener('click', requestReset));

    // Offered only while the set floats and the headset can scan the room for a table.
    const findTable = panel.getElementById('btn-find-table');
    const requestScan = () => {
      g.roomScanRequested.value = g.roomScanRequested.value + 1;
    };
    findTable?.addEventListener('click', requestScan);
    this.cleanupFuncs.push(
      () => findTable?.removeEventListener('click', requestScan),
      g.roomScanOffered.subscribe((offered) => {
        findTable?.setProperties({ display: offered ? 'flex' : 'none' });
      }),
    );

    const newBoard = panel.getElementById('btn-new-board');
    const requestNewBoard = () => {
      g.newBoardRequested.value = g.newBoardRequested.value + 1;
    };
    newBoard?.addEventListener('click', requestNewBoard);
    this.cleanupFuncs.push(() => newBoard?.removeEventListener('click', requestNewBoard));

    // Tabs keep a panel this size on the table: one page shows, Snap frame is always there.
    const wire = (id: string, run: () => void): void => {
      const element = panel.getElementById(id);
      element?.addEventListener('click', run);
      this.cleanupFuncs.push(() => element?.removeEventListener('click', run));
    };
    const showTab = (tab: string): void => {
      for (const name of TABS) {
        panel.getElementById(`page-${name}`)?.setProperties({ display: name === tab ? 'flex' : 'none' });
        panel.getElementById(`tab-${name}`)?.setProperties({
          backgroundColor: name === tab ? OPTIC_YELLOW : undefined,
          color: name === tab ? CLOTH : CHALK,
        });
      }
    };
    for (const name of TABS) wire(`tab-${name}`, () => showTab(name));
    showTab('shoot');

    // The full-size set, and the way back to the table.
    // Growing the whole set is not something to do by a stray pinch: it takes a second press.
    const life = panel.getElementById<UIKit.Text>('btn-life');
    let lifeArmed: ReturnType<typeof setTimeout> | null = null;
    const disarmLife = (): void => {
      if (lifeArmed != null) clearTimeout(lifeArmed);
      lifeArmed = null;
    };
    this.cleanupFuncs.push(disarmLife);
    wire('btn-life', () => {
      if (!g.lifeSize.peek() && lifeArmed == null) {
        life?.setProperties({ text: 'Press again to go full size', borderColor: OPTIC_YELLOW });
        lifeArmed = setTimeout(() => {
          lifeArmed = null;
          if (!g.lifeSize.peek()) life?.setProperties({ text: 'Stand in the shot', borderColor: CHALK_HAZE });
        }, LIFE_CONFIRM_MS);
        return;
      }
      disarmLife();
      g.lifeSizeRequested.value = g.lifeSizeRequested.peek() + 1;
    });
    // At full size the way back is the one big button, whichever tab is showing.
    wire('btn-back', () => {
      if (g.lifeSize.peek()) g.lifeSizeRequested.value = g.lifeSizeRequested.peek() + 1;
    });
    this.cleanupFuncs.push(
      g.lifeSize.subscribe((on) => {
        life?.setProperties({ text: on ? 'Back to the table' : 'Stand in the shot', borderColor: on ? OPTIC_YELLOW : CHALK_HAZE });
        // A frame needs the slate under the actors, and the slate is back on the table.
        panel.getElementById('btn-snap')?.setProperties({ display: on ? 'none' : 'flex' });
        panel.getElementById('btn-back')?.setProperties({ display: on ? 'flex' : 'none' });
        panel.getElementById('btn-reset-stage')?.setProperties({ display: on ? 'none' : 'flex' });
      }),
    );
    const squirm = panel.getElementById<UIKit.Text>('btn-squirm');
    wire('btn-squirm', () => {
      g.squirmOn.value = !g.squirmOn.peek();
    });
    this.cleanupFuncs.push(
      g.squirmOn.subscribe((on) => {
        squirm?.setProperties({ text: on ? 'Squirm when held: on' : 'Squirm when held: off', borderColor: on ? OPTIC_YELLOW : CHALK_HAZE });
        const settings = loadJson<{ voice?: boolean }>(StoreKey.Settings);
        saveJson(StoreKey.Settings, { ...settings, squirm: on });
      }),
    );

    // The camera kit.
    wire('btn-format', () => {
      g.sensorIndex.value = (g.sensorIndex.peek() + 1) % SENSORS.length;
    });
    wire('btn-rig', () => {
      g.cameraRig.value = g.cameraRig.peek() === Rig.Drone ? Rig.Tripod : Rig.Drone;
    });
    const format = panel.getElementById<UIKit.Text>('btn-format');
    const rig = panel.getElementById<UIKit.Text>('btn-rig');
    this.cleanupFuncs.push(
      g.sensorIndex.subscribe((i) => format?.setProperties({ text: SENSORS[i]?.name ?? '' })),
      g.cameraRig.subscribe((value) => rig?.setProperties({ text: value === Rig.Drone ? 'Drone' : 'Tripod' })),
    );

    // Say what should be on the set. The listening runs on the headset itself, from files that
    // ship with the app, and it is fetched the first time the button is pressed.
    const voiceButton = panel.getElementById<UIKit.Text>('btn-voice');
    const voiceLine = panel.getElementById<UIKit.Text>('voice-line');
    if (voiceButton != null && Voice.supported()) {
      voiceButton.setProperties({ display: 'flex' });
      let voice: Voice | null = null;
      let busy = false;
      const tell = (text: string): void => {
        voiceLine?.setProperties({ display: text === '' ? 'none' : 'flex', text });
      };
      const WORDS: Record<VoiceState, string> = {
        idle: 'Say a scene',
        loading: 'Getting ready',
        listening: 'Listening',
        thinking: 'One moment',
        error: 'Say a scene',
      };
      // The first press says what it will cost; the listener is 40 MB, kept after that.
      let warned = loadJson<{ voice?: boolean }>(StoreKey.Settings)?.voice === true;
      wire('btn-voice', () => {
        if (!warned) {
          warned = true;
          tell('A 40 MB download, once. It stays on the headset, and what you say stays too. Press again to go ahead.');
          return;
        }
        saveJson(StoreKey.Settings, { squirm: g.squirmOn.peek(), voice: true });
        voice ??= new Voice({
          words: wordsToHear(),
          onState: (state, detail) => {
            busy = state === 'loading' || state === 'listening' || state === 'thinking';
            voiceButton.setProperties({
              text: WORDS[state],
              backgroundColor: state === 'listening' ? OPTIC_YELLOW : undefined,
              color: state === 'listening' ? CLOTH : CHALK,
            });
            if (state === 'loading') tell('Waking the listener.');
            if (state === 'listening') tell('Say what should be on the set, then stop talking.');
            if (state === 'error') tell(detail ?? 'The microphone did not start.');
          },
          onProgress: (fraction) =>
            tell(fraction < 1 ? `Fetching the listener, ${Math.round(fraction * 100)}%. This happens once.` : 'Waking the listener.'),
          onText: (text, final) => {
            if (text !== '') tell(`Heard: ${text}`);
            if (!final) return;
            if (text === '') tell('Heard nothing. Press it and try again.');
            else g.sceneRequest.value = understand(text);
          },
        });
        if (busy) voice.stop();
        else void voice.start();
      });
      this.cleanupFuncs.push(
        () => voice?.dispose(),
        // Out of the session or behind a system menu, the microphone closes.
        this.world.visibilityState.subscribe((state) => {
          if (state !== VisibilityState.Visible) voice?.stop();
        }),
      );
    }

    // Two cameras, one live. Pressing the other is a cut, and a take that is recording keeps it.
    wire('btn-cam-a', () => {
      g.cameraOn.value = CAMERAS[0];
    });
    wire('btn-cam-b', () => {
      if (!g.trayOn.peek().includes(CAMERAS[1])) g.trayToggle.value = CAMERAS[1];
      g.cameraOn.value = CAMERAS[1];
    });
    wire('btn-strike-b', () => {
      if (g.trayOn.peek().includes(CAMERAS[1])) g.trayToggle.value = CAMERAS[1];
    });
    const showCameras = (): void => {
      const second = g.trayOn.peek().includes(CAMERAS[1]);
      const live = g.cameraOn.peek();
      panel.getElementById('btn-cam-a')?.setProperties({
        backgroundColor: live === CAMERAS[0] ? OPTIC_YELLOW : undefined,
        color: live === CAMERAS[0] ? CLOTH : CHALK,
      });
      panel.getElementById<UIKit.Text>('btn-cam-b')?.setProperties({
        text: second ? 'Cam B' : 'Add cam B',
        backgroundColor: live === CAMERAS[1] ? OPTIC_YELLOW : undefined,
        color: live === CAMERAS[1] ? CLOTH : CHALK,
      });
      panel.getElementById('strike-row')?.setProperties({ display: second ? 'flex' : 'none' });
    };
    this.cleanupFuncs.push(g.cameraOn.subscribe(showCameras), g.trayOn.subscribe(showCameras));

    // The asset library: one shelf shows; a slot adds its item, or takes it off the set.
    // Two views sit on the shelves' tabs: whole scenes to start from, and a spelled search of everything.
    const SHELF_TABS = [...SHELVES, 'Scenes', 'Search'] as const;
    type ShelfTab = (typeof SHELF_TABS)[number];
    let shelf: ShelfTab = 'Cast';
    let page = 0;
    let query = '';
    const slots = (): number => (shelf === 'Search' ? SEARCH_SLOTS : SHELF_SLOTS);
    const onShelf = (): typeof ASSETS => {
      if (shelf === 'Search') return query === '' ? [] : searchAssets(query);
      return ASSETS.filter((asset) => asset.shelf === (shelf as Shelf));
    };
    const showShelf = (): void => {
      const scenes = shelf === 'Scenes';
      const all = onShelf();
      const count = scenes ? SCENES.length : all.length;
      const pages = Math.max(1, Math.ceil(count / slots()));
      if (page >= pages) page = 0;
      const on = g.trayOn.peek();
      for (const name of SHELF_TABS) {
        // Tabs fill; a shelf is one level down, so it only takes a line under it.
        panel.getElementById(`shelf-${name}`)?.setProperties({ borderColor: name === shelf ? OPTIC_YELLOW : CLOTH });
      }
      const searching = shelf === 'Search';
      panel.getElementById('search-box')?.setProperties({ display: searching ? 'flex' : 'none' });
      if (searching) {
        const found = query === '' ? 'Spell a name' : all.length === 0 ? `${query.toUpperCase()}: nothing in the kit` : query.toUpperCase();
        panel.getElementById<UIKit.Text>('search-query')?.setProperties({ text: found });
      }
      for (let i = 0; i < SHELF_SLOTS; i++) {
        const at = page * slots() + i;
        const scene = scenes ? SCENES[at] : undefined;
        const item = !scenes && i < slots() ? all[at] : undefined;
        // Yellow means chosen, here as everywhere; a chalk edge says it is on the set.
        const selected = item != null && item.label === g.selectedLabel.peek();
        panel.getElementById<UIKit.Text>(`asset-${i}`)?.setProperties({
          display: item || scene ? 'flex' : 'none',
          text: scene ? scene.title : item ? assetTitle(item.label) : '',
          borderColor: item && on.includes(item.label) ? CHALK : CHALK_HAZE,
          backgroundColor: selected ? OPTIC_YELLOW : undefined,
          color: selected ? CLOTH : CHALK,
        });
      }
      panel.getElementById('shelf-pager')?.setProperties({ display: pages > 1 ? 'flex' : 'none' });
      panel.getElementById<UIKit.Text>('shelf-page')?.setProperties({ text: `${shelf}, ${page + 1} of ${pages}` });
      panel.getElementById('fx-note')?.setProperties({ display: shelf === 'Effects' ? 'flex' : 'none' });
      const dressing = on.filter((label) => assetByLabel(label)?.shelf !== 'Kit').length;
      panel.getElementById<UIKit.Text>('assets-count')?.setProperties({ text: `${dressing} on the set` });
    };
    for (const name of SHELF_TABS) {
      wire(`shelf-${name}`, () => {
        shelf = name;
        page = 0;
        showShelf();
      });
    }
    for (let code = 97; code <= 122; code++) {
      const letter = String.fromCharCode(code);
      wire(`key-${letter}`, () => {
        if (query.length >= SEARCH_LONGEST) return;
        query += letter;
        page = 0;
        showShelf();
      });
    }
    wire('key-del', () => {
      query = query.slice(0, -1);
      page = 0;
      showShelf();
    });
    wire('btn-more', () => {
      page += 1;
      showShelf();
    });
    for (let i = 0; i < SHELF_SLOTS; i++) {
      wire(`asset-${i}`, () => {
        const at = page * slots() + i;
        if (shelf === 'Scenes') {
          if (SCENES[at]) g.sceneStart.value = at;
          return;
        }
        const item = onShelf()[at];
        if (item) g.trayPress.value = item.label;
      });
    }
    for (let i = 0; i < PAINTS.length; i++) {
      wire(`paint-${i}`, () => {
        g.paintPick.value = i;
      });
    }
    wire('btn-copy', () => {
      g.copyRequested.value = g.copyRequested.peek() + 1;
    });
    wire('btn-size', () => {
      g.sizeRequested.value = g.sizeRequested.peek() + 1;
    });
    wire('btn-style', () => {
      g.styleRequested.value = g.styleRequested.peek() + 1;
    });
    wire('btn-remove', () => {
      g.removeSelected.value = g.removeSelected.peek() + 1;
    });
    wire('btn-clear-set', () => {
      g.clearSet.value = g.clearSet.peek() + 1;
    });
    wire('btn-pose', () => {
      g.poseRequested.value = g.poseRequested.peek() + 1;
    });
    wire('btn-look', () => {
      g.lookRequested.value = g.lookRequested.peek() + 1;
    });
    const cast = panel.getElementById<UIKit.Text>('cast-line');
    this.cleanupFuncs.push(
      g.trayOn.subscribe(showShelf),
      g.castLine.subscribe((line) => {
        const selected = line !== '';
        cast?.setProperties({ text: selected ? line : 'Press a piece here, or pick it up' });
        panel.getElementById('held-row')?.setProperties({ display: selected ? 'flex' : 'none' });
      }),
      g.selectedPaint.subscribe((paint) => {
        panel.getElementById('paint-row')?.setProperties({ display: paint >= 0 ? 'flex' : 'none' });
        for (let i = 0; i < PAINTS.length; i++) {
          panel.getElementById(`paint-${i}`)?.setProperties({ borderColor: i === paint ? CHALK : CLOTH });
        }
      }),
      g.selectedLabel.subscribe(showShelf),
      g.selectedCopies.subscribe((has) => {
        panel.getElementById('btn-copy')?.setProperties({ display: has ? 'flex' : 'none' });
      }),
      g.selectedStyles.subscribe((has) => {
        panel.getElementById('btn-style')?.setProperties({ display: has ? 'flex' : 'none' });
      }),
      g.selectedIsActor.subscribe((actor) => {
        panel.getElementById('btn-pose')?.setProperties({ display: actor ? 'flex' : 'none' });
        panel.getElementById('btn-look')?.setProperties({ display: actor ? 'flex' : 'none' });
      }),
    );

    // The shot briefs.
    wire('btn-skip-brief', () => {
      g.briefSkip.value = g.briefSkip.peek() + 1;
    });
    const briefCount = panel.getElementById<UIKit.Text>('brief-count');
    const briefTitle = panel.getElementById<UIKit.Text>('brief-title');
    const briefAsk = panel.getElementById<UIKit.Text>('brief-ask');
    const showBrief = (): void => {
      const index = g.briefIndex.peek();
      const brief = BRIEFS[index];
      const printed = g.briefPrinted.peek();
      briefCount?.setProperties({ text: `${printed} OF ${BRIEFS.length} PRINTED` });
      briefTitle?.setProperties({ text: brief ? brief.title : 'That is a wrap' });
      briefAsk?.setProperties({ text: brief ? brief.ask : 'Every shot on the list is printed.' });
    };
    this.cleanupFuncs.push(g.briefIndex.subscribe(showBrief), g.briefPrinted.subscribe(showBrief));

    // A take: Record starts and stops a pass, Play loops what has been recorded.
    const record = panel.getElementById<UIKit.Text>('btn-record');
    const play = panel.getElementById<UIKit.Text>('btn-play');
    const requestRecord = () => {
      g.recordRequested.value = g.recordRequested.value + 1;
    };
    const requestPlay = () => {
      g.playRequested.value = g.playRequested.value + 1;
    };
    record?.addEventListener('click', requestRecord);
    play?.addEventListener('click', requestPlay);
    const labelTake = () => {
      const state = g.takeState.peek();
      const has = g.takeLength.peek() > 0;
      const recording = state === 'recording';
      const playing = state === 'playing';
      record?.setProperties({
        text: recording ? 'Stop' : has ? 'Record over' : 'Record',
        borderColor: recording ? TALLY_RED : CHALK_HAZE,
        backgroundColor: recording ? TALLY_RED : undefined,
      });
      play?.setProperties({
        display: has && !recording ? 'flex' : 'none',
        text: playing ? 'Stop' : 'Play',
        borderColor: playing ? OPTIC_YELLOW : CHALK_HAZE,
      });
    };
    this.cleanupFuncs.push(
      () => record?.removeEventListener('click', requestRecord),
      () => play?.removeEventListener('click', requestPlay),
      g.takeState.subscribe(labelTake),
      g.takeLength.subscribe(labelTake),
    );

    const snap = panel.getElementById('btn-snap');
    this.snapButton = snap ?? null;
    const requestSnap = () => {
      g.snapRequested.value = g.snapRequested.value + 1;
    };
    snap?.addEventListener('click', requestSnap);
    this.cleanupFuncs.push(() => snap?.removeEventListener('click', requestSnap));

    const eyeA = panel.getElementById<UIKit.Text>('eyeline-a');
    const eyeB = panel.getElementById<UIKit.Text>('eyeline-b');
    const boardCount = panel.getElementById<UIKit.Text>('board-count');
    this.cleanupFuncs.push(
      g.eyelineText.subscribe((lines) => {
        // Each actor's line is written in the colour of their own tape.
        const tape = (line: string | undefined): string => assetByLabel(line?.split(':')[0] ?? '')?.tape ?? CHALK;
        eyeA?.setProperties({ text: lines[0] ?? 'Put the ball and an actor on the set', color: lines[0] ? tape(lines[0]) : CHALK });
        eyeB?.setProperties({ text: lines[1] ?? '', color: tape(lines[1]) });
      }),
      // The card under the monitor is the shot list; the panel only keeps count.
      g.shotList.subscribe((lines) => {
        boardCount?.setProperties({
          text: lines.length === 0 ? 'No frames yet' : `${lines.length} of ${BOARD_SLOTS} frames, on the card`,
        });
      }),
    );

    // In the page, the wordmark and the Enter XR button already exist outside
    // the viewport, so the panel shows neither; in the headset it shows both.
    const title = panel.getElementById('panel-title');
    const xrButton = panel.getElementById('xr-button');
    const exitButton = panel.getElementById('exit-button');
    if (xrButton == null || exitButton == null) return;
    if (!this.world.xrEnabled) {
      xrButton.setProperties({ display: 'none' });
      exitButton.setProperties({ display: 'none' });
      title?.setProperties({ display: 'none' });
      return;
    }
    const launchXR = () => this.world.launchXR();
    const exitXR = () => this.world.exitXR();
    xrButton.addEventListener('click', launchXR);
    exitButton.addEventListener('click', exitXR);
    this.cleanupFuncs.push(
      () => xrButton.removeEventListener('click', launchXR),
      () => exitButton.removeEventListener('click', exitXR),
      this.world.visibilityState.subscribe((state) => {
        const is2D = state === VisibilityState.NonImmersive;
        title?.setProperties({ display: is2D ? 'none' : 'flex' });
        xrButton.setProperties({ display: 'none' });
        exitButton.setProperties({ display: is2D ? 'none' : 'flex' });
      }),
    );
  }
}
