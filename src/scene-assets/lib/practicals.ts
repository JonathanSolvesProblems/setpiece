/**
 * The set's own lights: a house's windows and a street lamp's bulb. Every piece that has them shares these
 * materials, so src/set-light.ts turns them up as the set's light falls (lit windows and a burning lamp at night)
 * without finding each piece. Plain materials, no side effects: this module is read by the app and the editor.
 */
import { AddEquation, BufferAttribute, BufferGeometry, CustomBlending, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, OneFactor, RingGeometry, SphereGeometry, SrcAlphaFactor, ZeroFactor } from '@iwsdk/core';

/** Window glass: dark by day, warm from inside at dusk and at night. */
export const WINDOW_GLASS = new MeshStandardMaterial({ color: 0x20262e, roughness: 0.25, metalness: 0.3, emissive: 0xffb45c, emissiveIntensity: 0 });
/** A street lamp's bulb. */
export const LAMP_GLOW = new MeshStandardMaterial({ color: 0xfff2c4, emissive: 0xffe6a0, emissiveIntensity: 0.9 });
/**
 * The warm pool a street lamp throws on the ground, added over what is under it, and strong only as the light falls.
 * Always drawn (at nothing by day) so its shader is compiled with the rest before a set goes up, never mid-set.
 * It adds its light to the picture and leaves the picture's cover alone: in a headset the room shows wherever
 * nothing is drawn, and light that also added cover laid a grey shape over the room around every lamp.
 */
export const LAMP_POOL = new MeshBasicMaterial({
  vertexColors: true,
  transparent: true,
  blending: CustomBlending,
  blendEquation: AddEquation,
  blendSrc: SrcAlphaFactor,
  blendDst: OneFactor,
  blendSrcAlpha: ZeroFactor,
  blendDstAlpha: OneFactor,
  depthWrite: false,
  opacity: 0,
});

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
export function haloGeometry(radius: number, around = 14, up = 10): BufferGeometry {
  const shells = [
    [1, 0.07],
    [0.6, 0.16],
    [0.3, 0.42],
  ] as const;
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  for (const [share, light] of shells) {
    const shell = new SphereGeometry(radius * share, around, up);
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

/** A lit window, as its glow needs it: its middle on the wall, how wide and how tall. */
export type Lit = { x: number; y: number; w: number; h: number };

/**
 * The glow of lit windows: for each, a card standing just proud of the wall (at `z`), wider than the window by
 * `spread`, brightest over the glass and gone at its edge. One mesh for the whole wall.
 */
export function windowGlow(windows: Lit[], z: number, spread: number): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const N = 6;
  for (const { x, y, w, h } of windows) {
    const first = positions.length / 3;
    const halfW = w / 2 + spread;
    const halfH = h / 2 + spread;
    for (let j = 0; j <= N; j++) {
      for (let i = 0; i <= N; i++) {
        const px = (i / N) * 2 - 1;
        const py = (j / N) * 2 - 1;
        positions.push(x + px * halfW, y + py * halfH, z);
        // How far outside the glass this point is, 0 on it and 1 at the card's edge.
        const out = Math.min(1, Math.hypot(Math.max(0, Math.abs(px) * halfW - w / 2), Math.max(0, Math.abs(py) * halfH - h / 2)) / spread);
        const k = 0.3 * (1 - out) * (1 - out);
        colours.push(k, k * 0.7, k * 0.36);
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = first + j * (N + 1) + i;
        index.push(a, a + 1, a + N + 2, a, a + N + 2, a + N + 1);
      }
    }
  }
  const glow = new BufferGeometry();
  glow.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  glow.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  glow.setIndex(index);
  return glow;
}

/**
 * Light thrown along the ground from `width` wide at its near end to `spread` wide `reach` ahead (+Z), brightest
 * near and down its middle, gone at its far end and its sides: headlamps on a road, a window's light on a path.
 */
export function beamGeometry(width: number, spread: number, reach: number, colour: readonly [number, number, number]): BufferGeometry {
  const positions: number[] = [];
  const colours: number[] = [];
  const index: number[] = [];
  const ROWS = 8;
  const COLS = 6;
  for (let j = 0; j <= ROWS; j++) {
    const t = j / ROWS;
    const half = (width + (spread - width) * t) / 2;
    for (let i = 0; i <= COLS; i++) {
      const u = (i / COLS) * 2 - 1;
      positions.push(u * half, 0, t * reach);
      // It starts a little way out (the lamps are above the ground), then falls away.
      const along = Math.min(1, t / 0.12) * (1 - t) ** 1.6;
      const k = along * (1 - u * u) ** 1.5;
      colours.push(colour[0] * k, colour[1] * k, colour[2] * k);
    }
  }
  for (let j = 0; j < ROWS; j++) {
    for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i;
      index.push(a, a + COLS + 1, a + COLS + 2, a, a + COLS + 2, a + 1);
    }
  }
  const beam = new BufferGeometry();
  beam.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  beam.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  beam.setIndex(index);
  return beam;
}

const HEADLAMP_LIGHT = [0.6, 0.54, 0.42] as const;
const HEADLAMP_GLOW = haloGeometry(0.03, 10, 6);

/**
 * A vehicle's headlamps burning: a glow at each (they are `half` to either side of the middle, `y` up, at `z`) and
 * their light on the road ahead. Nothing by day. Named as the lamp post's are, so they are not part of its shape.
 */
export function headlights(vehicle: Group, half: number, y: number, z: number): void {
  const beam = new Mesh(beamGeometry(half * 2 + 0.03, half * 2 + 0.2, 0.38, HEADLAMP_LIGHT), LAMP_POOL);
  beam.name = 'LampPool';
  beam.position.set(0, 0.0016, z + 0.01);
  beam.renderOrder = 1;
  vehicle.add(beam);
  for (const side of half > 0 ? [-1, 1] : [1]) {
    const glow = new Mesh(HEADLAMP_GLOW, LAMP_POOL);
    glow.name = 'LampHalo';
    glow.position.set(side * half, y, z + 0.004);
    glow.renderOrder = 2;
    vehicle.add(glow);
  }
}

/**
 * A fire's own light, in any light the set is in: the same kind of material as the lamps', but always up, and
 * flickering (src/set-light.ts moves its strength every frame).
 */
export const FIRE_LIGHT = LAMP_POOL.clone();
FIRE_LIGHT.opacity = 0.6;
const FIRE_GLOW = haloGeometry(0.1, 10, 6);
const FIRE_POOL = poolGeometry(0.11);

/** The glow round a fire's flames and its light on whatever it stands on. Not part of its shape. */
export function fireLight(fire: Group): void {
  const glow = new Mesh(FIRE_GLOW, FIRE_LIGHT);
  glow.name = 'LampHalo';
  glow.position.set(0, 0.06, 0);
  glow.renderOrder = 2;
  const pool = new Mesh(FIRE_POOL, FIRE_LIGHT);
  pool.name = 'LampPool';
  pool.position.set(0, 0.002, 0);
  pool.renderOrder = 1;
  fire.add(glow, pool);
}
