/**
 * A small cuddy-cabin boat at 1:10: a lofted hull with a sheer line rising to
 * the bow and a flat transom, a rounded cabin with a glass band, a dark
 * cockpit sole let into the deck, two seats, rails along the gunwales, cleats
 * and an outboard on the transom. Generic previs, bow along +Z, keel on y 0,
 * 0.55 m long with the outboard. Painted parts are named Body*.
 */
import { CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import type { Material } from '@iwsdk/core';
import { alignSpan, bevelBox, LoftSurface, type TubeSection } from './hardsurface.js';
import { alongs, bar, hub, mergeByMaterial, named } from './vehicle.js';

const SIDES = [-1, 1] as const;

/** A hull station: widest just under the gunwale, the bottom rounding to the keel. */
const hullAt = (z: number, halfW: number, top: number, bottom: number, power: number): TubeSection => ({ z, halfW, cy: top - 0.02, hUp: 0.02, hDown: top - 0.02 - bottom, power });
const HULL = [
  hullAt(-0.252, 0.07, 0.085, 0.02, 3),
  hullAt(-0.245, 0.085, 0.09, 0.005, 3),
  hullAt(-0.15, 0.09, 0.092, 0, 2.8),
  hullAt(0, 0.09, 0.093, 0, 2.6),
  hullAt(0.12, 0.082, 0.1, 0.004, 2.3),
  hullAt(0.2, 0.058, 0.11, 0.014, 2),
  hullAt(0.245, 0.026, 0.12, 0.035, 1.8),
  hullAt(0.26, 0.006, 0.123, 0.05, 1.6),
];
const cabinAt = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.11, hUp: top - 0.11, hDown: 0.02, power: 3.5 });
const CABIN = [cabinAt(-0.035, 0.066, 0.145), cabinAt(-0.025, 0.07, 0.152), cabinAt(0.06, 0.068, 0.15), cabinAt(0.11, 0.058, 0.14), cabinAt(0.135, 0.044, 0.122), cabinAt(0.142, 0.03, 0.11)];
const paneAt = (z: number, halfW: number, top: number): TubeSection => ({ z, halfW, cy: 0.13, hUp: top - 0.13, hDown: 0.012, power: 3.5 });
const PANE = [paneAt(-0.02, 0.0712, 0.147), paneAt(0.06, 0.0692, 0.145), paneAt(0.11, 0.0595, 0.136), paneAt(0.133, 0.0472, 0.1215), paneAt(0.1385, 0.038, 0.113)];
/** The rail along each gunwale, following the sheer up to the bow. */
const SHEER: [number, number, number][] = [[0.086, 0.094, -0.23], [0.09, 0.096, 0], [0.082, 0.103, 0.12], [0.058, 0.113, 0.2]];

export function boatShell(g: Group, paint: MeshStandardMaterial, glass: MeshStandardMaterial, rubber: MeshStandardMaterial): void {
  g.add(named(new Mesh(LoftSurface.tube(HULL).build(alongs(HULL, 14), 18, true), paint), 'Body'));
  g.add(named(new Mesh(LoftSurface.tube(CABIN).build(alongs(CABIN, 5), 16, true), paint), 'BodyCabin'));
  g.add(named(new Mesh(LoftSurface.tube(PANE).build(alongs(PANE, 4), 16, true), glass), 'Glasshouse'));
  const sole = named(new Mesh(bevelBox(0.13, 0.01, 0.19, 0.003), rubber), 'CockpitSole');
  sole.position.set(0, 0.09, -0.135);
  g.add(sole);
  for (const side of SIDES) {
    for (let i = 0; i < SHEER.length - 1; i += 1) {
      const [ax, ay, az] = SHEER[i];
      const [bx, by, bz] = SHEER[i + 1];
      g.add(bar(new Vector3(side * ax, ay, az), new Vector3(side * bx, by, bz), 0.0018, hub, 'Rail'));
    }
    const seat = named(new Mesh(bevelBox(0.032, 0.018, 0.03, 0.004), rubber), 'Seat');
    seat.position.set(side * 0.035, 0.104, -0.07);
    const back = named(new Mesh(bevelBox(0.032, 0.03, 0.008, 0.003), rubber), 'SeatBack');
    back.position.set(side * 0.035, 0.115, -0.088);
    g.add(seat, back);
    for (const [y, z] of [[0.095, -0.2], [0.102, 0.11]]) {
      const cleat = named(new Mesh(bevelBox(0.004, 0.004, 0.014, 0.001), hub), 'Cleat');
      cleat.position.set(side * 0.07, y, z);
      g.add(cleat);
    }
  }
  // The outboard: a cowl over the transom and a leg down into the water.
  const cowl = named(new Mesh(bevelBox(0.04, 0.045, 0.045, 0.008), rubber), 'OutboardCowl');
  cowl.position.set(0, 0.11, -0.264);
  const leg = named(new Mesh(new CylinderGeometry(0.005, 0.007, 1, 8), rubber), 'OutboardLeg');
  leg.scale.y = alignSpan(leg, new Vector3(0, 0.09, -0.266), new Vector3(0, 0.012, -0.27));
  g.add(cowl, leg);
  mergeByMaterial(
    g,
    new Map<Material, string>([
      [paint, 'Body'],
      [glass, 'Glasshouse'],
      [rubber, 'Trim'],
      [hub, 'Fittings'],
    ]),
  );
}
