/**
 * What is done about words said to the set. A sentence is first read as a
 * control (snap, a lens, record, a paint, where the camera looks); what is not
 * a control goes to the scene reader, which builds or changes the set. Typed
 * words take the same road, so a test and a voice do exactly the same thing.
 *
 * Every control here is one the panel already has, worked through the same
 * signal the panel's button sets. What it cannot do: move a piece to a new
 * mark. Asked to, it says that moving is done by hand.
 */
import type { World } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { CAMERAS, LENSES, Rig } from './camera-formats.js';
import { assetTitle, PAINTS } from './catalog.js';
import { PiecesSystem } from './pieces.js';
import { partsOf, understand } from './scene-request.js';
import type { Spoken } from './scene-request.js';
import type { Command } from './spoken-commands.js';
import { TakeState } from './take.js';
import { TraySystem } from './tray.js';

type Globals = {
  coachNote: Signal<string>;
  sceneRequest: Signal<Spoken | null>;
  snapRequested: Signal<number>;
  lensMm: Signal<number>;
  takeState: Signal<string>;
  takeLength: Signal<number>;
  recordRequested: Signal<number>;
  playRequested: Signal<number>;
  cameraRig: Signal<string>;
  cameraOn: Signal<string>;
  trayOn: Signal<string[]>;
  trayToggle: Signal<string>;
  removeSelected: Signal<number>;
  selectedLabel: Signal<string>;
  lifeSize: Signal<boolean>;
  lastSpoken: Signal<string>;
};

const bump = (signal: Signal<number>): void => {
  signal.value = signal.peek() + 1;
};

const PAINT_LIST = PAINTS.map((paint) => paint.name.toLowerCase()).join(', ');

const TAKE_IS_RUNNING = 'A TAKE IS RUNNING | Say stop first, then say it again.';

/** Acts on one sentence, spoken or typed: each thing it asks for, in the order it was said. */
export function hear(world: World, text: string): void {
  const g = world.globals as unknown as Globals;
  for (const part of partsOf(text)) {
    if (part.command == null) {
      g.sceneRequest.value = understand(part.text);
      continue;
    }
    const note = obey(world, g, part.command);
    if (note !== '') g.coachNote.value = note;
  }
  g.lastSpoken.value = text;
}

/** How a change to one piece, or to several, is said back. */
const changed = (title: string, count: number, now: string): string =>
  count > 1 ? `${title.toUpperCase()} AND ${count - 1} MORE | Now ${now}.` : `${title.toUpperCase()} | Now ${now}.`;

/** Does the one thing asked, and returns the line for the call sheet; empty when the thing speaks for itself. */
function obey(world: World, g: Globals, command: Command): string {
  switch (command.do) {
    case 'snap':
      if (g.lifeSize.peek()) return 'BACK TO THE TABLE FIRST | A frame is snapped from the table. Say it again there.';
      bump(g.snapRequested);
      return '';
    case 'lens':
      g.lensMm.value = command.mm;
      return `${command.mm} MM | That lens is on the camera.`;
    case 'lensStep': {
      const at = LENSES.indexOf(g.lensMm.peek() as (typeof LENSES)[number]);
      const next = LENSES[Math.max(0, Math.min(LENSES.length - 1, (at < 0 ? 2 : at) + command.step))];
      if (next === g.lensMm.peek()) return `${next} MM | That is the ${command.step < 0 ? 'widest' : 'longest'} lens in the kit.`;
      g.lensMm.value = next;
      return `${next} MM | That lens is on the camera.`;
    }
    case 'record':
      if (g.takeState.peek() === TakeState.Recording) return 'ALREADY RECORDING | Say stop to end the take.';
      bump(g.recordRequested);
      return g.takeState.peek() === TakeState.Recording
        ? 'RECORDING | Carry a piece along its path. Say stop to end the take.'
        : 'NOT RECORDING | There is nothing on the set to record.';
    case 'stop':
      if (g.takeState.peek() === TakeState.Recording) {
        bump(g.recordRequested);
        // A pass in which nothing was carried is no take, and the recorder says so itself.
        return g.takeState.peek() === TakeState.Playing ? 'CUT | The take plays back. Say stop to hold it.' : '';
      }
      if (g.takeState.peek() === TakeState.Playing) {
        bump(g.playRequested);
        return 'STOPPED | Say play to see the take again.';
      }
      return 'NOTHING IS RUNNING | Say record to start a take.';
    case 'play':
      if (g.takeState.peek() === TakeState.Recording) return 'STILL RECORDING | Say stop first.';
      if (g.takeState.peek() === TakeState.Playing) return 'ALREADY PLAYING | Say stop to hold it.';
      if (g.takeLength.peek() <= 0) return 'NO TAKE YET | Say record, then carry a piece.';
      bump(g.playRequested);
      return 'PLAYING | Say stop to hold it.';
    case 'rig':
      g.cameraRig.value = command.rig === 'drone' ? Rig.Drone : Rig.Tripod;
      return command.rig === 'drone' ? 'ON THE DRONE | The camera flies. Say higher or lower, or carry it.' : 'ON THE TRIPOD | The camera is back on its legs.';
    case 'cut': {
      const label = CAMERAS[command.camera];
      if (command.camera === 1 && !g.trayOn.peek().includes(label)) g.trayToggle.value = label;
      g.cameraOn.value = label;
      return command.camera === 0 ? 'CAMERA A | Live.' : 'CAMERA B | Live.';
    }
    case 'aim': {
      const title = assetTitle(command.labels[0]);
      const result = world.getSystem(PiecesSystem)?.aimCamera(command.labels) ?? 'busy';
      if (result === 'none') return `NO ${title.toUpperCase()} ON THE SET | Name it first and it goes on.`;
      if (result === 'busy') return 'THE CAMERA IS BUSY | Put it down, or stop the take, then say it again.';
      return `CAMERA ON ${result.toUpperCase()} | Say closer, back, higher or lower, then snap.`;
    }
    case 'step': {
      const result = world.getSystem(PiecesSystem)?.stepCamera(command.step) ?? 'busy';
      if (result === 'busy') return 'THE CAMERA IS BUSY | Put it down, or stop the take, then say it again.';
      if (result === 'limit') return `NO FURTHER | The camera is as ${command.step === 'higher' ? 'high' : command.step === 'lower' ? 'low' : 'far that way'} as it goes.`;
      return `CAMERA ${command.step.toUpperCase()} | ${result} Say it again to keep going.`;
    }
    case 'paint': {
      const paint = PAINTS.findIndex((entry) => entry.name.toLowerCase() === command.colour);
      if (paint < 0) return `NO ${command.colour.toUpperCase()} IN THE KIT | The paints are ${PAINT_LIST}.`;
      // A take holds how the pieces stood; they are not repainted, resized or struck under it.
      if (g.takeState.peek() !== TakeState.Idle) return TAKE_IS_RUNNING;
      const done = world.getSystem(TraySystem)?.change(command.labels, command.all, { paint });
      if (done == null || done.why === 'none') return missing(command.labels, 'paint the car red');
      if (done.why === 'kit') return 'THE CAMERA KIT STAYS AS IT IS | It takes no paint and no other size.';
      if (done.why === 'fixed') return `${done.title.toUpperCase()} TAKES NO PAINT | Its size can change: say bigger or smaller.`;
      return changed(done.title, done.count, done.now);
    }
    case 'size': {
      if (g.takeState.peek() !== TakeState.Idle) return TAKE_IS_RUNNING;
      const done = world.getSystem(TraySystem)?.change(command.labels, command.all, { size: command.size });
      if (done == null || done.why === 'none') return missing(command.labels, 'make the car bigger');
      if (done.why === 'kit' || done.why === 'fixed') return 'THE CAMERA KIT STAYS AS IT IS | It takes no paint and no other size.';
      if (done.why === 'limit') return `${done.title.toUpperCase()} | That is as ${command.size === 'bigger' ? 'big' : 'small'} as it goes by word. Two hands stretch it further.`;
      return changed(done.title, done.count, done.now);
    }
    case 'remove': {
      const label = g.selectedLabel.peek();
      if (label === '') return 'NOTHING PICKED | Touch a piece first, or name it: remove the dragon.';
      if (g.takeState.peek() !== TakeState.Idle) return TAKE_IS_RUNNING;
      bump(g.removeSelected);
      return `${assetTitle(label).toUpperCase()} IS OFF THE SET | Say its name to bring it back.`;
    }
    case 'byHand':
      return 'MOVING IS BY HAND | Words add, remove, paint and size a piece, aim the camera, change the lens and snap.';
  }
}

function missing(labels: string[] | null, example: string): string {
  if (labels == null) return `NOTHING PICKED | Touch a piece first, or name it: ${example}.`;
  return `NO ${assetTitle(labels[0]).toUpperCase()} ON THE SET | Name it first and it goes on.`;
}
