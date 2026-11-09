/**
 * Pieces shared by the lofted vehicles (the saloon and the van): lamp and hub
 * materials, skin queries on a loft, thin bars for pillars and seams, an arched
 * wheel, and the per-material merge that keeps a vehicle to a few draw calls.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { alignSpan, type LoftSurface } from './hardsurface.js';

export const lens = new MeshStandardMaterial({ color: 0xe4dcc6, roughness: 0.3, metalness: 0.2 });
export const tail = new MeshStandardMaterial({ color: 0x7c2c25, roughness: 0.35 });
export const hub = new MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.45, metalness: 0.5 });

export function named<T extends Mesh>(mesh: T, name: string): T {
  mesh.name = name;
  return mesh;
}

/** The point on a loft's skin at this station and height, on one side of the vehicle. */
export function skinAt(surface: LoftSurface, z: number, y: number, side: number): Vector3 {
  let best = new Vector3();
  let gap = Infinity;
  for (let theta = 0; theta < Math.PI * 2; theta += 0.02) {
    const point = surface.point(z, theta);
    if (point.x * side <= 0 || Math.abs(point.y - y) >= gap) continue;
    gap = Math.abs(point.y - y);
    best = point;
  }
  return best;
}

/** A thin bar lying on the skin between two points, for pillars and seams. */
export function bar(a: Vector3, b: Vector3, width: number, material: Material, name: string): Mesh {
  const mesh = named(new Mesh(new CylinderGeometry(width, width, 1, 5), material), name);
  mesh.scale.y = alignSpan(mesh, a, b);
  return mesh;
}

export type ArchedWheel = {
  /** -1 left, 1 right */
  side: number;
  /** axle station */
  z: number;
  radius: number;
  tyreWidth: number;
  wheelX: number;
  wellRadius: number;
  wellX: number;
  lipX: number;
  tag: string;
  /** Only the upper half of the well, so nothing reaches below the floor. */
  halfWell?: boolean;
};

/** A dark wheel well with a painted lip over it, the tyre inside, and a hub cap. */
export function archedWheel(g: Group, w: ArchedWheel, paint: Material, rubber: Material): void {
  const wellGeometry = w.halfWell
    ? new CylinderGeometry(w.wellRadius, w.wellRadius, 0.012, 8, 1, false, 0, Math.PI)
    : new CylinderGeometry(w.wellRadius, w.wellRadius, 0.012, 16);
  const well = named(new Mesh(wellGeometry, rubber), 'WheelWell');
  well.rotation.z = Math.PI / 2;
  well.position.set(w.side * w.wellX, w.radius, w.z);
  const lip = named(new Mesh(new TorusGeometry(w.wellRadius + 0.0005, 0.0022, 5, 14, Math.PI), paint), 'BodyArch');
  lip.rotation.y = w.side * (Math.PI / 2);
  lip.position.set(w.side * w.lipX, w.radius, w.z);
  const tyre = named(new Mesh(new CylinderGeometry(w.radius, w.radius, w.tyreWidth, 16), rubber), `Wheel${w.tag}`);
  tyre.rotation.z = Math.PI / 2;
  tyre.position.set(w.side * w.wheelX, w.radius, w.z);
  const cap = named(new Mesh(new CylinderGeometry(w.radius * 0.576, w.radius * 0.636, 0.004, 10), hub), 'Hub');
  cap.rotation.z = Math.PI / 2;
  cap.position.set(w.side * (w.wheelX + w.tyreWidth / 2 + 0.0005), w.radius, w.z);
  g.add(well, lip, tyre, cap);
}

/**
 * One mesh for each material, so a vehicle is a handful of draw calls and not
 * sixty. Only direct mesh children are merged; groups such as Style0 are left
 * alone. A coat of paint still takes the whole body, because it is one mesh named Body.
 */
export function mergeByMaterial(g: Group, names: Map<Material, string>): void {
  const parts = g.children.filter((child): child is Mesh => child instanceof Mesh);
  for (const [material, name] of names) {
    const positions: number[] = [];
    const normals: number[] = [];
    for (const part of parts) {
      if (part.material !== material) continue;
      part.updateMatrix();
      const flat = part.geometry.index != null ? part.geometry.toNonIndexed() : part.geometry.clone();
      flat.applyMatrix4(part.matrix);
      positions.push(...(flat.getAttribute('position').array as Float32Array));
      normals.push(...(flat.getAttribute('normal').array as Float32Array));
      g.remove(part);
    }
    if (positions.length === 0) continue;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    geometry.computeBoundingSphere();
    g.add(named(new Mesh(geometry, material), name));
  }
}
