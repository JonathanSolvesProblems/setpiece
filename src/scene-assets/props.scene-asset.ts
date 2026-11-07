/**
 * Set dressing from the asset library, at 1:10. Vehicles are generic shapes in
 * bare basswood: previs shows where a car is, never whose. Origin at floor
 * contact, front along +Z.
 */
import { sedanShell } from './lib/sedan.js';
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from '@iwsdk/core';

/** Bare basswood, as a model maker's maquette comes before anyone paints it. */
const primer = new MeshStandardMaterial({ color: 0xc4a07a, roughness: 0.72 });
const glass = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3 });
const rubber = new MeshStandardMaterial({ color: 0x17191c, roughness: 0.9 });
const barRed = new MeshStandardMaterial({ color: 0xc8202c, emissive: 0xa0101a, emissiveIntensity: 0.8 });
const barBlue = new MeshStandardMaterial({ color: 0x2050d0, emissive: 0x1030b0, emissiveIntensity: 0.8 });
const signLight = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.7 });

function roofBox(parent: Group, name: string, material: MeshStandardMaterial, w: number, h: number, d: number, x: number, y: number, z: number): void {
  const mesh = new Mesh(new BoxGeometry(w, h, d), material);
  mesh.name = name;
  mesh.position.set(x, y, z);
  parent.add(mesh);
}

/** A generic emergency light bar on a low base; roofY is the top of the roof under it. */
function lightBar(s: Group, roofY: number, z: number, width: number): void {
  roofBox(s, 'LightBarBase', rubber, width, 0.006, 0.024, 0, roofY + 0.003, z);
  roofBox(s, 'LampRed', barRed, width / 2 - 0.006, 0.01, 0.018, -width / 4, roofY + 0.011, z);
  roofBox(s, 'LampBlue', barBlue, width / 2 - 0.006, 0.01, 0.018, width / 4, roofY + 0.011, z);
}

/** A plain lit block on the roof, the shape of a hire-car sign with nothing written on it. */
function roofSign(s: Group, roofY: number, z: number): void {
  roofBox(s, 'SignBase', rubber, 0.07, 0.004, 0.026, 0, roofY + 0.002, z);
  roofBox(s, 'RoofSign', signLight, 0.06, 0.02, 0.022, 0, roofY + 0.014, z);
}

/** Two rails on feet with cross bars. */
function roofRack(s: Group, roofY: number, z: number, length: number, halfWidth: number, bars: number[]): void {
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    roofBox(s, `RackRail${tag}`, rubber, 0.006, 0.006, length, side * halfWidth, roofY + 0.01, z);
    for (const end of [-1, 1]) roofBox(s, `RackFoot${tag}`, rubber, 0.008, 0.01, 0.01, side * halfWidth, roofY + 0.004, z + (end * (length - 0.014)) / 2);
  }
  bars.forEach((bz, i) => roofBox(s, `RackBar${i}`, rubber, halfWidth * 2 + 0.012, 0.005, 0.006, 0, roofY + 0.0155, bz));
}

/** Roof looks as named groups Style0, Style1 and so on; Style0 is bare and the only one shown. */
function addStyles(g: Group, looks: ((s: Group) => void)[]): void {
  looks.forEach((build, i) => {
    const s = new Group();
    s.name = `Style${i}`;
    build(s);
    s.visible = i === 0;
    g.add(s);
  });
}

function car(): Group {
  const g = new Group();
  g.name = 'Car';
  sedanShell(g, primer, glass, rubber);
  // The roof peaks at about y 0.15 a little behind the middle.
  addStyles(g, [
    () => {},
    (s) => lightBar(s, 0.149, -0.024, 0.13),
    (s) => roofSign(s, 0.149, -0.024),
    (s) => roofRack(s, 0.146, -0.022, 0.12, 0.06, [-0.065, 0.025]),
  ]);
  return g;
}

export const carProp = car();

const concrete = new MeshStandardMaterial({ color: 0x9b9a94, roughness: 0.95 });
const timber = new MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.85 });
const leaf = new MeshStandardMaterial({ color: 0x4d6b45, roughness: 0.95 });
const lampGlow = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.9 });

/** A side profile, extruded across the vehicle's width, nose towards +z. */
function hull(shape: Shape, width: number, material: MeshStandardMaterial, name: string): Mesh {
  const geometry = new ExtrudeGeometry(shape, {
    depth: width - 0.016,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 6,
  });
  geometry.translate(0, 0, -(width - 0.016) / 2);
  geometry.rotateY(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.name = name;
  return mesh;
}

function wheels(g: Group, width: number, front: number, rear: number, radius: number): void {
  const tyre = new CylinderGeometry(radius, radius, 0.024, 16);
  for (const [x, z, name] of [
    [-width / 2 + 0.008, front, 'WheelFL'],
    [width / 2 - 0.008, front, 'WheelFR'],
    [-width / 2 + 0.008, rear, 'WheelRL'],
    [width / 2 - 0.008, rear, 'WheelRR'],
  ] as [number, number, string][]) {
    const wheel = new Mesh(tyre, rubber);
    wheel.name = name;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, radius, z);
    g.add(wheel);
  }
}

function van(): Group {
  const g = new Group();
  g.name = 'Van';
  const width = 0.19;
  const body = new Shape();
  body.moveTo(-0.235, 0.04);
  body.lineTo(-0.238, 0.19);
  body.quadraticCurveTo(-0.235, 0.205, -0.21, 0.205);
  body.lineTo(0.09, 0.205);
  body.lineTo(0.16, 0.12);
  body.lineTo(0.225, 0.1);
  body.quadraticCurveTo(0.24, 0.09, 0.24, 0.06);
  body.lineTo(0.235, 0.04);
  body.closePath();
  const screen = new Shape();
  screen.moveTo(0.062, 0.125);
  screen.lineTo(0.062, 0.19);
  screen.lineTo(0.09, 0.19);
  screen.lineTo(0.143, 0.125);
  screen.closePath();
  const glassGeometry = new ExtrudeGeometry(screen, { depth: width + 0.0005, bevelEnabled: false });
  glassGeometry.translate(0, 0, -(width + 0.0005) / 2);
  glassGeometry.rotateY(-Math.PI / 2);
  const windows = new Mesh(glassGeometry, glass);
  windows.name = 'Glasshouse';
  g.add(hull(body, width, primer, 'Body'), windows);
  wheels(g, width, 0.145, -0.15, 0.036);
  // Flat roof at y 0.21 from z -0.21 to 0.09.
  addStyles(g, [() => {}, (s) => lightBar(s, 0.21, 0.05, 0.15), (s) => roofRack(s, 0.21, -0.06, 0.26, 0.075, [-0.17, -0.06, 0.05])]);
  return g;
}

function motorbike(): Group {
  const g = new Group();
  g.name = 'Motorbike';
  const body = new Shape();
  body.moveTo(-0.07, 0.05);
  body.lineTo(-0.1, 0.09);
  body.lineTo(-0.02, 0.1);
  body.lineTo(0.03, 0.115);
  body.lineTo(0.075, 0.1);
  body.lineTo(0.05, 0.05);
  body.closePath();
  const frame = new ExtrudeGeometry(body, { depth: 0.022, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 1 });
  frame.translate(0, 0, -0.011);
  frame.rotateY(-Math.PI / 2);
  const hullMesh = new Mesh(frame, primer);
  hullMesh.name = 'Body';
  g.add(hullMesh);
  const tyre = new CylinderGeometry(0.032, 0.032, 0.012, 18);
  for (const [z, name] of [
    [0.11, 'WheelF'],
    [-0.095, 'WheelR'],
  ] as [number, string][]) {
    const wheel = new Mesh(tyre, rubber);
    wheel.name = name;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.032, z);
    g.add(wheel);
  }
  const forks = new Mesh(new CylinderGeometry(0.0035, 0.0035, 0.1, 8), rubber);
  forks.name = 'Forks';
  forks.position.set(0, 0.078, 0.09);
  forks.rotation.x = 0.42;
  const bars = new Mesh(new CylinderGeometry(0.003, 0.003, 0.06, 8), rubber);
  bars.name = 'Bars';
  bars.rotation.z = Math.PI / 2;
  bars.position.set(0, 0.123, 0.069);
  g.add(forks, bars);
  return g;
}

function wall(): Group {
  const g = new Group();
  g.name = 'Wall';
  const slab = new Mesh(new BoxGeometry(0.32, 0.22, 0.02), concrete);
  slab.name = 'Slab';
  slab.position.y = 0.11;
  const cap = new Mesh(new BoxGeometry(0.33, 0.008, 0.028), concrete);
  cap.name = 'Coping';
  cap.position.y = 0.224;
  g.add(slab, cap);
  return g;
}

function lampPost(): Group {
  const g = new Group();
  g.name = 'LampPost';
  const foot = new Mesh(new CylinderGeometry(0.016, 0.02, 0.012, 14), rubber);
  foot.name = 'Foot';
  foot.position.y = 0.006;
  const pole = new Mesh(new CylinderGeometry(0.0035, 0.0055, 0.4, 10), rubber);
  pole.name = 'Pole';
  pole.position.y = 0.2;
  const arm = new Mesh(new CylinderGeometry(0.0028, 0.0028, 0.05, 8), rubber);
  arm.name = 'Arm';
  arm.rotation.x = Math.PI / 2;
  arm.position.set(0, 0.396, 0.025);
  const head = new Mesh(new BoxGeometry(0.018, 0.008, 0.04), lampGlow);
  head.name = 'Lamp';
  head.position.set(0, 0.39, 0.05);
  g.add(foot, pole, arm, head);
  return g;
}

function tree(): Group {
  const g = new Group();
  g.name = 'Tree';
  const trunk = new Mesh(new CylinderGeometry(0.009, 0.016, 0.2, 10), timber);
  trunk.name = 'Trunk';
  trunk.position.y = 0.1;
  g.add(trunk);
  for (const [x, y, z, r, name] of [
    [0, 0.26, 0, 0.085, 'Crown'],
    [0.05, 0.22, 0.02, 0.058, 'BoughR'],
    [-0.045, 0.23, -0.025, 0.062, 'BoughL'],
    [0.005, 0.33, 0.01, 0.05, 'Top'],
  ] as [number, number, number, number, string][]) {
    const bough = new Mesh(new IcosahedronGeometry(r, 1), leaf);
    bough.name = name;
    bough.position.set(x, y, z);
    g.add(bough);
  }
  return g;
}

function crate(): Group {
  const g = new Group();
  g.name = 'Crate';
  const box = new Mesh(new BoxGeometry(0.075, 0.075, 0.075), timber);
  box.name = 'Box';
  box.position.y = 0.0375;
  g.add(box);
  for (const [y, name] of [
    [0.006, 'BandLow'],
    [0.069, 'BandHigh'],
  ] as [number, string][]) {
    const band = new Mesh(new BoxGeometry(0.079, 0.01, 0.079), timber);
    band.name = name;
    band.position.y = y;
    g.add(band);
  }
  return g;
}

export const vanProp = van();
export const motorbikeProp = motorbike();
export const wallProp = wall();
export const lampPostProp = lampPost();
export const treeProp = tree();
export const crateProp = crate();
