/**
 * The call sheet: one line above the monitor that says what to do next, in the
 * headset only. It moves on when the thing it asked for has happened (the set
 * landed, a piece was moved, the camera was aimed, a frame was taken), never on
 * a timer, and it goes away once the board is full. Someone who has been
 * through it before only sees the count of frames.
 */
import {
  CanvasTexture,
  createSystem,
  Entity,
  Grabbed,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Placement, SetPiece, SetRole, StageAnchor } from './set-components.js';
import { loadJson, saveJson, StoreKey } from './store.js';

const W = 1536;
const H = 300;
/** As wide as the monitor's bezel, sitting just above it. */
const SHEET_WIDTH = 0.344;
const SHEET_HEIGHT = (SHEET_WIDTH * H) / W;
const SHEET_Y = 0.102 + 0.01 + SHEET_HEIGHT / 2;
const BOARD_SLOTS = 6;
const SLATE = '#3f4044';
const CHALK = '#f6f7ef';
const CHALK_DUST = '#c7c7b7';
const OPTIC_YELLOW = '#d6e13c';
const STENCIL = '"Big Shoulders Stencil"';
const TEXT = '"Big Shoulders"';
/** Seconds the welcome and the finished board stay up before the sheet steps aside. */
const WELCOME_SECONDS = 7;
const DONE_SECONDS = 12;

const Step = {
  Hidden: 0,
  Land: 1,
  Move: 2,
  Frame: 3,
  Snap: 4,
  Fill: 5,
  Done: 6,
  Welcome: 7,
} as const;
type StepId = (typeof Step)[keyof typeof Step];

type Globals = { shotFrames: Signal<unknown[]>; coachLine: Signal<string> };
type CoachState = { done: boolean };

export class CoachSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  held: { required: [SetPiece, Grabbed] },
}) {
  private canvas!: HTMLCanvasElement;
  private texture!: CanvasTexture;
  private sheet: Mesh | null = null;
  private step: StepId = Step.Hidden;
  private drawnStep: StepId = Step.Hidden;
  private drawnShots = -1;
  private drawnRestored = false;
  /** The set came back to the pose it was left in, not to a fresh landing. */
  private restored = false;
  private fontsReady = false;
  /** This browser has been through the steps before. */
  private seasoned = false;
  private moved = false;
  private framed = false;
  private cameraHeld = false;
  private shots = 0;
  private hold = 0;
  /** Seconds in the session since the board was last empty; the time a full board took. */
  private boardSeconds = 0;
  private timing = false;
  private doneSeconds = 0;
  private inSession = false;
  /** The wearer is holding controllers, so the words say trigger where they would say pinch. */
  private controllers = false;
  private drawnControllers = false;

  init(): void {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.seasoned = loadJson<CoachState>(StoreKey.Coach)?.done === true;
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => this.onVisibility(state)),
      g.shotFrames.subscribe((frames) => {
        const before = this.shots;
        this.shots = frames.length;
        if (this.shots === 0 && before > 0) {
          // A new board: the clock starts again with it.
          this.boardSeconds = 0;
          this.timing = this.inSession;
        }
      }),
      this.queries.held.subscribe('qualify', (piece) => {
        const role = piece.getValue(SetPiece, 'role');
        if (role === SetRole.Actor || role === SetRole.Creature) this.moved = true;
        if (role === SetRole.Camera) this.cameraHeld = true;
      }),
      this.queries.held.subscribe('disqualify', (piece) => {
        if (piece.getValue(SetPiece, 'role') === SetRole.Camera && this.cameraHeld) {
          this.cameraHeld = false;
          this.framed = true;
        }
      }),
      () => this.texture.dispose(),
    );
    void document.fonts
      .load(`700 56px ${STENCIL}`)
      .then(() => document.fonts.load(`700 80px ${TEXT}`))
      .finally(() => {
        this.fontsReady = true;
        this.drawnStep = Step.Hidden;
      });
  }

  update(delta: number): void {
    if (!this.ensureSheet()) return;
    const sheet = this.sheet!;
    if (!this.inSession) {
      sheet.visible = false;
      if (this.drawnStep !== Step.Hidden) {
        this.drawnStep = Step.Hidden;
        (this.globals as Globals).coachLine.value = '';
      }
      return;
    }
    if (this.timing && this.shots < BOARD_SLOTS) this.boardSeconds += delta;
    this.advance(delta);
    sheet.visible = this.step !== Step.Hidden;
    if (!sheet.visible || !this.fontsReady) return;
    const xr = this.input.xr;
    this.controllers = xr.isPrimary('controller', 'left') || xr.isPrimary('controller', 'right');
    if (
      this.step !== this.drawnStep ||
      this.shots !== this.drawnShots ||
      this.restored !== this.drawnRestored ||
      this.controllers !== this.drawnControllers
    ) {
      this.drawnStep = this.step;
      this.drawnShots = this.shots;
      this.drawnRestored = this.restored;
      this.drawnControllers = this.controllers;
      this.draw();
    }
  }

  private onVisibility(state: VisibilityState): void {
    const entering = !this.inSession && state !== VisibilityState.NonImmersive;
    this.inSession = state !== VisibilityState.NonImmersive;
    if (!entering) return;
    // The clock for "headset on to a full board" runs only from an empty board.
    this.timing = this.shots === 0;
    this.boardSeconds = 0;
    this.doneSeconds = 0;
    if (this.shots > 0) {
      this.step = Step.Welcome;
      this.hold = WELCOME_SECONDS;
    } else {
      this.step = Step.Land;
    }
  }

  /** Each step ends on the event it asked for; the order never goes backwards except to land the set again. */
  private advance(delta: number): void {
    const stage = this.queries.stages.entities.values().next().value as Entity | undefined;
    const placement = stage?.getValue(StageAnchor, 'placement');
    const floating = placement === Placement.Floating;
    this.restored = placement === Placement.Restored;
    if (this.step === Step.Welcome) {
      this.hold -= delta;
      if (this.hold > 0) return;
      this.step = Step.Fill;
    }
    if (this.step === Step.Done) {
      this.hold -= delta;
      if (this.hold <= 0) this.step = Step.Hidden;
      if (this.shots < BOARD_SLOTS) this.step = Step.Fill;
      return;
    }
    if (this.step === Step.Hidden) {
      if (this.shots < BOARD_SLOTS && this.shots > 0) this.step = Step.Fill;
      else if (this.shots === 0) this.step = Step.Land;
      else return;
    }
    if (floating) {
      this.step = Step.Land;
      return;
    }
    if (this.shots >= BOARD_SLOTS) {
      this.step = Step.Done;
      this.hold = DONE_SECONDS;
      this.doneSeconds = this.timing ? this.boardSeconds : 0;
      this.timing = false;
      if (!this.seasoned) {
        this.seasoned = true;
        saveJson(StoreKey.Coach, { done: true } satisfies CoachState);
      }
      return;
    }
    if (this.shots > 0) this.step = Step.Fill;
    else if (this.seasoned) this.step = Step.Snap;
    else if (!this.moved) this.step = Step.Move;
    else if (!this.framed) this.step = Step.Frame;
    else this.step = Step.Snap;
  }

  /** The sheet rides the monitor, so it travels with the set and stays out of the shot. */
  private ensureSheet(): boolean {
    if (this.sheet != null) return true;
    const stage = this.queries.stages.entities.values().next().value as Entity | undefined;
    const monitor = stage?.object3D?.getObjectByName('Viewfinder');
    if (monitor == null) return false;
    const sheet = new Mesh(
      new PlaneGeometry(SHEET_WIDTH, SHEET_HEIGHT),
      new MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    sheet.name = 'CallSheet';
    sheet.position.set(0, SHEET_Y, 0);
    sheet.visible = false;
    // The sheet is a sign, not a target: a pinch aimed past it must reach the set.
    sheet.raycast = () => {};
    monitor.add(sheet);
    this.sheet = sheet;
    return true;
  }

  private copy(): [string, string] {
    switch (this.step) {
      case Step.Land:
        return [
          '1 OF 4 · LAND THE SET',
          this.controllers ? 'Rest a controller on your table and pull the trigger.' : 'Touch your table and pinch.',
        ];
      case Step.Move:
        return [
          '2 OF 4 · BLOCK IT',
          this.controllers
            ? 'Hold the trigger on an actor and move it. Turn your wrist to turn it.'
            : 'Pinch an actor and move it. Turn your wrist to turn it.',
        ];
      case Step.Frame:
        return [
          '3 OF 4 · FRAME IT',
          this.controllers
            ? 'Hold the trigger on the camera. Turn your wrist to aim it.'
            : 'Pinch the camera. Turn your wrist to aim it.',
        ];
      case Step.Snap:
        return [
          '4 OF 4 · SNAP',
          this.controllers
            ? 'Pull the trigger on Snap frame, on the panel to your left.'
            : 'Pinch Snap frame, on the panel to your left.',
        ];
      case Step.Fill:
        return [
          `FRAME ${this.shots} OF ${BOARD_SLOTS}`,
          this.shots === BOARD_SLOTS - 1 ? 'One more: move the camera and snap.' : 'Move the camera or change the lens, and snap again.',
        ];
      case Step.Done: {
        const s = Math.round(this.doneSeconds);
        const took = s > 0 ? ` in ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : '';
        return ['BOARD FULL', `Six frames${took}. Saved for your next visit.`];
      }
      case Step.Welcome:
        // Only say the set is where it was left when it is.
        return [
          'WELCOME BACK',
          this.restored
            ? `Your set and ${this.shots} frame${this.shots === 1 ? '' : 's'} are where you left them.`
            : `Your board has ${this.shots} frame${this.shots === 1 ? '' : 's'} on it. Carry on.`,
        ];
      default:
        return ['', ''];
    }
  }

  private draw(): void {
    const ctx = this.canvas.getContext('2d');
    if (ctx == null) return;
    const [label, line] = this.copy();
    // The same words as state, so a test can read the sheet without reading pixels.
    (this.globals as Globals).coachLine.value = `${label} | ${line}`;
    ctx.fillStyle = SLATE;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = OPTIC_YELLOW;
    ctx.fillRect(0, 0, 18, H);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = CHALK_DUST;
    ctx.font = `700 58px ${STENCIL}`;
    ctx.fillText(label, 60, 96);
    let px = 112;
    ctx.font = `700 ${px}px ${TEXT}`;
    while (px > 52 && ctx.measureText(line).width > W - 110) {
      px -= 4;
      ctx.font = `700 ${px}px ${TEXT}`;
    }
    ctx.fillStyle = CHALK;
    ctx.fillText(line, 60, 232);
    this.texture.needsUpdate = true;
  }
}
