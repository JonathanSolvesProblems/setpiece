/**
 * Stage placement. In a session the set lands on a real table one of three
 * ways, whichever the room allows:
 *
 *  1. the headset reports a table or desk, and the set drops onto the nearest;
 *  2. the user touches their table with a fingertip and pinches, which needs
 *     hand tracking and nothing else, so it works in a room that was never
 *     scanned and when room data was not allowed;
 *  3. the user grabs the plate and carries the set there.
 *
 * Until one of those happens the set floats in front of the user. Wherever it
 * ends up it is parked on a room anchor and its pose is saved, so the set is
 * back where it was left on the next launch.
 */
import {
  AudioSource,
  AudioUtils,
  createSystem,
  Entity,
  Grabbed,
  Pressed,
  VisibilityState,
  Quaternion,
  setWorldPosition,
  setWorldQuaternion,
  Vector3,
  XRAnchor,
  XRMesh,
  XRPlane,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { STAGE_DEPTH } from './scene-assets/rig.scene-asset.js';
import { Placement, SetPiece, StageAnchor } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

const TABLE_LABELS = new Set(['table', 'desk']);
const STAGE_LIFT = 0.002;
/** Seconds to keep collecting tables after the first one, so the nearest wins. */
const CANDIDATE_WINDOW = 1.0;
/** Seconds after a session starts to wait for a saved anchor before auto-placing. */
const ANCHOR_WAIT_SECONDS = 8;
/**
 * Floating: this far ahead of the head and this far below it. High enough that
 * a hand resting on the table aims under the set, not at it.
 */
const FLOAT_AHEAD = 0.55;
const FLOAT_BELOW = 0.34;
/**
 * Seconds into a session before the head pose is used for floating, and how
 * long to keep waiting for a pose that is still exactly at the origin (a
 * headset reports that for its first frames, before tracking has a pose).
 */
const FLOAT_DELAY = 0.3;
const FLOAT_GIVE_UP = 1.5;
/** A pinch places the set only when the fingertip is down at a surface, within reach, and still. */
const TOUCH_MIN_DROP = 0.2;
const TOUCH_MAX_REACH = 0.9;
const TOUCH_MAX_SECONDS = 1.2;
const TOUCH_MAX_DRIFT = 0.05;
/** The slate's near edge lands this far beyond the fingertip, clear of the hand. */
const TOUCH_CLEARANCE = 0.05;
/** A fingertip joint sits about this far above the surface the finger rests on. */
const FINGER_PAD = 0.008;
/** The set settles onto the table over this long. */
const SETTLE_SECONDS = 0.22;
const SETTLE_FROM = 0.94;
const UP = new Vector3(0, 1, 0);

type Candidate = { x: number; top: number; z: number };

export const StageStatus = {
  Floating: 'Floating. Touch your table and pinch to land it.',
  Table: 'On your table.',
  Touch: 'On your table, where you touched it.',
  Manual: 'Moved by hand. Position saved.',
  Restored: 'Back where you left it.',
} as const;

type SavedPose = { anchored: boolean; position: number[]; quaternion: number[] };
type Globals = { stageStatus: Signal<string>; resetStageRequested: Signal<number> };
type NativePlane = { orientation?: string; semanticLabel?: string };
type Side = 'left' | 'right';
type Pinch = {
  /** Set by the session's selectstart; the pose is read on the next update. */
  begun: boolean;
  active: boolean;
  ended: boolean;
  /** True once the pinch grabbed or pressed something: it was not meant for the table. */
  claimed: boolean;
  seconds: number;
  /** The fingertip when the pinch closed: the point on the surface. */
  start: Vector3;
  /** The hand itself when the pinch closed. A fingertip travels as it pinches; the hand should not. */
  hand: Vector3;
};

const newPinch = (): Pinch => ({
  begun: false,
  active: false,
  ended: false,
  claimed: false,
  seconds: 0,
  start: new Vector3(),
  hand: new Vector3(),
});

export class PlacementSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  heldStages: { required: [StageAnchor, Grabbed] },
  grabbed: { required: [Grabbed] },
  pressed: { required: [Pressed] },
  meshes: { required: [XRMesh] },
  planes: { required: [XRPlane] },
}) {
  private corner = new Vector3();
  private head = new Vector3();
  private forward = new Vector3();
  private tip = new Vector3();
  private centre = new Vector3();
  private yawQuaternion = new Quaternion();
  private authoredPosition = new Vector3();
  private authoredQuaternion = new Quaternion();
  private lastWorldPosition = new Vector3();
  private lastWorldQuaternion = new Quaternion();
  private stageReady = false;
  private attachedSeen = false;
  private tableDone = false;
  private floatPending = false;
  private settle = 0;
  private resetSeen = 0;
  private candidates: Candidate[] = [];
  private candidateTimer = -1;
  private sessionElapsed = 0;
  private boundSession: XRSession | null = null;
  private pinches: Record<Side, Pinch> = { left: newPinch(), right: newPinch() };

  private onSelectStart = (event: XRInputSourceEvent): void => {
    const side = event.inputSource.handedness;
    if (side !== 'left' && side !== 'right') return;
    const pinch = this.pinches[side];
    pinch.begun = true;
    pinch.active = true;
    pinch.ended = false;
    pinch.claimed = false;
    pinch.seconds = 0;
  };

  private onSelectEnd = (event: XRInputSourceEvent): void => {
    const side = event.inputSource.handedness;
    if (side !== 'left' && side !== 'right') return;
    this.pinches[side].ended = true;
  };

  init(): void {
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.sessionElapsed = 0;
        this.onVisibility(state);
      }),
      this.queries.heldStages.subscribe('qualify', (stage) => {
        stage.setValue(StageAnchor, 'placement', Placement.Manual);
        this.floatPending = false;
        this.status(StageStatus.Manual);
      }),
      this.queries.heldStages.subscribe('disqualify', (stage) => this.save(stage)),
      this.queries.meshes.subscribe('qualify', (mesh) => this.onSurface(mesh, 'mesh')),
      this.queries.planes.subscribe('qualify', (plane) => this.onSurface(plane, 'plane')),
      g.resetStageRequested.subscribe((n) => {
        if (n > this.resetSeen) {
          this.resetSeen = n;
          this.reset();
        }
      }),
      () => this.bindSession(null),
    );
  }

  update(delta: number): void {
    const stage = this.firstStage();
    const object = stage?.object3D;
    if (stage == null || object == null) return;
    if (!this.stageReady) {
      // The qualify event fires before the entity's object exists, so set up here.
      this.stageReady = true;
      this.onStage(stage);
    }
    const session = (this.world.session as XRSession | undefined) ?? null;
    if (session !== this.boundSession) this.bindSession(session);

    const attached = stage.hasComponent(XRAnchor) && stage.getValue(XRAnchor, 'attached') === true;
    if (attached && !this.attachedSeen) {
      this.attachedSeen = true;
      // The anchor re-parents the stage. Keep a placed pose, or restore, or fall back.
      const placement = stage.getValue(StageAnchor, 'placement');
      if (placement === Placement.Table || placement === Placement.Touch || placement === Placement.Manual) {
        setWorldPosition(object, this.lastWorldPosition);
        setWorldQuaternion(object, this.lastWorldQuaternion);
        this.save(stage);
      } else if (!this.tryRestore(stage, true)) {
        // A pose saved without an anchor is not trustworthy in a new session:
        // start again from the tables the headset has reported, or float.
        stage.setValue(StageAnchor, 'placement', Placement.Floating);
        this.tableDone = false;
        this.floatPending = true;
        this.status(StageStatus.Floating);
        this.offerKnownSurfaces();
      }
    }
    this.sessionElapsed += delta;
    const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (this.floatPending && inSession && this.sessionElapsed >= FLOAT_DELAY) {
      this.player.head.getWorldPosition(this.head);
      if (this.head.lengthSq() > 1e-4 || this.sessionElapsed >= FLOAT_GIVE_UP) {
        this.floatPending = false;
        if (stage.getValue(StageAnchor, 'placement') === Placement.Floating) this.floatInFront(stage);
      }
    }
    if (this.candidateTimer >= 0) {
      this.candidateTimer -= delta;
      if (this.candidateTimer <= 0) {
        this.candidateTimer = -1;
        this.chooseTable(stage);
      }
    }
    if (inSession) {
      this.updatePinch(stage, 'left', delta);
      this.updatePinch(stage, 'right', delta);
    }
    if (this.settle > 0) {
      this.settle = Math.max(0, this.settle - delta);
      const t = 1 - this.settle / SETTLE_SECONDS;
      object.scale.setScalar(SETTLE_FROM + (1 - SETTLE_FROM) * (1 - (1 - t) * (1 - t)));
    }
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.lastWorldPosition);
    object.getWorldQuaternion(this.lastWorldQuaternion);
  }

  private firstStage(): Entity | undefined {
    return this.queries.stages.entities.values().next().value as Entity | undefined;
  }

  private status(text: string): void {
    (this.globals as Globals).stageStatus.value = text;
  }

  /** Pinches arrive as session events; they are judged in update, where the hand poses are current. */
  private bindSession(session: XRSession | null): void {
    this.boundSession?.removeEventListener('selectstart', this.onSelectStart);
    this.boundSession?.removeEventListener('selectend', this.onSelectEnd);
    this.boundSession = session;
    session?.addEventListener('selectstart', this.onSelectStart);
    session?.addEventListener('selectend', this.onSelectEnd);
    this.pinches.left.active = false;
    this.pinches.right.active = false;
  }

  /**
   * A short pinch that grabbed nothing and pressed nothing, made with the
   * fingertip down at a surface, puts the set there. Only while it floats:
   * once the set is placed, a stray pinch does nothing.
   */
  private updatePinch(stage: Entity, side: Side, delta: number): void {
    const pinch = this.pinches[side];
    if (!pinch.active) return;
    const handSpace = this.player.gripSpaces[side];
    if (pinch.begun) {
      pinch.begun = false;
      this.player.indexTipSpaces[side].getWorldPosition(pinch.start);
      handSpace.getWorldPosition(pinch.hand);
    }
    pinch.seconds += delta;
    if (this.queries.grabbed.entities.size > 0 || this.queries.pressed.entities.size > 0) pinch.claimed = true;
    if (!pinch.ended) return;
    pinch.active = false;
    pinch.ended = false;
    if (pinch.claimed || pinch.seconds > TOUCH_MAX_SECONDS) return;
    if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
    handSpace.getWorldPosition(this.tip);
    if (this.tip.distanceTo(pinch.hand) > TOUCH_MAX_DRIFT) return;
    this.placeAtFingertip(stage, pinch.start);
  }

  private placeAtFingertip(stage: Entity, tip: Vector3): void {
    this.player.head.getWorldPosition(this.head);
    const dx = tip.x - this.head.x;
    const dz = tip.z - this.head.z;
    const reach = Math.hypot(dx, dz);
    if (this.head.y - tip.y < TOUCH_MIN_DROP || reach > TOUCH_MAX_REACH) return;
    // The set goes beyond the finger, along the line from the user to it.
    let ux = dx / reach;
    let uz = dz / reach;
    if (reach < 0.05) {
      this.headForward();
      ux = this.forward.x;
      uz = this.forward.z;
    }
    const out = STAGE_DEPTH / 2 + TOUCH_CLEARANCE;
    this.placeAt(stage, tip.x + ux * out, tip.y - FINGER_PAD, tip.z + uz * out, Placement.Touch, StageStatus.Touch);
  }

  /** The way the head faces, flattened onto the floor plane. */
  private headForward(): Vector3 {
    this.player.head.getWorldDirection(this.forward).negate();
    this.forward.y = 0;
    if (this.forward.lengthSq() < 1e-4) this.forward.set(0, 0, -1);
    return this.forward.normalize();
  }

  /** Runs once, on the first frame the stage has an object: capture the authored pose, anchor, restore. */
  private onStage(stage: Entity): void {
    const object = stage.object3D!;
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.authoredPosition);
    object.getWorldQuaternion(this.authoredQuaternion);
    if (stage.getValue(StageAnchor, 'persist') && !stage.hasComponent(XRAnchor)) {
      stage.addComponent(XRAnchor);
    }
    this.status(StageStatus.Floating);
  }

  /**
   * The 2D page is a preview and always shows the stage at its authored place. A
   * saved pose is restored only inside an XR session: through the anchor when one
   * attaches, or directly on devices that never attach one.
   */
  private onVisibility(state: VisibilityState): void {
    const stage = this.firstStage();
    if (stage?.object3D == null || !this.stageReady) return;
    if (state === VisibilityState.NonImmersive) {
      this.applyAuthored(stage);
      stage.setValue(StageAnchor, 'placement', Placement.Floating);
      this.tableDone = false;
      this.attachedSeen = false;
      this.floatPending = false;
      this.candidates = [];
      this.candidateTimer = -1;
      this.status(StageStatus.Floating);
    } else if (state === VisibilityState.Visible) {
      if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
      const pose = this.load();
      if (pose != null && !pose.anchored && this.tryRestore(stage, false)) return;
      this.floatPending = true;
    }
  }

  /** A detected table or desk: place the stage on top of it, facing the user. */
  private onSurface(entity: Entity, kind: 'mesh' | 'plane'): void {
    if (this.tableDone) return;
    const stage = this.firstStage();
    const object = entity.object3D;
    if (stage?.object3D == null || object == null) return;
    if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
    let top = 0;
    const centre = this.centre;
    if (kind === 'mesh') {
      const label = (entity.getValue(XRMesh, 'semanticLabel') ?? '').toLowerCase();
      if (!TABLE_LABELS.has(label) || !entity.getValue(XRMesh, 'isBounded3D')) return;
      const min = entity.getVectorView(XRMesh, 'min');
      const max = entity.getVectorView(XRMesh, 'max');
      object.updateWorldMatrix(true, false);
      top = -Infinity;
      centre.set(0, 0, 0);
      for (let i = 0; i < 8; i++) {
        this.corner.set(i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]);
        object.localToWorld(this.corner);
        top = Math.max(top, this.corner.y);
        centre.x += this.corner.x / 8;
        centre.z += this.corner.z / 8;
      }
    } else {
      const plane = entity.getValue(XRPlane, '_plane') as NativePlane | undefined;
      const label = (plane?.semanticLabel ?? '').toLowerCase();
      if (plane?.orientation !== 'horizontal' || !TABLE_LABELS.has(label)) return;
      object.getWorldPosition(centre);
      top = centre.y;
    }
    this.candidates.push({ x: centre.x, top, z: centre.z });
    if (this.candidateTimer < 0) this.candidateTimer = CANDIDATE_WINDOW;
  }

  /** After the window closes, the table nearest the user wins. */
  private chooseTable(stage: Entity): void {
    const candidates = this.candidates;
    this.candidates = [];
    if (this.tableDone || candidates.length === 0) return;
    if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
    // A saved anchored pose outranks auto-placement; give the anchor time to attach.
    const anchorPending =
      !this.attachedSeen && this.sessionElapsed < ANCHOR_WAIT_SECONDS && this.load()?.anchored === true;
    if (anchorPending) {
      this.candidates = candidates;
      this.candidateTimer = 0.5;
      return;
    }
    this.player.head.getWorldPosition(this.head);
    let best = candidates[0];
    let bestDistance = Infinity;
    for (const candidate of candidates) {
      const distance = Math.hypot(candidate.x - this.head.x, candidate.z - this.head.z);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    this.placeAt(stage, best.x, best.top, best.z, Placement.Table, StageStatus.Table);
  }

  /** Put the stage on a surface at this point, turned to face the user, and keep it there. */
  private placeAt(stage: Entity, x: number, top: number, z: number, placement: string, status: string): void {
    const object = stage.object3D!;
    this.player.head.getWorldPosition(this.head);
    const yaw = Math.atan2(this.head.x - x, this.head.z - z);
    this.corner.set(x, top + STAGE_LIFT, z);
    setWorldPosition(object, this.corner);
    setWorldQuaternion(object, this.yawQuaternion.setFromAxisAngle(UP, yaw));
    stage.setValue(StageAnchor, 'placement', placement);
    this.tableDone = true;
    this.floatPending = false;
    this.settle = SETTLE_SECONDS;
    if (stage.hasComponent(AudioSource)) AudioUtils.play(stage);
    this.status(status);
    this.save(stage);
  }

  /** Nothing to land on yet: hold the set in front of the user, where they are looking. */
  private floatInFront(stage: Entity): void {
    const object = stage.object3D!;
    this.player.head.getWorldPosition(this.head);
    const forward = this.headForward();
    this.corner.set(
      this.head.x + forward.x * FLOAT_AHEAD,
      this.head.y - FLOAT_BELOW,
      this.head.z + forward.z * FLOAT_AHEAD,
    );
    setWorldPosition(object, this.corner);
    setWorldQuaternion(object, this.yawQuaternion.setFromAxisAngle(UP, Math.atan2(-forward.x, -forward.z)));
  }

  private applyAuthored(stage: Entity): void {
    const object = stage.object3D!;
    object.scale.setScalar(1);
    this.settle = 0;
    setWorldPosition(object, this.authoredPosition);
    setWorldQuaternion(object, this.authoredQuaternion);
  }

  private save(stage: Entity): void {
    const object = stage.object3D;
    if (object == null || !stage.getValue(StageAnchor, 'persist')) return;
    const anchored = stage.hasComponent(XRAnchor) && stage.getValue(XRAnchor, 'attached') === true;
    const pose: SavedPose = {
      anchored,
      position: object.position.toArray(),
      quaternion: object.quaternion.toArray() as number[],
    };
    saveJson(StoreKey.Stage, pose);
  }

  private load(): SavedPose | null {
    return loadJson<SavedPose>(StoreKey.Stage);
  }

  /** Re-apply a saved pose when it was saved in the same frame (anchored or not). */
  private tryRestore(stage: Entity, anchored: boolean): boolean {
    const pose = this.load();
    const object = stage.object3D;
    if (pose == null || object == null || pose.anchored !== anchored) return false;
    if (pose.position.length !== 3 || pose.quaternion.length !== 4) return false;
    object.position.fromArray(pose.position);
    object.quaternion.fromArray(pose.quaternion);
    stage.setValue(StageAnchor, 'placement', Placement.Restored);
    this.tableDone = true;
    this.floatPending = false;
    this.status(StageStatus.Restored);
    return true;
  }

  private reset(): void {
    const stage = this.firstStage();
    if (stage?.object3D == null) return;
    clearKey(StoreKey.Stage);
    stage.setValue(StageAnchor, 'placement', Placement.Floating);
    this.tableDone = false;
    this.status(StageStatus.Floating);
    if (this.world.visibilityState.peek() === VisibilityState.NonImmersive) {
      this.applyAuthored(stage);
      return;
    }
    // In a session, reset means back on the table: offer the surfaces the
    // headset already reported again, and the nearest one wins as on entry.
    // With none, the set floats in front of the user for a touch or a grab.
    this.floatInFront(stage);
    this.offerKnownSurfaces();
  }

  /** Surfaces are offered once, as they are reported; this offers the known ones again. */
  private offerKnownSurfaces(): void {
    this.candidates = [];
    this.candidateTimer = -1;
    for (const mesh of this.queries.meshes.entities) this.onSurface(mesh, 'mesh');
    for (const plane of this.queries.planes.entities) this.onSurface(plane, 'plane');
  }
}
