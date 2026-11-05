/**
 * Stand in the shot. The miniature grows to full size around the wearer: they
 * stand where the camera stands, looking the way it looks, and the actors are
 * their real height on the real floor, with the tennis ball up at the creature's
 * eye line. The slate, the monitor and the board stay behind on the table, so
 * what is left is the blocking in the room.
 */
import { createSystem, Entity, Object3D, PointLight, Quaternion, setWorldPosition, setWorldQuaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SetPiece, SetRole, ShotCamera, StageAnchor } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';

/** The set is 1:10, so this is true scale. */
const LIFE_SCALE = 10;
/** A point light's reach and output have to grow with the room it lights. */
const LIGHT_POWER = LIFE_SCALE * LIFE_SCALE;
const UP = new Vector3(0, 1, 0);
/** Where the lens is on the rig: this far along its forward, -Z. */
const LENS_AHEAD = -0.06;
/** What stays on the table: the furniture of the miniature, not the blocking. */
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

  private stage(): Entity | undefined {
    return this.queries.stages.entities.values().next().value as Entity | undefined;
  }

  private enter(): void {
    const g = this.globals as Globals;
    const stage = this.stage();
    const cam = this.queries.cams.entities.values().next().value as Entity | undefined;
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
