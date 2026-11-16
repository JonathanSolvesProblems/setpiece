/**
 * Cover it: the set designer plans the shots that cover the set as it stands (src/coverage-plan.ts), and the app
 * shoots them by itself, one after another. On the table each shot moves the camera, lets the monitor settle, and
 * snaps the frame onto the board, until the board is full. Stepped inside, it cuts the wearer from camera to camera
 * instead, standing them in each shot (a frame is only snapped at the table). It stops when asked (say stop, or
 * pinch Stop coverage), when a piece is picked up, when something new is asked of the designer, or when the session
 * ends, and keeps what it has shot.
 */
import { sayLine, speak } from './speech.js';
import { designerHeaders } from './own-key.js';
import { createSystem, VisibilityState } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import type { CameraPlan } from './director-plan.js';
import { DirectorSystem } from './director.js';
import { LifeSizeSystem } from './life-size.js';
import { Held, SetPiece } from './set-components.js';
import { coverageShots, shotCall } from './coverage-plan.js';

const ENDPOINT = '/api/director';
const BOARD_SLOTS = 6;
/** Seconds the camera is given to stand and the monitor to show the shot before it is snapped. */
const SETTLE = 1.8;
/** Seconds the camera takes to glide to each shot's mark on the table, inside SETTLE. */
const GLIDE = 0.9;
/** Seconds the frame is left to be seen before the next shot. */
const HOLD = 1.4;
/** Seconds each shot is stood in, stepped inside, before the cut to the next. */
const INSIDE_HOLD = 4;
/** The longest the designer is waited for. */
const WAIT_MS = 30000;
/** The longest a set still being built and looked at is waited for before coverage gives up. */
const SETTLE_WAIT = 25;
/** The longest a snapped frame is waited for on the board. */
const FRAME_WAIT = 4;
/** What the sheet says while the designer plans the shots, and how often it is put back up while it waits. */
const PLANNING_NOTE = 'PLANNING COVERAGE | The set designer is choosing the shots.';
const PLANNING_REPEAT_MS = 5000;

type Globals = {
  coachNote: Signal<string>;
  snapRequested: Signal<number>;
  shotFrames: Signal<unknown[]>;
  trayOn: Signal<string[]>;
  lifeSize: Signal<boolean>;
  lastSpoken: Signal<string>;
  designing: Signal<boolean>;
  coverageRunning: Signal<boolean>;
  takeState: Signal<string>;
  coverageRequested: Signal<number>;
  coverageStopRequested: Signal<number>;
  setupRecalled: Signal<number>;
  resetStageRequested: Signal<number>;
  shotTitle: Signal<string>;
};

type Shot = { title: string; says: string; camera: CameraPlan };

export class CoverageSystem extends createSystem({
  held: { required: [SetPiece, Held] },
}) {
  private stopAsked = false;
  /** The server's passes for this coverage's shot calls, in order. */
  private passes: string[] = [];
  private asking: AbortController | null = null;
  /** The visibility coverage started in: a session ending or blurred stops it. */
  private startedIn: string = VisibilityState.NonImmersive;

  init(): void {
    const g = this.globals as unknown as Globals;
    let asked = g.coverageRequested.peek();
    let stopped = g.coverageStopRequested.peek();
    this.cleanupFuncs.push(
      // The panel's Shoot coverage and Stop coverage.
      g.coverageRequested.subscribe((n) => {
        if (n <= asked) return;
        asked = n;
        g.coachNote.value = this.cover();
      }),
      g.coverageStopRequested.subscribe((n) => {
        if (n <= stopped) return;
        stopped = n;
        this.stop();
      }),
      this.queries.held.subscribe('qualify', () => {
        if (this.running()) this.stop();
      }),
      // A frame pinched on the board, an undo, or the set sent to be landed again: the set is no longer the one
      // being covered, so the coverage ends rather than shoot over it.
      g.setupRecalled.subscribe(() => {
        if (this.running()) this.stop();
      }),
      g.resetStageRequested.subscribe(() => {
        if (this.running()) this.stop();
      }),
      () => this.asking?.abort(),
    );
  }

  /** Whether coverage is being shot now. */
  running(): boolean {
    return (this.globals as unknown as Globals).coverageRunning.peek();
  }

  /** Stops the coverage after the shot in hand; what is on the board stays. */
  stop(): void {
    this.stopAsked = true;
    this.asking?.abort();
  }

  /** Starts coverage of the set as it stands, and returns the line for the call sheet. */
  cover(): string {
    const g = this.globals as unknown as Globals;
    const director = this.world.getSystem(DirectorSystem);
    if (this.running()) return 'ALREADY COVERING | Say stop, or pinch Stop coverage, to end it.';
    if (director == null || !director.available()) return 'COVERAGE NEEDS THE SET DESIGNER | It is not taking requests right now.';
    if (g.trayOn.peek().length === 0) return 'NOTHING TO COVER | Say the shot first, and the set goes up.';
    if (g.takeState.peek() !== 'idle') return 'A TAKE IS RUNNING | Stop the take, then say cover it.';
    if (this.queries.held.entities.size > 0) return 'PUT IT DOWN FIRST | Let go of the piece, then say cover it.';
    const life = g.lifeSize.peek();
    if (!life && g.shotFrames.peek().length >= BOARD_SLOTS) return 'THE BOARD IS FULL | Pinch New board, then say cover it again.';
    void this.run(director);
    return PLANNING_NOTE;
  }

  private async run(director: DirectorSystem): Promise<void> {
    const g = this.globals as unknown as Globals;
    this.stopAsked = false;
    this.startedIn = String(this.world.visibilityState.peek());
    g.coverageRunning.value = true;
    let shot = 0;
    let done = 0;
    let shots: Shot[] = [];
    try {
      // The wait for a set to finish and then for the plan, which arrives whole, takes some seconds: the designer
      // says it is planning, and the note is put back up while it does, so the wait is never a silent sheet back
      // on its last step.
      sayLine('cover');
      const planning = window.setInterval(() => {
        if (!this.stopAsked) g.coachNote.value = PLANNING_NOTE;
      }, PLANNING_REPEAT_MS);
      try {
        // A set still being built, framed or looked at is let finish: its own camera would fight the coverage's.
        const waitedFrom = performance.now();
        while (!director.settled() && !this.stopAsked && performance.now() - waitedFrom < SETTLE_WAIT * 1000) {
          await new Promise((ready) => window.setTimeout(ready, 150));
        }
        if (this.stopAsked || !director.settled()) {
          if (!this.stopAsked) g.coachNote.value = 'STILL BUILDING | Say cover it again once the set is up.';
          return;
        }
        shots = await this.plan(director, g.lastSpoken.peek() || 'cover the scene');
      } finally {
        window.clearInterval(planning);
      }
      if (shots.length === 0) {
        if (!this.stopAsked) g.coachNote.value = 'NO COVERAGE | The set designer did not plan any shots. Say cover it again.';
        return;
      }
      for (; shot < shots.length && this.going(); shot++) {
        const life = g.lifeSize.peek();
        // On the table, as many shots as the board has room for.
        if (!life && g.shotFrames.peek().length >= BOARD_SLOTS) break;
        const { title, says, camera } = shots[shot];
        g.coachNote.value = `SHOT ${shot + 1} OF ${shots.length}: ${title.toUpperCase()} | ${says}`;
        // Called as a first assistant director would, while the camera goes to it.
        speak(shotCall(shot, title), this.passes[shot] ?? '');
        // A camera that could not move is no new shot: nothing is snapped for it. On the table it glides to its
        // mark and the monitor plays the move; inside, the wearer is cut to it.
        if (!director.frameShot(camera, life ? 0 : GLIDE)) continue;
        if (life) {
          this.world.getSystem(LifeSizeSystem)?.cutToCamera();
          if (!(await this.wait(INSIDE_HOLD))) break;
          done++;
          continue;
        }
        if (!(await this.wait(SETTLE))) break;
        // Stepped inside meanwhile: a frame is only snapped at the table.
        if (g.lifeSize.peek()) continue;
        const before = g.shotFrames.peek().length;
        // The frame carries the shot's name onto the board.
        g.shotTitle.value = title;
        g.snapRequested.value = g.snapRequested.peek() + 1;
        // Counted once it is on the board.
        const until = performance.now() + FRAME_WAIT * 1000;
        while (g.shotFrames.peek().length === before && performance.now() < until && this.going()) await new Promise((ready) => window.setTimeout(ready, 100));
        g.shotTitle.value = '';
        if (g.shotFrames.peek().length > before) done++;
        if (!(await this.wait(HOLD))) break;
      }
    } catch {
      if (!this.stopAsked) g.coachNote.value = 'NO COVERAGE | The set designer could not be reached. Say cover it again.';
      return;
    } finally {
      g.coverageRunning.value = false;
      g.shotTitle.value = '';
      this.asking = null;
    }
    const inside = g.lifeSize.peek();
    if (this.stopAsked) {
      g.coachNote.value = inside ? `COVERAGE STOPPED | ${done} of ${shots.length} shots stood in.` : `COVERAGE STOPPED | ${done} of ${shots.length} shots are on the board.`;
    } else if (shots.length > 0) {
      g.coachNote.value = inside
        ? `COVERAGE DONE | ${done} shots stood in. Step out and say cover it to put them on the board.`
        : `COVERAGE DONE | ${done} frames on the board. Pinch one to go back to its setup.`;
    }
  }

  /** The designer's shots for the set as it stands. */
  private async plan(director: DirectorSystem, said: string): Promise<Shot[]> {
    const asking = new AbortController();
    this.asking = asking;
    this.passes = [];
    const timer = window.setTimeout(() => asking.abort(), WAIT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: designerHeaders(),
        body: JSON.stringify({ said, heard: [], set: director.describe(), coverage: true }),
        signal: asking.signal,
      });
      const text = await response.text();
      let whole = '';
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue;
        const event = JSON.parse(line) as { t: string; s?: string; shots?: unknown };
        if (event.t === 'd' && event.s != null) whole += event.s;
        // The server's passes for the shot calls, one for each shot in order: the voice reads a call only with its pass.
        if (event.t === 'v' && Array.isArray(event.shots)) this.passes = event.shots.map((pass) => (typeof pass === 'string' ? pass : ''));
        if (event.t === 'error') {
          director.noteRefusal(String((event as { m?: unknown }).m ?? ''));
          throw new Error('refused');
        }
      }
      return coverageShots(JSON.parse(whole));
    } finally {
      window.clearTimeout(timer);
    }
  }

  /**
   * Whether coverage may go on: not stopped, nothing new asked of the designer, and the session as it was when it
   * started (a session ending, or the headset's menu over it, stops it; frames would not be drawn to snap).
   */
  private going(): boolean {
    const g = this.globals as unknown as Globals;
    if (!this.stopAsked && (g.designing.peek() || String(this.world.visibilityState.peek()) !== this.startedIn)) this.stopAsked = true;
    return !this.stopAsked;
  }

  /** Waits this many seconds; false if coverage may not go on. */
  private async wait(seconds: number): Promise<boolean> {
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until) {
      if (!this.going()) return false;
      await new Promise((done) => window.setTimeout(done, 100));
    }
    return this.going();
  }
}
