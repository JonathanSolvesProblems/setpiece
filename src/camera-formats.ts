/**
 * The camera kit. Formats are named by gate size, as a camera department would,
 * and cropped to the 16:9 frame the monitor shows. Same lens, smaller gate: a
 * tighter picture.
 */
export const SENSORS = [
  { name: 'Full frame', short: 'FF', heightMm: 20.25 },
  { name: 'Super 35', short: 'S35', heightMm: 14.0 },
  { name: 'Super 16', short: 'S16', heightMm: 7.04 },
  { name: '65 mm', short: '65', heightMm: 30.4 },
] as const;

export const Rig = { Tripod: 'tripod', Drone: 'drone' } as const;
/** The cameras by their labels on the set: the first is always there, the second is added from the panel. */
export const CAMERAS = ['Camera', 'Camera B'] as const;
export const LENSES = [18, 24, 35, 50, 85, 135] as const;
