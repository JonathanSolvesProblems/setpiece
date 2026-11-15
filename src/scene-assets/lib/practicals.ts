/**
 * The set's own lights: a house's windows and a street lamp's bulb. Every piece that has them shares these
 * materials, so src/set-light.ts turns them up as the set's light falls (lit windows and a burning lamp at night)
 * without finding each piece. Plain materials, no side effects: this module is read by the app and the editor.
 */
import { MeshStandardMaterial } from '@iwsdk/core';

/** Window glass: dark by day, warm from inside at dusk and at night. */
export const WINDOW_GLASS = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3, emissive: 0xffb45c, emissiveIntensity: 0 });
/** A street lamp's bulb. */
export const LAMP_GLOW = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.9 });
