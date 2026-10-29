/**
 * The flat page's view of the set. The headset owns the camera in XR; in the
 * browser the viewport can be wide or tall, so the camera backs off for a
 * portrait frame and sits closer for a wide one. The page also lacks what the
 * room gives the headset for free, a table under the slate, a wall behind it
 * and soft light from the room, so those are added here; the table and the
 * wall show only outside XR.
 */
import {
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
import { SetPiece, StageAnchor } from './set-components.js';

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
    gradient.addColorStop(0, '#1a1d23');
    gradient.addColorStop(0.55, '#2a2d33');
    gradient.addColorStop(1, '#45423f');
    g.fillStyle = gradient;
    g.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class PreviewCameraSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
}) {
  private lastAspect = 0;
  private room: Mesh[] | null = null;
  private position = new Vector3();

  init(): void {
    // Soft light from the room: chalk from above, wood from below, so the
    // key light's shadows are shaded rather than black.
    const fill = new HemisphereLight(0xf6f7ef, 0x64453e, 0.45);
    fill.name = 'RoomFill';
    this.world.createTransformEntity(fill);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        const visible = state === VisibilityState.NonImmersive;
        for (const mesh of this.room ?? []) mesh.visible = visible;
      }),
    );
  }

  update(): void {
    if (this.room == null) this.ensureRoom();
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
    const aspect = this.camera.aspect;
    if (Math.abs(aspect - this.lastAspect) < 0.01) return;
    this.lastAspect = aspect;
    const tall = aspect < 1;
    const p = tall ? TALL : WIDE;
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(tall ? TALL_LOOK_AT : WIDE_LOOK_AT);
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
