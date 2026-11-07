/**
 * A saloon at 1:10, as a model maker would cut it from one block: a continuous
 * lofted body, a glasshouse sitting on it, wheel arches with lips, and the lamps
 * and seams that make the eye read it as a car. It stays generic: previs shows
 * where a car is, never whose. Nose along +Z, wheels on y 0, 0.45 m long.
 *
 * Every painted part is named Body*, so a coat of paint takes the whole shell.
 */
import {
  BufferAttribute,
  BufferGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { alignSpan, bevelBox, LoftSurface, sampleRange } from './hardsurface.js';

const lens = new MeshStandardMaterial({ color: 0xe4dcc6, roughness: 0.3, metalness: 0.2 });
const tail = new MeshStandardMaterial({ color: 0x7c2c25, roughness: 0.35 });
const hub = new MeshStandardMaterial({ color: 0x8d8a84, roughness: 0.45, metalness: 0.5 });

const SIDES = [-1, 1] as const;
const BELT = 0.066;
const WHEEL_RADIUS = 0.033;
const WHEEL_X = 0.073;
const AXLES = [0.135, -0.14] as const;

/** One station of the body: where along the car, half its width, its top and its underside. */
const station = (z: number, halfW: number, top: number, bottom: number) => ({
  z,
  halfW,
  cy: BELT,
  hUp: top - BELT,
  hDown: BELT - bottom,
  power: 4.6,
});

const BODY = [
  station(-0.225, 0.066, 0.086, 0.044),
  station(-0.216, 0.08, 0.097, 0.033),
  station(-0.19, 0.086, 0.103, 0.028),
  station(-0.13, 0.09, 0.104, 0.024),
  station(-0.03, 0.091, 0.102, 0.024),
  station(0.06, 0.091, 0.099, 0.024),
  station(0.11, 0.09, 0.097, 0.024),
  station(0.165, 0.086, 0.091, 0.026),
  station(0.205, 0.078, 0.082, 0.032),
  station(0.224, 0.062, 0.07, 0.044),
];

/** The glasshouse, from the rear deck over the roof to the foot of the windscreen. */
const cabinAt = (z: number, top: number, halfW: number) => ({ z, halfW, cy: 0.098, hUp: top - 0.098, hDown: 0.01, power: 2.8 });
const CABIN = [
  cabinAt(-0.178, 0.1, 0.074),
  cabinAt(-0.15, 0.116, 0.077),
  cabinAt(-0.115, 0.138, 0.076),
  cabinAt(-0.07, 0.147, 0.074),
  cabinAt(-0.01, 0.149, 0.074),
  cabinAt(0.03, 0.145, 0.075),
  cabinAt(0.075, 0.122, 0.078),
  cabinAt(0.118, 0.1, 0.079),
];

/** The roof skin, proud of the glass, leaving the side windows below it. */
const roofAt = (z: number, top: number, halfW: number) => ({ z, halfW, cy: 0.136, hUp: top - 0.136, hDown: 0.004, power: 2.8 });
const ROOF = [
  roofAt(-0.122, 0.1375, 0.068),
  roofAt(-0.1, 0.1435, 0.071),
  roofAt(-0.07, 0.1482, 0.073),
  roofAt(-0.01, 0.1502, 0.0735),
  roofAt(0.03, 0.1462, 0.074),
  roofAt(0.05, 0.1375, 0.074),
];

function named<T extends Mesh>(mesh: T, name: string): T {
  mesh.name = name;
  return mesh;
}

/** The point on a loft's skin at this station and height, on one side of the car. */
function skinAt(surface: LoftSurface, z: number, y: number, side: number): Vector3 {
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
function bar(a: Vector3, b: Vector3, width: number, material: Material, name: string): Mesh {
  const mesh = named(new Mesh(new CylinderGeometry(width, width, 1, 5), material), name);
  mesh.scale.y = alignSpan(mesh, a, b);
  return mesh;
}

/**
 * One mesh for each material, so a car is a handful of draw calls and not sixty.
 * Nothing on it moves against the rest, and a coat of paint still takes the whole
 * body, because the body is one mesh named Body.
 */
function mergeByMaterial(g: Group, names: Map<Material, string>): void {
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
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    geometry.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    geometry.computeBoundingSphere();
    g.add(named(new Mesh(geometry, material), name));
  }
}

export function sedanShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial): void {
  const body = LoftSurface.tube(BODY);
  g.add(named(new Mesh(body.build(sampleRange(-0.225, 0.224, 22), 24, true), paint), 'Body'));

  const cabin = LoftSurface.tube(CABIN);
  g.add(named(new Mesh(cabin.build(sampleRange(-0.178, 0.118, 14), 20, true), glass), 'Glasshouse'));
  g.add(named(new Mesh(LoftSurface.tube(ROOF).build(sampleRange(-0.122, 0.05, 8), 18, true), paint), 'BodyRoof'));

  const nudge = new Vector3(0, 0, 0);
  for (const side of SIDES) {
    const out = (point: Vector3): Vector3 => point.clone().add(nudge.set(side * 0.0012, 0, 0));
    // Pillars carry the roof down to the belt, in the body's own paint.
    for (const [high, top, low, width, name] of [
      [0.05, 0.128, 0.098, 0.0026, 'BodyPillarA'],
      [-0.03, 0.136, -0.034, 0.0022, 'BodyPillarB'],
      [-0.112, 0.13, -0.156, 0.0034, 'BodyPillarC'],
    ] as [number, number, number, number, string][]) {
      g.add(bar(out(skinAt(cabin, high, top, side)), out(skinAt(cabin, low, 0.103, side)), width, paint, name));
    }
    // Door shuts, and a handle on each door.
    for (const z of [0.062, -0.034, -0.112]) {
      g.add(bar(out(skinAt(body, z, 0.1, side)), out(skinAt(body, z, 0.04, side)), 0.0007, rubber, 'DoorSeam'));
    }
    for (const z of [-0.012, -0.09]) {
      const handle = named(new Mesh(bevelBox(0.0024, 0.0028, 0.012, 0.0008), rubber), 'DoorHandle');
      handle.position.copy(out(skinAt(body, z, 0.09, side)));
      g.add(handle);
    }
    const mirror = named(new Mesh(new SphereGeometry(1, 8, 6), paint), 'BodyMirror');
    mirror.scale.set(0.009, 0.0055, 0.0065);
    mirror.position.copy(skinAt(cabin, 0.078, 0.103, side)).add(nudge.set(side * 0.008, 0.004, 0));
    g.add(mirror);
    // Lamps wrap the corners rather than sitting on a flat face.
    const head = named(new Mesh(new SphereGeometry(1, 10, 8), lens), 'Headlamp');
    head.scale.set(0.021, 0.0075, 0.012);
    head.position.set(side * 0.058, 0.074, 0.212);
    head.rotation.y = side * 0.35;
    const rear = named(new Mesh(new SphereGeometry(1, 10, 8), tail), 'TailLamp');
    rear.scale.set(0.023, 0.0078, 0.008);
    rear.position.set(side * 0.058, 0.082, -0.219);
    rear.rotation.y = -side * 0.3;
    g.add(head, rear);
    // A sill, then the arches and wheels.
    const sill = named(new Mesh(bevelBox(0.006, 0.01, 0.2, 0.002), rubber), 'Sill');
    sill.position.set(side * 0.0885, 0.029, -0.002);
    g.add(sill);
    for (const z of AXLES) {
      const tag = `${z > 0 ? 'F' : 'R'}${side < 0 ? 'L' : 'R'}`;
      const well = named(new Mesh(new CylinderGeometry(0.043, 0.043, 0.012, 16), rubber), 'WheelWell');
      well.rotation.z = Math.PI / 2;
      well.position.set(side * 0.088, WHEEL_RADIUS, z);
      const lip = named(new Mesh(new TorusGeometry(0.0435, 0.0022, 5, 14, Math.PI), paint), 'BodyArch');
      lip.rotation.y = side * (Math.PI / 2);
      lip.position.set(side * 0.0916, WHEEL_RADIUS, z);
      const tyre = named(new Mesh(new CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, 0.026, 16), rubber), `Wheel${tag}`);
      tyre.rotation.z = Math.PI / 2;
      tyre.position.set(side * WHEEL_X, WHEEL_RADIUS, z);
      const cap = named(new Mesh(new CylinderGeometry(0.019, 0.021, 0.004, 10), hub), 'Hub');
      cap.rotation.z = Math.PI / 2;
      cap.position.set(side * (WHEEL_X + 0.0135), WHEEL_RADIUS, z);
      g.add(well, lip, tyre, cap);
    }
  }
  // Grille and bumpers.
  const grille = named(new Mesh(bevelBox(0.082, 0.012, 0.006, 0.002), rubber), 'Grille');
  grille.position.set(0, 0.058, 0.2235);
  const front = named(new Mesh(bevelBox(0.118, 0.012, 0.012, 0.004), rubber), 'BumperFront');
  front.position.set(0, 0.041, 0.2235);
  const back = named(new Mesh(bevelBox(0.118, 0.012, 0.012, 0.004), rubber), 'BumperRear');
  back.position.set(0, 0.044, -0.2245);
  g.add(grille, front, back);
  mergeByMaterial(
    g,
    new Map<Material, string>([
      [paint, 'Body'],
      [glass, 'Glasshouse'],
      [rubber, 'Trim'],
      [lens, 'Headlamps'],
      [tail, 'TailLamps'],
      [hub, 'Hubs'],
    ]),
  );
}
