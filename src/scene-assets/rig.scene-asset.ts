/**
 * The stage is a clapper slate: a matte slate plate with the clapper stripe
 * along its front edge and a strip on the left for the field labels (the
 * strip's texture is drawn at runtime by SlateSystem). The camera is a 35 mm
 * film camera on a tripod: body, magazine, matte box, lens, red tally.
 * Stage origin: centre of the top surface. Camera origin: base contact, lens -Z.
 */
import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  SphereGeometry,
} from '@iwsdk/core';

export const STAGE_WIDTH = 0.6;
export const STAGE_DEPTH = 0.4;
export const STAGE_THICKNESS = 0.012;
export const STRIP_DEPTH = 0.08;

const slate = new MeshStandardMaterial({ color: 0x3f4044, roughness: 0.95 });
const slateShadow = new MeshStandardMaterial({ color: 0x1e232b, roughness: 0.92 });
const chalk = new MeshStandardMaterial({ color: 0xf6f7ef, roughness: 0.9 });
const chrome = new MeshStandardMaterial({ color: 0xc5c5c5, roughness: 0.35, metalness: 0.8 });
const tallyRed = new MeshStandardMaterial({ color: 0xe0352b, emissive: 0xe0352b, emissiveIntensity: 1.2 });

/** Alternating chalk and slate diagonals, the clapper stick, along the front edge. */
function clapperStripe(length: number, height: number, depth: number): Group {
  const g = new Group();
  g.name = 'ClapperStripe';
  const stripeW = length / 24;
  for (let i = 0; i < 24; i++) {
    const x0 = -length / 2 + i * stripeW;
    const shape = new Shape();
    shape.moveTo(x0 - height, 0);
    shape.lineTo(x0 - height + stripeW, 0);
    shape.lineTo(x0 + stripeW, height);
    shape.lineTo(x0, height);
    shape.closePath();
    const geometry = new ExtrudeGeometry(shape, { depth, bevelEnabled: false });
    const mesh = new Mesh(geometry, i % 2 === 0 ? chalk : slateShadow);
    mesh.name = i % 2 === 0 ? 'StripeChalk' : 'StripeSlate';
    g.add(mesh);
  }
  // Worn ends: the paint is gone at the corners, so the last stripes are slate.
  return g;
}

function stage(): Group {
  const g = new Group();
  g.name = 'Stage';
  const plate = new Mesh(new BoxGeometry(STAGE_WIDTH, STAGE_THICKNESS, STAGE_DEPTH), slate);
  plate.name = 'Plate';
  plate.position.y = -STAGE_THICKNESS / 2;
  const rim = new Mesh(new BoxGeometry(STAGE_WIDTH + 0.004, STAGE_THICKNESS * 0.5, STAGE_DEPTH + 0.004), slateShadow);
  rim.name = 'Rim';
  rim.position.y = -STAGE_THICKNESS * 0.75;
  const stripe = clapperStripe(STAGE_WIDTH, STAGE_THICKNESS, 0.012);
  stripe.position.set(0, -STAGE_THICKNESS, STAGE_DEPTH / 2 - 0.009);
  // The field strip runs along the back edge, the way a slate carries its
  // title across the top: read from the user's seat, nothing stands on it.
  const strip = new Mesh(new PlaneGeometry(STAGE_WIDTH - 0.04, STRIP_DEPTH), new MeshBasicMaterial({ color: 0x3f4044 }));
  strip.name = 'Strip';
  strip.rotation.x = -Math.PI / 2;
  strip.position.set(0, 0.0006, -STAGE_DEPTH / 2 + STRIP_DEPTH / 2 + 0.012);
  g.add(plate, rim, stripe, strip);
  return g;
}

function filmCamera(): Group {
  const g = new Group();
  g.name = 'CameraRig';
  const base = new Mesh(new CylinderGeometry(0.02, 0.022, 0.004, 20), slateShadow);
  base.name = 'Base';
  base.position.y = 0.002;
  const post = new Mesh(new CylinderGeometry(0.0035, 0.004, 0.1, 10), chrome);
  post.name = 'Post';
  post.position.y = 0.054;
  for (let i = 0; i < 3; i++) {
    const leg = new Mesh(new CylinderGeometry(0.0015, 0.0015, 0.06, 6), chrome);
    leg.name = `Leg${i + 1}`;
    const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
    leg.position.set(Math.cos(a) * 0.012, 0.03, Math.sin(a) * 0.012);
    leg.rotation.z = -Math.cos(a) * 0.38;
    leg.rotation.x = Math.sin(a) * 0.38;
    g.add(leg);
  }
  const head = new Mesh(new BoxGeometry(0.016, 0.008, 0.016), slateShadow);
  head.name = 'TripodHead';
  head.position.y = 0.108;
  const body = new Mesh(new BoxGeometry(0.03, 0.028, 0.056), slateShadow);
  body.name = 'Body';
  body.position.set(0, 0.126, 0.004);
  for (const [x, nm] of [[-0.013, 'MagazineFeed'], [0.013, 'MagazineTake']] as [number, string][]) {
    const mag = new Mesh(new CylinderGeometry(0.014, 0.014, 0.01, 18), slateShadow);
    mag.name = nm;
    mag.rotation.x = Math.PI / 2;
    mag.position.set(x, 0.152, 0.016);
    const latch = new Mesh(new CylinderGeometry(0.004, 0.004, 0.012, 10), chrome);
    latch.name = `${nm}Latch`;
    latch.rotation.x = Math.PI / 2;
    latch.position.set(x, 0.152, 0.016);
    g.add(mag, latch);
  }
  const lens = new Mesh(new CylinderGeometry(0.0085, 0.0105, 0.028, 16), slateShadow);
  lens.name = 'Lens';
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.124, -0.038);
  const ring = new Mesh(new CylinderGeometry(0.0115, 0.0115, 0.004, 16), chrome);
  ring.name = 'FocusRing';
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.124, -0.03);
  const matteBox = new Mesh(new BoxGeometry(0.03, 0.024, 0.01), slateShadow);
  matteBox.name = 'MatteBox';
  matteBox.position.set(0, 0.126, -0.056);
  const eyepiece = new Mesh(new CylinderGeometry(0.004, 0.005, 0.014, 10), slateShadow);
  eyepiece.name = 'Eyepiece';
  eyepiece.rotation.x = Math.PI / 2;
  eyepiece.position.set(0.012, 0.134, 0.036);
  const tally = new Mesh(new SphereGeometry(0.0028, 8, 6), tallyRed);
  tally.name = 'Tally';
  tally.position.set(-0.012, 0.142, -0.02);
  g.add(base, post, head, body, lens, ring, matteBox, eyepiece, tally, droneFrame());
  return g;
}

/**
 * The same camera flown instead of stood: a quadcopter frame above the body,
 * hidden until the rig is switched. Its rotors are named so they can spin.
 */
function droneFrame(): Group {
  const g = new Group();
  g.name = 'DroneFrame';
  g.position.y = 0.176;
  g.visible = false;
  const plate = new Mesh(new CylinderGeometry(0.022, 0.026, 0.01, 16), slateShadow);
  plate.name = 'DronePlate';
  const mast = new Mesh(new CylinderGeometry(0.003, 0.003, 0.012, 8), chrome);
  mast.name = 'DroneMast';
  mast.position.y = -0.011;
  g.add(plate, mast);
  const reach = 0.078;
  const blade = new BoxGeometry(0.075, 0.0012, 0.007);
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = new Mesh(new BoxGeometry(reach, 0.0045, 0.008), slateShadow);
    arm.name = `DroneArm${i + 1}`;
    arm.position.set((Math.cos(a) * reach) / 2, 0, (Math.sin(a) * reach) / 2);
    arm.rotation.y = -a;
    const motor = new Mesh(new CylinderGeometry(0.0075, 0.0085, 0.011, 12), chrome);
    motor.name = `DroneMotor${i + 1}`;
    motor.position.set(Math.cos(a) * reach, 0.005, Math.sin(a) * reach);
    const rotor = new Mesh(blade, slateShadow);
    rotor.name = `DroneRotor${i + 1}`;
    rotor.position.set(Math.cos(a) * reach, 0.0125, Math.sin(a) * reach);
    g.add(arm, motor, rotor);
  }
  return g;
}

export const stagePlate = stage();
export const cameraRigModel = filmCamera();
