/**
 * The flat page's view of the set. The headset owns the camera in XR; in the
 * browser the viewport can be wide or tall, so the camera backs off for a
 * portrait frame and sits closer for a wide one. The page also lacks what the
 * room gives the headset for free, a table under the slate, a wall behind it
 * and soft light from the room, so those are added here; the table and the
 * wall show only outside XR.
 */
import {
  Box3,
  BoxGeometry,
  CanvasTexture,
  createSystem,
  Entity,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { localBounds } from './bounds.js';
import { SetPiece, SetRole, StageAnchor } from './set-components.js';

/** How the view moves to a new frame: this much of the way each second, so it glides rather than jumps. */
const GLIDE = 4;
/** The page's camera never comes closer to the set than its own frame, nor further back than this. */
const FURTHEST = 3.2;
type Globals = { setsBuilt: Signal<number>; layoutChanged: Signal<number>; trayOn: Signal<string[]> };

/** Table-eye height, close, looking across the set at the monitor and the figures. */
const WIDE: [number, number, number] = [0.05, 0.93, 0.15];
const WIDE_LOOK_AT = new Vector3(0, 0.91, -0.6);
/** Further back and higher for a portrait frame, so the whole set fits. */
const TALL: [number, number, number] = [0.07, 1.02, 0.66];
const TALL_LOOK_AT = new Vector3(0, 0.84, -0.6);
const TABLE_WIDTH = 2.2;
const TABLE_DEPTH = 1.4;
const TABLE_THICKNESS = 0.03;
/** The table's front edge sits this far in front of the stage origin. */
const TABLE_FRONT = 0.25;
const WALL_WIDTH = 6;
const WALL_HEIGHT = 2.6;
/** The slate plate is 12 mm thick and sits on the table top. */
const PLATE_THICKNESS = 0.012;

/** A dark tabletop, boards running across, drawn once. */
function tableTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#4e3a31';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 1) {
      const wobble = Math.sin(y * 0.05) * 9 + Math.sin(y * 0.23) * 3;
      const shade = Math.sin(y * 0.35 + wobble * 0.3) * 10 + Math.sin(y * 1.3) * 4;
      g.fillStyle = shade > 0 ? `rgba(255, 225, 190, ${shade / 110})` : `rgba(0, 0, 0, ${-shade / 70})`;
      g.fillRect(0, y, 512, 1);
    }
    g.fillStyle = 'rgba(0, 0, 0, 0.3)';
    for (const y of [120, 262, 398]) g.fillRect(0, y, 512, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.5, 1);
  return texture;
}

/** The room behind the table: slate, darker up high, warmer where the key light reaches. */
function wallTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  if (g) {
    const gradient = g.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0, '#140f0c');
    gradient.addColorStop(0.55, '#1b1411');
    gradient.addColorStop(1, '#3a2d25');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class PreviewCameraSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
  pieces: { required: [SetPiece] },
}) {
  private lastAspect = 0;
  private room: Mesh[] | null = null;
  private position = new Vector3();
  /** Where the view is going, and where it looks; and where it is looking now, as it glides. */
  private goal = new Vector3();
  private goalLook = new Vector3();
  private look = new Vector3();
  private gliding = false;
  private refit = false;
  private bounds = new Box3();
  private part = new Box3();
  private way = new Vector3();
  private middle = new Vector3();
  private size = new Vector3();

  init(): void {
    // Soft light from the room: chalk from above, wood from below, so the
    // key light's shadows are shaded rather than black.
    const fill = new HemisphereLight(0xf6f7ef, 0x64453e, 0.45);
    fill.name = 'RoomFill';
    this.world.createTransformEntity(fill);
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const visible = state === VisibilityState.NonImmersive;
        for (const mesh of this.room ?? []) mesh.visible = visible;
      }),
      // A set built from words, or moved about, is framed again.
      g.setsBuilt.subscribe(() => {
        this.refit = true;
      }),
      g.trayOn.subscribe(() => {
        this.refit = true;
      }),
    );
  }

  update(delta: number): void {
    if (this.room == null) this.ensureRoom();
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
    const aspect = this.camera.aspect;
    if (Math.abs(aspect - this.lastAspect) >= 0.01) {
      this.lastAspect = aspect;
      this.refit = true;
    }
    if (this.refit) {
      this.refit = false;
      this.fit();
    }
    if (!this.gliding) return;
    const k = Math.min(1, GLIDE * delta);
    this.camera.position.lerp(this.goal, k);
    this.look.lerp(this.goalLook, k);
    this.camera.lookAt(this.look);
    if (this.camera.position.distanceToSquared(this.goal) < 1e-8 && this.look.distanceToSquared(this.goalLook) < 1e-8) this.gliding = false;
  }

  /**
   * The page's own frame for the set as it stands: the authored frame for a small set, and for a big one the
   * same view backed off and raised until every piece on the set is in it.
   */
  private fit(): void {
    const tall = this.lastAspect < 1;
    const p = tall ? TALL : WIDE;
    this.goal.set(p[0], p[1], p[2]);
    this.goalLook.copy(tall ? TALL_LOOK_AT : WIDE_LOOK_AT);
    this.bounds.makeEmpty();
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      const role = piece.getValue(SetPiece, 'role');
      if (object == null || !object.visible || role === SetRole.Stage || role === SetRole.Camera) continue;
      this.part.copy(localBounds(object)).applyMatrix4(object.matrixWorld);
      if (!this.part.isEmpty()) this.bounds.union(this.part);
    }
    if (!this.bounds.isEmpty()) {
      this.bounds.getCenter(this.middle);
      this.bounds.getSize(this.size);
      // How far back the authored view must stand for the whole set to fit its height and its width.
      const fov = (this.camera.fov * Math.PI) / 180;
      const fitHeight = this.size.y / 2 / Math.tan(fov / 2);
      const fitWidth = Math.max(this.size.x, this.size.z) / 2 / Math.tan(fov / 2) / Math.max(0.6, this.camera.aspect);
      const need = Math.min(FURTHEST, Math.max(fitHeight, fitWidth) * 1.15 + this.size.z / 2);
      this.way.copy(this.goal).sub(this.goalLook);
      const have = this.way.length();
      if (need > have) {
        this.way.normalize();
        // Rise as it backs off, so a tall piece is seen from above its middle, not from table height.
        this.way.y = Math.max(this.way.y, 0.28);
        this.way.normalize();
        this.goalLook.set(this.goalLook.x, Math.max(this.goalLook.y, this.middle.y), this.goalLook.z);
        this.goal.copy(this.goalLook).addScaledVector(this.way, need);
      }
    }
    if (!this.gliding && this.look.lengthSq() === 0) {
      // The first frame is put straight there.
      this.camera.position.copy(this.goal);
      this.look.copy(this.goalLook);
      this.camera.lookAt(this.look);
      return;
    }
    this.gliding = true;
  }

  /** A table under the authored stage and a wall behind it, for the page only. */
  private ensureRoom(): void {
    const stage = this.queries.stages.entities.values().next().value as Entity | undefined;
    const object = stage?.object3D;
    if (object == null) return;
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.position);
    const tableTop = this.position.y - PLATE_THICKNESS - 0.001;
    const table = new Mesh(
      new BoxGeometry(TABLE_WIDTH, TABLE_THICKNESS, TABLE_DEPTH),
      new MeshStandardMaterial({ map: tableTexture(), roughness: 0.85 }),
    );
    table.name = 'PreviewTable';
    table.position.set(
      this.position.x,
      tableTop - TABLE_THICKNESS / 2,
      this.position.z + TABLE_FRONT - TABLE_DEPTH / 2,
    );
    table.receiveShadow = true;
    const wall = new Mesh(
      new PlaneGeometry(WALL_WIDTH, WALL_HEIGHT),
      new MeshBasicMaterial({ map: wallTexture(), toneMapped: false }),
    );
    wall.name = 'PreviewWall';
    wall.position.set(this.position.x, tableTop - 0.6 + WALL_HEIGHT / 2, this.position.z + TABLE_FRONT - TABLE_DEPTH - 0.02);
    const visible = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    table.visible = visible;
    wall.visible = visible;
    this.world.createTransformEntity(table);
    this.world.createTransformEntity(wall);
    this.room = [table, wall];
  }
}
