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
    const dome = new SphereGeometry(0.5, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2, 1).translate(0, -0.5, 0);
    units = {
      box: new BoxGeometry(1, 1, 1),
      cylinder: new CylinderGeometry(0.5, 0.5, 1, 24, 4),
      cone: new ConeGeometry(0.5, 1, 24, 3),
      pyramid,
      sphere: new SphereGeometry(0.5, 24, 14),
      dome,
      wedge: wedge(),
    };
    for (const key of Object.keys(units) as Shape[]) {
      if (units[key].index != null) units[key] = units[key].toNonIndexed();
    }
  }
  return units[shape];
}

/**
 * How a finish is laid, beyond its colour. A wall of stone or brick is courses of blocks, each a shade of its own;
 * wood is planks; leaves are mottled and lumpy. `block` is the size of one block or plank in metres, `shade` how far
 * a block's colour strays from the finish's (as a share of it), `planks` lays them in one direction only, and
 * `lumps` pushes a round shape's surface in and out by that share of its size.
 */
type Lay = { block: number; shade: number; planks?: boolean; lumps?: number };
const LAID: Record<number, Lay> = {
  0x9a958a: { block: 0.6, shade: 0.11 }, // stone
  0x8e4a3a: { block: 0.45, shade: 0.13 }, // brick
  0x7d7a73: { block: 0.9, shade: 0.05 }, // grey
  0xcdb88f: { block: 0.8, shade: 0.06 }, // sand
  0xc4a07a: { block: 0.35, shade: 0.07, planks: true }, // wood
  0x6b4a32: { block: 0.35, shade: 0.08, planks: true }, // brown
  0x5f7f45: { block: 0.4, shade: 0.12, lumps: 0.1 }, // leaf
  0x4c6e52: { block: 0.5, shade: 0.06 }, // green
};
/** The most blocks along one side of a box: a long wall is not cut finer than this. */
const MOST_BLOCKS = 8;

/** A box cut into blocks along each side, so each block can take its own shade. Made once for each cut. */
const cutBoxes = new Map<number, BufferGeometry>();
function boxCut(x: number, y: number, z: number): BufferGeometry {
  const key = x * 100 + y * 10 + z;
  let box = cutBoxes.get(key);
  if (box == null) {
    box = new BoxGeometry(1, 1, 1, x, y, z).toNonIndexed();
    cutBoxes.set(key, box);
  }
  return box;
}

/** The shape a part is cut from: a laid box is cut into its blocks, anything else is the shape as it comes. */
function cut(part: Part): BufferGeometry {
  const lay = LAID[part.finish];
  if (part.shape !== 'box' || lay == null) return unit(part.shape);
  const blocks = (metres: number): number => Math.max(1, Math.min(MOST_BLOCKS, Math.round(metres / lay.block)));
  return boxCut(blocks(part.w), blocks(part.h), blocks(part.d));
}

/** A number from 0 to 1 that is the same for the same three numbers, and looks like chance. */
function chance(a: number, b: number, c: number): number {
  const x = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return x - Math.floor(x);
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
  for (const part of parts) count += cut(part).attributes.position.count;
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
  let nth = 0;
  for (const part of parts) {
    const source = cut(part);
    const lay = LAID[part.finish];
    nth++;
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
    let shade = 1;
    for (let i = 0; i < p.count; i++, o++) {
      if (lay != null && part.shape === 'box' && i % 3 === 0) {
        // Each triangle takes the shade of the block it lies in: found from the middle of the triangle on the
        // shape as it was cut, so the two halves of a block match, and laid a block's worth up each course.
        const mx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
        const my = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
        const mz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
        // A box is cut into its blocks, so a block is one cell of the cut.
        const cells = (metres: number): number => Math.max(1, Math.min(MOST_BLOCKS, Math.round(metres / lay.block)));
        const course = Math.min(cells(part.h) - 1, Math.floor((my + 0.5) * cells(part.h)));
        const along = lay.planks === true ? 0 : Math.min(cells(part.w) - 1, Math.floor((mx + 0.5) * cells(part.w)));
        const across = lay.planks === true ? 0 : Math.min(cells(part.d) - 1, Math.floor((mz + 0.5) * cells(part.d)));
        shade = 1 + (chance(along + nth * 7, course, across) - 0.5) * 2 * lay.shade;
      }
      v.fromBufferAttribute(p, i);
      // A round shape has no blocks: its colour drifts across it instead, the same at a place whoever asks.
      if (lay != null && part.shape !== 'box') {
        shade = 1 + lay.shade * (Math.sin(v.x * 7.3 + v.y * 5.1 + nth) + Math.sin(v.z * 6.7 - v.y * 4.3 + nth * 2)) * 0.5;
      }
      // Leaves are lumpy: the surface goes in and out by where it is on the shape, so neighbours agree.
      if (lay?.lumps != null && part.shape !== 'box') {
        v.multiplyScalar(1 + lay.lumps * (Math.sin(v.x * 6.1 + v.y * 4.3) + Math.sin(v.z * 5.3 - v.y * 3.7)) * 0.5);
      }
      v.applyMatrix4(matrix);
      surface.expandByPoint(v);
      positions[o * 3] = v.x;
      positions[o * 3 + 1] = v.y;
      positions[o * 3 + 2] = v.z;
      v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      normals[o * 3] = v.x;
      normals[o * 3 + 1] = v.y;
      normals[o * 3 + 2] = v.z;
      colours[o * 3] = Math.min(1, colour.r * shade);
      colours[o * 3 + 1] = Math.min(1, colour.g * shade);
      colours[o * 3 + 2] = Math.min(1, colour.b * shade);
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
