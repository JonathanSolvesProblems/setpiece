/**
 * The set dresser's rule, after the set designer has put a set down. The designer reads footprints well at yaw 0
 * and badly once a piece is turned: a car turned side-on gets its 4.6 m length counted across the stage's depth,
 * and an actor ends up standing inside it, or the car runs off the slate. Code puts that right, the same way the
 * camera operator keeps the lens out of pieces: two pieces on the ground that stand inside one another by mistake
 * are moved apart by the shortest push, and whatever the plan touched is kept on the stage.
 *
 * Pure arithmetic on footprints (no scene, no Three), so it is tested on its own (tmp/t-settle.mjs).
 */

/**
 * solid: a vehicle, wall, crate or house front, which nothing stands inside. body: an actor, who steps out of a
 * solid and out of another actor (two people never share a spot; a fight at arm's length is only touching).
 * animal: a horse or a wolf, which steps out of a solid but may carry a rider. free: on the stage but never
 * pushed (a bicycle, a fence, a creature, a made piece, which can hold an actor on purpose); only kept on it.
 */
export type Kind = 'solid' | 'body' | 'animal' | 'free';

export interface Footing {
  /** The middle of the footprint on the stage, and half its width (local x) and length (local z). */
  x: number;
  z: number;
  hx: number;
  hz: number;
  /** The turn about up, in radians, as Three turns: local x points along (cos, -sin), local z along (sin, cos). */
  yaw: number;
  kind: Kind;
  /** Placed by the director and not touched by this plan: it stays exactly where it is. */
  fixed: boolean;
  /** Of two that overlap, the lighter moves: actors and animals weigh 0, a solid its area. */
  weight: number;
  /** Kept inside the stage when it moves or was placed by this plan. */
  keepOn: boolean;
}

export interface Room {
  /** Half the stage's width and depth. */
  halfX: number;
  halfZ: number;
  /** How far a footprint may hang over the stage's edge. */
  overhang: number;
  /** Space left between a body and a solid it stepped out of, and between two solids pushed apart. */
  bodyGap: number;
  solidGap: number;
  /** Overlaps shallower than this are contact, not a mistake (two crashed cars touching). */
  touch: number;
}

/** How far each footing was moved, in its order. */
export interface Shift {
  dx: number;
  dz: number;
}

/** Whether a pair is ever pushed apart: a solid and anything but a free piece, or two actors. */
function pushes(a: Footing, b: Footing): boolean {
  if (a.kind === 'free' || b.kind === 'free') return false;
  return a.kind === 'solid' || b.kind === 'solid' || (a.kind === 'body' && b.kind === 'body');
}

/** Half the footprint's extent along a direction (nx, nz). */
function reach(f: Footing, nx: number, nz: number): number {
  const c = Math.cos(f.yaw);
  const s = Math.sin(f.yaw);
  return f.hx * Math.abs(c * nx - s * nz) + f.hz * Math.abs(s * nx + c * nz);
}

/**
 * The shortest push that takes b out of a, by the separating-axis test on the two turned rectangles: the
 * direction to move b (a unit vector) and how far. Null when they do not overlap.
 */
export function separation(a: Footing, b: Footing): { nx: number; nz: number; depth: number } | null {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  let best = Infinity;
  let bx = 0;
  let bz = 0;
  for (const yaw of [a.yaw, b.yaw]) {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    for (const [nx, nz] of [
      [c, -s],
      [s, c],
    ]) {
      const along = dx * nx + dz * nz;
      const depth = reach(a, nx, nz) + reach(b, nx, nz) - Math.abs(along);
      if (depth <= 0) return null;
      if (depth < best) {
        best = depth;
        // b goes the way it already lies from a; from the very middle, towards the camera (+z), else to +x.
        const sign = Math.abs(along) > 1e-9 ? Math.sign(along) : Math.abs(nz) > 1e-9 ? Math.sign(nz) : Math.sign(nx) || 1;
        bx = nx * sign;
        bz = nz * sign;
      }
    }
  }
  return { nx: bx, nz: bz, depth: best };
}

/**
 * Keeps a footing on the stage, the way a set is dressed on a table: its middle stays on the stage, and its front
 * does not hang off towards the camera. Its sides and back may hang over the edge, which is how a set shows less
 * of a place too big for it (a truck parked half off the side); over the edge it stands only a slate's thickness
 * above the table. True when it moved.
 */
function keepOnStage(f: Footing, room: Room): boolean {
  const c = Math.abs(Math.cos(f.yaw));
  const s = Math.abs(Math.sin(f.yaw));
  const ez = f.hx * s + f.hz * c;
  const x = Math.min(room.halfX, Math.max(-room.halfX, f.x));
  // The front no further than the front edge; a piece deeper than the stage hangs off the back instead.
  const z = Math.max(-room.halfZ, Math.min(Math.min(room.halfZ, f.z), room.halfZ + room.overhang - ez));
  if (Math.abs(x - f.x) < 1e-9 && Math.abs(z - f.z) < 1e-9) return false;
  f.x = x;
  f.z = z;
  return true;
}

/** How deep two footings stand inside one another, 0 when they do not. */
function depthOf(a: Footing, b: Footing): number {
  return separation(a, b)?.depth ?? 0;
}

/**
 * Moves one of a pair out of the other: every way out along the two footprints' axes, in both directions, is
 * tried with the stage's edge applied; the shortest that clears the pair wins, and one that lands in a third
 * piece costs as much as crossing the stage. The lighter piece is tried first, then the heavier. When neither
 * can get clear alone (two cars side-on need both to move), the move that leaves the least overlap is made and
 * the next round finishes it. False when nothing helps: the stage is too full, and they stay as they are.
 */
function resolve(work: Footing[], i: number, j: number, room: Room): boolean {
  const a = work[i];
  const b = work[j];
  const gap = a.kind === 'solid' && b.kind === 'solid' ? room.solidGap : room.bodyGap;
  const lighterIsB = b.weight <= a.weight;
  const order = lighterIsB ? [j, i] : [i, j];
  const trial: Footing = { ...a };
  const before = depthOf(a, b);
  let partial = before - room.touch;
  let partialMover = -1;
  let partialX = 0;
  let partialZ = 0;
  for (const mover of order) {
    const moving = work[mover];
    const other = work[mover === i ? j : i];
    if (moving.fixed) continue;
    let best = Infinity;
    let bestX = 0;
    let bestZ = 0;
    for (const yaw of [a.yaw, b.yaw]) {
      const c = Math.cos(yaw);
      const s = Math.sin(yaw);
      for (const [nx, nz] of [
        [c, -s],
        [s, c],
        [-c, s],
        [-s, -c],
      ]) {
        // How far the mover must go along (nx, nz) to stand clear of the other on that axis.
        const along = (moving.x - other.x) * nx + (moving.z - other.z) * nz;
        const far = reach(moving, nx, nz) + reach(other, nx, nz) - along + gap;
        if (far <= 0) continue;
        Object.assign(trial, moving);
        trial.x += nx * far;
        trial.z += nz * far;
        if (trial.keepOn) keepOnStage(trial, room);
        const left = depthOf(trial, other);
        if (left > room.touch) {
          if (left < partial) {
            partial = left;
            partialMover = mover;
            partialX = trial.x;
            partialZ = trial.z;
          }
          continue;
        }
        let cost = Math.hypot(trial.x - moving.x, trial.z - moving.z);
        for (let k = 0; k < work.length; k++) {
          if (k === i || k === j || !pushes(trial, work[k])) continue;
          if (depthOf(trial, work[k]) > room.touch) cost += room.halfX * 2;
        }
        if (cost < best) {
          best = cost;
          bestX = trial.x;
          bestZ = trial.z;
        }
      }
    }
    if (best < Infinity) {
      moving.x = bestX;
      moving.z = bestZ;
      return true;
    }
  }
  if (partialMover < 0) return false;
  work[partialMover].x = partialX;
  work[partialMover].z = partialZ;
  return true;
}

/**
 * Settles the footings: pieces the plan put off the stage are brought back on, then a few rounds of moving
 * overlapping pairs apart, until nothing changes. Returns how far each one moved; fixed ones never do.
 */
export function settle(feet: readonly Footing[], room: Room, rounds = 8): Shift[] {
  const work = feet.map((f) => ({ ...f }));
  for (const f of work) if (!f.fixed && f.keepOn) keepOnStage(f, room);
  for (let round = 0; round < rounds; round++) {
    let changed = false;
    for (let i = 0; i < work.length; i++) {
      for (let j = i + 1; j < work.length; j++) {
        if ((work[i].fixed && work[j].fixed) || !pushes(work[i], work[j])) continue;
        if (depthOf(work[i], work[j]) <= room.touch) continue;
        if (resolve(work, i, j, room)) changed = true;
      }
    }
    if (!changed) break;
  }
  return work.map((f, i) => ({ dx: f.x - feet[i].x, dz: f.z - feet[i].z }));
}
