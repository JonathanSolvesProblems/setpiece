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
  CapsuleGeometry,
  createSystem,
  CylinderGeometry,
  Group,
  DoubleSide,
  Entity,
  Grabbed,
  GrabSystem,
  Hovered,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  Raycaster,
  RingGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Intersection, UIKitMLAsset } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { assetByLabel, assetTitle } from './catalog.js';
import { ACTOR_REACH, KNOCK_SPEED } from './contact.js';
import { HandReading } from './hand-reading.js';
import { HandTurn } from './hand-turn.js';
import { CAMERA_TILT_LIMIT, Cue, Held, SetPiece, SetRole, ShotCamera, SoundCue } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';
import { SquirmSystem } from './squirm.js';
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
const THIN_REACH = 0.045;
/** Hand tracking drops out for a moment when fingers close: a held piece waits this long for it. */
/** Half a vehicle's length along its nose, from its own shape, at its size on the set. */
function localBoundsDepth(box: Box3 | null | undefined, object: Object3D): number {
  if (box == null) return 0.1 * object.scale.x;
  return Math.max(Math.abs(box.max.z), Math.abs(box.min.z)) * object.scale.x;
}

const LOST_HAND_SECONDS = 0.5;
/**
 * A vehicle let go while it is moving rolls on, the way a toy car does when it
 * is pushed and released: along the way it is facing, slowing as it goes, until
 * it stops, meets the slate's edge or runs into something solid. Speeds are in
 * metres a second on the slate, so 0.1 here is 1 m/s on the real set.
 */
const ROLLING_VEHICLES = new Set(['Car', 'Van', 'Motorbike', 'Truck', 'Pickup', 'Bus', 'Bicycle', 'Tank']);
const ROLL_FROM = 0.12;
const ROLL_TOP = 0.9;
const ROLL_FRICTION = 0.2;
const ROLL_STOP = 0.015;
/** The longest step a roll takes at once, and the most of one frame it will make up. */
const ROLL_STEP = 1 / 60;
const ROLL_LONGEST_FRAME = 0.5;
/** How quickly the measured speed of a held piece follows its last moves, per second. */
const SPEED_FOLLOW = 30;
/** Seconds a push is remembered after the hand slows. */
const PUSH_MEMORY = 0.2;
/**
 * At the moment of letting go, the hand must still be moving at least this share of its
 * push. A hand that stopped reads near zero within a tenth of a second, so this only
 * decides pushes the hand was easing off from.
 */
const STILL_MOVING = 0.4;
/** The slate's half size, in metres on the stage. */
const SLATE_HALF_X = 0.3;
const SLATE_HALF_Z = 0.2;
/** A roll stops this far inside the knock-down rule's reach, so a take plays the contact back. */
const CONTACT_INSET = 0.002;
/** A push let go this close above the slate rolls on once it lands; from higher, it just lands. */
const LOW_DROP = 0.05;
/** What a roll goes through: effects, the kit, and the cast, who are met as actors instead. */
const ROLL_THROUGH = new Set(['Effects', 'Kit', 'Cast']);
/** A roll stops this short of a piece in its way, and its leading end is probed this often across its width. */
const ROLL_MARGIN = 0.02;
const ROLL_PROBES = 2;
/** Scaled past this, a piece is too large for being near it to mean reaching for it. */
const OVERSIZE = 1.2;
/**
 * A turning wrist hides the fingertips from the headset, and the browser reports
 * the pinch gone for a moment while the fingers are still together. So a hold ends
 * when the fingers are seen apart, or when the pinch stays gone for a while.
 */
const FINGERS_APART = 0.04;
const OPENING_SECONDS = 0.06;
const PINCH_GONE_SECONDS = 0.3;
const FIST_OPEN_SECONDS = 0.12;
const HAND_SMOOTHING = 45;
/** A piece let go above the slate falls to it. */
const FALL = 5;
const FALL_FROM = 0.015;
/** Let go this far below the top of something, a piece goes beside or inside it, not onto it. */
const STACK_SLACK = 0.03;
const NO_RAYCAST = (): void => {};
/** The ghost pinch over the piece the call sheet is asking for: a finger and a thumb, closing. */
const GHOST_RATE = 2.4;
const GHOST_OPEN = 0.5;
const GHOST_SHUT = 0.1;
const GHOST_ABOVE = 0.012;
/** The camera whose tilt is kept between visits. */
const FIRST_CAMERA = 'camera:Camera';

/** Position then quaternion, in the stage's own space. */
type Pose = number[];
type SavedPieces = Record<string, Pose>;
type Side = 'left' | 'right';
const SIDES: Side[] = ['left', 'right'];
type Carry = { piece: Entity; by: 'pinch' | 'fist' | 'pad'; offset: Vector3; at: Vector3; lost: number; opening: number };
type Drop = { piece: Entity; speed: number; floor: number; roll?: number };
/** A second hand on a held piece: which hand, how far apart the two were when it closed, and the size then. */
type Stretch = { side: Side; piece: Entity; from: number; scale: number; offset: Vector3; opening: number; lost: number; told: number };
type Globals = {
  newBoardRequested: Signal<number>;
  coachTarget: Signal<string>;
  setupRecalled: Signal<number>;
  coachNote: Signal<string>;
  cameraRig: Signal<string>;
  takeState: Signal<string>;
  trayOn: Signal<string[]>;
  layoutChanged: Signal<number>;
  sizedByHand: Signal<{ label: string; scale: number } | null>;
};
/** A second hand pinching a held piece sizes it: how near that hand must be, and how small and big a piece goes. */
const STRETCH_REACH = 0.07;
const STRETCH_MIN = 0.4;
const STRETCH_MAX = 3;
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
  /** Each dressed piece's speed while held, in stage metres a second, and where it was the frame before. */
  private heldSpeed: Vector3[] = [];
  private heldLast: Vector3[] = [];
  private heldNow: Vector3[] = [];
  private heldSeen: boolean[] = [];
  /** Vehicles rolling on after being let go: index into dressed, and signed speed along their nose. */
  private rolling: { index: number; speed: number }[] = [];
  private nose = new Vector3();
  private probe = new Vector3();
  private turnBack = new Quaternion();
  private side = new Vector3();
  /** Where the actor in a rolling vehicle's path stands: ahead of its leading end, and out from its side. */
  private aheadFwd = 0;
  private aheadLat = 0;
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
  /** The shape of each piece that others can be set down on, by index; null for the rest. */
  private solids: (Box3 | null)[] = [];
  /** The shape a rolling vehicle stops against, for every piece that has one: not an effect, an actor or a camera. */
  private blockers: (Box3 | null)[] = [];
  /** How far each piece reaches from its own origin, by index: a quick way to rule a hand out. */
  private spans: number[] = [];
  private readings: Record<Side, HandReading> = { left: new HandReading(), right: new HandReading() };
  private carrying: Record<Side, Carry | null> = { left: null, right: null };
  private stretch: Stretch | null = null;
  private panelRay = new Raycaster();
  private panelHits: Intersection[] = [];
  /** The piece each hand is on, by index, or -1. */
  private near: Record<Side, number> = { left: -1, right: -1 };
  private rayAside: Record<Side, boolean> = { left: false, right: false };
  private drops: Drop[] = [];
  private ghost: Group | null = null;
  private ghostFinger: Mesh | null = null;
  private ghostThumb: Mesh | null = null;
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
        // A hand already has it: the other hand's ray does not get to pull on it as well.
        if (this.guard > 0 || this.sideCarrying(piece) != null) {
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
      this.queries.held.subscribe('qualify', (piece) => {
        this.knock(Cue.Pick, piece);
        this.dropRiders(piece);
      }),
      // The grab writes the piece's pose once more as it lets go, so settle on the next update.
      this.queries.held.subscribe('disqualify', (piece) => this.released.push(piece)),
      g.trayOn.subscribe(() => {
        if (this.ready) this.setChanged();
      }),
      // The tray put something down where there was room: that is where it stands now.
      g.layoutChanged.subscribe((n) => {
        if (n > 0 && this.ready) this.save();
      }),
      g.newBoardRequested.subscribe((n) => {
        if (n > this.boardSeen) {
          this.boardSeen = n;
          this.backToStart();
        }
      }),
      // Poses during a take belong to the take; the blocking is kept once it is over.
      g.takeState.subscribe((state) => {
        // A take that starts or plays moves the pieces itself: nothing rolls on under it.
        this.rolling.length = 0;
        if (state === 'idle' && this.ready) this.save();
      }),
      // The card sent every piece back to a frame's setup: that is the blocking to keep now.
      g.setupRecalled.subscribe((n) => {
        // Every piece is on a new mark, so nothing carries on rolling from the old one.
        this.rolling.length = 0;
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
    this.measureHeld(delta);
    if (this.drops.length > 0) this.fall(delta);
    // A long frame is rolled in short steps, so a stall cannot carry a car past an edge or an actor.
    for (let left = Math.min(delta, ROLL_LONGEST_FRAME); left > 0 && this.rolling.length > 0; left -= ROLL_STEP) {
      this.roll(Math.min(left, ROLL_STEP));
    }
    if (this.released.length === 0) return;
    for (const piece of this.released) {
      // A piece taken off the set while it was held has nowhere to stand.
      if (piece.object3D == null || !piece.object3D.visible) {
        this.forgetPush(piece);
        continue;
      }
      this.settle(piece);
      this.maybeRoll(piece);
    }
    this.released.length = 0;
    // A piece still falling is saved when it lands.
    if (this.drops.length === 0) this.save();
  }

  private drop(piece: Entity, floor: number): void {
    for (let i = 0; i < this.drops.length; i++) {
      if (this.drops[i].piece !== piece) continue;
      this.drops[i].floor = floor;
      return;
    }
    this.drops.push({ piece, speed: 0, floor });
  }

  /** The set changed: nothing is carried that is no longer on it, and nothing stands on what has gone. */
  private setChanged(): void {
    for (const side of SIDES) {
      const carry = this.carrying[side];
      if (carry == null || carry.piece.object3D?.visible === true) continue;
      this.carrying[side] = null;
      this.setRayAside(side, false);
    }
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const object = piece.object3D;
      if (object == null) continue;
      if (!object.visible) {
        if (piece.hasComponent(Grabbed)) {
          this.ignored.add(piece);
          this.grab?.forceRelease(piece);
        }
        if (piece.hasComponent(Held)) piece.removeComponent(Held);
        continue;
      }
      if (piece.hasComponent(Held) || piece.hasComponent(ShotCamera) || object.position.y <= FALL_FROM) continue;
      const floor = this.supportUnder(i);
      if (object.position.y > floor + FALL_FROM) this.drop(piece, floor);
    }
  }

  private sideCarrying(piece: Entity): Side | null {
    if (this.carrying.left?.piece === piece) return 'left';
    if (this.carrying.right?.piece === piece) return 'right';
    return null;
  }

  /** The ray is already holding something for this hand: it is not reaching for anything else. */
  private rayBusy(side: Side): boolean {
    for (let i = 0; i < this.dressed.length; i++) {
      if (this.dressed[i].hasComponent(Grabbed) && this.grab?.getHolderHand(this.dressed[i]) === side) return true;
    }
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
      // Too far to be on it at all: no need to work out where the hand is in the piece's own frame.
      const at = object.matrixWorld.elements;
      const far = this.spans[i] * object.scale.x + reach;
      const dx = point.x - at[12];
      const dy = point.y - at[13];
      const dz = point.z - at[14];
      if (dx * dx + dy * dy + dz * dz > far * far) continue;
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
    // The other hand has a piece: this hand's pinch on the same piece stretches or squeezes it.
    if (this.stretch?.side === side) {
      this.stretchWith(side, byHand, live, pinchAt, delta);
      return;
    }
    const held = this.carrying[side === 'left' ? 'right' : 'left'];
    if (live && held != null && this.stretch == null && this.guard <= 0 && !held.piece.hasComponent(ShotCamera) && this.onPiece(held.piece, pinchAt, STRETCH_REACH)) {
      this.near[side] = -1;
      this.setRayAside(side, true);
      if (pad?.getSelectStart() === true || (!byHand && pad?.getButtonDown(InputComponent.Squeeze) === true)) {
        const scale = held.piece.object3D!.scale.x;
        this.stretch = { side, piece: held.piece, from: Math.max(0.02, held.at.distanceTo(pinchAt)), scale, offset: held.offset.clone(), opening: 0, lost: 0, told: 0 };
      }
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
    // A big or giant piece reaches a long way, and the button that shrinks it must stay in reach.
    if (index >= 0 && byHand && this.dressed[index].object3D!.scale.x > OVERSIZE && this.pointsAtPanel(side)) index = -1;
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

  /** Whether this point is on the piece, within reach of its shape, in metres. */
  private onPiece(piece: Entity, point: Vector3, reach: number): boolean {
    const index = this.dressed.indexOf(piece);
    const object = piece.object3D;
    if (index < 0 || object == null) return false;
    object.worldToLocal(this.local.copy(point));
    return this.bounds[index].distanceToPoint(this.local) * object.scale.x <= reach;
  }

  /**
   * Two hands on one piece: the first carries it, and the distance to the second sets its size, the
   * way anyone stretches a thing between their hands. Letting go with the second hand keeps the size.
   */
  private stretchWith(side: Side, byHand: boolean, live: boolean, point: Vector3, delta: number): void {
    const stretch = this.stretch!;
    const first = this.carrying[side === 'left' ? 'right' : 'left'];
    const pad = this.input.xr.gamepads[side];
    const object = stretch.piece.object3D;
    const open = byHand ? pad != null && !pad.getSelecting() : pad?.getSelecting() !== true && pad?.getButtonPressed(InputComponent.Squeeze) !== true;
    stretch.opening = open ? stretch.opening + delta : 0;
    stretch.lost = live ? 0 : stretch.lost + delta;
    const letGo = byHand
      ? stretch.opening >= PINCH_GONE_SECONDS || (stretch.opening >= OPENING_SECONDS && live && this.readings[side].pinchGap > FINGERS_APART)
      : stretch.opening > 0;
    if (letGo || stretch.lost > LOST_HAND_SECONDS || first?.piece !== stretch.piece || object == null || !object.visible) {
      this.stretch = null;
      this.setRayAside(side, false);
      // The size is the piece's own from here on: kept with its paint, on every frame that remembers it.
      if (object != null && object.scale.x !== stretch.scale) {
        (this.globals as Globals).sizedByHand.value = { label: String(stretch.piece.getValue(SetPiece, 'label')), scale: object.scale.x };
      }
      return;
    }
    this.setRayAside(side, true);
    if (!live) return;
    const scale = Math.max(STRETCH_MIN, Math.min(STRETCH_MAX, (stretch.scale * first.at.distanceTo(point)) / stretch.from));
    object.scale.setScalar(scale);
    // The spot the first hand took stays under its fingers as the piece grows.
    first.offset.copy(stretch.offset).multiplyScalar(scale / stretch.scale);
    this.world.getSystem(ViewfinderSystem)?.refresh();
    const tenth = Math.round(scale * 10);
    if (tenth !== stretch.told) {
      stretch.told = tenth;
      const title = assetTitle(String(stretch.piece.getValue(SetPiece, 'label'))).toUpperCase();
      (this.globals as Globals).coachNote.value = `${title} AT ${tenth * 10} % | Hands apart to grow it, together to shrink it. Let go to keep it.`;
    }
  }

  /** Whether this hand's ray lands on the control panel. */
  private pointsAtPanel(side: Side): boolean {
    const xr = this.input.xr;
    const renderer = this.world.renderer;
    const frame = renderer.xr.getFrame?.();
    const base = renderer.xr.getReferenceSpace();
    const reading = this.readings[side];
    if (frame == null || base == null || !reading.aimFrom(frame, base, xr.getPrimaryInputSource(side), this.player)) return false;
    const panel = this.world.getSceneObject<UIKitMLAsset>('controls-panel')?.getElementById('panel-root') as unknown as Object3D | undefined;
    if (panel == null) return false;
    this.panelRay.ray.origin.copy(reading.rayFrom);
    this.panelRay.ray.direction.copy(reading.rayTo).sub(reading.rayFrom).normalize();
    this.panelHits.length = 0;
    panel.raycast(this.panelRay, this.panelHits);
    return this.panelHits.length > 0;
  }

  private take(side: Side, piece: Entity, by: Carry['by'], point: Vector3): void {
    const object = piece.object3D!;
    object.getWorldPosition(this.point);
    this.carrying[side] = { piece, by, offset: this.point.clone().sub(point), at: point.clone(), lost: 0, opening: 0 };
    this.near[side] = -1;
    // This pinch belongs to the hand now: whatever the ray began with it is let go.
    if (!this.rayAside[side]) {
      this.rayAside[side] = true;
      this.input.xr.multiPointers[side].toggleSubPointer('ray', false);
    }
    piece.addComponent(Held);
  }

  private carry(side: Side, carry: Carry, byHand: boolean, live: boolean, point: Vector3, delta: number): void {
    const pad = this.input.xr.gamepads[side];
    let letGo: boolean;
    if (!byHand) letGo = !live || (pad?.getSelecting() !== true && pad?.getButtonPressed(InputComponent.Squeeze) !== true);
    else {
      const reading = this.readings[side];
      const opening = carry.by === 'fist' ? live && !reading.shut : pad != null && !pad.getSelecting();
      carry.opening = opening ? carry.opening + delta : 0;
      if (carry.by === 'fist') letGo = carry.opening >= FIST_OPEN_SECONDS;
      else letGo = carry.opening >= PINCH_GONE_SECONDS || (carry.opening >= OPENING_SECONDS && live && reading.pinchGap > FINGERS_APART);
    }
    carry.lost = live ? 0 : carry.lost + delta;
    if (letGo || carry.lost > LOST_HAND_SECONDS || carry.piece.object3D?.visible !== true) {
      this.carrying[side] = null;
      this.setRayAside(side, false);
      // The other hand may still have it, by its own reach or by the ray.
      const other = this.carrying[side === 'left' ? 'right' : 'left'];
      const stillHeld = other?.piece === carry.piece || carry.piece.hasComponent(Grabbed);
      if (!stillHeld && carry.piece.hasComponent(Held)) carry.piece.removeComponent(Held);
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

  /** How fast each held piece is moving, so a vehicle let go mid-push knows its speed. */
  private measureHeld(delta: number): void {
    if (delta <= 0) return;
    const follow = 1 - Math.exp(-SPEED_FOLLOW * delta);
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const object = piece.object3D;
      if (object == null || !piece.hasComponent(Held)) {
        this.heldSeen[i] = false;
        continue;
      }
      if (this.heldSeen[i]) {
        this.probe.copy(object.position).sub(this.heldLast[i]).divideScalar(delta);
        this.heldNow[i].lerp(this.probe, follow);
        // A hand slows a little before the fingers open, so the push is the fastest of the last moments.
        this.heldSpeed[i].multiplyScalar(Math.exp(-delta / PUSH_MEMORY));
        if (this.heldNow[i].lengthSq() >= this.heldSpeed[i].lengthSq()) this.heldSpeed[i].copy(this.heldNow[i]);
      } else {
        this.heldNow[i].set(0, 0, 0);
        this.heldSpeed[i].set(0, 0, 0);
        this.heldSeen[i] = true;
      }
      this.heldLast[i].copy(object.position);
    }
  }

  /** The push a piece was let go with is spent: whatever it was, it is not a roll later. */
  private forgetPush(piece: Entity): void {
    const index = this.dressed.indexOf(piece);
    if (index < 0) return;
    this.heldSpeed[index].set(0, 0, 0);
    this.heldNow[index].set(0, 0, 0);
  }

  /** A vehicle let go while moving keeps going along its nose. */
  private maybeRoll(piece: Entity): void {
    const index = this.dressed.indexOf(piece);
    const object = piece.object3D;
    if (index < 0 || object == null) return;
    // The push is read once and spent, so a later flicker of the hold cannot replay it.
    this.probe.copy(this.heldSpeed[index]);
    this.point.copy(this.heldNow[index]);
    this.forgetPush(piece);
    const asset = assetByLabel(String(piece.getValue(SetPiece, 'label') ?? ''));
    if (!ROLLING_VEHICLES.has(asset?.spareOf ?? asset?.label ?? '')) return;
    this.nose.set(0, 0, 1).applyQuaternion(object.quaternion);
    this.nose.y = 0;
    this.nose.normalize();
    const along = this.probe.x * this.nose.x + this.probe.z * this.nose.z;
    if (Math.abs(along) < ROLL_FROM) return;
    // A push is let go while the hand is still moving. A hand that stopped and then
    // opened was setting the car down, however fast it arrived, so the car stays put.
    const now = this.point.x * this.nose.x + this.point.z * this.nose.z;
    if (now * along <= 0 || Math.abs(now) < STILL_MOVING * Math.abs(along)) return;
    const speed = Math.sign(along) * Math.min(Math.abs(along), ROLL_TOP);
    // Only on the slate itself: a car pushed along a roof has nowhere to roll to.
    for (let i = 0; i < this.drops.length; i++) {
      if (this.drops[i].piece !== piece) continue;
      // Let go a little above the slate, it rolls on from where it lands; from higher, it just lands.
      if (this.drops[i].floor <= FALL_FROM && object.position.y - this.drops[i].floor <= LOW_DROP) this.drops[i].roll = speed;
      return;
    }
    if (object.position.y <= FALL_FROM) this.startRoll(index, speed);
  }

  private startRoll(index: number, speed: number): void {
    if (index < 0 || speed === 0) return;
    for (let i = 0; i < this.rolling.length; i++) if (this.rolling[i].index === index) this.rolling.splice(i, 1);
    this.rolling.push({ index, speed });
  }

  private roll(delta: number): void {
    for (let r = this.rolling.length - 1; r >= 0; r--) {
      const run = this.rolling[r];
      const piece = this.dressed[run.index];
      const object = piece?.object3D;
      if (object == null || !object.visible || piece.hasComponent(Held)) {
        this.rolling.splice(r, 1);
        continue;
      }
      this.nose.set(0, 0, 1).applyQuaternion(object.quaternion);
      this.nose.y = 0;
      this.nose.normalize();
      const way = Math.sign(run.speed);
      const length = Math.abs(run.speed) * delta;
      // The leading end of the vehicle, a step ahead, is what meets the edge or a wall.
      let blocked = this.leadingEndBlocked(run.index, object, localBoundsDepth(this.bounds[run.index], object) + length, way);
      let move = blocked ? 0 : length;
      // An actor in the way stops it, and goes down if it was still going fast enough. It
      // stops just inside the knock-down rule's reach, so a take plays the contact back, and
      // the roll knocks them itself, since a long frame can jump past the moment of contact.
      const actor = blocked ? null : this.actorAhead(run.index, object, way);
      if (actor != null) {
        const contact = ACTOR_REACH - CONTACT_INSET;
        const stopAt = Math.sqrt(Math.max(0, contact * contact - this.aheadLat * this.aheadLat));
        if (this.aheadFwd - length <= stopAt) {
          move = Math.max(0, Math.min(length, this.aheadFwd - stopAt));
          blocked = true;
          if (Math.abs(run.speed) >= KNOCK_SPEED) this.knockDown(actor, way);
        }
      }
      if (move > 0) object.position.addScaledVector(this.nose, way * move);
      const slower = Math.max(0, Math.abs(run.speed) - ROLL_FRICTION * delta);
      run.speed = Math.sign(run.speed) * slower;
      if (blocked || slower < ROLL_STOP) {
        this.rolling.splice(r, 1);
        this.knock(Cue.Place, piece);
        if (this.rolling.length === 0 && this.drops.length === 0) this.save();
      }
    }
  }

  /** An actor knocked over by a vehicle rolling along `this.nose`, `way` being forwards or back. */
  private knockDown(actor: Entity, way: number): void {
    const body = actor.object3D;
    if (body == null) return;
    this.probe.copy(this.nose).multiplyScalar(way).applyQuaternion(this.turnBack.copy(body.quaternion).invert());
    if (this.world.getSystem(SquirmSystem)?.knock(actor, this.probe.x, this.probe.z) === true) {
      const who = assetTitle(String(actor.getValue(SetPiece, 'label'))).toUpperCase();
      (this.globals as Globals).coachNote.value = `${who} IS DOWN | Pick them up to stand them again.`;
    }
  }

  /**
   * Whether the vehicle's leading end, `reach` ahead of its centre, meets the slate's
   * edge or a solid piece, at its middle or at either corner.
   */
  private leadingEndBlocked(self: number, object: Object3D, reach: number, way: number): boolean {
    const box = this.bounds[self];
    const halfWidth = (box == null ? 0.05 : Math.max(Math.abs(box.min.x), Math.abs(box.max.x))) * object.scale.x;
    this.side.set(this.nose.z, 0, -this.nose.x);
    for (let k = -ROLL_PROBES; k <= ROLL_PROBES; k++) {
      this.probe.copy(object.position).addScaledVector(this.nose, way * reach).addScaledVector(this.side, (k / ROLL_PROBES) * halfWidth);
      if (Math.abs(this.probe.x) > SLATE_HALF_X || Math.abs(this.probe.z) > SLATE_HALF_Z || this.blockedAt(this.probe, self)) return true;
    }
    return false;
  }

  /**
   * The nearest actor in this vehicle's path, standing or fallen, with how far ahead of
   * the leading end they are and how far out from the vehicle's side, in stage metres.
   */
  private actorAhead(self: number, object: Object3D, way: number): Entity | null {
    const box = this.bounds[self];
    if (box == null) return null;
    const scale = object.scale.x || 1;
    const halfWidth = Math.max(Math.abs(box.min.x), Math.abs(box.max.x));
    const front = way > 0 ? box.max.z : -box.min.z;
    const height = (box.max.y - box.min.y) * scale;
    this.turnBack.copy(object.quaternion).invert();
    let found: Entity | null = null;
    for (let j = 0; j < this.dressed.length; j++) {
      const other = this.dressed[j];
      const body = other.object3D;
      if (j === self || body == null || !body.visible || other.hasComponent(Held)) continue;
      if (other.getValue(SetPiece, 'role') !== SetRole.Actor) continue;
      // Standing on something else, at another height, they are out of its way.
      if (Math.abs(body.position.y - object.position.y) > height) continue;
      this.point.copy(body.position).sub(object.position).applyQuaternion(this.turnBack).divideScalar(scale);
      const lat = Math.max(0, Math.abs(this.point.x) - halfWidth) * scale;
      const fwd = (this.point.z * way - front) * scale;
      // In the way: within the vehicle's width, and ahead of its leading end or just touching it.
      if (lat > ACTOR_REACH || fwd < -ACTOR_REACH) continue;
      if (found != null && fwd >= this.aheadFwd) continue;
      found = other;
      this.aheadFwd = fwd;
      this.aheadLat = lat;
    }
    return found;
  }

  /** Whether a point on the stage is within a roll's margin of a piece in the way, other than this one. */
  private blockedAt(point: Vector3, self: number): boolean {
    for (let j = 0; j < this.dressed.length; j++) {
      const box = this.blockers[j];
      const other = this.dressed[j].object3D;
      if (j === self || box == null || other == null || !other.visible || this.dressed[j].hasComponent(Held)) continue;
      const scale = other.scale.x || 1;
      this.point.copy(point).sub(other.position).applyQuaternion(this.turnBack.copy(other.quaternion).invert());
      this.point.divideScalar(scale);
      if (box.distanceToPoint(this.point) * scale <= ROLL_MARGIN) return true;
    }
    return false;
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
      if (!object.visible) {
        // Taken off the set in the air: it is on the floor when it comes back.
        object.position.y = drop.floor;
        this.drops.splice(i, 1);
        continue;
      }
      drop.speed += FALL * delta;
      object.position.y -= drop.speed * delta;
      if (object.position.y > drop.floor) continue;
      object.position.y = drop.floor;
      this.knock(Cue.Place, drop.piece);
      this.drops.splice(i, 1);
      if (drop.roll) this.startRoll(this.dressed.indexOf(drop.piece), drop.roll);
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
    if (this.ghost != null) this.ghost.visible = false;
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const held = piece.hasComponent(Held);
      const touched = held || piece.hasComponent(Hovered) || this.near.left === i || this.near.right === i;
      const beckon = !beckoned && wanted !== '' && piece.object3D?.visible === true && piece.getValue(SetPiece, 'role') === wanted;
      if (beckon) {
        beckoned = true;
        this.showGhost(i, time);
      }
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

  /** Shows the gesture over the piece it is for, opening and closing, until a hand has it. */
  private showGhost(index: number, time: number): void {
    const piece = this.dressed[index];
    const object = piece.object3D;
    const parent = object?.parent;
    if (object == null || parent == null || piece.hasComponent(Held) || this.near.left === index || this.near.right === index) return;
    // A controller's trigger is not a pinch, so this is only for hands.
    if (!this.input.xr.isPrimary('hand', 'left') && !this.input.xr.isPrimary('hand', 'right')) return;
    if (this.ghost == null) {
      const material = new MeshBasicMaterial({ color: 0xf6f7ef, toneMapped: false, transparent: true, opacity: 0.8 });
      const finger = new CapsuleGeometry(0.0055, 0.04, 3, 8);
      finger.translate(0, 0.025, 0);
      this.ghostFinger = new Mesh(finger, material);
      this.ghostThumb = new Mesh(finger, material);
      this.ghost = new Group();
      this.ghost.name = 'GhostPinch';
      for (const part of [this.ghostFinger, this.ghostThumb]) {
        part.raycast = NO_RAYCAST;
        this.ghost.add(part);
      }
      parent.add(this.ghost);
      this.world.getSystem(ViewfinderSystem)?.hideFromLens(this.ghost);
    }
    const close = 0.5 + 0.5 * Math.sin(time * GHOST_RATE * Math.PI);
    const angle = GHOST_SHUT + (GHOST_OPEN - GHOST_SHUT) * close;
    this.ghostFinger!.rotation.z = -angle;
    this.ghostThumb!.rotation.z = angle;
    this.ghost.position.set(object.position.x, object.position.y + this.bounds[index].max.y * object.scale.y + GHOST_ABOVE, object.position.z);
    this.ghost.visible = true;
  }

  /** The unseen cylinder that makes a piece easy to catch, and the ring that says it is caught. */
  private dress(piece: Entity): void {
    const object = piece.object3D!;
    const size =
      assetByLabel(String(piece.getValue(SetPiece, 'label')))?.grab ?? GRAB_VOLUME[piece.getValue(SetPiece, 'role') as string];
    if (size == null) return;
    const [radius, height] = size;
    const shape = localBounds(object);
    const asset = assetByLabel(String(piece.getValue(SetPiece, 'label')));
    const role = piece.getValue(SetPiece, 'role');
    this.solids.push(asset?.solid === true ? shape.clone() : null);
    const inTheWay = asset != null && (!ROLL_THROUGH.has(asset.shelf) || asset.mover === true) && role !== SetRole.Actor && role !== SetRole.Camera && !shape.isEmpty();
    this.blockers.push(inTheWay ? shape.clone() : null);
    // A thin piece gets room around it for the hand; a big one is its own shape, so a hand
    // passing near a car does not count as a hand on the car.
    const room = shape.isEmpty() ? radius : Math.min(radius, THIN_REACH);
    shape.expandByPoint(this.local.set(room, height, room));
    shape.expandByPoint(this.local.set(-room, 0, -room));
    this.bounds.push(shape);
    this.spans.push(Math.max(shape.min.length(), shape.max.length()));
    const volume = new Mesh(new CylinderGeometry(radius, radius, height, 14, 1), this.volumeMaterial);
    volume.name = 'GrabVolume';
    volume.position.y = height / 2;
    // An actor's ring is in their own tape colour; everything else is marked in yellow.
    const tape = assetByLabel(String(piece.getValue(SetPiece, 'label')))?.tape;
    const ring = new Mesh(
      new RingGeometry(radius * 0.9, radius * 1.1, 40),
      tape ? new MeshBasicMaterial({ color: tape, toneMapped: false }) : this.ringMaterial,
    );
    ring.name = 'HoverRing';
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.0045;
    ring.visible = false;
    ring.raycast = NO_RAYCAST;
    object.add(volume, ring);
    this.world.getSystem(ViewfinderSystem)?.hideFromLens(ring);
    this.dressed.push(piece);
    this.heldSpeed.push(new Vector3());
    this.heldNow.push(new Vector3());
    this.heldLast.push(new Vector3());
    this.heldSeen.push(false);
    this.rings.push(ring);
    this.turns.push(new HandTurn());
  }

  /**
   * What this piece would come to rest on if it were let go here: the top of
   * a car, a crate, a wall under it, or the slate. Things rest on things.
   */
  private supportUnder(index: number): number {
    const object = this.dressed[index]?.object3D;
    if (object == null) return 0;
    let top = 0;
    object.getWorldPosition(this.point);
    for (let j = 0; j < this.dressed.length; j++) {
      const box = this.solids[j];
      if (box == null || j === index) continue;
      const other = this.dressed[j].object3D;
      if (other == null || !other.visible || other.parent !== object.parent || this.dressed[j].hasComponent(Held)) continue;
      other.worldToLocal(this.local.copy(this.point));
      if (this.local.x < box.min.x || this.local.x > box.max.x || this.local.z < box.min.z || this.local.z > box.max.z) continue;
      const height = other.position.y + box.max.y * other.scale.y;
      if (object.position.y < height - STACK_SLACK) continue;
      if (height > top) top = height;
    }
    return top;
  }

  /** Something was lifted: whatever was standing on it comes down. */
  private dropRiders(lifted: Entity): void {
    if (this.solids[this.dressed.indexOf(lifted)] == null) return;
    for (let i = 0; i < this.dressed.length; i++) {
      const piece = this.dressed[i];
      const object = piece.object3D;
      if (object == null || piece === lifted || piece.hasComponent(Held) || piece.hasComponent(ShotCamera)) continue;
      if (object.position.y <= FALL_FROM) continue;
      const floor = this.supportUnder(i);
      if (object.position.y > floor + FALL_FROM) this.drop(piece, floor);
    }
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
      if (this.key(piece) === FIRST_CAMERA) {
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
      if ((this.globals as Globals).cameraRig.peek() === 'drone' && this.key(piece) === FIRST_CAMERA) {
        object.position.y = Math.max(DRONE_MIN_HEIGHT, Math.min(y, DRONE_MAX_HEIGHT));
      } else {
        object.position.y = y < CAMERA_FLOOR_SNAP ? 0 : Math.min(y, CAMERA_MAX_HEIGHT);
      }
      this.knock(Cue.Place, piece);
    } else {
      const floor = this.supportUnder(this.dressed.indexOf(piece));
      if (object.position.y > floor + FALL_FROM) {
        this.drop(piece, floor);
      } else {
        object.position.y = floor;
        this.knock(Cue.Place, piece);
      }
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
      if (this.key(piece) === FIRST_CAMERA) {
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
