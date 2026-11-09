/**
 * A panel van at 1:10, built the way the saloon is: a lofted lower body with a
 * bonnet, a tall cargo box behind a glazed cab, a roof skin over the cab, pillars,
 * arches, lamps and bumpers, merged to one mesh per material. Generic previs, nose
 * along +Z, wheels on y 0, about 0.49 m long. Painted parts are named Body*.
 * The roof is flat at y 0.21 from z -0.22 to 0.09, where the roof styles sit.
 */
import { BoxGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { bevelBox, LoftSurface, sampleRange, type TubeSection } from './hardsurface.js';
import { archedWheel, bar, hub, lens, mergeByMaterial, named, skinAt, tail } from './vehicle.js';

const SIDES = [-1, 1] as const;
const WHEEL_RADIUS = 0.036;
const AXLES = [0.145, -0.15] as const;
const BELT = 0.08;
const ROOF = 0.21;

const lower = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: BELT, hUp: top - BELT, hDown: BELT - bottom, power: 5 });
const LOWER = [
  lower(-0.243, 0.086, 0.112, 0.05),
  lower(-0.238, 0.094, 0.12, 0.04),
  lower(-0.226, 0.097, 0.122, 0.036),
  lower(0.12, 0.097, 0.122, 0.036),
  lower(0.165, 0.096, 0.121, 0.037),
  lower(0.205, 0.093, 0.114, 0.038),
  lower(0.23, 0.089, 0.104, 0.042),
  lower(0.242, 0.08, 0.092, 0.05),
  lower(0.247, 0.064, 0.078, 0.06),
];

/** The cargo box: boxy, its top flat so a rack or light bar can stand on it. */
const box = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.12, hUp: top - 0.12, hDown: 0.012, power: 8 });
const CARGO = [box(-0.24, 0.088, 0.198), box(-0.236, 0.094, 0.206), box(-0.226, 0.096, ROOF), box(0.034, 0.096, ROOF)];

/** The glazed cab: side windows over the doors and a raked windscreen down to the bonnet. */
const pane = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.12, hUp: top - 0.12, hDown: 0.008, power: 4 });
const CAB = [pane(0.026, 0.0945, 0.205), pane(0.092, 0.0945, 0.2035), pane(0.118, 0.093, 0.172), pane(0.145, 0.09, 0.14), pane(0.166, 0.086, 0.121)];

/** The roof skin over the cab, proud of the glass, so the windows read beneath it. */
const roof = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.198, hUp: top - 0.198, hDown: 0.004, power: 8 });
const CAB_ROOF = [roof(0.02, 0.0958, ROOF), roof(0.088, 0.0958, 0.2095), roof(0.1, 0.0948, 0.2045)];

/** Sample points along a loft that always include its stations, so creases stay sharp. */
function alongs(sections: TubeSection[], count: number): number[] {
  const stations = sections.map((s) => s.z);
  const between = sampleRange(stations[0], stations[stations.length - 1], count).filter((z) => stations.every((s) => Math.abs(s - z) > 0.006));
  return [...stations, ...between].sort((a, b) => a - b);
}

export function vanShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial): void {
  const body = LoftSurface.tube(LOWER);
  g.add(named(new Mesh(body.build(alongs(LOWER, 12), 20, true), paint), 'Body'));
  const cargo = LoftSurface.tube(CARGO);
  g.add(named(new Mesh(cargo.build(alongs(CARGO, 4), 24, true), paint), 'BodyCargo'));
  const cab = LoftSurface.tube(CAB);
  g.add(named(new Mesh(cab.build(alongs(CAB, 6), 16, true), glass), 'Glasshouse'));
  g.add(named(new Mesh(LoftSurface.tube(CAB_ROOF).build(alongs(CAB_ROOF, 4), 16, true), paint), 'BodyRoof'));

  const nudge = new Vector3();
  for (const side of SIDES) {
    const out = (point: Vector3, by = 0.0012): Vector3 => point.clone().add(nudge.set(side * by, 0, 0));
    // A-pillars down the windscreen edge, in the body's own paint.
    // The windscreen's side edge: from the roof corner down to the scuttle, on the glass.
    g.add(bar(new Vector3(side * 0.0935, 0.2, 0.093), new Vector3(side * 0.0855, 0.1225, 0.1645), 0.003, paint, 'BodyPillarA'));
    // Cab door, sliding door and its runner.
    g.add(bar(out(skinAt(body, 0.15, 0.118, side)), out(skinAt(body, 0.15, 0.045, side)), 0.0007, rubber, 'DoorSeam'));
    for (const z of [0.03, -0.095]) {
      g.add(bar(out(skinAt(body, z, 0.118, side)), out(skinAt(body, z, 0.045, side)), 0.0007, rubber, 'DoorSeam'));
      g.add(bar(out(skinAt(cargo, z, 0.2, side)), out(skinAt(cargo, z, 0.12, side)), 0.0007, rubber, 'DoorSeam'));
    }
    g.add(bar(out(skinAt(cargo, 0.03, 0.186, side), 0.0016), out(skinAt(cargo, -0.2, 0.186, side), 0.0016), 0.0011, rubber, 'Runner'));
    for (const z of [0.098, -0.075]) {
      const handle = named(new Mesh(new BoxGeometry(0.0026, 0.003, 0.013), rubber), 'DoorHandle');
      handle.position.copy(out(skinAt(body, z, 0.112, side)));
      g.add(handle);
    }
    const mirror = named(new Mesh(new SphereGeometry(1, 6, 4), paint), 'BodyMirror');
    mirror.scale.set(0.004, 0.011, 0.007);
    mirror.position.copy(skinAt(cab, 0.125, 0.16, side)).add(nudge.set(side * 0.011, 0, 0));
    g.add(mirror);
    // Lamps wrap the nose corners; tall tail lamps on the rear pillars.
    const head = named(new Mesh(new SphereGeometry(1, 8, 6), lens), 'Headlamp');
    head.scale.set(0.02, 0.0085, 0.009);
    head.position.set(side * 0.061, 0.093, 0.2395);
    head.rotation.y = side * 0.35;
    const rear = named(new Mesh(new SphereGeometry(1, 8, 6), tail), 'TailLamp');
    rear.scale.set(0.0065, 0.022, 0.004);
    rear.position.set(side * 0.084, 0.142, -0.2395);
    g.add(head, rear);
    for (const z of AXLES) {
      const tag = `${z > 0 ? 'F' : 'R'}${side < 0 ? 'L' : 'R'}`;
      archedWheel(g, { side, z, radius: WHEEL_RADIUS, tyreWidth: 0.024, wheelX: 0.087, wellRadius: 0.045, wellX: 0.092, lipX: 0.0975, tag, halfWell: true }, paint, rubber);
    }
  }
  // Grille, bumpers, and the split between the rear doors.
  const grille = named(new Mesh(bevelBox(0.09, 0.02, 0.006, 0.002), rubber), 'Grille');
  grille.position.set(0, 0.076, 0.2445);
  const front = named(new Mesh(bevelBox(0.192, 0.02, 0.014, 0.005), rubber), 'BumperFront');
  front.position.set(0, 0.052, 0.241);
  const back = named(new Mesh(bevelBox(0.192, 0.02, 0.014, 0.005), rubber), 'BumperRear');
  back.position.set(0, 0.054, -0.239);
  g.add(grille, front, back, bar(new Vector3(0, 0.062, -0.2442), new Vector3(0, 0.2, -0.2412), 0.0008, rubber, 'DoorSeam'));
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
