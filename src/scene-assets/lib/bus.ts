/**
 * A single-deck city bus at 1:10: one long lofted body with rounded ends, a
 * glass band round it for the windows and both screens, pillars between the
 * windows, two doors on the kerb side, a blank destination box and a pod on the
 * roof. Generic previs, nose along +Z, wheels on y 0, 0.78 m long. Painted
 * parts are named Body*.
 */
import { Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { bevelBox, LoftSurface, type TubeSection } from './hardsurface.js';
import { alongs, archedWheel, bar, hub, lens, mergeByMaterial, named, tail } from './vehicle.js';

const SIDES = [-1, 1] as const;
const WHEEL_RADIUS = 0.05;
const AXLES = [0.24, -0.22] as const;
/** The kerb side, where the doors are. */
const KERB = -1;
const HALF_W = 0.1275;

const bodyAt = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: 0.14, hUp: top - 0.14, hDown: 0.14 - bottom, power: 7 });
const BODY = [
  bodyAt(-0.386, 0.108, 0.288, 0.072),
  bodyAt(-0.38, 0.12, 0.306, 0.056),
  bodyAt(-0.368, 0.1262, 0.316, 0.046),
  bodyAt(-0.33, HALF_W, 0.32, 0.04),
  bodyAt(0.33, HALF_W, 0.32, 0.04),
  bodyAt(0.362, 0.1268, 0.319, 0.044),
  bodyAt(0.377, 0.122, 0.312, 0.05),
  bodyAt(0.384, 0.112, 0.295, 0.062),
  bodyAt(0.387, 0.094, 0.268, 0.078),
];
/** The glass band, a millimetre proud of the body, dropping lower at the front for the windscreen. */
const paneAt = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: 0.225, hUp: top - 0.225, hDown: 0.225 - bottom, power: 7 });
const BAND = [
  paneAt(-0.3875, 0.1, 0.25, 0.178),
  paneAt(-0.385, 0.1135, 0.277, 0.17),
  paneAt(-0.38, 0.1215, 0.292, 0.168),
  paneAt(-0.366, 0.1278, 0.293, 0.166),
  paneAt(0.36, 0.1286, 0.293, 0.166),
  paneAt(0.374, 0.1245, 0.293, 0.13),
  paneAt(0.3825, 0.1175, 0.286, 0.125),
  paneAt(0.3885, 0.1, 0.262, 0.125),
];
const PILLARS = [-0.3, -0.21, -0.12, -0.03, 0.06, 0.15, 0.24, 0.33];
const DOORS = [0.335, -0.02];

export function busShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial): void {
  g.add(named(new Mesh(LoftSurface.tube(BODY).build(alongs(BODY, 10), 22, true), paint), 'Body'));
  g.add(named(new Mesh(LoftSurface.tube(BAND).build(alongs(BAND, 8), 22, true), glass), 'Glasshouse'));
  const pod = named(new Mesh(bevelBox(0.14, 0.016, 0.22, 0.004), paint), 'BodyPod');
  pod.position.set(0, 0.326, -0.12);
  const sign = named(new Mesh(bevelBox(0.16, 0.022, 0.008, 0.002), rubber), 'DestinationBox');
  sign.position.set(0, 0.284, 0.3815);
  g.add(pod, sign);
  for (const side of SIDES) {
    const x = side * (HALF_W + 0.002);
    // No pillar through a door: the doors' own shuts divide the glass there.
    const clear = (z: number): boolean => side !== KERB || DOORS.every((door) => Math.abs(z - door) > 0.045);
    for (const z of PILLARS.filter(clear)) g.add(bar(new Vector3(x, 0.167, z), new Vector3(x, 0.292, z), 0.0016, paint, 'BodyPillar'));
    g.add(bar(new Vector3(side * 0.1, 0.13, 0.3885), new Vector3(side * 0.1165, 0.285, 0.3835), 0.0022, paint, 'BodyPillarA'));
    g.add(bar(new Vector3(side * 0.1, 0.18, -0.3875), new Vector3(side * 0.115, 0.275, -0.384), 0.0022, paint, 'BodyPillarRear'));
    g.add(bar(new Vector3(side * 0.1235, 0.262, 0.37), new Vector3(side * 0.136, 0.262, 0.37), 0.0012, rubber, 'MirrorArm'));
    const mirror = named(new Mesh(new SphereGeometry(1, 6, 4), paint), 'BodyMirror');
    mirror.scale.set(0.004, 0.018, 0.008);
    mirror.position.set(side * 0.137, 0.248, 0.37);
    const head = named(new Mesh(new SphereGeometry(1, 8, 6), lens), 'Headlamp');
    head.scale.set(0.018, 0.012, 0.008);
    head.position.set(side * 0.082, 0.1, 0.386);
    head.rotation.y = side * 0.3;
    const rear = named(new Mesh(new SphereGeometry(1, 8, 6), tail), 'TailLamp');
    rear.scale.set(0.012, 0.03, 0.005);
    rear.position.set(side * 0.1, 0.11, -0.3865);
    g.add(mirror, head, rear);
    for (const z of AXLES) {
      const tag = `${z > 0 ? 'F' : 'R'}${side < 0 ? 'L' : 'R'}`;
      archedWheel(g, { side, z, radius: WHEEL_RADIUS, tyreWidth: 0.032, wheelX: 0.1, wellRadius: 0.062, wellX: 0.122, lipX: 0.1285, tag, halfWell: true }, paint, rubber);
    }
  }
  // Two doors on the kerb side: a tall pane each, with shuts at its edges and the split between the leaves.
  for (const z of DOORS) {
    const pane = named(new Mesh(bevelBox(0.004, 0.19, 0.06, 0.001), glass), 'DoorPane');
    pane.position.set(KERB * (HALF_W + 0.0017), 0.19, z);
    g.add(pane);
    for (const dz of [-0.031, 0, 0.031]) g.add(bar(new Vector3(KERB * (HALF_W + 0.0038), 0.06, z + dz), new Vector3(KERB * (HALF_W + 0.0038), 0.29, z + dz), 0.0008, rubber, 'DoorSeam'));
  }
  const front = named(new Mesh(bevelBox(0.21, 0.024, 0.016, 0.005), rubber), 'BumperFront');
  front.position.set(0, 0.056, 0.383);
  const back = named(new Mesh(bevelBox(0.21, 0.024, 0.016, 0.005), rubber), 'BumperRear');
  back.position.set(0, 0.056, -0.382);
  g.add(front, back);
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
