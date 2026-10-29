/**
 * Stand-ins at 1:10. Actors are wooden artist's lay figures (ball joints, a
 * round featureless head, a round base), because on a VFX set nothing on the
 * floor is the finished image. The creature is what it is on a real set: a
 * tennis ball on a stand, raised to the creature's eye height.
 * Origins at floor contact, figures face -Z. Named parts: Base, Post, Pelvis,
 * Torso, Chest, Neck, Head, LegL/LegR, ArmL/ArmR; EyelineBall, Stand.
 */
import {
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  Vector3,
} from '@iwsdk/core';

const SCALE = 0.1;
const UP = new Vector3(0, 1, 0);

const woodLight = new MeshStandardMaterial({ color: 0xd9ac8b, roughness: 0.62 });
const wood = new MeshStandardMaterial({ color: 0xa37a60, roughness: 0.66 });
const woodDark = new MeshStandardMaterial({ color: 0x64453e, roughness: 0.7 });
const slateShadow = new MeshStandardMaterial({ color: 0x1e232b, roughness: 0.9 });
const steel = new MeshStandardMaterial({ color: 0x6f6c6b, roughness: 0.5, metalness: 0.6 });
const felt = new MeshStandardMaterial({ color: 0xd6e13c, roughness: 1 });

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
export type Stance = { pointing?: 'L' | 'R'; akimbo?: 'L' | 'R'; step?: 'L' | 'R' };

export function layFigure(name: string, realHeightM: number, stance: Stance = {}): Group {
  const h = realHeightM * SCALE;
  const g = new Group();
  g.name = name;
  const base = new Mesh(new CylinderGeometry(0.11 * h, 0.12 * h, 0.004, 20), slateShadow);
  base.name = 'Base';
  base.position.y = 0.002;
  const hipY = 0.5 * h;
  const post = new Mesh(new CylinderGeometry(0.0022, 0.0022, hipY, 8), steel);
  post.name = 'Post';
  post.position.y = hipY / 2;
  const pelvis = ball(new Vector3(0, hipY, 0), 0.11 * h, woodDark, 'Pelvis');
  pelvis.scale.set(1.15, 0.85, 0.9);
  const torso = limb(new Vector3(0, hipY + 0.02 * h, 0), new Vector3(0, 0.78 * h, 0), 0.1 * h, woodLight, 'Torso');
  const chest = ball(new Vector3(0, 0.76 * h, 0), 0.12 * h, woodLight, 'Chest');
  chest.scale.set(1.25, 0.7, 0.85);
  const neck = ball(new Vector3(0, 0.86 * h, 0), 0.045 * h, woodDark, 'Neck');
  const head = ball(new Vector3(0, 0.925 * h, 0), 0.075 * h, woodLight, 'Head');
  head.scale.set(0.95, 1.1, 1);
  g.add(base, post, pelvis, torso, chest, neck, head);
  for (const side of [-1, 1]) {
    const tag = side < 0 ? 'L' : 'R';
    const stepping = stance.step === tag;
    const hip = new Vector3(side * 0.07 * h, hipY - 0.02 * h, 0);
    const knee = new Vector3(side * 0.075 * h, stepping ? 0.28 * h : 0.27 * h, stepping ? 0.07 * h : 0.01 * h);
    const ankle = new Vector3(side * 0.075 * h, 0.05 * h, stepping ? 0.09 * h : 0);
    g.add(
      limb(hip, knee, 0.05 * h, wood, `Leg${tag}Upper`),
      ball(knee, 0.052 * h, woodDark, `Knee${tag}`),
      limb(knee, ankle, 0.042 * h, wood, `Leg${tag}Lower`),
      ball(new Vector3(side * 0.075 * h, 0.035 * h, (stepping ? 0.11 : 0.02) * h), 0.04 * h, woodDark, `Foot${tag}`),
    );
    const shoulder = new Vector3(side * 0.16 * h, 0.8 * h, 0);
    let elbow = new Vector3(side * 0.19 * h, 0.62 * h, -0.01 * h);
    let wrist = new Vector3(side * 0.16 * h, 0.45 * h, -0.05 * h);
    if (stance.pointing === tag) {
      // Arm raised toward the mark in front of the figure.
      elbow = new Vector3(side * 0.19 * h, 0.74 * h, 0.13 * h);
      wrist = new Vector3(side * 0.15 * h, 0.82 * h, 0.3 * h);
    } else if (stance.akimbo === tag) {
      elbow = new Vector3(side * 0.25 * h, 0.64 * h, -0.03 * h);
      wrist = new Vector3(side * 0.12 * h, 0.5 * h, 0.03 * h);
    }
    g.add(
      ball(shoulder, 0.05 * h, woodDark, `Shoulder${tag}`),
      limb(shoulder, elbow, 0.04 * h, wood, `Arm${tag}Upper`),
      ball(elbow, 0.042 * h, woodDark, `Elbow${tag}`),
      limb(elbow, wrist, 0.035 * h, wood, `Arm${tag}Lower`),
      ball(wrist, 0.04 * h, woodLight, `Hand${tag}`),
    );
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

const _keep: Object3D[] = [];
void _keep;

export const actorA = layFigure('ActorA', 1.7, { pointing: 'R' });
export const actorB = layFigure('ActorB', 1.65, { akimbo: 'L', step: 'R' });
export const creature = eyelineStand(0.33);
