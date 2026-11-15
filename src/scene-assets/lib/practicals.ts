/**
 * The set's own lights: a house's windows and a street lamp's bulb. Every piece that has them shares these
 * materials, so src/set-light.ts turns them up as the set's light falls (lit windows and a burning lamp at night)
 * without finding each piece. Plain materials, no side effects: this module is read by the app and the editor.
 */
import { AdditiveBlending, BufferAttribute, MeshBasicMaterial, MeshStandardMaterial, RingGeometry } from '@iwsdk/core';

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
