/**
 * What the set designer sends back, and how a reply is read. Shared by the server function, the app and
 * the tests, so it imports nothing but the catalog's plain lists.
 *
 * The designer works in real metres on a 6 by 4 m stage; the slate is that stage at 1:10. x runs to the
 * wearer's right, z towards the wearer, y up. A piece faces +z at yaw 0, so at 0 a car's nose points at
 * the wearer and at 90 to their right.
 */
import { LENSES } from './camera-formats.js';
import { ACT_WORDS, BUILDS, LOOKS, PAINTS, POSES } from './catalog.js';

/** Shapes a new piece is turned and cut from. Each is one unit across before it is sized. */
export const SHAPES = ['box', 'cylinder', 'cone', 'pyramid', 'sphere', 'dome', 'wedge'] as const;
export type Shape = (typeof SHAPES)[number];

/**
 * The finishes a new piece is painted in: the library's own enamels and bare wood, and the few more a
 * model maker keeps for stone, brick, leaves and glass.
 */
export const FINISHES: Record<string, number> = {
  wood: 0xc4a07a,
  red: 0x9c3a2e,
  orange: 0xb86f33,
  yellow: 0xc4a23f,
  green: 0x4c6e52,
  blue: 0x3d5b7c,
  white: 0xd8d3c4,
  black: 0x2a2826,
  grey: 0x7d7a73,
  stone: 0x9a958a,
  brown: 0x6b4a32,
  sand: 0xcdb88f,
  brick: 0x8e4a3a,
  leaf: 0x5f7f45,
  glass: 0x9db4bf,
  purple: 0x6a4f7a,
  pink: 0xc98a96,
  gold: 0xb8963e,
  cream: 0xe3d9bf,
};

/** One piece of the plan: a piece from the library, one made earlier, or a new one made of parts. */
export type Thing = {
  id: string;
  name: string;
  x: number;
  z: number;
  y: number;
  yaw: number;
  size: number;
  paint: string;
  fitting: string;
  pose: string;
  /** What an actor is doing: one of ACT_WORDS, or "" to keep what they were doing. */
  act: string;
  look: string;
  build: string;
  parts: string[];
};

export type CameraPlan = {
  keep: boolean;
  x: number;
  z: number;
  height: number;
  lens: number;
  look_at: string;
  look_x: number;
  look_y: number;
  look_z: number;
};

export type Plan = {
  title: string;
  says: string;
  fresh: boolean;
  remove: string[];
  things: Thing[];
  camera: CameraPlan;
  next: string;
};

const PAINT_NAMES = PAINTS.map((paint) => paint.name.toLowerCase());
const string = { type: 'string' } as const;
const number = { type: 'number' } as const;

/** The reply's shape, for the API's structured output. Property order is the order the reply streams in. */
/**
 * The light a set is in, chosen by the designer from the sentence: studio is the look of an interior or a sound
 * stage, and the default. "" in a reply keeps the light as it is.
 */
/** The most room a made piece takes on the 6 m by 4 m stage, in metres at full scale: across, front to back, high. */
export const MADE_MOST = { w: 5, d: 3, h: 4 };

/**
 * The largest size (1 is as written) at which a made piece of these metres still fits the stage, turned yawDeg
 * about up: side-on, its width runs front to back.
 */
export function fitMade(w: number, d: number, h: number, yawDeg = 0): number {
  const sideOn = Math.abs(Math.sin((yawDeg * Math.PI) / 180)) > Math.SQRT1_2;
  const across = sideOn ? d : w;
  const deep = sideOn ? w : d;
  const most = Math.min(MADE_MOST.w / Math.max(across, 0.01), MADE_MOST.d / Math.max(deep, 0.01), MADE_MOST.h / Math.max(h, 0.01));
  return Math.round(most * 100) / 100;
}

/** What stands on the horizon behind a set: a far city, hills, mountains, a forest, or nothing but ground and sky. */
export const FARS = ['city', 'hills', 'mountains', 'forest', 'open'] as const;
export type FarName = (typeof FARS)[number];
export const isFar = (value: unknown): value is FarName => typeof value === 'string' && (FARS as readonly string[]).includes(value);

export const LIGHTS = ['studio', 'day', 'golden hour', 'night', 'overcast', 'spotlight'] as const;
export type LightName = (typeof LIGHTS)[number];
/** How the frames are drawn, when the director names it (src/frame-style.ts has the same four). */
export const DRAWN = ['photo', 'sketch', 'anime', 'noir'] as const;
export const isDrawn = (value: unknown): value is (typeof DRAWN)[number] => typeof value === 'string' && (DRAWN as readonly string[]).includes(value);

export const isLight = (value: unknown): value is LightName => typeof value === 'string' && (LIGHTS as readonly string[]).includes(value);

export const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'says', 'fresh', 'light', 'far', 'drawn', 'remove', 'things', 'camera', 'next'],
  properties: {
    title: string,
    says: string,
    fresh: { type: 'boolean' },
    light: { type: 'string', enum: ['', ...LIGHTS] },
    far: { type: 'string', enum: ['', ...FARS] },
    drawn: { type: 'string', enum: ['', ...DRAWN] },
    remove: { type: 'array', items: string },
    things: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'name', 'x', 'z', 'y', 'yaw', 'size', 'paint', 'fitting', 'pose', 'act', 'look', 'build', 'parts'],
        properties: {
          id: string,
          name: string,
          x: number,
          z: number,
          y: number,
          yaw: number,
          size: number,
          paint: { type: 'string', enum: ['', ...PAINT_NAMES] },
          fitting: string,
          pose: { type: 'string', enum: ['', ...POSES] },
          act: { type: 'string', enum: ['', ...ACT_WORDS] },
          look: { type: 'string', enum: ['', ...LOOKS.map((look) => look.name)] },
          build: { type: 'string', enum: ['', ...BUILDS] },
          parts: { type: 'array', items: string },
        },
      },
    },
    camera: {
      type: 'object',
      additionalProperties: false,
      required: ['keep', 'x', 'z', 'height', 'lens', 'look_at', 'look_x', 'look_y', 'look_z'],
      properties: {
        keep: { type: 'boolean' },
        x: number,
        z: number,
        height: number,
        lens: { type: 'integer', enum: [...LENSES] },
        look_at: string,
        look_x: number,
        look_y: number,
        look_z: number,
      },
    },
    next: string,
  },
} as const;

/** The most a reply may ask for: parts in one new piece, new pieces in one reply, and things in one reply. */
export const MOST_PARTS = 32;
export const MOST_NEW = 8;
// Measured on a Quest 3S on Nov 14 with both hands tracked: 24 things at once ran 63 to 64 fps and 40 things fell to
// 49 while a piece moved, while the real model's largest set so far (14 things) held 87 idle and 71 moving.
export const MOST_THINGS = 20;
/** How far from the middle of the stage anything is put, in real metres, and how high. */
const REACH_X = 3.4;
const REACH_Z = 2.4;
const CAMERA_X = 3.5;
const CAMERA_FRONT = 4;
const HIGHEST = 9;

const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const clamp = (value: number, low: number, high: number): number => Math.max(low, Math.min(high, value));

/** One part of a new piece: its shape and finish, its size and where its middle is, and how it is turned, in metres and degrees. */
export type Part = { shape: Shape; finish: number; w: number; h: number; d: number; x: number; y: number; z: number; yaw: number; pitch: number; roll: number };

/**
 * Reads one written part: "<shape> <finish> w h d x y z [yaw pitch roll]". A line that cannot be read is
 * left out rather than guessed at; an unknown finish is bare wood.
 */
export function readPart(line: string): Part | null {
  const words = line.trim().toLowerCase().split(/[\s,]+/).filter((word) => word !== '');
  if (words.length < 8) return null;
  const shape = words[0] as Shape;
  if (!SHAPES.includes(shape)) return null;
  const finish = FINISHES[words[1]] ?? FINISHES.wood;
  const n = words.slice(2).map((word) => Number(word));
  if (n.slice(0, 6).some((value) => !Number.isFinite(value))) return null;
  const size = (value: number): number => clamp(Math.abs(value), 0.03, 12);
  const angle = (value: number | undefined): number => (value != null && Number.isFinite(value) ? value : 0);
  return {
    shape,
    finish,
    w: size(n[0]),
    h: size(n[1]),
    d: size(n[2]),
    x: clamp(n[3], -8, 8),
    y: clamp(n[4], -1, 14),
    z: clamp(n[5], -8, 8),
    yaw: angle(n[6]),
    pitch: angle(n[7]),
    roll: angle(n[8]),
  };
}

/** A thing as the reply gave it, made safe to act on: numbers in reach, words from their lists. */
export function cleanThing(raw: unknown): Thing | null {
  if (raw == null || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  const id = typeof t.id === 'string' ? t.id.trim().slice(0, 40) : '';
  if (id === '') return null;
  const text = (value: unknown, longest: number): string => (typeof value === 'string' ? value.replace(/[^\x20-\x7e]/g, '').trim().slice(0, longest) : '');
  const paint = text(t.paint, 20).toLowerCase();
  const pose = text(t.pose, 20);
  const act = text(t.act, 10).toLowerCase();
  const look = text(t.look, 20);
  const build = text(t.build, 10);
  const parts = Array.isArray(t.parts) ? t.parts.filter((part): part is string => typeof part === 'string').slice(0, MOST_PARTS) : [];
  return {
    id,
    name: text(t.name, 32),
    x: clamp(finite(t.x, 0), -REACH_X, REACH_X),
    z: clamp(finite(t.z, 0), -REACH_Z, REACH_Z),
    y: clamp(finite(t.y, 0), 0, HIGHEST),
    yaw: finite(t.yaw, 0),
    // 0 keeps the size the piece has; anything else is its size, from small to giant and a little past.
    size: finite(t.size, 1) <= 0 ? 0 : clamp(finite(t.size, 1), 0.3, 3),
    paint: PAINT_NAMES.includes(paint) ? paint : '',
    fitting: text(t.fitting, 20),
    pose: (POSES as readonly string[]).includes(pose) ? pose : '',
    act: (ACT_WORDS as readonly string[]).includes(act) ? act : '',
    look: LOOKS.some((entry) => entry.name === look) ? look : '',
    build: (BUILDS as readonly string[]).includes(build) ? build : '',
    parts: parts.map((part) => part.slice(0, 120)),
  };
}

export function cleanCamera(raw: unknown): CameraPlan | null {
  if (raw == null || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  const lens = finite(c.lens, 35);
  const nearest = LENSES.reduce((best, mm) => (Math.abs(mm - lens) < Math.abs(best - lens) ? mm : best), LENSES[0] as number);
  return {
    keep: c.keep === true,
    // The camera may stand off the stage, on the table in front of it, as a camera stands outside a set.
    x: clamp(finite(c.x, 0), -CAMERA_X, CAMERA_X),
    z: clamp(finite(c.z, 1.8), -REACH_Z, CAMERA_FRONT),
    height: clamp(finite(c.height, 1.2), 0.2, 11),
    lens: nearest,
    look_at: typeof c.look_at === 'string' ? c.look_at.trim().slice(0, 40) : '',
    look_x: clamp(finite(c.look_x, 0), -8, 8),
    look_y: clamp(finite(c.look_y, 1), -1, 14),
    look_z: clamp(finite(c.look_z, 0), -8, 8),
  };
}

/** Plain words for the panel: printable ASCII, cut to length. */
export const plainLine = (value: unknown, longest: number): string =>
  typeof value === 'string' ? value.replace(/[‘’]/g, "'").replace(/[–—]/g, ', ').replace(/[^\x20-\x7e]/g, '').trim().slice(0, longest) : '';

/**
 * Reads a reply as it arrives. Every time a whole value at the top of the reply is in, or a whole thing
 * in its list of things, it is handed on, so a set can go up piece by piece while the rest is still on
 * its way. It never parses half a value.
 */
export class PlanReader {
  private text = '';
  private at = 0;
  private depth = 0;
  private inString = false;
  private escaped = false;
  /** Where the value now being read at the top began, and its key. */
  private key = '';
  private keyStart = -1;
  private valueStart = -1;
  /** Inside the list of things: where the thing now being read began. */
  private inThings = false;
  private thingStart = -1;

  constructor(
    private onValue: (key: string, value: unknown) => void,
    private onThing: (thing: unknown) => void,
  ) {}

  /** Everything read so far. */
  get whole(): string {
    return this.text;
  }

  push(chunk: string): void {
    this.text += chunk;
    const s = this.text;
    for (; this.at < s.length; this.at++) {
      const ch = s[this.at];
      if (this.inString) {
        if (this.escaped) this.escaped = false;
        else if (ch === '\\') this.escaped = true;
        else if (ch === '"') {
          this.inString = false;
          // A key at the top: the string just closed, and a colon follows.
          if (this.depth === 1 && this.valueStart < 0 && this.keyStart >= 0) {
            this.key = s.slice(this.keyStart + 1, this.at);
            this.keyStart = -1;
          }
        }
        continue;
      }
      if (ch === '"') {
        this.inString = true;
        if (this.depth === 1 && this.valueStart < 0 && this.key === '') this.keyStart = this.at;
        continue;
      }
      if (ch === ':' && this.depth === 1 && this.valueStart < 0) {
        this.valueStart = this.at + 1;
        if (this.key === 'things') this.inThings = true;
        continue;
      }
      if (ch === '{' || ch === '[') {
        this.depth++;
        if (this.inThings && this.depth === 3 && ch === '{') this.thingStart = this.at;
        continue;
      }
      if (ch === '}' || ch === ']') {
        this.depth--;
        if (this.inThings && this.depth === 2 && ch === '}' && this.thingStart >= 0) {
          this.emitThing(s.slice(this.thingStart, this.at + 1));
          this.thingStart = -1;
        }
        if (this.depth === 0) this.endValue(this.at);
        continue;
      }
      if (ch === ',' && this.depth === 1) this.endValue(this.at);
    }
  }

  private endValue(end: number): void {
    if (this.valueStart < 0) return;
    const raw = this.text.slice(this.valueStart, end).trim();
    const key = this.key;
    this.key = '';
    this.valueStart = -1;
    this.inThings = false;
    if (key === 'things' || raw === '') return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      // A value that does not parse is left out; the reply as a whole is read again at the end.
      return;
    }
    this.onValue(key, value);
  }

  private emitThing(raw: string): void {
    let thing: unknown;
    try {
      thing = JSON.parse(raw);
    } catch {
      return;
    }
    this.onThing(thing);
  }
}
