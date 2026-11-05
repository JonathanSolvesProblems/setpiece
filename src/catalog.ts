/**
 * The asset library: everything that can stand on the slate, by shelf. Each
 * entry is one scene node, kept off the set until it is added. The camera is
 * not here: a set without a camera has no shot.
 */
export const SHELVES = ['Cast', 'Vehicles', 'Effects', 'Set'] as const;
export type Shelf = (typeof SHELVES)[number];

export type Asset = {
  /** The piece's label, which is also its name on the panel unless `title` says otherwise. */
  label: string;
  title?: string;
  shelf: Shelf;
  /** On the set in a new scene. */
  starts?: boolean;
  /** The unseen grab zone: radius, then height, in metres on the slate. */
  grab?: [number, number];
};

export const ASSETS: Asset[] = [
  { label: 'A', title: 'Actor A', shelf: 'Cast', starts: true },
  { label: 'B', title: 'Actor B', shelf: 'Cast', starts: true },
  { label: 'C', title: 'Actor C', shelf: 'Cast' },
  { label: 'D', title: 'Actor D', shelf: 'Cast' },
  { label: 'Creature', shelf: 'Cast', starts: true },
  { label: 'Car', shelf: 'Vehicles', grab: [0.13, 0.16] },
  { label: 'Van', shelf: 'Vehicles', grab: [0.13, 0.2] },
  { label: 'Motorbike', shelf: 'Vehicles', grab: [0.09, 0.13] },
  { label: 'Fire', shelf: 'Effects', grab: [0.06, 0.18] },
  { label: 'Smoke', shelf: 'Effects', grab: [0.08, 0.3] },
  { label: 'Water', shelf: 'Effects', grab: [0.1, 0.16] },
  { label: 'Explosion', shelf: 'Effects', grab: [0.1, 0.2] },
  { label: 'Rain', shelf: 'Effects', grab: [0.1, 0.2] },
  { label: 'Sparks', shelf: 'Effects', grab: [0.06, 0.12] },
  { label: 'Wall', shelf: 'Set', grab: [0.1, 0.2] },
  { label: 'Lamp post', shelf: 'Set', grab: [0.05, 0.42] },
  { label: 'Tree', shelf: 'Set', grab: [0.08, 0.4] },
  { label: 'Crate', shelf: 'Set', grab: [0.05, 0.08] },
];

export const assetByLabel = (label: string): Asset | undefined => ASSETS.find((asset) => asset.label === label);
export const assetTitle = (label: string): string => assetByLabel(label)?.title ?? label;
export const STARTING_ASSETS = ASSETS.filter((asset) => asset.starts).map((asset) => asset.label);
/** The most any shelf holds; the panel has this many slots. */
export const SHELF_SLOTS = 6;
