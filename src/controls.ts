import {
  AudioSource,
  AudioUtils,
  createSystem,
  Entity,
  Object3D,
  PlaybackMode,
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
import { assetByLabel, ASSETS, assetTitle, PAINTS, searchAssets, SHELF_SLOTS, SHELVES, STARTING_ASSETS } from './catalog.js';
import type { Shelf } from './catalog.js';
import { CAMERAS, LENSES, Rig, SENSORS } from './camera-formats.js';
import { StageStatus } from './placement.js';
import { wordsToHear } from './scene-request.js';
import type { Spoken } from './scene-request.js';
import { Held, SetPiece, StageAnchor } from './set-components.js';
import { SCENES } from './scenes.js';
import { noteSeconds } from './coach.js';
import { hear } from './spoken.js';
import { DirectorSystem } from './director.js';
import { ViewfinderSystem } from './viewfinder.js';
import { loadJson, saveJson, StoreKey } from './store.js';
import { Voice } from './voice.js';
import type { VoiceState } from './voice.js';
import { micAnswer } from './mic.js';
import { startOver } from './start-over.js';
import { SightlineSystem } from './sightline.js';
import { chooseSpoken, hush, micOpen, sayLine, sayLineOnce, SPOKEN, spokenChoice, talking } from './speech.js';

/**
 * Where the panel sits relative to the stage, as the scene authors it: left of
 * the slate, a little above it, turned in toward the viewer.
 */
const PANEL_OFFSET = new Vector3(-0.46, 0.33, -0.06);
/**
 * The panel hangs from its top edge, this far above the slate, so Snap frame
 * and the tabs stay put when a page changes the panel's height. Metres per
 * panel unit is measured from the panel as it is scaled in the scene.
 */
const PANEL_TOP = 0.725;
/** The least the panel's bottom stands above the slate. */
const PANEL_CLEAR = 0.035;
const LIFE_CONFIRM_MS = 3000;
/** A second pinch this soon after the set went full size is the same press, not a wish to go back. */
const LIFE_DOUBLE_MS = 1500;
/** The two halves of one double pinch are closer together than this. */
const LIFE_PINCH_MS = 500;
/** How fast the panel moves aside for a piece, as a share of what is left each second. */
const ASIDE_RATE = 4;
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
  /** Sets built from words, and whether the designer's coverage is being shot (src/coverage.ts). */
  setsBuilt: Signal<number>;
  coverageRunning: Signal<boolean>;
  coverageRequested: Signal<number>;
  coverageStopRequested: Signal<number>;
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
  talkOffered: Signal<boolean>;
  micOff: Signal<boolean>;
  ownBuild: Signal<boolean>;
  firstSetOn: Signal<boolean>;
  walkthrough: Signal<boolean>;
  walkthroughSkip: Signal<number>;
  startOver: Signal<number>;
  designing: Signal<boolean>;
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
/** The longest keep-listening waits for the designer to finish building and talking before it gives up. */
const CHAIN_WAIT_MS = 30000;
/** How long after a newcomer lands the set the designer starts on a first set of its own: the landing is seen first. */
const FIRST_SET_MS = 900;
/** A hand still on a piece then is waited for: this many times, this long each. */
const FIRST_SET_WAITS = 12;
const FIRST_SET_WAIT_MS = 300;
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
  held: { required: [SetPiece, Held] },
}) {
  private stage: Entity | null = null;
  private panelObject: Object3D | null = null;
  private sightline: SightlineSystem | null = null;
  private asideNow = 0;
  private panelPosition = new Vector3();
  private head = new Vector3();
  private forward = new Vector3();
  private panelQuaternion = new Quaternion();
  private panelTurn = new Quaternion().setFromAxisAngle(UP, PANEL_YAW);
  private snapButton: { setProperties(properties: Record<string, unknown>): void } | null = null;
  private snapLit = false;
  private talkLit = false;
  /** Lights or darkens Talk for the call sheet; set once the panel is wired. */
  private talkLight: ((on: boolean) => void) | null = null;
  private gateOpen = true;
  /**
   * A sentence the listener has written, acted on, with what was heard and what came of it said on the panel.
   * The recogniser calls it, and so can a test, with typed words.
   */
  heard: (text: string, library?: boolean) => void = (text, library) => hear(this.world, text, library === true);
  private gateOpenUntil = 0;
  /** Until when each hand counts as being at the panel, and the time the gate last looked. */
  private wantedUntil: Record<'left' | 'right', number> = { left: -1, right: -1 };
  private lastTime = 0;
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
    const target = (this.globals as Globals).coachTarget.peek();
    const blink = Math.floor(time * SNAP_FLASH_RATE * 2) % 2 === 0;
    const lit = target === 'snap' && blink;
    if (lit !== this.snapLit) {
      this.snapLit = lit;
      this.snapButton?.setProperties({ backgroundColor: lit ? OPTIC_YELLOW : CHALK });
    }
    // The call sheet asking for a sentence lights Talk the same way, unless it is listening or busy already.
    const talk = target === 'talk' && blink;
    if (talk !== this.talkLit) {
      this.talkLit = talk;
      this.talkLight?.(talk);
    }
    const stageObject = this.stage?.object3D;
    if (stageObject == null) return;
    if (this.panelObject == null) this.panelObject = this.scene.getObjectByName('Controls Panel') ?? null;
    const panel = this.panelObject;
    if (panel == null) return;
    stageObject.updateWorldMatrix(true, false);
    this.panelPosition.copy(PANEL_OFFSET);
    // A piece hanging past the slate's left edge would stand in the panel: the panel moves left by as much.
    if (this.sightline == null) this.sightline = this.world.getSystem(SightlineSystem) ?? null;
    const aside = this.sightline?.aside ?? 0;
    this.asideNow += (aside - this.asideNow) * Math.min(1, ASIDE_RATE * delta);
    this.panelPosition.x -= this.asideNow;
    const height = this.panelHeight();
    // It hangs from its top; a page tall enough to reach the slate lifts it instead, so it never sinks into the set.
    if (height > 0) this.panelPosition.y = Math.max(PANEL_TOP - (height * PANEL_UNIT) / 2, PANEL_CLEAR + (height * PANEL_UNIT) / 2);
    this.panelPosition.applyMatrix4(stageObject.matrixWorld);
    stageObject.getWorldQuaternion(this.panelQuaternion).multiply(this.panelTurn);
    setWorldPosition(panel, this.panelPosition);
    setWorldQuaternion(panel, this.panelQuaternion);
    // The set is out of sight for the first moment of a session; so is its panel.
    panel.visible = stageObject.visible;
    this.gatePanel(panel, time);
  }

  /** This hand points at the panel or reaches for it, or did a moment ago: its pinch now is for the panel. */
  panelWanted(side: 'left' | 'right'): boolean {
    return this.gateOpen && this.lastTime <= this.wantedUntil[side];
  }

  /** Opens the panel to the hand pointers while a hand points at it or reaches for it, and closes it otherwise. */
  private gatePanel(panel: Object3D, time: number): void {
    const size = this.panelRoot?.size?.value;
    const reach = (size == null ? 0.3 : Math.hypot(size[0], size[1]) * PANEL_UNIT * 0.5) + PANEL_GATE_MARGIN;
    panel.getWorldPosition(this.gateAt);
    let wanted = false;
    this.lastTime = time;
    for (let i = 0; i < SIDES.length; i++) {
      const side = SIDES[i];
      let mine = false;
      const ray = this.player.raySpaces[side];
      ray.getWorldPosition(this.gateFrom);
      // A target ray points down its own -Z.
      ray.getWorldDirection(this.gateWay).negate();
      this.gateTo.copy(this.gateAt).sub(this.gateFrom);
      const along = this.gateTo.dot(this.gateWay);
      // How far the middle of the panel is from the line the hand points along; behind the hand, from the hand itself.
      const off = along <= 0 ? this.gateTo.length() : Math.sqrt(Math.max(0, this.gateTo.lengthSq() - along * along));
      if (off <= reach) mine = true;
      this.player.indexTipSpaces[side].getWorldPosition(this.gateFrom);
      if (this.gateFrom.distanceTo(this.gateAt) <= reach + PANEL_GATE_MARGIN) mine = true;
      if (mine) {
        wanted = true;
        this.wantedUntil[side] = time + PANEL_GATE_HOLD;
      }
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
    // Every press that counts is heard: a soft tick, as a fingertip on the slate. (Snap has its clap and Talk its
    // two notes as well.) Made now, so it has loaded by the first press.
    const tickHolder = new Object3D();
    tickHolder.name = 'PressTick';
    const tick = this.world.createTransformEntity(tickHolder);
    tick.addComponent(AudioSource, { src: './audio/tick.wav', volume: 0.4, positional: false, maxInstances: 2, playbackMode: PlaybackMode.Overlap });
    const meant = (): boolean => {
      const now = performance.now();
      if (now - lastPress < PRESS_GAP_MS) return false;
      lastPress = now;
      if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) AudioUtils.play(tick);
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
        // A set's line ends with what to try next. The designer's voice reads the description aloud, so when the
        // block cannot hold both, the description is the part cut short and what to try next stays whole.
        const tryAt = text.lastIndexOf(' Try: "');
        const kept = tryAt > 0 ? `${fit(text.slice(0, tryAt), Math.max(HEARD_LEAST, SAYS_ROOM - widthOf(`${plain(label)}. ${plain(text.slice(tryAt))}`)))}${text.slice(tryAt)}` : text;
        // What was heard goes in front of what came of it, cut to the room what came of it leaves.
        const room = Math.max(HEARD_LEAST, SAYS_ROOM - widthOf(`${plain(label)}. Heard: . ${plain(kept)}`));
        says(label, heardNow === '' ? kept : `Heard: ${fit(heardNow, room)}. ${kept}`, noteSeconds(note) * 1000);
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
    this.heard = (text: string, library?: boolean): void => {
      const posted = g.notesPosted.peek();
      heardNow = clip(text);
      try {
        hear(this.world, text, library === true);
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
    // The panel is small until More: Talk, Snap frame, Undo, Step inside. More opens the tabs, which hold every
    // control there is; it is kept open or shut between visits.
    let more = loadJson<{ more?: boolean }>(StoreKey.Settings)?.more === true;
    // A shot to try, for a wearer the listener does not hear, or who would rather see one first: each press asks
    // the set designer for the next of the page's three shots, as if it had been said. It is on the small panel
    // only, and not at full size.
    const tries = [
      ['night chase', 'A night chase past a burning truck, a dragon on a rooftop'],
      ['castle gate', 'A castle gate, two guards and a horse, low angle'],
      ['diner argument', 'Two people arguing in a diner booth'],
    ] as const;
    let tryNext = 0;
    // Once a set stands it becomes Shoot coverage: the designer plans the shots and the app shoots them onto the board.
    // While it shoots, Stop coverage, whichever tab is open and at full size too.
    const setStands = (): boolean => g.setsBuilt.peek() > 0 && g.trayOn.peek().length > 0;
    // In the headset with the board full, it is the way to the page, where the board and the take are saved.
    const boardFull = (): boolean => g.shotFrames.peek().length >= BOARD_SLOTS && this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const showTry = (): void => {
      const covering = g.coverageRunning.peek();
      const text = covering ? 'Stop coverage' : boardFull() ? 'Save the board' : setStands() ? 'Shoot coverage' : `Try a shot: ${tries[tryNext][0]}`;
      panel.getElementById<UIKit.Text>('btn-try')?.setProperties({ text, display: covering || (!g.lifeSize.peek() && (!more || boardFull())) ? 'flex' : 'none' });
    };
    wire('btn-try', () => {
      if (g.coverageRunning.peek()) {
        g.coverageStopRequested.value = g.coverageStopRequested.peek() + 1;
        return;
      }
      if (boardFull()) {
        this.world.exitXR();
        return;
      }
      if (setStands()) {
        g.coverageRequested.value = g.coverageRequested.peek() + 1;
        return;
      }
      const sentence = tries[tryNext][1];
      tryNext = (tryNext + 1) % tries.length;
      showTry();
      this.heard(sentence);
    });
    // The walkthrough can be skipped: the button is on the small panel for as long as the walkthrough is on.
    const showSkip = (): void => {
      panel.getElementById('btn-skip')?.setProperties({ display: g.walkthrough.peek() && !more && !g.lifeSize.peek() ? 'flex' : 'none' });
    };
    wire('btn-skip', () => {
      g.walkthroughSkip.value = g.walkthroughSkip.peek() + 1;
    });
    // The way out, on the small panel where a newcomer can find it (it was only under More, Stage): back to the
    // page, where the board and its Save buttons are.
    twice(
      'btn-leave',
      'Leave',
      () => 'Leave ends the session and goes back to the page, where the board is. Press it again to go.',
      () => this.world.exitXR(),
    );
    this.cleanupFuncs.push(
      g.walkthrough.subscribe(() => showSkip()),
      g.lifeSize.subscribe(() => showSkip()),
    );
    // And started again, from More, Stage, without leaving the session: the board and the set are cleared and the
    // set comes up to be landed, as for a first visitor. That cannot be taken back, so it takes two presses.
    twice(
      'btn-walkthrough',
      'Walkthrough again',
      () => 'This clears the board and the set and lands the set again, as for a first visit. Press it again to go ahead.',
      () => {
        if (g.lifeSize.peek()) {
          says('', 'Step back out to the table first, then start the walkthrough again.', 5000);
          return;
        }
        if (this.world.getSystem(DirectorSystem)?.settled() === false || g.coverageRunning.peek() || g.takeState.peek() !== 'idle') {
          says('', 'The set is busy. Let it finish, then start the walkthrough again.', 5000);
          return;
        }
        // The small panel is where the walkthrough's buttons are.
        more = false;
        saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), more });
        showTab(openTab);
        startOver(g, true);
      },
    );
    // The first time a newcomer lands the set, the set designer builds a first set by itself: the first of the
    // shots to try, asked of the real designer as if it had been said. The table comes alive before the panel has
    // been found, and the wearer has heard and seen what a sentence does before they are asked for one. Only for
    // someone who has not filled a board here before, with the starting set untouched and nothing of theirs on it.
    let firstSetOffered = false;
    let firstSetTimer: ReturnType<typeof setTimeout> | null = null;
    const untouched = (): boolean => {
      const on = g.trayOn.peek();
      return (
        g.setsBuilt.peek() === 0 &&
        g.shotFrames.peek().length === 0 &&
        g.takeState.peek() === 'idle' &&
        !g.designing.peek() &&
        on.length === STARTING_ASSETS.length &&
        STARTING_ASSETS.every((label) => on.includes(label))
      );
    };
    this.cleanupFuncs.push(
      () => {
        if (firstSetTimer != null) clearTimeout(firstSetTimer);
      },
      // Started over: the next landing is a first visitor's again, with the first of the shots to try.
      g.startOver.subscribe((n) => {
        if (n === 0) return;
        firstSetOffered = false;
        tryNext = 0;
        showTry();
      }),
      g.stageStatus.subscribe((status) => {
        if (firstSetOffered || (status !== StageStatus.Table && status !== StageStatus.Touch)) return;
        if (this.world.visibilityState.peek() === VisibilityState.NonImmersive || !g.firstSetOn.peek()) return;
        // One chance in a visit, whatever comes of it.
        firstSetOffered = true;
        const director = this.world.getSystem(DirectorSystem);
        if (director == null || !director.ready() || loadJson<{ done?: boolean }>(StoreKey.Coach)?.done === true || !untouched()) return;
        // Marked now, so the call sheet waits for it instead of asking for a sentence in the moment between.
        g.ownBuild.value = true;
        let waits = 0;
        const begin = (): void => {
          firstSetTimer = null;
          if (!untouched() || this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
            g.ownBuild.value = false;
            return;
          }
          // The pinch that landed the set may have closed on a piece as well: a set cannot change under a hand, so
          // the designer waits a few moments for it to open.
          if (this.queries.held.entities.size > 0 && waits++ < FIRST_SET_WAITS) {
            firstSetTimer = setTimeout(begin, FIRST_SET_WAIT_MS);
            return;
          }
          const sentence = tries[tryNext][1];
          tryNext = (tryNext + 1) % tries.length;
          showTry();
          void director.ask(sentence, [], true);
        };
        firstSetTimer = setTimeout(begin, FIRST_SET_MS);
      }),
    );
    // What the piece last touched can be given follows the wearer to every tab; the Assets tab shows it always.
    const showPieceBar = (): void => {
      panel.getElementById('held-block')?.setProperties({ display: (more && openTab === 'assets') || g.castLine.peek() !== '' ? 'flex' : 'none' });
    };
    const showTab = (tab: string): void => {
      openTab = tab;
      showPieceBar();
      panel.getElementById('tabs')?.setProperties({ display: more ? 'flex' : 'none' });
      showTry();
      panel.getElementById('btn-skip')?.setProperties({ display: g.walkthrough.peek() && !more && !g.lifeSize.peek() ? 'flex' : 'none' });
      panel.getElementById<UIKit.Text>('btn-more')?.setProperties({ text: more ? 'Less' : 'More', borderColor: more ? OPTIC_YELLOW : CHALK_HAZE });
      for (const name of TABS) {
        panel.getElementById(`page-${name}`)?.setProperties({ display: more && name === tab ? 'flex' : 'none' });
        panel.getElementById(`tab-${name}`)?.setProperties({
          backgroundColor: name === tab ? OPTIC_YELLOW : undefined,
          color: name === tab ? CLOTH : CHALK,
        });
      }
    };
    for (const name of TABS) wire(`tab-${name}`, () => showTab(name));
    wire('btn-more', () => {
      more = !more;
      saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), more });
      showTab(openTab);
    });
    showTab('shoot');

    // The full-size set, and the way back to the table.
    // Growing the whole set is not something to do by a stray pinch: it takes a second press.
    // The same switch is on the Stage tab and, as Step inside, on the small panel.
    const life = panel.getElementById<UIKit.Text>('btn-life');
    const inside = panel.getElementById<UIKit.Text>('btn-inside');
    let lifeArmed: ReturnType<typeof setTimeout> | null = null;
    const disarmLife = (): void => {
      if (lifeArmed != null) clearTimeout(lifeArmed);
      lifeArmed = null;
    };
    this.cleanupFuncs.push(disarmLife);
    let wentIn = -LIFE_DOUBLE_MS;
    let pressedGo = -LIFE_DOUBLE_MS;
    this.cleanupFuncs.push(
      g.lifeSize.subscribe(() => {
        wentIn = performance.now();
      }),
    );
    const pressLife = (): void => {
      // The walkthrough has just asked for this press, so one is enough; a stray pinch any other time still takes two.
      const askedFor = g.coachTarget.peek() === 'inside';
      // A second pinch straight after the one that went in (or came back) is the same press.
      if (performance.now() - wentIn < LIFE_DOUBLE_MS || performance.now() - pressedGo < LIFE_PINCH_MS) return;
      if (!g.lifeSize.peek() && lifeArmed == null && !askedFor) {
        life?.setProperties({ text: 'Press again to go full size', borderColor: OPTIC_YELLOW });
        inside?.setProperties({ text: 'Press again', borderColor: OPTIC_YELLOW });
        says('', 'Step inside grows the set to full size around you. Press again to go in.', LIFE_CONFIRM_MS);
        lifeArmed = setTimeout(() => {
          lifeArmed = null;
          if (g.lifeSize.peek()) return;
          life?.setProperties({ text: 'Stand in the shot', borderColor: CHALK_HAZE });
          inside?.setProperties({ text: 'Step inside', borderColor: CHALK_HAZE });
        }, LIFE_CONFIRM_MS);
        return;
      }
      disarmLife();
      pressedGo = performance.now();
      g.lifeSizeRequested.value = g.lifeSizeRequested.peek() + 1;
    };
    wire('btn-life', pressLife);
    wire('btn-inside', pressLife);
    // At full size the way back is the one big button, whichever tab is showing.
    wire('btn-back', () => {
      if (g.lifeSize.peek()) g.lifeSizeRequested.value = g.lifeSizeRequested.peek() + 1;
    });
    this.cleanupFuncs.push(
      g.lifeSize.subscribe((on) => {
        life?.setProperties({ text: on ? 'Back to the table' : 'Stand in the shot', borderColor: on ? OPTIC_YELLOW : CHALK_HAZE });
        inside?.setProperties({ text: on ? 'Back out' : 'Step inside', borderColor: on ? OPTIC_YELLOW : CHALK_HAZE });
        // A frame needs the slate under the actors, and the slate is back on the table.
        panel.getElementById('btn-snap')?.setProperties({ display: on ? 'none' : 'flex' });
        panel.getElementById('btn-back')?.setProperties({ display: on ? 'flex' : 'none' });
        panel.getElementById('btn-reset-stage')?.setProperties({ display: on ? 'none' : 'flex' });
        showTry();
      }),
      g.coverageRunning.subscribe(() => showTry()),
      g.shotFrames.subscribe(() => showTry()),
      this.world.visibilityState.subscribe(() => showTry()),
      g.setsBuilt.subscribe(() => showTry()),
      g.trayOn.subscribe(() => {
        showTry();
      }),
    );
    const squirm = panel.getElementById<UIKit.Text>('btn-squirm');
    wire('btn-squirm', () => {
      g.squirmOn.value = !g.squirmOn.peek();
    });
    // The designer's replies read aloud: her voice, his, or none. Pressed, it steps on and says so in the new voice.
    const spoken = panel.getElementById<UIKit.Text>('btn-spoken');
    const showSpoken = (): void => {
      const now = spokenChoice();
      spoken?.setProperties({ text: now === 'off' ? 'Replies: not spoken' : `Replies: ${now} voice`, borderColor: now === 'off' ? CHALK_HAZE : OPTIC_YELLOW });
    };
    showSpoken();
    wire('btn-spoken', () => {
      const next = SPOKEN[(SPOKEN.indexOf(spokenChoice()) + 1) % SPOKEN.length];
      chooseSpoken(next);
      showSpoken();
      if (next !== 'off') sayLine('voice');
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
      g.talkOffered.value = true;
      let voice: Voice | null = null;
      let busy = false;
      let cueOn: Entity | null = null;
      let cueOff: Entity | null = null;
      let heardOpen = false;
      const tell = (text: string, holdMs = 0, hint = false): void => says('', text, holdMs, hint);
      const WORDS: Record<VoiceState, string> = {
        idle: 'Talk',
        loading: 'Getting ready',
        listening: 'Listening',
        thinking: 'One moment',
        error: 'Talk',
      };
      // In a session the headset cannot ask for the microphone, so a wearer who never allowed it on the page has
      // none in here. The button says what it does then: Next shot, the next of the shots to try.
      let deaf = false;
      const resting = (): string => (deaf ? 'Next shot' : 'Talk');
      const hearing = (): void => {
        const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
        void micAnswer().then((answer) => {
          const now = inSession && (answer === 'prompt' || answer === 'denied');
          if (now === deaf) return;
          deaf = now;
          g.micOff.value = deaf;
          if (!busy && !g.designing.peek()) voiceButton.setProperties({ text: resting() });
        });
      };
      this.cleanupFuncs.push(this.world.visibilityState.subscribe(() => hearing()));
      // Keep listening: after each sentence the microphone opens again by itself, so a whole setup
      // can be said after one pinch. A quiet spell ends it, and so does the button.
      const keepButton = panel.getElementById<UIKit.Text>('btn-keep-listening');
      panel.getElementById('voice-field')?.setProperties({ display: 'flex' });
      let keep = loadJson<{ keep?: boolean }>(StoreKey.Settings)?.keep === true;
      let chained = false;
      let halted = false;
      let again: ReturnType<typeof setTimeout> | null = null;
      /** When the chain last began waiting to listen again. */
      let chainWaitFrom = 0;
      const showKeep = (): void => {
        keepButton?.setProperties({ text: keep ? 'Keep listening: on' : 'Keep listening: off', borderColor: keep ? OPTIC_YELLOW : CHALK_HAZE });
      };
      showKeep();
      // While the set designer works, Talk says so; the call sheet can light it when it wants a sentence.
      this.talkLight = (on) => {
        if (!busy) voiceButton.setProperties({ backgroundColor: on ? OPTIC_YELLOW : undefined, color: on ? CLOTH : CHALK });
      };
      this.cleanupFuncs.push(
        g.designing.subscribe((on) => {
          if (!busy) voiceButton.setProperties({ text: on ? 'Designing' : resting() });
        }),
      );
      wire('btn-keep-listening', () => {
        keep = !keep;
        saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), keep });
        showKeep();
      });
      // The first press fetches the listener (40 MB, once, kept on the headset) and says so while it comes: a
      // press that only warned was one more step between a newcomer and their first sentence.
      wire('btn-voice', () => {
        // Pressed between two sentences of a chain: that ends the chain.
        if (again != null) {
          clearTimeout(again);
          again = null;
          // In the short gap between two sentences the press ends the chain. Later, while the chain waits for the
          // designer to finish building and talking, it means "my turn now": the designer is hushed below and the
          // microphone opens at once.
          if (performance.now() - chainWaitFrom < 3 * RELISTEN_MS) {
            chained = false;
            tell('Listening stopped.', 4000);
            return;
          }
        }
        saveJson(StoreKey.Settings, { ...loadJson<Record<string, unknown>>(StoreKey.Settings), squirm: g.squirmOn.peek(), voice: true });
        // The wearer's turn to speak: the designer stops talking, and is not heard as part of the sentence.
        hush();
        // Two soft notes as the microphone opens and closes, so the wearer hears that it is listening.
        if (cueOn == null) {
          for (const [name, src] of [['ListenOn', './audio/listen-on.wav'], ['ListenOff', './audio/listen-off.wav']] as const) {
            const holder = new Object3D();
            holder.name = name;
            const entity = this.world.createTransformEntity(holder);
            entity.addComponent(AudioSource, { src, volume: 0.5, positional: false });
            if (name === 'ListenOn') cueOn = entity;
            else cueOff = entity;
          }
        }
        voice ??= new Voice({
          words: wordsToHear(),
          onState: (state, detail) => {
            if (state === 'listening' && !heardOpen && cueOn != null) AudioUtils.play(cueOn);
            if (state !== 'listening' && heardOpen && cueOff != null) AudioUtils.play(cueOff);
            heardOpen = state === 'listening';
            busy = state === 'loading' || state === 'listening' || state === 'thinking';
            // While the microphone is open the designer says nothing: it would be heard as part of the sentence.
            micOpen(state === 'loading' || state === 'listening');
            voiceButton.setProperties({
              text: state === 'idle' && g.designing.peek() ? 'Designing' : state === 'idle' || state === 'error' ? resting() : WORDS[state],
              backgroundColor: state === 'listening' ? OPTIC_YELLOW : undefined,
              color: state === 'listening' ? CLOTH : CHALK,
            });
            // What is said while the listener wakes is kept, so the wearer need not wait for it.
            if (state === 'loading' && !chained) tell('Say the shot now. I am listening.');
            if (state === 'listening') {
              // A hint: what came of the last sentence keeps its place until it has been read.
              tell(
                chained
                  ? 'Still listening. Say the next thing, or stay quiet to stop.'
                  : setStands()
                    ? 'Say what to change: add rain, make the dragon bigger. Or say a new shot.'
                    : 'Say the shot: a night chase, a man running from a car.',
                0,
                true,
              );
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
            tell(fraction < 1 ? `Fetching the listener, ${Math.round(fraction * 100)}%. This happens once.` : 'Say the shot now. I am listening.'),
          onText: (text, final) => {
            if (text !== '') says('', `Heard: ${clip(text)}`);
            if (!final) return;
            if (text === '') {
              tell(halted ? 'Listening stopped.' : chained ? 'Quiet, so the listening stopped. Press Talk to start again.' : 'Heard nothing. Press it and try again.', 6000);
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
            // The microphone opens again once the designer has built and said its piece: opened sooner, the
            // designer's own voice would be heard as the next sentence. A wait that long ends the chain.
            chainWaitFrom = performance.now();
            const relisten = (): void => {
              again = null;
              if (busy || this.world.visibilityState.peek() !== VisibilityState.Visible || performance.now() - chainWaitFrom > CHAIN_WAIT_MS) {
                chained = false;
                return;
              }
              // Settled: the set is up and its looks through the lens are done, each of which may speak.
              if (this.world.getSystem(DirectorSystem)?.settled() === false || talking()) {
                again = setTimeout(relisten, RELISTEN_MS);
                return;
              }
              void voice?.start(CHAIN_QUIET_MS);
            };
            again = setTimeout(relisten, RELISTEN_MS);
          },
        });
        halted = busy;
        if (busy) {
          voice.stop();
        } else {
          chained = false;
          // The headset cannot show the microphone's question in here, so a wearer who never answered it on the page
          // is told how to, and given the presets, instead of waiting on a listener that cannot start.
          const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
          void micAnswer().then((answer) => {
            if (inSession && (answer === 'prompt' || answer === 'denied')) {
              // The press is not wasted: it asks for the next shot to try, as if it had been said, and the voice
              // and the line under the set's reply say why. A hint, so the reply keeps its place first.
              deaf = true;
              g.micOff.value = true;
              if (g.designing.peek()) {
                tell('The set is still going up. Press again when it stands.', 3000);
                return;
              }
              const sentence = tries[tryNext][1];
              tryNext = (tryNext + 1) % tries.length;
              showTry();
              this.heard(sentence);
              sayLineOnce('nomic');
              tell(
                answer === 'denied'
                  ? 'No microphone for this page, so that was a shot to try. Allow it in the browser to say your own.'
                  : 'No microphone in here, so that was a shot to try. To say your own: leave, press Enter XR and allow it.',
                0,
                true,
              );
              return;
            }
            // With the set designer there, anything can be said, so the listener takes any words; without it,
            // only the library's words mean anything, and listening for just those hears them far better.
            voice?.listenFor(this.world.getSystem(DirectorSystem)?.available() === true ? undefined : wordsToHear());
            void voice?.start();
          });
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
    wire('btn-shelf-more', () => {
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
