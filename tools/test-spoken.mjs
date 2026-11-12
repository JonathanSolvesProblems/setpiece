/**
 * Checks the reader of spoken controls (src/spoken-commands.ts) against sentences, with the
 * names found by the scene reader in the real asset library. A sentence is either one of the
 * panel's controls or it is left alone for the scene reader; the second kind matters as much
 * as the first, since "two actors and a red car" must still build a set. The lines marked
 * "heard" are what the Vosk model wrote when a synthetic voice read the sentence.
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

const { commandIn, commandWords } = await load('src/spoken-commands.ts');
const { namesIn, parseRequest, speechWords } = await load('src/scene-words.ts');
const { SHELF_ASSETS } = await load('src/catalog.ts');

const VOCAB = SHELF_ASSETS.map((asset) => ({ label: asset.label, title: asset.title ?? asset.label, shelf: asset.shelf, aliases: asset.aliases }));
const read = (text) => commandIn(text, namesIn(text, VOCAB));
const ACTORS = ['A', 'B', 'C', 'D'];

/** [sentence, the control it is, or null when it is the scene reader's]. */
const CASES = [
  ['snap', { do: 'snap' }],
  ['snap it', { do: 'snap' }],
  ['okay snap the frame', { do: 'snap' }],
  ['take the picture', { do: 'snap' }],
  ['take the dragon away', null],
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
  ['paint the car red', { do: 'paint', labels: ['Car'], colour: 'red' }],
  ['paint car red', { do: 'paint', labels: ['Car'], colour: 'red' }], // heard
  ['paint it blue', { do: 'paint', labels: null, colour: 'blue' }],
  ['make the truck blue', { do: 'paint', labels: ['Truck'], colour: 'blue' }],
  ['turn it green', { do: 'paint', labels: null, colour: 'green' }],
  ['make me a blue truck', null],
  ['a red car', null],
  ['colour the dragon purple', { do: 'paint', labels: ['Dragon'], colour: 'purple' }],
  ['make the car plain', { do: 'paint', labels: ['Car'], colour: 'bare wood' }],
  ['bigger', { do: 'size', labels: null, size: 'bigger' }],
  ['make it bigger', { do: 'size', labels: null, size: 'bigger' }],
  ['make bigger', { do: 'size', labels: null, size: 'bigger' }], // heard
  ['make the dragon bigger', { do: 'size', labels: ['Dragon'], size: 'bigger' }],
  ['shrink the horse', { do: 'size', labels: ['Horse'], size: 'smaller' }],
  ['smaller', { do: 'size', labels: null, size: 'smaller' }],
  ['make it giant', { do: 'size', labels: null, size: 'giant' }],
  ['make the dragon giant', { do: 'size', labels: ['Dragon'], size: 'giant' }],
  ['make a giant dragon', null],
  ['a giant dragon and a small car', null],
  ['normal size', { do: 'size', labels: null, size: 'normal' }],
  ['camera on the dragon', { do: 'aim', labels: ['Dragon'] }],
  ['camera on dragon', { do: 'aim', labels: ['Dragon'] }], // heard
  ['camera on actor a', { do: 'aim', labels: ['A'] }],
  ['camera on the actors', { do: 'aim', labels: ACTORS }],
  ['point the camera at the red car', { do: 'aim', labels: ['Car'] }],
  ['frame actor b', { do: 'aim', labels: ['B'] }],
  ['focus on the horse', { do: 'aim', labels: ['Horse'] }],
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
  ['raise the camera', { do: 'step', step: 'higher' }],
  ['lower', { do: 'step', step: 'lower' }],
  ['lower the camera', { do: 'step', step: 'lower' }],
  ['camera down', { do: 'step', step: 'lower' }],
  ['remove it', { do: 'remove' }],
  ['get rid of it', { do: 'remove' }],
  ['take it away', { do: 'remove' }],
  ['remove the dragon', null],
  ['move the car to the left', { do: 'byHand' }],
  ['turn the truck around', { do: 'byHand' }],
  ['turn off the fire', null],
  ['push the car', { do: 'byHand' }],
  ['new scene with two actors and a dragon', null],
  ['a mexican standoff after a car chase', null],
  ['add a crate', null],
  ['everyone aims at each other', null],
  ['', null],
];

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok || detail === '' ? '' : `  ${detail}`}`);
};

for (const [text, want] of CASES) {
  const got = read(text);
  check(`"${text}" is ${want == null ? 'left to the scene reader' : want.do}`, isDeepStrictEqual(got, want), `got ${JSON.stringify(got)}`);
}

// What is left to the scene reader is still read by it as before: the sizing words it now steps over add nothing.
const request = parseRequest('a bigger dragon', VOCAB);
check('the scene reader steps over "bigger"', request.items.length === 1 && request.items[0].label === 'Dragon' && request.unknown.length === 0, JSON.stringify(request));

// The recogniser is told the control words, and no letter said alone.
const words = commandWords();
check('the word list has the controls', ['snap', 'eighty', 'closer', 'tripod', 'bigger', 'record', 'camera b'].every((word) => words.includes(word)));
check('no single letter is listened for', words.every((word) => word.length > 1));
check('every listed entry is plain lower-case words', words.every((word) => /^[a-z]+( [a-z]+)*$/.test(word)));
check('the scene words are still all there', speechWords(VOCAB).length > 500);

console.log(failed === 0 ? `\nAll ${CASES.length + 5} checks passed.` : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
