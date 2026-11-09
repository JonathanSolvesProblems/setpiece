/**
 * Set dressing from the asset library, at 1:10. Vehicles are generic shapes in
 * bare basswood: previs shows where a car is, never whose. Origin at floor
 * contact, front along +Z.
 */
import { buildMotorbike } from './lib/motorbike.js';
import { buildTree } from './lib/nature.js';
import { sedanShell } from './lib/sedan.js';
import { vanShell } from './lib/van.js';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial } from '@iwsdk/core';

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

function van(): Group {
  const g = new Group();
  g.name = 'Van';
  vanShell(g, primer, glass, rubber);
  // Flat roof at y 0.21 from z -0.21 to 0.09.
  addStyles(g, [() => {}, (s) => lightBar(s, 0.21, 0.05, 0.15), (s) => roofRack(s, 0.21, -0.06, 0.26, 0.075, [-0.17, -0.06, 0.05])]);
  return g;
}

function motorbike(): Group {
  return buildMotorbike(primer, rubber);
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
  return buildTree(leaf, timber);
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
