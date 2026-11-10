/**
 * Set dressing from the asset library, at 1:10. Vehicles are generic shapes in
 * bare basswood: previs shows where a car is, never whose. Origin at floor
 * contact, front along +Z.
 */
import { buildMotorbike } from './lib/motorbike.js';
import { buildTree } from './lib/nature.js';
import { sedanShell } from './lib/sedan.js';
import { vanShell } from './lib/van.js';
import { BoxGeometry, CylinderGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from '@iwsdk/core';
import type { BufferGeometry, Material } from '@iwsdk/core';
import { alignSpan, bevelBox } from './lib/hardsurface.js';
import { mergeByMaterial } from './lib/vehicle.js';

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
const mortar = new MeshStandardMaterial({ color: 0x7c7a73, roughness: 0.95 });
const timberDark = new MeshStandardMaterial({ color: 0x5e4630, roughness: 0.9 });

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

/** A garden wall between two pilasters: a coping on top, the mortar courses marked on both faces. */
function wall(): Group {
  const g = new Group();
  g.name = 'Wall';
  const put = (geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number): void => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    g.add(mesh);
  };
  put(bevelBox(0.3, 0.22, 0.022, 0.002), concrete, 0, 0.11);
  put(bevelBox(0.31, 0.01, 0.032, 0.002), concrete, 0, 0.225);
  for (const side of [-1, 1]) {
    put(bevelBox(0.03, 0.236, 0.034, 0.003), concrete, side * 0.15, 0.118);
    put(bevelBox(0.038, 0.008, 0.042, 0.002), concrete, side * 0.15, 0.24);
  }
  for (let y = 0.04; y < 0.21; y += 0.04) put(new BoxGeometry(0.296, 0.0014, 0.0236), mortar, 0, y);
  mergeByMaterial(g, new Map<Material, string>([[concrete, 'Wall'], [mortar, 'Mortar']]));
  return g;
}

/** A street lamp: a fluted base with its access door, a tapering pole, a curved arm and a lantern lit from below. */
function lampPost(): Group {
  const g = new Group();
  g.name = 'LampPost';
  const put = (mesh: Mesh, x: number, y: number, z: number): void => {
    mesh.position.set(x, y, z);
    g.add(mesh);
  };
  put(new Mesh(new CylinderGeometry(0.014, 0.02, 0.01, 12), rubber), 0, 0.005, 0);
  put(new Mesh(new CylinderGeometry(0.009, 0.013, 0.05, 12), rubber), 0, 0.035, 0);
  put(new Mesh(new CylinderGeometry(0.0065, 0.0095, 0.012, 12), rubber), 0, 0.066, 0);
  put(new Mesh(new CylinderGeometry(0.0034, 0.0062, 0.31, 10), rubber), 0, 0.227, 0);
  put(new Mesh(new CylinderGeometry(0.0045, 0.0045, 0.008, 10), rubber), 0, 0.384, 0);
  put(new Mesh(bevelBox(0.008, 0.016, 0.004, 0.001), rubber), 0, 0.045, 0.0105);
  // The arm rises out of the top collar, then runs level to the lantern.
  const rise = new Mesh(new CylinderGeometry(0.0028, 0.0032, 1, 8), rubber);
  rise.scale.y = alignSpan(rise, new Vector3(0, 0.386, 0), new Vector3(0, 0.405, 0.03));
  const reach = new Mesh(new CylinderGeometry(0.0026, 0.0028, 1, 8), rubber);
  reach.scale.y = alignSpan(reach, new Vector3(0, 0.405, 0.028), new Vector3(0, 0.405, 0.062));
  g.add(rise, reach);
  put(new Mesh(bevelBox(0.024, 0.014, 0.05, 0.003), rubber), 0, 0.398, 0.062);
  put(new Mesh(bevelBox(0.02, 0.004, 0.044, 0.001), lampGlow), 0, 0.3895, 0.062);
  mergeByMaterial(g, new Map<Material, string>([[rubber, 'Post'], [lampGlow, 'Lamp']]));
  return g;
}

function tree(): Group {
  return buildTree(leaf, timber);
}

/** A wooden crate: a darker box inside, corner posts, three boards a face, bands top and bottom. */
function crate(): Group {
  const g = new Group();
  g.name = 'Crate';
  const put = (geometry: BufferGeometry, material: MeshStandardMaterial, x: number, y: number, z: number, turn = 0): void => {
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z).applyAxisAngle(UP, turn);
    mesh.rotation.y = turn;
    g.add(mesh);
  };
  put(new BoxGeometry(0.072, 0.072, 0.072), timberDark, 0, 0.0375, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(bevelBox(0.009, 0.075, 0.009, 0.0015), timber, sx * 0.0345, 0.0375, sz * 0.0345);
  for (let face = 0; face < 4; face += 1) {
    for (const across of [-0.021, 0, 0.021]) put(new BoxGeometry(0.017, 0.058, 0.003), timber, across, 0.0375, 0.0375, (face * Math.PI) / 2);
  }
  for (const y of [0.006, 0.069]) put(new BoxGeometry(0.08, 0.009, 0.08), timber, 0, y, 0);
  mergeByMaterial(g, new Map<Material, string>([[timber, 'Boards'], [timberDark, 'Box']]));
  return g;
}
const UP = new Vector3(0, 1, 0);

export const vanProp = van();
export const motorbikeProp = motorbike();
export const wallProp = wall();
export const lampPostProp = lampPost();
export const treeProp = tree();
export const crateProp = crate();
