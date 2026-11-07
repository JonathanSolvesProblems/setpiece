/**
 * Directing words. "A Mexican standoff after a car chase" names no pieces: it
 * names a blocking, and a person saying it means who stands where and what they
 * are doing. Each beat here is that blocking, in the same terms as a scene from
 * the library, so the result is only pieces on marks and every one can be moved.
 *
 * A plain function of the transcript, with no catalog of its own. Words it does
 * not know change nothing, and a sentence with no beat in it returns null.
 */
import type { Placed, Scene } from './scenes.js';

export type Staging = Scene & { says: string };

/** Indices into POSES, in tray.ts. */
const POINT = 0;
const ARMS_UP = 2;
const RUNNING = 3;
export const AIM = 4;
/** Indices into PAINTS and SIZES. */
const RED = 1;
const SMALL = 1;

type Mark = { label: string; x: number; z: number };

/** The yaw that turns a figure at one mark to face another. Figures face +z at 0. */
const facing = (from: Mark, to: Mark): number => Math.round((Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI);

/** Each figure faces the next one round, which is what makes it a standoff and not a queue. */
const roundTheRing = (marks: Mark[], pose: number): Placed[] =>
  marks.map((mark, i) => ({ ...mark, yaw: facing(mark, marks[(i + 1) % marks.length]), pose }));

type Beat = {
  title: string;
  heard: string[];
  lens: number;
  camera: [number, number, number];
  says: string;
  pieces: Placed[];
};

const A = { label: 'A', x: -0.12, z: 0.125 };
const B = { label: 'B', x: 0.12, z: 0.125 };
const C = { label: 'C', x: 0, z: 0.015 };
const LEFT = { label: 'A', x: -0.14, z: 0.03 };
const RIGHT = { label: 'B', x: 0.14, z: 0.03 };

/** The first beat a sentence names wins, so a specific one sits above a general one. */
const BEATS: Beat[] = [
  {
    title: 'Standoff',
    heard: ['mexican standoff', 'mexican stand off', 'standoff', 'stand off', 'showdown', 'show down', 'face off', 'faceoff'],
    lens: 24,
    camera: [-0.23, 0.17, -38],
    says: 'Three actors, each aiming at the next.',
    pieces: roundTheRing([A, C, B], AIM),
  },
  {
    title: 'Hold up',
    heard: ['hold up', 'holdup', 'stick up', 'stickup', 'robbery', 'heist', 'hostage', 'gunpoint', 'gun point', 'hands up', 'surrender'],
    lens: 35,
    camera: [-0.2, 0.17, -30],
    says: 'One actor aiming, one with their hands up.',
    pieces: [
      { ...LEFT, yaw: facing(LEFT, RIGHT), pose: AIM },
      { ...RIGHT, yaw: facing(RIGHT, LEFT), pose: ARMS_UP },
    ],
  },
  {
    title: 'Shootout',
    heard: ['gunfight', 'gun fight', 'shootout', 'shoot out', 'duel', 'quick draw', 'firefight', 'fire fight', 'at each other'],
    lens: 35,
    camera: [-0.2, 0.17, -30],
    says: 'Two actors, aiming at each other.',
    pieces: roundTheRing([LEFT, RIGHT], AIM),
  },
  {
    title: 'Foot chase',
    heard: ['foot chase', 'running away', 'on foot', 'chasing', 'chased'],
    lens: 24,
    camera: [-0.26, 0.15, -55],
    says: 'One actor running, one after them.',
    pieces: [
      { label: 'A', x: 0.12, z: 0, yaw: 90, pose: RUNNING },
      { label: 'B', x: -0.1, z: 0, yaw: 90, pose: RUNNING },
    ],
  },
  {
    title: 'Fight',
    heard: ['fist fight', 'fistfight', 'brawl', 'fight', 'fighting'],
    lens: 35,
    camera: [-0.2, 0.17, -30],
    says: 'Two actors, squared up.',
    pieces: [
      { label: 'A', x: -0.06, z: 0.03, yaw: 90, pose: POINT },
      { label: 'B', x: 0.06, z: 0.03, yaw: -90, pose: POINT },
    ],
  },
];

/** What is left around a beat: where it came from, added behind the marks. */
const AFTERMATHS: { heard: string[]; says: string; pieces: Placed[] }[] = [
  {
    heard: ['car chase', 'police chase', 'high speed chase', 'car crash', 'crash', 'crashed', 'pile up', 'pileup', 'wreck', 'wrecked'],
    says: 'Two cars crashed behind them.',
    pieces: [
      { label: 'Car', x: -0.135, z: -0.105, yaw: 78, paint: RED, size: SMALL },
      { label: 'Car 2', x: 0.13, z: -0.1, yaw: -104, size: SMALL },
      { label: 'Smoke', x: 0.01, z: -0.12 },
    ],
  },
  {
    heard: ['alley', 'alleyway', 'back street', 'side street', 'street', 'city', 'downtown'],
    says: 'A street behind them.',
    pieces: [
      { label: 'Lamp post', x: -0.24, z: -0.14, yaw: 90 },
      { label: 'Dumpster', x: 0.2, z: -0.13 },
    ],
  },
];

/** Words that ask for the prop without saying what happens: everyone on the set takes aim. */
const WEAPONS = ['gun', 'guns', 'pistol', 'pistols', 'revolver', 'revolvers', 'weapon', 'weapons', 'aiming', 'draw down', 'take aim'];

const spaced = (text: string): string => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const saysAny = (said: string, phrases: string[]): boolean => phrases.some((phrase) => said.includes(` ${phrase} `));

/** A beat and whatever is left around it, or a library scene named outright, or null. */
export function stagingFor(text: string, scenes: Scene[]): Staging | null {
  const said = spaced(text);
  const beat = BEATS.find((candidate) => saysAny(said, candidate.heard));
  if (beat == null) {
    const scene = scenes.find((candidate) => said.includes(` ${candidate.title.toLowerCase()} `));
    return scene == null ? null : { ...scene, says: 'From the library.' };
  }
  const around = AFTERMATHS.filter((aftermath) => saysAny(said, aftermath.heard));
  return {
    title: beat.title,
    lens: beat.lens,
    camera: beat.camera,
    says: [beat.says, ...around.map((aftermath) => aftermath.says)].join(' '),
    pieces: [...beat.pieces, ...around.flatMap((aftermath) => aftermath.pieces)],
  };
}

/**
 * The sentence with its directing words taken out, for the reader of piece names:
 * "a hold up with a van" leaves "a with a van", where "hold" is no longer a verb
 * and "standoff" is no longer something the kit lacks.
 */
export function withoutStaging(text: string): string {
  let said = spaced(text);
  const phrases = [...BEATS.flatMap((beat) => beat.heard), ...AFTERMATHS.flatMap((aftermath) => aftermath.heard), ...WEAPONS];
  for (const phrase of phrases.sort((a, b) => b.length - a.length)) said = said.split(` ${phrase} `).join(' ');
  return said.replace(/\bmexican\b/g, ' ').trim();
}

/** Whether a sentence with no beat in it still asks for weapons. */
export const asksToAim = (text: string): boolean => saysAny(spaced(text), WEAPONS);

/** Everything worth listening for, so a sentence about a scene is heard as one. */
export const stagingWords = (): string[] => [
  ...BEATS.flatMap((beat) => beat.heard),
  ...AFTERMATHS.flatMap((aftermath) => aftermath.heard),
  ...WEAPONS,
  // The small words a director strings these together with. Left out, a recogniser
  // working from a list puts a piece's name where they were said.
  ...'where was were just now they are their them after before who when that this there at each other of the is been have has had like want would pointing'.split(' '),
];
