/**
 * The things on the panel that can be said instead of pinched: snap, a lens,
 * record and play, the rig, which camera is live, where the camera looks and
 * stands, and the paint and size of a piece already on the set.
 *
 * It is a plain function of the words and of the pieces those words name. It
 * decides nothing about the set: it only says which control was asked for.
 * It is strict on purpose. A sentence is a control only when nothing in it
 * asks for anything else: one more piece named, a count, a word it has no use
 * for, and the sentence is left whole for the scene reader in scene-words.ts,
 * so "put a dragon in front of the camera" still adds a dragon and "two actors
 * and a red car" still builds a set. A sentence that strings a control to
 * something else with "and" is taken apart before it gets here, in
 * scene-request.ts.
 *
 * What it cannot do: move a piece to a new mark. Asked to, it says so, and the
 * app answers that moving is done by hand.
 */

/**
 * A piece named in the words: the labels it could mean (a group names several), the word it
 * starts at and how many words it is, and whether it was said for all of them ("the cars", "everyone").
 */
export type Named = { labels: string[]; at: number; length: number; all: boolean };

export type SizeAsked = 'bigger' | 'smaller' | 'normal' | 'small' | 'big' | 'giant';
export type CameraStep = 'closer' | 'back' | 'higher' | 'lower';

export type Command =
  | { do: 'snap' }
  | { do: 'lens'; mm: number }
  | { do: 'lensStep'; step: -1 | 1 }
  | { do: 'record' }
  | { do: 'stop' }
  | { do: 'play' }
  | { do: 'rig'; rig: 'tripod' | 'drone' }
  | { do: 'cut'; camera: 0 | 1 }
  | { do: 'aim'; labels: string[] }
  | { do: 'step'; step: CameraStep }
  | { do: 'paint'; labels: string[] | null; all: boolean; colour: string }
  | { do: 'size'; labels: string[] | null; all: boolean; size: SizeAsked }
  | { do: 'remove' }
  | { do: 'byHand' };

/** Words that carry no instruction of their own. */
const FILLER = new Set(
  'please now okay ok the a an to go switch change put on use give me set try lets let us can you could and then just um uh i want need my'.split(' '),
);
/** Words a sentence may open with before it gets to the point. */
const OPENERS = new Set('please now okay ok and then just um uh so well the a an'.split(' '));
/** Words that ask for a new piece: "a car", "two cars", "another tree". After them a name is something to add. */
const NEW_ONE = new Set('a an another some one two three four five six couple few several more'.split(' '));
const IT = new Set(['it', 'that', 'this']);

const SNAP_WORDS = new Set(['snap', 'snapshot', 'it', 'that', 'this', 'frame', 'picture', 'photo', 'shot', 'one']);
const TAKE_A_FRAME = /^take (that |this )?(frame|picture|photo|shot)$/;

const LENS_UNITS = new Set(['lens', 'lenses', 'mil', 'mill', 'millimetre', 'millimetres', 'millimeter', 'millimeters', 'mm']);
const LENS_NAMES: Record<string, number> = {
  eighteen: 18, '18': 18,
  'twenty four': 24, '24': 24,
  'thirty five': 35, '35': 35,
  fifty: 50, '50': 50,
  'eighty five': 85, '85': 85,
  'one thirty five': 135, 'hundred thirty five': 135, 'one hundred thirty five': 135, '135': 135,
};
const WIDER = new Set(['wider', 'wide', 'zoom out', 'shorter']);
const TIGHTER = new Set(['tighter', 'tight', 'longer', 'zoom in', 'punch in']);

const RECORD = new Set(['record', 'recording', 'start recording', 'record take', 'record it', 'start take', 'roll', 'rolling', 'roll camera', 'action']);
const STOP = new Set(['stop', 'stop recording', 'stop it', 'stop take', 'stop playing', 'end take', 'cut', 'thats cut']);
const PLAY = new Set(['play', 'play it', 'play back', 'playback', 'play it back', 'play that back', 'play take', 'replay', 'replay it', 'show take']);

const FIRST = new Set(['a', 'ay', 'eh', 'one', 'first']);
const SECOND = new Set(['b', 'be', 'bee', 'two', 'second', 'other']);
const RIG_WORDS = new Set(['tripod', 'drone', 'camera', 'it', 'back', 'legs', 'fly', 'shot', 'rig']);

/** Words dropped before a camera step is read: "bring the camera a little closer" is "closer". */
const STEP_FILLER = new Set(['camera', 'move', 'bring', 'take', 'come', 'get', 'bit', 'little', 'slightly', 'more']);
/** A step said on its own: with no camera named, these can only be about the camera. */
const STEPS: Record<string, CameraStep> = {
  closer: 'closer', nearer: 'closer', 'push in': 'closer', 'closer in': 'closer',
  back: 'back', further: 'back', farther: 'back', 'further back': 'back', 'farther back': 'back', 'further away': 'back', 'pull back': 'back', 'pull out': 'back', 'back up': 'back',
  higher: 'higher',
  lower: 'lower',
};
/** A step that needs the camera named, because the word alone could be about anything. */
const STEPS_OF_THE_CAMERA: Record<string, CameraStep> = {
  in: 'closer', forward: 'closer', forwards: 'closer',
  out: 'back', away: 'back',
  up: 'higher', raise: 'higher',
  down: 'lower',
};

/** Paint names as they are said. The value is what the kit calls the paint; 'bare wood' takes the paint off. */
const COLOURS: Record<string, string> = {
  red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', white: 'white', black: 'black',
  purple: 'purple', pink: 'pink', grey: 'grey', gray: 'grey',
  wood: 'bare wood', wooden: 'bare wood', plain: 'bare wood', bare: 'bare wood', unpainted: 'bare wood',
};
const PAINT_VERBS = new Set(['paint', 'repaint', 'colour', 'color']);
const MAKE_VERBS = new Set(['make', 'turn']);
const SIZE_VERBS = new Set(['make', 'turn', 'resize', 'scale', 'size']);
const GROW_VERBS = new Set(['grow', 'enlarge']);
const SHRINK_VERBS = new Set(['shrink']);
const BIGGER = new Set(['bigger', 'larger']);
const SMALLER = new Set(['smaller', 'tinier']);
const SIZES: Record<string, SizeAsked> = {
  tiny: 'small', small: 'small', little: 'small',
  big: 'big', large: 'big',
  giant: 'giant', huge: 'giant', enormous: 'giant', massive: 'giant',
  normal: 'normal', regular: 'normal', original: 'normal',
};
/** Words that may sit in a sentence about a size without changing it: "make it a bit bigger". */
const SIZE_FILLER = new Set(['bit', 'much', 'more', 'lot', 'way', 'even', 'slightly']);
const WHOLE_SIZES = new Set(['normal size', 'original size', 'regular size']);

const REMOVE_IT = /^(remove|delete|erase|lose|scrap|ditch|get rid of|take away|take out) (it|that|this)( one)?$|^take (it|that|this) (away|out|off)$/;
const BY_HAND = new Set(['move', 'slide', 'push', 'pull', 'rotate', 'spin', 'turn', 'flip', 'drag', 'shift', 'nudge']);
/** Verbs that may lead up to "the camera" in an aim: "point the camera at the car". */
const AIM_LEADS = new Set(['put', 'point', 'aim', 'turn', 'get', 'set', 'move', 'swing', 'pan']);
const AIM_VERBS = new Set(['frame', 'focus', 'film']);
/** Words that may stand between the camera, or an aim verb, and the piece it is aimed at. */
const AIM_JOINS = new Set(['on', 'onto', 'at', 'to', 'toward', 'towards', 'the', 'that', 'this', 'my']);

/**
 * The control these words ask for, or null when they ask for none. `words` is
 * the sentence as the scene reader cleans it, and `named` is every piece it
 * names, with word positions in that same list.
 */
export function commandIn(words: string[], named: Named[]): Command | null {
  if (words.length === 0) return null;
  // The cameras are worked from the panel and by these words; they are not targets.
  const pieces = named.filter((name) => name.labels.length > 0 && !name.labels.every((label) => label.startsWith('Camera')));
  const inName = new Array<boolean>(words.length).fill(false);
  for (const piece of pieces) for (let i = piece.at; i < piece.at + piece.length && i < words.length; i++) inName[i] = true;
  // What the sentence says apart from the names in it and the words that carry nothing.
  const core: string[] = [];
  for (let i = 0; i < words.length; i++) if (!inName[i] && !FILLER.has(words[i])) core.push(words[i]);
  const rest = core.join(' ');
  const said = words.join(' ');
  const onCamera = core.includes('camera');
  const itIsMeant = core.some((word) => IT.has(word));
  let opens = 0;
  while (opens < words.length && OPENERS.has(words[opens]) && !inName[opens]) opens++;
  const first = inName[opens] ? '' : (words[opens] ?? '');
  const target = pieces.length === 1 ? pieces[0] : null;
  /** A name that follows "a", "two" or "another" is a piece being asked for, not one already there. */
  const asksForOne = target != null && NEW_ONE.has(words[target.at - 1] ?? '');
  const except = (...sets: Set<string>[]): string[] => core.filter((word) => !sets.some((set) => set.has(word)));

  if (pieces.length === 0) {
    // Snap: the one word, or "take the frame".
    if ((core.includes('snap') || core.includes('snapshot')) && core.every((word) => SNAP_WORDS.has(word))) return { do: 'snap' };
    if (TAKE_A_FRAME.test(rest)) return { do: 'snap' };

    // The take. Whole sentences only, so "stop the rain" is still about the rain.
    if (RECORD.has(rest)) return { do: 'record' };
    if (STOP.has(rest)) return { do: 'stop' };
    if (PLAY.has(rest)) return { do: 'play' };

    // Which camera is live: "camera b", "cut to a", "the other camera".
    const last = words[words.length - 1];
    const lead = words.slice(0, -1).filter((word) => !FILLER.has(word)).join(' ');
    const cutLead = lead === 'camera' || lead === 'cam' || lead === 'cut' || lead === 'cut camera';
    if ((cutLead && FIRST.has(last)) || rest === 'first camera') return { do: 'cut', camera: 0 };
    if ((cutLead && SECOND.has(last)) || rest === 'second camera' || rest === 'other camera') return { do: 'cut', camera: 1 };

    if (core.includes('tripod') && core.every((word) => RIG_WORDS.has(word))) return { do: 'rig', rig: 'tripod' };
    if (core.includes('drone') && core.every((word) => RIG_WORDS.has(word))) return { do: 'rig', rig: 'drone' };

    // A lens by its number, alone or with "lens" and "millimetre" around it.
    const lens = core.filter((word) => !LENS_UNITS.has(word)).join(' ');
    if (lens in LENS_NAMES) return { do: 'lens', mm: LENS_NAMES[lens] };
    if (WIDER.has(lens)) return { do: 'lensStep', step: -1 };
    if (TIGHTER.has(lens)) return { do: 'lensStep', step: 1 };

    // "Take it away" is about the piece last touched.
    if (REMOVE_IT.test(rest)) return { do: 'remove' };

    // Where the camera stands. "Bring it back" is not this: "it" with no camera named is a piece.
    if (onCamera || !itIsMeant) {
      const step = core.filter((word) => !STEP_FILLER.has(word) && !IT.has(word)).join(' ');
      if (step in STEPS) return { do: 'step', step: STEPS[step] };
      if (onCamera && step in STEPS_OF_THE_CAMERA) return { do: 'step', step: STEPS_OF_THE_CAMERA[step] };
    }
  }

  // A paint, for the one piece named or, with "it", the one last touched. One colour, and nothing else asked.
  const colours = core.filter((word) => word in COLOURS);
  if (pieces.length <= 1 && colours.length === 1 && !onCamera) {
    const colour = COLOURS[colours[0]];
    const colourAt = words.indexOf(colours[0]);
    const all = target?.all ?? false;
    if (PAINT_VERBS.has(first) && except(PAINT_VERBS, IT, new Set([colours[0], 'in'])).length === 0) {
      return { do: 'paint', labels: target?.labels ?? null, all, colour };
    }
    if (MAKE_VERBS.has(first) && except(MAKE_VERBS, IT, new Set([colours[0]])).length === 0) {
      if (target != null && !asksForOne && colourAt > target.at) return { do: 'paint', labels: target.labels, all, colour };
      if (target == null && itIsMeant) return { do: 'paint', labels: null, all: false, colour };
    }
  }

  // A size, the same way: after the piece it is about, or with "it", or said alone.
  if (pieces.length <= 1 && !onCamera && !asksForOne) {
    const all = target?.all ?? false;
    const labels = target?.labels ?? null;
    const after = (word: string): boolean => target == null || words.indexOf(word) > target.at;
    const steps = core.filter((word) => BIGGER.has(word) || SMALLER.has(word));
    const verbs = core.filter((word) => GROW_VERBS.has(word) || SHRINK_VERBS.has(word));
    const named1 = core.filter((word) => word in SIZES);
    const spare = except(SIZE_VERBS, GROW_VERBS, SHRINK_VERBS, BIGGER, SMALLER, IT, SIZE_FILLER, new Set(Object.keys(SIZES)));
    if (spare.length === 0 && colours.length === 0) {
      if (steps.length === 1 && verbs.length === 0 && named1.length === 0 && after(steps[0])) {
        return { do: 'size', labels, all, size: BIGGER.has(steps[0]) ? 'bigger' : 'smaller' };
      }
      if (verbs.length === 1 && steps.length === 0 && named1.length === 0 && first === verbs[0] && (target != null || itIsMeant)) {
        return { do: 'size', labels, all, size: GROW_VERBS.has(verbs[0]) ? 'bigger' : 'smaller' };
      }
      if (named1.length === 1 && steps.length === 0 && verbs.length === 0 && SIZE_VERBS.has(first) && after(named1[0]) && (target != null || itIsMeant)) {
        return { do: 'size', labels, all, size: SIZES[named1[0]] };
      }
    }
    if (target == null && WHOLE_SIZES.has(rest)) return { do: 'size', labels: null, all: false, size: 'normal' };
  }

  // Where the camera looks: "camera on the dragon", "point the camera at the red car", "frame actor b".
  if (target != null && !asksForOne) {
    const camera = words.indexOf('camera');
    const from = camera >= 0 && camera < target.at ? camera : AIM_VERBS.has(first) ? opens : -1;
    if (from >= 0) {
      const before = words.slice(0, from).every((word) => OPENERS.has(word) || AIM_LEADS.has(word));
      const between = words.slice(from + 1, target.at).every((word) => AIM_JOINS.has(word) || word in COLOURS || word in SIZES);
      const behind = words.slice(target.at + target.length).every((word) => OPENERS.has(word));
      if (before && between && behind) return { do: 'aim', labels: target.labels };
    }
  }

  // Asked to move something: that is the one thing words cannot do here.
  if (BY_HAND.has(first) && (pieces.length > 0 || itIsMeant || onCamera) && !/\b(turn|switch)\b.*\b(on|off)\b/.test(said)) return { do: 'byHand' };
  return null;
}

/** One thing a sentence asks for: a control, or words left for the scene reader. */
export type Part = { words: string[]; command: Command | null };

/**
 * What a sentence asks for, in the order it was said. A sentence that is one control, or none,
 * comes back whole. One that strings a control to something else with "and" or "then" ("paint it
 * red and snap", "add a car and take the shot") is taken apart: each control on its own, and
 * whatever lies between them left together for the scene reader, as it was said. `read` is the
 * reader for one stretch of words: commandIn with the names found in that stretch.
 */
export function partsIn(words: string[], read: (words: string[]) => Command | null): Part[] {
  const whole: Part[] = [{ words, command: null }];
  const all = read(words);
  if (all != null) return [{ words, command: all }];
  const clauses: string[][] = [[]];
  for (const word of words) {
    if (word === 'and' || word === 'then') {
      if (clauses[clauses.length - 1].length > 0) clauses.push([]);
    } else clauses[clauses.length - 1].push(word);
  }
  if (clauses[clauses.length - 1].length === 0) clauses.pop();
  if (clauses.length < 2) return whole;
  const joined = (from: number, to: number): string[] => clauses.slice(from, to).flatMap((clause, n) => (n === 0 ? clause : ['and', ...clause]));
  const parts: Part[] = [];
  for (let i = 0; i < clauses.length; ) {
    // The longest run of clauses from here that is one control: "one hundred and thirty five" is a lens, not two things.
    let taken = 0;
    let command: Command | null = null;
    for (let j = clauses.length; j > i && command == null; j--) {
      command = read(joined(i, j));
      if (command != null) taken = j - i;
    }
    const last = parts[parts.length - 1];
    if (command != null) {
      parts.push({ words: joined(i, i + taken), command });
      i += taken;
    } else {
      if (last != null && last.command == null) last.words.push('and', ...clauses[i]);
      else parts.push({ words: [...clauses[i]], command: null });
      i++;
    }
  }
  return parts.some((part) => part.command != null) ? parts : whole;
}

/** Words the reader knows that a recogniser is not told to listen for: typed forms, rare ones, short ones, and letters said alone. */
const NOT_LISTENED_FOR = new Set([
  'cam', 'mm', 'mill', 'thats', 'snapshot', 'tinier', 'nudge', 'unpainted', 'repaint', 'regular', 'forwards', 'farther',
  'a', 'ay', 'eh', 'b', 'be', 'bee', 'go', 'bit', 'end', 'switch', 'lot', 'way', 'even', 'onto', 'my',
]);

/**
 * The words and phrases the commands are made of, for a recogniser that listens for a fixed
 * list. Which camera is listed as whole phrases ("camera b"): a letter listed alone is too
 * easily written down where none was said.
 */
export function commandWords(): string[] {
  const words = new Set<string>();
  const take = (phrases: Iterable<string>): void => {
    for (const phrase of phrases) for (const word of phrase.split(' ')) if (/^[a-z]+$/.test(word) && !NOT_LISTENED_FOR.has(word)) words.add(word);
  };
  take(['snap', 'take', 'frame', 'picture', 'photo', 'shot', 'camera', 'cut', 'tripod', 'drone', 'hundred', 'size']);
  take(['up', 'down', 'in', 'out', 'little', 'it', 'bring', 'move', 'raise', 'first', 'second', 'other', 'two', 'one']);
  take(['remove', 'delete', 'erase', 'lose', 'scrap', 'ditch', 'get rid of', 'take away', 'take out', 'off']);
  take(Object.keys(LENS_NAMES));
  take(LENS_UNITS);
  take(Object.keys(STEPS));
  take(Object.keys(STEPS_OF_THE_CAMERA));
  for (const set of [WIDER, TIGHTER, RECORD, STOP, PLAY, PAINT_VERBS, MAKE_VERBS, SIZE_VERBS, GROW_VERBS, SHRINK_VERBS, IT, BIGGER, SMALLER, BY_HAND, AIM_VERBS, AIM_LEADS, AIM_JOINS]) take(set);
  take(Object.keys(COLOURS));
  take(Object.keys(SIZES));
  const out = [...words];
  for (const lead of ['camera', 'cut to', 'cut to camera']) for (const id of ['a', 'ay', 'b', 'be', 'bee']) out.push(`${lead} ${id}`);
  return out;
}
