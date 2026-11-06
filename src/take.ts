/**
 * A take: the blocking performed by hand and played back as a moving shot.
 *
 * Record, then move an actor or the camera, and where every moved piece stood
 * thirty times a second is kept. Stop, and the move plays back in a loop: the
 * pieces walk their marks on the slate and the monitor shows the shot move.
 *
 * Takes are layered the way a move is rehearsed. Record again and what is
 * already in the take plays while the new piece is carried, so the actor's
 * walk can be laid down first and the camera's pan added over it. A pass adds
 * the pieces that were held during it and leaves the rest as they were. The
 * first pass sets the length; later passes run to that length.
 *
 * Nothing here is drawn or generated: a take is the poses the wearer's own
 * hands gave the pieces, and it can only replay those.
 */
import { AudioSource, AudioUtils, createSystem, Entity, Quaternion } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { CAMERAS } from './camera-formats.js';
import { CAMERA_TILT_LIMIT, Cue, Held, SetPiece, SetRole, ShotCamera, SoundCue } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

export const TakeState = { Idle: 'idle', Recording: 'recording', Playing: 'playing' } as const;
export const TAKE_MAX_SECONDS = 12;
/** Poses kept per second. Playback is smoothed between them. */
const RATE = 30;
const MAX_SAMPLES = TAKE_MAX_SECONDS * RATE;
/** Position, quaternion, then the camera head's tilt (zero for every other piece), in the stage's own space. */
const STRIDE = 8;
/** A first pass shorter than this was a slip of the finger, not a take. */
const MIN_SAMPLES = RATE / 2;

type Track = {
  key: string;
  piece: Entity;
  data: Float32Array;
  /** The track holds a move. */
  recorded: boolean;
  /** The piece has been held during the pass being recorded now. */
  touched: boolean;
  /** Where the piece stood when the pass began. */
  start: Float32Array;
};
type SavedTake = { rate: number; length: number; tracks: Record<string, number[]>; rig?: string; cuts?: number[] };
type Globals = {
  cameraOn: Signal<string>;
  takeState: Signal<string>;
  takeSeconds: Signal<number>;
  takeLength: Signal<number>;
  cameraRig: Signal<string>;
  recordRequested: Signal<number>;
  playRequested: Signal<number>;
  newBoardRequested: Signal<number>;
};

export class TakeSystem extends createSystem({
  pieces: { required: [SetPiece] },
  held: { required: [SetPiece, Held] },
  cues: { required: [SoundCue, AudioSource] },
  cams: { required: [ShotCamera, AudioSource] },
}) {
  private tracks: Track[] = [];
  /** Cuts between cameras, as pairs: the sample a cut lands on, then which camera. */
  private cuts: number[] = [];
  private passCuts: number[] = [];
  private cameraBefore = '';
  private aimed = new Map<Entity, boolean>();
  private trackedCount = -1;
  private state: string = TakeState.Idle;
  /** Samples in the take; zero when there is none. */
  private length = 0;
  private time = 0;
  /** Index of the last sample written in the pass being recorded. */
  private written = -1;
  private restored = false;
  private recordSeen = 0;
  private playSeen = 0;
  private boardSeen = 0;
  /** Pieces in a hand right now, the slate itself not counted. */
  private heldPieces = 0;
  private a = new Quaternion();
  private b = new Quaternion();
  /** The rig the camera's move was recorded on. */
  private rig = '';
  /** Whether the camera was aiming itself before the take took it over. */
  private aimedBefore: boolean | null = null;

  init(): void {
    const g = this.globals as Globals;
    const isPiece = (piece: Entity): boolean => piece.getValue(SetPiece, 'role') !== SetRole.Stage;
    this.cleanupFuncs.push(
      this.queries.held.subscribe('qualify', (piece) => {
        if (isPiece(piece)) this.heldPieces++;
      }),
      this.queries.held.subscribe('disqualify', (piece) => {
        if (isPiece(piece)) this.heldPieces = Math.max(0, this.heldPieces - 1);
      }),
      g.recordRequested.subscribe((n) => {
        if (n <= this.recordSeen) return;
        this.recordSeen = n;
        if (this.state === TakeState.Recording) this.stopRecording();
        else this.startRecording();
      }),
      g.playRequested.subscribe((n) => {
        if (n <= this.playSeen) return;
        this.playSeen = n;
        if (this.state === TakeState.Playing) this.stopPlaying();
        else if (this.state === TakeState.Idle) this.startPlaying();
      }),
      g.newBoardRequested.subscribe((n) => {
        if (n <= this.boardSeen) return;
        this.boardSeen = n;
        this.clear();
      }),
      g.cameraOn.subscribe((label) => {
        if (this.state !== TakeState.Recording) return;
        this.passCuts.push(Math.max(0, this.written), Math.max(0, CAMERAS.indexOf(label as (typeof CAMERAS)[number])));
      }),
    );
  }

  update(delta: number): void {
    if (!this.ensureTracks()) return;
    if (this.state === TakeState.Recording) this.recordPass(delta);
    else if (this.state === TakeState.Playing) this.playBack(delta);
  }

  /** One track per piece that can be carried. Returns false until the pieces exist. */
  private ensureTracks(): boolean {
    const count = this.queries.pieces.entities.size;
    if (count !== this.trackedCount) {
      for (const piece of this.queries.pieces.entities) {
        if (piece.getValue(SetPiece, 'role') === SetRole.Stage) continue;
        if (piece.object3D == null) return false;
        const key = `${piece.getValue(SetPiece, 'role')}:${piece.getValue(SetPiece, 'label')}`;
        if (this.tracks.some((track) => track.key === key)) continue;
        this.tracks.push({
          key,
          piece,
          data: new Float32Array(MAX_SAMPLES * STRIDE),
          recorded: false,
          touched: false,
          start: new Float32Array(STRIDE),
        });
      }
      this.trackedCount = count;
    }
    if (this.tracks.length === 0) return false;
    if (!this.restored) {
      this.restored = true;
      this.restore();
    }
    return true;
  }

  private setState(state: string): void {
    this.state = state;
    (this.globals as Globals).takeState.value = state;
  }

  private setSeconds(): void {
    const g = this.globals as Globals;
    const seconds = Math.floor(this.time);
    if (g.takeSeconds.peek() !== seconds) g.takeSeconds.value = seconds;
  }

  private readPose(track: Track, into: Float32Array, at: number): void {
    const object = track.piece.object3D!;
    const p = object.position;
    const q = object.quaternion;
    into[at] = p.x;
    into[at + 1] = p.y;
    into[at + 2] = p.z;
    into[at + 3] = q.x;
    into[at + 4] = q.y;
    into[at + 5] = q.z;
    into[at + 6] = q.w;
    into[at + 7] = track.piece.hasComponent(ShotCamera) ? (track.piece.getValue(ShotCamera, 'tilt') ?? 0) : 0;
  }

  /** Put a piece where its track has it at this time, smoothed between two samples. */
  private applyAt(track: Track, seconds: number): void {
    const object = track.piece.object3D;
    if (object == null || this.length === 0) return;
    const at = Math.min(Math.max(seconds * RATE, 0), this.length - 1);
    const i0 = Math.floor(at);
    const i1 = Math.min(i0 + 1, this.length - 1);
    const f = at - i0;
    const d = track.data;
    const o0 = i0 * STRIDE;
    const o1 = i1 * STRIDE;
    object.position.set(
      d[o0] + (d[o1] - d[o0]) * f,
      d[o0 + 1] + (d[o1 + 1] - d[o0 + 1]) * f,
      d[o0 + 2] + (d[o1 + 2] - d[o0 + 2]) * f,
    );
    this.a.set(d[o0 + 3], d[o0 + 4], d[o0 + 5], d[o0 + 6]);
    this.b.set(d[o1 + 3], d[o1 + 4], d[o1 + 5], d[o1 + 6]);
    object.quaternion.slerpQuaternions(this.a, this.b, f);
    if (track.piece.hasComponent(ShotCamera)) {
      // A camera in a take holds the tilt it was given, pass by pass.
      const tilt = d[o0 + 7] + (d[o1 + 7] - d[o0 + 7]) * f;
      track.piece.setValue(ShotCamera, 'tilt', Math.max(-CAMERA_TILT_LIMIT, Math.min(CAMERA_TILT_LIMIT, tilt)));
      if (track.piece.getValue(ShotCamera, 'aimed') !== true) track.piece.setValue(ShotCamera, 'aimed', true);
    }
  }

  private borrowCamera(): void {
    if (this.aimedBefore != null) return;
    this.aimedBefore = true;
    this.cameraBefore = (this.globals as Globals).cameraOn.peek();
    for (const cam of this.queries.cams.entities) this.aimed.set(cam, cam.getValue(ShotCamera, 'aimed') === true);
  }

  private returnCamera(): void {
    if (this.aimedBefore == null) return;
    for (const cam of this.queries.cams.entities) cam.setValue(ShotCamera, 'aimed', this.aimed.get(cam) === true);
    this.aimedBefore = null;
    if (this.cameraBefore !== '') (this.globals as Globals).cameraOn.value = this.cameraBefore;
  }

  /** The camera that is live at this sample of the take, by the cuts recorded with it. */
  private cutTo(sample: number): void {
    if (this.cuts.length === 0) return;
    let index = this.cuts[1];
    for (let i = 0; i < this.cuts.length; i += 2) if (this.cuts[i] <= sample) index = this.cuts[i + 1];
    const label = CAMERAS[index] ?? CAMERAS[0];
    const g = this.globals as Globals;
    if (g.cameraOn.peek() !== label) g.cameraOn.value = label;
  }

  private startRecording(): void {
    if (this.tracks.length === 0) return;
    if (this.state === TakeState.Playing) this.stopPlaying();
    this.borrowCamera();
    this.backToOne();
    this.time = 0;
    this.written = -1;
    this.passCuts = [0, Math.max(0, CAMERAS.indexOf((this.globals as Globals).cameraOn.peek() as (typeof CAMERAS)[number]))];
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      track.touched = false;
      if (track.piece.object3D != null) this.readPose(track, track.start, 0);
    }
    this.setState(TakeState.Recording);
    this.setSeconds();
    // The slate claps at the head of a take.
    for (const cam of this.queries.cams.entities) AudioUtils.play(cam);
  }

  private recordPass(delta: number): void {
    this.time += delta;
    const limit = this.length > 0 ? this.length : MAX_SAMPLES;
    const index = Math.min(Math.floor(this.time * RATE), limit - 1);
    while (this.written < index) {
      this.written++;
      this.writeSample(this.written);
    }
    // What the take already holds plays while a new piece is laid over it.
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (track.recorded && !track.touched) this.applyAt(track, this.time);
    }
    this.setSeconds();
    if (this.time * RATE >= limit) this.stopRecording();
  }

  private writeSample(index: number): void {
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (track.piece.object3D == null) continue;
      if (!track.touched && track.piece.hasComponent(Held)) {
        track.touched = true;
        if (!track.recorded) {
          // Until it was picked up, the piece stood where the pass found it.
          for (let s = 0; s < index; s++) track.data.set(track.start, s * STRIDE);
          track.recorded = true;
        }
      }
      if (track.touched) {
        this.readPose(track, track.data, index * STRIDE);
        if (track.piece.hasComponent(ShotCamera)) this.rig = (this.globals as Globals).cameraRig.peek();
      }
    }
  }

  private stopRecording(): void {
    const written = this.written + 1;
    let any = false;
    for (let i = 0; i < this.tracks.length; i++) any = any || this.tracks[i].touched;
    // A pass in which the camera was cut is a pass worth keeping, and its cuts replace the old ones.
    const cut = this.passCuts.length > 2;
    any = any || cut;
    if (cut || this.cuts.length === 0) this.cuts = this.passCuts;
    if (this.length === 0) {
      if (!any || written < MIN_SAMPLES) {
        // Nothing was carried, or the pass was a slip: there is still no take.
        for (let i = 0; i < this.tracks.length; i++) {
          this.tracks[i].recorded = false;
          this.tracks[i].touched = false;
        }
        this.time = 0;
        this.cuts = [];
        this.setSeconds();
        this.setState(TakeState.Idle);
        this.returnCamera();
        return;
      }
      this.length = written;
    } else {
      // A pass stopped early: the pieces it carried hold their last pose to the end.
      for (let i = 0; i < this.tracks.length; i++) {
        const track = this.tracks[i];
        if (!track.touched || written < 1) continue;
        const last = (written - 1) * STRIDE;
        for (let s = written; s < this.length; s++) track.data.copyWithin(s * STRIDE, last, last + STRIDE);
      }
    }
    for (let i = 0; i < this.tracks.length; i++) this.tracks[i].touched = false;
    (this.globals as Globals).takeLength.value = this.length / RATE;
    this.knock(Cue.Place);
    if (any) this.save();
    this.startPlaying();
  }

  private startPlaying(): void {
    if (this.length === 0) return;
    this.borrowCamera();
    // A camera move recorded on the drone plays on the drone.
    const g = this.globals as Globals;
    if (this.rig !== '' && g.cameraRig.peek() !== this.rig) g.cameraRig.value = this.rig;
    this.time = 0;
    this.setSeconds();
    this.setState(TakeState.Playing);
  }

  private playBack(delta: number): void {
    // A hand on a piece is a wish to change the blocking: playback gives way.
    if (this.heldPieces > 0) {
      this.stopPlaying();
      return;
    }
    this.time += delta;
    const seconds = this.length / RATE;
    if (this.time >= seconds) this.time -= seconds;
    for (let i = 0; i < this.tracks.length; i++) {
      if (this.tracks[i].recorded) this.applyAt(this.tracks[i], this.time);
    }
    this.cutTo(Math.floor(this.time * RATE));
    this.setSeconds();
  }

  private stopPlaying(): void {
    this.backToOne();
    this.returnCamera();
    this.time = 0;
    this.setSeconds();
    this.setState(TakeState.Idle);
  }

  /** "Back to one": every piece in the take returns to where the take begins. */
  private backToOne(): void {
    if (this.length === 0) return;
    for (let i = 0; i < this.tracks.length; i++) {
      const track = this.tracks[i];
      if (track.recorded && !track.piece.hasComponent(Held)) this.applyAt(track, 0);
    }
  }

  private knock(cue: string): void {
    for (const source of this.queries.cues.entities) {
      if (source.getValue(SoundCue, 'cue') !== cue) continue;
      AudioUtils.play(source);
      return;
    }
  }

  private clear(): void {
    this.length = 0;
    this.rig = '';
    this.cuts = [];
    this.returnCamera();
    this.time = 0;
    for (let i = 0; i < this.tracks.length; i++) {
      this.tracks[i].recorded = false;
      this.tracks[i].touched = false;
    }
    clearKey(StoreKey.Take);
    const g = this.globals as Globals;
    g.takeLength.value = 0;
    this.setSeconds();
    this.setState(TakeState.Idle);
  }

  private save(): void {
    const tracks: Record<string, number[]> = {};
    const count = this.length * STRIDE;
    for (const track of this.tracks) {
      if (!track.recorded) continue;
      const values = new Array<number>(count);
      for (let i = 0; i < count; i++) values[i] = Math.round(track.data[i] * 1e4) / 1e4;
      tracks[track.key] = values;
    }
    saveJson(StoreKey.Take, { rate: RATE, length: this.length, tracks, rig: this.rig, cuts: this.cuts } satisfies SavedTake);
  }

  private restore(): void {
    const saved = loadJson<SavedTake>(StoreKey.Take);
    if (saved == null || saved.rate !== RATE) return;
    this.cuts = Array.isArray(saved.cuts) && saved.cuts.length % 2 === 0 ? saved.cuts : [];
    const length = saved.length;
    if (!Number.isInteger(length) || length < MIN_SAMPLES || length > MAX_SAMPLES) return;
    let any = false;
    for (const track of this.tracks) {
      const values = saved.tracks?.[track.key];
      if (!Array.isArray(values) || values.length !== length * STRIDE) continue;
      if (!values.every((n) => typeof n === 'number' && Number.isFinite(n))) continue;
      track.data.set(values);
      track.recorded = true;
      any = true;
    }
    if (!any) return;
    this.length = length;
    this.rig = saved.rig ?? '';
    (this.globals as Globals).takeLength.value = length / RATE;
  }
}
