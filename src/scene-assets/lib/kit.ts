/**
 * Construction helpers shared by the procedural prop and creature modules:
 * limbs, lofts, a per-material merge so each asset costs a few draw calls, and
 * the pivot group for parts that move on their own. Pure geometry, deterministic.
 */
import {
  BufferGeometry,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';
import { LoftSurface, alignSpan, bevelBox, type TubeSection } from './hardsurface.js';

export const v = (x: number, y: number, z: number): Vector3 => new Vector3(x, y, z);
export const SIDES = [-1, 1] as const;
export const BALL = new SphereGeometry(1, 8, 6);
export const BEAD = new SphereGeometry(1, 6, 4);
export const CONE = new ConeGeometry(1, 1, 6);

/** An ellipsoid centred at `at`. */
export function ball(at: Vector3, rx: number, ry = rx, rz = rx, geometry: BufferGeometry = BALL): Mesh {
  const mesh = new Mesh(geometry);
  mesh.position.copy(at);
  mesh.scale.set(rx, ry, rz);
  return mesh;
}

/** A tapered round section from a (radius ra) to b (radius rb). */
export function limb(a: Vector3, b: Vector3, ra: number, rb: number, radial = 8): Mesh {
  const mesh = new Mesh(new CylinderGeometry(rb, ra, a.distanceTo(b), radial, 1));
  alignSpan(mesh, a, b);
  return mesh;
}

/** A cone with its base at `base` and its point at `tip`; flat < 1 squeezes it into a blade. */
export function spike(base: Vector3, tip: Vector3, radius: number, flat = 1, hint?: Vector3): Mesh {
  const mesh = new Mesh(CONE);
  const length = alignSpan(mesh, base, tip, hint);
  mesh.scale.set(radius * flat, length, radius);
  return mesh;
}

/** Limbs joined by balls through a list of points, radii per point. */
export function chain(points: Vector3[], radii: number[], joints = true): Mesh[] {
  const out: Mesh[] = [];
  for (let i = 0; i < points.length - 1; i += 1) out.push(limb(points[i], points[i + 1], radii[i], radii[i + 1]));
  if (joints) for (let i = 1; i < points.length - 1; i += 1) out.push(ball(points[i], radii[i] * 1.04));
  return out;
}

export const KEYS = ['cx', 'cy', 'halfW', 'hUp', 'hDown', 'power'] as const;

/** Inserts Catmull-Rom sections between the authored ones so a loft reads as one smooth form. */
export function smooth(sections: TubeSection[], per = 2): TubeSection[] {
  const s = [...sections].sort((a, b) => a.z - b.z);
  const val = (i: number, k: (typeof KEYS)[number]): number => {
    const c = s[Math.max(0, Math.min(s.length - 1, i))];
    if (k === 'hDown') return c.hDown ?? c.hUp;
    return (c[k] as number | undefined) ?? (k === 'power' ? 2.4 : 0);
  };
  const out: TubeSection[] = [];
  for (let i = 0; i < s.length - 1; i += 1) {
    for (let j = 0; j <= per; j += 1) {
      const t = j / (per + 1);
      const sec: Record<string, number> = { z: s[i].z + (s[i + 1].z - s[i].z) * t };
      for (const k of KEYS) {
        const p0 = val(i - 1, k), p1 = val(i, k), p2 = val(i + 1, k), p3 = val(i + 2, k);
        const t2 = t * t, t3 = t2 * t;
        sec[k] = 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (3 * p1 - p0 - 3 * p2 + p3) * t3);
      }
      // The spline can overshoot past zero at a tapered tip; keep every section real.
      for (const k of ['halfW', 'hUp', 'hDown'] as const) sec[k] = Math.max(sec[k], 0.0008);
      out.push(sec as unknown as TubeSection);
    }
  }
  out.push(s[s.length - 1]);
  return out;
}

export const sec = (z: number, cy: number, halfW: number, hUp: number, hDown = hUp, cx = 0, power = 2.3): TubeSection => ({
  z,
  cy,
  cx,
  halfW,
  hUp,
  hDown,
  power,
});

/** A smooth loft swept along +Z, and the surface it came from for placing detail. */
export function loft(sections: TubeSection[], segments = 12, per = 2): { mesh: Mesh; surface: LoftSurface } {
  const dense = smooth(sections, per);
  const surface = LoftSurface.tube(dense);
  return { mesh: new Mesh(surface.build(dense.map((s) => s.z), segments, true)), surface };
}

/** A standing loft: rings stacked up Y, each with its own front and back depth. */
export type Ring = { h: number; halfW: number; front: number; back: number; fwd?: number; side?: number; power?: number };
export function upright(rings: Ring[], segments = 12, per = 2): Mesh {
  const { mesh } = loft(
    rings.map((r) => ({ z: r.h, cx: r.side ?? 0, cy: -(r.fwd ?? 0), halfW: r.halfW, hUp: r.back, hDown: r.front, power: r.power ?? 2.3 })),
    segments,
    per,
  );
  // Sweep axis +Z becomes +Y; the section's +Y becomes -Z, so 'back' lands behind.
  mesh.geometry.rotateX(-Math.PI / 2);
  return mesh;
}

/** Collects parts by name and material, then bakes each set into one mesh. */
export class Kit {
  private readonly sets = new Map<string, { material: MeshStandardMaterial; parts: Object3D[] }>();

  /** `scale` fits a form drawn in round numbers to its target size, about the origin. */
  constructor(private readonly scale = 1) {}

  put(name: string, material: MeshStandardMaterial, ...parts: Object3D[]): void {
    const set = this.sets.get(name) ?? { material, parts: [] };
    set.parts.push(...parts);
    this.sets.set(name, set);
  }

  build(parent: Object3D): void {
    for (const [name, { material, parts }] of this.sets) {
      const positions: number[] = [];
      const normals: number[] = [];
      for (const part of parts) {
        part.updateMatrixWorld(true);
        part.traverse((node) => {
          if (!(node instanceof Mesh)) return;
          const source = node.geometry as BufferGeometry;
          const baked = source.index ? source.toNonIndexed() : source.clone();
          if (!baked.getAttribute('normal')) baked.computeVertexNormals();
          baked.applyMatrix4(node.matrixWorld);
          if (this.scale !== 1) baked.scale(this.scale, this.scale, this.scale);
          const p = baked.getAttribute('position').array;
          const n = baked.getAttribute('normal').array;
          for (let i = 0; i < p.length; i += 1) {
            positions.push(p[i]);
            normals.push(n[i]);
          }
        });
      }
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
      geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
      geometry.computeBoundingBox();
      geometry.computeBoundingSphere();
      const mesh = new Mesh(geometry, material);
      mesh.name = name;
      parent.add(mesh);
    }
  }
}

export type Idle = { kind: 'flap' | 'spin' | 'sway'; axis: 'x' | 'y' | 'z'; amount: number; rate: number };

/** A pivot group for a part that moves on its own while on the set. */
export function idleGroup(name: string, at: Vector3, idle: Idle): Group {
  const group = new Group();
  group.name = name;
  group.position.copy(at);
  group.userData.idle = idle;
  return group;
}

/** Point on a loft at station z, angle theta (0 = +X side, PI/2 = top). */
export const onLoft = (surface: LoftSurface, z: number, theta: number): Vector3 => surface.point(z, theta);

/** A bevelled plate whose long axis runs from a to b. */
export function plate(a: Vector3, b: Vector3, width: number, depth: number, bevel = 0.004): Mesh {
  const mesh = new Mesh(bevelBox(width, a.distanceTo(b), depth, bevel));
  alignSpan(mesh, a, b, v(0, 0, 1));
  return mesh;
}
