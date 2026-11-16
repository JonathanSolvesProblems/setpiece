/**
 * Stand-ins at 1:10. Actors are wooden artist's lay figures (ball joints, a
 * round featureless head, a round base), because on a VFX set nothing on the
 * floor is the finished image. The creature is what it is on a real set: a
 * tennis ball on a stand, raised to the creature's eye height.
 * Origins at floor contact, figures face -Z. Named parts: Base, Post, Pelvis,
 * Torso, Neck, Head, Hair, and for each side LegUpper, Knee, Shoulder, ArmUpper, Hand;
 * EyelineBall, Stand. Sixteen meshes a figure: each is a draw call on the headset.
 */
import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

const SCALE = 0.1;
const UP = new Vector3(0, 1, 0);

const woodLight = new MeshStandardMaterial({ color: 0xd9ac8b, roughness: 0.62 });
const wood = new MeshStandardMaterial({ color: 0xa37a60, roughness: 0.66 });
const woodDark = new MeshStandardMaterial({ color: 0x64453e, roughness: 0.7 });
/** The joints: the same wood a shade darker, as on an artist's lay figure, not a dark ball on a pale limb. */
const joint = new MeshStandardMaterial({ color: 0x8c654c, roughness: 0.66 });
const slateShadow = new MeshStandardMaterial({ color: 0x1e232b, roughness: 0.9 });
const steel = new MeshStandardMaterial({ color: 0x6f6c6b, roughness: 0.5, metalness: 0.6 });
const felt = new MeshStandardMaterial({ color: 0xd6e13c, roughness: 1 });
const hairDark = new MeshStandardMaterial({ color: 0x2a211d, roughness: 0.85 });

/** A capsule whose axis runs from a to b. */
function limb(a: Vector3, b: Vector3, r: number, material: MeshStandardMaterial, name: string): Mesh {
  const dir = new Vector3().subVectors(b, a);
  const len = Math.max(dir.length() - 2 * r, 0.001);
  const mesh = new Mesh(new CapsuleGeometry(r, len, 3, 10), material);
  mesh.name = name;
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.copy(new Quaternion().setFromUnitVectors(UP, dir.normalize()));
  return mesh;
}

/**
 * Bakes other parts into this one, in its own frame, so the lot is drawn as one mesh. The part keeps
 * its name, its position and its material; position, normal and the grain's texture coordinates come along.
 * Only for parts in the same wood that never move apart: a forearm into its upper arm, a foot into its knee.
 */
function absorb(into: Mesh, ...others: Mesh[]): Mesh {
  const flat = (geometry: BufferGeometry): BufferGeometry => (geometry.index ? geometry.toNonIndexed() : geometry.clone());
  into.updateMatrix();
  const inverse = new Matrix4().copy(into.matrix).invert();
  const parts = [flat(into.geometry)];
  for (const other of others) {
    other.updateMatrix();
    parts.push(flat(other.geometry).applyMatrix4(new Matrix4().multiplyMatrices(inverse, other.matrix)));
  }
  let count = 0;
  for (const part of parts) count += part.getAttribute('position').count;
  const position = new Float32Array(count * 3);
  const normal = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let at = 0;
  for (const part of parts) {
    position.set(part.getAttribute('position').array as Float32Array, at * 3);
    normal.set(part.getAttribute('normal').array as Float32Array, at * 3);
    uv.set(part.getAttribute('uv').array as Float32Array, at * 2);
    at += part.getAttribute('position').count;
  }
  const merged = new BufferGeometry();
  merged.setAttribute('position', new BufferAttribute(position, 3));
  merged.setAttribute('normal', new BufferAttribute(normal, 3));
  merged.setAttribute('uv', new BufferAttribute(uv, 2));
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  into.geometry = merged;
  return into;
}

/** A lay figure's hand: a flat paddle carried on from the forearm, not a ball. */
function hand(elbow: Vector3, wrist: Vector3, h: number, tag: 'L' | 'R'): Mesh {
  const along = new Vector3().subVectors(wrist, elbow).normalize();
  const mesh = ball(wrist.clone().addScaledVector(along, 0.022 * h), 0.034 * h, woodLight, `Hand${tag}`);
  mesh.quaternion.setFromUnitVectors(UP, along);
  mesh.scale.set(0.82, 1.45, 0.5);
  return mesh;
}

function ball(at: Vector3, r: number, material: MeshStandardMaterial, name: string): Mesh {
  const mesh = new Mesh(new SphereGeometry(r, 14, 10), material);
  mesh.name = name;
  mesh.position.copy(at);
  return mesh;
}

/**
 * A stance for a lay figure, the way a stand-in is posed for a blocking
 * rehearsal: one arm pointing at the mark, a hand on the hip, a step forward.
 * The figure's front is +z.
 */
export type Stance = {
  pointing?: 'L' | 'R';
  akimbo?: 'L' | 'R';
  step?: 'L' | 'R';
  /** Both arms up: a surrender, or a hand against the light. */
  armsUp?: boolean;
  /** Mid-stride with the arms driving. */
  running?: boolean;
  /** One arm straight out at the shoulder, with a wooden prop pistol in the hand. */
  aiming?: 'L' | 'R';
  /** Down on bent knees with the back leaning forward and the hands by the knees: hiding behind cover. */
  crouching?: boolean;
};

/**
 * The prop, in the same dark wood as the joints: a block for the slide and a
 * block for the grip, cut a little over scale so it reads from across a table.
 * The name keeps it on the arm when the figure moves.
 */
function propPistol(hand: Vector3, tag: 'L' | 'R'): Mesh {
  const slide = new Mesh(new BoxGeometry(0.0034, 0.0044, 0.024), woodDark);
  slide.name = `Pistol${tag}`;
  slide.position.set(hand.x, hand.y + 0.0045, hand.z + 0.0085);
  const grip = new Mesh(new BoxGeometry(0.0032, 0.0098, 0.0048), woodDark);
  grip.position.set(0, -0.0058, -0.0075);
  grip.rotation.x = -0.25;
  slide.add(grip);
  return slide;
}

/**
 * A woman's lay figure is made in her proportions, as artists' figures are: shoulders and limbs narrower, a waist,
 * the hips wider, the head a little smaller. The parts and their names are the same, so poses, looks and the squirm
 * work on both.
 */
const WOMAN = { shoulders: 0.86, waist: 0.84, hips: 1.18, limbs: 0.88, head: 0.94 };
const MAN = { shoulders: 1, waist: 1, hips: 1, limbs: 1, head: 1 };

export function layFigure(name: string, realHeightM: number, stance: Stance = {}, woman = false): Group {
  const h = realHeightM * SCALE;
  const build = woman ? WOMAN : MAN;
  const g = new Group();
  g.name = name;
  const base = new Mesh(new CylinderGeometry(0.11 * h, 0.12 * h, 0.004, 20), slateShadow);
  base.name = 'Base';
  base.position.y = 0.002;
  const low = stance.crouching === true;
  // Crouched, the hips drop to knee height and the back leans in over the knees: everything above the hips keeps
  // its length and tips forward with it.
  const hipY = (low ? 0.3 : 0.5) * h;
  const lean = low ? 0.42 : 0;
  const up = (above: number): Vector3 => new Vector3(0, hipY + above * h * Math.cos(lean), above * h * Math.sin(lean) - (low ? 0.05 * h : 0));
  const post = new Mesh(new CylinderGeometry(0.0022, 0.0022, hipY, 8), steel);
  post.name = 'Post';
  post.position.set(0, hipY / 2, low ? -0.05 * h : 0);
  const pelvis = ball(up(0), 0.1 * h, wood, 'Pelvis');
  pelvis.scale.set(1.1 * build.hips, 0.8, 0.82 * (woman ? 1.08 : 1));
  const torso = limb(up(0.02), up(0.28), 0.1 * h * build.waist, woodLight, 'Torso');
  const chest = ball(up(0.26), 0.12 * h, woodLight, 'Chest');
  chest.scale.set(1.25 * build.shoulders, 0.7, woman ? 0.98 : 0.85);
  const neck = ball(up(0.36), 0.04 * h, joint, 'Neck');
  // The head stays up: someone hiding is still watching.
  const head = ball(up(0.36).add(new Vector3(0, 0.065 * h, low ? 0.012 * h : 0)), 0.075 * h * build.head, woodLight, 'Head');
  head.scale.set(0.95, 1.1, 1);
  // The chest is carved into the torso: one piece of wood, one coat.
  g.add(base, post, pelvis, absorb(torso, chest), neck, head);
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const stepping = stance.step === tag;
    const hip = new Vector3(side * 0.07 * h * build.hips, hipY - 0.02 * h, low ? -0.05 * h : 0);
    let knee = new Vector3(side * 0.075 * h, stepping ? 0.28 * h : 0.27 * h, stepping ? 0.07 * h : 0.01 * h);
    let ankle = new Vector3(side * 0.075 * h, 0.05 * h, stepping ? 0.09 * h : 0);
    if (stance.running) {
      // One leg driving forward, the other trailing off the ground.
      const fore = side > 0;
      knee = new Vector3(side * 0.075 * h, fore ? 0.36 * h : 0.26 * h, fore ? 0.17 * h : -0.08 * h);
      ankle = new Vector3(side * 0.075 * h, fore ? 0.14 * h : 0.2 * h, fore ? 0.14 * h : -0.26 * h);
    }
    if (low) {
      // Thighs forward and level, shins dropping back under them to feet flat on the ground.
      knee = new Vector3(side * 0.1 * h, 0.3 * h, 0.17 * h);
      ankle = new Vector3(side * 0.085 * h, 0.05 * h, 0.06 * h);
    }
    const foot = ball(
      low
        ? new Vector3(side * 0.085 * h, 0.035 * h, 0.09 * h)
        : stance.running
        ? ankle.clone().add(new Vector3(0, -0.015 * h, 0.03 * h))
        : new Vector3(side * 0.075 * h, 0.035 * h, (stepping ? 0.11 : 0.02) * h),
      0.04 * h,
      joint,
      `Foot${tag}`,
    );
    foot.scale.set(0.8, 0.55, 1.45);
    // A leg swings as one from the hip: thigh and shin are one mesh, knee and foot another.
    g.add(
      absorb(limb(hip, knee, 0.05 * h * build.limbs, wood, `Leg${tag}Upper`), limb(knee, ankle, 0.042 * h * build.limbs, wood, `Leg${tag}Lower`)),
      absorb(ball(knee, 0.047 * h, joint, `Knee${tag}`), foot),
    );
    const shoulder = low ? up(0.3).setX(side * 0.16 * h) : new Vector3(side * 0.16 * h, 0.8 * h, 0);
    let elbow = new Vector3(side * 0.19 * h, 0.62 * h, -0.01 * h);
    let wrist = new Vector3(side * 0.16 * h, 0.45 * h, -0.05 * h);
    if (low) {
      // Arms forward, hands resting just above the knees.
      elbow = new Vector3(side * 0.2 * h, 0.4 * h, 0.13 * h);
      wrist = new Vector3(side * 0.12 * h, 0.36 * h, 0.24 * h);
    }
    if (low) {
      // (set above)
    } else if (stance.aiming === tag) {
      elbow = new Vector3(side * 0.12 * h, 0.8 * h, 0.17 * h);
      wrist = new Vector3(side * 0.05 * h, 0.81 * h, 0.33 * h);
    } else if (stance.pointing === tag) {
      // Arm raised toward the mark in front of the figure.
      elbow = new Vector3(side * 0.19 * h, 0.74 * h, 0.13 * h);
      wrist = new Vector3(side * 0.15 * h, 0.82 * h, 0.3 * h);
    } else if (stance.akimbo === tag) {
      elbow = new Vector3(side * 0.25 * h, 0.64 * h, -0.03 * h);
      wrist = new Vector3(side * 0.12 * h, 0.5 * h, 0.03 * h);
    } else if (stance.armsUp) {
      elbow = new Vector3(side * 0.25 * h, 0.9 * h, 0.02 * h);
      wrist = new Vector3(side * 0.2 * h, 1.04 * h, 0.05 * h);
    } else if (stance.running) {
      const fore = side < 0;
      elbow = new Vector3(side * 0.2 * h, 0.66 * h, fore ? 0.1 * h : -0.12 * h);
      wrist = new Vector3(side * 0.16 * h, fore ? 0.74 * h : 0.6 * h, fore ? 0.22 * h : -0.06 * h);
    }
    // Narrower shoulders carry the arm in with them.
    shoulder.x *= build.shoulders;
    elbow.x *= build.shoulders;
    wrist.x *= build.shoulders;
    // An arm swings as one from the shoulder: both lengths are one mesh, shoulder and elbow another.
    g.add(
      absorb(ball(shoulder, 0.044 * h, joint, `Shoulder${tag}`), ball(elbow, 0.037 * h, joint, `Elbow${tag}`)),
      absorb(limb(shoulder, elbow, 0.04 * h * build.limbs, wood, `Arm${tag}Upper`), limb(elbow, wrist, 0.035 * h * build.limbs, wood, `Arm${tag}Lower`)),
      hand(elbow, wrist, h, tag),
    );
    if (stance.aiming === tag) g.add(propPistol(wrist, tag));
  }
  return g;
}

/** The creature's eyeline: a tennis ball on a stand, ball centre at eyeHeight. */
export function eyelineStand(eyeHeight: number): Group {
  const g = new Group();
  g.name = 'Eyeline';
  const foot = new Mesh(new CylinderGeometry(0.022, 0.024, 0.004, 20), slateShadow);
  foot.name = 'Base';
  foot.position.y = 0.002;
  const post = new Mesh(new CylinderGeometry(0.0025, 0.003, eyeHeight - 0.012, 10), steel);
  post.name = 'Stand';
  post.position.y = (eyeHeight - 0.012) / 2 + 0.004;
  const knuckle = new Mesh(new CylinderGeometry(0.005, 0.005, 0.012, 10), slateShadow);
  knuckle.name = 'Knuckle';
  knuckle.position.y = eyeHeight * 0.55;
  const tennis = ball(new Vector3(0, eyeHeight, 0), 0.0135, felt, 'EyelineBall');
  g.add(foot, post, knuckle, tennis);
  return g;
}

/**
 * One stand-in with several poses, of which one shows. A hair cap sits with each
 * pose and stays hidden until a look asks for it.
 */
function castFigure(name: string, realHeightM: number, stances: Stance[]): Group {
  const g = new Group();
  g.name = name;
  const h = realHeightM * SCALE;
  stances.forEach((stance, i) => {
    const pose = layFigure(`Pose${i}`, realHeightM, stance);
    // Hair goes where the head is: a crouched figure's head is lower and further forward than a standing one's.
    const moved = (figure: Group, height: number): Vector3 => (figure.getObjectByName('Head')?.position.clone() ?? new Vector3(0, 0.925 * height, 0)).sub(new Vector3(0, 0.925 * height, 0));
    const hair = ball(new Vector3(0, 0.945 * h, -0.008 * h).add(moved(pose, h)), 0.08 * h, hairDark, 'Hair');
    hair.scale.set(1, 0.8, 1.02);
    hair.visible = false;
    pose.add(hair);
    pose.visible = i === 0;
    g.add(pose);
    // The same actor in a woman's build, a little shorter, with her hair to the shoulders: she wears it in every
    // look, so she reads as a woman from across the table even in bare wood.
    const hw = h * 0.96;
    const her = layFigure(`Pose${i}W`, realHeightM * 0.96, stance, true);
    const cap = ball(new Vector3(0, 0.95 * hw, -0.01 * hw).add(moved(her, hw)), 0.077 * hw, hairDark, 'HairLong');
    cap.scale.set(1.04, 0.86, 1.06);
    const fall = ball(new Vector3(0, 0.875 * hw, -0.04 * hw).add(moved(her, hw)), 0.07 * hw, hairDark, 'HairLong');
    fall.scale.set(1.08, 1.25, 0.62);
    her.add(cap, fall);
    her.visible = false;
    g.add(her);
  });
  return g;
}

const neutral: Stance = {};
const armsUp: Stance = { armsUp: true };
const running: Stance = { running: true };
const aiming: Stance = { aiming: 'R', step: 'L' };
const crouching: Stance = { crouching: true };

export const actorA = castFigure('ActorA', 1.7, [{ pointing: 'R' }, neutral, armsUp, running, aiming, crouching]);
export const actorB = castFigure('ActorB', 1.65, [{ akimbo: 'L', step: 'R' }, neutral, armsUp, running, aiming, crouching]);
export const actorC = castFigure('ActorC', 1.78, [neutral, { step: 'L' }, armsUp, running, aiming, crouching]);
export const actorD = castFigure('ActorD', 1.6, [neutral, { pointing: 'L' }, armsUp, running, aiming, crouching]);
export const creature = eyelineStand(0.33);
