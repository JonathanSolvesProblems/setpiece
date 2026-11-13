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
import { wordsToHear } from './scene-request.js';
import type { Spoken } from './scene-request.js';
import { SetPiece, StageAnchor } from './set-components.js';
import { SCENES } from './scenes.js';
import { noteSeconds } from './coach.js';
import { hear } from './spoken.js';
import { ViewfinderSystem } from './viewfinder.js';
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
const PANEL_TOP = 0.725;
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
const CHALK_DUST = '#c7c7b7';
/** How long a change in where the set is keeps the panel's line: landed, moved by hand, back where it was left. */
const STAGE_SAYS_MS = 4000;
/** How long a first press stays armed, and its warning stays up. */
const CONFIRM_MS = 4000;
/** The panel's type is plain ASCII: the sheet's dot becomes a colon, a word the listener could not place becomes dots. */
const plain = (text: string): string =>
  text
    .replace(/ \u00b7 /g, ': ')
    .replace(/\[unk\]/g, '...')
    .replace(/[^\x20-\x7e]/g, '');
/**
 * Roughly how wide words set in the panel's 13 px type are, in panel units: enough to keep what the block says
 * inside its three lines. Capitals and figures are wide, the thin letters and the points are narrow.
 */
const NARROW = /[ .,:;'!|ilIjtfr]/;
const WIDE = /[A-Z0-9mw%]/;
const widthOf = (text: string): number => {
  let width = 0;
  for (let i = 0; i < text.length; i++) width += NARROW.test(text[i]) ? 3.7 : WIDE.test(text[i]) ? 8.6 : 6.7;
  return width;
};
/** What three lines of the block hold, with room left for lines that break early at a word. */
const SAYS_ROOM = 600;
/** The least room what was heard is given, however long what came of it is. */
const HEARD_LEAST = 100;
/** The words, whole if they fit that width, cut short with three points if they do not. */
const fit = (text: string, room: number): string => {
  if (widthOf(text) <= room) return text;
  let end = text.length;
  while (end > 0 && widthOf(text.slice(0, end)) > room - 12) end--;
  return `${text.slice(0, end).trimEnd()}...`;
};
const clip = (text: string): string => plain(text).trim();
const PLACED_STATUSES = new Set<string>([
  StageStatus.Table,
  StageStatus.Touch,
  StageStatus.Restored,
  StageStatus.Manual,
  StageStatus.Kept,
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
  coachNote: Signal<string>;
  coachLine: Signal<string>;
  shotFrames: Signal<unknown[]>;
  takeClear: Signal<number>;
  noteSaid: Signal<string>;
  notesPosted: Signal<number>;
  panelSays: Signal<string>;
  sceneStart: Signal<number>;
  castLine: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  briefIndex: Signal<number>;
  briefPrinted: Signal<number>;
  briefSkip: Signal<number>;
};
const TABS = ['shoot', 'camera', 'assets', 'briefs', 'stage'] as const;
/** With Keep listening on, how long after one sentence is acted on before the microphone opens for the next. */
const RELISTEN_MS = 350;
/** Panel presses closer together than this are taken for one slip. */
const PRESS_GAP_MS = 320;
/** In a chain there is thinking between sentences: the listening waits this long for the next one. */
const CHAIN_QUIET_MS = 20000;
/** The tally's red: the record button wears it while a take is being recorded. */
const TALLY_RED = '#e0352b';
const CHALK = '#f6f7ef';
/** Rays prefer the higher order, whatever is nearer. Nothing else on the set is above the board's 5. */
const PANEL_ORDER = 10;
/**
 * The panel is some 280 small meshes, and each hand's ray and each hand's fingertip tries every one
 * of them on every frame. On the headset, with both hands tracked, the input pass cost 2 to 3 ms a
 * frame and the session ran at 72 to 82 frames a second, against 87 to 90 with the hands out of view.
 * Timed in the emulator, half of that pass was the panel. So the panel is closed to the pointers
 * unless a hand points within this much of it or a fingertip is that close, and it stays open this
 * long (seconds) after the last time one did, so a press that began on it ends on it.
 */
const PANEL_GATE_MARGIN = 0.12;
const PANEL_GATE_HOLD = 0.4;
const SIDES = ['left', 'right'] as const;
type Gated = Object3D & { intersectChildren?: boolean };
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
  private gateOpen = true;
  /**
   * A sentence the listener has written, acted on, with what was heard and what came of it said on the panel.
   * The recogniser calls it, and so can a test, with typed words.
   */
  heard: (text: string) => void = (text) => hear(this.world, text);
  private gateOpenUntil = 0;
  private gateAt = new Vector3();
  private gateFrom = new Vector3();
  private gateWay = new Vector3();
  private gateTo = new Vector3();

  /**
   * In the headset the panel travels with the set, so it is beside the slate
   * wherever the table turns out to be, and inside the same narrow field of view.
   * The page hides the panel and has its own controls.
   */
  update(delta: number, time: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    if ((this.globals as Globals).lifeSize.peek()) {
      this.walkWithWearer(delta);
      if (this.panelObject != null) this.gatePanel(this.panelObject, time);
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
    this.gatePanel(panel, time);
  }

  /** Opens the panel to the hand pointers while a hand points at it or reaches for it, and closes it otherwise. */
  private gatePanel(panel: Object3D, time: number): void {
    const size = this.panelRoot?.size?.value;
    const reach = (size == null ? 0.3 : Math.hypot(size[0], size[1]) * PANEL_UNIT * 0.5) + PANEL_GATE_MARGIN;
    panel.getWorldPosition(this.gateAt);
    let wanted = false;
    for (let i = 0; i < SIDES.length && !wanted; i++) {
      const side = SIDES[i];
      const ray = this.player.raySpaces[side];
      ray.getWorldPosition(this.gateFrom);
      // A target ray points down its own -Z.
      ray.getWorldDirection(this.gateWay).negate();
      this.gateTo.copy(this.gateAt).sub(this.gateFrom);
      const along = this.gateTo.dot(this.gateWay);
      // How far the middle of the panel is from the line the hand points along; behind the hand, from the hand itself.
      const off = along <= 0 ? this.gateTo.length() : Math.sqrt(Math.max(0, this.gateTo.lengthSq() - along * along));
      if (off <= reach) wanted = true;
      this.player.indexTipSpaces[side].getWorldPosition(this.gateFrom);
      if (this.gateFrom.distanceTo(this.gateAt) <= reach + PANEL_GATE_MARGIN) wanted = true;
    }
    if (wanted) this.gateOpenUntil = time + PANEL_GATE_HOLD;
    const open = time <= this.gateOpenUntil;
    if (open === this.gateOpen) return;
    this.gateOpen = open;
    (panel as Gated).intersectChildren = open;
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

    // Two presses a moment apart are one slip of the hand, not two wishes: the second is let go.
    // (On the headset one pinch that crossed the panel painted a truck, pressed Record and added a camera.)
    let lastPress = -PRESS_GAP_MS;
    const meant = (): boolean => {
      const now = performance.now();
      if (now - lastPress < PRESS_GAP_MS) return false;
      lastPress = now;
      return true;
    };
    for (const mm of LENSES) {
      const button = panel.getElementById(`lens-${mm}`);
      if (button == null) continue;
      const pick = () => {
        if (meant()) g.lensMm.value = mm;
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


    // Offered only while the set floats and the headset can scan the room for a table.
    const findTable = panel.getElementById('btn-find-table');
    const requestScan = () => {
      if (meant()) g.roomScanRequested.value = g.roomScanRequested.value + 1;
    };
    findTable?.addEventListener('click', requestScan);
    this.cleanupFuncs.push(
      () => findTable?.removeEventListener('click', requestScan),
      g.roomScanOffered.subscribe((offered) => {
        findTable?.setProperties({ display: offered ? 'flex' : 'none' });
      }),
    );


    // Tabs keep a panel this size on the table: one page shows, Snap frame is always there.
    const wire = (id: string, run: () => void): void => {
      const element = panel.getElementById(id);
      const press = (): void => {
        if (meant()) run();
      };
      element?.addEventListener('click', press);
      this.cleanupFuncs.push(() => element?.removeEventListener('click', press));
    };
    // What the set last said, here where the pressing hand is looking, as well as on the call sheet above the
    // monitor. A passing note keeps its place for as long as the sheet keeps it; the next step and the hints wait
    // their turn. With nothing to say it reads where the set is. The block keeps its height, so nothing under it
    // moves when the words change.
    const saysBlock = panel.getElementById('says');
    const saysLine = panel.getElementById<UIKit.Text>('voice-line');
    let saysUntil = 0;
    let saysWaiting: [string, string] | null = null;
    let saysTimer: ReturnType<typeof setTimeout> | null = null;
    /** Set while a spoken sentence is being acted on, so the note that comes of it carries what was heard. */
    let heardNow = '';
    const write = (label: string, text: string): void => {
      const quiet = label === '' && text === '';
      const title = plain(label);
      const words = plain(text);
      const shown = fit(quiet ? g.stageStatus.peek() : title === '' ? words : `${title}. ${words}`, SAYS_ROOM);
      saysLine?.setProperties({ text: shown === '' ? ' ' : shown, color: quiet ? CHALK_DUST : CHALK });
      g.panelSays.value = quiet ? '' : `${title} | ${words}`;
    };
    /** What the sheet shows now, unless that is a note whose time is up. */
    const sheetNow = (): [string, string] => {
      const line = g.coachLine.peek();
      if (line === g.noteSaid.peek()) return ['', ''];
      const [label = '', text = ''] = line.split(' | ');
      return [label, text];
    };
    const says = (label: string, text: string, holdMs = 0, hint = false): void => {
      const now = performance.now();
      if (hint && now < saysUntil) {
        saysWaiting = [label, text];
        return;
      }
      saysWaiting = null;
      if (saysTimer != null) clearTimeout(saysTimer);
      saysTimer = null;
      saysUntil = now + holdMs;
      write(label, text);
      if (holdMs <= 0) return;
      saysTimer = setTimeout(() => {
        saysTimer = null;
        const [nextLabel, nextText] = saysWaiting ?? sheetNow();
        saysWaiting = null;
        write(nextLabel, nextText);
      }, holdMs);
    };
    this.cleanupFuncs.push(
      () => {
        if (saysTimer != null) clearTimeout(saysTimer);
      },
      g.coachLine.subscribe((line) => {
        // The sheet showing a note is that note again; the note itself arrives below.
        if (line !== '' && line === g.noteSaid.peek()) return;
        const [label = '', text = ''] = line.split(' | ');
        says(label, text, 0, true);
      }),
      // Where the set is: the block's edge is yellow once it is placed, and a change is said once.
      g.stageStatus.subscribe((text) => {
        saysBlock?.setProperties({ borderColor: PLACED_STATUSES.has(text) ? OPTIC_YELLOW : CHALK_HAZE });
        says('STAGE', text, STAGE_SAYS_MS);
      }),
      g.notesPosted.subscribe((count) => {
        if (count === 0) return;
        const note = g.noteSaid.peek();
        const [label = '', text = ''] = note.split(' | ');
        // What was heard goes in front of what came of it, cut to the room what came of it leaves.
        const room = Math.max(HEARD_LEAST, SAYS_ROOM - widthOf(`${plain(label)}. Heard: . ${plain(text)}`));
        says(label, heardNow === '' ? text : `Heard: ${fit(heardNow, room)}. ${text}`, noteSeconds(note) * 1000);
      }),
    );
    // What cannot be taken back takes two presses. The first says, on the line above, what the second will cost.
    const twice = (id: string, label: string, cost: () => string, run: () => void): void => {
      const element = panel.getElementById<UIKit.Text>(id);
      let armed: ReturnType<typeof setTimeout> | null = null;
      const rest = (): void => {
        if (armed != null) clearTimeout(armed);
        armed = null;
        element?.setProperties({ text: label, borderColor: CHALK_HAZE });
      };
      this.cleanupFuncs.push(() => {
        if (armed != null) clearTimeout(armed);
      });
      wire(id, () => {
        if (armed == null) {
          element?.setProperties({ text: 'Press again', borderColor: OPTIC_YELLOW });
          says('', cost(), CONFIRM_MS);
          armed = setTimeout(rest, CONFIRM_MS);
          return;
        }
        rest();
        // What it warned of is being done: the warning goes, and whatever the doing says takes its place.
        const [nowLabel, nowText] = sheetNow();
        says(nowLabel, nowText);
        run();
      });
    };
    twice(
      'btn-new-board',
      'New board',
      () => {
        const frames = g.shotFrames.peek().length;
        const lost = frames === 0 ? 'the set' : frames === 1 ? 'the frame and the set' : `${frames} frames and the set`;
        return `New board clears ${lost}${g.takeLength.peek() > 0 ? ', and the take' : ''}. Press it again to go ahead.`;
      },
      () => {
        g.newBoardRequested.value = g.newBoardRequested.value + 1;
      },
    );
    twice(
      'btn-reset-stage',
      'Reset stage',
      () => 'Reset lifts the set off the table so you can land it again. Press it again to go ahead.',
      () => {
        g.resetStageRequested.value = g.resetStageRequested.value + 1;
      },
    );
    twice(
      'btn-clear-take',
      'Clear',
      () => 'Clear takes the take away for good. Press it again to go ahead.',
      () => {
        g.takeClear.value = g.takeClear.peek() + 1;
      },
    );
    this.heard = (text: string): void => {
      const posted = g.notesPosted.peek();
      heardNow = clip(text);
      try {
        hear(this.world, text);
      } finally {
        heardNow = '';
      }
      // A control that says nothing of its own (a lens, a snap) still shows it was heard.
      if (g.notesPosted.peek() === posted) says('', `Heard: ${clip(text)}.`, 5000);
    };
    // Undo is on every tab: the set goes back to how it stood before the last change.
    wire('btn-undo', () => {
      const note = this.world.getSystem(ViewfinderSystem)?.undo() ?? '';
      if (note !== '') g.coachNote.value = note;
    });
    let openTab: string = 'shoot';
    // What the piece last touched can be given follows the wearer to every tab; the Assets tab shows it always.
    const showPieceBar = (): void => {
      panel.getElementById('held-block')?.setProperties({ display: openTab === 'assets' || g.castLine.peek() !== '' ? 'flex' : 'none' });
    };
    const showTab = (tab: string): void => {
      openTab = tab;
      showPieceBar();
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
    if (voiceButton != null && Voice.supported()) {
      voiceButton.setProperties({ display: 'flex' });
      let voice: Voice | null = null;
      let busy = false;
      const tell = (text: string, holdMs = 0, hint = false): void => says('', text, holdMs, hint);
      const WORDS: Record<VoiceState, string> = {
        idle: 'Say a scene',
        loading: 'Getting ready',
        listening: 'Listening',
        thinking: 'One moment',
        error: 'Say a scene',
      };
      // Keep listening: after each sentence the microphone opens again by itself, so a whole setup
      // can be said after one pinch. A quiet spell ends it, and so does the button.
      const keepButton = panel.getElementById<UIKit.Text>('btn-keep-listening');
      panel.getElementById('voice-field')?.setProperties({ display: 'flex' });
      let keep = loadJson<{ keep?: boolean }>(StoreKey.Settings)?.keep === true;
      let chained = false;
      let halted = false;
      let again: ReturnType<typeof setTimeout> | null = null;
      const showKeep = (): void => {
        keepButton?.setProperties({ text: keep ? 'Keep listening: on' : 'Keep listening: off', borderColor: keep ? OPTIC_YELLOW : CHALK_HAZE });
      };
      showKeep();
      wire('btn-keep-listening', () => {
        keep = !keep;
        saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), keep });
        showKeep();
      });
      // The first press says what it will cost; the listener is 40 MB, kept after that.
      let warned = loadJson<{ voice?: boolean }>(StoreKey.Settings)?.voice === true;
      wire('btn-voice', () => {
        if (!warned) {
          warned = true;
          tell('A 40 MB download, once. It stays on the headset, and so does what you say. Press again to start.', 15000);
          return;
        }
        // Pressed between two sentences of a chain: that ends the chain.
        if (again != null) {
          clearTimeout(again);
          again = null;
          chained = false;
          tell('Listening stopped.', 4000);
          return;
        }
        saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), squirm: g.squirmOn.peek(), voice: true });
        voice ??= new Voice({
          words: wordsToHear(),
          onState: (state, detail) => {
            busy = state === 'loading' || state === 'listening' || state === 'thinking';
            voiceButton.setProperties({
              text: WORDS[state],
              backgroundColor: state === 'listening' ? OPTIC_YELLOW : undefined,
              color: state === 'listening' ? CLOTH : CHALK,
            });
            if (state === 'loading' && !chained) tell('Waking the listener.');
            if (state === 'listening') {
              // A hint: what came of the last sentence keeps its place until it has been read.
              tell(chained ? 'Still listening. Say the next thing, or stay quiet to stop.' : 'Say a scene, or a control: snap, eighty five, record, paint it red.', 0, true);
            }
            if (state === 'error') {
              chained = false;
              tell(detail ?? 'The microphone did not start.', 8000);
            }
            // Stopped, perhaps while it was still waking: its last line gives way to the sheet's, in its turn.
            if (state === 'idle') {
              const [nowLabel, nowText] = sheetNow();
              says(nowLabel, nowText, 0, true);
            }
          },
          onProgress: (fraction) =>
            tell(fraction < 1 ? `Fetching the listener, ${Math.round(fraction * 100)}%. This happens once.` : 'Waking the listener.'),
          onText: (text, final) => {
            if (text !== '') says('', `Heard: ${clip(text)}`);
            if (!final) return;
            if (text === '') {
              tell(halted ? 'Listening stopped.' : chained ? 'Quiet, so the listening stopped. Press Say a scene to start again.' : 'Heard nothing. Press it and try again.', 6000);
              chained = false;
              return;
            }
            // What came of it is said here too, on the panel, where the hand that pressed is looking: the note
            // the sentence posts arrives with what was heard in front of it.
            this.heard(text);
            if (!keep || halted) {
              chained = false;
              return;
            }
            chained = true;
            again = setTimeout(() => {
              again = null;
              if (!busy && this.world.visibilityState.peek() === VisibilityState.Visible) void voice?.start(CHAIN_QUIET_MS);
              else chained = false;
            }, RELISTEN_MS);
          },
        });
        halted = busy;
        if (busy) {
          voice.stop();
        } else {
          chained = false;
          void voice.start();
        }
      });
      this.cleanupFuncs.push(
        () => {
          if (again != null) clearTimeout(again);
        },
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
        showPieceBar();
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
      if (meant()) g.recordRequested.value = g.recordRequested.value + 1;
    };
    const requestPlay = () => {
      if (meant()) g.playRequested.value = g.playRequested.value + 1;
    };
    record?.addEventListener('click', requestRecord);
    play?.addEventListener('click', requestPlay);
    const labelTake = () => {
      const state = g.takeState.peek();
      const has = g.takeLength.peek() > 0;
      const recording = state === 'recording';
      const playing = state === 'playing';
      record?.setProperties({
        text: recording ? 'Stop' : has ? 'Record more' : 'Record',
        borderColor: recording ? TALLY_RED : CHALK_HAZE,
        backgroundColor: recording ? TALLY_RED : undefined,
      });
      play?.setProperties({
        display: has && !recording ? 'flex' : 'none',
        text: playing ? 'Stop' : 'Play',
        borderColor: playing ? OPTIC_YELLOW : CHALK_HAZE,
      });
      // A take made by a slip can be cleared, once it is not running.
      panel.getElementById('btn-clear-take')?.setProperties({ display: has && state === 'idle' ? 'flex' : 'none' });
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
      if (meant()) g.snapRequested.value = g.snapRequested.value + 1;
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
