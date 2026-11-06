/**
 * The asset library: everything that can stand on the slate, by shelf. Each
 * entry is one scene node, kept off the set until it is added. The camera is
 * not here: a set without a camera has no shot.
 */
export const SHELVES = ['Cast', 'Creatures', 'Vehicles', 'Effects', 'Set', 'Props'] as const;
/** Kit is the camera department's own: on the set from the Shoot page, never on a shelf. */
export type Shelf = (typeof SHELVES)[number] | 'Kit';

export type Asset = {
  /** The piece's label, which is also its name on the panel unless `title` says otherwise. */
  label: string;
  title?: string;
  shelf: Shelf;
  /** On the set in a new scene. */
  starts?: boolean;
  /** The unseen grab zone: radius, then height, in metres on the slate. */
  grab?: [number, number];
  /** Its body takes a coat of paint. */
  paint?: boolean;
  /** The paint it comes in, as an index into PAINTS. Without one it comes in primer. */
  coat?: number;
  /** Named fittings, one of which shows: the first is the plain one. */
  styles?: string[];
  /** Other pieces can be set down on top of it. */
  solid?: boolean;
  /** Moving, it knocks down an actor in its way. */
  mover?: boolean;
  /** This actor's tape: the colour of their mark, their tag and their line on the panel. */
  tape?: string;
  /** Other words a person might say for it. */
  aliases?: string[];
};

/**
 * Marks on a set are spike tape, one colour to each performer, so nobody
 * walks to the wrong one. Orange and blue are measured from photographs of the
 * tape; pink and green are the other two colours a roll set comes in.
 */
export const TAPE = { orange: '#e49a4f', blue: '#5ca0cb', pink: '#e8719f', green: '#6cc47c', ball: '#d6e13c' } as const;

export const ASSETS: Asset[] = [
  { label: 'A', title: 'Actor A', shelf: 'Cast', starts: true, tape: TAPE.orange, aliases: ['actor', 'person', 'man', 'hero'] },
  { label: 'B', title: 'Actor B', shelf: 'Cast', starts: true, tape: TAPE.blue, aliases: ['woman'] },
  { label: 'C', title: 'Actor C', shelf: 'Cast', tape: TAPE.pink },
  { label: 'D', title: 'Actor D', shelf: 'Cast', tape: TAPE.green },
  { label: 'Creature', title: 'Eyeline ball', shelf: 'Cast', starts: true, tape: TAPE.ball, aliases: ['ball', 'eyeline', 'monster'] },
  { label: 'Camera B', shelf: 'Kit', grab: [0.045, 0.19], aliases: ['second camera'] },
  { label: 'Car', shelf: 'Vehicles', grab: [0.13, 0.16], paint: true, solid: true, mover: true, styles: ['Plain', 'Light bar', 'Roof sign', 'Roof rack'] },
  { label: 'Van', shelf: 'Vehicles', grab: [0.13, 0.2], paint: true, solid: true, mover: true, styles: ['Plain', 'Light bar', 'Roof rack'] },
  { label: 'Motorbike', shelf: 'Vehicles', grab: [0.09, 0.13], paint: true, mover: true, aliases: ['bike', 'motorcycle'] },
  { label: 'Fire', shelf: 'Effects', grab: [0.06, 0.18], aliases: ['flames', 'burning'] },
  { label: 'Smoke', shelf: 'Effects', grab: [0.08, 0.3] },
  { label: 'Water', shelf: 'Effects', grab: [0.1, 0.16], aliases: ['splash', 'fountain'] },
  { label: 'Explosion', shelf: 'Effects', grab: [0.1, 0.2], aliases: ['blast', 'bang'] },
  { label: 'Rain', shelf: 'Effects', grab: [0.1, 0.2] },
  { label: 'Sparks', shelf: 'Effects', grab: [0.06, 0.12] },
  { label: 'Snow', shelf: 'Effects', grab: [0.1, 0.2] },
  { label: 'Fog', shelf: 'Effects', grab: [0.12, 0.08], aliases: ['mist'] },
  { label: 'Dust', shelf: 'Effects', grab: [0.1, 0.08] },
  { label: 'Magic', shelf: 'Effects', grab: [0.07, 0.25], aliases: ['spell', 'sparkles'] },
  { label: 'Embers', shelf: 'Effects', grab: [0.1, 0.3] },
  { label: 'Wall', shelf: 'Set', grab: [0.1, 0.2], solid: true },
  { label: 'Lamp post', shelf: 'Set', grab: [0.05, 0.42], aliases: ['street light', 'lamp'] },
  { label: 'Tree', shelf: 'Set', grab: [0.08, 0.4] },
  { label: 'Crate', shelf: 'Props', grab: [0.05, 0.08], solid: true, aliases: ['box'] },
  { label: 'Dragon', shelf: 'Creatures', grab: [0.14, 0.29], paint: true, coat: 1, mover: true },
  { label: 'Troll', shelf: 'Creatures', grab: [0.12, 0.4], paint: true, coat: 4, mover: true, aliases: ['ogre'] },
  { label: 'Dinosaur', shelf: 'Creatures', grab: [0.12, 0.28], paint: true, coat: 4, mover: true, aliases: ['dino', 'rex'] },
  { label: 'Robot', shelf: 'Creatures', grab: [0.1, 0.35], paint: true, coat: 5, mover: true, aliases: ['mech'] },
  { label: 'Alien', shelf: 'Creatures', grab: [0.04, 0.24], paint: true, coat: 4 },
  { label: 'Ghost', shelf: 'Creatures', grab: [0.06, 0.2], paint: true, coat: 6 },
  { label: 'Spider', shelf: 'Creatures', grab: [0.12, 0.12], paint: true, coat: 7, mover: true },
  { label: 'Kraken', shelf: 'Creatures', grab: [0.12, 0.35], paint: true, coat: 2, aliases: ['tentacles', 'octopus', 'squid'] },
  { label: 'Horse', shelf: 'Cast', grab: [0.07, 0.17], paint: true, coat: 6, mover: true, styles: ['Plain', 'Unicorn'], aliases: ['unicorn'] },
  { label: 'Wolf', shelf: 'Cast', grab: [0.06, 0.1], paint: true, coat: 7, mover: true, aliases: ['dog'] },
  { label: 'Truck', shelf: 'Vehicles', grab: [0.15, 0.33], paint: true, coat: 6, solid: true, mover: true, styles: ['Box', 'Flatbed', 'Tanker'], aliases: ['lorry'] },
  { label: 'Pickup', shelf: 'Vehicles', grab: [0.13, 0.18], paint: true, coat: 5, solid: true, mover: true },
  { label: 'Bus', shelf: 'Vehicles', grab: [0.16, 0.33], paint: true, coat: 3, solid: true, mover: true, aliases: ['coach'] },
  { label: 'Helicopter', shelf: 'Vehicles', grab: [0.2, 0.27], paint: true, coat: 3, mover: true, aliases: ['chopper'] },
  { label: 'Boat', shelf: 'Vehicles', grab: [0.13, 0.15], paint: true, coat: 6, solid: true, mover: true, aliases: ['ship'] },
  { label: 'Saucer', shelf: 'Vehicles', title: 'Flying saucer', grab: [0.18, 0.16], paint: true, coat: 6, mover: true, aliases: ['ufo', 'spaceship'] },
  { label: 'Bicycle', shelf: 'Vehicles', grab: [0.06, 0.1], paint: true, coat: 1, mover: true, aliases: ['cycle'] },
  { label: 'Tank', shelf: 'Vehicles', grab: [0.16, 0.21], paint: true, coat: 4, solid: true, mover: true },
  { label: 'House', shelf: 'Set', title: 'House front', grab: [0.2, 0.56], paint: true, coat: 6, solid: true, aliases: ['building'] },
  { label: 'Fence', shelf: 'Set', grab: [0.1, 0.11], paint: true },
  { label: 'Stairs', shelf: 'Set', grab: [0.1, 0.36], solid: true, aliases: ['steps'] },
  { label: 'Door', shelf: 'Set', grab: [0.05, 0.21], paint: true, coat: 1 },
  { label: 'Pillar', shelf: 'Set', grab: [0.08, 0.35], solid: true, aliases: ['column'] },
  { label: 'Barrier', shelf: 'Props', grab: [0.08, 0.08], solid: true },
  { label: 'Bench', shelf: 'Props', grab: [0.07, 0.09], solid: true },
  { label: 'Cone', shelf: 'Props', grab: [0.03, 0.07], paint: true },
  { label: 'Dumpster', shelf: 'Props', grab: [0.09, 0.12], paint: true, coat: 4, solid: true, aliases: ['bin', 'skip'] },
  { label: 'Rock', shelf: 'Props', grab: [0.09, 0.12], solid: true, aliases: ['boulder'] },
];

export const assetByLabel = (label: string): Asset | undefined => ASSETS.find((asset) => asset.label === label);
export const assetTitle = (label: string): string => assetByLabel(label)?.title ?? label;
export const STARTING_ASSETS = ASSETS.filter((asset) => asset.starts).map((asset) => asset.label);
/** A shelf shows this many at a time; More turns to the rest. */
export const SHELF_SLOTS = 8;

/** Paint for anything with a body: the first is the primer it comes in. */
export const PAINTS = [
  { name: 'Primer', hex: 0 },
  { name: 'Red', hex: 0xb3312a },
  { name: 'Orange', hex: 0xd9772b },
  { name: 'Yellow', hex: 0xe3c23c },
  { name: 'Green', hex: 0x3f7d4e },
  { name: 'Blue', hex: 0x2f5f9e },
  { name: 'White', hex: 0xe6e4da },
  { name: 'Black', hex: 0x26282c },
] as const;
export const SIZES = [
  { name: 'Normal', scale: 1 },
  { name: 'Small', scale: 0.7 },
  { name: 'Big', scale: 1.5 },
  { name: 'Giant', scale: 2.2 },
] as const;
