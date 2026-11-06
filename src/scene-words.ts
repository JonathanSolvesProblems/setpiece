/**
 * Reads a spoken request for the set: "make me a scene with a dragon, two
 * actors and a burning car" becomes a list of pieces to add, pieces to take
 * away, and things that were asked for but are not in the library.
 *
 * It is a plain function of the transcript and the vocabulary it is given. It
 * knows no catalog of its own: the tables below only say which everyday words
 * mean the same thing ("lorry" is a truck), and a word from them counts for
 * nothing unless the vocabulary has the piece it stands for.
 *
 * What it cannot do: add a piece that was not said. Every item it returns
 * comes from a word in the transcript that names a piece in the vocabulary.
 * An empty or meaningless transcript returns an empty request.
 */

export type Vocab = { label: string; title: string; shelf: string; aliases?: string[] }[];

export type Request = {
  clear: boolean;
  items: { label: string; count: number; colour?: string; size?: 'small' | 'big' | 'giant' }[];
  remove: string[];
  unknown: string[];
};

type Size = 'small' | 'big' | 'giant';

/** The most of one piece a request can ask for. */
const MOST = 6;

const COUNTS: Record<string, number> = {
  a: 1, an: 1, one: 1, single: 1, another: 1,
  two: 2, couple: 2, pair: 2, both: 2,
  three: 3, few: 3, several: 3,
  four: 4, five: 5, six: 6,
  seven: MOST, eight: MOST, nine: MOST, ten: MOST, dozen: MOST,
};

/**
 * Numbers a recogniser writes as another word. They only count as numbers
 * right before a plural it knows: "to actors", "for trees", "free cars".
 */
const MISHEARD_COUNTS: Record<string, number> = { to: 2, too: 2, for: 4, fore: 4, free: 3 };

const COLOURS: Record<string, string> = {
  red: 'red', orange: 'orange', yellow: 'yellow', green: 'green', blue: 'blue',
  purple: 'purple', pink: 'pink', white: 'white', black: 'black', grey: 'grey', gray: 'grey',
};

const SIZES: Record<string, Size> = {
  tiny: 'small', small: 'small', little: 'small', mini: 'small', miniature: 'small',
  big: 'big', large: 'big',
  giant: 'giant', huge: 'giant', enormous: 'giant', massive: 'giant', gigantic: 'giant',
};

/**
 * Other words for the pieces, by the piece's plain name. The order matters
 * where a word could mean two pieces: the first piece that is in the
 * vocabulary takes it ("bike" is the bicycle if there is one, else the motorbike).
 * A few entries are not synonyms but what the small Vosk model wrote when a
 * synthetic voice said the name: "crock" for kraken, "iraq" for a rock. Those
 * are in MISHEARD_NAMES too, so a recogniser is never told to listen for them.
 */
const SYNONYMS: [string, string[]][] = [
  ['actor', ['actress', 'person', 'man', 'woman', 'guy', 'girl', 'boy', 'human', 'performer']],
  ['creature', ['monster', 'beast']],
  ['dragon', ['drake', 'wyvern']],
  ['troll', ['ogre']],
  ['dinosaur', ['dino', 't rex', 'tyrannosaurus', 'raptor']],
  ['robot', ['android', 'droid', 'mech']],
  ['alien', ['martian', 'extraterrestrial']],
  ['ghost', ['phantom', 'spook', 'spectre', 'specter']],
  ['spider', ['tarantula']],
  ['kraken', ['sea monster', 'octopus', 'squid', 'cracken', 'kracken', 'crock']],
  ['horse', ['pony', 'stallion']],
  ['wolf', ['werewolf']],
  ['car', ['automobile', 'sedan', 'motor car']],
  ['van', ['minivan']],
  ['bicycle', ['bike', 'push bike', 'pushbike']],
  ['motorbike', ['motorcycle', 'motor bike', 'motor cycle', 'bike', 'moped', 'scooter']],
  ['pickup', ['pickup truck', 'pick up truck', 'ute']],
  ['truck', ['lorry', 'fire truck', 'fire engine', 'dump truck', 'big rig']],
  ['bus', ['coach', 'minibus', 'school bus']],
  ['helicopter', ['chopper', 'copter']],
  ['saucer', ['flying saucer', 'ufo', 'u f o', 'spaceship', 'space ship', 'spacecraft', 'alien ship']],
  ['boat', ['ship', 'sailboat', 'speedboat', 'yacht', 'rowboat']],
  ['tank', []],
  ['fire', ['flame', 'flames', 'blaze', 'bonfire', 'campfire', 'burning', 'flaming']],
  ['smoke', ['fog', 'mist', 'haze', 'smoking', 'smoky']],
  ['water', ['puddle', 'flood', 'splash']],
  ['explosion', ['blast', 'exploding', 'detonation', 'kaboom']],
  ['rain', ['raining', 'rainstorm', 'downpour', 'drizzle', 'storm']],
  ['sparks', ['spark', 'sparking']],
  ['wall', ['brick wall']],
  ['lamp post', ['lamppost', 'lamp', 'street lamp', 'streetlamp', 'street light', 'streetlight', 'light post']],
  ['tree', ['oak']],
  ['crate', ['box', 'wooden box']],
  ['barrier', ['barricade', 'roadblock', 'road block']],
  ['house', ['cottage', 'cabin', 'building']],
  ['bench', ['park bench']],
  ['cone', ['traffic cone', 'pylon']],
  ['dumpster', ['bin', 'trash can', 'garbage can', 'rubbish bin', 'wheelie bin']],
  ['rock', ['boulder', 'stone', 'iraq']],
  ['fence', ['railing']],
  ['stairs', ['stair', 'staircase', 'stairway', 'steps']],
  ['door', ['doorway']],
  ['pillar', ['column']],
];

const MISHEARD_NAMES = new Set(['crock', 'cracken', 'kracken', 'iraq']);

/** Words that mean every member of a group at once. */
const EVERY_MEMBER: Record<string, string[]> = { actor: ['everyone', 'everybody'] };

/** A describing word that brings its own piece along: a "burning car" is a car and a fire. */
const DESCRIBING = new Set(['burning', 'flaming', 'smoking', 'smoky', 'exploding', 'sparking']);

/**
 * Things people ask for that no library here has had. Hearing them is what
 * lets the app answer "I have no spaceship" instead of doing nothing.
 */
const OTHER_THINGS = [
  'plane', 'airplane', 'jet', 'rocket', 'train', 'submarine', 'dog', 'cat', 'bird', 'cow', 'bear', 'lion',
  'tiger', 'shark', 'snake', 'zombie', 'vampire', 'witch', 'wizard', 'knight', 'soldier', 'unicorn', 'gun',
  'sword', 'bomb', 'chair', 'sofa', 'bridge', 'tower', 'castle', 'cloud', 'snow', 'lightning', 'tornado',
  'laser', 'balloon', 'flag', 'statue', 'barrel', 'ladder', 'tent', 'umbrella',
];

/** How a letter or number at the end of a title ("Actor B") comes out of a recogniser. */
const SPOKEN_ID: Record<string, string[]> = {
  a: ['a', 'ay', 'eh'], b: ['b', 'be', 'bee'], c: ['c', 'see', 'sea'], d: ['d', 'dee'], e: ['e'], f: ['f', 'ef'],
  '1': ['1', 'one'], '2': ['2', 'two', 'to', 'too'], '3': ['3', 'three'], '4': ['4', 'four', 'for'],
  '5': ['5', 'five'], '6': ['6', 'six'],
};

const PLURALS: Record<string, string> = {
  man: 'men', woman: 'women', person: 'people', wolf: 'wolves', werewolf: 'werewolves',
};

const DETERMINERS = new Set(['the', 'some', 'any', 'this', 'that', 'these', 'those', 'my', 'your', 'our', 'all', 'every', 'each']);

/** Words that sit inside "two more of the big new cars" without ending it. */
const PASS_THROUGH = new Set([
  'of', 'more', 'extra', 'very', 'really', 'quite', 'new', 'old', 'whole', 'nice', 'scary', 'cool', 'angry',
  'broken', 'flying', 'floating', 'dead', 'other',
]);

/** Verbs that are followed at once by the thing: "add spaceship". */
const ADD_DIRECT = new Set(['add', 'ad', 'put', 'place', 'insert', 'spawn', 'include', 'plus']);
const ADD_WORDS = new Set([...ADD_DIRECT, 'give', 'bring', 'want', 'need', 'have', 'get', 'create', 'build', 'show']);
const REMOVE_DIRECT = new Set(['remove', 'delete', 'erase']);
const REMOVE_WORDS = new Set([
  ...REMOVE_DIRECT, 'lose', 'kill', 'stop', 'hide', 'ditch', 'scrap', 'take', 'minus', 'replace', 'clear', 'empty', 'wipe',
]);
const REMOVE_PHRASES = [
  'get rid of', 'take away', 'take out', 'take off', 'put out', 'turn off', 'switch off', 'leave out', 'clear out',
];
/** These take away only the next thing named: "no rain and a dragon" keeps the dragon. */
const NEXT_ONLY = new Set(['no', 'without']);
/** Verbs that are about a piece already on the set. Nothing named after them is added or removed. */
const HANDLE_WORDS = new Set([
  'move', 'turn', 'rotate', 'spin', 'keep', 'leave', 'face', 'look', 'point', 'aim', 'follow', 'grab', 'hold',
  'select', 'pick', 'push', 'pull', 'slide', 'flip', 'tilt', 'raise', 'lower', 'lift', 'swap', 'change',
  'paint', 'colour', 'color', 'resize', 'scale', 'shrink', 'grow', 'enlarge',
]);

/** Phrases that mean an empty set to begin with. */
const FRESH_PHRASES = [
  'start over', 'start again', 'start fresh', 'start afresh', 'from scratch', 'begin again', 'clean slate',
  'new scene', 'new set', 'fresh scene', 'blank scene', 'another scene', 'different scene', 'reset', 'restart',
];
const SCENE_VERBS = new Set(['make', 'build', 'create', 'give', 'want', 'need', 'start', 'compose']);
const SCENE_FILL = new Set(['me', 'us', 'a', 'an', 'new', 'another', 'whole', 'different', 'fresh', 'up']);
const EMPTYING = new Set(['clear', 'empty', 'wipe']);
const EMPTYING_FILL = new Set(['the', 'this', 'that', 'my', 'out', 'off', 'up', 'whole', 'entire']);
const WHOLE_SET = new Set(['set', 'scene', 'table', 'stage', 'slate', 'everything', 'it']);

/** Ordinary words that are never a thing someone asked for. */
const PLAIN = new Set(
  (
    'i me my we us you it its they them he she him her who what which where when why how ' +
    'is are was were be been being am do does did done can could would should will shall may might must ' +
    'and or but so then than also too as if because while though ' +
    'to in on at by for from into onto over under above below behind beside between near next through across ' +
    'around along up down out off away back front left right middle centre center side top bottom corner edge ' +
    'here there now again just only still yet already almost maybe perhaps not ' +
    'please thanks thank okay ok yes yeah yep nope hey hello hi um uh er ah oh well like so ' +
    'lets dont cant wont isnt im id ill ive thats theres whats ' +
    'scene set table stage slate shot frame camera board place way lot bit bunch kind sort type number rest ' +
    'thing things stuff something anything nothing everything one ones same time moment second minute ' +
    'made make making go going goes went come comes came got getting put see say said tell think know ' +
    'try let use using stand standing sit sitting sat stood ran run running fell fall falling walk walking ' +
    'drop start begin end finish done ready good bad great fine sure wrong much many most ' +
    'floor ground sky air background foreground distance inside outside together apart with about'
  ).split(' '),
);

type Name =
  | { kind: 'piece'; label: string; plural: boolean; member: boolean; describing: boolean }
  | { kind: 'group'; group: string; plural: boolean; every: boolean }
  | { kind: 'shelf'; shelf: string }
  | { kind: 'missing'; word: string };

type Lexicon = {
  names: Map<string, Name>;
  longest: number;
  groups: Map<string, string[]>;
  shelves: Map<string, string[]>;
};

type Match = { name: Name; length: number };

const plain = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\[unk\]|<unk>/g, ' ')
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function pluralOf(phrase: string): string {
  const cut = phrase.lastIndexOf(' ') + 1;
  const word = phrase.slice(cut);
  let many: string;
  if (PLURALS[word]) many = PLURALS[word];
  else if (/(s|x|z|ch|sh)$/.test(word)) many = `${word}es`;
  else if (/[^aeiou]y$/.test(word)) many = `${word.slice(0, -1)}ies`;
  else many = `${word}s`;
  return phrase.slice(0, cut) + many;
}

/** The last vocabulary read and what was made of it. A library changes rarely; a request comes often. */
let kept: { key: string; lexicon: Lexicon } | null = null;

function lexiconFor(vocab: Vocab): Lexicon {
  const key = JSON.stringify(vocab);
  if (kept?.key === key) return kept.lexicon;

  // Pieces whose titles differ only by a last letter or number are a group: Actor A, Actor B.
  const heads = new Map<string, { label: string; id: string }[]>();
  for (const entry of vocab) {
    const parts = /^(.+) ([a-z]|\d+)$/.exec(plain(entry.title));
    if (parts == null) continue;
    const members = heads.get(parts[1]) ?? [];
    members.push({ label: entry.label, id: parts[2] });
    heads.set(parts[1], members);
  }
  const groups = new Map<string, string[]>();
  const memberOf = new Map<string, string>();
  for (const [head, members] of heads) {
    if (members.length < 2) continue;
    groups.set(head, members.map((member) => member.label));
    for (const member of members) memberOf.set(member.label, head);
  }
  const shelves = new Map<string, string[]>();
  for (const entry of vocab) {
    const shelf = plain(entry.shelf);
    shelves.set(shelf, [...(shelves.get(shelf) ?? []), entry.label]);
  }

  // Names are claimed first come, first kept. Every name as written goes in
  // before any plural worked out from it, so "flames", listed above as a word
  // for fire, stays one fire and does not become two flames.
  const single: [string, Name][] = [];
  const plural: [string, Name][] = [];
  const piece = (phrase: string, label: string): void => {
    const member = memberOf.has(label);
    const describing = DESCRIBING.has(phrase);
    single.push([phrase, { kind: 'piece', label, plural: false, member, describing }]);
    if (!member && !describing) plural.push([pluralOf(phrase), { kind: 'piece', label, plural: true, member, describing }]);
  };
  const group = (phrase: string, head: string, every = false): void => {
    single.push([phrase, { kind: 'group', group: head, plural: false, every }]);
    if (!every) plural.push([pluralOf(phrase), { kind: 'group', group: head, plural: true, every }]);
  };
  const missing = (phrase: string, word = phrase): void => {
    single.push([phrase, { kind: 'missing', word }]);
    if (!DESCRIBING.has(phrase)) plural.push([pluralOf(phrase), { kind: 'missing', word: pluralOf(word) }]);
  };

  const byName = new Map<string, string>();
  for (const entry of vocab) {
    const head = memberOf.get(entry.label);
    if (head != null) {
      const id = plain(entry.title).slice(head.length + 1);
      for (const spoken of SPOKEN_ID[id] ?? [id]) piece(`${head} ${spoken}`, entry.label);
      piece(plain(entry.label), entry.label);
    } else {
      for (const name of [entry.label, entry.title]) {
        piece(plain(name), entry.label);
        byName.set(plain(name), entry.label);
      }
    }
    for (const alias of entry.aliases ?? []) piece(plain(alias), entry.label);
  }
  for (const head of groups.keys()) group(head, head);

  const absent: [string, string[]][] = [];
  for (const [name, others] of SYNONYMS) {
    if (groups.has(name)) {
      for (const other of others) group(other, name);
      for (const word of EVERY_MEMBER[name] ?? []) group(word, name, true);
    } else if (byName.has(name)) {
      for (const other of others) piece(other, byName.get(name) as string);
    } else {
      absent.push([name, others]);
    }
  }
  for (const [shelf] of shelves) {
    if (shelf === '' || PLAIN.has(shelf)) continue;
    single.push([shelf, { kind: 'shelf', shelf }]);
    single.push([shelf.replace(/s$/, ''), { kind: 'shelf', shelf }]);
  }
  // Whatever the tables know and this vocabulary lacks is still heard, as a
  // thing there is none of. It is reported the way it was said, except where
  // what was said is not a name at all: "burning" is fire, "iraq" is a rock.
  for (const [name, others] of absent) {
    missing(name);
    for (const other of others) missing(other, DESCRIBING.has(other) || MISHEARD_NAMES.has(other) ? name : other);
  }
  for (const thing of OTHER_THINGS) missing(thing);

  const names = new Map<string, Name>();
  let longest = 1;
  for (const [phrase, name] of [...single, ...plural]) {
    // One letter is never a name by itself: the label "A" would swallow every "a".
    if (phrase.length < 2 || names.has(phrase)) continue;
    names.set(phrase, name);
    longest = Math.max(longest, phrase.split(' ').length);
  }
  const lexicon = { names, longest, groups, shelves };
  kept = { key, lexicon };
  return lexicon;
}

/** The longest name that starts at this word. */
function nameAt(lexicon: Lexicon, words: string[], at: number): Match | null {
  for (let length = Math.min(lexicon.longest, words.length - at); length > 0; length--) {
    const name = lexicon.names.get(words.slice(at, at + length).join(' '));
    if (name) return { name, length };
  }
  return null;
}

const phraseAt = (words: string[], at: number, phrases: string[]): number => {
  for (const phrase of phrases) {
    const parts = phrase.split(' ');
    if (parts.every((part, offset) => words[at + offset] === part)) return parts.length;
  }
  return 0;
};

const isCount = (word: string): boolean => word in COUNTS || /^\d+$/.test(word);
const describes = (word: string): boolean => word in COLOURS || word in SIZES || PASS_THROUGH.has(word);
const leadsNoun = (word: string | undefined): boolean =>
  word != null && (isCount(word) || word in COLOURS || word in SIZES || DETERMINERS.has(word));

/** Whether a thing could be named from this word on: what follows "pick up" when it is a verb. */
const startsThing = (word: string | undefined): boolean =>
  word != null && (leadsNoun(word) || word === 'it' || word === 'them' || word === 'everything');

/** A word no table here knows: a candidate for "something I do not have". */
const isStranger = (word: string): boolean =>
  /^[a-z]{3,}$/.test(word) &&
  !PLAIN.has(word) &&
  !isCount(word) &&
  !describes(word) &&
  !(word in MISHEARD_COUNTS) &&
  !DETERMINERS.has(word) &&
  !ADD_WORDS.has(word) &&
  !REMOVE_WORDS.has(word) &&
  !NEXT_ONLY.has(word) &&
  !HANDLE_WORDS.has(word);

/** Puts right the few mis-hearings that are not a matter of one name for another. */
function mend(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const before = out[out.length - 1];
    if (word === 'creates') out.push('crates');
    else if ((word === 'seen' || word === 'seem') && (before === 'new' || before === 'a' || before === 'me' || before === 'the' || before === 'another' || before === 'fresh')) out.push('scene');
    else if (word === 'pick' && (words[i + 1] === 'up' || words[i + 1] === 'ups') && (leadsNoun(before) || !startsThing(words[i + 2]))) {
      // "a pick up" and "a truck and pick up" are the vehicle; "pick up the car" is not.
      out.push(words[i + 1] === 'up' ? 'pickup' : 'pickups');
      i++;
    } else out.push(word);
  }
  return out;
}

/** How many words from here ask for an empty set, or 0. */
function freshAt(words: string[], at: number, removing: boolean): number {
  const fixed = phraseAt(words, at, FRESH_PHRASES);
  if (fixed > 0) return fixed;
  const word = words[at];
  if (SCENE_VERBS.has(word)) {
    for (let j = at + 1; j < words.length && j <= at + 4; j++) {
      if (words[j] === 'scene') return j - at + 1;
      if (!SCENE_FILL.has(words[j])) break;
    }
  }
  if (EMPTYING.has(word)) {
    let j = at + 1;
    while (j < words.length && EMPTYING_FILL.has(words[j])) j++;
    if (WHOLE_SET.has(words[j])) return j - at + 1;
    if (words[at + 1] === 'all' && at + 2 === words.length) return 2;
  }
  if (removing && word === 'everything') return 1;
  return 0;
}

export function parseRequest(text: string, vocab: Vocab): Request {
  const request: Request = { clear: false, items: [], remove: [], unknown: [] };
  const words = mend(plain(text).split(' ').filter(Boolean));
  if (words.length === 0) return request;
  const lexicon = lexiconFor(vocab);

  let mode: 'add' | 'remove' | 'handle' = 'add';
  /** Set by "no" and "without": the next thing named is taken away, whatever the mode. */
  let nextGoes = false;
  let count: number | null = null;
  let colour: string | undefined;
  let size: Size | undefined;
  /** Whether a thing is expected next, as after "a", "two", "red" or "add". */
  let expecting = false;
  /** Pieces brought along by a describing word, waiting for the thing described. */
  const along: string[] = [];
  const handedOut = new Set<string>();

  const forget = (): void => {
    count = null;
    colour = undefined;
    size = undefined;
    expecting = false;
  };
  const give = (label: string, howMany: number, once: boolean): void => {
    if (nextGoes || mode === 'remove') {
      if (!request.remove.includes(label)) request.remove.push(label);
      return;
    }
    if (mode !== 'add') return;
    const same = request.items.find((item) => item.label === label && item.colour === colour && item.size === size);
    if (same) {
      same.count = once ? 1 : Math.min(MOST, same.count + howMany);
      return;
    }
    const item: Request['items'][number] = { label, count: once ? 1 : Math.min(MOST, howMany) };
    if (colour) item.colour = colour;
    if (size) item.size = size;
    request.items.push(item);
  };
  /** The thing a phrase was building up to has been named, or the phrase has run out. */
  const close = (): void => {
    forget();
    for (const label of along) give(label, 1, false);
    along.length = 0;
    nextGoes = false;
  };
  const noSuch = (word: string): void => {
    if (mode !== 'handle' && !request.unknown.includes(word)) request.unknown.push(word);
    along.length = 0;
    close();
  };
  /** Whether a thing is named after the describing words that start here. */
  const thingAhead = (at: number, pluralOnly: boolean): boolean => {
    let j = at;
    while (j < words.length && describes(words[j])) j++;
    const found = nameAt(lexicon, words, j);
    if (found == null) return false;
    if (found.name.kind === 'piece') return pluralOnly ? found.name.plural : !found.name.describing;
    if (found.name.kind === 'group') return pluralOnly ? found.name.plural : true;
    return !pluralOnly && found.name.kind === 'missing';
  };

  let i = 0;
  while (i < words.length) {
    const word = words[i];

    const fresh = freshAt(words, i, mode === 'remove');
    if (fresh > 0) {
      close();
      request.clear = true;
      mode = 'add';
      i += fresh;
      continue;
    }

    const removing = phraseAt(words, i, REMOVE_PHRASES);
    if (removing > 0 || REMOVE_WORDS.has(word)) {
      close();
      mode = 'remove';
      expecting = REMOVE_DIRECT.has(word);
      i += removing || 1;
      continue;
    }
    if (NEXT_ONLY.has(word)) {
      close();
      nextGoes = true;
      expecting = word === 'without';
      i++;
      continue;
    }
    if (word === 'make') {
      close();
      const object = words[i + 1] === 'me' || words[i + 1] === 'us' ? words[i + 2] : words[i + 1];
      mode = object === 'the' || object === 'that' || object === 'this' || object === 'it' || object === 'them' || object === 'those' || object === 'these' ? 'handle' : 'add';
      expecting = mode === 'add';
      i++;
      continue;
    }
    if (ADD_WORDS.has(word)) {
      close();
      mode = 'add';
      expecting = ADD_DIRECT.has(word);
      i++;
      continue;
    }
    if (HANDLE_WORDS.has(word)) {
      close();
      mode = 'handle';
      i++;
      continue;
    }
    // "replace the car with a truck": what follows "with" is wanted, not taken away.
    if (word === 'with') {
      close();
      if (mode === 'remove') mode = 'add';
      i++;
      continue;
    }

    const found = nameAt(lexicon, words, i);
    if (found != null) {
      const name = found.name;
      i += found.length;
      if (name.kind === 'piece') {
        if (name.describing && thingAhead(i, false)) {
          along.push(name.label);
          continue;
        }
        if (name.member) handedOut.add(name.label);
        give(name.label, count ?? (name.plural ? 2 : 1), name.member);
        close();
      } else if (name.kind === 'group') {
        const members = lexicon.groups.get(name.group) ?? [];
        if (nextGoes || mode === 'remove') {
          const all = name.every || (name.plural && count == null);
          for (const label of all ? members : members.slice(0, count ?? 1)) give(label, 1, true);
        } else if (mode === 'add') {
          let wanted = name.every ? members.length : count ?? (name.plural ? 2 : 1);
          for (const label of members) {
            if (wanted === 0) break;
            if (handedOut.has(label)) continue;
            handedOut.add(label);
            give(label, 1, true);
            wanted--;
          }
        }
        close();
      } else if (name.kind === 'shelf') {
        if (nextGoes || mode === 'remove') for (const label of lexicon.shelves.get(name.shelf) ?? []) give(label, 1, true);
        close();
      } else {
        noSuch(name.word);
      }
      continue;
    }

    if (/^\d+$/.test(word)) {
      const digits = Number(word);
      if (digits > 0) count = Math.min(MOST, digits);
      expecting = true;
    } else if (word in COUNTS) {
      count = COUNTS[word];
      expecting = true;
    } else if (word in MISHEARD_COUNTS && count == null && thingAhead(i + 1, true)) {
      count = MISHEARD_COUNTS[word];
      expecting = true;
    } else if (word in COLOURS) {
      colour = COLOURS[word];
      expecting = true;
    } else if (word in SIZES) {
      size = SIZES[word];
      expecting = true;
    } else if (DETERMINERS.has(word)) {
      expecting = true;
    } else if (PASS_THROUGH.has(word)) {
      // Says nothing about which piece. The phrase carries on.
    } else if (expecting && mode !== 'handle' && isStranger(word)) {
      // A word no table knows, where a thing was expected. If a known thing
      // follows it was only describing that ("a rusty car"); otherwise it is
      // the thing, and there is none of it.
      const run = [word];
      let j = i + 1;
      while (j < words.length && run.length < 3 && isStranger(words[j]) && nameAt(lexicon, words, j) == null) run.push(words[j++]);
      const next = j < words.length ? nameAt(lexicon, words, j) : null;
      if (next != null && next.name.kind !== 'shelf') {
        i = j;
        continue;
      }
      noSuch(run.join(' '));
      i = j;
      continue;
    } else {
      close();
    }
    i++;
  }
  close();
  return request;
}

/**
 * Every word and phrase parseRequest can make use of with this vocabulary, for
 * a recogniser that listens for a fixed list. It includes the things the
 * library lacks, so they are heard and can be answered.
 */
export function speechWords(vocab: Vocab): string[] {
  const lexicon = lexiconFor(vocab);
  const words = new Set<string>();
  const take = (phrases: Iterable<string>): void => {
    for (const phrase of phrases) {
      if (!/^[a-z]+( [a-z]+)*$/.test(phrase)) continue;
      if (phrase.split(' ').some((word) => MISHEARD_NAMES.has(word) || MISHEARD_NAMES.has(word.replace(/s$/, '')))) continue;
      words.add(phrase);
    }
  };
  // A recogniser pushed to choose from a list puts a short listed word where a
  // small one like "a" was said ("bear helicopter"). Short names of things the
  // library lacks are not worth that, so they are left out and come back as "[unk]".
  for (const [phrase, name] of lexicon.names) {
    if (name.kind !== 'missing' || phrase.length >= 5) take([phrase]);
  }
  take(Object.keys(COUNTS));
  take(Object.keys(COLOURS));
  take(Object.keys(SIZES));
  take(DETERMINERS);
  take(PASS_THROUGH);
  take(ADD_WORDS);
  take(REMOVE_WORDS);
  take(REMOVE_PHRASES);
  take(NEXT_ONLY);
  take(HANDLE_WORDS);
  take(FRESH_PHRASES);
  // The small words a request is strung together with, so they are not forced into a name.
  take(['make me a scene with', 'and', 'with', 'then', 'also', 'please', 'on', 'in', 'it', 'to', 'i', 'me']);
  take(['scene', 'set', 'table', 'stage', 'everything', 'make', 'okay', 'there', 'here']);
  return [...words];
}
