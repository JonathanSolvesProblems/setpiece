/**
 * Sets to start from. Each one is a blocking a person could have made from the
 * library: where the pieces stand on the slate, how they are dressed, and
 * where the camera is. Nothing here is more than the pieces themselves, so
 * everything in a scene can be picked up and moved.
 *
 * Positions are metres on the 60 by 40 cm slate. Yaw is degrees: a prop faces
 * +z at 0, so 90 sends it towards +x; the camera looks along -z at 0.
 */
export type Placed = {
  label: string;
  x: number;
  z: number;
  yaw?: number;
  /** Index into PAINTS. */
  paint?: number;
  /** Index into SIZES. */
  size?: number;
  /** Which fitting shows. */
  style?: number;
  /** An actor's pose and look. */
  pose?: number;
  look?: number;
};
export type Scene = { title: string; lens: number; camera: [number, number, number]; pieces: Placed[] };

export const SCENES: Scene[] = [
  {
    title: 'Car chase',
    lens: 24,
    camera: [-0.26, 0.17, -60],
    pieces: [
      { label: 'Car', x: 0.07, z: 0.09, yaw: 90, paint: 1 },
      { label: 'Van', x: -0.06, z: -0.09, yaw: 90, style: 1 },
      { label: 'Lamp post', x: 0.22, z: -0.13, yaw: 90 },
      { label: 'Smoke', x: -0.15, z: 0.06 },
      { label: 'A', x: 0.24, z: -0.02, yaw: -90, pose: 3 },
    ],
  },
  {
    title: 'Dragon attack',
    lens: 24,
    camera: [-0.25, 0.18, -40],
    pieces: [
      { label: 'Dragon', x: 0.1, z: 0.01, yaw: -130, paint: 1, size: 1 },
      { label: 'House', x: 0.08, z: -0.125, size: 1 },
      { label: 'Fire', x: -0.04, z: -0.1 },
      { label: 'Embers', x: -0.02, z: -0.06 },
      { label: 'A', x: -0.14, z: 0.06, yaw: 120, pose: 3 },
      { label: 'B', x: -0.05, z: 0.13, yaw: 150, pose: 2 },
    ],
  },
  {
    title: 'Rainy street',
    lens: 50,
    camera: [-0.22, 0.17, -50],
    pieces: [
      { label: 'Rain', x: 0, z: 0 },
      { label: 'Lamp post', x: 0.09, z: -0.12, yaw: 200 },
      { label: 'Car', x: -0.04, z: -0.08, yaw: 90, paint: 7 },
      { label: 'Wall', x: 0.12, z: -0.18 },
      { label: 'A', x: 0.05, z: 0.06, yaw: -40 },
      { label: 'Fog', x: -0.1, z: 0.02 },
    ],
  },
  {
    title: 'Alien landing',
    lens: 18,
    camera: [-0.24, 0.18, -45],
    pieces: [
      { label: 'Saucer', x: 0.12, z: -0.05, size: 1 },
      { label: 'Alien', x: 0.02, z: 0.1, yaw: -30 },
      { label: 'Fog', x: 0.1, z: -0.02 },
      { label: 'Dust', x: 0.13, z: 0.04 },
      { label: 'A', x: -0.14, z: 0.07, yaw: 110, pose: 2 },
      { label: 'Pickup', x: -0.12, z: -0.12, yaw: 90, size: 1 },
    ],
  },
  {
    title: 'Robot battle',
    lens: 24,
    camera: [-0.26, 0.16, -55],
    pieces: [
      { label: 'Robot', x: 0.095, z: -0.045, yaw: -110 },
      { label: 'Tank', x: -0.06, z: 0.07, yaw: 90, size: 1 },
      { label: 'Explosion', x: 0.02, z: -0.08 },
      { label: 'Smoke', x: 0.08, z: -0.14 },
      { label: 'Sparks', x: 0.1, z: 0.02 },
      { label: 'B', x: -0.2, z: -0.1, yaw: 120, pose: 3 },
    ],
  },
  {
    title: 'Haunted house',
    lens: 35,
    camera: [-0.2, 0.18, -30],
    pieces: [
      { label: 'House', x: 0.02, z: -0.125, size: 1, paint: 7 },
      { label: 'Ghost', x: 0.06, z: -0.04, yaw: 170 },
      { label: 'Fog', x: 0, z: 0.02 },
      { label: 'Tree', x: -0.18, z: -0.1 },
      { label: 'Fence', x: 0.09, z: 0.06 },
      { label: 'A', x: -0.08, z: 0.12, yaw: 170 },
    ],
  },
  {
    title: 'Sea monster',
    lens: 24,
    camera: [-0.24, 0.17, -35],
    pieces: [
      { label: 'Kraken', x: 0.1, z: -0.05 },
      { label: 'Boat', x: -0.1, z: 0.04, yaw: 70, size: 1 },
      { label: 'Water', x: 0, z: -0.02 },
      { label: 'Rain', x: 0, z: 0 },
      { label: 'A', x: -0.11, z: 0.04, yaw: 90, pose: 2 },
    ],
  },
  {
    title: 'Dinosaur escape',
    lens: 24,
    camera: [-0.25, 0.17, -50],
    pieces: [
      { label: 'Dinosaur', x: 0.1, z: -0.04, yaw: -100, size: 1 },
      { label: 'Fence', x: 0.02, z: -0.17 },
      { label: 'Truck', x: -0.08, z: 0.11, yaw: 90, size: 1, style: 1 },
      { label: 'Dust', x: 0.06, z: -0.02 },
      { label: 'A', x: -0.03, z: -0.05, yaw: -90, pose: 3 },
      { label: 'B', x: -0.16, z: -0.07, yaw: -90, pose: 3 },
    ],
  },
  {
    title: 'Winter camp',
    lens: 35,
    camera: [-0.2, 0.16, -40],
    pieces: [
      { label: 'Snow', x: 0, z: 0 },
      { label: 'Fire', x: 0.02, z: 0.02 },
      { label: 'Embers', x: 0.02, z: 0.02 },
      { label: 'A', x: -0.08, z: 0.05, yaw: 80 },
      { label: 'Tree', x: 0.16, z: -0.1 },
      { label: 'Wolf', x: 0.14, z: 0.05, yaw: -90 },
      { label: 'Rock', x: -0.17, z: -0.1 },
    ],
  },
  {
    title: 'Wizard duel',
    lens: 35,
    camera: [-0.24, 0.17, -70],
    pieces: [
      { label: 'A', x: -0.13, z: 0, yaw: 90, pose: 2 },
      { label: 'B', x: 0.13, z: 0, yaw: -90, pose: 2 },
      { label: 'Magic', x: 0, z: 0 },
      { label: 'Pillar', x: -0.04, z: -0.13 },
      { label: 'Horse', x: 0.2, z: -0.12, yaw: -60, style: 1 },
      { label: 'Fog', x: 0, z: 0.04 },
    ],
  },
];
