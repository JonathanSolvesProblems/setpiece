/**
 * Creature maquettes at 1:10 for blocking a shot: generic forms in carved wood, not primer,
 * read by silhouette from a metre away, never a likeness of anyone's design.
 * Origin at floor contact, front along +Z, Y up.
 *
 * Naming: meshes that take the user's colour start with 'Body'. Eyes, teeth,
 * claws and the rest keep their own material. Parts that move on their own carry
 * userData.idle = { kind, axis, amount, rate } and are direct child groups of the
 * root, with the pivot at the group origin. A mirrored pair gets opposite signs on
 * amount so a sine driver moves them symmetrically.
 *
 * Each creature is merged to one mesh per material, so a dragon costs a handful of
 * draw calls rather than eighty.
 */
import {
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
  TorusGeometry,
  Vector3,
} from '@iwsdk/core';
import { bevelBox, mirrorGeometryX } from './lib/hardsurface.js';
import {
  BEAD,
  Kit,
  SIDES,
  ball,
  chain,
  idleGroup,
  limb,
  loft,
  onLoft,
  plate,
  sec,
  spike,
  upright,
  v,
  type Ring,
} from './lib/kit.js';

/** Carved, like the lay figures: a creature is a wooden maquette until someone paints it. */
const primer = new MeshStandardMaterial({ color: 0xa37a60, roughness: 0.72 });
const horn = new MeshStandardMaterial({ color: 0x3a332d, roughness: 0.55 });
const bone = new MeshStandardMaterial({ color: 0xe4dac2, roughness: 0.5 });
const eyeGlow = new MeshStandardMaterial({ color: 0xffb347, emissive: 0xff9a1f, emissiveIntensity: 0.8, roughness: 0.3 });
const eyeDark = new MeshStandardMaterial({ color: 0x0f1114, roughness: 0.15, metalness: 0.2 });
const steel = new MeshStandardMaterial({ color: 0x3d4247, roughness: 0.45, metalness: 0.6 });
const lens = new MeshStandardMaterial({ color: 0x7fe3ff, emissive: 0x39c6ff, emissiveIntensity: 0.9, roughness: 0.2 });
const timber = new MeshStandardMaterial({ color: 0x6e5038, roughness: 0.85 });
const cloth = new MeshStandardMaterial({ color: 0x5b4a36, roughness: 0.95 });
const hair = new MeshStandardMaterial({ color: 0x2b2420, roughness: 0.9 });
const water = new MeshStandardMaterial({ color: 0x1d3a46, roughness: 0.12, metalness: 0.15 });
const foam = new MeshStandardMaterial({ color: 0x9fb8bf, roughness: 0.4 });
const sucker = new MeshStandardMaterial({ color: 0xc9b9a8, roughness: 0.6 });
const voidDark = new MeshStandardMaterial({ color: 0x07080a, roughness: 1 });
/** The one see-through surface in the set: the ghost's sheet. */
const sheet = new MeshStandardMaterial({ color: 0xe8edf2, roughness: 0.8, transparent: true, opacity: 0.82 });


/** A bat wing laid flat: span along +X, chord along +Z, scalloped trailing edge. */
function wingMembrane(): BufferGeometry {
  const s = new Shape();
  s.moveTo(0, 0.022);
  s.lineTo(0.08, 0.037);
  s.lineTo(0.16, 0.008);
  s.lineTo(0.235, -0.05);
  s.quadraticCurveTo(0.19, -0.055, 0.19, -0.115);
  s.quadraticCurveTo(0.15, -0.1, 0.12, -0.145);
  s.quadraticCurveTo(0.07, -0.1, 0, -0.1);
  s.closePath();
  const geometry = new ExtrudeGeometry(s, { depth: 0.003, bevelEnabled: false, curveSegments: 4 });
  geometry.translate(0, 0, -0.0015);
  geometry.rotateX(Math.PI / 2);
  return geometry;
}

/** Wing on a flapping pivot at the shoulder; the blade inside is raised and swept back. */
function dragonWing(side: -1 | 1, membrane: BufferGeometry): Group {
  const tag = side < 0 ? 'L' : 'R';
  const wing = idleGroup(`Wing${tag}`, v(side * 0.028, 0.145, 0.045), { kind: 'flap', axis: 'z', amount: 0.3 * side, rate: 2 });
  const blade = new Group();
  // Raised, then pitched back so the membrane shows its face from the front instead of its edge.
  blade.rotation.set(-0.45, 0.1 * side, 0.98 * side);
  blade.add(new Mesh(side < 0 ? mirrorGeometryX(membrane) : membrane));
  const p = (x: number, z: number): Vector3 => v(side * x, 0, z);
  const wrist = p(0.16, 0.008);
  blade.add(...chain([p(0, 0.022), p(0.08, 0.037), wrist], [0.007, 0.0055, 0.0045]));
  for (const [x, z] of [[0.235, -0.05], [0.19, -0.115], [0.12, -0.145]]) blade.add(limb(wrist, p(x, z), 0.0035, 0.0012, 6));
  const claw = new Group();
  claw.rotation.copy(blade.rotation);
  claw.add(spike(wrist, p(0.168, 0.026), 0.003));
  const kit = new Kit();
  kit.put(`BodyWing${tag}`, primer, blade);
  kit.put(`WingClaw${tag}`, horn, claw);
  kit.build(wing);
  return wing;
}

function dragon(): Group {
  const g = new Group();
  g.name = 'Dragon';
  const kit = new Kit();
  const { mesh: hide, surface } = loft([
    sec(-0.3, 0.012, 0.004, 0.004, 0.004, 0.07),
    sec(-0.25, 0.018, 0.009, 0.008, 0.008, 0.045),
    sec(-0.18, 0.032, 0.016, 0.014, 0.014, 0.015),
    sec(-0.11, 0.065, 0.028, 0.026, 0.026),
    sec(-0.06, 0.1, 0.042, 0.038, 0.036),
    sec(0, 0.11, 0.048, 0.042, 0.04),
    sec(0.06, 0.115, 0.044, 0.04, 0.036),
    sec(0.1, 0.145, 0.03, 0.034, 0.03),
    sec(0.14, 0.185, 0.022, 0.03, 0.026),
    sec(0.165, 0.213, 0.022, 0.026, 0.022),
    sec(0.19, 0.224, 0.024, 0.022, 0.02),
    sec(0.225, 0.218, 0.016, 0.013, 0.012),
    sec(0.255, 0.212, 0.009, 0.007, 0.007),
  ]);
  kit.put('BodyHide', primer, hide);
  // Dorsal spines, leaning back, sized to the body under them.
  for (const z of [0.13, 0.1, 0.065, 0.025, -0.015, -0.055, -0.095, -0.135, -0.175, -0.215, -0.25]) {
    const top = onLoft(surface, z, Math.PI / 2);
    const depth = top.y - onLoft(surface, z, -Math.PI / 2).y;
    const length = 0.22 * depth + 0.006;
    const base = top.clone().add(v(0, -0.003, 0));
    kit.put('Spines', horn, spike(base, base.clone().add(v(0, length, -0.55 * length)), 0.45 * length, 0.4));
  }
  for (const side of SIDES) {
    const hornBase = onLoft(surface, 0.172, Math.PI / 2 - side * 0.55).add(v(0, -0.002, 0));
    const mid = hornBase.clone().add(v(side * 0.008, 0.02, -0.02));
    kit.put('Horns', bone, ...chain([hornBase, mid, mid.clone().add(v(side * 0.003, 0.007, -0.026))], [0.0062, 0.0036, 0.0008], false));
    const eye = onLoft(surface, 0.203, side > 0 ? 0.42 : Math.PI - 0.42);
    kit.put('Eyes', eyeGlow, ball(eye, 0.0052, 0.0052, 0.0052, BEAD));
    kit.put('BodyHide', primer, ball(eye.clone().add(v(0, 0.006, -0.002)), 0.008, 0.0042, 0.012));
    for (const z of [0.2, 0.214, 0.228, 0.242]) {
      const root = onLoft(surface, z, -Math.PI / 2 + side * 0.85).add(v(-side * 0.001, 0.003, 0));
      kit.put('Teeth', bone, spike(root, root.clone().add(v(0, -0.01, 0.001)), 0.0024));
    }
    // Haunch and shoulder, then hind and fore legs folded like a big lizard's.
    kit.put('BodyHide', primer, ball(v(side * 0.034, 0.1, -0.05), 0.026, 0.036, 0.042), ball(v(side * 0.034, 0.1, 0.058), 0.022, 0.03, 0.032));
    const hind = [v(0.042, 0.095, -0.05), v(0.05, 0.055, -0.018), v(0.05, 0.022, -0.06), v(0.05, 0.008, -0.034)].map((p) => p.setX(p.x * side));
    const fore = [v(0.04, 0.1, 0.06), v(0.05, 0.06, 0.04), v(0.05, 0.018, 0.07), v(0.05, 0.008, 0.08)].map((p) => p.setX(p.x * side));
    kit.put('BodyHide', primer, ...chain(hind, [0.022, 0.016, 0.011, 0.009]), ...chain(fore, [0.018, 0.014, 0.01, 0.008]));
    for (const [foot, z, rz] of [[hind, -0.03, 0.02], [fore, 0.083, 0.017]] as [Vector3[], number, number][]) {
      const x = foot[3].x;
      kit.put('BodyHide', primer, ball(v(x, 0.007, z), 0.014, 0.007, rz));
      for (const dx of [-0.008, 0, 0.008]) {
        const base = v(x + dx, 0.006, z + rz - 0.006);
        kit.put('Claws', horn, spike(base, base.clone().add(v(dx * 0.4, -0.004, 0.014)), 0.0028));
      }
    }
  }
  kit.build(g);
  const membrane = wingMembrane();
  g.add(dragonWing(-1, membrane), dragonWing(1, membrane));
  return g;
}

/** A hunched four-metre giant: hump, long arms, small head thrust forward, a club resting on the floor. */
function troll(): Group {
  const g = new Group();
  g.name = 'Troll';
  const kit = new Kit();
  kit.put('BodyHide', primer, upright([
    { h: 0.1, halfW: 0.06, front: 0.045, back: 0.045 },
    { h: 0.13, halfW: 0.07, front: 0.058, back: 0.05 },
    { h: 0.17, halfW: 0.076, front: 0.072, back: 0.055, fwd: 0.012 },
    { h: 0.23, halfW: 0.084, front: 0.066, back: 0.062, fwd: 0.01 },
    { h: 0.285, halfW: 0.096, front: 0.055, back: 0.075 },
    { h: 0.32, halfW: 0.076, front: 0.045, back: 0.068 },
    { h: 0.345, halfW: 0.04, front: 0.032, back: 0.045, fwd: 0.015 },
    { h: 0.356, halfW: 0.012, front: 0.01, back: 0.015, fwd: 0.02 },
  ], 14));
  // Head low and forward of the hump, heavy brow, underbite with tusks.
  kit.put('BodyHide', primer,
    ball(v(0, 0.356, 0.06), 0.036, 0.04, 0.038),
    ball(v(0, 0.372, 0.086), 0.036, 0.012, 0.017),
    ball(v(0, 0.352, 0.1), 0.012, 0.013, 0.012),
    ball(v(0, 0.33, 0.074), 0.034, 0.021, 0.032));
  for (const side of SIDES) {
    kit.put('Eyes', eyeDark, ball(v(side * 0.014, 0.362, 0.094), 0.0045, 0.0045, 0.0045, BEAD));
    kit.put('Tusks', bone, spike(v(side * 0.018, 0.336, 0.096), v(side * 0.023, 0.362, 0.104), 0.0045));
    kit.put('BodyHide', primer,
      spike(v(side * 0.03, 0.358, 0.055), v(side * 0.056, 0.372, 0.05), 0.011, 0.45),
      ball(v(side * 0.095, 0.29, 0), 0.044),
      ...chain([v(side * 0.1, 0.285, 0), v(side * 0.135, 0.19, 0.015), v(side * 0.14, 0.095, 0.05)], [0.036, 0.03, 0.033]),
      ball(v(side * 0.142, 0.07, 0.058), 0.032, 0.034, 0.036),
      ...chain([v(side * 0.05, 0.12, 0), v(side * 0.068, 0.068, 0.025), v(side * 0.068, 0.028, 0)], [0.048, 0.042, 0.034]),
      ball(v(side * 0.068, 0.017, 0.03), 0.036, 0.017, 0.055));
  }
  const skirt = new Mesh(new CylinderGeometry(0.08, 0.098, 0.06, 12));
  skirt.position.set(0, 0.112, 0.004);
  skirt.scale.set(1, 1, 0.86);
  kit.put('Loincloth', cloth, skirt);
  kit.put('Club', timber, limb(v(0.134, 0.112, 0.028), v(0.18, 0.035, 0.17), 0.009, 0.026, 10), ball(v(0.182, 0.031, 0.175), 0.029));
  kit.build(g);
  return g;
}

/** A big bipedal predator held level: heavy head and jaws, tiny arms, the tail as counterweight. */
function dinosaur(): Group {
  const g = new Group();
  g.name = 'Dinosaur';
  const kit = new Kit();
  const { mesh: hide, surface } = loft([
    sec(-0.265, 0.13, 0.004, 0.004),
    sec(-0.2, 0.14, 0.013, 0.013),
    sec(-0.12, 0.155, 0.028, 0.028, 0.03),
    sec(-0.04, 0.17, 0.048, 0.045, 0.05),
    sec(0.03, 0.175, 0.052, 0.048, 0.062),
    sec(0.08, 0.195, 0.04, 0.04, 0.045),
    sec(0.11, 0.222, 0.03, 0.034, 0.034),
    sec(0.135, 0.243, 0.034, 0.038, 0.036),
    sec(0.17, 0.25, 0.034, 0.034, 0.028),
    sec(0.205, 0.246, 0.026, 0.027, 0.02),
    sec(0.235, 0.24, 0.017, 0.018, 0.012),
    sec(0.248, 0.236, 0.008, 0.009, 0.006),
  ], 14);
  kit.put('BodyHide', primer, hide);
  // Lower jaw hinged under the skull and dropped open.
  const jawSections = [sec(0, 0, 0.026, 0.012), sec(0.04, -0.004, 0.024, 0.01, 0.012), sec(0.075, -0.004, 0.016, 0.008, 0.009), sec(0.09, -0.003, 0.007, 0.005, 0.005)];
  const { mesh: jawMesh, surface: jawSurface } = loft(jawSections, 12);
  const jaw = new Group();
  const jawTeeth = new Group();
  for (const pivot of [jaw, jawTeeth]) {
    pivot.position.set(0, 0.222, 0.142);
    pivot.rotation.x = 0.3;
  }
  jaw.add(jawMesh);
  for (const side of SIDES) {
    for (const z of [0.165, 0.18, 0.195, 0.21, 0.225]) {
      const root = onLoft(surface, z, -Math.PI / 2 + side * 0.8).add(v(0, 0.003, 0));
      kit.put('Teeth', bone, spike(root, root.clone().add(v(0, -0.012, 0.001)), 0.0028));
    }
    for (const z of [0.03, 0.05, 0.07]) {
      const root = jawSurface.point(z, Math.PI / 2 - side * 0.8).add(v(0, -0.003, 0));
      jawTeeth.add(spike(root, root.clone().add(v(0, 0.01, 0.001)), 0.0026));
    }
    const eye = onLoft(surface, 0.175, side > 0 ? 0.45 : Math.PI - 0.45);
    kit.put('Eyes', eyeGlow, ball(eye, 0.005, 0.005, 0.005, BEAD));
    kit.put('BodyHide', primer,
      ball(eye.clone().add(v(0, 0.007, -0.003)), 0.01, 0.005, 0.014),
      ball(v(side * 0.042, 0.15, -0.015), 0.034, 0.058, 0.052),
      ...chain([v(side * 0.048, 0.15, -0.02), v(side * 0.058, 0.1, 0.03), v(side * 0.058, 0.04, -0.015), v(side * 0.058, 0.012, 0.012)], [0.036, 0.026, 0.017, 0.013]),
      ball(v(side * 0.058, 0.008, 0.02), 0.02, 0.008, 0.028),
      ...chain([v(side * 0.035, 0.16, 0.075), v(side * 0.045, 0.135, 0.09), v(side * 0.04, 0.128, 0.115)], [0.01, 0.007, 0.006]));
    for (const dx of [-0.012, 0, 0.012]) {
      const base = v(side * 0.058 + dx, 0.007, 0.04);
      kit.put('Claws', horn, spike(base, base.clone().add(v(dx * 0.3, -0.005, 0.016)), 0.004));
    }
    for (const dx of [-0.004, 0.004]) {
      const base = v(side * 0.04 + dx, 0.128, 0.118);
      kit.put('Claws', horn, spike(base, base.clone().add(v(0, -0.008, 0.008)), 0.0022));
    }
  }
  kit.put('BodyHide', primer, jaw);
  kit.put('Teeth', bone, jawTeeth);
  kit.build(g);
  return g;
}

/** A two-legged walker: wedge hull on a hip axle, reverse-knee legs, gun pods either side. */
function robot(): Group {
  const g = new Group();
  g.name = 'Robot';
  const kit = new Kit();
  const { mesh: hull } = loft([
    sec(-0.07, 0.27, 0.065, 0.045, 0.04, 0, 4),
    sec(0, 0.275, 0.08, 0.05, 0.045, 0, 4),
    sec(0.05, 0.27, 0.075, 0.045, 0.045, 0, 4),
    sec(0.085, 0.26, 0.05, 0.03, 0.035, 0, 4),
    sec(0.095, 0.258, 0.035, 0.02, 0.025, 0, 3),
  ], 16, 1);
  kit.put('BodyHull', primer, hull, ball(v(0, 0.322, -0.005), 0.03, 0.025, 0.032));
  kit.put('Visor', lens, ball(v(0, 0.266, 0.086), 0.042, 0.009, 0.014));
  kit.put('Joints', steel, limb(v(-0.1, 0.222, 0), v(0.1, 0.222, 0), 0.016, 0.016, 10));
  for (const side of SIDES) {
    const hip = v(side * 0.088, 0.222, 0);
    const knee = v(side * 0.092, 0.15, 0.06);
    const ankle = v(side * 0.092, 0.06, -0.03);
    kit.put('BodyHull', primer,
      ball(v(side * 0.078, 0.226, 0), 0.03, 0.032, 0.036),
      plate(hip, knee, 0.03, 0.044),
      plate(knee, ankle, 0.024, 0.032),
      plate(v(side * 0.11, 0.268, -0.025), v(side * 0.11, 0.268, 0.07), 0.04, 0.034, 0.005),
      new Mesh(bevelBox(0.05, 0.016, 0.085, 0.004)).translateX(side * 0.092).translateY(0.008).translateZ(0.008));
    kit.put('Joints', steel,
      limb(knee.clone().setX(side * 0.07), knee.clone().setX(side * 0.114), 0.015, 0.015, 10),
      ball(ankle, 0.013),
      limb(ankle, v(side * 0.092, 0.014, -0.005), 0.009, 0.009),
      limb(v(side * 0.092, 0.2, -0.018), v(side * 0.092, 0.105, -0.032), 0.004, 0.004, 6),
      limb(v(side * 0.085, 0.262, 0), v(side * 0.1, 0.262, 0), 0.012, 0.012));
    for (const dy of [-0.008, 0.008]) kit.put('Barrels', steel, limb(v(side * 0.11, 0.268 + dy, 0.06), v(side * 0.11, 0.268 + dy, 0.115), 0.0065, 0.0055, 8));
  }
  kit.build(g);
  return g;
}

/** Tall and thin, long skull swept back, reverse knees, three long fingers. */
function alien(): Group {
  const g = new Group();
  g.name = 'Alien';
  const kit = new Kit();
  const { mesh: head, surface } = loft([
    sec(-0.046, 0.236, 0.006, 0.006),
    sec(-0.026, 0.228, 0.014, 0.014),
    sec(-0.001, 0.216, 0.019, 0.019, 0.017),
    sec(0.019, 0.21, 0.016, 0.014, 0.014),
    sec(0.031, 0.206, 0.009, 0.008, 0.009),
  ], 12);
  kit.put('BodySkin', primer, head, limb(v(0, 0.183, 0), v(0, 0.208, 0.004), 0.0065, 0.005), upright([
    { h: 0.098, halfW: 0.014, front: 0.011, back: 0.011 },
    { h: 0.125, halfW: 0.012, front: 0.009, back: 0.009 },
    { h: 0.155, halfW: 0.019, front: 0.013, back: 0.013 },
    { h: 0.175, halfW: 0.023, front: 0.012, back: 0.012 },
    { h: 0.188, halfW: 0.008, front: 0.007, back: 0.007 },
  ], 10));
  for (const side of SIDES) {
    kit.put('Eyes', lens, ball(onLoft(surface, 0.021, side > 0 ? 0.35 : Math.PI - 0.35), 0.0036, 0.0028, 0.0036, BEAD));
    const wrist = v(side * 0.036, 0.09, 0.008);
    kit.put('BodySkin', primer,
      ...chain([v(side * 0.016, 0.105, 0), v(side * 0.02, 0.068, 0.022), v(side * 0.02, 0.026, -0.01), v(side * 0.02, 0.006, 0.014)], [0.008, 0.006, 0.0045, 0.004]),
      ball(v(side * 0.02, 0.004, 0.014), 0.006, 0.004, 0.012),
      ball(v(side * 0.025, 0.176, 0), 0.0075),
      ...chain([v(side * 0.026, 0.176, 0), v(side * 0.034, 0.135, -0.008), wrist], [0.0055, 0.0045, 0.0038]));
    for (const [dx, dz] of [[-0.004, 0.006], [0.003, 0.008], [0.004, -0.002]]) kit.put('BodySkin', primer, limb(wrist, v(side * 0.038 + dx, 0.062, 0.012 + dz), 0.0026, 0.001, 6));
  }
  kit.build(g);
  return g;
}

/** A hooded sheet that hovers with its hem just off the floor and sways in place. */
function ghost(): Group {
  const g = new Group();
  g.name = 'Ghost';
  const drift = idleGroup('Drift', v(0, 0, 0), { kind: 'sway', axis: 'z', amount: 0.06, rate: 1.1 });
  const kit = new Kit();
  kit.put('BodySheet', sheet, upright([
    { h: 0.014, halfW: 0.068, front: 0.064, back: 0.064 },
    { h: 0.045, halfW: 0.056, front: 0.052, back: 0.054 },
    { h: 0.09, halfW: 0.045, front: 0.042, back: 0.045 },
    { h: 0.13, halfW: 0.042, front: 0.04, back: 0.042 },
    { h: 0.16, halfW: 0.04, front: 0.038, back: 0.04, fwd: 0.004 },
    { h: 0.185, halfW: 0.03, front: 0.03, back: 0.032, fwd: 0.006 },
    { h: 0.2, halfW: 0.008, front: 0.008, back: 0.01, fwd: 0.008 },
  ], 16));
  // Ragged hem: flat tongues hanging to just above the floor.
  for (let i = 0; i < 9; i += 1) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const out = v(Math.cos(a), 0, Math.sin(a));
    const tangent = v(-Math.sin(a), 0, Math.cos(a));
    kit.put('BodySheet', sheet, spike(out.clone().multiplyScalar(0.058).setY(0.024), out.clone().multiplyScalar(0.066).setY(0.003), 0.016, 0.35, tangent));
  }
  for (const side of SIDES) {
    kit.put('BodySheet', sheet,
      limb(v(side * 0.034, 0.128, 0.008), v(side * 0.052, 0.088, 0.044), 0.016, 0.012, 10),
      spike(v(side * 0.052, 0.09, 0.046), v(side * 0.056, 0.064, 0.05), 0.012, 0.4, v(0, 0, 1)));
    kit.put('Eyes', lens, ball(v(side * 0.009, 0.156, 0.049), 0.004, 0.005, 0.003, BEAD));
  }
  kit.put('Hood', voidDark, ball(v(0, 0.15, 0.035), 0.025, 0.03, 0.014));
  kit.build(drift);
  g.add(drift);
  return g;
}

/** Eight legs arched above a big abdomen, fangs and an eye cluster at the front. */
function spider(): Group {
  const g = new Group();
  g.name = 'Spider';
  const kit = new Kit();
  kit.put('BodyShell', primer, loft([
    sec(-0.1, 0.07, 0.005, 0.005),
    sec(-0.085, 0.075, 0.034, 0.032, 0.027),
    sec(-0.05, 0.076, 0.046, 0.041, 0.035),
    sec(-0.02, 0.066, 0.03, 0.024, 0.022),
    sec(-0.006, 0.056, 0.011, 0.01, 0.01),
    sec(0.006, 0.056, 0.024, 0.017, 0.014),
    sec(0.03, 0.058, 0.03, 0.02, 0.017),
    sec(0.055, 0.055, 0.02, 0.014, 0.012),
    sec(0.066, 0.052, 0.006, 0.006, 0.006),
  ], 12).mesh);
  const angles = [55, 22, -12, -42].map((d) => (d * Math.PI) / 180);
  for (const side of SIDES) {
    angles.forEach((a, i) => {
      const root = v(side * 0.022, 0.055, [0.045, 0.032, 0.019, 0.006][i]);
      const out = (r: number, y: number): Vector3 => root.clone().add(v(side * Math.cos(a) * r, y, Math.sin(a) * r));
      kit.put('BodyShell', primer, ...chain([root, out(0.07, 0.057), out(0.105, -0.03), out(0.122, -0.055)], [0.0065, 0.0055, 0.0035, 0.0018]));
    });
    kit.put('Fangs', bone, spike(v(side * 0.007, 0.049, 0.06), v(side * 0.005, 0.03, 0.068), 0.0042));
    kit.put('Eyes', eyeDark,
      ball(v(side * 0.007, 0.067, 0.056), 0.0048, 0.0048, 0.0048, BEAD),
      ball(v(side * 0.014, 0.064, 0.05), 0.003, 0.003, 0.003, BEAD),
      ball(v(side * 0.004, 0.072, 0.05), 0.0028, 0.0028, 0.0028, BEAD));
  }
  kit.build(g);
  return g;
}

/** Centre line of a tentacle at t in [0, 1]: out from the pool, then curling back over it. */
function tentacleAt(t: number, height: number, out: Vector3, across: Vector3): Vector3 {
  const lean = 0.06 * Math.sin(t * Math.PI * 0.9) - 0.07 * t * t * t;
  return out.clone().multiplyScalar(lean).addScaledVector(across, 0.02 * Math.sin(t * Math.PI * 2)).setY(t * height);
}

/** Three tentacles rising out of a dark pool, each swaying on its own. */
function kraken(): Group {
  const g = new Group();
  g.name = 'Kraken';
  const kit = new Kit();
  const pool = new Mesh(new CylinderGeometry(0.13, 0.13, 0.006, 28));
  pool.position.y = 0.003;
  const rim = new Mesh(new TorusGeometry(0.13, 0.006, 6, 28));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.004;
  kit.put('Pool', water, pool);
  kit.put('Foam', foam, rim);
  const tentacles: [number, number, number, number, 'x' | 'z', number][] = [
    [0, -0.035, 0.35, 0.03, 'x', 1.1],
    [-0.065, 0.035, 0.27, 0.025, 'z', 0.8],
    [0.06, 0.04, 0.22, 0.021, 'z', 1.35],
  ];
  tentacles.forEach(([x, z, height, radius, axis, rate], i) => {
    const out = v(x, 0, z).normalize();
    const across = v(-out.z, 0, out.x);
    const arm = idleGroup(`Tentacle${i}`, v(x, 0, z), { kind: 'sway', axis, amount: (i % 2 ? -1 : 1) * 0.12, rate });
    const rings: Ring[] = [];
    for (let k = 0; k <= 6; k += 1) {
      const t = k / 6;
      const c = tentacleAt(t, height, out, across);
      const r = radius * (1 - 0.88 * t);
      rings.push({ h: c.y, halfW: r, front: r, back: r, fwd: c.z, side: c.x });
    }
    const armKit = new Kit();
    armKit.put(`BodyTentacle${i}`, primer, upright(rings, 10));
    for (let k = 1; k <= 5; k += 1) {
      const t = 0.15 + k * 0.13;
      const r = radius * (1 - 0.88 * t);
      const at = tentacleAt(t, height, out, across).addScaledVector(out, -r * 0.92);
      armKit.put('Suckers', sucker, ball(at, r * 0.34, r * 0.34, r * 0.34, BEAD));
    }
    armKit.build(arm);
    g.add(arm);
    const ripple = new Mesh(new TorusGeometry(radius * 1.35, 0.003, 4, 16));
    ripple.rotation.x = Math.PI / 2;
    ripple.position.set(x, 0.006, z);
    kit.put('Foam', foam, ripple);
  });
  kit.build(g);
  return g;
}

/** A horse standing square; the Horn mesh is hidden until a look asks for a unicorn. */
function horse(): Group {
  const g = new Group();
  g.name = 'Horse';
  // Drawn at a round 1.95 m to the poll, fitted to 1.7 m.
  const kit = new Kit(0.872);
  const { mesh: head, surface } = loft([
    sec(0.075, 0.172, 0.012, 0.013, 0.012),
    sec(0.095, 0.163, 0.011, 0.012, 0.012),
    sec(0.12, 0.147, 0.009, 0.01, 0.011),
    sec(0.137, 0.137, 0.0075, 0.008, 0.009),
    sec(0.145, 0.133, 0.004, 0.005, 0.005),
  ], 10);
  kit.put('BodyCoat', primer, head, loft([
    sec(-0.085, 0.108, 0.016, 0.014, 0.016),
    sec(-0.07, 0.11, 0.028, 0.024, 0.026),
    sec(-0.035, 0.108, 0.031, 0.025, 0.03),
    sec(0.01, 0.107, 0.031, 0.024, 0.031),
    sec(0.045, 0.113, 0.028, 0.026, 0.028),
    sec(0.065, 0.118, 0.018, 0.02, 0.02),
    sec(0.072, 0.12, 0.006, 0.008, 0.008),
  ], 12).mesh, loft([
    sec(0.035, 0.118, 0.016, 0.026, 0.02),
    sec(0.06, 0.14, 0.014, 0.022, 0.018),
    sec(0.08, 0.16, 0.012, 0.016, 0.014),
    sec(0.09, 0.17, 0.01, 0.011, 0.011),
  ], 10).mesh);
  kit.put('Mane', hair,
    ...chain([v(0, 0.184, 0.079), v(0, 0.163, 0.058), v(0, 0.136, 0.034)], [0.0045, 0.0055, 0.004]),
    ...chain([v(0, 0.118, -0.083), v(0, 0.1, -0.1), v(0, 0.058, -0.104)], [0.005, 0.007, 0.0035]));
  kit.put('Horn', bone, spike(v(0, 0.177, 0.094), v(0, 0.203, 0.124), 0.0045));
  for (const side of SIDES) {
    kit.put('Eyes', eyeDark, ball(onLoft(surface, 0.1, side > 0 ? 0.45 : Math.PI - 0.45), 0.003, 0.003, 0.003, BEAD));
    kit.put('BodyCoat', primer,
      spike(v(side * 0.006, 0.178, 0.081), v(side * 0.008, 0.194, 0.075), 0.0035),
      ...chain([v(side * 0.018, 0.1, 0.045), v(side * 0.018, 0.06, 0.047), v(side * 0.018, 0.03, 0.046), v(side * 0.018, 0.01, 0.048)], [0.011, 0.0062, 0.0055, 0.0055]),
      ...chain([v(side * 0.019, 0.105, -0.058), v(side * 0.019, 0.07, -0.05), v(side * 0.019, 0.042, -0.072), v(side * 0.019, 0.01, -0.066)], [0.014, 0.009, 0.006, 0.0055]));
    kit.put('Hooves', horn,
      limb(v(side * 0.018, 0, 0.049), v(side * 0.018, 0.011, 0.048), 0.0075, 0.0062),
      limb(v(side * 0.019, 0, -0.065), v(side * 0.019, 0.011, -0.066), 0.0075, 0.0062));
  }
  kit.build(g);
  g.getObjectByName('Horn')!.visible = false;
  return g;
}

/** A wolf standing alert: ears up, long snout, tail hanging bushy. */
function wolf(): Group {
  const g = new Group();
  g.name = 'Wolf';
  // Drawn a touch large, fitted to 1 m at the ear tips.
  const kit = new Kit(0.91);
  const { mesh: head, surface } = loft([
    sec(0.035, 0.075, 0.014, 0.016, 0.016),
    sec(0.055, 0.085, 0.013, 0.015, 0.014),
    sec(0.07, 0.088, 0.014, 0.014, 0.012),
    sec(0.085, 0.084, 0.01, 0.009, 0.008),
    sec(0.1, 0.079, 0.006, 0.006, 0.005),
    sec(0.106, 0.078, 0.003, 0.003, 0.003),
  ], 10);
  kit.put('BodyCoat', primer, head, loft([
    sec(-0.07, 0.062, 0.012, 0.012),
    sec(-0.055, 0.064, 0.018, 0.017, 0.018),
    sec(-0.02, 0.066, 0.019, 0.018, 0.02),
    sec(0.02, 0.07, 0.021, 0.021, 0.024),
    sec(0.04, 0.074, 0.018, 0.02, 0.02),
    sec(0.05, 0.076, 0.01, 0.012, 0.012),
  ], 12).mesh, ...chain([v(0, 0.066, -0.065), v(0, 0.05, -0.085), v(0, 0.028, -0.092)], [0.006, 0.0095, 0.004]));
  kit.put('Nose', eyeDark, ball(v(0, 0.08, 0.106), 0.0032, 0.0028, 0.003, BEAD));
  for (const side of SIDES) {
    kit.put('Eyes', eyeGlow, ball(onLoft(surface, 0.078, side > 0 ? 0.5 : Math.PI - 0.5), 0.0024, 0.0024, 0.0024, BEAD));
    kit.put('BodyCoat', primer,
      spike(v(side * 0.008, 0.096, 0.066), v(side * 0.01, 0.11, 0.062), 0.0045, 0.5, v(0, 0, 1)),
      ...chain([v(side * 0.014, 0.06, 0.032), v(side * 0.014, 0.032, 0.034), v(side * 0.014, 0.01, 0.03), v(side * 0.014, 0.004, 0.036)], [0.007, 0.0045, 0.004, 0.0035]),
      ball(v(side * 0.014, 0.003, 0.037), 0.005, 0.003, 0.007),
      ...chain([v(side * 0.014, 0.062, -0.05), v(side * 0.014, 0.04, -0.04), v(side * 0.014, 0.022, -0.06), v(side * 0.014, 0.004, -0.054)], [0.009, 0.005, 0.004, 0.0035]),
      ball(v(side * 0.014, 0.003, -0.052), 0.005, 0.003, 0.007));
  }
  kit.build(g);
  return g;
}

export const dragonProp = dragon();
export const trollProp = troll();
export const dinosaurProp = dinosaur();
export const robotProp = robot();
export const alienProp = alien();
export const ghostProp = ghost();
export const spiderProp = spider();
export const krakenProp = kraken();
export const horseProp = horse();
export const wolfProp = wolf();
