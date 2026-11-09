/**
 * A generic road motorbike at 1:10: tank, seat and tail cowl as lofts in bare
 * basswood, an air-cooled engine with a finned barrel, raked forks, spoked wheels,
 * bars and a low exhaust. Nose along +Z, tyres on y 0, 0.27 m long.
 * The painted bodywork is one mesh named Body.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, TorusGeometry, Vector3 } from '@iwsdk/core';
import { alignSpan, bevelBox } from './hardsurface.js';
import type { Object3D } from '@iwsdk/core';
import { BEAD, Kit, SIDES, ball, limb, loft, sec, v } from './kit.js';
import { hub, lens, tail } from './vehicle.js';

const R = 0.032;
const FRONT = 0.11;
const REAR = -0.095;
/** Fork line, from the front axle up the rake to the top clamp. */
const forkAt = (y: number, x = 0): Vector3 => v(x, y, FRONT - ((y - R) / 0.082) * 0.038);

/** An open-ended tube from a to b: its ends always butt into another part, so caps would only cost triangles. */
function pipe(a: Vector3, b: Vector3, ra: number, rb: number, radial = 5): Mesh {
  const mesh = new Mesh(new CylinderGeometry(rb, ra, a.distanceTo(b), radial, 1, true));
  alignSpan(mesh, a, b);
  return mesh;
}

/** Pipes through a list of points, with a small bead at each bend. */
function run(points: Vector3[], radius: number): Object3D[] {
  const out: Object3D[] = [];
  for (let i = 0; i < points.length - 1; i += 1) out.push(pipe(points[i], points[i + 1], radius, radius));
  for (let i = 1; i < points.length - 1; i += 1) out.push(ball(points[i], radius, radius, radius, BEAD));
  return out;
}

/** A spoked wheel standing in the YZ plane at (0, R, z). */
function wheel(kit: Kit, rubber: MeshStandardMaterial, z: number, disc: boolean): void {
  const centre = v(0, R, z);
  const tyreGeometry = new TorusGeometry(R - 0.0058, 0.0058, 5, 14);
  // Turn the ring so a vertex sits at the bottom and the tyre touches the floor.
  tyreGeometry.rotateZ(Math.PI / 14);
  tyreGeometry.rotateY(Math.PI / 2);
  const tyre = new Mesh(tyreGeometry);
  tyre.position.copy(centre);
  kit.put('Trim', rubber, tyre);
  const rimGeometry = new TorusGeometry(0.0195, 0.0015, 3, 12);
  rimGeometry.rotateY(Math.PI / 2);
  const rim = new Mesh(rimGeometry);
  rim.position.copy(centre);
  const boss = new Mesh(new CylinderGeometry(0.0062, 0.0062, 0.016, 6));
  boss.rotation.z = Math.PI / 2;
  boss.position.copy(centre);
  kit.put('Metal', hub, rim, boss);
  for (let i = 0; i < 5; i += 1) {
    const a = (i / 5) * Math.PI * 2 + (disc ? 0.3 : 0);
    const dir = v(0, Math.sin(a), Math.cos(a));
    const spoke = new Mesh(new BoxGeometry(0.0016, 1, 0.0026));
    spoke.scale.y = alignSpan(spoke, centre.clone().addScaledVector(dir, 0.005), centre.clone().addScaledVector(dir, 0.0195), v(1, 0, 0));
    kit.put('Metal', hub, spoke);
  }
  if (disc) {
    const d = new Mesh(new CylinderGeometry(0.014, 0.014, 0.0012, 8));
    d.rotation.z = Math.PI / 2;
    d.position.set(0.0075, R, z);
    kit.put('Metal', hub, d);
  }
}

export function buildMotorbike(primer: MeshStandardMaterial, rubber: MeshStandardMaterial): Group {
  const g = new Group();
  g.name = 'Motorbike';
  const kit = new Kit();
  wheel(kit, rubber, FRONT, true);
  wheel(kit, rubber, REAR, false);

  // Bodywork: a tank swelling over the engine, a tail cowl over the rear wheel,
  // a mudguard over the front tyre and the lamp shell.
  kit.put('Body', primer,
    loft([sec(-0.01, 0.098, 0.009, 0.006), sec(0.004, 0.101, 0.016, 0.011, 0.012), sec(0.034, 0.104, 0.019, 0.012, 0.014), sec(0.06, 0.104, 0.016, 0.009, 0.012), sec(0.073, 0.103, 0.008, 0.005, 0.007)], 8, 1).mesh,
    loft([sec(-0.123, 0.1, 0.004, 0.003), sec(-0.112, 0.097, 0.009, 0.006), sec(-0.09, 0.091, 0.013, 0.009), sec(-0.062, 0.087, 0.014, 0.01)], 6, 1).mesh,
    ball(v(0, 0.101, 0.096), 0.0115, 0.0115, 0.0095));
  const guardGeometry = new TorusGeometry(R + 0.005, 0.0035, 4, 10, 1.5);
  guardGeometry.rotateZ(Math.PI / 2 - 0.4);
  guardGeometry.rotateY(Math.PI / 2);
  guardGeometry.scale(3, 1, 1);
  const guard = new Mesh(guardGeometry);
  guard.position.set(0, R, FRONT);
  kit.put('Body', primer, guard);
  kit.put('Headlamp', lens, ball(v(0, 0.101, 0.104), 0.0088, 0.0088, 0.0035, BEAD));
  kit.put('TailLamp', tail, ball(v(0, 0.099, -0.124), 0.005, 0.003, 0.0022, BEAD));

  // The seat, dark, sitting down onto the tail and the back of the tank.
  kit.put('Trim', rubber, loft([sec(-0.09, 0.097, 0.007, 0.004), sec(-0.072, 0.099, 0.013, 0.006), sec(-0.032, 0.097, 0.015, 0.007), sec(-0.004, 0.098, 0.011, 0.006)], 8, 1).mesh);

  // Frame: backbone, down tube and cradle in black, the swingarm and seat rails too.
  kit.put('Trim', rubber,
    pipe(forkAt(0.106), v(0, 0.092, -0.03), 0.004, 0.0036, 5),
    pipe(forkAt(0.086), v(0, 0.034, 0.036), 0.0036, 0.0032, 5),
    pipe(v(0, 0.034, 0.036), v(0, 0.03, -0.022), 0.0032, 0.0032, 5),
    pipe(v(0, 0.092, -0.03), v(0, 0.03, -0.022), 0.0034, 0.0032, 5));
  for (const s of SIDES) {
    kit.put('Trim', rubber,
      pipe(v(s * 0.0085, 0.044, -0.024), v(s * 0.0085, R, REAR), 0.0032, 0.0026, 5),
      pipe(v(s * 0.007, 0.092, -0.03), v(s * 0.007, 0.091, -0.1), 0.0022, 0.0022, 5),
      pipe(v(s * 0.006, 0.03, -0.012), v(s * 0.02, 0.03, -0.014), 0.0018, 0.0018, 5));
    // Rear shocks, forks and the bar ends in metal.
    kit.put('Metal', hub,
      pipe(v(s * 0.0095, 0.04, -0.074), v(s * 0.0095, 0.09, -0.058), 0.0024, 0.0024, 5),
      pipe(forkAt(R, s * 0.0085), forkAt(0.07, s * 0.0085), 0.0036, 0.0032, 5),
      pipe(forkAt(0.07, s * 0.0085), forkAt(0.114, s * 0.0085), 0.0026, 0.0026, 5));
    kit.put('Trim', rubber, limb(v(s * 0.0245, 0.1225, 0.063), v(s * 0.0285, 0.1235, 0.061), 0.0028, 0.0028, 6));
  }
  kit.put('Metal', hub,
    pipe(forkAt(0.104, -0.013), forkAt(0.104, 0.013), 0.003, 0.003, 5),
    pipe(forkAt(0.088, -0.013), forkAt(0.088, 0.013), 0.003, 0.003, 5),
    ...run([v(-0.025, 0.1225, 0.063), v(-0.009, 0.1175, 0.071), v(0.009, 0.1175, 0.071), v(0.025, 0.1225, 0.063)], 0.0018));
  kit.put('Trim', rubber, ball(forkAt(0.118).add(v(0, 0, 0.004)), 0.007, 0.004, 0.005, BEAD));

  // Engine: crankcase, a barrel leaning forward with cooling fins, a round side cover.
  const crank = new Mesh(bevelBox(0.026, 0.03, 0.052, 0.004));
  crank.position.set(0, 0.047, 0.004);
  const barrel = new Group();
  barrel.position.set(0, 0.076, 0.021);
  barrel.rotation.x = 0.32;
  barrel.add(new Mesh(new CylinderGeometry(0.0105, 0.0115, 0.034, 8)));
  for (const y of [-0.011, -0.0037, 0.0037, 0.011]) {
    const fin = new Mesh(new BoxGeometry(0.032, 0.0022, 0.03));
    fin.position.y = y;
    barrel.add(fin);
  }
  const sideCover = new Mesh(new CylinderGeometry(0.012, 0.012, 0.004, 10));
  sideCover.rotation.z = Math.PI / 2;
  sideCover.position.set(-0.0145, 0.044, 0.01);
  kit.put('Metal', hub, crank, barrel, sideCover);

  // Exhaust: a header pipe from the barrel down and back, then the silencer.
  kit.put('Metal', hub,
    ...run([v(0.004, 0.068, 0.036), v(0.012, 0.036, 0.046), v(0.019, 0.022, 0.004), v(0.022, 0.03, -0.055)], 0.0026),
    limb(v(0.022, 0.031, -0.05), v(0.022, 0.05, -0.116), 0.0056, 0.0046, 8));

  kit.build(g);
  return g;
}
