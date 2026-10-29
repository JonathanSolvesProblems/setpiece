/**
 * The flat page's view of the set. The headset owns the camera in XR; in the
 * browser the viewport can be wide or tall, so the camera backs off for a
 * portrait frame and sits closer for a wide one. The page also lacks what the
 * room gives the headset for free, a table under the slate and soft light from
 * the walls, so both are added here; the table shows only outside XR.
 */
import {
  CanvasTexture,
  createSystem,
  Entity,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { SetPiece, StageAnchor } from './set-components.js';

/** Table-eye height, close, looking across the set at the monitor and the figures. */
const WIDE: [number, number, number] = [0.05, 0.91, 0.05];
const TALL: [number, number, number] = [0.02, 1.0, 0.5];
const LOOK_AT = new Vector3(0, 0.92, -0.6);
const TABLE_WIDTH = 2.0;
const TABLE_DEPTH = 1.4;
/** The slate plate is 12 mm thick and sits on the table top. */
const PLATE_THICKNESS = 0.012;

/** A dark tabletop, boards running across, drawn once. */
function tableTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#5c4034';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 1) {
      const wobble = Math.sin(y * 0.05) * 9 + Math.sin(y * 0.23) * 3;
      const shade = Math.sin(y * 0.35 + wobble * 0.3) * 10 + Math.sin(y * 1.3) * 4;
      g.fillStyle = shade > 0 ? `rgba(255, 225, 190, ${shade / 70})` : `rgba(0, 0, 0, ${-shade / 50})`;
      g.fillRect(0, y, 512, 1);
    }
    // Board seams.
    g.fillStyle = 'rgba(0, 0, 0, 0.35)';
    for (const y of [120, 262, 398]) g.fillRect(0, y, 512, 2);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(1.5, 1);
  return texture;
}

export class PreviewCameraSystem extends createSystem({
  stages: { required: [SetPiece, StageAnchor] },
}) {
  private lastAspect = 0;
  private table: Mesh | null = null;
  private position = new Vector3();

  init(): void {
    // Soft light from the room: chalk from above, wood from below, so the
    // key light's shadows are shaded rather than black.
    const fill = new HemisphereLight(0xf6f7ef, 0x64453e, 0.45);
    fill.name = 'RoomFill';
    this.world.createTransformEntity(fill);
    this.cleanupFuncs.push(
      this.world.visibilityState.subscribe((state) => {
        if (this.table) this.table.visible = state === VisibilityState.NonImmersive;
      }),
    );
  }

  update(): void {
    if (this.table == null) this.ensureTable();
    if (this.world.visibilityState.peek() !== VisibilityState.NonImmersive) return;
    const aspect = this.camera.aspect;
    if (Math.abs(aspect - this.lastAspect) < 0.01) return;
    this.lastAspect = aspect;
    const p = aspect < 1 ? TALL : WIDE;
    this.camera.position.set(p[0], p[1], p[2]);
    this.camera.lookAt(LOOK_AT);
  }

  /** A tabletop under the authored stage, for the page only; in XR the real table is there. */
  private ensureTable(): void {
    const stage = this.queries.stages.entities.values().next().value as Entity | undefined;
    const object = stage?.object3D;
    if (object == null) return;
    object.updateWorldMatrix(true, false);
    object.getWorldPosition(this.position);
    const table = new Mesh(
      new PlaneGeometry(TABLE_WIDTH, TABLE_DEPTH),
      new MeshStandardMaterial({ map: tableTexture(), roughness: 0.82 }),
    );
    table.name = 'PreviewTable';
    table.rotation.x = -Math.PI / 2;
    table.position.set(this.position.x, this.position.y - PLATE_THICKNESS - 0.001, this.position.z - 0.2);
    table.receiveShadow = true;
    table.visible = this.world.visibilityState.peek() === VisibilityState.NonImmersive;
    this.world.createTransformEntity(table);
    this.table = table;
  }
}
