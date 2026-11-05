/**
 * Set dressing from the asset library, at 1:10. Vehicles are generic shapes in
 * grey primer: previs shows where a car is, never whose. Origin at floor
 * contact, front along +Z.
 */
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

const LENGTH = 0.45;
const WIDTH = 0.18;
const primer = new MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.62 });
const glass = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3 });
const rubber = new MeshStandardMaterial({ color: 0x17191c, roughness: 0.9 });

/** Side profile, nose at +x before it is turned: bonnet, windscreen, roof, boot. */
function bodyProfile(): Shape {
  const s = new Shape();
  s.moveTo(-0.225, 0.04);
  s.lineTo(-0.228, 0.075);
  s.quadraticCurveTo(-0.22, 0.09, -0.19, 0.092);
  s.lineTo(-0.135, 0.095);
  s.lineTo(-0.085, 0.14);
  s.quadraticCurveTo(-0.03, 0.15, 0.05, 0.14);
  s.lineTo(0.105, 0.095);
  s.lineTo(0.2, 0.082);
  s.quadraticCurveTo(0.228, 0.078, 0.228, 0.055);
  s.lineTo(0.225, 0.04);
  s.closePath();
  return s;
}

/** The glasshouse, inset from the body so it reads as windows on the same form. */
function glassProfile(): Shape {
  const s = new Shape();
  s.moveTo(-0.122, 0.097);
  s.lineTo(-0.08, 0.135);
  s.quadraticCurveTo(-0.03, 0.144, 0.045, 0.135);
  s.lineTo(0.092, 0.097);
  s.closePath();
  return s;
}

function car(): Group {
  const g = new Group();
  g.name = 'Car';
  const bodyGeometry = new ExtrudeGeometry(bodyProfile(), {
    depth: WIDTH - 0.016,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.005,
    bevelSegments: 2,
    curveSegments: 6,
  });
  bodyGeometry.translate(0, 0, -(WIDTH - 0.016) / 2);
  bodyGeometry.rotateY(-Math.PI / 2);
  const body = new Mesh(bodyGeometry, primer);
  body.name = 'Body';
  const glassGeometry = new ExtrudeGeometry(glassProfile(), { depth: WIDTH + 0.0005, bevelEnabled: false, curveSegments: 6 });
  glassGeometry.translate(0, 0, -(WIDTH + 0.0005) / 2);
  glassGeometry.rotateY(-Math.PI / 2);
  const windows = new Mesh(glassGeometry, glass);
  windows.name = 'Glasshouse';
  g.add(body, windows);
  const tyre = new CylinderGeometry(0.034, 0.034, 0.024, 16);
  for (const [x, z, name] of [
    [-WIDTH / 2 + 0.008, 0.135, 'WheelFL'],
    [WIDTH / 2 - 0.008, 0.135, 'WheelFR'],
    [-WIDTH / 2 + 0.008, -0.14, 'WheelRL'],
    [WIDTH / 2 - 0.008, -0.14, 'WheelRR'],
  ] as [number, number, string][]) {
    const wheel = new Mesh(tyre, rubber);
    wheel.name = name;
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.034, z);
    g.add(wheel);
  }
  return g;
}

export const carProp = car();
void LENGTH;

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
