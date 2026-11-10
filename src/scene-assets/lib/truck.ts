/**
 * A cab-over truck at 1:10: a lofted cab with a glass band round its front, a
 * sun visor, mirrors on arms, a ladder chassis with its tank and battery box,
 * six wheels, and one of three loads behind the cab (box, flatbed, tanker) as
 * Style groups. Generic previs, nose along +Z, wheels on y 0, 0.62 m long.
 * Painted parts are named Body*.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, SphereGeometry, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { bevelBox, LoftSurface, type TubeSection } from './hardsurface.js';
import { alongs, archedWheel, bar, hub, lens, mergeByMaterial, named, plainWheel, skinAt, tail } from './vehicle.js';

const SIDES = [-1, 1] as const;
const WHEEL_RADIUS = 0.045;
const FRONT_AXLE = 0.245;
const REAR_AXLES = [-0.15, -0.24] as const;

const cabAt = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: 0.16, hUp: top - 0.16, hDown: 0.16 - bottom, power: 6 });
const CAB = [cabAt(0.158, 0.106, 0.268, 0.052), cabAt(0.166, 0.111, 0.277, 0.046), cabAt(0.18, 0.1125, 0.281, 0.045), cabAt(0.285, 0.1125, 0.281, 0.045), cabAt(0.3, 0.111, 0.277, 0.047), cabAt(0.31, 0.105, 0.265, 0.053), cabAt(0.316, 0.092, 0.245, 0.064)];
/** The glass band: door windows and the windscreen as one skin a millimetre proud of the cab. */
const paneAt = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: 0.215, hUp: top - 0.215, hDown: 0.215 - bottom, power: 6 });
const BAND = [paneAt(0.198, 0.1137, 0.264, 0.176), paneAt(0.3, 0.1122, 0.262, 0.176), paneAt(0.311, 0.1062, 0.252, 0.178), paneAt(0.3172, 0.0932, 0.236, 0.182)];
/** The loads: a box with square corners, and a tank that is round in section with domed ends. */
const boxAt = (z: number, halfW: number, top: number, bottom: number): TubeSection => ({ z, halfW, cy: 0.2, hUp: top - 0.2, hDown: 0.2 - bottom, power: 10 });
const BOX = [boxAt(-0.296, 0.112, 0.332, 0.1), boxAt(-0.29, 0.115, 0.335, 0.097), boxAt(0.14, 0.115, 0.335, 0.097), boxAt(0.146, 0.112, 0.332, 0.1)];
const tankAt = (z: number, r: number): TubeSection => ({ z, halfW: r, cy: 0.205, hUp: r, hDown: r, power: 2.3 });
const TANK = [tankAt(-0.296, 0.045), tankAt(-0.288, 0.08), tankAt(-0.275, 0.097), tankAt(-0.26, 0.1), tankAt(0.11, 0.1), tankAt(0.125, 0.097), tankAt(0.138, 0.08), tankAt(0.146, 0.045)];

export function truckShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial, steel: MeshStandardMaterial): void {
  const cab = LoftSurface.tube(CAB);
  g.add(named(new Mesh(cab.build(alongs(CAB, 6), 20, true), paint), 'Body'));
  g.add(named(new Mesh(LoftSurface.tube(BAND).build(alongs(BAND, 4), 20, true), glass), 'Glasshouse'));
  const visor = named(new Mesh(bevelBox(0.19, 0.005, 0.024, 0.0015), paint), 'BodyVisor');
  visor.position.set(0, 0.262, 0.318);
  g.add(visor);
  const nudge = new Vector3();
  for (const side of SIDES) {
    const out = (point: Vector3, by = 0.0012): Vector3 => point.clone().add(nudge.set(side * by, 0, 0));
    g.add(bar(new Vector3(side * 0.094, 0.183, 0.3175), new Vector3(side * 0.1, 0.255, 0.313), 0.0035, paint, 'BodyPillarA'));
    // The door above the front wheel: its shuts and a handle.
    for (const z of [0.296, 0.196]) g.add(bar(out(skinAt(cab, z, 0.172, side)), out(skinAt(cab, z, 0.105, side)), 0.0008, rubber, 'DoorSeam'));
    const handle = named(new Mesh(bevelBox(0.0026, 0.003, 0.014, 0.0008), rubber), 'DoorHandle');
    handle.position.copy(out(skinAt(cab, 0.212, 0.15, side)));
    g.add(handle);
    // Mirrors hang from arms off the A pillars.
    g.add(bar(skinAt(cab, 0.292, 0.238, side), new Vector3(side * 0.127, 0.238, 0.292), 0.0012, rubber, 'MirrorArm'));
    const mirror = named(new Mesh(new SphereGeometry(1, 6, 4), paint), 'BodyMirror');
    mirror.scale.set(0.004, 0.018, 0.009);
    mirror.position.set(side * 0.128, 0.224, 0.292);
    const head = named(new Mesh(new SphereGeometry(1, 8, 6), lens), 'Headlamp');
    head.scale.set(0.02, 0.011, 0.008);
    head.position.set(side * 0.072, 0.085, 0.3165);
    const rear = named(new Mesh(new SphereGeometry(1, 8, 6), tail), 'TailLamp');
    rear.scale.set(0.014, 0.01, 0.005);
    rear.position.set(side * 0.085, 0.072, -0.2985);
    // A chassis rail, and a mudguard over the rear wheels under the load.
    const rail = named(new Mesh(bevelBox(0.012, 0.032, 0.5, 0.002), steel), 'ChassisRail');
    rail.position.set(side * 0.055, 0.078, -0.045);
    const guard = named(new Mesh(bevelBox(0.044, 0.008, 0.21, 0.002), rubber), 'Mudguard');
    guard.position.set(side * 0.09, 0.093, -0.195);
    g.add(mirror, head, rear, rail, guard);
    archedWheel(g, { side, z: FRONT_AXLE, radius: WHEEL_RADIUS, tyreWidth: 0.03, wheelX: 0.09, wellRadius: 0.056, wellX: 0.108, lipX: 0.1135, tag: side < 0 ? 'FL' : 'FR', halfWell: true }, paint, rubber);
    for (const z of REAR_AXLES) plainWheel(g, side, z, WHEEL_RADIUS, 0.04, 0.088, rubber, `R${side < 0 ? 'L' : 'R'}`);
  }
  const tank = named(new Mesh(new CylinderGeometry(0.026, 0.026, 0.1, 12), steel), 'FuelTank');
  tank.rotation.x = Math.PI / 2;
  tank.position.set(0.08, 0.052, 0.05);
  const battery = named(new Mesh(bevelBox(0.05, 0.04, 0.07, 0.003), rubber), 'BatteryBox');
  battery.position.set(-0.08, 0.05, 0.05);
  g.add(tank, battery);
  for (const z of [-0.28, -0.05, 0.18]) {
    const cross = named(new Mesh(bevelBox(0.11, 0.02, 0.012, 0.002), steel), 'CrossMember');
    cross.position.set(0, 0.078, z);
    g.add(cross);
  }
  const grille = named(new Mesh(bevelBox(0.15, 0.045, 0.006, 0.003), rubber), 'Grille');
  grille.position.set(0, 0.125, 0.3165);
  const front = named(new Mesh(bevelBox(0.226, 0.026, 0.016, 0.005), rubber), 'BumperFront');
  front.position.set(0, 0.052, 0.312);
  const back = named(new Mesh(bevelBox(0.2, 0.014, 0.012, 0.003), rubber), 'BumperRear');
  back.position.set(0, 0.05, -0.298);
  g.add(grille, front, back);
  mergeByMaterial(
    g,
    new Map<Material, string>([
      [paint, 'Body'],
      [glass, 'Glasshouse'],
      [rubber, 'Trim'],
      [steel, 'Chassis'],
      [lens, 'Headlamps'],
      [tail, 'TailLamps'],
      [hub, 'Hubs'],
    ]),
  );
}

/** The three loads as Style0 (box), Style1 (flatbed) and Style2 (tanker); only the first shows. */
export function truckLoads(g: Group, paint: MeshStandardMaterial, rubber: MeshStandardMaterial, steel: MeshStandardMaterial): void {
  const looks: [string, (s: Group) => void][] = [
    ['BodyBox', (s) => {
      s.add(named(new Mesh(LoftSurface.tube(BOX).build(alongs(BOX, 2), 20, true), paint), 'BodyBox'));
      s.add(bar(new Vector3(0, 0.105, -0.2972), new Vector3(0, 0.33, -0.2972), 0.0008, rubber, 'DoorSeam'));
      for (const side of SIDES) for (const y of [0.115, 0.2]) s.add(bar(new Vector3(side * 0.1162, y, -0.288), new Vector3(side * 0.1162, y, 0.138), 0.0012, rubber, 'RubRail'));
    }],
    ['BodyDeck', (s) => {
      const deck = named(new Mesh(bevelBox(0.23, 0.018, 0.44, 0.003), paint), 'BodyDeck');
      deck.position.set(0, 0.104, -0.075);
      const headboard = named(new Mesh(bevelBox(0.23, 0.09, 0.012, 0.003), paint), 'BodyHeadboard');
      headboard.position.set(0, 0.158, 0.138);
      s.add(deck, headboard);
      for (const side of SIDES) {
        for (const z of [-0.28, -0.15, -0.02, 0.1]) {
          const stake = named(new Mesh(bevelBox(0.006, 0.032, 0.008, 0.001), steel), 'Stake');
          stake.position.set(side * 0.112, 0.129, z);
          s.add(stake);
        }
        s.add(bar(new Vector3(side * 0.1155, 0.114, -0.294), new Vector3(side * 0.1155, 0.114, 0.13), 0.0012, rubber, 'DeckRail'));
      }
    }],
    ['BodyTank', (s) => {
      s.add(named(new Mesh(LoftSurface.tube(TANK).build(alongs(TANK, 4), 20, true), paint), 'BodyTank'));
      for (const z of [-0.2, -0.05, 0.08]) {
        const saddle = named(new Mesh(bevelBox(0.17, 0.03, 0.024, 0.003), steel), 'Saddle');
        saddle.position.set(0, 0.102, z);
        s.add(saddle);
      }
      const walkway = named(new Mesh(bevelBox(0.05, 0.005, 0.34, 0.001), rubber), 'Walkway');
      walkway.position.set(0, 0.306, -0.075);
      const hatch = named(new Mesh(new CylinderGeometry(0.02, 0.022, 0.01, 12), rubber), 'Manhole');
      hatch.position.set(0, 0.308, -0.17);
      s.add(walkway, hatch);
    }],
  ];
  looks.forEach(([bodyName, build], i) => {
    const s = new Group();
    s.name = `Style${i}`;
    build(s);
    mergeByMaterial(s, new Map<Material, string>([[paint, bodyName], [rubber, 'Trim'], [steel, 'Steel']]));
    s.visible = i === 0;
    g.add(s);
  });
}
