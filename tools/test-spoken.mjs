/**
 * Checks the reader of spoken controls (src/spoken-commands.ts) against sentences, with the
 * names found by the scene reader in the real asset library. A sentence is either one of the
 * panel's controls or it is left alone for the scene reader, and the second kind matters as
 * much as the first: "two actors and a red car" must still build a set, and "put a dragon in
 * front of the camera" must still add a dragon. The lines marked "heard" are what the Vosk
 * model wrote when a synthetic voice read the sentence; the ones marked "review" are sentences
 * a reviewer found the first version stealing from the scene reader.
 *
 *   npm run test:spoken
 */
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import ts from 'typescript';

// The sources are TypeScript with no imports, so they can be loaded with the compiler the repo already has.
async function load(path) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
}

const { commandIn, commandWords, partsIn } = await load('src/spoken-commands.ts');
const { namesIn, parseRequest, speechWords, wordsOf } = await load('src/scene-words.ts');
const { SHELF_ASSETS } = await load('src/catalog.ts');

const VOCAB = SHELF_ASSETS.map((asset) => ({ label: asset.label, title: asset.title ?? asset.label, shelf: asset.shelf, aliases: asset.aliases }));
const control = (words) => commandIn(words, namesIn(words, VOCAB));
const read = (text) => control(wordsOf(text));
const ACTORS = ['A', 'B', 'C', 'D'];
const paint = (labels, colour, all = false) => ({ do: 'paint', labels, all, colour });
const size = (labels, asked, all = false) => ({ do: 'size', labels, all, size: asked });

/** [sentence, the control it is, or null when it is the scene reader's]. */
const CASES = [
  ['snap', { do: 'snap' }],
  ['snap it', { do: 'snap' }],
  ['okay snap the frame', { do: 'snap' }],
  ['take the picture', { do: 'snap' }],
  ['take the dragon away', null],
  ['snap the dragon', null],
  ['record', { do: 'record' }],
  ['start recording', { do: 'record' }],
  ['action', { do: 'record' }],
  ['stop', { do: 'stop' }],
  ['cut', { do: 'stop' }],
  ['stop the rain', null],
  ['play it back', { do: 'play' }],
  ['play back', { do: 'play' }], // heard
  ['play', { do: 'play' }],
  ['camera b', { do: 'cut', camera: 1 }],
  ['camera bee', { do: 'cut', camera: 1 }], // heard
  ['cut to b', { do: 'cut', camera: 1 }],
  ['camera a', { do: 'cut', camera: 0 }],
  ['cut to camera a', { do: 'cut', camera: 0 }],
  ['the other camera', { do: 'cut', camera: 1 }],
  ['tripod', { do: 'rig', rig: 'tripod' }],
  ['put the camera on the drone', { do: 'rig', rig: 'drone' }],
  ['put it back on the tripod', { do: 'rig', rig: 'tripod' }],
  ['drone', { do: 'rig', rig: 'drone' }],
  ['eighty five', { do: 'lens', mm: 85 }],
  ['lens eighty five', { do: 'lens', mm: 85 }],
  ['go to the fifty', { do: 'lens', mm: 50 }],
  ['thirty five millimetre lens', { do: 'lens', mm: 35 }],
  ['one hundred and thirty five', { do: 'lens', mm: 135 }],
  ['a hundred and thirty five', { do: 'lens', mm: 135 }],
  ['one thirty five', { do: 'lens', mm: 135 }],
  ['lens eighteen', { do: 'lens', mm: 18 }],
  ['twenty four mil', { do: 'lens', mm: 24 }],
  ['wider', { do: 'lensStep', step: -1 }],
  ['go tighter', { do: 'lensStep', step: 1 }],
  ['two actors and a red car', null],
  ['fifty cars', null],
  ['paint the car red', paint(['Car'], 'red')],
  ['paint car red', paint(['Car'], 'red')], // heard
  ['paint the cars red', paint(['Car'], 'red', true)],
  ['paint it blue', paint(null, 'blue')],
  ['make the truck blue', paint(['Truck'], 'blue')],
  ['turn it green', paint(null, 'green')],
  ['make me a blue truck', null],
  ['a red car', null],
  ['make a car red', null],
  ['colour the dragon purple', paint(['Dragon'], 'purple')],
  ['make the car plain', paint(['Car'], 'bare wood')],
  ['make an actor and a red car', null], // review
  ['make a big dragon and a red car', null], // review
  ['bigger', size(null, 'bigger')],
  ['make it bigger', size(null, 'bigger')],
  ['make bigger', size(null, 'bigger')], // heard
  ['a bit bigger', size(null, 'bigger')],
  ['make the dragon bigger', size(['Dragon'], 'bigger')],
  ['make everyone bigger', size(ACTORS, 'bigger', true)],
  ['shrink the horse', size(['Horse'], 'smaller')],
  ['smaller', size(null, 'smaller')],
  ['make it giant', size(null, 'giant')],
  ['make the dragon giant', size(['Dragon'], 'giant')],
  ['make a giant dragon', null],
  ['a giant dragon and a small car', null],
  ['normal size', size(null, 'normal')],
  ['add a bigger dragon', null], // review
  ['a bigger dragon', null],
  ['two smaller cars and an actor', null], // review
  ['put a bigger tree behind the house', null], // review
  ['make a dragon and a giant car', null], // review
  ['camera on the dragon', { do: 'aim', labels: ['Dragon'] }],
  ['camera on dragon', { do: 'aim', labels: ['Dragon'] }], // heard
  ['camera on actor a', { do: 'aim', labels: ['A'] }],
  ['camera on the actors', { do: 'aim', labels: ACTORS }],
  ['point the camera at the red car', { do: 'aim', labels: ['Car'] }],
  ['put the camera on the dragon', { do: 'aim', labels: ['Dragon'] }],
  ['frame actor b', { do: 'aim', labels: ['B'] }],
  ['focus on the horse', { do: 'aim', labels: ['Horse'] }],
  ['put a dragon in front of the camera', null], // review
  ['an actor looking at the camera', null], // review
  ['two cars and a camera on the dragon', null], // review: the whole sentence is not one control; taken apart below
  ['put the camera behind the car pointing at the dragon', null], // review
  ['closer', { do: 'step', step: 'closer' }],
  ['camera closer', { do: 'step', step: 'closer' }],
  ['bring the camera a little closer', { do: 'step', step: 'closer' }],
  ['push in', { do: 'step', step: 'closer' }],
  ['back', { do: 'step', step: 'back' }],
  ['pull back', { do: 'step', step: 'back' }],
  ['move the camera back', { do: 'step', step: 'back' }],
  ['higher', { do: 'step', step: 'higher' }],
  ['camera higher', { do: 'step', step: 'higher' }],
  ['camera up', { do: 'step', step: 'higher' }],
  ['move the camera up', { do: 'step', step: 'higher' }], // review
  ['raise the camera', { do: 'step', step: 'higher' }],
  ['lower', { do: 'step', step: 'lower' }],
  ['lower the camera', { do: 'step', step: 'lower' }],
  ['camera down', { do: 'step', step: 'lower' }],
  ['bring the camera in', { do: 'step', step: 'closer' }], // review
  ['bring it back', null], // review: "it" is a piece, not the camera
  ['put it back', null], // review
  ['bring it closer', null], // review
  ['move it back', { do: 'byHand' }],
  ['up', null],
  ['remove it', { do: 'remove' }],
  ['get rid of it', { do: 'remove' }],
  ['take it away', { do: 'remove' }],
  ['remove the dragon', null],
  ['move the car to the left', { do: 'byHand' }],
  ['turn the truck around', { do: 'byHand' }],
  ['turn off the fire', null],
  ['turn on the rain', null], // review
  ['push the car', { do: 'byHand' }],
  ['new scene with two actors and a dragon', null],
  ['a mexican standoff after a car chase', null],
  ['add a crate', null],
  ['everyone aims at each other', null],
  ['', null],
];

let failed = 0;
let run = 0;
const check = (name, ok, detail = '') => {
  run++;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `  ${detail}`}`);
};

for (const [text, want] of CASES) {
  const got = read(text);
  check(`"${text}" is ${want == null ? 'left to the scene reader' : want.do}`, isDeepStrictEqual(got, want), `got ${JSON.stringify(got)}`);
}

/** A sentence taken apart: [sentence, [each part as a control's name, or the words left for the scene reader]]. */
const PARTS = [
  ['paint it red and snap', ['paint', 'snap']], // review
  ['make it bigger and add a tree', ['size', 'add a tree']], // review
  ['make the car red and add a tree', ['paint', 'add a tree']], // review
  ['add a car and take the shot', ['add a car', 'snap']], // review
  ['two cars and a camera on the dragon', ['two cars', 'aim']], // review
  ['go to one hundred and thirty five and snap', ['lens', 'snap']],
  ['camera on the dragon then eighty five then snap', ['aim', 'lens', 'snap']],
  ['two actors and a red car', ['two actors and a red car']],
  ['a dragon and two actors and a burning car', ['a dragon and two actors and a burning car']],
  ['a car and a van and snap and a tree and a rock', ['a car and a van', 'snap', 'a tree and a rock']],
  ['snap', ['snap']],
];
for (const [text, want] of PARTS) {
  const got = partsIn(wordsOf(text), control).map((part) => part.command?.do ?? part.words.join(' '));
  check(`"${text}" comes apart as ${want.join(' | ')}`, isDeepStrictEqual(got, want), `got ${got.join(' | ')}`);
}
const lens = partsIn(wordsOf('go to one hundred and thirty five and snap'), control)[0];
check('"one hundred and thirty five" stays one lens when the sentence is taken apart', lens.command?.mm === 135, JSON.stringify(lens));

// What is left to the scene reader is still read by it as before: the sizing words it now steps over add nothing.
const request = parseRequest('add a bigger dragon', VOCAB);
check('the scene reader steps over "bigger" and adds the dragon', request.items.length === 1 && request.items[0].label === 'Dragon' && request.unknown.length === 0, JSON.stringify(request));

// The recogniser is told the control words, and no letter said alone.
const words = commandWords();
check('the word list has the controls', ['snap', 'eighty', 'closer', 'tripod', 'bigger', 'record', 'camera b'].every((word) => words.includes(word)));
check('no single letter is listened for', words.every((word) => word.length > 1));
check('every listed entry is plain lower-case words', words.every((word) => /^[a-z]+( [a-z]+)*$/.test(word)));
check('the scene words are still all there', speechWords(VOCAB).length > 500);

console.log(failed === 0 ? `\nAll ${run} checks passed.` : `\n${failed} of ${run} failed.`);
process.exit(failed === 0 ? 0 : 1);
