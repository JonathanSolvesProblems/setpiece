/**
 * Stage placement. In a session the set lands on a real table one of three
 * ways, whichever the room allows:
 *
 *  1. the headset reports a table or desk, and the set drops onto the nearest;
 *  2. the user touches their table with a fingertip and pinches, which needs
 *     hand tracking and nothing else, so it works in a room that was never
 *     scanned and when room data was not allowed;
 *  3. the user holds the slate by its striped front edge and carries the set
 *     there, turning it with the wrist.
 *
 * Until one of those happens the set floats in front of the user. Wherever it
 * ends up it is parked on a room anchor and its pose is saved, so the set is
 * back where it was left on the next launch.
 *
 * Only the striped edge moves the set. The slate's top, the monitor and the
 * storyboard card do not: a pinch that misses an actor must not carry the
 * whole set away with it.
 */
import {
  AudioSource,
  AudioUtils,
  BoxGeometry,
  CanvasTexture,
  createSystem,
  DoubleSide,
  Entity,
  Grabbed,
  GrabSystem,
  Hovered,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Pressed,
  SRGBColorSpace,
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
import { HandTurn } from './hand-turn.js';
import { STAGE_DEPTH, STAGE_WIDTH } from './scene-assets/rig.scene-asset.js';
import { Placement, SetPiece, StageAnchor } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';

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
const FLOAT_AHEAD = 0.48;
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
/** A controller resting on a table has its pointing end about this far above it. */
const CONTROLLER_PAD = 0.035;
/**
 * The pinch that answered the headset's own prompt is often still closed when
 * the session appears. For this long after it does, a grab is not a choice.
 */
const INPUT_GUARD_SECONDS = 0.8;
/** The set turns a little less eagerly than a piece: it is the whole table. */
const STAGE_TURN_GAIN = 1.5;
/** A hold that carried the set less than this and turned it less than this was not a move. */
const MOVED_DISTANCE = 0.015;
const MOVED_TURN = 0.05;
/** The parts of the slate that a hand can hold. Everything else on it lets a ray through. */
const HANDLE_NAMES = new Set(['ClapperStripe', 'StageHandle']);
/**
 * A set that is not on a table belongs with its user. When they have walked
 * away from it, sat down or stood up under it, or turned their back on it, and
 * stayed that way this long, it comes back to in front of them.
 */
const AWAY_SECONDS = 2.5;
/** Walked away: this far from the slate along the floor. A set moved by hand is given more room. */
const AWAY_DISTANCE = 1.1;
const AWAY_DISTANCE_MANUAL = 1.6;
/** Sat down or stood up: the slate should sit between this far and this far below the eyes. */
const AWAY_TOO_HIGH = 0.05;
const AWAY_TOO_LOW = 0.95;
/** Turned away: the slate is further than this from straight ahead, as a cosine (about 80 degrees). */
const AWAY_BEHIND = 0.17;
/** The set glides to its new place over this long, so the eye can follow it. */
const GLIDE_SECONDS = 0.45;
const OPTIC_YELLOW = 0xd6e13c;
const NO_RAYCAST = (): void => {};
const silence = (object: Object3D): void => {
  object.raycast = NO_RAYCAST;
};
/** The set settles onto the table over this long. */
const SETTLE_SECONDS = 0.22;
const SETTLE_FROM = 0.94;
const UP = new Vector3(0, 1, 0);

type Candidate = { x: number; top: number; z: number };

export const StageStatus = {
  Floating: 'Floating. Not on your table yet.',
  Table: 'On your table.',
  Touch: 'On your table, where you touched it.',
  Manual: 'Moved by hand. Position saved.',
  Restored: 'Back where you left it.',
} as const;

type SavedPose = { anchored: boolean; position: number[]; quaternion: number[] };
type Globals = {
  stageStatus: Signal<string>;
  resetStageRequested: Signal<number>;
  roomScanRequested: Signal<number>;
  roomScanOffered: Signal<boolean>;
  takeState?: Signal<string>;
};
/** The Quest Browser's own way to start the headset's room scan from inside a session, once per session. */
type RoomCapture = XRSession & { initiateRoomCapture?: () => Promise<void> };
/** Seconds to give the headset to report the room it already knows before offering to scan it. */
const SCAN_OFFER_AFTER = 3;
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
  pieces: { required: [SetPiece] },
}) {
  private grab: GrabSystem | undefined;
  private turn = new HandTurn();
  private handleGlow: Mesh | null = null;
  private labelTexture: CanvasTexture | null = null;
  /** How many children the slate had when the ones that are not handles were silenced. */
  private childCount = -1;
  /** True from the first frame of a session to its end, so a prompt coming and going is not an entry. */
  private entered = false;
  private guard = 0;
  private ignoredHold = false;
  private holding = false;
  private holdEnded = false;
  private holdStart = new Vector3();
  /** Counts landings, so a hold can tell that the set was landed while it was held. */
  private landings = 0;
  private landingsAtHold = 0;
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
  /** Seconds the wearer has been away from a set that follows them. */
  private away = 0;
  private scanSeen = 0;
  /** The headset allows one room scan per session. */
  private scanUsed = false;
  private glide = 0;
  private glideFromPosition = new Vector3();
  private glideToPosition = new Vector3();
  private glideFromQuaternion = new Quaternion();
  private glideToQuaternion = new Quaternion();
  private toStage = new Vector3();
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
    this.grab = this.world.getSystem(GrabSystem);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        this.sessionElapsed = 0;
        if (state === VisibilityState.Visible) this.guard = INPUT_GUARD_SECONDS;
        this.onVisibility(state);
      }),
      this.queries.heldStages.subscribe('qualify', (stage) => {
        if (this.guard > 0) {
          this.ignoredHold = true;
          this.grab?.forceRelease(stage);
          return;
        }
        this.holding = true;
        this.turn.total = 0;
        this.landingsAtHold = this.landings;
        stage.object3D?.getWorldPosition(this.holdStart);
      }),
      // Whether the hold moved the set is decided in update, after a touch landing has had its say.
      this.queries.heldStages.subscribe('disqualify', () => {
        if (this.ignoredHold) {
          this.ignoredHold = false;
          return;
        }
        if (!this.holding) return;
        this.holding = false;
        this.holdEnded = true;
      }),
      () => this.labelTexture?.dispose(),
      this.queries.meshes.subscribe('qualify', (mesh) => this.onSurface(mesh, 'mesh')),
      this.queries.planes.subscribe('qualify', (plane) => this.onSurface(plane, 'plane')),
      g.resetStageRequested.subscribe((n) => {
        if (n > this.resetSeen) {
          this.resetSeen = n;
          this.reset();
        }
      }),
      g.roomScanRequested.subscribe((n) => {
        if (n <= this.scanSeen) return;
        this.scanSeen = n;
        const session = this.world.session as RoomCapture | undefined;
        if (this.scanUsed || typeof session?.initiateRoomCapture !== 'function') return;
        this.scanUsed = true;
        // The headset takes over, walks the wearer round the room, and reports
        // what it found as planes and meshes; a table among them lands the set.
        void session.initiateRoomCapture().catch(() => {});
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
    if (this.guard > 0) this.guard -= delta;
    this.quietChildren(stage);
    const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (this.floatPending && inSession && !this.holding && this.sessionElapsed >= FLOAT_DELAY) {
      this.player.head.getWorldPosition(this.head);
      if (this.head.lengthSq() > 1e-4 || this.sessionElapsed >= FLOAT_GIVE_UP) {
        this.floatPending = false;
        if (stage.getValue(StageAnchor, 'placement') === Placement.Floating) this.floatInFront(stage);
      }
    }
    // The set is out of sight only until it has somewhere to be.
    if (!this.floatPending && !object.visible) object.visible = true;
    if (this.holding) {
      if (!this.turn.active) {
        const side = this.grab?.getHolderHand(stage);
        if (side != null) this.turn.begin(this.player.gripSpaces[side]);
      }
      this.turn.apply(object, delta, STAGE_TURN_GAIN);
    }
    if (this.handleGlow) this.handleGlow.visible = this.holding || this.edgeHovered(stage);
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
    if (this.holdEnded) {
      this.holdEnded = false;
      this.finishHold(stage);
    }
    if (this.settle > 0) {
      this.settle = Math.max(0, this.settle - delta);
      const t = 1 - this.settle / SETTLE_SECONDS;
      object.scale.setScalar(SETTLE_FROM + (1 - SETTLE_FROM) * (1 - (1 - t) * (1 - t)));
    }
    if (inSession) this.followWearer(stage, delta);
    this.offerScan(stage, inSession);
    if (this.glide > 0) {
      this.glide = Math.max(0, this.glide - delta);
      const t = 1 - this.glide / GLIDE_SECONDS;
      const eased = 1 - (1 - t) * (1 - t);
      this.corner.lerpVectors(this.glideFromPosition, this.glideToPosition, eased);
      setWorldPosition(object, this.corner);
      setWorldQuaternion(object, this.yawQuaternion.slerpQuaternions(this.glideFromQuaternion, this.glideToQuaternion, eased));
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

  /** A hold on the striped edge has ended: if it carried or turned the set, that is where the set now lives. */
  private finishHold(stage: Entity): void {
    this.turn.end();
    const object = stage.object3D;
    // Landed by touch while it was held: the landing stands.
    if (object == null || this.landings !== this.landingsAtHold) return;
    object.getWorldPosition(this.corner);
    if (this.corner.distanceTo(this.holdStart) < MOVED_DISTANCE && Math.abs(this.turn.total) < MOVED_TURN) return;
    stage.setValue(StageAnchor, 'placement', Placement.Manual);
    this.floatPending = false;
    this.status(StageStatus.Manual);
    this.save(stage);
  }

  /**
   * Everything standing on the slate that is not a piece or the striped edge
   * lets a ray through: the slate's top, the monitor, the card, the backdrop.
   * Other systems add those after this one starts, so it runs again whenever
   * the slate gains a child.
   */
  private quietChildren(stage: Entity): void {
    const object = stage.object3D!;
    if (object.children.length === this.childCount) return;
    this.childCount = object.children.length;
    for (const child of object.children) {
      if (HANDLE_NAMES.has(child.name) || this.isPiece(child)) continue;
      child.traverse(silence);
    }
  }

  private isPiece(object: Object3D): boolean {
    for (const piece of this.queries.pieces.entities) {
      if (piece.object3D === object) return true;
    }
    return false;
  }

  /**
   * A hand is on the striped edge itself. Hovering a piece hovers the slate it
   * stands on as well, so the slate counts only when no piece does.
   */
  private edgeHovered(stage: Entity): boolean {
    if (!stage.hasComponent(Hovered)) return false;
    for (const piece of this.queries.pieces.entities) {
      if (piece !== stage && piece.hasComponent(Hovered)) return false;
    }
    return true;
  }

  /** True when a pinch has hold of something other than the slate itself. */
  private claimedElsewhere(stage: Entity): boolean {
    for (const entity of this.queries.grabbed.entities) if (entity !== stage) return true;
    for (const entity of this.queries.pressed.entities) if (entity !== stage) return true;
    return false;
  }

  /**
   * The slate's handle: an unseen bar around the striped front edge, deep
   * enough to catch a ray or a hand closed on the edge, a line of optic yellow
   * that lights when a hand is on it, and the words that say what it is for.
   */
  private makeHandle(object: Object3D): void {
    const handle = new Mesh(
      new BoxGeometry(STAGE_WIDTH + 0.02, 0.04, 0.06),
      new MeshBasicMaterial({ visible: false, side: DoubleSide }),
    );
    handle.name = 'StageHandle';
    handle.position.set(0, -0.016, STAGE_DEPTH / 2 + 0.015);
    const glow = new Mesh(
      new BoxGeometry(STAGE_WIDTH + 0.004, 0.003, 0.003),
      new MeshBasicMaterial({ color: OPTIC_YELLOW, toneMapped: false }),
    );
    glow.name = 'HandleGlow';
    glow.position.set(0, 0.0015, STAGE_DEPTH / 2);
    glow.visible = false;
    glow.raycast = NO_RAYCAST;
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 64;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.labelTexture = texture;
    const draw = (): void => {
      const g = canvas.getContext('2d');
      if (g == null) return;
      g.clearRect(0, 0, canvas.width, canvas.height);
      g.font = '700 44px "Big Shoulders Stencil", "Arial Narrow", sans-serif';
      g.fillStyle = '#c7c7b7';
      g.textBaseline = 'middle';
      g.fillText('HOLD THE STRIPED EDGE TO MOVE OR TURN THE SET', 8, 34);
      texture.needsUpdate = true;
    };
    draw();
    void document.fonts.load('700 44px "Big Shoulders Stencil"').then(draw);
    const label = new Mesh(
      new PlaneGeometry(0.3, 0.01875),
      new MeshBasicMaterial({ map: texture, transparent: true, toneMapped: false, depthWrite: false }),
    );
    label.name = 'HandleLabel';
    label.rotation.x = -Math.PI / 2;
    label.position.set(0.06, 0.0012, STAGE_DEPTH / 2 - 0.016);
    label.raycast = NO_RAYCAST;
    object.add(handle, glow, label);
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    viewfinder?.hideFromLens(glow);
    viewfinder?.hideFromLens(label);
    this.handleGlow = glow;
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
    // With a controller there is no fingertip: its pointing end is what rests on the table.
    const byHand = this.input.xr.isPrimary('hand', side);
    if (pinch.begun) {
      pinch.begun = false;
      (byHand ? this.player.indexTipSpaces[side] : this.player.raySpaces[side]).getWorldPosition(pinch.start);
      handSpace.getWorldPosition(pinch.hand);
    }
    pinch.seconds += delta;
    // Holding the slate's own edge is not a claim: a touch under a floating set often catches it.
    if (this.claimedElsewhere(stage)) pinch.claimed = true;
    if (!pinch.ended) return;
    pinch.active = false;
    pinch.ended = false;
    if (pinch.claimed || pinch.seconds > TOUCH_MAX_SECONDS) return;
    if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
    handSpace.getWorldPosition(this.tip);
    if (this.tip.distanceTo(pinch.hand) > TOUCH_MAX_DRIFT) return;
    this.placeAtFingertip(stage, pinch.start, byHand ? FINGER_PAD : CONTROLLER_PAD);
  }

  private placeAtFingertip(stage: Entity, tip: Vector3, pad: number): void {
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
    this.placeAt(stage, tip.x + ux * out, tip.y - pad, tip.z + uz * out, Placement.Touch, StageStatus.Touch);
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
    this.makeHandle(object);
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
      this.entered = false;
      stage.object3D.visible = true;
      this.applyAuthored(stage);
      stage.setValue(StageAnchor, 'placement', Placement.Floating);
      this.tableDone = false;
      this.attachedSeen = false;
      this.floatPending = false;
      this.candidates = [];
      this.candidateTimer = -1;
      this.status(StageStatus.Floating);
    } else if (!this.entered) {
      // A headset prompt blurs the session and gives it back; only the first frame is an entry.
      this.entered = true;
      if (stage.getValue(StageAnchor, 'placement') !== Placement.Floating) return;
      const pose = this.load();
      if (pose != null && !pose.anchored && this.tryRestore(stage, false)) return;
      this.floatPending = true;
      // Where the page drew the set is not where the wearer is: keep it out of
      // sight for the moment it takes to know where their head is.
      stage.object3D.visible = false;
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
    this.landings++;
    this.settle = SETTLE_SECONDS;
    if (stage.hasComponent(AudioSource)) AudioUtils.play(stage);
    this.status(status);
    this.save(stage);
  }

  /**
   * Nothing to land on yet: hold the set in front of the user, where they are
   * looking. With `glide` it travels there instead of appearing there.
   */
  private floatInFront(stage: Entity, glide = false): void {
    const object = stage.object3D!;
    this.player.head.getWorldPosition(this.head);
    const forward = this.headForward();
    this.corner.set(
      this.head.x + forward.x * FLOAT_AHEAD,
      this.head.y - FLOAT_BELOW,
      this.head.z + forward.z * FLOAT_AHEAD,
    );
    this.yawQuaternion.setFromAxisAngle(UP, Math.atan2(-forward.x, -forward.z));
    this.away = 0;
    if (glide && object.visible) {
      object.getWorldPosition(this.glideFromPosition);
      object.getWorldQuaternion(this.glideFromQuaternion);
      this.glideToPosition.copy(this.corner);
      this.glideToQuaternion.copy(this.yawQuaternion);
      this.glide = GLIDE_SECONDS;
      return;
    }
    this.glide = 0;
    setWorldPosition(object, this.corner);
    setWorldQuaternion(object, this.yawQuaternion);
  }

  /**
   * Offer the room scan while the set floats, the headset has had time to
   * report the room it already knows, no table was among it, and this browser
   * can start a scan.
   */
  private offerScan(stage: Entity, inSession: boolean): void {
    const session = this.world.session as RoomCapture | undefined;
    const offered =
      inSession &&
      !this.scanUsed &&
      !this.tableDone &&
      this.candidates.length === 0 &&
      this.sessionElapsed > SCAN_OFFER_AFTER &&
      stage.getValue(StageAnchor, 'placement') === Placement.Floating &&
      typeof session?.initiateRoomCapture === 'function';
    const signal = (this.globals as Globals).roomScanOffered;
    if (signal.peek() !== offered) signal.value = offered;
  }

  /**
   * A floating set, or one carried somewhere by hand, comes back to its user
   * when they have left it. A set landed on a table stays on the table: that
   * is what landing it means.
   */
  private followWearer(stage: Entity, delta: number): void {
    const placement = stage.getValue(StageAnchor, 'placement');
    const follows = placement === Placement.Floating || placement === Placement.Manual;
    const busy =
      this.floatPending ||
      this.holding ||
      this.glide > 0 ||
      this.queries.grabbed.entities.size > 0 ||
      this.world.visibilityState.peek() !== VisibilityState.Visible ||
      ((this.globals as Globals).takeState?.peek() ?? 'idle') !== 'idle';
    if (!follows || busy) {
      this.away = 0;
      return;
    }
    this.player.head.getWorldPosition(this.head);
    if (this.head.lengthSq() < 1e-4) return;
    const at = this.lastWorldPosition;
    this.toStage.set(at.x - this.head.x, 0, at.z - this.head.z);
    const distance = this.toStage.length();
    const below = this.head.y - at.y;
    let gone = distance > (placement === Placement.Manual ? AWAY_DISTANCE_MANUAL : AWAY_DISTANCE);
    if (placement === Placement.Floating) {
      // Only a set that was never put anywhere minds the wearer's height and heading.
      if (below < AWAY_TOO_HIGH || below > AWAY_TOO_LOW) gone = true;
      if (distance > 0.05 && this.toStage.dot(this.headForward()) / distance < AWAY_BEHIND) gone = true;
    }
    if (!gone) {
      this.away = 0;
      return;
    }
    this.away += delta;
    if (this.away < AWAY_SECONDS) return;
    if (placement === Placement.Manual) {
      // It is no longer where the hand left it.
      clearKey(StoreKey.Stage);
      stage.setValue(StageAnchor, 'placement', Placement.Floating);
      this.tableDone = false;
      this.status(StageStatus.Floating);
    }
    this.floatInFront(stage, true);
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
