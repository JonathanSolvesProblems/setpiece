/**
 * What the pieces do to each other. These are rules read off where things
 * stand, not physics: rain or water over a fire puts it out, and a vehicle or
 * a creature driven into an actor knocks the actor down. Because each is
 * worked out from the blocking alone, a take plays them back the same way
 * every time.
 */
import { Box3, createSystem, Entity, Group, Mesh, Object3D, Quaternion, ShaderMaterial, Vector3 } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { ACTOR_REACH, ANIMAL_REACH, KNOCK_SPEED } from './contact.js';
import { assetByLabel, assetTitle } from './catalog.js';
import { Held, SetPiece, SetRole } from './set-components.js';
import { SquirmSystem } from './squirm.js';
import { ViewfinderSystem } from './viewfinder.js';

/** Metres a second on the slate: at 1:10 this is a car at walking pace. */
/** A piece that jumps this far in one frame was put there, not driven there. */
const JUMP = 0.12;
/** How far around itself each kind of water wets, in metres on the slate. */
// Snow is left out: a campfire keeps burning through a snowfall, and Winter camp depends on it.
const WETS: Record<string, number> = { Rain: 0.3, Water: 0.14 };
const BURNS = ['Fire', 'Embers'];
const WET_RATE = 1.6;

type Mover = { piece: Entity; box: Box3; last: Vector3; seen: boolean; vehicle: boolean };
type Fire = { piece: Entity; material: ShaderMaterial; wet: number; told: boolean };
/**
 * An animal a vehicle can tip over: its shape, half its width, how far over it is and which way.
 * Its body sits in a group of its own inside the piece, and that group is what goes over. The
 * piece itself stays upright on its mark, so nothing that reads where pieces stand (what rests on
 * what, the saved set, a recorded take) ever sees an animal lying down.
 */
type Animal = { piece: Entity; box: Box3; half: number; down: boolean; amount: number; side: number; tipper: Object3D };
const ANIMALS = new Set(['Horse', 'Wolf']);
const TIP_RATE = 7;
/** Points this far apart along an animal's outline are tried against the vehicle, in metres on the slate. */
const OUTLINE_STEP = 0.03;
const OUTLINE_MOST = 16;
const UP = new Vector3(0, 1, 0);
const NOSE = new Vector3(0, 0, 1);
/**
 * A vehicle knocks someone down when it is driven at them: going the way it points, or straight
 * back, within about 35 degrees. Slid sideways or carried across the set it does not. On the
 * headset a truck being moved out of the way put two actors and a horse on the floor.
 */
const DRIVEN = 0.82;
/** And whatever moves has to be heading for them, not past them or away. */
const HEADED = 0.3;
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
  private animals: Animal[] = [];
  private forward = new Vector3();
  private waters: { piece: Entity; reach: number }[] = [];
  private squirm: SquirmSystem | undefined;
  private at = new Vector3();
  private local = new Vector3();
  private velocity = new Vector3();
  private turn = new Quaternion();
  private lastSeconds = 0;

  init(): void {
    const g = this.globals as Globals;
    const stand = (): void => {
      this.squirm?.standAll();
      for (let n = 0; n < this.animals.length; n++) this.standUp(this.animals[n]);
    };
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
      if (assetByLabel(label)?.mover === true) {
        this.movers.push({ piece, box: localBounds(object), last: new Vector3(), seen: false, vehicle: assetByLabel(label)?.shelf === 'Vehicles' });
      }
      if (WETS[label] != null) this.waters.push({ piece, reach: WETS[label] });
      if (ANIMALS.has(assetByLabel(label)?.spareOf ?? label)) {
        const box = localBounds(object);
        // A set saved by an earlier build may have the whole piece lying on its side: back on its feet.
        if (this.forward.copy(UP).applyQuaternion(object.quaternion).y < 0.9) {
          this.forward.copy(NOSE).applyQuaternion(object.quaternion);
          object.quaternion.setFromAxisAngle(UP, Math.atan2(this.forward.x, this.forward.z));
          object.position.y = 0;
        }
        const tipper = new Group();
        tipper.name = 'Tipper';
        for (const child of [...object.children]) if (child.name !== 'GrabVolume' && child.name !== 'HoverRing') tipper.add(child);
        object.add(tipper);
        this.animals.push({ piece, box, half: (box.max.x - box.min.x) / 2, down: false, amount: 0, side: 1, tipper });
      }
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
    this.tip(delta);
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
      if (mover.vehicle) {
        this.forward.copy(NOSE).applyQuaternion(object.quaternion);
        const flat = Math.hypot(this.forward.x, this.forward.z);
        if (flat < 1e-4 || Math.abs(this.velocity.x * this.forward.x + this.velocity.z * this.forward.z) < DRIVEN * travelled * flat) continue;
      }
      const reach = ACTOR_REACH / object.scale.x;
      for (let a = 0; a < this.actors.length; a++) {
        const actor = this.actors[a];
        const body = actor.object3D!;
        if (!body.visible || body.parent !== object.parent || actor.hasComponent(Held)) continue;
        if (this.squirm?.isDown(actor)) continue;
        if (!this.headedFor(object, body, travelled)) continue;
        // Where the actor stands, as the vehicle sees it.
        object.worldToLocal(body.getWorldPosition(this.at));
        if (mover.box.distanceToPoint(this.at) > reach) continue;
        // The way it was going, as the actor sees it.
        this.local.set(this.velocity.x, 0, this.velocity.z).applyQuaternion(this.turn.copy(body.quaternion).invert());
        if (this.squirm?.knock(actor, this.local.x, this.local.z)) {
          const who = assetTitle(String(actor.getValue(SetPiece, 'label'))).toUpperCase();
          (this.globals as Globals).coachNote.value = `${who} IS DOWN | Pick them up to stand them, or press Undo.`;
        }
      }
      const animalReach = ANIMAL_REACH / object.scale.x;
      for (let n = 0; n < this.animals.length; n++) {
        const animal = this.animals[n];
        const body = animal.piece.object3D!;
        if (animal.down || animal.piece === mover.piece || !body.visible || body.parent !== object.parent || animal.piece.hasComponent(Held)) continue;
        if (!this.headedFor(object, body, travelled)) continue;
        if (!this.touches(mover, object, animal, body, animalReach)) continue;
        this.lay(animal, this.velocity.x, this.velocity.z);
      }
    }
  }

  /** Whether what moved this frame (this.velocity, over `travelled`) is heading for this body, not past it or away. */
  private headedFor(object: Object3D, body: Object3D, travelled: number): boolean {
    const x = body.position.x - object.position.x;
    const z = body.position.z - object.position.z;
    const far = Math.hypot(x, z);
    // Standing in the same spot: there is no "towards" to speak of, and it is certainly in the way.
    if (far < 1e-4) return true;
    return this.velocity.x * x + this.velocity.z * z >= HEADED * travelled * far;
  }

  /**
   * A vehicle going this way on the slate has run into this piece. A horse or a wolf goes over,
   * away from what hit it; anything else stays as it is. The roll calls this itself for the
   * animal that stopped it, since a long frame can pass the moment the two were moving and close.
   */
  tipOver(piece: Entity, x: number, z: number): boolean {
    for (let n = 0; n < this.animals.length; n++) {
      const animal = this.animals[n];
      if (animal.piece !== piece) continue;
      if (animal.down || piece.hasComponent(Held) || piece.object3D?.visible !== true) return false;
      this.lay(animal, x, z);
      return true;
    }
    return false;
  }

  /** Over on the side away from what hit it, lying the way it was facing. */
  private lay(animal: Animal, x: number, z: number): void {
    const body = animal.piece.object3D!;
    this.local.set(x, 0, z).applyQuaternion(this.turn.copy(body.quaternion).invert());
    animal.side = this.local.x >= 0 ? -1 : 1;
    animal.down = true;
    const who = assetTitle(String(animal.piece.getValue(SetPiece, 'label'))).toUpperCase();
    (this.globals as Globals).coachNote.value = `${who} IS DOWN | Pick it up to stand it, or press Undo.`;
  }

  /**
   * Whether the mover's shape comes within reach of the animal's. The animal's outline is walked
   * at half its height, in steps short enough that a vehicle meeting the middle of a flank is as
   * close to a point on it as one meeting a corner.
   */
  private touches(mover: Mover, object: Object3D, animal: Animal, body: Object3D, reach: number): boolean {
    const box = animal.box;
    const y = (box.min.y + box.max.y) / 2;
    const long = box.max.z - box.min.z;
    const wide = box.max.x - box.min.x;
    // Nowhere near: the animal's middle is further from the vehicle than its own half length and the reach together.
    this.at.set((box.min.x + box.max.x) / 2, y, (box.min.z + box.max.z) / 2);
    object.worldToLocal(body.localToWorld(this.at));
    if (mover.box.distanceToPoint(this.at) > reach + (Math.hypot(long, wide) / 2) * (body.scale.x / object.scale.x)) return false;
    const step = OUTLINE_STEP / body.scale.x;
    const rows = Math.min(OUTLINE_MOST, Math.max(2, Math.ceil(long / step)));
    const columns = Math.min(OUTLINE_MOST, Math.max(1, Math.ceil(wide / step)));
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= columns; j++) {
        this.at.set(box.min.x + (wide * j) / columns, y, box.min.z + (long * i) / rows);
        object.worldToLocal(body.localToWorld(this.at));
        if (mover.box.distanceToPoint(this.at) <= reach) return true;
      }
    }
    return false;
  }

  /** A tipped animal goes over onto its side; a hand that picks it up has it back on its feet. */
  private tip(delta: number): void {
    for (let n = 0; n < this.animals.length; n++) {
      const animal = this.animals[n];
      if (!animal.down) continue;
      const body = animal.piece.object3D!;
      if (animal.piece.hasComponent(Held) || !body.visible) {
        this.standUp(animal);
        continue;
      }
      if (animal.amount >= 1) continue;
      animal.amount = Math.min(1, animal.amount + delta * TIP_RATE);
      this.pose(animal);
    }
  }

  /** The body inside its piece: rolled about its own length, and lifted so the side it lies on rests on the floor. */
  private pose(animal: Animal): void {
    const tipper = animal.tipper;
    tipper.quaternion.setFromAxisAngle(NOSE, (animal.side * animal.amount * Math.PI) / 2);
    tipper.position.y = animal.half * animal.amount;
    // The tray stops a piece's parts working their matrices out; this one moves, so it is worked out here.
    tipper.updateMatrix();
    this.world.getSystem(ViewfinderSystem)?.refresh();
  }

  private standUp(animal: Animal): void {
    if (!animal.down) return;
    animal.down = false;
    animal.amount = 0;
    this.pose(animal);
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
