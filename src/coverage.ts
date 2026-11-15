/**
 * Cover it: the set designer plans the shots that cover the set as it stands (src/coverage-plan.ts), and the app
 * shoots them by itself, one after another. On the table each shot moves the camera, lets the monitor settle, and
 * snaps the frame onto the board, until the board is full. Stepped inside, it cuts the wearer from camera to camera
 * instead, standing them in each shot (a frame is only snapped at the table). It stops when asked (say stop, or
 * pinch Stop coverage), when a piece is picked up, when something new is asked of the designer, or when the session
 * ends, and keeps what it has shot.
 */
import { createSystem } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { cleanCamera } from './director-plan.js';
import type { CameraPlan } from './director-plan.js';
import { DirectorSystem } from './director.js';
import { LifeSizeSystem } from './life-size.js';
import { Held, SetPiece } from './set-components.js';
import { MOST_SHOTS } from './coverage-plan.js';

const ENDPOINT = '/api/director';
const BOARD_SLOTS = 6;
/** Seconds the camera is given to stand and the monitor to show the shot before it is snapped. */
const SETTLE = 1.8;
/** Seconds the frame is left to be seen before the next shot. */
const HOLD = 1.4;
/** Seconds each shot is stood in, stepped inside, before the cut to the next. */
const INSIDE_HOLD = 4;
/** The longest the designer is waited for. */
const WAIT_MS = 30000;

type Globals = {
  coachNote: Signal<string>;
  snapRequested: Signal<number>;
  shotFrames: Signal<unknown[]>;
  trayOn: Signal<string[]>;
  lifeSize: Signal<boolean>;
  lastSpoken: Signal<string>;
  designing: Signal<boolean>;
  coverageRunning: Signal<boolean>;
  coverageRequested: Signal<number>;
  coverageStopRequested: Signal<number>;
};

type Shot = { title: string; says: string; camera: CameraPlan };

export class CoverageSystem extends createSystem({
  held: { required: [SetPiece, Held] },
}) {
  private stopAsked = false;
  private asking: AbortController | null = null;

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
    const life = g.lifeSize.peek();
    if (!life && g.shotFrames.peek().length >= BOARD_SLOTS) return 'THE BOARD IS FULL | Pinch New board, then say cover it again.';
    void this.run(director);
    return 'PLANNING COVERAGE | The set designer is choosing the shots.';
  }

  private async run(director: DirectorSystem): Promise<void> {
    const g = this.globals as unknown as Globals;
    this.stopAsked = false;
    g.coverageRunning.value = true;
    let shot = 0;
    let shots: Shot[] = [];
    try {
      shots = await this.plan(director, g.lastSpoken.peek() || 'cover the scene');
      if (shots.length === 0) {
        if (!this.stopAsked) g.coachNote.value = 'NO COVERAGE | The set designer did not plan any shots. Say cover it again.';
        return;
      }
      for (; shot < shots.length && !this.stopAsked; shot++) {
        const life = g.lifeSize.peek();
        // On the table, as many shots as the board has room for.
        if (!life && g.shotFrames.peek().length >= BOARD_SLOTS) break;
        const { title, says, camera } = shots[shot];
        g.coachNote.value = `SHOT ${shot + 1} OF ${shots.length}: ${title.toUpperCase()} | ${says}`;
        director.frameShot(camera);
        if (life) {
          this.world.getSystem(LifeSizeSystem)?.cutToCamera();
          if (!(await this.wait(INSIDE_HOLD))) break;
          continue;
        }
        if (!(await this.wait(SETTLE))) break;
        g.snapRequested.value = g.snapRequested.peek() + 1;
        if (!(await this.wait(HOLD))) break;
      }
    } catch {
      if (!this.stopAsked) g.coachNote.value = 'NO COVERAGE | The set designer could not be reached. Say cover it again.';
      return;
    } finally {
      g.coverageRunning.value = false;
      this.asking = null;
    }
    const inside = g.lifeSize.peek();
    if (this.stopAsked) {
      g.coachNote.value = inside ? `COVERAGE STOPPED | ${shot} of ${shots.length} shots stood in.` : `COVERAGE STOPPED | ${shot} of ${shots.length} shots are on the board.`;
    } else if (shots.length > 0) {
      g.coachNote.value = inside
        ? `COVERAGE DONE | ${shot} shots stood in. Step out and say cover it to put them on the board.`
        : `COVERAGE DONE | ${shot} frames on the board. Pinch one to go back to its setup.`;
    }
  }

  /** The designer's shots for the set as it stands. */
  private async plan(director: DirectorSystem, said: string): Promise<Shot[]> {
    const asking = new AbortController();
    this.asking = asking;
    const timer = window.setTimeout(() => asking.abort(), WAIT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ said, heard: [], set: director.describe(), coverage: true }),
        signal: asking.signal,
      });
      const text = await response.text();
      let whole = '';
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue;
        const event = JSON.parse(line) as { t: string; s?: string };
        if (event.t === 'd' && event.s != null) whole += event.s;
        if (event.t === 'error') throw new Error('refused');
      }
      const reply = JSON.parse(whole) as { shots?: unknown };
      const shots: Shot[] = [];
      for (const raw of Array.isArray(reply.shots) ? reply.shots.slice(0, MOST_SHOTS) : []) {
        const item = raw as { title?: unknown; says?: unknown; camera?: unknown };
        const camera = cleanCamera(item.camera);
        if (camera == null) continue;
        shots.push({
          title: typeof item.title === 'string' ? item.title.slice(0, 32) : 'Shot',
          says: typeof item.says === 'string' ? item.says.slice(0, 110) : '',
          camera: { ...camera, keep: false },
        });
      }
      return shots;
    } finally {
      window.clearTimeout(timer);
    }
  }

  /** Waits this many seconds; false if coverage was stopped meanwhile, or something new was asked of the designer. */
  private async wait(seconds: number): Promise<boolean> {
    const g = this.globals as unknown as Globals;
    const until = performance.now() + seconds * 1000;
    while (performance.now() < until) {
      if (this.stopAsked) return false;
      if (g.designing.peek()) {
        this.stopAsked = true;
        return false;
      }
      await new Promise((done) => window.setTimeout(done, 100));
    }
    return !this.stopAsked;
  }
}
