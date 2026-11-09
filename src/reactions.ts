/**
 * What the pieces do to each other. These are rules read off where things
 * stand, not physics: rain or water over a fire puts it out, and a vehicle or
 * a creature driven into an actor knocks the actor down. Because each is
 * worked out from the blocking alone, a take plays them back the same way
 * every time.
 */
import { Box3, createSystem, Entity, Mesh, Quaternion, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { ACTOR_REACH, KNOCK_SPEED } from './contact.js';
import { assetByLabel, assetTitle } from './catalog.js';
import { Held, SetPiece, SetRole } from './set-components.js';
import { SquirmSystem } from './squirm.js';

/** Metres a second on the slate: at 1:10 this is a car at walking pace. */
/** A piece that jumps this far in one frame was put there, not driven there. */
const JUMP = 0.12;
/** How far around itself each kind of water wets, in metres on the slate. */
// Snow is left out: a campfire keeps burning through a snowfall, and Winter camp depends on it.
const WETS: Record<string, number> = { Rain: 0.3, Water: 0.14 };
const BURNS = ['Fire', 'Embers'];
const WET_RATE = 1.6;

type Mover = { piece: Entity; box: Box3; last: Vector3; seen: boolean };
type Fire = { piece: Entity; material: ShaderMaterial; wet: number; told: boolean };
type Globals = {
  coachNote: Signal<string>;
  takeState: Signal<string>;
  takeSeconds: Signal<number>;
  newBoardRequested: Signal<number>;
  setupRecalled: Signal<number>;
};

export class ReactionsSystem extends createSystem({
  pieces: { required: [SetPiece] },
}) {
  private ready = false;
  private movers: Mover[] = [];
  private actors: Entity[] = [];
  private fires: Fire[] = [];
  private waters: { piece: Entity; reach: number }[] = [];
  private squirm: SquirmSystem | undefined;
  private at = new Vector3();
  private local = new Vector3();
  private velocity = new Vector3();
  private turn = new Quaternion();
  private lastSeconds = 0;

  init(): void {
    const g = this.globals as Globals;
    const stand = (): void => this.squirm?.standAll();
    this.cleanupFuncs.push(
      g.takeState.subscribe(stand),
      // A take that loops starts again with everyone on their feet.
      g.takeSeconds.subscribe((seconds) => {
        if (seconds < this.lastSeconds - 0.5) stand();
        this.lastSeconds = seconds;
      }),
      g.newBoardRequested.subscribe(stand),
      g.setupRecalled.subscribe(stand),
    );
  }

  private prepare(): boolean {
    for (const piece of this.queries.pieces.entities) if (piece.object3D == null) return false;
    this.squirm = this.world.getSystem(SquirmSystem);
    for (const piece of this.queries.pieces.entities) {
      const label = String(piece.getValue(SetPiece, 'label'));
      const role = piece.getValue(SetPiece, 'role');
      const object = piece.object3D!;
      if (role === SetRole.Actor) this.actors.push(piece);
      if (assetByLabel(label)?.mover === true) this.movers.push({ piece, box: localBounds(object), last: new Vector3(), seen: false });
      if (WETS[label] != null) this.waters.push({ piece, reach: WETS[label] });
      if (BURNS.includes(label)) {
        object.traverse((part) => {
          if (part.name === 'EffectParticles') this.fires.push({ piece, material: (part as Mesh).material as ShaderMaterial, wet: 0, told: false });
        });
      }
    }
    return true;
  }

  update(delta: number): void {
    if (!this.ready) {
      this.ready = this.prepare();
      return;
    }
    if (delta <= 0) return;
    this.knockDown(delta);
    this.putOut(delta);
  }

  private knockDown(delta: number): void {
    for (let m = 0; m < this.movers.length; m++) {
      const mover = this.movers[m];
      const object = mover.piece.object3D!;
      if (!object.visible) {
        mover.seen = false;
        continue;
      }
      this.velocity.copy(object.position).sub(mover.last);
      mover.last.copy(object.position);
      if (!mover.seen) {
        mover.seen = true;
        continue;
      }
      const travelled = Math.hypot(this.velocity.x, this.velocity.z);
      if (travelled > JUMP || travelled / delta < KNOCK_SPEED) continue;
      const reach = ACTOR_REACH / object.scale.x;
      for (let a = 0; a < this.actors.length; a++) {
        const actor = this.actors[a];
        const body = actor.object3D!;
        if (!body.visible || body.parent !== object.parent || actor.hasComponent(Held)) continue;
        if (this.squirm?.isDown(actor)) continue;
        // Where the actor stands, as the vehicle sees it.
        object.worldToLocal(body.getWorldPosition(this.at));
        if (mover.box.distanceToPoint(this.at) > reach) continue;
        // The way it was going, as the actor sees it.
        this.local.set(this.velocity.x, 0, this.velocity.z).applyQuaternion(this.turn.copy(body.quaternion).invert());
        if (this.squirm?.knock(actor, this.local.x, this.local.z)) {
          const who = assetTitle(String(actor.getValue(SetPiece, 'label'))).toUpperCase();
          (this.globals as Globals).coachNote.value = `${who} IS DOWN | Pick them up to stand them again.`;
        }
      }
    }
  }

  private putOut(delta: number): void {
    for (let f = 0; f < this.fires.length; f++) {
      const fire = this.fires[f];
      const object = fire.piece.object3D!;
      if (!object.visible) continue;
      let wet = false;
      for (let w = 0; w < this.waters.length && !wet; w++) {
        const water = this.waters[w].piece.object3D!;
        if (!water.visible || water.parent !== object.parent) continue;
        const reach = this.waters[w].reach * water.scale.x;
        wet = Math.hypot(water.position.x - object.position.x, water.position.z - object.position.z) < reach;
      }
      const target = wet ? 1 : 0;
      if (fire.wet === target) continue;
      const step = WET_RATE * delta;
      fire.wet = wet ? Math.min(1, fire.wet + step) : Math.max(0, fire.wet - step * 0.5);
      fire.material.uniforms.uWet.value = fire.wet;
      if (wet && !fire.told) {
        fire.told = true;
        (this.globals as Globals).coachNote.value = 'THE FIRE IS OUT | Water put it out. Move the water away and it catches again.';
      }
      if (!wet && fire.wet === 0) fire.told = false;
    }
  }
}
