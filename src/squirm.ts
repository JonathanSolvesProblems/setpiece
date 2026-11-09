/**
 * A lay figure with some life in it. Lifted off the slate it hangs from the
 * hand and swings with it, kicks its legs and waves its arms, and goes quiet
 * when it is set down. Knocked over, it falls the way it was hit and lies
 * there until a hand stands it up. It is all on the figure's own parts, so it
 * never touches where the piece stands or what a take records. A setting on
 * the panel turns the squirming off. Only actors do this: a camera in the hand
 * stays a camera.
 *
 * While a take plays, an actor who is moving walks: it turns to face the way it
 * is going and its legs and arms swing, one stride to so much ground, so a run
 * looks like a run and a stop is a stop. The take itself still holds only
 * where the hand put the piece.
 */
import { createSystem, Entity, Euler, Matrix4, Object3D, Quaternion, Vector3 } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Held, SetPiece, SetRole } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';

const SWING_STIFFNESS = 60;
const SWING_DAMPING = 3.5;
const SWING_GAIN = 12;
const SWING_LIMIT = 0.9;
const IDLE_SWAY = 0.07;
const ACCEL_LIMIT = 8;
const KICK_RATE = 13;
const FAST_KICK_RATE = 19;
const LEG_KICK = 0.6;
const ARM_WAVE = 0.8;
const ARM_SPLAY = 0.4;
const HEAD_ROLL = 0.2;
const REST = 0.01;
/** Slower than this on the slate, an actor is standing. */
const WALK_FROM = 0.025;
/** Ground covered by one full stride, left and right, at 1:10. */
const STRIDE = 0.15;
const STRIDE_MOST = 20;
const LEG_STRIDE = 0.55;
const ARM_STRIDE = 0.45;
const WALK_BOB = 0.004;
const TURN_RATE = 9;
/** Flat on its back, near enough. */
const FALL_ANGLE = 1.47;
const FALL_RATE = 9;
const X = new Vector3(1, 0, 0);
const UP = new Vector3(0, 1, 0);

type Limb = { parts: Object3D[]; bases: Matrix4[]; pivot: Vector3; wave: number; phase: number; splay: number; axis: Vector3; stride: number; step: number };
type Rig = { pose: Object3D; base: Matrix4; grip: Vector3; limbs: Limb[]; stand: Object3D[] };
type State = {
  entity: Entity;
  rigs: Rig[];
  rig: Rig | null;
  amount: number;
  clock: number;
  fresh: boolean;
  last: Vector3;
  velocity: Vector3;
  swingX: number;
  swingZ: number;
  speedX: number;
  speedZ: number;
  down: boolean;
  fallen: number;
  fallAxis: Vector3;
  walking: boolean;
  walk: number;
  walkClock: number;
  /** Which way it is going, in its own frame, and how it is turned to face that. */
  heading: number;
  facing: number;
  wasX: number;
  wasZ: number;
  speed: number;
};

const NAMES = (tag: string): { arm: RegExp; leg: RegExp } => ({
  arm: new RegExp(`^(Shoulder${tag}|Arm${tag}Upper|Elbow${tag}|Arm${tag}Lower|Hand${tag}|Pistol${tag})$`),
  leg: new RegExp(`^(Leg${tag}Upper|Knee${tag}|Leg${tag}Lower|Foot${tag})$`),
});

function rigFor(pose: Object3D): Rig {
  const byName = (pattern: RegExp): Object3D[] => pose.children.filter((part) => pattern.test(part.name));
  const aiming = (parts: Object3D[]): boolean => parts.some((part) => part.name.startsWith('Pistol'));
  const limb = (parts: Object3D[], pivot: Vector3, wave: number, phase: number, splay: number, axis: Vector3 = X, stride = 0, step = 0): Limb => ({
    parts,
    bases: parts.map((part) => part.matrix.clone()),
    pivot,
    wave,
    phase,
    splay,
    axis,
    stride,
    step,
  });
  const pelvis = pose.getObjectByName('Pelvis')!;
  const head = pose.getObjectByName('Head')!;
  const neck = pose.getObjectByName('Neck')!;
  const limbs: Limb[] = [];
  [-1, 1].forEach((side, i) => {
    const { arm, leg } = NAMES(side < 0 ? 'L' : 'R');
    const arms = byName(arm);
    const legs = byName(leg);
    const shoulder = arms.find((part) => part.name.startsWith('Shoulder'))!;
    const knee = legs.find((part) => part.name.startsWith('Knee'))!;
    limbs.push(
      limb(legs, new Vector3(knee.position.x, pelvis.position.y, 0), LEG_KICK, i * Math.PI, 0, X, LEG_STRIDE, i * Math.PI),
      // An arm swings with the opposite leg. An arm holding the prop pistol stays on its aim.
      limb(arms, shoulder.position.clone(), ARM_WAVE, i * Math.PI + Math.PI / 2, aiming(arms) ? 0 : side * ARM_SPLAY, X, aiming(arms) ? 0 : ARM_STRIDE, i * Math.PI + Math.PI),
    );
  });
  limbs.push(limb(byName(/^(Neck|Head|Hair)$/), neck.position.clone(), HEAD_ROLL, 0.8, 0, new Vector3(0, 0, 1)));
  return {
    pose,
    base: pose.matrix.clone(),
    grip: head.position.clone(),
    limbs,
    stand: byName(/^(Base|Post)$/),
  };
}

export class SquirmSystem extends createSystem({
  held: { required: [SetPiece, Held] },
  pieces: { required: [SetPiece] },
}) {
  private states = new Map<Entity, State>();
  private moving: State[] = [];
  private turn = new Quaternion();
  private euler = new Euler();
  private spin = new Quaternion();
  private matrix = new Matrix4();
  private rotate = new Matrix4();
  private there = new Matrix4();
  private back = new Matrix4();
  private place = new Vector3();
  private step = new Vector3();
  private push = new Vector3();
  private one = new Vector3(1, 1, 1);
  private zero = new Vector3();
  private lens: ViewfinderSystem | undefined;
  private actors: Entity[] = [];
  private lastTake = 'idle';
  private lastSeconds = 0;

  init(): void {
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (piece) => {
        if (piece.getValue(SetPiece, 'role') !== SetRole.Actor || piece.object3D == null) return;
        const state = this.states.get(piece);
        // A hand on a fallen actor stands it up, whatever the setting.
        if (state != null) state.down = false;
        if (!this.squirms() && state == null) return;
        const live = state ?? this.stateFor(piece);
        live.fresh = true;
        this.wake(live);
      }),
    );
  }

  private squirms(): boolean {
    return (this.globals as { squirmOn: Signal<boolean> }).squirmOn.peek();
  }

  private stateFor(piece: Entity): State {
    let state = this.states.get(piece);
    if (state == null) {
      state = {
        entity: piece,
        rigs: [],
        rig: null,
        amount: 0,
        clock: 0,
        fresh: true,
        last: new Vector3(),
        velocity: new Vector3(),
        swingX: 0,
        swingZ: 0,
        speedX: 0,
        speedZ: 0,
        down: false,
        fallen: 0,
        fallAxis: new Vector3(1, 0, 0),
        walking: false,
        walk: 0,
        walkClock: 0,
        heading: 0,
        facing: 0,
        wasX: piece.object3D?.position.x ?? 0,
        wasZ: piece.object3D?.position.z ?? 0,
        speed: 0,
      };
      this.states.set(piece, state);
    }
    return state;
  }

  private wake(state: State): void {
    if (!this.moving.includes(state)) this.moving.push(state);
  }

  /** Knock an actor over, away from what hit it. The direction is in the actor's own frame. */
  knock(piece: Entity, x: number, z: number): boolean {
    if (piece.object3D == null || piece.hasComponent(Held)) return false;
    const state = this.stateFor(piece);
    if (state.down) return false;
    const length = Math.hypot(x, z);
    if (length < 1e-4) return false;
    state.down = true;
    // Falling towards (x, z) is a turn about the level axis square to it.
    state.fallAxis.set(z / length, 0, -x / length);
    this.wake(state);
    return true;
  }

  isDown(piece: Entity): boolean {
    return this.states.get(piece)?.down === true;
  }

  /** Everyone back on their feet: the start of a take, a new board, a frame recalled. */
  standAll(): void {
    for (const state of this.states.values()) state.down = false;
  }

  update(delta: number): void {
    if (delta <= 0) return;
    this.watchWalkers(delta);
    if (this.moving.length === 0) return;
    // A figure moving its limbs does not move as a piece, so the monitor is told to look again.
    this.lens ??= this.world.getSystem(ViewfinderSystem);
    this.lens?.refresh();
    for (let i = this.moving.length - 1; i >= 0; i--) {
      const state = this.moving[i];
      if (this.animate(state, delta)) continue;
      this.moving.splice(i, 1);
    }
  }

  /** While a take plays, whoever is moving is walking. */
  private watchWalkers(delta: number): void {
    const g = this.globals as { takeState: Signal<string>; takeSeconds: Signal<number> };
    const state0 = g.takeState.peek();
    const playing = state0 !== 'idle';
    // A take starting, or looping round, is a jump: nothing has walked anywhere.
    const seconds = g.takeSeconds.peek();
    const jumped = state0 !== this.lastTake || seconds < this.lastSeconds;
    this.lastTake = state0;
    this.lastSeconds = seconds;
    if (!playing && this.moving.length === 0) return;
    if (this.actors.length === 0) {
      for (const piece of this.queries.pieces.entities) {
        if (piece.getValue(SetPiece, 'role') === SetRole.Actor && piece.object3D != null) this.actors.push(piece);
      }
    }
    for (let i = 0; i < this.actors.length; i++) {
      const piece = this.actors[i];
      const object = piece.object3D!;
      const state = this.states.get(piece) ?? (playing ? this.stateFor(piece) : undefined);
      if (state == null) continue;
      const dx = jumped ? 0 : object.position.x - state.wasX;
      const dz = jumped ? 0 : object.position.z - state.wasZ;
      state.wasX = object.position.x;
      state.wasZ = object.position.z;
      if (jumped) state.speed = 0;
      // A take looping back to its start is a jump, not a step.
      const run = Math.hypot(dx, dz);
      const speed = run > 0.05 ? 0 : run / delta;
      state.speed += (speed - state.speed) * Math.min(1, delta * 12);
      state.walking = playing && object.visible && !state.down && !piece.hasComponent(Held) && state.speed > WALK_FROM;
      if (!state.walking) continue;
      this.wake(state);
      if (run > 1e-5 && run <= 0.05) {
        // The way it is going, as the figure, with its own turn taken off, sees it.
        const yaw = 2 * Math.atan2(object.quaternion.y, object.quaternion.w);
        state.heading = Math.atan2(dx, dz) - yaw;
      }
    }
  }

  private currentRig(state: State): Rig | null {
    const object = state.entity.object3D!;
    for (let i = 0; i < object.children.length; i++) {
      const child = object.children[i];
      if (!child.visible || !child.name.startsWith('Pose')) continue;
      for (let r = 0; r < state.rigs.length; r++) if (state.rigs[r].pose === child) return state.rigs[r];
      const rig = rigFor(child);
      state.rigs.push(rig);
      return rig;
    }
    return null;
  }

  private rest(rig: Rig): void {
    rig.pose.matrix.copy(rig.base);
    rig.pose.matrixWorldNeedsUpdate = true;
    for (let i = 0; i < rig.limbs.length; i++) {
      const limb = rig.limbs[i];
      for (let p = 0; p < limb.parts.length; p++) {
        limb.parts[p].matrix.copy(limb.bases[p]);
        limb.parts[p].matrixWorldNeedsUpdate = true;
      }
    }
    for (let i = 0; i < rig.stand.length; i++) rig.stand[i].visible = true;
  }

  /** False once the figure is back at rest and needs no more of this. */
  private animate(state: State, delta: number): boolean {
    const object = state.entity.object3D;
    if (object == null) return false;
    const held = state.entity.hasComponent(Held);
    const wanted = held && this.squirms();
    state.amount += ((wanted ? 1 : 0) - state.amount) * Math.min(1, delta * (wanted ? 12 : 8));
    state.fallen += ((state.down ? 1 : 0) - state.fallen) * Math.min(1, delta * FALL_RATE);
    state.walk += ((state.walking ? 1 : 0) - state.walk) * Math.min(1, delta * 10);
    const rig = this.currentRig(state);
    if (rig !== state.rig) {
      if (state.rig != null) this.rest(state.rig);
      state.rig = rig;
    }
    if (rig == null) return wanted || state.down || state.walking;
    if (!wanted && !state.down && !state.walking && state.amount < REST && state.fallen < REST && state.walk < REST) {
      this.rest(rig);
      state.swingX = state.swingZ = state.speedX = state.speedZ = 0;
      state.amount = state.fallen = state.walk = state.facing = 0;
      return false;
    }

    object.getWorldPosition(this.place);
    if (state.fresh) {
      state.fresh = false;
      state.last.copy(this.place);
      state.velocity.set(0, 0, 0);
    }
    this.step.copy(this.place).sub(state.last).divideScalar(delta);
    state.last.copy(this.place);
    this.push.copy(this.step).sub(state.velocity).divideScalar(delta);
    state.velocity.lerp(this.step, Math.min(1, delta * 30));
    // The hand's push, as the figure feels it.
    this.push.applyQuaternion(this.turn.copy(object.getWorldQuaternion(this.turn)).invert());
    const ax = Math.max(-ACCEL_LIMIT, Math.min(ACCEL_LIMIT, this.push.x));
    const az = Math.max(-ACCEL_LIMIT, Math.min(ACCEL_LIMIT, this.push.z));
    state.speedX += (-SWING_STIFFNESS * state.swingX - SWING_DAMPING * state.speedX + az * SWING_GAIN) * delta;
    state.speedZ += (-SWING_STIFFNESS * state.swingZ - SWING_DAMPING * state.speedZ - ax * SWING_GAIN) * delta;
    state.swingX = Math.max(-SWING_LIMIT, Math.min(SWING_LIMIT, state.swingX + state.speedX * delta));
    state.swingZ = Math.max(-SWING_LIMIT, Math.min(SWING_LIMIT, state.swingZ + state.speedZ * delta));

    const speed = Math.min(1, state.velocity.length() * 3);
    state.clock += delta * (KICK_RATE + (FAST_KICK_RATE - KICK_RATE) * speed);
    const clock = state.clock;
    const amount = state.amount;

    // The whole figure hangs from where a hand would hold it, then lies down if it was knocked over.
    this.euler.set(amount * (state.swingX + IDLE_SWAY * Math.sin(clock * 0.31)), 0, amount * (state.swingZ + IDLE_SWAY * Math.cos(clock * 0.23)));
    this.about(rig.grip, this.euler, rig.pose.matrix, rig.base);
    if (state.fallen > 0) {
      this.spin.setFromAxisAngle(state.fallAxis, state.fallen * FALL_ANGLE);
      rig.pose.matrix.premultiply(this.rotate.compose(this.zero, this.spin, this.one));
    }
    const walk = state.walk;
    if (walk > REST) {
      // The short way round to the way it is going.
      const turn = Math.atan2(Math.sin(state.heading - state.facing), Math.cos(state.heading - state.facing));
      state.facing += turn * Math.min(1, delta * TURN_RATE);
      state.walkClock += Math.min(STRIDE_MOST, (state.speed / STRIDE) * Math.PI * 2) * delta;
      this.spin.setFromAxisAngle(UP, state.facing * walk);
      this.step.set(0, Math.abs(Math.sin(state.walkClock)) * WALK_BOB * walk, 0);
      rig.pose.matrix.premultiply(this.rotate.compose(this.step, this.spin, this.one));
    } else {
      state.facing = state.heading;
    }
    rig.pose.matrixWorldNeedsUpdate = true;

    const energy = amount * (0.75 + 0.35 * speed);
    for (let i = 0; i < rig.limbs.length; i++) {
      const limb = rig.limbs[i];
      const angle = Math.sin(clock + limb.phase) * limb.wave * energy + Math.sin(state.walkClock + limb.step) * limb.stride * walk;
      if (limb.axis === X) this.euler.set(angle, 0, limb.splay * amount);
      else this.euler.set(0, 0, angle);
      for (let p = 0; p < limb.parts.length; p++) {
        this.about(limb.pivot, this.euler, limb.parts[p].matrix, limb.bases[p]);
        limb.parts[p].matrixWorldNeedsUpdate = true;
      }
    }
    const offStand = amount > 0.05 || state.fallen > 0.05 || walk > 0.05;
    for (let i = 0; i < rig.stand.length; i++) rig.stand[i].visible = !offStand;
    return true;
  }

  /** out = base turned by this rotation about a point. */
  private about(pivot: Vector3, rotation: Euler, out: Matrix4, base: Matrix4): void {
    this.spin.setFromEuler(rotation);
    this.there.makeTranslation(pivot.x, pivot.y, pivot.z);
    this.back.makeTranslation(-pivot.x, -pivot.y, -pivot.z);
    this.rotate.compose(this.zero, this.spin, this.one);
    this.matrix.multiplyMatrices(this.there, this.rotate);
    this.matrix.multiply(this.back);
    out.multiplyMatrices(this.matrix, base);
  }
}
