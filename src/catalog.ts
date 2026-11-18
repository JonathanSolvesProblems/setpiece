/**
 * The asset library: everything that can stand on the slate, by shelf. Each
 * entry is one scene node, kept off the set until it is added. The camera is
 * not here: a set without a camera has no shot.
 */
export const SHELVES = ['Cast', 'Creatures', 'Vehicles', 'Effects', 'Set', 'Props'] as const;
/** Kit is the camera department's own: on the set from the Shoot page, never on a shelf. */
export type Shelf = (typeof SHELVES)[number] | 'Kit' | 'Spare' | 'Made';

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
  /** Named fittings, one of which shows: the first is the plain one. */
  styles?: string[];
  /** Other pieces can be set down on top of it. */
  solid?: boolean;
  /** Moving, it knocks down an actor in its way. */
  mover?: boolean;
  /** It flies: let go in the air, it stays there; let go just above something, it lands on it. */
  flies?: boolean;
  /** This actor's tape: the colour of their mark, their tag and their line on the panel. */
  tape?: string;
  /** Other words a person might say for it. */
  aliases?: string[];
  /** A second or third of something: not on a shelf, reached by Copy or by asking for more than one. */
  spareOf?: string;
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
  { label: 'Dragon', shelf: 'Creatures', grab: [0.14, 0.29], paint: true, mover: true, flies: true },
  { label: 'Troll', shelf: 'Creatures', grab: [0.12, 0.4], paint: true, mover: true, aliases: ['ogre'] },
  { label: 'Dinosaur', shelf: 'Creatures', grab: [0.12, 0.28], paint: true, mover: true, aliases: ['dino', 'rex'] },
  { label: 'Robot', shelf: 'Creatures', grab: [0.1, 0.35], paint: true, mover: true, aliases: ['mech'] },
  { label: 'Alien', shelf: 'Creatures', grab: [0.04, 0.24], paint: true },
  { label: 'Ghost', shelf: 'Creatures', grab: [0.06, 0.2], paint: true, flies: true },
  { label: 'Spider', shelf: 'Creatures', grab: [0.12, 0.12], paint: true, mover: true },
  { label: 'Kraken', shelf: 'Creatures', grab: [0.12, 0.35], paint: true, aliases: ['tentacles', 'octopus', 'squid'] },
  { label: 'Horse', shelf: 'Cast', grab: [0.08, 0.23], paint: true, mover: true, styles: ['Plain', 'Unicorn'], aliases: ['unicorn'] },
  { label: 'Wolf', shelf: 'Cast', grab: [0.06, 0.1], paint: true, mover: true, aliases: ['dog'] },
  { label: 'Truck', shelf: 'Vehicles', grab: [0.15, 0.33], paint: true, solid: true, mover: true, styles: ['Box', 'Flatbed', 'Tanker'], aliases: ['lorry'] },
  { label: 'Pickup', shelf: 'Vehicles', grab: [0.13, 0.18], paint: true, solid: true, mover: true },
  { label: 'Bus', shelf: 'Vehicles', grab: [0.16, 0.33], paint: true, solid: true, mover: true, aliases: ['coach'] },
  { label: 'Helicopter', shelf: 'Vehicles', grab: [0.2, 0.27], paint: true, mover: true, flies: true, aliases: ['chopper'] },
  { label: 'Boat', shelf: 'Vehicles', grab: [0.13, 0.15], paint: true, solid: true, mover: true, aliases: ['ship'] },
  { label: 'Saucer', shelf: 'Vehicles', title: 'Flying saucer', grab: [0.18, 0.16], paint: true, mover: true, flies: true, aliases: ['ufo', 'spaceship'] },
  { label: 'Bicycle', shelf: 'Vehicles', grab: [0.06, 0.1], paint: true, mover: true, aliases: ['cycle'] },
  { label: 'Tank', shelf: 'Vehicles', grab: [0.16, 0.21], paint: true, solid: true, mover: true },
  { label: 'House', shelf: 'Set', title: 'House front', grab: [0.2, 0.56], paint: true, solid: true, aliases: ['building'] },
  { label: 'Fence', shelf: 'Set', grab: [0.1, 0.11], paint: true },
  { label: 'Stairs', shelf: 'Set', grab: [0.1, 0.36], solid: true, aliases: ['steps'] },
  { label: 'Door', shelf: 'Set', grab: [0.05, 0.21], paint: true },
  { label: 'Pillar', shelf: 'Set', grab: [0.08, 0.35], solid: true, aliases: ['column'] },
  { label: 'Barrier', shelf: 'Props', grab: [0.08, 0.08], solid: true },
  { label: 'Bench', shelf: 'Props', grab: [0.07, 0.09], solid: true },
  { label: 'Cone', shelf: 'Props', grab: [0.03, 0.07], paint: true },
  { label: 'Dumpster', shelf: 'Props', grab: [0.09, 0.12], paint: true, solid: true, aliases: ['bin', 'skip'] },
  { label: 'Rock', shelf: 'Props', grab: [0.09, 0.12], solid: true, aliases: ['boulder'] },
];

/** The pieces a set wants more than one of. Each has two spares waiting off the set. */
const SPARE_OF = ['Tree', 'Rock', 'Crate', 'Cone', 'Barrier', 'Car', 'Wolf'];
for (const label of SPARE_OF) {
  const base = ASSETS.find((asset) => asset.label === label)!;
  for (const n of [2, 3]) {
    ASSETS.push({ ...base, label: `${label} ${n}`, title: `${base.title ?? label} ${n}`, shelf: 'Spare', spareOf: label, aliases: undefined, starts: false });
  }
}
/**
 * Places for the pieces the set designer makes. Each starts empty and off the set; when a piece is made into
 * one, it takes that piece's name and reach (src/made.ts), so everything that reads the catalog reads it.
 */
export const MADE_SLOTS = 20;
export const MADE_PREFIX = 'Made ';
for (let n = 1; n <= MADE_SLOTS; n++) {
  ASSETS.push({ label: `${MADE_PREFIX}${n}`, title: 'New piece', shelf: 'Made', grab: [0.1, 0.2], solid: true });
}
export const isMade = (label: string): boolean => label.startsWith(MADE_PREFIX) && assetByLabel(label)?.shelf === 'Made';
export const sparesOf = (label: string): string[] => ASSETS.filter((asset) => asset.spareOf === label).map((asset) => asset.label);
const onShelf = (asset: Asset): boolean => (SHELVES as readonly string[]).includes(asset.shelf);
/** What can be named, found or put on from a shelf. */
export const SHELF_ASSETS = ASSETS.filter(onShelf);

export const assetByLabel = (label: string): Asset | undefined => ASSETS.find((asset) => asset.label === label);
export const assetTitle = (label: string): string => assetByLabel(label)?.title ?? label;
export const STARTING_ASSETS = ASSETS.filter((asset) => asset.starts).map((asset) => asset.label);
/** A shelf shows this many at a time; More turns to the rest. */
export const SHELF_SLOTS = 8;

/**
 * Everything whose name or other words start with what has been spelled so
 * far, names first, then the rest of each word's matches. The camera is not on
 * a shelf, so it is not found here either.
 */
export function searchAssets(query: string): Asset[] {
  const q = query.toLowerCase();
  const words = (asset: Asset): string[] => [assetTitle(asset.label), asset.label, ...(asset.aliases ?? [])].flatMap((name) => name.toLowerCase().split(' '));
  const kit = SHELF_ASSETS;
  const named = kit.filter((asset) => words(asset).some((word) => word.startsWith(q)));
  const within = kit.filter((asset) => !named.includes(asset) && q.length > 1 && words(asset).some((word) => word.includes(q)));
  return [...named, ...within];
}

/** How an actor stands, and what they wear. */
export const LOOKS = [
  { name: 'Wood', top: 0, legs: 0, hair: false },
  { name: 'Dark suit', top: 0x30343f, legs: 0x262a33, hair: true },
  { name: 'Red jacket', top: 0xb3312a, legs: 0x35475f, hair: true },
  { name: 'White shirt', top: 0xe6e4da, legs: 0x2a2c31, hair: true },
  { name: 'Hi-vis', top: 0xd6e13c, legs: 0x2f3a45, hair: true },
] as const;
export const POSES = ['First pose', 'Second pose', 'Arms up', 'Running', 'Aim', 'Crouch', 'Sitting'] as const;
/**
 * A seated figure has its seat at its origin and its legs hanging below it (src/scene-assets/figures.scene-asset.ts):
 * this far, on the table, for an actor at the kit's size. On the bare ground a seated actor stands this high.
 */
export const SIT_LEGS = 0.033;
/** An actor's build: a lay figure is made in a man's and a woman's proportions, as artists' figures are. */
export const BUILDS = ['man', 'woman'] as const;

/** Model maker's enamels: everything comes in bare wood, and colour is a choice. */
export const PAINTS = [
  { name: 'Bare wood', hex: 0 },
  { name: 'Red', hex: 0x9c3a2e },
  { name: 'Orange', hex: 0xb86f33 },
  { name: 'Yellow', hex: 0xc4a23f },
  { name: 'Green', hex: 0x4c6e52 },
  { name: 'Blue', hex: 0x3d5b7c },
  { name: 'White', hex: 0xcbc5b4 },
  { name: 'Black', hex: 0x2a2826 },
] as const;
export const SIZES = [
  { name: 'Normal', scale: 1 },
  { name: 'Small', scale: 0.7 },
  { name: 'Big', scale: 1.5 },
  { name: 'Giant', scale: 2.2 },
] as const;

/** What an actor can hold, in the hand: part of the figure (src/scene-assets/figures.scene-asset.ts). The first is nothing. */
export const HELD = ['', 'Sword', 'Staff', 'Umbrella', 'Rifle', 'Pistol', 'Bow', 'Shield', 'Torch', 'Axe', 'Bag', 'Phone', 'Flag'] as const;
const HELD_WORDS: Record<string, number> = {
  sword: 1, swords: 1, katana: 1, blade: 1, sabre: 1, saber: 1, rapier: 1, machete: 1, dagger: 1, knife: 1, lightsaber: 1,
  staff: 2, spear: 2, pole: 2, stick: 2, lance: 2, broom: 2, cane: 2, rod: 2, bat: 2, club: 2, wand: 2, trident: 2, pitchfork: 2, shovel: 2, rake: 2, oar: 2, mop: 2,
  umbrella: 3, parasol: 3,
  rifle: 4, sniper: 4, shotgun: 4, musket: 4, carbine: 4, bazooka: 4, launcher: 4, machinegun: 4, crossbow: 4, cannon: 4,
  pistol: 5, gun: 5, handgun: 5, revolver: 5, blaster: 5, taser: 5,
  bow: 6, longbow: 6,
  shield: 7,
  torch: 8, flashlight: 8, lantern: 8, lamp: 8, candle: 8, flare: 8, light: 8,
  axe: 9, hammer: 9, pickaxe: 9, pick: 9, wrench: 9, hatchet: 9, mallet: 9, crowbar: 9, tool: 9,
  bag: 10, briefcase: 10, suitcase: 10, case: 10, bucket: 10, basket: 10, toolbox: 10, backpack: 10, luggage: 10, box: 10, purse: 10,
  phone: 11, radio: 11, camera: 11, book: 11, cup: 11, mug: 11, bottle: 11, glass: 11, microphone: 11, mic: 11, clipboard: 11, tablet: 11, map: 11, letter: 11, binoculars: 11, badge: 11,
  flag: 12, banner: 12, sign: 12, placard: 12,
};
/** Which of them a word or two names ("a katana", "long spear"), or 0 for nothing; "none" and "nothing" are 0 too. */
export function heldIndex(words: string): number {
  for (const word of words.toLowerCase().split(/[^a-z]+/)) if (word in HELD_WORDS) return HELD_WORDS[word];
  return 0;
}
