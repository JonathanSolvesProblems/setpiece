/**
 * The marks on the floor. On a set every performer has a mark in their own
 * colour of spike tape, so nobody walks to the wrong one; here each actor's T
 * lies on the slate where they stand, in their colour, and stays behind while
 * a hand carries them, so you can see where they came from. The camera's frame
 * lines are laid on the floor the same way: two lines out from the lens that
 * open and close with the lens and the format, so what is in the shot can be
 * read from above. None of it is in the picture the lens takes.
 */
import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  DoubleSide,
  Entity,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Shape,
  ShapeGeometry,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SENSORS } from './camera-formats.js';
import { assetByLabel } from './catalog.js';
import { Held, SetPiece, SetRole, ShotCamera, StageAnchor } from './set-components.js';
import { ViewfinderSystem } from './viewfinder.js';

/** Just proud of the slate, so tape never fights the surface it lies on. */
const TAPE_LIFT = 0.0032;
const TAPE_WIDTH = 0.009;
const T_BAR = 0.056;
const T_STEM = 0.034;
const FOLLOW = 14;
/** A mark whose actor is in the air waits at this strength. */
const WAITING = 0.45;
const FRAME_LINE_LENGTH = 0.62;
const FRAME_LINE_WIDTH = 0.0035;
const FRAME_ASPECT = 16 / 9;
const CHALK = 0xf6f7ef;

type Mark = { piece: Entity; mesh: Mesh; material: MeshBasicMaterial; settled: boolean };
type Globals = { lensMm: Signal<number>; sensorIndex: Signal<number>; cameraOn: Signal<string> };

/** A T of tape, flat on the floor: the bar is where the toes go. */
function tee(): ShapeGeometry {
  const half = T_BAR / 2;
  const w = TAPE_WIDTH / 2;
  const s = new Shape();
  s.moveTo(-half, w);
  s.lineTo(half, w);
  s.lineTo(half, -w);
  s.lineTo(w, -w);
  s.lineTo(w, -w - T_STEM);
  s.lineTo(-w, -w - T_STEM);
  s.lineTo(-w, -w);
  s.lineTo(-half, -w);
  s.closePath();
  const geometry = new ShapeGeometry(s);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export class MarksSystem extends createSystem({
  pieces: { required: [SetPiece] },
  stages: { required: [SetPiece, StageAnchor] },
  cams: { required: [ShotCamera] },
}) {
  private ready = false;
  private marks: Mark[] = [];
  private frameLines: Mesh | null = null;
  private frameCorners = new Float32Array(8 * 3);
  private liveRig: Object3D | null = null;

  init(): void {
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      g.lensMm.subscribe(() => this.openFrameLines()),
      g.sensorIndex.subscribe(() => this.openFrameLines()),
      g.cameraOn.subscribe(() => this.followLive()),
    );
  }

  private prepare(): boolean {
    const stage = this.queries.stages.entities.values().next().value as Entity | undefined;
    const floor = stage?.object3D;
    if (floor == null) return false;
    for (const piece of this.queries.pieces.entities) if (piece.object3D == null) return false;
    const lens = this.world.getSystem(ViewfinderSystem);
    const geometry = tee();
    for (const piece of this.queries.pieces.entities) {
      const role = piece.getValue(SetPiece, 'role');
      if (role !== SetRole.Actor && role !== SetRole.Creature) continue;
      const tape = assetByLabel(String(piece.getValue(SetPiece, 'label')))?.tape;
      if (tape == null) continue;
      const material = new MeshBasicMaterial({ color: tape, toneMapped: false, transparent: true });
      const mesh = new Mesh(geometry, material);
      mesh.name = 'TapeMark';
      mesh.raycast = () => {};
      (mesh as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
      floor.add(mesh);
      lens?.hideFromLens(mesh);
      this.marks.push({ piece, mesh, material, settled: false });
    }
    this.followLive();
    const lines = new BufferGeometry();
    lines.setAttribute('position', new BufferAttribute(this.frameCorners, 3));
    lines.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
    this.frameLines = new Mesh(lines, new MeshBasicMaterial({ color: CHALK, toneMapped: false, transparent: true, opacity: 0.7, side: DoubleSide }));
    this.frameLines.name = 'FrameLines';
    this.frameLines.raycast = () => {};
    this.frameLines.frustumCulled = false;
    (this.frameLines as Object3D & { pointerEvents?: string }).pointerEvents = 'none';
    floor.add(this.frameLines);
    lens?.hideFromLens(this.frameLines);
    this.openFrameLines();
    return true;
  }

  /** The frame lines belong to whichever camera is live. */
  private followLive(): void {
    const label = (this.globals as Globals).cameraOn.peek();
    for (const cam of this.queries.cams.entities) {
      if (this.liveRig == null || String(cam.getValue(SetPiece, 'label')) === label) this.liveRig = cam.object3D ?? this.liveRig;
    }
  }

  /** Two strips out from the lens along the edges of the frame, as wide apart as this lens on this format sees. */
  private openFrameLines(): void {
    const lines = this.frameLines;
    if (lines == null) return;
    const g = this.globals as Globals;
    const sensor = SENSORS[g.sensorIndex.peek()] ?? SENSORS[0];
    const half = Math.atan((sensor.heightMm / (2 * g.lensMm.peek())) * FRAME_ASPECT);
    const p = this.frameCorners;
    let i = 0;
    for (const side of [-1, 1]) {
      // The lens looks down the camera's own -z.
      const dx = Math.sin(half) * side;
      const dz = -Math.cos(half);
      const nx = -dz * (FRAME_LINE_WIDTH / 2);
      const nz = dx * (FRAME_LINE_WIDTH / 2);
      const near = 0.03;
      const corners = [
        [dx * near - nx, dz * near - nz],
        [dx * near + nx, dz * near + nz],
        [dx * FRAME_LINE_LENGTH + nx, dz * FRAME_LINE_LENGTH + nz],
        [dx * FRAME_LINE_LENGTH - nx, dz * FRAME_LINE_LENGTH - nz],
      ];
      for (const [x, z] of corners) {
        p[i++] = x;
        p[i++] = 0;
        p[i++] = z;
      }
    }
    lines.geometry.getAttribute('position').needsUpdate = true;
  }

  update(delta: number): void {
    if (!this.ready) {
      this.ready = this.prepare();
      return;
    }
    const ease = Math.min(1, delta * FOLLOW);
    for (let i = 0; i < this.marks.length; i++) {
      const mark = this.marks[i];
      const object = mark.piece.object3D!;
      const mesh = mark.mesh;
      mesh.visible = object.visible;
      if (!object.visible) {
        mark.settled = false;
        continue;
      }
      // In the hand the actor has left the mark, and the mark waits where they stood.
      const carried = mark.piece.hasComponent(Held);
      const away = carried || object.position.y > 0.02;
      mark.material.opacity += ((away ? WAITING : 1) - mark.material.opacity) * ease;
      if (carried && mark.settled) continue;
      if (!mark.settled) {
        mesh.position.set(object.position.x, TAPE_LIFT, object.position.z);
        mesh.quaternion.copy(object.quaternion);
        mark.settled = true;
        continue;
      }
      mesh.position.x += (object.position.x - mesh.position.x) * ease;
      mesh.position.z += (object.position.z - mesh.position.z) * ease;
      mesh.quaternion.slerp(object.quaternion, ease);
    }
    const lines = this.frameLines;
    const camera = this.liveRig;
    if (lines != null && camera != null) {
      lines.visible = camera.visible;
      lines.position.set(camera.position.x, TAPE_LIFT, camera.position.z);
      // Only the way the camera faces: frame lines lie flat whatever the tilt.
      lines.rotation.y = Math.atan2(
        2 * (camera.quaternion.x * camera.quaternion.z + camera.quaternion.w * camera.quaternion.y),
        1 - 2 * (camera.quaternion.x * camera.quaternion.x + camera.quaternion.y * camera.quaternion.y),
      );
    }
  }
}
