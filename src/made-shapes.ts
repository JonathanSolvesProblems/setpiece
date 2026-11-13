/**
 * A new piece, made from the parts the set designer listed: each part is a turned or cut shape, sized,
 * placed and painted, and all of them are joined into one mesh so the piece costs one draw. Sizes come in
 * real metres and are built at 1:10, the slate's scale. Building allocates; it happens when a piece is
 * made, never in a frame.
 */
import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Matrix3,
  Matrix4,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { readPart } from './director-plan.js';
import type { Part, Shape } from './director-plan.js';

/** Real metres to the slate's. */
const SCALE = 0.1;
const DEG = Math.PI / 180;

/** A wedge: a roof's shape, its flat underside one unit square, its ridge along x at the top. */
function wedge(): BufferGeometry {
  const p = [
    // underside
    -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5,
    // front slope
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0,
    -0.5, -0.5, 0.5, 0.5, 0.5, 0, -0.5, 0.5, 0,
    // back slope
    0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, 0,
    0.5, -0.5, -0.5, -0.5, 0.5, 0, 0.5, 0.5, 0,
    // ends
    -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0,
    0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0,
  ];
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(p, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Each shape, one unit across in every direction and centred, ready to be sized. Made once. */
let units: Record<Shape, BufferGeometry> | null = null;
function unit(shape: Shape): BufferGeometry {
  if (units == null) {
    const pyramid = new ConeGeometry(0.5, 1, 4, 1).rotateY(Math.PI / 4).scale(Math.SQRT2, 1, Math.SQRT2);
    const dome = new SphereGeometry(0.5, 14, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0);
    units = {
      box: new BoxGeometry(1, 1, 1),
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 14, 1),
      cone: new ConeGeometry(0.5, 1, 14, 1),
      pyramid,
      sphere: new SphereGeometry(0.5, 14, 9),
      dome,
      wedge: wedge(),
    };
    for (const key of Object.keys(units) as Shape[]) {
      if (units[key].index != null) units[key] = units[key].toNonIndexed();
    }
  }
  return units[shape];
}

/** The size a made piece is, at full scale: width, length and height, in metres. */
export type Footprint = { w: number; d: number; h: number };

/**
 * One mesh's worth of parts. Lines that cannot be read are left out; a piece with nothing readable in it
 * comes back as null, and is not made.
 */
export function buildMade(lines: string[]): { geometry: BufferGeometry; footprint: Footprint; parts: number; surfaces: Box3[] } | null {
  const parts = lines.map(readPart).filter((part): part is Part => part != null);
  if (parts.length === 0) return null;
  // The lowest point of the piece goes on the ground, whatever heights were written.
  let count = 0;
  for (const part of parts) count += unit(part.shape).attributes.position.count;
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const matrix = new Matrix4();
  const normalMatrix = new Matrix3();
  const rotation = new Quaternion();
  const euler = new Euler();
  const at = new Vector3();
  const size = new Vector3();
  const v = new Vector3();
  const colour = new Color();
  let o = 0;
  // Each part's own box, in the piece's frame: what can be set down on, part by part.
  const surfaces: Box3[] = [];
  for (const part of parts) {
    const source = unit(part.shape);
    const surface = new Box3();
    surfaces.push(surface);
    euler.set(part.pitch * DEG, part.yaw * DEG, part.roll * DEG, 'YXZ');
    rotation.setFromEuler(euler);
    matrix.compose(at.set(part.x * SCALE, part.y * SCALE, part.z * SCALE), rotation, size.set(part.w * SCALE, part.h * SCALE, part.d * SCALE));
    normalMatrix.getNormalMatrix(matrix);
    colour.setHex(part.finish);
    const p = source.attributes.position;
    const n = source.attributes.normal;
    const t = source.attributes.uv;
    for (let i = 0; i < p.count; i++, o++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      surface.expandByPoint(v);
      positions[o * 3] = v.x;
      positions[o * 3 + 1] = v.y;
      positions[o * 3 + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      normals[o * 3] = v.x;
      normals[o * 3 + 1] = v.y;
      normals[o * 3 + 2] = v.z;
      colours[o * 3] = colour.r;
      colours[o * 3 + 1] = colour.g;
      colours[o * 3 + 2] = colour.b;
      uvs[o * 2] = t != null ? t.getX(i) : 0;
      uvs[o * 2 + 1] = t != null ? t.getY(i) : 0;
    }
  }
  let low = Infinity;
  for (let i = 1; i < positions.length; i += 3) low = Math.min(low, positions[i]);
  if (Number.isFinite(low) && Math.abs(low) > 1e-5) {
    for (let i = 1; i < positions.length; i += 3) positions[i] -= low;
    for (const surface of surfaces) {
      surface.min.y -= low;
      surface.max.y -= low;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const box = geometry.boundingBox!;
  const footprint = {
    w: (box.max.x - box.min.x) / SCALE,
    d: (box.max.z - box.min.z) / SCALE,
    h: (box.max.y - box.min.y) / SCALE,
  };
  return { geometry, footprint, parts: parts.length, surfaces };
}
