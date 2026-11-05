/**
 * Set dressing a director adds from the tray, at 1:10. The car is a generic
 * saloon in grey primer: previs shows where a car is, never whose. Origin at
 * floor contact, front along +Z.
 */
import { CylinderGeometry, ExtrudeGeometry, Group, Mesh, MeshStandardMaterial, Shape } from '@iwsdk/core';

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
