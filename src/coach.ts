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
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Placement, Held, SetPiece, SetRole, ShotCamera, StageAnchor } from './set-components.js';
import { loadJson, saveJson, StoreKey } from './store.js';
import { BRIEFS } from './briefs.js';
import { TAKE_MAX_SECONDS, TakeState } from './take.js';
import { forgetSaid, hush, hushLine, sayLineOnce } from './speech.js';
import type { LineKey } from './spoken-lines.js';

const W = 1536;
const H = 300;
/** As wide as the monitor's bezel, sitting just above it. */
const SHEET_WIDTH = 0.344;
const SHEET_HEIGHT = (SHEET_WIDTH * H) / W;
const SHEET_Y = 0.102 + 0.01 + SHEET_HEIGHT / 2;
const BOARD_SLOTS = 6;
const SLATE = '#1b1411';
const CHALK = '#f6f7ef';
const CHALK_DUST = '#c7c7b7';
const OPTIC_YELLOW = '#d6e13c';
const STENCIL = '"Big Shoulders Stencil"';
const TEXT = '"Big Shoulders"';
/** Seconds the welcome and the finished board stay up before the sheet steps aside. */
const WELCOME_SECONDS = 7;
const DONE_SECONDS = 12;
/** Seconds the set may take to land by itself before the designer says how to land it. */
const LAND_SAID_AFTER = 2.5;

const Step = {
  Hidden: 0,
  Land: 1,
  Move: 2,
  Frame: 3,
  Snap: 4,
  Fill: 5,
  Done: 6,
  Welcome: 7,
  Say: 8,
} as const;
type StepId = (typeof Step)[keyof typeof Step];

type Globals = {
  shotFrames: Signal<unknown[]>;
  coachLine: Signal<string>;
  coachTarget: Signal<string>;
  takeState: Signal<string>;
  takeSeconds: Signal<number>;
  takeLength: Signal<number>;
  roomScanOffered: Signal<boolean>;
  coachNote: Signal<string>;
  noteSaid: Signal<string>;
  notesPosted: Signal<number>;
  briefIndex: Signal<number>;
  startOver: Signal<number>;
  setsBuilt: Signal<number>;
  talkOffered: Signal<boolean>;
  micOff: Signal<boolean>;
  ownBuild: Signal<boolean>;
  coverageRunning: Signal<boolean>;
  walkthrough: Signal<boolean>;
  walkthroughSkip: Signal<number>;
  lifeSize: Signal<boolean>;
};
/** Seconds a passing note stays on the sheet: long enough to read a reason and act on it. */
const NOTE_SECONDS = 6;
const NOTE_LONGEST = 12;
/** A step is done when the piece went somewhere: this far carried, or this far turned or tipped. A brush is neither. */
const CARRIED = 0.03;
const AIMED = 0.15;
/** A longer note takes longer to read: about nine letters a second, never under six seconds or over twelve. */
export const noteSeconds = (note: string): number => Math.min(NOTE_LONGEST, Math.max(NOTE_SECONDS, note.length / 9));
/** The thing each step asks the wearer to put a hand on; it is marked on the set while the step is up. */
const TARGET: Partial<Record<StepId, string>> = { [Step.Say]: 'talk', [Step.Move]: 'actor', [Step.Frame]: 'camera', [Step.Snap]: 'snap' };
type CoachState = { done: boolean };

export class CoachSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  held: { required: [SetPiece, Held] },
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
  /** A set has been asked for in words. */
  private said = false;
  /** The set standing is one the designer built by itself to show how it goes: the wearer's own is still to come. */
  private mine = false;
  /** The step and the frame count last said aloud, so each step's line is said as it comes up and once. */
  private voiced: StepId = Step.Hidden;
  private voicedShots = -1;
  /** The line of the step now up, when it should stop as soon as the step is done. */
  private voicedLine: LineKey | null = null;
  /** Seconds the sheet has asked for the set to be landed: a room that knows its table lands it by itself first. */
  private landAsked = 0;
  /**
   * The walkthrough is on: a newcomer is being shown the steps, each said aloud and pointed at (src/pointer.ts).
   * It ends when they skip it, when their second frame is on the board, or when they have stood in the set and
   * come back; from then on this browser is not shown it again unless it is started again.
   */
  private guiding = false;
  /** They have stepped inside during the walkthrough. */
  private stoodIn = false;
  /** Up to two pieces in two hands: where each stood, and how it was turned and tipped, when it was picked up. */
  private watched: (Entity | null)[] = [null, null];
  private watchedFrom = [new Vector3(), new Vector3()];
  private watchedTurn = [new Quaternion(), new Quaternion()];
  private watchedTilt = [0, 0];
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
  private scanOffered = false;
  private drawnScanOffered = false;
  private drawnMine = false;
  private drawnDeaf = false;
  /** A passing note ("BACK TO FRAME 3 | ...") and how long it has left. */
  private note = '';
  private noteLeft = 0;
  private drawnNote = '';
  private drawnBrief = -1;
  /** While a take records or plays, the sheet is its clock. */
  private take: string = TakeState.Idle;
  private takeSeconds = 0;
  private drawnTake: string = TakeState.Idle;
  private drawnTakeSeconds = -1;

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
      g.coachNote.subscribe((note) => {
        if (note === '') return;
        this.note = note;
        this.noteLeft = noteSeconds(note);
        g.coachNote.value = '';
        g.noteSaid.value = note;
        g.notesPosted.value = g.notesPosted.peek() + 1;
      }),
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
        const object = piece.object3D;
        if (object == null || role === SetRole.Stage) return;
        // A place for it among the two being watched; one whose piece is no longer in a hand is free.
        let slot = -1;
        for (let i = 0; i < this.watched.length && slot < 0; i++) {
          const other = this.watched[i];
          if (other == null || other === piece || !other.hasComponent(Held)) slot = i;
        }
        if (slot < 0) return;
        this.watched[slot] = piece;
        this.watchedFrom[slot].copy(object.position);
        this.watchedTurn[slot].copy(object.quaternion);
        this.watchedTilt[slot] = role === SetRole.Camera ? Number(piece.getValue(ShotCamera, 'tilt') ?? 0) : 0;
      }),
      // A step is ticked off when the piece is put down somewhere else, or the camera aimed somewhere else:
      // on the headset a camera brushed for a second took the sheet from step 2 to step 4.
      this.queries.held.subscribe('disqualify', (piece) => {
        const slot = this.watched[0] === piece ? 0 : this.watched[1] === piece ? 1 : -1;
        if (slot < 0) return;
        this.watched[slot] = null;
        const object = piece.object3D;
        if (object == null) return;
        const carried = object.position.distanceTo(this.watchedFrom[slot]) >= CARRIED;
        if (piece.getValue(SetPiece, 'role') !== SetRole.Camera) {
          if (carried) this.moved = true;
          return;
        }
        const tipped = Math.abs(Number(piece.getValue(ShotCamera, 'tilt') ?? 0) - this.watchedTilt[slot]);
        if (carried || object.quaternion.angleTo(this.watchedTurn[slot]) >= AIMED || tipped >= AIMED) this.framed = true;
      }),
      // Start over, on the page: the next person in the headset is shown every step.
      g.startOver.subscribe((n) => {
        if (n === 0) return;
        this.seasoned = false;
        this.moved = false;
        this.framed = false;
        this.said = false;
        this.mine = false;
        // The walkthrough from its first step, with every line to be said again.
        this.guiding = this.inSession;
        this.stoodIn = false;
        this.voiced = Step.Hidden;
        this.voicedShots = -1;
        forgetSaid();
      }),
      // Skip the walkthrough, on the panel: no more steps said or pointed at, here or on the next visit.
      g.walkthroughSkip.subscribe((n) => {
        if (n === 0 || !this.guiding) return;
        this.endWalkthrough();
        hush();
        g.coachNote.value = 'WALKTHROUGH OFF | Start it again from More, Stage.';
      }),
      // A set the designer built by itself, as the set landed, is not the wearer's sentence: the step stays theirs.
      g.setsBuilt.subscribe((n) => {
        if (n === 0) return;
        if (g.ownBuild.peek()) this.mine = true;
        else this.said = true;
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
    const g = this.globals as Globals;
    if (!this.inSession) {
      sheet.visible = false;
      if (this.drawnStep !== Step.Hidden) {
        this.drawnStep = Step.Hidden;
        g.coachLine.value = '';
        g.coachTarget.value = '';
      }
      return;
    }
    if (this.timing && this.shots < BOARD_SLOTS) this.boardSeconds += delta;
    this.advance(delta);
    // The walkthrough is done once a second frame is on the board, or they have stood in the set and come back.
    if (this.guiding) {
      if (g.lifeSize.peek() && this.shots >= 1) this.stoodIn = true;
      if (this.shots >= 2 || (this.stoodIn && !g.lifeSize.peek())) {
        this.endWalkthrough();
        sayLineOnce('done');
      }
    }
    if (g.walkthrough.peek() !== this.guiding) g.walkthrough.value = this.guiding;
    const xr = this.input.xr;
    this.controllers = xr.isPrimary('controller', 'left') || xr.isPrimary('controller', 'right');
    this.landAsked = this.step === Step.Land ? this.landAsked + delta : 0;
    this.sayStep();
    if (this.noteLeft > 0) {
      this.noteLeft -= delta;
      if (this.noteLeft <= 0) this.note = '';
    }
    this.take = g.takeState.peek();
    this.takeSeconds = g.takeSeconds.peek();
    this.scanOffered = g.roomScanOffered.peek();
    const onTake = this.take !== TakeState.Idle;
    // With their first frame on the board, the next thing to try is standing in it.
    const inside = this.guiding && this.step === Step.Fill && this.shots === 1 && !g.coverageRunning.peek();
    const target = onTake ? '' : inside ? 'inside' : (TARGET[this.step] ?? '');
    if (g.coachTarget.peek() !== target) g.coachTarget.value = target;
    sheet.visible = this.step !== Step.Hidden || onTake || this.note !== '';
    if (!sheet.visible) {
      // Nothing is being said: the words kept for the panel and the tests say so too, and the next showing draws afresh.
      if (g.coachLine.peek() !== '') {
        g.coachLine.value = '';
        this.drawnStep = Step.Hidden;
        this.drawnNote = '';
        this.drawnTake = TakeState.Idle;
      }
      return;
    }
    if (!this.fontsReady) return;
    if (
      this.step !== this.drawnStep ||
      this.shots !== this.drawnShots ||
      this.restored !== this.drawnRestored ||
      this.controllers !== this.drawnControllers ||
      this.scanOffered !== this.drawnScanOffered ||
      this.mine !== this.drawnMine ||
      g.micOff.peek() !== this.drawnDeaf ||
      this.note !== this.drawnNote ||
      g.briefIndex.peek() !== this.drawnBrief ||
      this.take !== this.drawnTake ||
      (onTake && this.takeSeconds !== this.drawnTakeSeconds)
    ) {
      this.drawnStep = this.step;
      this.drawnShots = this.shots;
      this.drawnRestored = this.restored;
      this.drawnControllers = this.controllers;
      this.drawnScanOffered = this.scanOffered;
      this.drawnMine = this.mine;
      this.drawnDeaf = g.micOff.peek();
      this.drawnNote = this.note;
      this.drawnBrief = g.briefIndex.peek();
      this.drawnTake = this.take;
      this.drawnTakeSeconds = this.takeSeconds;
      this.draw();
    }
  }

  /** The walkthrough ends, for this visit and the next: skipped, or done. */
  private endWalkthrough(): void {
    this.guiding = false;
    if (this.seasoned) return;
    this.seasoned = true;
    saveJson(StoreKey.Coach, { done: true } satisfies CoachState);
  }

  private onVisibility(state: VisibilityState): void {
    const entering = !this.inSession && state !== VisibilityState.NonImmersive;
    this.inSession = state !== VisibilityState.NonImmersive;
    if (!this.inSession) {
      this.guiding = false;
      const g = this.globals as Globals;
      if (g.walkthrough.peek()) g.walkthrough.value = false;
    }
    if (!entering) return;
    // A newcomer is walked through; someone who has been through it, or skipped it, is not.
    this.guiding = !this.seasoned;
    this.stoodIn = false;
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

  /**
   * The step's line, said aloud by the set designer as the step comes up: once each in a visit, for a newcomer
   * using their hands (the recorded lines say pinch). Someone who has filled a board before hears only the welcome.
   */
  private sayStep(): void {
    if (this.step === this.voiced && this.shots === this.voicedShots) return;
    const g = this.globals as Globals;
    // The step whose line was last said is behind the wearer now: its line is not said over what they do next.
    if (this.step !== this.voiced && this.voicedLine != null) {
      hushLine(this.voicedLine);
      this.voicedLine = null;
    }
    // The designer is building a first set by itself: what to do next is said once it has spoken about that.
    if (this.step === Step.Say && g.ownBuild.peek()) return;
    // Where the headset knows the room, the set finds the table by itself in the first moments: the wearer is
    // only told to land it once it is clear they will have to.
    if (this.step === Step.Land && this.landAsked < LAND_SAID_AFTER) return;
    // The set takes a moment to come back to its anchor: the welcome waits to see that it has.
    if (this.step === Step.Welcome && !this.restored) return;
    this.voiced = this.step;
    this.voicedShots = this.shots;
    if (this.controllers) return;
    if (this.step === Step.Welcome) {
      if (this.restored) sayLineOnce('back');
      return;
    }
    if (!this.guiding && this.step !== Step.Done) return;
    const deaf = g.micOff.peek();
    let line: LineKey | null = null;
    if (this.step === Step.Land) line = 'land';
    else if (this.step === Step.Say && !deaf) line = this.mine ? 'mine' : 'say';
    else if (this.step === Step.Move && this.said && !deaf) line = 'block';
    else if (this.step === Step.Fill && this.shots === 1 && !g.coverageRunning.peek()) line = 'frame';
    else if (this.step === Step.Done) line = 'full';
    if (line == null) return;
    sayLineOnce(line);
    // Landing and saying the shot are over the moment they are done; the later lines are advice and are let finish.
    this.voicedLine = line === 'land' || line === 'say' || line === 'mine' ? line : null;
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
    // A floating set is somewhere to work too: once a piece has been picked
    // up, the sheet stops asking for a table.
    if (floating && !this.moved && !this.framed && !this.said && this.shots === 0) {
      this.step = Step.Land;
      return;
    }
    if (this.shots >= BOARD_SLOTS) {
      this.step = Step.Done;
      this.hold = DONE_SECONDS;
      this.doneSeconds = this.timing ? this.boardSeconds : 0;
      this.timing = false;
      this.endWalkthrough();
      return;
    }
    if (this.shots > 0) this.step = Step.Fill;
    else if (this.seasoned && !this.guiding) this.step = Step.Snap;
    // Say the shot, move what is not right by hand, snap. The set designer frames the camera, so framing it by
    // hand is no longer a step of its own; without a voice, the steps are the old ones.
    else if (!this.said && (this.globals as Globals).talkOffered.peek()) this.step = Step.Say;
    else if (!this.moved) this.step = Step.Move;
    else if (!this.framed && !this.said) this.step = Step.Frame;
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
    if (this.note !== '') {
      const [label, line] = this.note.split(' | ');
      return [label ?? '', line ?? ''];
    }
    const length = Math.round((this.globals as Globals).takeLength.peek());
    if (this.take === TakeState.Recording) {
      // The first pass sets the length; later passes run to it.
      return length > 0
        ? [`RECORDING · ${this.takeSeconds} S OF ${length} S`, 'The take plays. Carry another piece to add its move.']
        : [
            `RECORDING · ${this.takeSeconds} S OF ${TAKE_MAX_SECONDS} S`,
            'Move the actors and the camera. Stop when the move is done.',
          ];
    }
    if (this.take === TakeState.Playing) {
      return [`TAKE · ${this.takeSeconds} S OF ${length} S`, 'On the monitor. Pick up a piece to stop it.'];
    }
    switch (this.step) {
      case Step.Land:
        return [
          '1 OF 4 · LAND THE SET',
          this.controllers ? 'Rest a controller on your table and pull the trigger.' : 'Point at a table or the floor and pinch.',
        ];
      case Step.Say: {
        // No microphone in here (it was never allowed on the page): Talk is Next shot.
        if ((this.globals as Globals).micOff.peek()) {
          return ['2 OF 4 · PICK A SHOT', 'Pinch Next shot and a set goes up. To say your own, allow the microphone on the page.'];
        }
        const press = this.controllers ? 'Pull the trigger on' : 'Pinch';
        // The designer built the set standing by itself, to show how it goes.
        if (this.mine) return ['2 OF 4 · SAY YOUR SHOT', `That one was mine. ${press} Talk, on the panel to the left, and say yours.`];
        return ['2 OF 4 · SAY THE SHOT', `${press} Talk, on the panel to the left, and say the shot. Or ${this.controllers ? 'pull it on' : 'pinch'} Try a shot.`];
      }
      case Step.Move:
        return this.said
          ? [
              '3 OF 4 · BLOCK IT',
              (this.globals as Globals).micOff.peek()
                ? 'Pinch any piece and move it. Next shot builds another set.'
                : this.controllers
                  ? 'Hold the trigger on any piece and move it, or press Talk and say what to change.'
                  : 'Pinch any piece and move it, or press Talk and say what to change.',
            ]
          : [
              '2 OF 4 · BLOCK IT',
              this.controllers
                ? 'Hold the trigger on an actor and move it. Turn your wrist to turn it.'
                : 'Reach in, pinch an actor and move it. Turn your wrist to turn it.',
            ];
      case Step.Frame:
        return [
          '3 OF 4 · FRAME IT',
          this.controllers
            ? 'Hold the trigger on the camera. Turn and tip your wrist to aim it.'
            : 'Pick up the camera. Turn and tip your wrist to aim it.',
        ];
      case Step.Snap:
        return [
          '4 OF 4 · SNAP',
          this.controllers
            ? 'Pull the trigger on Snap frame, or on Shoot coverage and the designer shoots the board.'
            : 'Pinch Snap frame, or Shoot coverage and the designer shoots the board.',
        ];
      case Step.Fill:
        return this.fillLine();
      case Step.Done: {
        const s = Math.round(this.doneSeconds);
        const took = s > 0 ? ` in ${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : '';
        return ['BOARD FULL', `Six frames${took}. Pinch Save the board on the panel: the board and the take wait on the page.`];
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

  /** After the first frame the sheet is the shot list: what the director wants next. */
  private fillLine(): [string, string] {
    const brief = BRIEFS[(this.globals as Globals).briefIndex.peek()];
    // The first frame is the moment to stand in it: the set grows around the wearer, in its own light.
    if ((this.globals as Globals).lifeSize.peek()) return ['INSIDE THE SET', 'Look at the floor and pinch to walk. Back to camera stands you at the lens. Back to the table leaves.'];
    if (this.shots === 1) return [`FRAME ${this.shots} OF ${BOARD_SLOTS}`, 'Now stand in it: pinch Step inside, or say "step inside", and the set grows around you.'];
    if (this.shots === 2) return [`FRAME ${this.shots} OF ${BOARD_SLOTS}`, 'Pinch a frame on the board to go back to its setup.'];
    if (this.said || this.mine) return [`FRAME ${this.shots} OF ${BOARD_SLOTS}`, 'Snap again, or pinch Shoot coverage and the designer shoots the rest.'];
    if (brief == null) return [`FRAME ${this.shots} OF ${BOARD_SLOTS}`, 'Every shot is printed. Shoot what you like.'];
    return [`NEXT: ${brief.title.toUpperCase()}`, brief.ask];
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
    // A passing note is news, so its label is as bright as its words.
    ctx.fillStyle = this.note !== '' ? CHALK : CHALK_DUST;
    ctx.font = `700 58px ${STENCIL}`;
    ctx.fillText(label, 60, 96);
    const room = W - 110;
    // Text widens with its size, so one measurement at the largest size finds the size that fits, kept on the
    // same 4 px steps so the browser's font caches are reused. Trying each size in turn cost up to 16 ms of one
    // frame in the emulator as a set was built, most of it in measuring at sizes not used before.
    const fit = (texts: string[], most: number, least: number): number => {
      ctx.font = `700 ${most}px ${TEXT}`;
      let width = 0;
      for (const text of texts) width = Math.max(width, ctx.measureText(text).width);
      if (width <= room) return most;
      let size = Math.max(least, Math.floor((most * room) / width / 4) * 4);
      ctx.font = `700 ${size}px ${TEXT}`;
      // Widths do not scale quite evenly with size: a step smaller at a time until it fits, as before.
      let wide = 0;
      for (const text of texts) wide = Math.max(wide, ctx.measureText(text).width);
      while (wide > room && size > least) {
        size -= 4;
        ctx.font = `700 ${size}px ${TEXT}`;
        wide = 0;
        for (const text of texts) wide = Math.max(wide, ctx.measureText(text).width);
      }
      return size;
    };
    let px = fit([line], 112, 52);
    ctx.fillStyle = CHALK;
    if (ctx.measureText(line).width <= room) {
      ctx.fillText(line, 60, 232);
    } else {
      // Too long for one line at its smallest: two lines, broken at the space nearest the middle.
      const middle = line.length >> 1;
      let at = middle;
      for (let i = 0; i < middle; i++) {
        if (line[middle - i] === ' ') {
          at = middle - i;
          break;
        }
        if (line[middle + i] === ' ') {
          at = middle + i;
          break;
        }
      }
      const first = line.slice(0, at);
      const second = line.slice(at + 1);
      px = fit([first, second], 84, 44);
      const top = 112 + px * 0.8;
      ctx.fillText(first, 60, top);
      ctx.fillText(second, 60, top + px * 1.08);
    }
    this.texture.needsUpdate = true;
  }
}
