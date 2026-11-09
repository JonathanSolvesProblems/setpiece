/**
 * More set dressing at 1:10: vehicles, street furniture and ruins. Generic shapes,
 * no badges, no lettering. Origin at floor contact, front along +Z, Y up.
 *
 * Meshes that take the user's colour start with 'Body' and share the grey primer;
 * glass, tyres, lamps and the rest keep their own material. Rotors carry
 * userData.idle and sit on their own pivot groups. Each prop is merged to one mesh
 * per material, so it costs a few draw calls.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
} from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
import { buildRock } from './lib/nature.js';
import { BEAD, Kit, SIDES, ball, idleGroup, limb, loft, plate, sec, v } from './lib/kit.js';

const primer = new MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.72 });
const glass = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3 });
const rubber = new MeshStandardMaterial({ color: 0x17191c, roughness: 0.9 });
const steel = new MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.45, metalness: 0.6 });
const trim = new MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.7 });
const headlamp = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.9 });
const taillamp = new MeshStandardMaterial({ color: 0xb3202a, emissive: 0x8a0f17, emissiveIntensity: 0.6 });
const beacon = new MeshStandardMaterial({ color: 0x9fffe0, emissive: 0x4dffc4, emissiveIntensity: 0.9 });
const concrete = new MeshStandardMaterial({ color: 0x9b9a94, roughness: 0.95 });
const stone = new MeshStandardMaterial({ color: 0x8e877c, roughness: 0.92 });
const timber = new MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
const safetyOrange = new MeshStandardMaterial({ color: 0xff6a13, roughness: 0.6 });
const reflective = new MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.35 });

/** A box with soft edges, centred at (x, y, z). */
function block(w: number, h: number, d: number, x: number, y: number, z: number, bevel = 0.003): Mesh {
  // Small parts read the same without a bevel and cost 12 triangles instead of about 90.
  const mesh = new Mesh(bevel <= 0.001 ? new BoxGeometry(w, h, d) : bevelBox(w, h, d, bevel));
  mesh.position.set(x, y, z);
  return mesh;
}

/** A side profile (x along the length, nose at +x) extruded across the width, nose turned to +Z. */
function side(shape: Shape, width: number, bevel = 0.005): Mesh {
  const depth = width - 2 * bevel;
  const geometry = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -depth / 2);
  geometry.rotateY(-Math.PI / 2);
  return new Mesh(geometry);
}

/** A closed outline from points. */
function outline(points: [number, number][]): Shape {
  const s = new Shape();
  s.moveTo(points[0][0], points[0][1]);
  for (const [x, y] of points.slice(1)) s.lineTo(x, y);
  s.closePath();
  return s;
}

/** Tyres and hubs on both sides at each axle. */
function wheels(kit: Kit, halfTrack: number, axles: number[], radius: number, tyre: number): void {
  for (const s of SIDES) {
    for (const z of axles) {
      const tyreMesh = new Mesh(new CylinderGeometry(radius, radius, tyre, 14));
      tyreMesh.rotation.z = Math.PI / 2;
      tyreMesh.position.set(s * halfTrack, radius, z);
      const hub = new Mesh(new CylinderGeometry(radius * 0.5, radius * 0.5, tyre + 0.002, 10));
      hub.rotation.z = Math.PI / 2;
      hub.position.copy(tyreMesh.position);
      kit.put('Tyres', rubber, tyreMesh);
      kit.put('Hubs', steel, hub);
    }
  }
}

/** One of several looks, hidden unless it is the first. */
function style(index: number, build: (kit: Kit) => void): Group {
  const group = new Group();
  group.name = `Style${index}`;
  const kit = new Kit();
  build(kit);
  kit.build(group);
  group.visible = index === 0;
  return group;
}

/** A cab-forward box truck on a ladder chassis; the load behind the cab is one of three styles. */
function truck(): Group {
  const g = new Group();
  g.name = 'Truck';
  const width = 0.22;
  const kit = new Kit();
  const cab = new Shape();
  cab.moveTo(0.17, 0.045);
  cab.lineTo(0.17, 0.275);
  cab.lineTo(0.255, 0.275);
  cab.quadraticCurveTo(0.275, 0.273, 0.28, 0.25);
  cab.lineTo(0.3, 0.17);
  cab.lineTo(0.31, 0.15);
  cab.lineTo(0.31, 0.06);
  cab.lineTo(0.305, 0.045);
  cab.closePath();
  kit.put('BodyCab', primer, side(cab, width));
  kit.put('Glass', glass, side(outline([[0.2, 0.175], [0.2, 0.258], [0.27, 0.258], [0.288, 0.25], [0.308, 0.175]]), width + 0.001, 0));
  kit.put('Chassis', steel, block(0.14, 0.025, 0.58, 0, 0.06, -0.01));
  kit.put('Trim', trim, block(0.23, 0.03, 0.02, 0, 0.055, 0.314), block(0.12, 0.05, 0.004, 0, 0.11, 0.311, 0.001));
  for (const s of SIDES) {
    kit.put('Headlamps', headlamp, block(0.035, 0.018, 0.006, s * 0.08, 0.09, 0.312, 0.001));
    kit.put('Taillamps', taillamp, block(0.02, 0.012, 0.006, s * 0.09, 0.072, -0.302, 0.001));
  }
  wheels(kit, 0.093, [0.245, -0.15, -0.24], 0.045, 0.03);
  kit.build(g);
  g.add(
    style(0, (k) => {
      k.put('BodyBox', primer, block(0.23, 0.245, 0.43, 0, 0.2075, -0.075, 0.008));
      k.put('Trim', trim, block(0.004, 0.225, 0.003, 0, 0.2075, -0.291, 0.001));
    }),
    style(1, (k) => {
      k.put('BodyDeck', primer, block(0.23, 0.018, 0.44, 0, 0.094, -0.08), block(0.23, 0.07, 0.012, 0, 0.138, 0.135));
      for (const s of SIDES) for (const z of [-0.28, -0.15, -0.02, 0.1]) k.put('Stakes', steel, block(0.006, 0.03, 0.008, s * 0.112, 0.118, z, 0.001));
    }),
    style(2, (k) => {
      k.put('BodyTank', primer, loft([
        sec(-0.295, 0.19, 0.04, 0.04),
        sec(-0.285, 0.19, 0.08, 0.08),
        sec(-0.27, 0.19, 0.095, 0.095),
        sec(0.1, 0.19, 0.095, 0.095),
        sec(0.115, 0.19, 0.08, 0.08),
        sec(0.125, 0.19, 0.04, 0.04),
      ], 20, 1).mesh);
      for (const z of [-0.2, -0.05, 0.07]) k.put('Saddles', steel, block(0.16, 0.03, 0.02, 0, 0.087, z));
      k.put('Saddles', steel, block(0.04, 0.006, 0.36, 0, 0.288, -0.085, 0.001));
    }),
  );
  return g;
}

/** A pickup: bonnet, crew cab, open bed with a tailgate. */
function pickup(): Group {
  const g = new Group();
  g.name = 'Pickup';
  const width = 0.19;
  const kit = new Kit();
  const cab = new Shape();
  cab.moveTo(-0.075, 0.045);
  cab.lineTo(-0.075, 0.175);
  cab.quadraticCurveTo(-0.07, 0.18, -0.06, 0.18);
  cab.lineTo(0.015, 0.18);
  cab.lineTo(0.07, 0.128);
  cab.lineTo(0.215, 0.12);
  cab.quadraticCurveTo(0.245, 0.116, 0.248, 0.095);
  cab.lineTo(0.25, 0.06);
  cab.lineTo(0.245, 0.045);
  cab.closePath();
  kit.put('BodyShell', primer,
    side(cab, width),
    block(width, 0.045, 0.17, 0, 0.0675, -0.165),
    block(0.012, 0.042, 0.17, -0.089, 0.104, -0.165),
    block(0.012, 0.042, 0.17, 0.089, 0.104, -0.165),
    block(width, 0.042, 0.012, 0, 0.104, -0.244));
  kit.put('Glass', glass, side(outline([[-0.068, 0.125], [-0.068, 0.172], [0.029, 0.172], [0.08, 0.126]]), width + 0.001, 0));
  kit.put('Trim', trim, block(0.2, 0.022, 0.016, 0, 0.058, 0.252), block(0.2, 0.02, 0.014, 0, 0.058, -0.252));
  for (const s of SIDES) {
    kit.put('Headlamps', headlamp, block(0.03, 0.014, 0.006, s * 0.068, 0.095, 0.249, 0.001));
    kit.put('Taillamps', taillamp, block(0.008, 0.025, 0.006, s * 0.085, 0.1, -0.251, 0.001));
  }
  wheels(kit, 0.083, [0.165, -0.165], 0.036, 0.026);
  kit.build(g);
  return g;
}

/** A single-deck city bus: one rounded box, a window band, doors on the kerb side. */
function bus(): Group {
  const g = new Group();
  g.name = 'Bus';
  const kit = new Kit();
  const shell = new Mesh(bevelBox(0.25, 0.27, 0.75, 0.02, 0.03));
  shell.position.set(0, 0.175, 0);
  kit.put('BodyShell', primer, shell, block(0.14, 0.025, 0.18, 0, 0.322, -0.1, 0.006));
  kit.put('Glass', glass,
    block(0.254, 0.075, 0.6, 0, 0.225, -0.04, 0.004),
    block(0.22, 0.13, 0.006, 0, 0.21, 0.375, 0.002),
    block(0.004, 0.2, 0.06, -0.126, 0.145, 0.29, 0.001),
    block(0.004, 0.2, 0.06, -0.126, 0.145, -0.02, 0.001));
  kit.put('Trim', trim,
    block(0.25, 0.03, 0.015, 0, 0.055, 0.377),
    block(0.25, 0.03, 0.015, 0, 0.055, -0.377),
    block(0.16, 0.025, 0.004, 0, 0.29, 0.376, 0.001));
  for (const s of SIDES) {
    kit.put('Headlamps', headlamp, block(0.03, 0.016, 0.006, s * 0.09, 0.085, 0.376, 0.001));
    kit.put('Taillamps', taillamp, block(0.016, 0.04, 0.006, s * 0.105, 0.1, -0.376, 0.001));
  }
  wheels(kit, 0.107, [0.24, -0.22], 0.05, 0.035);
  kit.build(g);
  return g;
}

/** Two rotor blades crossed at the hub, laid in the plane normal to the spin axis. */
function rotorBlades(kit: Kit, diameter: number, chord: number, axis: 'x' | 'y', count: number): void {
  for (let i = 0; i < count; i += 1) {
    const blade = new Mesh(new BoxGeometry(diameter / 2, 0.003, chord));
    const a = (i / count) * Math.PI * 2;
    if (axis === 'y') {
      blade.position.set((Math.cos(a) * diameter) / 4, 0, (Math.sin(a) * diameter) / 4);
      blade.rotation.y = -a;
    } else {
      blade.rotation.set(a, 0, Math.PI / 2);
      blade.position.set(0, (Math.cos(a) * diameter) / 4, (Math.sin(a) * diameter) / 4);
    }
    kit.put('Blades', trim, blade);
  }
}

/** A light helicopter on skids; main and tail rotors spin on their own pivots. */
function helicopter(): Group {
  const g = new Group();
  g.name = 'Helicopter';
  const kit = new Kit();
  kit.put('BodyFuselage', primer, loft([
    sec(0.3, 0.115, 0.02, 0.02, 0.02),
    sec(0.27, 0.12, 0.05, 0.05, 0.045),
    sec(0.2, 0.125, 0.065, 0.07, 0.06),
    sec(0.08, 0.13, 0.07, 0.075, 0.065),
    sec(-0.05, 0.14, 0.06, 0.065, 0.05),
    sec(-0.12, 0.16, 0.03, 0.03, 0.022),
    sec(-0.2, 0.17, 0.014, 0.014),
    sec(-0.44, 0.175, 0.01, 0.01),
    sec(-0.455, 0.177, 0.008, 0.009),
  ], 14).mesh, block(0.09, 0.04, 0.16, 0, 0.215, -0.005, 0.01), block(0.12, 0.006, 0.03, 0, 0.175, -0.38, 0.002),
  side(outline([[-0.43, 0.17], [-0.458, 0.17], [-0.48, 0.255], [-0.462, 0.26], [-0.44, 0.19]]), 0.008, 0.002));
  kit.put('Glass', glass, loft([
    sec(0.292, 0.13, 0.03, 0.03, 0.012),
    sec(0.25, 0.14, 0.056, 0.058, 0.02),
    sec(0.17, 0.15, 0.068, 0.055, 0.02),
    sec(0.1, 0.155, 0.068, 0.048, 0.02),
  ], 14).mesh);
  kit.put('Mast', steel, limb(v(0, 0.23, 0.02), v(0, 0.258, 0.02), 0.01, 0.008));
  for (const s of SIDES) {
    kit.put('Skids', steel,
      limb(v(s * 0.075, 0.006, -0.12), v(s * 0.075, 0.006, 0.17), 0.006, 0.006),
      limb(v(s * 0.075, 0.006, 0.17), v(s * 0.075, 0.022, 0.2), 0.006, 0.006),
      ball(v(s * 0.075, 0.006, 0.17), 0.006),
      limb(v(s * 0.045, 0.08, 0.1), v(s * 0.075, 0.006, 0.1), 0.005, 0.005),
      limb(v(s * 0.045, 0.085, -0.06), v(s * 0.075, 0.006, -0.06), 0.005, 0.005));
  }
  kit.build(g);
  const main = idleGroup('MainRotor', v(0, 0.26, 0.02), { kind: 'spin', axis: 'y', amount: Math.PI * 2, rate: 18 });
  const mainKit = new Kit();
  mainKit.put('Hub', steel, ball(v(0, 0, 0), 0.014, 0.008, 0.014));
  rotorBlades(mainKit, 0.58, 0.022, 'y', 4);
  mainKit.build(main);
  const tail = idleGroup('TailRotor', v(0.012, 0.215, -0.455), { kind: 'spin', axis: 'x', amount: Math.PI * 2, rate: 30 });
  const tailKit = new Kit();
  tailKit.put('Hub', steel, limb(v(-0.008, 0, 0), v(0.006, 0, 0), 0.006, 0.006));
  rotorBlades(tailKit, 0.08, 0.012, 'x', 2);
  tailKit.build(tail);
  g.add(main, tail);
  return g;
}

/** A small cuddy-cabin runabout, keel on the floor, outboard on the transom. */
function boat(): Group {
  const g = new Group();
  g.name = 'Boat';
  const kit = new Kit();
  kit.put('BodyHull', primer, loft([
    sec(-0.23, 0.055, 0.085, 0.03, 0.05, 0, 3),
    sec(-0.15, 0.055, 0.092, 0.03, 0.055, 0, 2.6),
    sec(0, 0.058, 0.09, 0.03, 0.058, 0, 2.3),
    sec(0.12, 0.065, 0.07, 0.03, 0.06, 0, 2),
    sec(0.2, 0.075, 0.04, 0.028, 0.06, 0, 1.8),
    sec(0.245, 0.085, 0.008, 0.012, 0.05, 0, 1.6),
  ], 16).mesh, block(0.13, 0.045, 0.13, 0, 0.1, 0.05, 0.008));
  kit.put('Glass', glass, plate(v(0, 0.118, -0.012), v(0, 0.152, -0.03), 0.13, 0.004, 0.001));
  kit.put('Trim', trim,
    block(0.06, 0.035, 0.04, 0, 0.1, -0.08, 0.005),
    block(0.04, 0.05, 0.045, 0, 0.115, -0.255, 0.008),
    limb(v(0, 0.095, -0.25), v(0, 0.012, -0.25), 0.007, 0.006));
  kit.build(g);
  return g;
}

/** A flying saucer standing on three short legs, glass dome on top, lamps round the rim. */
function saucer(): Group {
  const g = new Group();
  g.name = 'Saucer';
  const kit = new Kit();
  const profile = [
    [0.001, 0.035], [0.06, 0.037], [0.13, 0.052], [0.195, 0.074], [0.2, 0.08],
    [0.195, 0.087], [0.14, 0.103], [0.07, 0.112], [0.001, 0.114],
  ].map(([r, y]) => new Vector2(r, y));
  kit.put('BodyDisc', primer, new Mesh(new LatheGeometry(profile, 28)));
  const dome = new Mesh(new SphereGeometry(0.07, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2));
  dome.position.y = 0.108;
  dome.scale.y = 0.8;
  kit.put('Dome', glass, dome);
  kit.put('Trim', trim, ball(v(0, 0.038, 0), 0.05, 0.016, 0.05));
  for (let i = 0; i < 3; i += 1) {
    const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
    const dir = v(Math.cos(a), 0, Math.sin(a));
    const foot = dir.clone().multiplyScalar(0.13).setY(0.006);
    kit.put('Legs', steel, limb(dir.clone().multiplyScalar(0.085).setY(0.045), foot, 0.006, 0.005), limb(v(foot.x, 0, foot.z), v(foot.x, 0.006, foot.z), 0.016, 0.014, 12));
  }
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    kit.put('Lamps', beacon, ball(v(Math.cos(a) * 0.197, 0.08, Math.sin(a) * 0.197), 0.006, 0.006, 0.006, BEAD));
  }
  kit.build(g);
  return g;
}

/** An upright bicycle: diamond frame, round wheels, a kickstand so it stands. */
function bicycle(): Group {
  const g = new Group();
  g.name = 'Bicycle';
  const kit = new Kit();
  const rear = v(0, 0.033, -0.055);
  const front = v(0, 0.033, 0.057);
  const crank = v(0, 0.03, -0.005);
  const seat = v(0, 0.09, -0.025);
  const head = v(0, 0.088, 0.04);
  const headLow = v(0, 0.075, 0.044);
  for (const hub of [rear, front]) {
    const tyre = new Mesh(new TorusGeometry(0.03, 0.003, 6, 20));
    tyre.rotation.y = Math.PI / 2;
    tyre.position.copy(hub);
    kit.put('Tyres', rubber, tyre);
    kit.put('Hubs', steel, limb(hub.clone().setX(-0.006), hub.clone().setX(0.006), 0.004, 0.004));
  }
  const r = 0.0028;
  kit.put('BodyFrame', primer, limb(crank, seat, r, r), limb(seat, head, r, r), limb(crank, headLow, r, r), limb(headLow, head, r, r));
  for (const s of SIDES) {
    kit.put('BodyFrame', primer,
      limb(rear.clone().setX(s * 0.006), crank, 0.002, 0.002),
      limb(rear.clone().setX(s * 0.006), seat, 0.002, 0.002),
      limb(headLow, front.clone().setX(s * 0.006), 0.0022, 0.002));
  }
  kit.put('Trim', trim,
    ball(v(0, 0.097, -0.03), 0.007, 0.003, 0.014),
    limb(head, v(0, 0.1, 0.037), 0.002, 0.002),
    limb(v(-0.022, 0.1, 0.036), v(0.022, 0.1, 0.036), 0.0022, 0.0022),
    limb(crank.clone().setX(-0.012), crank.clone().setX(0.012), 0.002, 0.002),
    limb(v(-0.004, 0.026, -0.012), v(-0.02, 0, -0.03), 0.0018, 0.0015));
  kit.build(g);
  return g;
}

/** A generic tracked armoured vehicle; the turret is its own group so it can be turned. */
function tank(): Group {
  const g = new Group();
  g.name = 'Tank';
  const kit = new Kit();
  const track = outline([[-0.235, 0], [0.2, 0], [0.255, 0.05], [0.24, 0.085], [-0.24, 0.085], [-0.26, 0.045]]);
  for (const s of SIDES) {
    const run = side(track, 0.065, 0.004);
    run.position.set(s * 0.1175, 0.004, 0);
    kit.put('Tracks', rubber, run);
    for (const z of [-0.17, -0.085, 0, 0.085, 0.17]) {
      const wheel = new Mesh(new CylinderGeometry(0.026, 0.026, 0.069, 14));
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(s * 0.1175, 0.03, z);
      kit.put('RoadWheels', steel, wheel);
    }
  }
  kit.put('BodyHull', primer, block(0.3, 0.012, 0.5, 0, 0.091, 0), loft([
    sec(-0.245, 0.115, 0.085, 0.03, 0.03, 0, 4),
    sec(0.15, 0.115, 0.085, 0.03, 0.03, 0, 4),
    sec(0.22, 0.105, 0.085, 0.015, 0.02, 0, 4),
    sec(0.25, 0.1, 0.08, 0.006, 0.012, 0, 4),
  ], 16, 1).mesh);
  kit.build(g);
  const turret = new Group();
  turret.name = 'Turret';
  turret.position.set(0, 0.14, -0.03);
  const top = new Kit();
  top.put('BodyTurret', primer, loft([
    sec(-0.11, 0.03, 0.075, 0.028, 0.028, 0, 3),
    sec(-0.04, 0.03, 0.095, 0.03, 0.03, 0, 3),
    sec(0.05, 0.03, 0.095, 0.03, 0.03, 0, 3),
    sec(0.1, 0.028, 0.06, 0.02, 0.025, 0, 3),
    sec(0.115, 0.027, 0.035, 0.012, 0.018, 0, 3),
  ], 16, 1).mesh, block(0.05, 0.03, 0.03, 0, 0.03, 0.115, 0.004), limb(v(0, 0.03, 0.12), v(0, 0.03, 0.43), 0.009, 0.0075, 12), limb(v(0, 0.03, 0.39), v(0, 0.03, 0.43), 0.011, 0.011, 12));
  top.put('Hatch', steel, limb(v(0.03, 0.056, -0.03), v(0.03, 0.066, -0.03), 0.022, 0.02, 14));
  top.build(turret);
  g.add(turret);
  return g;
}

/** A concrete safety barrier with the sloped road-face profile. */
function barrier(): Group {
  const g = new Group();
  g.name = 'Barrier';
  const shape = outline([[-0.0305, 0], [0.0305, 0], [0.0305, 0.0075], [0.018, 0.025], [0.0075, 0.081], [-0.0075, 0.081], [-0.018, 0.025], [-0.0305, 0.0075]]);
  const geometry = new ExtrudeGeometry(shape, { depth: 0.296, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.0015, bevelSegments: 1 });
  geometry.translate(0, 0.002, -0.148);
  geometry.rotateY(Math.PI / 2);
  const kit = new Kit();
  kit.put('Block', concrete, new Mesh(geometry));
  kit.build(g);
  return g;
}

/** A two-storey house front built as a set flat: thin wall, real recesses, braces behind. */
function house(): Group {
  const g = new Group();
  g.name = 'House';
  const wall = outline([[-0.25, 0], [0.25, 0], [0.25, 0.43], [0, 0.55], [-0.25, 0.43]]);
  const openings: [number, number, number, number][] = [
    [0.08, 0.012, 0.14, 0.13],
    [-0.19, 0.06, -0.11, 0.14],
    [-0.05, 0.06, 0.03, 0.14],
    [-0.18, 0.25, -0.1, 0.34],
    [-0.04, 0.25, 0.04, 0.34],
    [0.1, 0.25, 0.18, 0.34],
    [-0.025, 0.44, 0.025, 0.49],
  ];
  for (const [x0, y0, x1, y1] of openings) wall.holes.push(outline([[x0, y0], [x0, y1], [x1, y1], [x1, y0]]));
  const facade = new ExtrudeGeometry(wall, { depth: 0.02, bevelEnabled: false });
  facade.translate(0, 0, -0.01);
  const kit = new Kit();
  kit.put('BodyFacade', primer, new Mesh(facade));
  openings.forEach(([x0, y0, x1, y1], i) => {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    if (i === 0) {
      kit.put('DoorLeaf', timber, block(x1 - x0, y1 - y0, 0.008, cx, cy, -0.004, 0.001));
      kit.put('Fittings', steel, ball(v(x1 - 0.01, cy, 0.001), 0.003, 0.003, 0.003, BEAD));
      return;
    }
    kit.put('Glass', glass, block(x1 - x0, y1 - y0, 0.004, cx, cy, -0.003, 0.0005));
    kit.put('Frames', trim, block(0.004, y1 - y0, 0.006, cx, cy, -0.001, 0.0005), block(x1 - x0, 0.004, 0.006, cx, cy, -0.001, 0.0005));
    kit.put('Sills', concrete, block(x1 - x0 + 0.016, 0.008, 0.018, cx, y0 - 0.004, 0.006, 0.001));
  });
  kit.put('Eaves', trim, plate(v(-0.262, 0.424, 0), v(0, 0.556, 0), 0.014, 0.03, 0.002), plate(v(0.262, 0.424, 0), v(0, 0.556, 0), 0.014, 0.03, 0.002));
  kit.put('Sills', concrete, block(0.51, 0.02, 0.026, 0, 0.01, 0.001, 0.002));
  for (const s of SIDES) {
    const brace = side(outline([[-0.01, 0], [-0.1, 0], [-0.01, 0.3]]), 0.012, 0.001);
    brace.position.set(s * 0.18, 0.001, 0);
    kit.put('Braces', timber, brace);
  }
  kit.build(g);
  return g;
}

/** A park bench: timber slats on two steel end frames with armrests. */
function bench(): Group {
  const g = new Group();
  g.name = 'Bench';
  const kit = new Kit();
  for (const s of SIDES) {
    const x = s * 0.08;
    kit.put('Frame', steel,
      plate(v(x, 0, 0.02), v(x, 0.045, 0.018), 0.006, 0.008, 0.001),
      plate(v(x, 0, -0.022), v(x, 0.09, -0.032), 0.006, 0.008, 0.001),
      plate(v(x, 0.042, 0.024), v(x, 0.042, -0.026), 0.006, 0.006, 0.001),
      plate(v(x, 0.066, 0.026), v(x, 0.066, -0.026), 0.008, 0.006, 0.001),
      plate(v(x, 0.042, 0.022), v(x, 0.066, 0.024), 0.006, 0.006, 0.001));
  }
  for (const z of [0.016, 0.004, -0.008, -0.02]) kit.put('Slats', timber, block(0.18, 0.005, 0.009, 0, 0.047, z, 0.001));
  for (const [y, z] of [[0.058, -0.028], [0.07, -0.03], [0.082, -0.032]]) kit.put('Slats', timber, block(0.18, 0.009, 0.005, 0, y, z, 0.001));
  kit.build(g);
  return g;
}

/** A traffic cone on a square rubber base, with one reflective band. */
function cone(): Group {
  const g = new Group();
  g.name = 'Cone';
  const kit = new Kit();
  kit.put('Base', rubber, block(0.042, 0.004, 0.042, 0, 0.002, 0, 0.001));
  const shell = new Mesh(new CylinderGeometry(0.004, 0.017, 0.066, 14));
  shell.position.y = 0.037;
  kit.put('Shell', safetyOrange, shell);
  const band = new Mesh(new CylinderGeometry(0.0089, 0.0113, 0.012, 14, 1, true));
  band.position.y = 0.04;
  kit.put('Band', reflective, band);
  kit.build(g);
  return g;
}

/** A wheeled commercial waste bin with a sloped two-part lid. */
function dumpster(): Group {
  const g = new Group();
  g.name = 'Dumpster';
  const kit = new Kit();
  kit.put('BodyBin', primer, side(outline([[-0.06, 0.012], [-0.06, 0.115], [0.055, 0.105], [0.05, 0.012]]), 0.2, 0.004));
  const slope = Math.atan2(0.01, 0.115);
  for (const s of SIDES) {
    const lid = new Mesh(bevelBox(0.098, 0.006, 0.125, 0.002));
    lid.position.set(s * 0.05, 0.114, -0.003);
    lid.rotation.x = slope;
    kit.put('Lids', trim, lid);
    kit.put('Fittings', steel, block(0.004, 0.02, 0.09, s * 0.102, 0.07, -0.003, 0.001));
    for (const z of [-0.045, 0.04]) kit.put('Castors', rubber, limb(v(s * 0.085 - 0.004, 0.006, z), v(s * 0.085 + 0.004, 0.006, z), 0.006, 0.006, 10));
  }
  kit.build(g);
  return g;
}

/** A weathered boulder, smooth and irregular, flat underneath so it sits. */
function rock(): Group {
  return buildRock(stone);
}

/** A timber picket fence between three posts. */
function fence(): Group {
  const g = new Group();
  g.name = 'Fence';
  const kit = new Kit();
  for (const x of [-0.194, 0, 0.194]) kit.put('Timber', timber, block(0.012, 0.11, 0.012, x, 0.055, 0, 0.002));
  for (const y of [0.03, 0.08]) kit.put('Timber', timber, block(0.388, 0.01, 0.006, 0, y, -0.008, 0.001));
  const picket = new ExtrudeGeometry(outline([[-0.0045, 0], [0.0045, 0], [0.0045, 0.093], [0, 0.101], [-0.0045, 0.093]]), { depth: 0.004, bevelEnabled: false });
  picket.translate(0, 0.005, -0.002);
  for (let i = 0; i < 17; i += 1) {
    const x = -0.184 + i * 0.023;
    if (Math.abs(x) < 0.009) continue;
    const mesh = new Mesh(picket);
    mesh.position.x = x;
    kit.put('Timber', timber, mesh);
  }
  kit.build(g);
  return g;
}

/** A solid concrete flight climbing away from the viewer, with a rail on one side. */
function stairs(): Group {
  const g = new Group();
  g.name = 'Stairs';
  const steps = 15;
  const rise = 0.3 / steps;
  const tread = 0.025;
  const front = (steps * tread) / 2;
  const points: [number, number][] = [[front, 0]];
  for (let i = 0; i < steps; i += 1) points.push([front - i * tread, (i + 1) * rise], [front - (i + 1) * tread, (i + 1) * rise]);
  points.push([-front, 0]);
  const kit = new Kit();
  kit.put('Flight', concrete, side(outline(points), 0.12, 0));
  const posts = [0, 7, 14].map((i) => v(0.054, (i + 1) * rise, front - (i + 0.5) * tread));
  for (const p of posts) kit.put('Handrail', steel, limb(p, p.clone().setY(p.y + 0.06), 0.0025, 0.0025, 6));
  kit.put('Handrail', steel, limb(posts[0].clone().setY(posts[0].y + 0.06), posts[2].clone().setY(posts[2].y + 0.06), 0.003, 0.003, 6));
  kit.build(g);
  return g;
}

/** A door standing in its own frame on two feet, hinged on the left so it can be swung later. */
function door(): Group {
  const g = new Group();
  g.name = 'Door';
  const kit = new Kit();
  kit.put('Frame', timber,
    block(0.01, 0.2, 0.02, -0.05, 0.1, 0, 0.002),
    block(0.01, 0.2, 0.02, 0.05, 0.1, 0, 0.002),
    block(0.11, 0.01, 0.02, 0, 0.205, 0, 0.002),
    block(0.11, 0.004, 0.03, 0, 0.002, 0, 0.001),
    block(0.012, 0.006, 0.08, -0.05, 0.003, 0, 0.001),
    block(0.012, 0.006, 0.08, 0.05, 0.003, 0, 0.001));
  kit.build(g);
  const hinge = new Group();
  hinge.name = 'Hinge';
  hinge.position.set(-0.045, 0, 0);
  const leaf = new Kit();
  leaf.put('BodyLeaf', primer, block(0.088, 0.194, 0.008, 0.045, 0.102, 0, 0.002));
  for (const z of [-0.0045, 0.0045]) {
    leaf.put('BodyLeaf', primer, block(0.062, 0.07, 0.002, 0.045, 0.06, z, 0.0008), block(0.062, 0.07, 0.002, 0.045, 0.145, z, 0.0008));
    leaf.put('Knob', steel, ball(v(0.08, 0.1, z * 1.6), 0.0035, 0.0035, 0.0035, BEAD));
  }
  leaf.build(hinge);
  g.add(hinge);
  return g;
}

/** A fluted column snapped off at an angle, on its plinth, with a fallen drum beside it. */
function pillar(): Group {
  const g = new Group();
  g.name = 'Pillar';
  const kit = new Kit();
  kit.put('Stone', stone, block(0.11, 0.03, 0.11, 0, 0.015, 0, 0.004));
  const ring = new Mesh(new TorusGeometry(0.048, 0.007, 6, 20));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.035;
  const height = 0.32;
  const shaft = new CylinderGeometry(0.04, 0.046, height, 24, 6);
  const p = shaft.getAttribute('position');
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    const a = Math.atan2(z, x);
    // Flutes: every other vertex round the shaft sits a little in.
    const flute = r > 0.001 ? 1 - 0.05 * (0.5 + 0.5 * Math.cos(12 * a)) : 1;
    let ny = y;
    if (y > height / 2 - 1e-6) {
      const jag = 0.045 * (0.5 + 0.5 * Math.sin(a + 0.7)) + 0.012 * (0.5 + 0.5 * Math.sin(5 * a + 1.3));
      ny = r > 0.001 ? y - jag : y - 0.03;
    }
    p.setXYZ(i, x * flute, ny, z * flute);
  }
  shaft.computeVertexNormals();
  const column = new Mesh(shaft);
  column.position.y = 0.03 + height / 2;
  const drum = new Mesh(new CylinderGeometry(0.04, 0.04, 0.05, 16));
  drum.rotation.set(0, 0.6, Math.PI / 2);
  drum.position.set(0.1, 0.04, 0.06);
  const chip = new Mesh(new IcosahedronGeometry(0.018, 0));
  chip.position.set(-0.07, 0.013, 0.06);
  chip.scale.y = 0.7;
  kit.put('Stone', stone, ring, column, drum, chip);
  kit.build(g);
  return g;
}

export const truckProp = truck();
export const pickupProp = pickup();
export const busProp = bus();
export const helicopterProp = helicopter();
export const boatProp = boat();
export const saucerProp = saucer();
export const bicycleProp = bicycle();
export const tankProp = tank();
export const barrierProp = barrier();
export const houseProp = house();
export const benchProp = bench();
export const coneProp = cone();
export const dumpsterProp = dumpster();
export const rockProp = rock();
export const fenceProp = fence();
export const stairsProp = stairs();
export const doorProp = door();
export const pillarProp = pillar();
