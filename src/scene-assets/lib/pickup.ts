/**
 * A crew-cab pickup at 1:10, built as the saloon is: one lofted body from the
 * bonnet to the tailgate, a squarer glasshouse over the cab with a roof skin,
 * and a dark liner let into the top of the bed so it reads as open from above.
 * Generic previs, nose along +Z, wheels on y 0, 0.51 m long. Painted parts are
 * named Body*.
 */
import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { bevelBox, LoftSurface, type TubeSection } from './hardsurface.js';
import { alongs, archedWheel, bar, hub, lens, mergeByMaterial, named, skinAt, tail } from './vehicle.js';

const SIDES = [-1, 1] as const;
const BELT = 0.072;
const WHEEL_RADIUS = 0.036;
const AXLES = [0.165, -0.165] as const;

/** One station of the body: where along the truck, half its width, its top, its underside, how square. */
const station = (z: number, halfW: number, top: number, bottom: number, power = 5): TubeSection => ({ z, halfW, cy: BELT, hUp: top - BELT, hDown: BELT - bottom, power });
const BODY = [
  station(-0.253, 0.078, 0.096, 0.05, 6),
  station(-0.247, 0.09, 0.117, 0.04, 7),
  station(-0.236, 0.095, 0.124, 0.034, 7),
  station(-0.09, 0.095, 0.125, 0.03, 7),
  station(-0.07, 0.095, 0.123, 0.03, 7),
  station(0.07, 0.095, 0.12, 0.03),
  station(0.09, 0.094, 0.118, 0.03),
  station(0.2, 0.092, 0.112, 0.034),
  station(0.237, 0.088, 0.104, 0.04),
  station(0.251, 0.078, 0.09, 0.05),
  station(0.256, 0.062, 0.078, 0.06),
];
/** The crew cab's glass: an upright rear screen, two door windows a side, a raked windscreen. */
const pane = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.115, hUp: top - 0.115, hDown: 0.01, power: 4.5 });
const CAB = [pane(-0.079, 0.084, 0.126), pane(-0.071, 0.087, 0.168), pane(-0.06, 0.088, 0.18), pane(0, 0.0885, 0.184), pane(0.03, 0.0885, 0.182), pane(0.056, 0.089, 0.16), pane(0.08, 0.09, 0.13), pane(0.091, 0.09, 0.118)];
/** The roof skin, proud of the glass, so the windows read beneath it. */
const roof = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.17, hUp: top - 0.17, hDown: 0.004, power: 4.5 });
const ROOF = [roof(-0.069, 0.08, 0.173), roof(-0.056, 0.0855, 0.182), roof(0, 0.086, 0.1855), roof(0.028, 0.0855, 0.1835), roof(0.041, 0.083, 0.176)];

export function pickupShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial): void {
  const body = LoftSurface.tube(BODY);
  g.add(named(new Mesh(body.build(alongs(BODY, 16), 22, true), paint), 'Body'));
  const cab = LoftSurface.tube(CAB);
  g.add(named(new Mesh(cab.build(alongs(CAB, 6), 18, true), glass), 'Glasshouse'));
  g.add(named(new Mesh(LoftSurface.tube(ROOF).build(alongs(ROOF, 4), 16, true), paint), 'BodyRoof'));
  const liner = named(new Mesh(bevelBox(0.15, 0.012, 0.14, 0.003), rubber), 'BedLiner');
  liner.position.set(0, 0.12, -0.162);
  g.add(liner);

  const nudge = new Vector3();
  for (const side of SIDES) {
    const out = (point: Vector3, by = 0.0012): Vector3 => point.clone().add(nudge.set(side * by, 0, 0));
    // Pillars: A down the windscreen edge, B between the doors, C at the back of the cab.
    g.add(bar(new Vector3(side * 0.084, 0.177, 0.04), new Vector3(side * 0.0895, 0.12, 0.088), 0.0028, paint, 'BodyPillarA'));
    g.add(bar(out(skinAt(cab, -0.012, 0.176, side)), out(skinAt(cab, -0.012, 0.122, side)), 0.0022, paint, 'BodyPillarB'));
    g.add(bar(out(skinAt(cab, -0.066, 0.172, side)), out(skinAt(cab, -0.072, 0.122, side)), 0.003, paint, 'BodyPillarC'));
    // Door shuts, the seam between cab and bed, and a handle on each door.
    for (const z of [0.088, -0.012, -0.078]) g.add(bar(out(skinAt(body, z, 0.115, side)), out(skinAt(body, z, 0.04, side)), 0.0007, rubber, 'DoorSeam'));
    for (const z of [0.045, -0.04]) {
      const handle = named(new Mesh(bevelBox(0.0024, 0.0028, 0.012, 0.0008), rubber), 'DoorHandle');
      handle.position.copy(out(skinAt(body, z, 0.1, side)));
      g.add(handle);
    }
    const mirror = named(new Mesh(new SphereGeometry(1, 8, 6), paint), 'BodyMirror');
    mirror.scale.set(0.009, 0.006, 0.007);
    mirror.position.copy(skinAt(cab, 0.07, 0.128, side)).add(nudge.set(side * 0.009, 0.003, 0));
    g.add(mirror);
    // Lamps wrap the corners; the tail lamps stand tall beside the tailgate.
    const head = named(new Mesh(new SphereGeometry(1, 10, 8), lens), 'Headlamp');
    head.scale.set(0.022, 0.009, 0.012);
    head.position.set(side * 0.06, 0.086, 0.244);
    head.rotation.y = side * 0.35;
    const rear = named(new Mesh(new SphereGeometry(1, 8, 6), tail), 'TailLamp');
    rear.scale.set(0.007, 0.02, 0.005);
    rear.position.set(side * 0.084, 0.102, -0.2495);
    g.add(head, rear);
    const sill = named(new Mesh(bevelBox(0.006, 0.01, 0.3, 0.002), rubber), 'Sill');
    sill.position.set(side * 0.088, 0.033, -0.07);
    g.add(sill, bar(new Vector3(side * 0.07, 0.055, -0.2535), new Vector3(side * 0.07, 0.092, -0.2535), 0.0007, rubber, 'TailgateSeam'));
    for (const z of AXLES) {
      const tag = `${z > 0 ? 'F' : 'R'}${side < 0 ? 'L' : 'R'}`;
      archedWheel(g, { side, z, radius: WHEEL_RADIUS, tyreWidth: 0.028, wheelX: 0.077, wellRadius: 0.047, wellX: 0.092, lipX: 0.0956, tag, halfWell: true }, paint, rubber);
    }
  }
  const grille = named(new Mesh(bevelBox(0.09, 0.016, 0.006, 0.002), rubber), 'Grille');
  grille.position.set(0, 0.071, 0.2545);
  const handle = named(new Mesh(bevelBox(0.024, 0.004, 0.004, 0.001), rubber), 'TailgateHandle');
  handle.position.set(0, 0.1, -0.2525);
  const front = named(new Mesh(bevelBox(0.15, 0.014, 0.014, 0.004), rubber), 'BumperFront');
  front.position.set(0, 0.046, 0.253);
  const back = named(new Mesh(bevelBox(0.15, 0.014, 0.014, 0.004), rubber), 'BumperRear');
  back.position.set(0, 0.046, -0.251);
  g.add(grille, handle, front, back);
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
