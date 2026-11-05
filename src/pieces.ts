/**
 * The pieces on the slate. A piece you let go of stands itself up: an actor or
 * the creature's stand drops to the slate and straightens, the camera
 * straightens and keeps the height you gave it, because a high or a low angle
 * is a choice. Each piece knocks softly when it is lifted and when it lands.
 * Where every piece stands is kept between visits.
 */
import { AudioSource, AudioUtils, createSystem, Entity, Grabbed, Quaternion, Vector3 } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Cue, SetPiece, SetRole, SoundCue } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

/** A piece carried further than this from the slate's centre goes back to where it started. */
const MAX_FROM_CENTRE = 0.8;
/** A camera let go this close to the slate stands on it; higher, it stays up, as on a crane. */
const CAMERA_FLOOR_SNAP = 0.03;
const CAMERA_MAX_HEIGHT = 0.45;
const UP = new Vector3(0, 1, 0);

/** Position then quaternion, in the stage's own space. */
type Pose = number[];
type SavedPieces = Record<string, Pose>;
type Globals = { newBoardRequested: Signal<number> };

const isPose = (value: unknown): value is Pose =>
  Array.isArray(value) && value.length === 7 && value.every((n) => typeof n === 'number' && Number.isFinite(n));

export class PiecesSystem extends createSystem({
  pieces: { required: [SetPiece] },
  held: { required: [SetPiece, Grabbed] },
  cues: { required: [SoundCue, AudioSource] },
}) {
  private authored = new Map<string, Pose>();
  private released: Entity[] = [];
  private ready = false;
  private boardSeen = 0;
  private forward = new Vector3();
  private upright = new Quaternion();

  init(): void {
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (piece) => {
        if (this.isStage(piece)) return;
        this.knock(Cue.Pick, piece);
      }),
      // The grab writes the piece's pose once more as it lets go, so settle on the next update.
      this.queries.held.subscribe('disqualify', (piece) => {
        if (this.isStage(piece)) return;
        this.released.push(piece);
      }),
      g.newBoardRequested.subscribe((n) => {
        if (n > this.boardSeen) {
          this.boardSeen = n;
          this.backToStart();
        }
      }),
    );
  }

  update(): void {
    if (!this.ready) {
      this.ready = this.captureAndRestore();
      return;
    }
    if (this.released.length === 0) return;
    for (const piece of this.released) {
      if (piece.object3D == null) continue;
      this.settle(piece);
      this.knock(Cue.Place, piece);
    }
    this.released.length = 0;
    this.save();
  }

  private isStage(piece: Entity): boolean {
    return piece.getValue(SetPiece, 'role') === SetRole.Stage;
  }

  private key(piece: Entity): string {
    return `${piece.getValue(SetPiece, 'role')}:${piece.getValue(SetPiece, 'label')}`;
  }

  /**
   * Runs until every piece has its object: remember where the scene put each
   * one, then move it to where the last visit left it.
   */
  private captureAndRestore(): boolean {
    let count = 0;
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece)) continue;
      if (piece.object3D == null) return false;
      count++;
    }
    if (count === 0) return false;
    const saved = loadJson<SavedPieces>(StoreKey.Pieces);
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece)) continue;
      const object = piece.object3D!;
      const key = this.key(piece);
      this.authored.set(key, [...object.position.toArray(), ...(object.quaternion.toArray() as number[])]);
      const pose = saved?.[key];
      if (isPose(pose)) this.apply(piece, pose);
    }
    return true;
  }

  private apply(piece: Entity, pose: Pose): void {
    const object = piece.object3D!;
    object.position.fromArray(pose, 0);
    object.quaternion.fromArray(pose, 3);
  }

  /** Stand the piece up where it was let go, facing the way it was turned. */
  private settle(piece: Entity): void {
    const object = piece.object3D!;
    const authored = this.authored.get(this.key(piece));
    if (authored && Math.hypot(object.position.x, object.position.z) > MAX_FROM_CENTRE) {
      this.apply(piece, authored);
      return;
    }
    this.forward.set(0, 0, 1).applyQuaternion(object.quaternion);
    object.quaternion.copy(this.upright.setFromAxisAngle(UP, Math.atan2(this.forward.x, this.forward.z)));
    if (piece.getValue(SetPiece, 'role') === SetRole.Camera) {
      const y = object.position.y;
      object.position.y = y < CAMERA_FLOOR_SNAP ? 0 : Math.min(y, CAMERA_MAX_HEIGHT);
    } else {
      object.position.y = 0;
    }
  }

  /** The knock comes from the piece: the cue's source sits beside it under the stage. */
  private knock(cue: string, piece: Entity): void {
    const at = piece.object3D;
    for (const source of this.queries.cues.entities) {
      if (source.getValue(SoundCue, 'cue') !== cue) continue;
      if (at != null && source.object3D != null) source.object3D.position.copy(at.position);
      AudioUtils.play(source);
      return;
    }
  }

  private save(): void {
    const poses: SavedPieces = {};
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      if (object == null || this.isStage(piece)) continue;
      poses[this.key(piece)] = [...object.position.toArray(), ...(object.quaternion.toArray() as number[])];
    }
    saveJson(StoreKey.Pieces, poses);
  }

  /** A new board starts from the scene's own blocking. */
  private backToStart(): void {
    clearKey(StoreKey.Pieces);
    for (const piece of this.queries.pieces.entities) {
      if (this.isStage(piece) || piece.object3D == null) continue;
      const authored = this.authored.get(this.key(piece));
      if (authored) this.apply(piece, authored);
    }
  }
}
