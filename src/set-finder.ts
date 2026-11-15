/**
 * Where the set went. The set stays on the real table, so a wearer who puts the headset back on facing elsewhere, or
 * looking straight ahead over a table below them, sees nothing of it ("the app is nowhere to be seen"). Once the set
 * has been out of view for a moment, a small arrow near the middle of the view points the way to turn, and it goes
 * as soon as the set is in view again. Not inside the set, which is all around; never in the lens.
 */
import { ConeGeometry, createSystem, Mesh, MeshBasicMaterial, Object3D, Quaternion, setWorldPosition, setWorldQuaternion, Vector3, VisibilityState } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { ViewfinderSystem } from './viewfinder.js';

/** Further than this from where the wearer looks, the set is out of view; nearer than the second, it is found. */
const LOST_AT = Math.cos((50 * Math.PI) / 180);
const FOUND_AT = Math.cos((35 * Math.PI) / 180);
/** Seconds out of view before the arrow shows, so a glance away does not bring it up. */
const LOST_FOR = 1.2;
/** Where the arrow sits: this far ahead of the eyes, and this far across toward the set. */
const AHEAD = 0.6;
const ASIDE = 0.12;
const UP = new Vector3(0, 1, 0);

type Globals = { lifeSize: Signal<boolean> };

export class SetFinderSystem extends createSystem({}) {
  private arrow!: Mesh;
  private stage: Object3D | null = null;
  private eye = new Vector3();
  private ahead = new Vector3();
  private toSet = new Vector3();
  private across = new Vector3();
  private at = new Vector3();
  private turn = new Quaternion();
  private head = new Quaternion();
  private lost = 0;
  private time = 0;

  init(): void {
    // A small chalk-yellow arrowhead, drawn over everything so it is never hidden by the room or the set.
    const arrow = new Mesh(new ConeGeometry(0.022, 0.055, 3), new MeshBasicMaterial({ color: 0xd6e13c, depthTest: false }));
    arrow.name = 'SetFinder';
    arrow.renderOrder = 1000;
    arrow.frustumCulled = false;
    arrow.visible = false;
    this.arrow = arrow;
    this.world.createTransformEntity(arrow);
    this.world.getSystem(ViewfinderSystem)?.hideFromLens(arrow);
  }

  update(delta: number, time: number): void {
    this.time = time;
    const g = this.globals as unknown as Globals;
    if (this.world.visibilityState.peek() !== VisibilityState.Visible || g.lifeSize.peek()) {
      this.hide();
      return;
    }
    this.stage ??= this.scene.getObjectByName('Stage') ?? null;
    const stage = this.stage;
    if (stage == null || !stage.visible) {
      this.hide();
      return;
    }
    const head = this.player.head;
    head.getWorldPosition(this.eye);
    head.getWorldQuaternion(this.head);
    this.ahead.set(0, 0, -1).applyQuaternion(this.head);
    stage.getWorldPosition(this.toSet).sub(this.eye);
    if (this.toSet.lengthSq() < 1e-6) return;
    this.toSet.normalize();
    const facing = this.ahead.dot(this.toSet);
    if (facing > FOUND_AT) {
      this.lost = 0;
      this.hide();
      return;
    }
    if (facing < LOST_AT) this.lost += delta;
    if (this.lost < LOST_FOR) return;
    // The way to turn: the direction to the set, across the view. Straight behind, turn right.
    this.across.copy(this.toSet).addScaledVector(this.ahead, -facing);
    if (this.across.lengthSq() < 1e-4) this.across.set(1, 0, 0).applyQuaternion(this.head);
    this.across.normalize();
    this.at.copy(this.eye).addScaledVector(this.ahead, AHEAD).addScaledVector(this.across, ASIDE);
    setWorldPosition(this.arrow, this.at);
    setWorldQuaternion(this.arrow, this.turn.setFromUnitVectors(UP, this.across));
    this.arrow.scale.setScalar(1 + 0.18 * Math.sin(this.time * 6));
    this.arrow.visible = true;
  }

  private hide(): void {
    if (this.arrow.visible) this.arrow.visible = false;
  }
}
