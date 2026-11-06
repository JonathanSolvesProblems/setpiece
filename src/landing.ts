/**
 * Landing the set by pointing. A chalk outline of the slate lies on whatever
 * real surface the hand aims at, found by the headset's live hit test, which
 * needs no room scan; a pinch sets the set down there. Until a hand is in view
 * the head aims instead, so a controller in a lap or a hand out of sight does
 * not leave the wearer with nothing.
 */
import {
  CanvasTexture,
  DoubleSide,
  Entity,
  EnvironmentRaycastTarget,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  RaycastSpace,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { STAGE_DEPTH, STAGE_WIDTH } from './scene-assets/rig.scene-asset.js';

type Side = 'left' | 'right';
type Aim = {
  side: Side | 'head';
  space: string;
  object: Group;
  entity: Entity;
  /** The input this aim's ray was made from; a tracked hand that returns is a new one. */
  source: XRInputSource | null;
  point: Vector3;
  last: Vector3;
  valid: boolean;
};

const OPTIC_YELLOW = 0xd6e13c;
const SLATE = '#1b1411';
const CHALK = '#f6f7ef';
const STENCIL = '"Big Shoulders Stencil"';
const SIGN_W = 1024;
const SIGN_H = 180;
const SIGN_WIDTH = 0.3;
/** A surface to land on is below the eyes by this much and within this reach along the floor. */
const MIN_BELOW_EYES = 0.1;
const MAX_REACH = 1.6;
/** A hand counts as the aiming hand once its point has moved this far in a frame. */
const AIM_MOVED = 0.004;
const FOLLOW_RATE = 18;
const SIGN_RATE = 7;
/** The outline has to rest on a surface this long before a pinch lands the set, so a stray press cannot. */
const STEADY_SECONDS = 0.4;
const SIGN_AHEAD = 0.75;
const SIGN_ABOVE_OUTLINE = 0.12;
const EDGE = 0.006;
const NO_RAYCAST = (): void => {};

export class LandingGuide {
  private outline = new Group();
  private sign: Mesh;
  private canvas: HTMLCanvasElement;
  private texture: CanvasTexture;
  private aims: Aim[] = [];
  private active: Aim | null = null;
  private shown = false;
  private drawn = '';
  private yaw = new Quaternion();
  private signAt = new Vector3();
  private hand = new Vector3();
  private forward = new Vector3();
  private flat = new Vector3();
  private fontsReady = false;
  /** The headset has reported a surface at least once this session. */
  everHit = false;
  hasHit = false;
  /** Where the outline is now. */
  at = new Vector3();
  private held = 0;

  /** The outline has been on a surface long enough for the wearer to have seen it. */
  get ready(): boolean {
    return this.hasHit && this.held >= STEADY_SECONDS;
  }

  /** This hand can land the set: its own ray is on a surface, or only the head is aiming. */
  canLand(side: Side): boolean {
    if (!this.ready || this.active == null) return false;
    return this.active.side === 'head' || this.aims.some((aim) => aim.side === side && aim.valid);
  }

  constructor(private world: World) {
    const material = new MeshBasicMaterial({ color: OPTIC_YELLOW, side: DoubleSide, toneMapped: false });
    const long = new PlaneGeometry(STAGE_WIDTH, EDGE);
    const short = new PlaneGeometry(EDGE, STAGE_DEPTH);
    for (const [geometry, x, z] of [
      [long, 0, STAGE_DEPTH / 2],
      [long, 0, -STAGE_DEPTH / 2],
      [short, STAGE_WIDTH / 2, 0],
      [short, -STAGE_WIDTH / 2, 0],
    ] as [PlaneGeometry, number, number][]) {
      const edge = new Mesh(geometry, material);
      edge.rotation.x = -Math.PI / 2;
      edge.position.set(x, 0.003, z);
      edge.raycast = NO_RAYCAST;
      this.outline.add(edge);
    }
    this.outline.name = 'LandingOutline';
    this.outline.visible = false;
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIGN_W;
    this.canvas.height = SIGN_H;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.sign = new Mesh(
      new PlaneGeometry(SIGN_WIDTH, (SIGN_WIDTH * SIGN_H) / SIGN_W),
      new MeshBasicMaterial({ map: this.texture, toneMapped: false }),
    );
    this.sign.name = 'LandingSign';
    this.sign.visible = false;
    this.sign.raycast = NO_RAYCAST;
    world.createTransformEntity(this.outline);
    world.createTransformEntity(this.sign);
    this.aims = [this.makeAim('right', RaycastSpace.Right), this.makeAim('left', RaycastSpace.Left), this.makeAim('head', RaycastSpace.Viewer)];
    void document.fonts.load(`700 80px ${STENCIL}`).finally(() => {
      this.fontsReady = true;
      this.drawn = '';
    });
  }

  private makeAim(side: Aim['side'], space: string): Aim {
    const object = new Group();
    object.name = `LandingAim-${side}`;
    const entity = this.world.createTransformEntity(object);
    return { side, space, object, entity, source: null, point: new Vector3(), last: new Vector3(), valid: false };
  }

  private listen(aim: Aim, on: boolean): void {
    if (aim.entity.hasComponent(EnvironmentRaycastTarget)) aim.entity.removeComponent(EnvironmentRaycastTarget);
    if (on) aim.entity.addComponent(EnvironmentRaycastTarget, { space: aim.space as never, maxDistance: 3 });
  }

  show(on: boolean): void {
    this.shown = on;
    this.sign.visible = on;
    this.outline.visible = false;
    this.hasHit = false;
    this.active = null;
    for (const aim of this.aims) {
      aim.valid = false;
      aim.source = null;
      this.listen(aim, on);
    }
  }

  dispose(): void {
    this.texture.dispose();
  }

  /** Where a pinch from this hand lands: its own point if it has one, otherwise the outline. */
  pointFor(side: Side): Vector3 {
    for (const aim of this.aims) if (aim.side === side && aim.valid) return aim.point;
    return this.at;
  }

  update(seconds: number, head: Object3D, spaces: Record<Side, Object3D>, inputs: Record<Side, XRInputSource | null>, controllers: boolean): void {
    if (!this.shown) return;
    head.getWorldPosition(this.signAt);
    const eye = this.signAt;
    let best: Aim | null = null;
    for (const aim of this.aims) {
      if (aim.side !== 'head') {
        const input = inputs[aim.side];
        // A hand that leaves view and returns is a new input; its ray has to be asked for again.
        if (input !== aim.source) {
          aim.source = input;
          this.listen(aim, true);
        }
      }
      const hit = aim.object.visible && aim.entity.getValue(EnvironmentRaycastTarget, 'xrHitTestResult') != null;
      aim.last.copy(aim.point);
      if (hit) aim.object.getWorldPosition(aim.point);
      const reach = Math.hypot(aim.point.x - eye.x, aim.point.z - eye.z);
      let below = hit && eye.y - aim.point.y >= MIN_BELOW_EYES && reach <= MAX_REACH;
      if (below && aim.side !== 'head') {
        // A real surface under the hand, not the wall it happens to point along.
        spaces[aim.side].getWorldPosition(this.hand);
        below = aim.point.y <= this.hand.y + 0.03;
      }
      aim.valid = below;
      if (!aim.valid) continue;
      if (aim.side !== 'head' && aim.point.distanceTo(aim.last) > AIM_MOVED) best = aim;
    }
    // Stay with the hand that moved last; a resting hand does not steal the outline.
    if (best != null) this.active = best;
    if (this.active == null || !this.active.valid) {
      this.active = null;
      for (const aim of this.aims) {
        if (aim.valid) {
          this.active = aim;
          break;
        }
      }
    }
    const aim = this.active;
    const had = this.hasHit;
    this.hasHit = aim != null;
    this.held = this.hasHit ? this.held + seconds : 0;
    this.outline.visible = this.hasHit;
    if (aim != null) {
      this.everHit = true;
      const ease = had ? 1 - Math.exp(-FOLLOW_RATE * seconds) : 1;
      this.at.lerp(aim.point, ease);
      this.outline.position.copy(this.at);
      this.flat.set(eye.x - this.at.x, 0, eye.z - this.at.z);
      this.outline.quaternion.setFromAxisAngle(this.up, Math.atan2(this.flat.x, this.flat.z));
      this.forward.copy(this.at);
      this.forward.y += SIGN_ABOVE_OUTLINE;
    } else {
      head.getWorldDirection(this.forward).negate().multiplyScalar(SIGN_AHEAD).add(eye);
    }
    this.sign.position.lerp(this.forward, 1 - Math.exp(-SIGN_RATE * seconds));
    this.sign.lookAt(eye);
    this.draw(controllers);
  }

  private up = new Vector3(0, 1, 0);

  private draw(controllers: boolean): void {
    const line = this.hasHit
      ? controllers
        ? 'PULL THE TRIGGER TO LAND THE SET'
        : 'PINCH TO LAND THE SET'
      : 'POINT AT YOUR TABLE';
    if (line === this.drawn || !this.fontsReady) return;
    this.drawn = line;
    const ctx = this.canvas.getContext('2d');
    if (ctx == null) return;
    ctx.fillStyle = SLATE;
    ctx.fillRect(0, 0, SIGN_W, SIGN_H);
    ctx.fillStyle = '#d6e13c';
    ctx.fillRect(0, 0, 14, SIGN_H);
    ctx.fillStyle = CHALK;
    let px = 96;
    ctx.font = `700 ${px}px ${STENCIL}`;
    while (px > 48 && ctx.measureText(line).width > SIGN_W - 90) {
      px -= 4;
      ctx.font = `700 ${px}px ${STENCIL}`;
    }
    ctx.textBaseline = 'middle';
    ctx.fillText(line, 50, SIGN_H / 2 + 6);
    this.texture.needsUpdate = true;
  }
}
