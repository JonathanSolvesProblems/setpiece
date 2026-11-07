/**
 * A held piece turns with the wrist. The grab carries a piece with the hand
 * and never turns it, so the turn is read here: the part of the hand's
 * rotation since the last frame that is about the vertical. It is amplified,
 * because a wrist turns comfortably through about a quarter turn and an actor
 * needs to face any way, and filtered, because tracking noise amplified on a
 * long piece is a shaking car, and on a held camera a shaking picture.
 *
 * A camera also tilts. Given a level axis (the camera's own left-to-right), the
 * part of the hand's rotation about that axis is read the same way, so tipping
 * the wrist forward tips the camera down, as it would with the camera in hand.
 */
import { Object3D, Quaternion, setWorldQuaternion, Vector3 } from '@iwsdk/core';
import { OneEuro } from './one-euro.js';

const UP = new Vector3(0, 1, 0);
/** A turn larger than this in one frame is tracking being lost and found, not a wrist. */
const MAX_STEP = 0.5;
/** The filter: hertz at rest, and how far speed opens it. Chosen against simulated tracking noise of 0.2 to 0.4 degrees. */
const REST_CUTOFF = 0.8;
const SPEED_OPENS = 0.5;

export class HandTurn {
  private space: Object3D | null = null;
  private previous = new Quaternion();
  private now = new Quaternion();
  private delta = new Quaternion();
  private turn = new Quaternion();
  private world = new Quaternion();
  /** Where the wrist has asked the piece to be since the hold began, and where it has been put. */
  private asked = 0;
  private applied = 0;
  private askedTilt = 0;
  private appliedTilt = 0;
  private yawFilter = new OneEuro(REST_CUTOFF, SPEED_OPENS);
  private tiltFilter = new OneEuro(REST_CUTOFF, SPEED_OPENS);
  /** Radians turned since the hold began, for callers that ask whether it moved. */
  total = 0;
  /** Radians to tilt this frame, when apply was given an axis to tilt about. */
  tiltStep = 0;
  /** Radians the wrist has asked to tilt since the hold began, before smoothing. */
  tiltAsked = 0;

  get active(): boolean {
    return this.space != null;
  }

  /** Start following this hand: its grip space, which turns with the wrist. */
  begin(space: Object3D): void {
    this.space = space;
    space.getWorldQuaternion(this.previous);
    this.asked = 0;
    this.applied = 0;
    this.askedTilt = 0;
    this.appliedTilt = 0;
    this.yawFilter.reset();
    this.tiltFilter.reset();
    this.total = 0;
    this.tiltStep = 0;
    this.tiltAsked = 0;
  }

  end(): void {
    this.space = null;
    this.tiltStep = 0;
  }

  /**
   * Turn the object about the vertical by what the wrist did this frame. With
   * a tilt axis, also work out this frame's tilt about it and leave it in
   * `tiltStep` for the caller, who knows what tilts.
   */
  apply(object: Object3D, seconds: number, gain: number, tiltAxis?: Vector3, tiltGain = 0): void {
    const space = this.space;
    this.tiltStep = 0;
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
    if (Math.abs(yaw) < MAX_STEP) this.asked += yaw * gain;
    if (tiltAxis != null) {
      // The twist of the same rotation about the level axis.
      const d = this.delta;
      let along = d.x * tiltAxis.x + d.y * tiltAxis.y + d.z * tiltAxis.z;
      if (d.w < 0) along = -along;
      const tilt = 2 * Math.atan2(along, w);
      if (Math.abs(tilt) < MAX_STEP) this.askedTilt += tilt * tiltGain;
      const tiltNow = this.tiltFilter.next(this.askedTilt, seconds);
      this.tiltStep = tiltNow - this.appliedTilt;
      this.appliedTilt = tiltNow;
      this.tiltAsked = tiltNow;
    }
    const now = this.yawFilter.next(this.asked, seconds);
    const step = now - this.applied;
    if (Math.abs(step) < 1e-5) return;
    this.applied = now;
    this.total += step;
    object.getWorldQuaternion(this.world);
    this.world.premultiply(this.turn.setFromAxisAngle(UP, step));
    setWorldQuaternion(object, this.world);
  }
}
