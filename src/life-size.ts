/**
 * Stand in the shot. The miniature grows to full size around the wearer: they
 * stand where the camera stands, looking the way it looks, and the actors are
 * their real height on the real floor, with the tennis ball up at the creature's
 * eye line. The slate, the monitor and the board stay behind on the table, so
 * what is left is the blocking in the room.
 */
import {
  AudioSource,
  AudioUtils,
  createSystem,
  Entity,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Quaternion,
  CylinderGeometry,
  RingGeometry,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { assetByLabel, assetTitle, isMade } from './catalog.js';
import { localBounds } from './bounds.js';
import { MadeSystem } from './made.js';
import { SetPiece, SetRole, ShotCamera, StageAnchor } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';
import { ControlsSystem } from './controls.js';
import { sayLineOnce } from './speech.js';

/** The set is 1:10, so this is true scale. */
const LIFE_SCALE = 10;
/** How long the set takes to come off the table and grow to full size around the wearer. */
const GROW_SECONDS = 1.2;
const UP = new Vector3(0, 1, 0);
/** Where the lens is on the rig: this far along its forward, -Z. */
const LENS_AHEAD = -0.06;
/** What stays on the table: the furniture of the miniature, not the blocking. */
/** Where a pointing hand would stand the wearer: a ring on the floor, this wide on the slate (ten times that at full size). */
const MARK_INNER = 0.022;
const MARK_OUTER = 0.032;
/** The wearer is looking at the floor when their look falls at least this steeply, and the floor is between these, in metres. */
const LOOKS_DOWN = -0.07;
/** The walk's line is tried this often for something solid, in slate metres (25 cm at full size). */
const WALK_STEP = 0.025;
/** How fast the ring follows the look, as a share of what is left each second. */
const RING_FOLLOWS = 14;
const NEAREST = 0.4;
const FARTHEST = 25;
/** A spot nearer the wearer's feet than this is not somewhere to walk to. */
const AHEAD = 0.8;
const SIDES = ['left', 'right'] as const;
type Side = (typeof SIDES)[number];
const OPTIC_YELLOW = 0xd6e13c;
/** What the panel says on stepping inside: the call sheet stays behind on the table. */
const INSIDE_NOTE = 'INSIDE THE SET | Look at the floor: a yellow ring shows where you will stand. Pinch to walk there. Back to the table leaves.';
/**
 * A walk is a short glide, not a jump: the wearer sees the set pass and knows where they have got to. It takes
 * this long for the first metre and this much more for each metre after, and never longer than the last.
 */
const WALK_SECONDS = 0.35;
const WALK_SECONDS_A_METRE = 0.09;
const WALK_LONGEST = 0.9;
/** The post that stands in the ring, so the spot shows from across the set: this tall and thick on the slate. */
const MARK_POST = 0.11;
const MARK_POST_WIDE = 0.0016;
const LEFT_BEHIND = new Set(['Plate', 'Rim', 'ClapperStripe', 'Strip', 'Viewfinder', 'StoryboardCard', 'HandleLabel', 'StageHandle', 'LensBackdrop']);

type Globals = {
  lifeSize: Signal<boolean>;
  lifeSizeRequested: Signal<number>;
  coachNote: Signal<string>;
  backToCamera: Signal<number>;
  trayOn: Signal<string[]>;
  layoutChanged: Signal<number>;
  setsBuilt: Signal<number>;
};

/** Something solid on the set, as a turned rectangle on the slate and how high it stands, all in slate metres. */
type Solid = { x: number; z: number; hx: number; hz: number; cos: number; sin: number; top: number };
/** A walk stops this far short of anything solid (30 cm at full size). */
const SOLID_MARGIN = 0.03;
/** What stands lower than this is stepped over (a kerb, a floor); a part that begins above this is walked under. */
const SOLID_LOW = 0.05;
const SOLID_OVERHEAD = 0.2;
/** A head inside a piece for this long is lost: the panel says the way out. */
const LOST_SECONDS = 1;
const LOST_NOTE = 'YOU ARE INSIDE A PIECE | Pinch Back to camera on the panel and you stand at the lens again.';


export class LifeSizeSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  pieces: { required: [SetPiece] },
  cams: { required: [ShotCamera] },
}) {
  private seen = 0;
  private savedPosition = new Vector3();
  private savedQuaternion = new Quaternion();
  private hidden: Object3D[] = [];
  /** Where the growing set ends up, in its parent's space, and how far along it is (below 0 when not growing). */
  /** The rush of air as the set grows around the wearer: made on the first frame, so it has loaded by the first step inside. */
  private arrive: Entity | null = null;
  private growTo = new Vector3();
  private growTurn = new Quaternion();
  private growT = -1;
  /** A walk under way: where the set stood, where it is going, how far through, and how long it takes. */
  private walkFrom = new Vector3();
  private walkTo = new Vector3();
  private walkT = -1;
  private walkFor = WALK_SECONDS;
  private steps: Entity | null = null;
  private solids: Solid[] = [];
  private solidsStale = true;
  private here = new Vector3();
  private lostFor = 0;
  private lostSaid = false;
  private pulse = 0;
  private head = new Vector3();
  private forward = new Vector3();
  private offset = new Vector3();
  private turn = new Quaternion();
  private cameraTurn = new Quaternion();
  private stand = new Vector3();
  private toward = new Vector3();
  /** The ring on the floor where a pinch would stand the wearer, and which hand is pointing there. */
  private mark: Mesh | null = null;
  private spot = new Vector3();
  /** The ring was showing last frame: it glides to where the look moves, and appears at once where it was not. */
  private settled = false;
  private from = new Vector3();
  private way = new Vector3();
  private hit = new Vector3();
  private floor = new Vector3();

  init(): void {
    const g = this.globals as Globals;
    this.watch();
    this.cleanupFuncs.push(
      g.lifeSizeRequested.subscribe((n) => {
        if (n <= this.seen) return;
        this.seen = n;
        if (g.lifeSize.peek()) this.leave();
        else this.enter();
      }),
      this.world.visibilityState.subscribe((state) => {
        // The session is over: the placement system has its own pose for the page.
        if (state === VisibilityState.NonImmersive && g.lifeSize.peek()) this.leave(false);
      }),
    );
  }

  /**
   * At full size, a ring on the floor where the wearer looks marks where they would stand, and a pinch of either
   * hand takes them: the set glides so that spot comes under their feet. A hand at the panel is the panel's.
   */
  /** True when this spot on the slate is inside something solid, with the walk's margin around it. */
  private blocked(x: number, z: number, margin: number): boolean {
    for (let i = 0; i < this.solids.length; i++) {
      const solid = this.solids[i];
      const dx = x - solid.x;
      const dz = z - solid.z;
      if (Math.abs(dx * solid.cos - dz * solid.sin) < solid.hx + margin && Math.abs(dx * solid.sin + dz * solid.cos) < solid.hz + margin) return true;
    }
    return false;
  }

  /** Every solid thing on the set: a library piece by its own box, a made piece part by part. */
  private measureSolids(): void {
    this.solids.length = 0;
    const made = this.world.getSystem(MadeSystem);
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      const role = piece.getValue(SetPiece, 'role');
      const label = String(piece.getValue(SetPiece, 'label'));
      if (object == null || !object.visible || role === SetRole.Stage || role === SetRole.Camera) continue;
      // Rain and smoke are walked through; a tree's crown and a lamp's arm are overhead.
      if (assetByLabel(label)?.shelf === 'Effects' || label.startsWith('Tree') || label.startsWith('Lamp post')) continue;
      const scale = object.scale.x;
      const cos = Math.cos(object.rotation.y);
      const sin = Math.sin(object.rotation.y);
      const boxes = isMade(label) ? (made?.surfacesOf(label) ?? []) : [localBounds(object)];
      for (const box of boxes) {
        if (box.isEmpty()) continue;
        const low = object.position.y + box.min.y * scale;
        const top = object.position.y + box.max.y * scale;
        if (top < SOLID_LOW || low > SOLID_OVERHEAD) continue;
        const cx = ((box.min.x + box.max.x) / 2) * scale;
        const cz = ((box.min.z + box.max.z) / 2) * scale;
        this.solids.push({
          x: object.position.x + cx * cos + cz * sin,
          z: object.position.z - cx * sin + cz * cos,
          hx: ((box.max.x - box.min.x) / 2) * scale,
          hz: ((box.max.z - box.min.z) / 2) * scale,
          cos,
          sin,
          top,
        });
      }
    }
  }

  /** What the set's changes and the panel's Back to camera ask of the full-size set. */
  private watch(): void {
    const g = this.globals as Globals;
    const changed = (): void => {
      this.solidsStale = true;
    };
    this.cleanupFuncs.push(
      g.trayOn.subscribe(changed),
      g.layoutChanged.subscribe(changed),
      g.setsBuilt.subscribe(changed),
      // Back to camera, from the panel: the wearer stands at the lens again, wherever they had walked to.
      g.backToCamera.subscribe((asked) => {
        if (asked === 0 || !g.lifeSize.peek()) return;
        this.walkT = -1;
        this.cutToCamera();
        g.coachNote.value = 'AT THE CAMERA | You are where the shot is taken from. Look at the floor and pinch to walk.';
      }),
    );
  }

  update(delta: number): void {
    if (this.arrive == null) {
      const holder = new Object3D();
      holder.name = 'ArriveSound';
      this.arrive = this.world.createTransformEntity(holder);
      this.arrive.addComponent(AudioSource, { src: './audio/arrive.wav', volume: 0.55, positional: false });
      const feet = new Object3D();
      feet.name = 'StepsSound';
      this.steps = this.world.createTransformEntity(feet);
      this.steps.addComponent(AudioSource, { src: './audio/steps.wav', volume: 0.5, positional: false });
    }
    if (this.growT >= 0) this.grow(delta);
    const g = this.globals as Globals;
    const object = this.stage()?.object3D;
    const life = g.lifeSize.peek() && object != null && this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!life) {
      if (this.mark != null) this.mark.visible = false;
      this.settled = false;
      return;
    }
    const mark = this.ensureMark(object);
    // While the set is still growing around the wearer there is nowhere to walk to yet.
    if (this.growT >= 0) {
      mark.visible = false;
      this.settled = false;
      return;
    }
    // On the way to a spot: the set glides under the wearer, and nothing else is aimed at until they are there.
    if (this.walkT >= 0) {
      this.walkT = Math.min(1, this.walkT + delta / this.walkFor);
      const t = this.walkT;
      this.floor.lerpVectors(this.walkFrom, this.walkTo, t * t * (3 - 2 * t));
      setWorldPosition(object, this.floor);
      if (t < 1) return;
      this.walkT = -1;
      mark.visible = false;
      this.settled = false;
      this.world.getSystem(ViewfinderSystem)?.refresh();
      return;
    }
    object.getWorldPosition(this.floor);
    const controls = this.world.getSystem(ControlsSystem);
    this.player.head.getWorldPosition(this.head);
    if (this.solidsStale) {
      this.solidsStale = false;
      this.measureSolids();
    }
    // Where the wearer is on the slate, and how high their eyes are above it.
    object.worldToLocal(this.here.copy(this.head));
    let within = false;
    for (let i = 0; i < this.solids.length && !within; i++) within = this.here.y < this.solids[i].top;
    within = within && this.blocked(this.here.x, this.here.z, 0);
    this.lostFor = within ? this.lostFor + delta : 0;
    if (!within) this.lostSaid = false;
    if (this.lostFor > LOST_SECONDS && !this.lostSaid) {
      this.lostSaid = true;
      g.coachNote.value = LOST_NOTE;
    }
    // Where the wearer looks on the floor is where they would stand. A head is steady and there is one of it: a
    // hand's ray swings metres across a far floor with a turn of the wrist, and two resting hands both point down.
    this.player.head.getWorldDirection(this.way).negate();
    let found = false;
    if (this.way.y <= LOOKS_DOWN) {
      const t = (this.floor.y - this.head.y) / this.way.y;
      if (t >= NEAREST && t <= FARTHEST) {
        this.hit.copy(this.head).addScaledVector(this.way, t);
        found = Math.hypot(this.hit.x - this.head.x, this.hit.z - this.head.z) >= AHEAD;
      }
    }
    if (found) {
      // Along the straight line there, the walk ends in front of the first solid thing: nobody walks through a
      // wall. (Someone already inside a piece walks out of it first.)
      object.worldToLocal(this.spot.copy(this.hit));
      const dx = this.spot.x - this.here.x;
      const dz = this.spot.z - this.here.z;
      const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / WALK_STEP));
      let clear = false;
      found = false;
      for (let i = 1; i <= steps; i++) {
        const x = this.here.x + (dx * i) / steps;
        const z = this.here.z + (dz * i) / steps;
        if (this.blocked(x, z, SOLID_MARGIN)) {
          if (clear) break;
          continue;
        }
        clear = true;
        // Not on the wearer's own feet.
        if (Math.hypot(x - this.here.x, z - this.here.z) * LIFE_SCALE < AHEAD) continue;
        this.spot.x = x;
        this.spot.z = z;
        found = true;
      }
    }
    if (!found) {
      mark.visible = false;
      this.settled = false;
      return;
    }
    // The ring follows the look smoothly, so a small turn of the head does not make it jump.
    this.spot.y = 0.0006;
    if (this.settled) mark.position.lerp(this.spot, Math.min(1, RING_FOLLOWS * delta));
    else mark.position.copy(this.spot);
    this.settled = true;
    mark.visible = true;
    // The ring breathes, so it reads as a place to go and not as part of the set.
    this.pulse = (this.pulse + delta * 5) % (Math.PI * 2);
    mark.scale.setScalar(1 + 0.1 * Math.sin(this.pulse));
    // Either hand's pinch walks there, unless that hand is at the panel.
    let pinched = false;
    for (let i = 0; i < SIDES.length; i++) {
      const side = SIDES[i];
      if (this.input.xr.gamepads[side]?.getSelectStart() === true && controls?.panelWanted(side) !== true) pinched = true;
    }
    if (!pinched) return;
    // The spot comes to the wearer's feet; the set keeps its turn.
    this.hit.copy(mark.position);
    this.hit.y = 0;
    object.localToWorld(this.hit);
    this.head.y = this.floor.y;
    this.offset.copy(this.head).sub(this.hit);
    this.offset.y = 0;
    this.walkFrom.copy(this.floor);
    this.walkTo.copy(this.floor).add(this.offset);
    this.walkFor = Math.min(WALK_LONGEST, WALK_SECONDS + Math.max(0, this.offset.length() - 1) * WALK_SECONDS_A_METRE);
    this.walkT = 0;
    if (this.steps != null) AudioUtils.play(this.steps);
  }

  private ensureMark(object: Object3D): Mesh {
    if (this.mark == null) {
      const mark = new Mesh(new RingGeometry(MARK_INNER, MARK_OUTER, 40), new MeshBasicMaterial({ color: OPTIC_YELLOW, toneMapped: false }));
      mark.name = 'WalkMark';
      mark.rotation.x = -Math.PI / 2;
      mark.raycast = () => {};
      // The ring lies flat, so its own +Z is up: the post stands along it.
      const post = new Mesh(new CylinderGeometry(MARK_POST_WIDE, MARK_POST_WIDE, MARK_POST, 8), mark.material);
      post.name = 'WalkMarkPost';
      post.rotation.x = Math.PI / 2;
      post.position.z = MARK_POST / 2;
      post.raycast = () => {};
      mark.add(post);
      mark.visible = false;
      this.world.getSystem(ViewfinderSystem)?.hideFromLens(mark);
      this.mark = mark;
    }
    if (this.mark.parent !== object) object.add(this.mark);
    return this.mark;
  }

  /**
   * Walks the wearer to a piece on the full-size set, by word: they stand a step in front of it, facing it.
   * "Camera" puts them at the lens, as Step inside does. On the table, the set grows first. Returns the line
   * for the call sheet.
   */
  goTo(label: string): string {
    const g = this.globals as Globals;
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) return 'IN THE HEADSET | Walking the set is done in the headset.';
    if (label === 'Camera') {
      if (g.lifeSize.peek()) this.leave();
      this.enter();
      return g.lifeSize.peek() ? 'AT THE CAMERA | You stand at the lens, looking down it. Say step out to go back.' : '';
    }
    let piece: Entity | null = null;
    for (const entity of this.queries.pieces.entities) {
      if (String(entity.getValue(SetPiece, 'label')) === label && entity.object3D?.visible === true) piece = entity;
    }
    const target = piece?.object3D;
    if (target == null) return `NO ${assetTitle(label).toUpperCase()} ON THE SET | Name it first and it goes on.`;
    // Straight there: the walk below moves the set again at once, so it does not grow in first.
    if (!g.lifeSize.peek()) this.enter(false);
    const object = this.stage()?.object3D;
    if (object == null || !g.lifeSize.peek()) return '';
    // Asked for while the set is still growing: it is full size at once, and the walk below is not undone by the growth.
    this.growT = -1;
    object.scale.setScalar(LIFE_SCALE);
    // A step in front of it, facing it: its own reach and half a metre more, in slate metres.
    const reach = (assetByLabel(label)?.grab?.[0] ?? 0.08) * target.scale.x + 0.05;
    this.toward.set(0, 0, 1).applyQuaternion(target.quaternion);
    this.toward.y = 0;
    if (this.toward.lengthSq() < 1e-6) this.toward.set(0, 0, 1);
    this.toward.normalize();
    this.stand.copy(target.position).addScaledVector(this.toward, reach);
    this.stand.y = 0;
    // The way to look, from where they stand to the piece, as a yaw on the set: 0 looks along -z.
    const lookYaw = Math.atan2(this.toward.x, this.toward.z);
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    const headYaw = Math.atan2(-this.forward.x, -this.forward.z);
    this.turn.setFromAxisAngle(UP, headYaw - lookYaw);
    this.offset.copy(this.stand).multiplyScalar(LIFE_SCALE).applyQuaternion(this.turn);
    this.head.y = 0;
    this.head.sub(this.offset);
    setWorldQuaternion(object, this.turn);
    setWorldPosition(object, this.head);
    this.world.getSystem(ViewfinderSystem)?.refresh();
    return `BY THE ${assetTitle(label).toUpperCase()} | Look around. Say take me to another piece, or step out.`;
  }

  /** At full size, a cut: the wearer stands at the live camera where it now stands (coverage moves it shot by shot). */
  cutToCamera(): void {
    if (!(this.globals as Globals).lifeSize.peek()) return;
    this.solidsStale = true;
    this.leave();
    this.enter(false);
  }

  /** Back to the table, by word. */
  out(): string {
    const g = this.globals as Globals;
    if (!g.lifeSize.peek()) return 'ON THE TABLE | The set is already on the table. Say step inside to go in.';
    this.leave();
    return 'BACK ON THE TABLE | Everything is where you left it.';
  }

  private stageEntity: Entity | undefined;

  private stage(): Entity | undefined {
    // The stage is one entity for the life of the app; found once, not every frame.
    this.stageEntity ??= this.queries.stages.entities.values().next().value as Entity | undefined;
    return this.stageEntity;
  }

  /**
   * One step of the set coming to the wearer: from where it stood on the table to where it stands around them,
   * eased at both ends, its size growing evenly by eye (ten times over), the lens landing at their feet.
   */
  private grow(delta: number): void {
    const object = this.stage()?.object3D;
    if (object == null || !(this.globals as Globals).lifeSize.peek()) {
      this.growT = -1;
      return;
    }
    this.growT = Math.min(1, this.growT + delta / GROW_SECONDS);
    const t = this.growT;
    const e = t * t * (3 - 2 * t);
    object.position.lerpVectors(this.savedPosition, this.growTo, e);
    object.quaternion.slerpQuaternions(this.savedQuaternion, this.growTurn, e);
    object.scale.setScalar(Math.pow(LIFE_SCALE, e));
    if (t < 1) return;
    this.growT = -1;
    object.position.copy(this.growTo);
    object.quaternion.copy(this.growTurn);
    object.scale.setScalar(LIFE_SCALE);
    this.world.getSystem(ViewfinderSystem)?.refresh();
    const stage = this.stage();
    if (stage != null && stage.hasComponent(AudioSource)) AudioUtils.play(stage);
  }

  private enter(animate = true): void {
    const g = this.globals as Globals;
    const stage = this.stage();
    // Stand at the camera that is live.
    const live = (g as unknown as { cameraOn?: { peek(): string } }).cameraOn?.peek();
    let cam = this.queries.cams.entities.values().next().value as Entity | undefined;
    for (const other of this.queries.cams.entities) if (String(other.getValue(SetPiece, 'label')) === live && other.object3D?.visible === true) cam = other;
    const object = stage?.object3D;
    const rig = cam?.object3D;
    if (object == null || rig == null || this.world.visibilityState.peek() === VisibilityState.NonImmersive) return;
    this.savedPosition.copy(object.position);
    this.savedQuaternion.copy(object.quaternion);

    // Turn the set so the camera looks the way the wearer looks, then slide it
    // so the camera stands where they stand, on the floor.
    this.player.head.getWorldPosition(this.head);
    this.player.head.getWorldDirection(this.forward).negate();
    const headYaw = Math.atan2(-this.forward.x, -this.forward.z);
    const cameraYaw = 2 * Math.atan2(rig.quaternion.y, rig.quaternion.w);
    this.turn.setFromAxisAngle(UP, headYaw - cameraYaw);
    // The wearer stands at the lens, which sits in front of the tripod.
    this.offset.set(0, 0, LENS_AHEAD).applyQuaternion(rig.quaternion).add(rig.position);
    this.offset.y = 0;
    this.offset.multiplyScalar(LIFE_SCALE).applyQuaternion(this.turn);
    this.head.y = 0;
    this.head.sub(this.offset);
    object.scale.setScalar(LIFE_SCALE);
    setWorldQuaternion(object, this.turn);
    setWorldPosition(object, this.head);
    // Where it ends up; it starts from the table and grows in, unless asked to be there at once.
    this.growTo.copy(object.position);
    this.growTurn.copy(object.quaternion);
    if (animate) {
      object.position.copy(this.savedPosition);
      object.quaternion.copy(this.savedQuaternion);
      object.scale.setScalar(1);
      this.growT = 0;
      if (this.arrive != null) AudioUtils.play(this.arrive);
    }

    this.hidden.length = 0;
    object.traverse((child) => {
      if (LEFT_BEHIND.has(child.name) && child.visible) {
        child.visible = false;
        this.hidden.push(child);
      }
    });
    // Nothing on a full-size set is within reach: the blocking is to be walked, not moved.
    for (const piece of this.queries.pieces.entities) {
      if (piece.object3D != null) piece.object3D.pointerEvents = 'none';
    }
    const card = this.scene.getObjectByName('StoryboardCard');
    if (card != null) card.pointerEvents = 'none';
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.lifeSize.value = true;
    // The call sheet stays on the table, so the panel's line and the designer's voice say how to move and leave.
    // Not on a cut from camera to camera while already inside: coverage's line for the shot keeps its place.
    if (animate) {
      g.coachNote.value = INSIDE_NOTE;
      sayLineOnce('inside');
    }
  }

  private leave(restorePose = true): void {
    const g = this.globals as Globals;
    this.growT = -1;
    // Stepping out mid-growth, or the session ending, takes the rush of air with it.
    if (this.arrive != null) AudioUtils.stop(this.arrive);
    this.walkT = -1;
    const object = this.stage()?.object3D;
    if (object == null) return;
    object.scale.setScalar(1);
    if (restorePose) {
      object.position.copy(this.savedPosition);
      object.quaternion.copy(this.savedQuaternion);
    }
    for (const child of this.hidden) child.visible = true;
    this.hidden.length = 0;
    // From what is true now: an asset may have been added or removed at full size.
    for (const piece of this.queries.pieces.entities) {
      const target = piece.object3D;
      if (target != null) target.pointerEvents = target.visible ? 'auto' : 'none';
    }
    const card = this.scene.getObjectByName('StoryboardCard');
    if (card != null) card.pointerEvents = 'auto';
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.lifeSize.value = false;
  }
}
