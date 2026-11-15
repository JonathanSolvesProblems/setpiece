/**
 * Where the set went. The set stays on the real table, so a wearer who puts the headset back on facing elsewhere, or
 * looking straight ahead over a table below them, sees nothing of it ("the app is nowhere to be seen"). Once the set
 * has been out of view for a moment, a small arrow near the middle of the view points the way to turn, and it goes
 * as soon as the set is in view again. Not inside the set, which is all around; never in the lens.
 *
 * A clap brings it back. The set can come back somewhere else after the headset sets its boundary again, so while
 * the set is lost from view or out of reach, two hands clapped ask for the same thing as Reset stage on the panel:
 * the set comes up to be landed again where the wearer points. Near the set a clap does nothing, so a clap for
 * "action" on a set in front of them never moves it.
 */
import { AudioSource, AudioUtils, CanvasTexture, ConeGeometry, createSystem, Entity, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry, Quaternion, setWorldPosition, setWorldQuaternion, SRGBColorSpace, Vector3, VisibilityState } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { ViewfinderSystem } from './viewfinder.js';
import { PiecesSystem } from './pieces.js';

/** Further than this from where the wearer looks, the set is out of view; nearer than the second, it is found. */
const LOST_AT = Math.cos((50 * Math.PI) / 180);
const FOUND_AT = Math.cos((35 * Math.PI) / 180);
/** Seconds out of view before the arrow shows, so a glance away does not bring it up. */
const LOST_FOR = 1.2;
/** Where the arrow sits: this far ahead of the eyes, and this far across toward the set. */
const AHEAD = 0.6;
const ASIDE = 0.12;
const UP = new Vector3(0, 1, 0);
/** Further than this from the eyes, the set is out of reach, and a clap brings it back too. */
const OUT_OF_REACH = 1.4;
/** A clap: the two palms come within NEAR having been FAR apart less than SNAP seconds before. Then a rest. */
const CLAP_NEAR = 0.07;
const CLAP_FAR = 0.18;
const CLAP_SNAP = 0.35;
const CLAP_REST = 2;

type Globals = { lifeSize: Signal<boolean>; resetStageRequested: Signal<number>; takeState: Signal<string> };

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
  private label!: Mesh;
  private clapCue: Entity | null = null;
  private down = new Vector3();
  /** When the palms were last far apart, and when a clap was last heard, in seconds. */
  private apartAt = -1;
  private clappedAt = -10;

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
    // Under the arrow, what to do about it, in the panel's lettering.
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      ctx.fillStyle = 'rgba(20, 18, 16, 0.82)';
      ctx.fillRect(0, 0, 512, 96);
      ctx.fillStyle = '#d6e13c';
      ctx.font = '700 46px "Big Shoulders", "Arial Narrow", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('THE SET IS THIS WAY. CLAP TO BRING IT', 256, 50);
    }
    const map = new CanvasTexture(canvas);
    map.colorSpace = SRGBColorSpace;
    const label = new Mesh(new PlaneGeometry(0.2, 0.0375), new MeshBasicMaterial({ map, transparent: true, depthTest: false }));
    label.name = 'SetFinderLabel';
    label.renderOrder = 1000;
    label.frustumCulled = false;
    label.visible = false;
    this.label = label;
    this.world.createTransformEntity(label);
    this.world.getSystem(ViewfinderSystem)?.hideFromLens(label);
    this.cleanupFuncs.push(() => map.dispose());
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
    const far = this.toSet.length() > OUT_OF_REACH;
    this.toSet.normalize();
    const facing = this.ahead.dot(this.toSet);
    if ((far || facing < LOST_AT) && this.clapped()) {
      this.bringBack();
      return;
    }
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
    this.at.addScaledVector(this.down.set(0, -1, 0).applyQuaternion(this.head), 0.055);
    setWorldPosition(this.label, this.at);
    setWorldQuaternion(this.label, this.head);
    this.label.visible = true;
  }

  /** Two tracked hands clapped this frame: the palms met fast, from apart. */
  private clapped(): boolean {
    const pieces = this.world.getSystem(PiecesSystem);
    const left = pieces?.hand('left');
    const right = pieces?.hand('right');
    if (left == null || right == null || !left.tracked || !right.tracked) {
      this.apartAt = -1;
      return false;
    }
    const gap = left.fistAt.distanceTo(right.fistAt);
    if (gap > CLAP_FAR) this.apartAt = this.time;
    if (gap > CLAP_NEAR || this.apartAt < 0 || this.time - this.apartAt > CLAP_SNAP || this.time - this.clappedAt < CLAP_REST) return false;
    this.clappedAt = this.time;
    this.apartAt = -1;
    return true;
  }

  /** The panel's Reset stage, from a clap: the set comes up to be landed again where the wearer points. */
  private bringBack(): void {
    const g = this.globals as unknown as Globals;
    if (g.takeState.peek() !== 'idle') return;
    g.resetStageRequested.value = g.resetStageRequested.peek() + 1;
    if (this.clapCue == null) {
      const holder = new Object3D();
      holder.name = 'ClapCue';
      this.clapCue = this.world.createTransformEntity(holder);
      this.clapCue.addComponent(AudioSource, { src: './audio/clap.wav', volume: 0.6, positional: false });
    }
    AudioUtils.play(this.clapCue);
    this.lost = 0;
    this.hide();
  }

  private hide(): void {
    if (this.arrow.visible) this.arrow.visible = false;
    if (this.label.visible) this.label.visible = false;
  }
}
