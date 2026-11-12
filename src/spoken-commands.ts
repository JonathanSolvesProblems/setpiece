/**
 * The things on the panel that can be said instead of pinched: snap, a lens,
 * record and play, the rig, which camera is live, where the camera looks and
 * stands, and the paint and size of a piece already on the set.
 *
 * It is a plain function of the transcript and of the pieces the transcript
 * names. It decides nothing about the set: it only says which control was
 * asked for. Anything it does not recognise is left for the scene reader in
 * scene-words.ts, so "two actors and a red car" still builds a set.
 *
 * What it cannot do: move a piece to a new mark. Asked to, it says so, and the
 * app answers that moving is done by hand.
 */

/** A piece named in the transcript: the labels it could mean (a group names several), and the word it starts at. */
export type Named = { labels: string[]; at: number };

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
  | { do: 'paint'; labels: string[] | null; colour: string }
  | { do: 'size'; labels: string[] | null; size: SizeAsked }
  | { do: 'remove' }
  | { do: 'byHand' };

/** The same cleaning the scene reader gives a transcript, so word positions agree with it. */
export const spokenWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\[unk\]|<unk>/g, ' ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word !== '');

/** Words that carry no instruction of their own. */
const FILLER = new Set(
  'please now okay ok the a an to go switch change put on use give me set try lets let us can you could and then just um uh i want need my'.split(' '),
);
const LENS_UNITS = new Set(['lens', 'lenses', 'mil', 'mill', 'millimetre', 'millimetres', 'millimeter', 'millimeters', 'mm']);
const LENS_NAMES: Record<string, number> = {
  eighteen: 18, '18': 18,
  'twenty four': 24, '24': 24,
  'thirty five': 35, '35': 35,
  fifty: 50, '50': 50,
  'eighty five': 85, '85': 85,
  'one thirty five': 135, 'hundred thirty five': 135, 'one hundred thirty five': 135, '135': 135,
};
const WIDER = new Set(['wider', 'wide', 'go wider', 'zoom out', 'shorter']);
const TIGHTER = new Set(['tighter', 'tight', 'longer', 'zoom in', 'punch in']);

const RECORD = new Set(['record', 'recording', 'start recording', 'record take', 'record it', 'start take', 'roll', 'rolling', 'roll camera', 'action']);
const STOP = new Set(['stop', 'stop recording', 'stop it', 'stop take', 'stop playing', 'end take', 'cut', 'thats cut']);
const PLAY = new Set(['play', 'play it', 'play back', 'playback', 'play it back', 'play that back', 'play take', 'replay', 'replay it', 'show take']);

const FIRST = new Set(['a', 'ay', 'eh', 'one', 'first']);
const SECOND = new Set(['b', 'be', 'bee', 'two', 'second', 'other']);

/** Words dropped before a camera move is read: "bring the camera a little closer" is "closer". */
const MOVE_FILLER = new Set(['camera', 'move', 'bring', 'take', 'it', 'bit', 'little', 'slightly', 'more', 'come', 'get', 'in', 'up', 'down']);
const CLOSER = new Set(['closer', 'nearer', 'push', 'forward', 'forwards']);
const BACK = new Set(['back', 'further', 'farther', 'further back', 'farther back', 'pull back', 'pull out', 'away', 'further away']);
const HIGHER = new Set(['higher']);
const LOWER = new Set(['lower']);

/** Paint names as they are said. The value is what the kit calls the paint; 'bare wood' takes the paint off. */
const COLOURS: Record<string, string> = {
  red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue', white: 'white', black: 'black',
  purple: 'purple', pink: 'pink', grey: 'grey', gray: 'grey',
  wood: 'bare wood', wooden: 'bare wood', plain: 'bare wood', bare: 'bare wood', unpainted: 'bare wood',
};
const PAINT_VERBS = new Set(['paint', 'repaint', 'colour', 'color']);
const MAKE_VERBS = new Set(['make', 'turn', 'paint', 'repaint', 'colour', 'color', 'resize', 'scale', 'size']);
const IT = new Set(['it', 'that', 'this']);

const BIGGER = new Set(['bigger', 'larger', 'grow', 'enlarge']);
const SMALLER = new Set(['smaller', 'shrink', 'tinier']);
const SIZES: Record<string, SizeAsked> = {
  tiny: 'small', small: 'small', little: 'small',
  big: 'big', large: 'big',
  giant: 'giant', huge: 'giant', enormous: 'giant', massive: 'giant',
  normal: 'normal', regular: 'normal', original: 'normal',
};

const REMOVE_IT = /^(remove|delete|erase|lose|scrap|ditch|get rid of|take away|take out) (it|that|this)( one)?$|^take (it|that|this) (away|out|off)$/;
const BY_HAND = new Set(['move', 'slide', 'push', 'pull', 'rotate', 'spin', 'turn', 'flip', 'drag', 'shift', 'nudge']);
const AIM_VERBS = new Set(['frame', 'focus', 'film']);

/**
 * The control this transcript asks for, or null when it asks for none. `named`
 * is every piece the transcript names, as the scene reader finds them.
 */
export function commandIn(text: string, named: Named[]): Command | null {
  const words = spokenWords(text);
  if (words.length === 0) return null;
  const said = words.join(' ');
  const core = words.filter((word) => !FILLER.has(word));
  const rest = core.join(' ');
  const first = core[0] ?? '';
  const has = (set: Set<string>): boolean => words.some((word) => set.has(word));
  const onCamera = words.includes('camera');

  // Snap: the one word, or "take the frame".
  if (words.includes('snap') || words.includes('snapshot') || /\btake (the |a |that |this )?(frame|picture|photo|shot)\b/.test(said)) return { do: 'snap' };

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

  if (words.includes('tripod')) return { do: 'rig', rig: 'tripod' };
  if (words.includes('drone')) return { do: 'rig', rig: 'drone' };

  // A lens by its number, alone or with "lens" and "millimetre" around it.
  const lens = core.filter((word) => !LENS_UNITS.has(word)).join(' ');
  if (lens in LENS_NAMES) return { do: 'lens', mm: LENS_NAMES[lens] };
  if (WIDER.has(lens)) return { do: 'lensStep', step: -1 };
  if (TIGHTER.has(lens)) return { do: 'lensStep', step: 1 };

  // Pieces other than the cameras themselves, which are worked from the panel and by these words, not named as targets.
  const pieces = named.filter((name) => !name.labels.every((label) => label.startsWith('Camera')));
  const target = pieces[0] ?? null;
  const itIsMeant = has(IT);

  // A paint, for the piece named or the one last touched.
  const colourAt = words.findIndex((word) => word in COLOURS);
  if (colourAt >= 0 && !onCamera) {
    const colour = COLOURS[words[colourAt]];
    if (PAINT_VERBS.has(first)) return { do: 'paint', labels: target?.labels ?? null, colour };
    if (MAKE_VERBS.has(first) && target != null && colourAt > target.at) return { do: 'paint', labels: target.labels, colour };
    if (MAKE_VERBS.has(first) && target == null && itIsMeant) return { do: 'paint', labels: null, colour };
  }

  // A size, the same way.
  if (!onCamera) {
    if (has(BIGGER)) return { do: 'size', labels: target?.labels ?? null, size: 'bigger' };
    if (has(SMALLER)) return { do: 'size', labels: target?.labels ?? null, size: 'smaller' };
    const sizeAt = words.findIndex((word) => word in SIZES);
    if (sizeAt >= 0 && MAKE_VERBS.has(first)) {
      const size = SIZES[words[sizeAt]];
      if (target != null && sizeAt > target.at) return { do: 'size', labels: target.labels, size };
      if (target == null && itIsMeant) return { do: 'size', labels: null, size };
    }
    if (target == null && (rest === 'normal size' || rest === 'original size' || rest === 'regular size')) return { do: 'size', labels: null, size: 'normal' };
  }

  // Where the camera looks: "camera on the dragon", "frame actor b".
  if (target != null && (onCamera || AIM_VERBS.has(first))) return { do: 'aim', labels: target.labels };

  // "Take it away" is about the piece last touched, not the camera.
  if (REMOVE_IT.test(rest)) return { do: 'remove' };

  // Where the camera stands: closer, back, higher, lower.
  const move = core.filter((word) => !MOVE_FILLER.has(word)).join(' ');
  if (target == null) {
    if (CLOSER.has(move) || (onCamera && rest === 'camera in')) return { do: 'step', step: 'closer' };
    if (BACK.has(move) || (onCamera && rest === 'camera out')) return { do: 'step', step: 'back' };
    if (HIGHER.has(move) || (onCamera && (rest === 'camera up' || rest === 'raise camera'))) return { do: 'step', step: 'higher' };
    if (LOWER.has(move) || (onCamera && (rest === 'camera down' || rest === 'lower camera'))) return { do: 'step', step: 'lower' };
  }

  // Asked to move something: that is the one thing words cannot do here.
  if (BY_HAND.has(first) && !/\b(turn|switch) off\b/.test(said)) return { do: 'byHand' };
  return null;
}

/** Words the reader knows that a recogniser is not told to listen for: typed forms, rare ones, and letters said alone. */
const NOT_LISTENED_FOR = new Set([
  'cam', 'mm', 'mill', 'thats', 'snapshot', 'tinier', 'nudge', 'unpainted', 'repaint', 'regular', 'forwards', 'farther',
  'a', 'ay', 'eh', 'b', 'be', 'bee',
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
  take(['go', 'switch', 'up', 'down', 'in', 'out', 'bit', 'little', 'it', 'bring', 'move', 'raise', 'first', 'second', 'other', 'two', 'one']);
  take(['remove', 'delete', 'erase', 'lose', 'scrap', 'ditch', 'get rid of', 'take away', 'take out', 'off']);
  take(Object.keys(LENS_NAMES));
  take(LENS_UNITS);
  for (const set of [WIDER, TIGHTER, RECORD, STOP, PLAY, CLOSER, BACK, HIGHER, LOWER, PAINT_VERBS, MAKE_VERBS, IT, BIGGER, SMALLER, BY_HAND, AIM_VERBS]) take(set);
  take(Object.keys(COLOURS));
  take(Object.keys(SIZES));
  const out = [...words];
  for (const lead of ['camera', 'cut to', 'cut to camera']) for (const id of ['a', 'ay', 'b', 'be', 'bee']) out.push(`${lead} ${id}`);
  return out;
}
