/**
 * A held piece turns with the wrist. The grab carries a piece with the hand
 * and never turns it, so the turn is read here: the part of the hand's
 * rotation since the last frame that is about the vertical. It is amplified,
 * because a wrist turns comfortably through about a quarter turn and an actor
 * needs to face any way, and smoothed, because tracking noise on a held camera
 * is a shaking picture on the monitor.
 */
import { Object3D, Quaternion, setWorldQuaternion, Vector3 } from '@iwsdk/core';

const UP = new Vector3(0, 1, 0);
/** How fast the piece catches up with the hand, per second. */
const CATCH_UP = 16;
/** A turn larger than this in one frame is tracking being lost and found, not a wrist. */
const MAX_STEP = 0.5;

export class HandTurn {
  private space: Object3D | null = null;
  private previous = new Quaternion();
  private now = new Quaternion();
  private delta = new Quaternion();
  private turn = new Quaternion();
  private world = new Quaternion();
  private pending = 0;
  /** Radians turned since the hold began, for callers that ask whether it moved. */
  total = 0;

  get active(): boolean {
    return this.space != null;
  }

  /** Start following this hand: its grip space, which turns with the wrist. */
  begin(space: Object3D): void {
    this.space = space;
    space.getWorldQuaternion(this.previous);
    this.pending = 0;
    this.total = 0;
  }

  end(): void {
    this.space = null;
    this.pending = 0;
  }

  /** Turn the object about the vertical by what the wrist did this frame. */
  apply(object: Object3D, seconds: number, gain: number): void {
    const space = this.space;
    if (space == null) return;
    space.getWorldQuaternion(this.now);
    this.delta.copy(this.previous).invert().premultiply(this.now);
    this.previous.copy(this.now);
    // The twist of that rotation about the vertical axis.
    let y = this.delta.y;
    let w = this.delta.w;
    if (w < 0) {
      y = -y;
      w = -w;
    }
    const yaw = 2 * Math.atan2(y, w);
    if (Math.abs(yaw) < MAX_STEP) this.pending += yaw * gain;
    const step = this.pending * (1 - Math.exp(-CATCH_UP * seconds));
    if (Math.abs(step) < 1e-5) return;
    this.pending -= step;
    this.total += step;
    object.getWorldQuaternion(this.world);
    this.world.premultiply(this.turn.setFromAxisAngle(UP, step));
    setWorldQuaternion(object, this.world);
  }
}
