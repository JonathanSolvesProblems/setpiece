/**
 * What a tracked hand is doing right now: where its fingertips meet, where its
 * palm closes, and how far it has closed. The closing is measured against the
 * hand's own size, from a wearer's hand on Quest 3: a fist reads about 0.7, an
 * open hand 1.5 to 1.8, and a hand at rest anywhere between. So a grab is the
 * moment a hand goes from open to shut, never a hand that merely stays closed.
 */
import { Object3D, Vector3 } from '@iwsdk/core';

const JOINTS: XRHandJoint[] = [
  'wrist',
  'middle-finger-phalanx-proximal',
  'thumb-tip',
  'index-finger-tip',
  'middle-finger-tip',
  'ring-finger-tip',
  'pinky-finger-tip',
];
const STRIDE = 16;
const FIST_SHUT = 1;
const FIST_OPEN = 1.2;
/** Past the knuckles, towards the fingers: the middle of a closed hand. */
const PALM_REACH = 1.25;

const dist = (a: Float32Array, i: number, b: number): number =>
  Math.hypot(a[i * STRIDE + 12] - a[b * STRIDE + 12], a[i * STRIDE + 13] - a[b * STRIDE + 13], a[i * STRIDE + 14] - a[b * STRIDE + 14]);

export class HandReading {
  tracked = false;
  /** Between the thumb and index tips, in world space. */
  readonly pinchAt = new Vector3();
  /** Inside the closed hand, in world space. */
  readonly fistAt = new Vector3();
  shut = false;
  /** Metres between thumb and index tips, as last tracked. */
  pinchGap = 0;
  /** True for the one frame the hand went from open to shut. */
  fistStart = false;

  private hand: XRHand | null = null;
  private spaces: XRJointSpace[] = [];
  private poses = new Float32Array(JOINTS.length * STRIDE);

  read(frame: XRFrame, base: XRReferenceSpace, source: XRInputSource | null | undefined, origin: Object3D): void {
    this.fistStart = false;
    const hand = source?.hand ?? null;
    if (hand == null) {
      this.tracked = false;
      return;
    }
    if (hand !== this.hand) {
      // A hand that drops out comes back as a new object.
      this.hand = hand;
      this.spaces.length = 0;
      for (const name of JOINTS) {
        const joint = hand.get(name);
        if (joint) this.spaces.push(joint);
      }
    }
    if (this.spaces.length !== JOINTS.length || !(frame as XRFrame & { fillPoses?: (s: XRSpace[], b: XRSpace, t: Float32Array) => boolean }).fillPoses?.(this.spaces, base, this.poses)) {
      this.tracked = false;
      return;
    }
    this.tracked = true;
    const p = this.poses;
    this.pinchAt.set((p[2 * STRIDE + 12] + p[3 * STRIDE + 12]) / 2, (p[2 * STRIDE + 13] + p[3 * STRIDE + 13]) / 2, (p[2 * STRIDE + 14] + p[3 * STRIDE + 14]) / 2);
    origin.localToWorld(this.pinchAt);
    const wx = p[12];
    const wy = p[13];
    const wz = p[14];
    this.fistAt.set(wx + (p[STRIDE + 12] - wx) * PALM_REACH, wy + (p[STRIDE + 13] - wy) * PALM_REACH, wz + (p[STRIDE + 14] - wz) * PALM_REACH);
    origin.localToWorld(this.fistAt);
    this.pinchGap = dist(p, 2, 3);
    const palm = dist(p, 0, 1);
    if (palm < 0.01) return;
    const curl = (dist(p, 4, 0) + dist(p, 5, 0) + dist(p, 6, 0)) / 3 / palm;
    if (!this.shut && curl <= FIST_SHUT) {
      this.shut = true;
      this.fistStart = true;
    } else if (this.shut && curl >= FIST_OPEN) {
      this.shut = false;
    }
  }
}
