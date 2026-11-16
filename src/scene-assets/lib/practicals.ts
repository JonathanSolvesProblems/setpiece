/**
 * The set's own lights: a house's windows and a street lamp's bulb. Every piece that has them shares these
 * materials, so src/set-light.ts turns them up as the set's light falls (lit windows and a burning lamp at night)
 * without finding each piece. Plain materials, no side effects: this module is read by the app and the editor.
 */
import { AdditiveBlending, BufferAttribute, BufferGeometry, MeshBasicMaterial, MeshStandardMaterial, RingGeometry, SphereGeometry } from '@iwsdk/core';

/** Window glass: dark by day, warm from inside at dusk and at night. */
export const WINDOW_GLASS = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3, emissive: 0xffb45c, emissiveIntensity: 0 });
/** A street lamp's bulb. */
export const LAMP_GLOW = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.9 });
/**
 * The warm pool a street lamp throws on the ground, added over what is under it, and strong only as the light falls.
 * Always drawn (at nothing by day) so its shader is compiled with the rest before a set goes up, never mid-set.
 */
export const LAMP_POOL = new MeshBasicMaterial({ vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, opacity: 0 });

/** A flat disc, brightest in the middle and gone at the rim, coloured in its vertices so it needs no texture. */
export function poolGeometry(radius: number): RingGeometry {
  const ring = new RingGeometry(0, radius, 32, 6);
  const at = ring.getAttribute('position');
  const colours = new Float32Array(at.count * 3);
  for (let i = 0; i < at.count; i++) {
    const out = Math.min(1, Math.hypot(at.getX(i), at.getY(i)) / radius);
    const k = (1 - out) * (1 - out);
    colours.set([1 * k, 0.72 * k, 0.4 * k], i * 3);
  }
  ring.setAttribute('color', new BufferAttribute(colours, 3));
  ring.rotateX(-Math.PI / 2);
  return ring;
}

/**
 * The glow round a burning lamp: three shells one inside the other, each adding a little warm light, so it is
 * brightest at the bulb and gone at its edge from wherever it is seen. One mesh, coloured in its vertices, drawn
 * with the pool's own material, so it comes up with the pool as the light falls and costs no shader of its own.
 */
export function haloGeometry(radius: number): BufferGeometry {
  const shells = [
    [1, 0.07],
    [0.6, 0.16],
    [0.3, 0.42],
  ] as const;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  for (const [share, light] of shells) {
    const shell = new SphereGeometry(radius * share, 14, 10);
    const at = shell.getAttribute('position');
    const first = positions.length / 3;
    for (let i = 0; i < at.count; i++) {
      positions.push(at.getX(i), at.getY(i), at.getZ(i));
      colours.push(light, light * 0.74, light * 0.42);
    }
    const faces = shell.getIndex();
    if (faces != null) for (let i = 0; i < faces.count; i++) index.push(first + faces.getX(i));
    shell.dispose();
  }
  const halo = new BufferGeometry();
  halo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  halo.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  halo.setIndex(index);
  return halo;
}
