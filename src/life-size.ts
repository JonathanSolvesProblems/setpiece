/**
 * Stand in the shot. The miniature grows to full size around the wearer: they
 * stand where the camera stands, looking the way it looks, and the actors are
 * their real height on the real floor, with the tennis ball up at the creature's
 * eye line. The slate, the monitor and the board stay behind on the table, so
 * what is left is the blocking in the room.
 */
import {
  createSystem,
  Entity,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Quaternion,
  RingGeometry,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { assetByLabel, assetTitle } from './catalog.js';
import { SetPiece, SetRole, ShotCamera, StageAnchor } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';
import { ControlsSystem } from './controls.js';

/** The set is 1:10, so this is true scale. */
const LIFE_SCALE = 10;
/** A point light's reach and output have to grow with the room it lights. */
const LIGHT_POWER = LIFE_SCALE * LIFE_SCALE;
const UP = new Vector3(0, 1, 0);
/** Where the lens is on the rig: this far along its forward, -Z. */
const LENS_AHEAD = -0.06;
/** What stays on the table: the furniture of the miniature, not the blocking. */
/** Where a pointing hand would stand the wearer: a ring on the floor, this wide on the slate (ten times that at full size). */
const MARK_INNER = 0.022;
const MARK_OUTER = 0.032;
/** A hand points at the floor when its ray falls at least this steeply, and the floor is between these, in metres. */
const FALLS = -0.12;
const NEAREST = 0.4;
const FARTHEST = 25;
const SIDES = ['left', 'right'] as const;
type Side = (typeof SIDES)[number];
const OPTIC_YELLOW = 0xd6e13c;
const LEFT_BEHIND = new Set(['Plate', 'Rim', 'ClapperStripe', 'Strip', 'Viewfinder', 'StoryboardCard', 'HandleLabel', 'StageHandle', 'LensBackdrop']);

type Globals = { lifeSize: Signal<boolean>; lifeSizeRequested: Signal<number> };


export class LifeSizeSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  pieces: { required: [SetPiece] },
  cams: { required: [ShotCamera] },
}) {
  private seen = 0;
  private savedPosition = new Vector3();
  private savedQuaternion = new Quaternion();
  private hidden: Object3D[] = [];
  private light: PointLight | null = null;
  private lightIntensity = 0;
  private lightDistance = 0;
  private head = new Vector3();
  private forward = new Vector3();
  private offset = new Vector3();
  private turn = new Quaternion();
  private cameraTurn = new Quaternion();
  private stand = new Vector3();
  private toward = new Vector3();
  /** The ring on the floor where a pinch would stand the wearer, and which hand is pointing there. */
  private mark: Mesh | null = null;
  private aimed: Side | null = null;
  private armed: Side | null = null;
  private from = new Vector3();
  private way = new Vector3();
  private hit = new Vector3();
  private floor = new Vector3();

  init(): void {
    const g = this.globals as Globals;
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
   * At full size, a hand pointing down at the floor marks where it would stand the wearer, and a pinch there
   * takes them: the set slides so that spot is under their feet. A hand at the panel is the panel's.
   */
  update(): void {
    const g = this.globals as Globals;
    const object = this.stage()?.object3D;
    const life = g.lifeSize.peek() && object != null && this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!life) {
      if (this.mark != null) this.mark.visible = false;
      this.aimed = null;
      this.armed = null;
      return;
    }
    const mark = this.ensureMark(object);
    object.getWorldPosition(this.floor);
    const controls = this.world.getSystem(ControlsSystem);
    this.aimed = null;
    for (let i = 0; i < SIDES.length && this.aimed == null; i++) {
      const side = SIDES[i];
      if (controls?.panelWanted(side) === true) continue;
      const ray = this.player.raySpaces[side];
      ray.getWorldPosition(this.from);
      // A target ray points down its own -Z.
      ray.getWorldDirection(this.way).negate();
      if (this.way.y > FALLS) continue;
      const t = (this.floor.y - this.from.y) / this.way.y;
      if (t < NEAREST || t > FARTHEST) continue;
      this.hit.copy(this.from).addScaledVector(this.way, t);
      this.aimed = side;
    }
    if (this.aimed == null) {
      mark.visible = false;
      this.armed = null;
      return;
    }
    mark.visible = true;
    mark.position.copy(this.hit);
    object.worldToLocal(mark.position);
    mark.position.y = 0.0006;
    const pad = this.input.xr.gamepads[this.aimed];
    if (pad?.getSelectStart() === true) this.armed = this.aimed;
    if (this.armed === this.aimed && pad?.getSelectEnd() === true) {
      this.armed = null;
      // The spot comes to the wearer's feet; the set keeps its turn.
      this.player.head.getWorldPosition(this.head);
      this.head.y = this.floor.y;
      this.offset.copy(this.head).sub(this.hit);
      this.offset.y = 0;
      this.floor.add(this.offset);
      setWorldPosition(object, this.floor);
      this.world.getSystem(ViewfinderSystem)?.refresh();
    }
  }

  private ensureMark(object: Object3D): Mesh {
    if (this.mark == null) {
      const mark = new Mesh(new RingGeometry(MARK_INNER, MARK_OUTER, 40), new MeshBasicMaterial({ color: OPTIC_YELLOW, toneMapped: false }));
      mark.name = 'WalkMark';
      mark.rotation.x = -Math.PI / 2;
      mark.raycast = () => {};
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
    if (!g.lifeSize.peek()) this.enter();
    const object = this.stage()?.object3D;
    if (object == null || !g.lifeSize.peek()) return '';
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

  /** Back to the table, by word. */
  out(): string {
    const g = this.globals as Globals;
    if (!g.lifeSize.peek()) return 'ON THE TABLE | The set is already on the table. Say step inside to go in.';
    this.leave();
    return 'BACK ON THE TABLE | Everything is where you left it.';
  }

  private stage(): Entity | undefined {
    return this.queries.stages.entities.values().next().value as Entity | undefined;
  }

  private enter(): void {
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

    this.hidden.length = 0;
    object.traverse((child) => {
      if (LEFT_BEHIND.has(child.name) && child.visible) {
        child.visible = false;
        this.hidden.push(child);
      }
      if (child instanceof PointLight && child.name !== 'MonitorGlow' && this.light == null && child.parent?.name !== 'Viewfinder') {
        this.light = child;
      }
    });
    // Nothing on a full-size set is within reach: the blocking is to be walked, not moved.
    for (const piece of this.queries.pieces.entities) {
      if (piece.object3D != null) piece.object3D.pointerEvents = 'none';
    }
    const card = this.scene.getObjectByName('StoryboardCard');
    if (card != null) card.pointerEvents = 'none';
    if (this.light != null) {
      this.lightIntensity = this.light.intensity;
      this.lightDistance = this.light.distance;
      this.light.intensity *= LIGHT_POWER;
      this.light.distance *= LIFE_SCALE;
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.lifeSize.value = true;
  }

  private leave(restorePose = true): void {
    const g = this.globals as Globals;
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
    if (this.light != null) {
      this.light.intensity = this.lightIntensity;
      this.light.distance = this.lightDistance;
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.lifeSize.value = false;
  }
}
