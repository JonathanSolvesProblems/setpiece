/**
 * The pieces on the slate. A piece you let go of stands itself up: an actor or
 * the creature's stand drops to the slate and straightens, the camera
 * straightens and keeps the height you gave it, because a high or a low angle
 * is a choice. Each piece knocks softly when it is lifted and when it lands.
 * Where every piece stands is kept between visits.
 *
 * Two ways to take a piece. From afar the hand's ray and a pinch, as ever. Up
 * close, the way anyone reaches for a miniature: put the fingers on it and pinch,
 * or close the hand around it, with a controller's grip or trigger doing the
 * same. Near a piece the ray steps aside, so what the hand is on is what it gets.
 */
import {
  AudioSource,
  AudioUtils,
  Box3,
  createSystem,
  CylinderGeometry,
  DoubleSide,
  Entity,
  Grabbed,
  GrabSystem,
  Hovered,
  InputComponent,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  RingGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { assetByLabel } from './catalog.js';
import { HandReading } from './hand-reading.js';
import { HandTurn } from './hand-turn.js';
import { CAMERA_TILT_LIMIT, Cue, Held, SetPiece, SetRole, ShotCamera, SoundCue } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';

/** A piece carried further than this from the slate's centre goes back to where it started. */
const MAX_FROM_CENTRE = 0.8;
/** A camera let go this close to the slate stands on it; higher, it stays up, as on a crane. */
const CAMERA_FLOOR_SNAP = 0.03;
const CAMERA_MAX_HEIGHT = 0.45;
const UP = new Vector3(0, 1, 0);
/**
 * A lay figure is a few centimetres of thin wood and a tripod is thinner. Each
 * piece carries an unseen cylinder, radius then height in metres, that the
 * hand ray or a pinch right on the piece can catch: a near miss still picks
 * the piece up, and a hand closed around it is inside the cylinder.
 */
const GRAB_VOLUME: Record<string, [number, number]> = {
  [SetRole.Actor]: [0.04, 0.2],
  [SetRole.Creature]: [0.035, 0.36],
  [SetRole.Camera]: [0.045, 0.19],
};
/** A wrist turns about a quarter turn in comfort; this makes that most of a half turn. */
const TURN_GAIN = 1.8;
/**
 * The camera is aimed, not just faced: it follows the hand closely, so a small
 * correction of the wrist is a small correction of the frame.
 */
const CAMERA_TURN_GAIN = 1.3;
const TILT_GAIN = 1.0;
/**
 * The camera tilts itself at the nearest actor until a hand tilts it. A hand
 * has to ask for this much tilt in one hold before it takes over, so carrying
 * the camera across the set does not switch the aim off by accident.
 */
const TILT_TAKEOVER = 0.1;
/**
 * The pinch that answered the headset's own prompt is often still closed when
 * the session appears. For this long after it does, a grab is not a choice.
 */
const INPUT_GUARD_SECONDS = 0.8;
const OPTIC_YELLOW = 0xd6e13c;
/** How close a hand has to be to a piece to take it, and how far it has to go to stop being near. */
const REACH = 0.035;
const REACH_RELEASE = 0.06;
/** Hand tracking drops out for a moment when fingers close: a held piece waits this long for it. */
const LOST_HAND_SECONDS = 0.5;
const HAND_SMOOTHING = 45;
/** A piece let go above the slate falls to it. */
const FALL = 5;
const FALL_FROM = 0.015;
const NO_RAYCAST = (): void => {};

/** Position then quaternion, in the stage's own space. */
type Pose = number[];
type SavedPieces = Record<string, Pose>;
type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];
type Carry = { piece: Entity; by: 'pinch' | 'fist' | 'pad'; offset: Vector3; at: Vector3; lost: number };
type Drop = { piece: Entity; speed: number };
type Globals = {
  newBoardRequested: Signal<number>;
  coachTarget: Signal<string>;
  setupRecalled: Signal<number>;
  cameraRig: Signal<string>;
  takeState: Signal<string>;
};
/** A flown camera stays where it is let go, between these heights. */
const DRONE_MIN_HEIGHT = 0.2;
const DRONE_MAX_HEIGHT = 1.1;
/** The ring under the piece the call sheet is asking for breathes this much, this fast. */
const BECKON_SWELL = 0.22;
const BECKON_RATE = 5;

const isPose = (value: unknown): value is Pose =>
  Array.isArray(value) && value.length === 7 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

export class PiecesSystem extends createSystem({
  pieces: { required: [SetPiece] },
  grabbed: { required: [SetPiece, Grabbed] },
  held: { required: [SetPiece, Held] },
  cues: { required: [SoundCue, AudioSource] },
}) {
  private authored = new Map<string, Pose>();
  private released: Entity[] = [];
  /** The pieces that can be held, with each one's hover mark and wrist follower, by index. */
  private dressed: Entity[] = [];
  private rings: Mesh[] = [];
  private turns: HandTurn[] = [];
  /** Grabs that began inside the guard window and were let go at once. */
  private ignored = new Set<Entity>();
  private guard = 0;
  private grab: GrabSystem | undefined;
  private volumeMaterial = new MeshBasicMaterial({ visible: false, side: DoubleSide });
  private ringMaterial = new MeshBasicMaterial({ color: OPTIC_YELLOW, toneMapped: false });
  private ready = false;
  private boardSeen = 0;
  private forward = new Vector3();
  private upright = new Quaternion();
  private right = new Vector3();
  private rigTurn = new Quaternion();
  /** The space each piece fills, in its own frame, by index with `dressed`. */
  private bounds: Box3[] = [];
  private readings: Record<Side, HandReading> = { left: new HandReading(), right: new HandReading() };
  private carrying: Record<Side, Carry | null> = { left: null, right: null };
  /** The piece each hand is on, by index, or -1. */
  private near: Record<Side, number> = { left: -1, right: -1 };
  private rayAside: Record<Side, boolean> = { left: false, right: false };
  private drops: Drop[] = [];
  private point = new Vector3();
  private local = new Vector3();
  private padAt = new Vector3();

  init(): void {
    const g = this.globals as Globals;
    this.grab = this.world.getSystem(GrabSystem);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (state === VisibilityState.Visible) this.guard = INPUT_GUARD_SECONDS;
      }),
      this.queries.grabbed.subscribe('qualify', (piece) => {
        if (this.isStage(piece)) return;
        if (this.guard > 0) {
          this.ignored.add(piece);
          this.grab?.forceRelease(piece);
          return;
        }
        if (!piece.hasComponent(Held)) piece.addComponent(Held);
      }),
      this.queries.grabbed.subscribe('disqualify', (piece) => {
        if (this.isStage(piece)) return;
        if (this.ignored.delete(piece)) return;
        if (this.sideCarrying(piece) == null && piece.hasComponent(Held)) piece.removeComponent(Held);
      }),
      this.queries.held.subscribe('qualify', (piece) => this.knock(Cue.Pick, piece)),
      // The grab writes the piece's pose once more as it lets go, so settle on the next update.
      this.queries.held.subscribe('disqualify', (piece) => this.released.push(piece)),
      g.newBoardRequested.subscribe((n) => {
        if (n > this.boardSeen) {
          this.boardSeen = n;
          this.backToStart();
        }
      }),
      // Poses during a take belong to the take; the blocking is kept once it is over.
      g.takeState.subscribe((state) => {
        if (state === 'idle' && this.ready) this.save();
      }),
      // The card sent every piece back to a frame's setup: that is the blocking to keep now.
      g.setupRecalled.subscribe((n) => {
        if (n > 0 && this.ready) {
          this.knock(Cue.Place, this.dressed[0]);
          this.save();
        }
      }),
    );
  }

  update(delta: number, time: number): void {
    if (!this.ready) {
      this.ready = this.captureAndRestore();
      return;
    }
    if (this.guard > 0) this.guard -= delta;
    this.reachWith('left', delta);
    this.reachWith('right', delta);
    this.followHands(delta, time);
    if (this.drops.length > 0) this.fall(delta);
    if (this.released.length === 0) return;
    for (const piece of this.released) {
      if (piece.object3D == null) continue;
      this.settle(piece);
    }
    this.released.length = 0;
    this.save();
  }

  private sideCarrying(piece: Entity): Side | null {
    if (this.carrying.left?.piece === piece) return 'left';
    if (this.carrying.right?.piece === piece) return 'right';
    return null;
  }

  /** The ray is already holding something for this hand: it is not reaching for anything else. */
  private rayBusy(side: Side): boolean {
    for (const entity of this.queries.grabbed.entities) if (this.grab?.getHolderHand(entity) === side) return true;
    return false;
  }

  private setRayAside(side: Side, aside: boolean): void {
    if (this.rayAside[side] === aside) return;
    // A pinch already closed on the ray stays with the ray until it lets go.
    if (aside && this.input.xr.gamepads[side]?.getSelecting()) return;
    this.rayAside[side] = aside;
    this.input.xr.multiPointers[side].toggleSubPointer('ray', !aside);
  }

  /** The nearest piece this point is on, by index, or -1. */
  private nearestTo(point: Vector3, reach: number): number {
    const lifeSize = (this.globals as { lifeSize?: Signal<boolean> }).lifeSize?.peek() === true;
    if (lifeSize) return -1;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const object = piece.object3D;
      if (object == null || !object.visible || object.parent?.visible !== true) continue;
      if ((object as { pointerEvents?: string }).pointerEvents === 'none') continue;
      if (piece.hasComponent(Held)) continue;
      object.worldToLocal(this.local.copy(point));
      const box = this.bounds[i];
      const gap = box.distanceToPoint(this.local);
      if (gap > reach) continue;
      // Inside two pieces at once, the one whose middle is closest.
      box.getCenter(this.point);
      const score = gap + 0.01 * this.point.distanceTo(this.local);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return best;
  }

  /** One hand, up close: is it on a piece, did it just close on one, is it carrying one. */
  private reachWith(side: Side, delta: number): void {
    const xr = this.input.xr;
    const reading = this.readings[side];
    const pad = xr.gamepads[side];
    const byHand = xr.isPrimary('hand', side);
    let pinchAt = this.padAt;
    let fistAt = this.padAt;
    let live = true;
    if (byHand) {
      const renderer = this.world.renderer;
      const frame = renderer.xr.getFrame?.();
      const base = renderer.xr.getReferenceSpace();
      if (frame != null && base != null) reading.read(frame, base, xr.getPrimaryInputSource(side), this.player);
      else reading.tracked = false;
      live = reading.tracked;
      pinchAt = reading.pinchAt;
      fistAt = reading.fistAt;
    } else if (xr.isPrimary('controller', side)) {
      this.player.gripSpaces[side].getWorldPosition(this.padAt);
    } else {
      live = false;
    }

    const carry = this.carrying[side];
    if (carry != null) {
      this.carry(side, carry, byHand, live, carry.by === 'fist' ? fistAt : pinchAt, delta);
      return;
    }
    if (!live || this.rayBusy(side)) {
      this.near[side] = -1;
      this.setRayAside(side, false);
      return;
    }
    const reach = this.near[side] >= 0 ? REACH_RELEASE : REACH;
    let index = this.nearestTo(pinchAt, reach);
    let fromFist = false;
    if (index < 0 && byHand) {
      index = this.nearestTo(fistAt, reach);
      fromFist = index >= 0;
    }
    this.near[side] = index;
    this.setRayAside(side, index >= 0);
    if (index < 0 || this.guard > 0) return;
    const pinched = pad?.getSelectStart() === true;
    const fisted = byHand && reading.fistStart;
    const squeezed = !byHand && pad?.getButtonDown(InputComponent.Squeeze) === true;
    if (!pinched && !fisted && !squeezed) return;
    const by: Carry['by'] = !byHand ? 'pad' : fisted && !pinched ? 'fist' : 'pinch';
    const point = by === 'fist' || fromFist ? fistAt : pinchAt;
    this.take(side, this.dressed[index], by, by === 'pinch' && fromFist ? pinchAt : point);
  }

  private take(side: Side, piece: Entity, by: Carry['by'], point: Vector3): void {
    const object = piece.object3D!;
    object.getWorldPosition(this.point);
    this.carrying[side] = { piece, by, offset: this.point.clone().sub(point), at: point.clone(), lost: 0 };
    this.near[side] = -1;
    piece.addComponent(Held);
  }

  private carry(side: Side, carry: Carry, byHand: boolean, live: boolean, point: Vector3, delta: number): void {
    const pad = this.input.xr.gamepads[side];
    let letGo: boolean;
    if (!byHand) letGo = !live || (pad?.getSelecting() !== true && pad?.getButtonPressed(InputComponent.Squeeze) !== true);
    else if (carry.by === 'fist') letGo = live && !this.readings[side].shut;
    else letGo = pad != null && !pad.getSelecting();
    carry.lost = live ? 0 : carry.lost + delta;
    if (letGo || carry.lost > LOST_HAND_SECONDS || carry.piece.object3D == null) {
      this.carrying[side] = null;
      this.setRayAside(side, false);
      if (carry.piece.hasComponent(Held)) carry.piece.removeComponent(Held);
      return;
    }
    this.setRayAside(side, true);
    if (!live) return;
    carry.at.lerp(point, Math.min(1, delta * HAND_SMOOTHING));
    const object = carry.piece.object3D;
    this.point.copy(carry.at).add(carry.offset);
    object.parent?.worldToLocal(this.point);
    object.position.copy(this.point);
  }

  /** A piece let go in the air drops to the slate and knocks when it gets there. */
  private fall(delta: number): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const drop = this.drops[i];
      const object = drop.piece.object3D;
      if (object == null || drop.piece.hasComponent(Held)) {
        this.drops.splice(i, 1);
        continue;
      }
      drop.speed += FALL * delta;
      object.position.y -= drop.speed * delta;
      if (object.position.y > 0) continue;
      object.position.y = 0;
      this.knock(Cue.Place, drop.piece);
      this.drops.splice(i, 1);
      if (this.drops.length === 0) this.save();
    }
  }

  private isStage(piece: Entity): boolean {
    return piece.getValue(SetPiece, 'role') === SetRole.Stage;
  }

  /**
   * Mark the piece the hand is on, and turn a held piece with the wrist that
   * holds it. The grab itself only carries: it moves the piece with the hand.
   */
  private followHands(delta: number, time: number): void {
    // The call sheet names one kind of piece at a time; the first of that kind is the one marked.
    const wanted = (this.globals as Globals).coachTarget.peek();
    let beckoned = false;
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const held = piece.hasComponent(Held);
      const touched = held || piece.hasComponent(Hovered) || this.near.left === i || this.near.right === i;
      const beckon = !beckoned && wanted !== '' && piece.object3D?.visible === true && piece.getValue(SetPiece, 'role') === wanted;
      if (beckon) beckoned = true;
      const ring = this.rings[i];
      ring.visible = touched || beckon;
      ring.scale.setScalar(beckon && !touched ? 1 + BECKON_SWELL * (0.5 + 0.5 * Math.sin(time * BECKON_RATE)) : 1);
      const turn = this.turns[i];
      if (!held) {
        if (turn.active) turn.end();
        continue;
      }
      if (!turn.active) {
        const side = this.sideCarrying(piece) ?? this.grab?.getHolderHand(piece);
        if (side != null) turn.begin(this.player.gripSpaces[side]);
      }
      const object = piece.object3D;
      if (object == null) continue;
      if (!piece.hasComponent(ShotCamera)) {
        turn.apply(object, delta, TURN_GAIN);
        continue;
      }
      // The camera also tilts, about its own left-to-right axis.
      this.right.set(1, 0, 0).applyQuaternion(object.getWorldQuaternion(this.rigTurn));
      turn.apply(object, delta, CAMERA_TURN_GAIN, this.right, TILT_GAIN);
      const aimed = piece.getValue(ShotCamera, 'aimed') === true;
      if (!aimed && Math.abs(turn.tiltAsked) < TILT_TAKEOVER) continue;
      if (!aimed) piece.setValue(ShotCamera, 'aimed', true);
      if (turn.tiltStep !== 0) {
        const tilt = (piece.getValue(ShotCamera, 'tilt') ?? 0) + turn.tiltStep;
        piece.setValue(ShotCamera, 'tilt', Math.max(-CAMERA_TILT_LIMIT, Math.min(CAMERA_TILT_LIMIT, tilt)));
      }
    }
  }

  /** The unseen cylinder that makes a piece easy to catch, and the ring that says it is caught. */
  private dress(piece: Entity): void {
    const object = piece.object3D!;
    const size =
      assetByLabel(String(piece.getValue(SetPiece, 'label')))?.grab ?? GRAB_VOLUME[piece.getValue(SetPiece, 'role') as string];
    if (size == null) return;
    const [radius, height] = size;
    this.bounds.push(this.boundsOf(object, radius, height));
    const volume = new Mesh(new CylinderGeometry(radius, radius, height, 14, 1), this.volumeMaterial);
    volume.name = 'GrabVolume';
    volume.position.y = height / 2;
    const ring = new Mesh(new RingGeometry(radius * 0.9, radius * 1.1, 40), this.ringMaterial);
    ring.name = 'HoverRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.0045;
    ring.visible = false;
    ring.raycast = NO_RAYCAST;
    object.add(volume, ring);
    this.world.getSystem(ViewfinderSystem)?.hideFromLens(ring);
    this.dressed.push(piece);
    this.rings.push(ring);
    this.turns.push(new HandTurn());
  }

  /** The piece's own shape, and the grab zone around it, in the piece's frame. */
  private boundsOf(object: Object3D, radius: number, height: number): Box3 {
    const box = new Box3();
    const part = new Box3();
    const toPiece = new Matrix4();
    object.updateWorldMatrix(true, true);
    const inverse = object.matrixWorld.clone().invert();
    object.traverse((child) => {
      if (!(child instanceof Mesh) || child.name === 'EffectParticles') return;
      const geometry = child.geometry;
      if (geometry.boundingBox == null) geometry.computeBoundingBox();
      if (geometry.boundingBox == null) return;
      box.union(part.copy(geometry.boundingBox).applyMatrix4(toPiece.multiplyMatrices(inverse, child.matrixWorld)));
    });
    box.expandByPoint(this.local.set(radius, height, radius));
    box.expandByPoint(this.local.set(-radius, 0, -radius));
    return box;
  }

  private key(piece: Entity): string {
    return `${piece.getValue(SetPiece, 'role')}:${piece.getValue(SetPiece, 'label')}`;
  }

  /**
   * Runs until every piece has its object: remember where the scene put each
   * one, then move it to where the last visit left it.
   */
  private captureAndRestore(): boolean {
    let count = 0;
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece)) continue;
      if (piece.object3D == null) return false;
      count++;
    }
    if (count === 0) return false;
    const saved = loadJson<SavedPieces>(StoreKey.Pieces);
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece)) continue;
      const object = piece.object3D!;
      const key = this.key(piece);
      this.authored.set(key, [...object.position.toArray(), ...(object.quaternion.toArray() as number[])]);
      const pose = saved?.[key];
      if (isPose(pose)) this.apply(piece, pose);
      if (piece.hasComponent(ShotCamera)) {
        const camera = loadJson<{ tilt: number; aimed: boolean }>(StoreKey.Camera);
        if (camera?.aimed === true && Number.isFinite(camera.tilt)) {
          piece.setValue(ShotCamera, 'tilt', Math.max(-CAMERA_TILT_LIMIT, Math.min(CAMERA_TILT_LIMIT, camera.tilt)));
          piece.setValue(ShotCamera, 'aimed', true);
        }
      }
      this.dress(piece);
    }
    return true;
  }

  private apply(piece: Entity, pose: Pose): void {
    const object = piece.object3D!;
    object.position.fromArray(pose, 0);
    object.quaternion.fromArray(pose, 3);
  }

  /** Stand the piece up where it was let go, facing the way it was turned. */
  private settle(piece: Entity): void {
    const object = piece.object3D!;
    const authored = this.authored.get(this.key(piece));
    if (authored && Math.hypot(object.position.x, object.position.z) > MAX_FROM_CENTRE) {
      this.apply(piece, authored);
      this.knock(Cue.Place, piece);
      return;
    }
    this.forward.set(0, 0, 1).applyQuaternion(object.quaternion);
    object.quaternion.copy(this.upright.setFromAxisAngle(UP, Math.atan2(this.forward.x, this.forward.z)));
    if (piece.getValue(SetPiece, 'role') === SetRole.Camera) {
      const y = object.position.y;
      if ((this.globals as Globals).cameraRig.peek() === 'drone') {
        object.position.y = Math.max(DRONE_MIN_HEIGHT, Math.min(y, DRONE_MAX_HEIGHT));
      } else {
        object.position.y = y < CAMERA_FLOOR_SNAP ? 0 : Math.min(y, CAMERA_MAX_HEIGHT);
      }
      this.knock(Cue.Place, piece);
    } else if (object.position.y > FALL_FROM) {
      this.drops.push({ piece, speed: 0 });
    } else {
      object.position.y = 0;
      this.knock(Cue.Place, piece);
    }
  }

  /** The knock comes from the piece: the cue's source sits beside it under the stage. */
  private knock(cue: string, piece: Entity): void {
    const at = piece.object3D;
    for (const source of this.queries.cues.entities) {
      if (source.getValue(SoundCue, 'cue') !== cue) continue;
      if (at != null && source.object3D != null) source.object3D.position.copy(at.position);
      AudioUtils.play(source);
      return;
    }
  }

  private save(): void {
    if ((this.globals as Globals).takeState.peek() !== 'idle') return;
    const poses: SavedPieces = {};
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      if (object == null || this.isStage(piece)) continue;
      poses[this.key(piece)] = [...object.position.toArray(), ...(object.quaternion.toArray() as number[])];
      if (piece.hasComponent(ShotCamera)) {
        saveJson(StoreKey.Camera, {
          tilt: piece.getValue(ShotCamera, 'tilt') ?? 0,
          aimed: piece.getValue(ShotCamera, 'aimed') === true,
        });
      }
    }
    saveJson(StoreKey.Pieces, poses);
  }

  /** A new board starts from the scene's own blocking. */
  private backToStart(): void {
    clearKey(StoreKey.Pieces);
    clearKey(StoreKey.Camera);
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece) || piece.object3D == null) continue;
      const authored = this.authored.get(this.key(piece));
      if (authored) this.apply(piece, authored);
      if (piece.hasComponent(ShotCamera)) {
        // The camera goes back to aiming itself.
        piece.setValue(ShotCamera, 'aimed', false);
        piece.setValue(ShotCamera, 'tilt', 0);
      }
    }
  }
}
