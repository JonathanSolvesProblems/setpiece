/**
 * Checks parseRequest against transcripts, with the real asset library and
 * with the pieces that are about to join it. The lines marked "heard" are what
 * the Vosk model actually wrote when a synthetic voice read the request.
 *
 *   npm run test:words
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

const { parseRequest, speechWords } = await load('src/scene-words.ts');
const { SHELF_ASSETS } = await load('src/catalog.ts');

// The library as it ships, with the other words the catalog gives each piece.
const REAL = SHELF_ASSETS.map((asset) => ({
  label: asset.label,
  title: asset.title ?? asset.label,
  shelf: asset.shelf,
  aliases: asset.aliases,
}));
// A small fixed library, so the cases about things that are not there stay true as the real one grows.
const NOW = [
  ['A', 'Actor A', 'Cast'], ['B', 'Actor B', 'Cast'], ['C', 'Actor C', 'Cast'], ['D', 'Actor D', 'Cast'], ['Creature', 'Creature', 'Cast'],
  ['Car', 'Car', 'Vehicles'], ['Van', 'Van', 'Vehicles'], ['Motorbike', 'Motorbike', 'Vehicles'],
  ['Fire', 'Fire', 'Effects'], ['Smoke', 'Smoke', 'Effects'], ['Water', 'Water', 'Effects'], ['Explosion', 'Explosion', 'Effects'], ['Rain', 'Rain', 'Effects'], ['Sparks', 'Sparks', 'Effects'],
  ['Wall', 'Wall', 'Set'], ['Lamp post', 'Lamp post', 'Set'], ['Tree', 'Tree', 'Set'], ['Crate', 'Crate', 'Set'],
].map(([label, title, shelf]) => ({ label, title, shelf }));
const COMING = {
  Cast: ['Dragon', 'Troll', 'Dinosaur', 'Robot', 'Alien', 'Ghost', 'Spider', 'Kraken', 'Horse', 'Wolf'],
  Vehicles: ['Truck', 'Pickup', 'Bus', 'Helicopter', 'Boat', 'Saucer', 'Bicycle', 'Tank'],
  Set: ['Barrier', 'House', 'Bench', 'Cone', 'Dumpster', 'Rock', 'Fence', 'Stairs', 'Door', 'Pillar'],
};
const SOON = [
  ...NOW,
  ...Object.entries(COMING).flatMap(([shelf, labels]) => labels.map((label) => ({ label, title: label, shelf }))),
];
const OWN = [{ label: 'Hero', title: 'Hero', shelf: 'Cast', aliases: ['protagonist', 'lead'] }];

const one = (label, more = {}) => ({ label, count: 1, ...more });
const many = (label, count, more = {}) => ({ label, count, ...more });
const EFFECTS = ['Fire', 'Smoke', 'Water', 'Explosion', 'Rain', 'Sparks'];

/** [what it shows, transcript, vocabulary, the parts of the request that are not empty] */
const CASES = [
  // Nothing said, nothing made.
  ['empty transcript', '', NOW, {}],
  ['only spaces and punctuation', '  ...  , ', NOW, {}],
  ['filler words', 'um uh the the', NOW, {}],
  ['small talk', 'hello how are you today', NOW, {}],
  ['words outside a fixed list', '[unk] [unk]', NOW, {}],
  ['a bare number', 'two', NOW, {}],
  ['take two', 'take two', NOW, {}],

  // The library as it ships.
  ['the real kit: the brief', 'make me a scene with a dragon two actors and a burning car', REAL,
    { clear: true, items: [one('Dragon'), one('A'), one('B'), one('Car'), one('Fire')] }],
  ['the real kit: colour and size', 'a red dragon and a giant robot', REAL,
    { items: [one('Dragon', { colour: 'red' }), one('Robot', { size: 'giant' })] }],
  ['the real kit: another word for a piece', 'add a spaceship', REAL, { items: [one('Saucer')] }],
  ['the real kit: a unicorn is the horse', 'a unicorn', REAL, { items: [one('Horse')] }],
  ['the real kit: something it has not got', 'a submarine and a tree', REAL, { items: [one('Tree')], unknown: ['submarine'] }],

  // Heard: what the recogniser wrote for the spoken test phrases.
  ['heard: the brief', 'make me a scene with a dragon two actors and a burning car', NOW,
    { clear: true, items: [one('A'), one('B'), one('Car'), one('Fire')], unknown: ['dragon'] }],
  ['heard: "add" as "at"', 'at a red truck and three trees', NOW, { items: [many('Tree', 3)], unknown: ['truck'] }],
  ['heard: remove then add', 'remove the car and add a couple of wolves', NOW, { remove: ['Car'], unknown: ['wolves'] }],
  ['heard: "scene" as "seen"', 'new seen with a giant robot a helicopter and rain', NOW,
    { clear: true, items: [one('Rain')], unknown: ['robot', 'helicopter'] }],
  ['heard: "and" as "in"', 'add a spaceship in a blue van', NOW, { items: [one('Van', { colour: 'blue' })], unknown: ['spaceship'] }],
  ['heard: creates, lamppost, for people', 'give me a few creates a lamppost and for people', NOW,
    { items: [many('Crate', 3), one('Lamp post'), one('A'), one('B'), one('C'), one('D')] }],
  ['heard: "four trees" as "for trees"', 'two actors three cars for trees and five crates', NOW,
    { items: [one('A'), one('B'), many('Car', 3), many('Tree', 4), many('Crate', 5)] }],
  ['heard: "two" as "to"', 'i want to dragons a flying saucer and an enormous spider', NOW,
    { unknown: ['dragons', 'flying saucer', 'spider'] }],
  ['heard: three ways to take away', 'take away the tree no rain and remove the motorbike', NOW,
    { remove: ['Tree', 'Rain', 'Motorbike'] }],
  ['heard: start over', 'start over with six wolves and a big green monster', NOW,
    { clear: true, items: [one('Creature', { colour: 'green', size: 'big' })], unknown: ['wolves'] }],
  ['heard: kraken as "crock and"', 'add an alien a ghost a spider and a crock and', SOON,
    { items: [one('Alien'), one('Ghost'), one('Spider'), one('Kraken')] }],
  ['heard: "a rock" as "iraq"', 'add a bench a cone a dumpster and iraq', SOON,
    { items: [one('Bench'), one('Cone'), one('Dumpster'), one('Rock')] }],
  ['heard: pickup as "pick up"', 'add a horse a wolf a truck and a pick up', SOON,
    { items: [one('Horse'), one('Wolf'), one('Truck'), one('Pickup')] }],
  ['heard: "pick up" with nothing in front', 'add horse a wolf a truck and pick up', SOON,
    { items: [one('Horse'), one('Wolf'), one('Truck'), one('Pickup')] }],
  ['heard with the word list: small words dropped', 'make me a scene with dragon two actors and burning car', SOON,
    { clear: true, items: [one('Dragon'), one('A'), one('B'), one('Car'), one('Fire')] }],
  ['heard with the word list: "and" as "in"', 'add red truck in three trees', SOON,
    { items: [one('Truck', { colour: 'red' }), many('Tree', 3)] }],
  ['heard with the word list: a word it could not place', 'add an alien a ghost a spider [unk]', SOON,
    { items: [one('Alien'), one('Ghost'), one('Spider')] }],
  ['heard with the word list: "a" as "i"', 'add alien a ghost i spider and a kraken', SOON,
    { items: [one('Alien'), one('Ghost'), one('Spider'), one('Kraken')] }],
  ['heard with the word list: lamppost as one word', 'give me a few crates a lamppost and four people', NOW,
    { items: [many('Crate', 3), one('Lamp post'), one('A'), one('B'), one('C'), one('D')] }],

  // The cast.
  ['"to actors" is two actors', 'to actors', NOW, { items: [one('A'), one('B')] }],
  ['one actor is the first', 'add an actor', NOW, { items: [one('A')] }],
  ['a man and a woman', 'a man and a woman', NOW, { items: [one('A'), one('B')] }],
  ['a named actor is not handed out twice', 'actor b and two people', NOW, { items: [one('B'), one('A'), one('C')] }],
  ['no more actors than there are', 'five people', NOW, { items: [one('A'), one('B'), one('C'), one('D')] }],
  ['everyone', 'bring everyone', NOW, { items: [one('A'), one('B'), one('C'), one('D')] }],
  ['a letter heard as a word', 'add actor see', NOW, { items: [one('C')] }],
  ['monster is the creature', 'a monster', NOW, { items: [one('Creature')] }],
  ['a sea monster is the kraken', 'a sea monster', SOON, { items: [one('Kraken')] }],

  // Starting again.
  ['new scene', 'new scene', NOW, { clear: true }],
  ['start over', 'okay start over', NOW, { clear: true }],
  ['clear the set', 'clear the set', NOW, { clear: true }],
  ['remove everything', 'remove everything', NOW, { clear: true }],
  ['clearing one thing is not clearing the set', 'clear the smoke', NOW, { remove: ['Smoke'] }],
  ['talk about the scene does not clear it', 'add a tree to the scene', NOW, { items: [one('Tree')] }],

  // Taking away.
  ['no rain', 'no rain', NOW, { remove: ['Rain'] }],
  ['"no" reaches one thing only', 'no rain and a van', NOW, { items: [one('Van')], remove: ['Rain'] }],
  ['remove carries over "and"', 'remove the car and the tree', NOW, { remove: ['Car', 'Tree'] }],
  ['all the actors', 'remove the actors', NOW, { remove: ['A', 'B', 'C', 'D'] }],
  ['one named actor', 'remove actor b', NOW, { remove: ['B'] }],
  ['a whole shelf', 'get rid of the effects', NOW, { remove: EFFECTS }],
  ['replace one with another', 'replace the car with a van', NOW, { items: [one('Van')], remove: ['Car'] }],
  ['put out the fire', 'put out the fire', NOW, { remove: ['Fire'] }],

  // Counts, colours, sizes.
  ['a bare plural is two', 'cars', NOW, { items: [many('Car', 2)] }],
  ['sparks is one piece', 'water and sparks', NOW, { items: [one('Water'), one('Sparks')] }],
  ['flames is one fire', 'flames', NOW, { items: [one('Fire')] }],
  ['numbers as digits', '2 actors and 3 crates', NOW, { items: [one('A'), one('B'), many('Crate', 3)] }],
  ['six is the most', 'ten trees', NOW, { items: [many('Tree', 6)] }],
  ['the same piece adds up', 'a car and another car', NOW, { items: [many('Car', 2)] }],
  ['a lamp post, then two more', 'a lamp post and two lamp posts', NOW, { items: [many('Lamp post', 3)] }],
  ['colours keep pieces apart', 'a red car and a blue car', NOW,
    { items: [one('Car', { colour: 'red' }), one('Car', { colour: 'blue' })] }],
  ['gray is grey', 'a gray wall and a grey crate', NOW,
    { items: [one('Wall', { colour: 'grey' }), one('Crate', { colour: 'grey' })] }],
  ['three sizes', 'a little fire a large explosion and an enormous tree', NOW,
    { items: [one('Fire', { size: 'small' }), one('Explosion', { size: 'big' }), one('Tree', { size: 'giant' })] }],
  ['size and colour together', 'a tiny pink van and a huge black car', NOW,
    { items: [one('Van', { colour: 'pink', size: 'small' }), one('Car', { colour: 'black', size: 'giant' })] }],
  ['a colour belongs to the next piece only', 'a red car and a tree', NOW, { items: [one('Car', { colour: 'red' }), one('Tree')] }],

  // A burning car is a car and a fire.
  ['burning car', 'burning car', NOW, { items: [one('Car'), one('Fire')] }],
  ['two burning cars, one fire', 'two burning cars', NOW, { items: [many('Car', 2), one('Fire')] }],
  ['a car on fire', 'a car on fire', NOW, { items: [one('Car'), one('Fire')] }],
  ['a smoking van', 'a smoking van', NOW, { items: [one('Van'), one('Smoke')] }],
  ['a fire truck is a truck, not a fire', 'a fire truck', SOON, { items: [one('Truck')] }],
  ['with no truck, a fire truck is not a fire either', 'a fire truck', NOW, { unknown: ['fire truck'] }],

  // Other words for the pieces.
  ['automobile and motorcycle', 'an automobile and a motorcycle', NOW, { items: [one('Car'), one('Motorbike')] }],
  ['a streetlight is the lamp post', 'a streetlight', NOW, { items: [one('Lamp post')] }],
  ['a box is the crate', 'put the box there', NOW, { items: [one('Crate')] }],
  ['a bike is the motorbike', 'a bike', NOW, { items: [one('Motorbike')] }],
  ['with a bicycle in the library, a bike is that', 'a bike', SOON, { items: [one('Bicycle')] }],
  ['lorry and pick up', 'a lorry and a pick up', SOON, { items: [one('Truck'), one('Pickup')] }],
  ['a pickup truck is the pickup', 'a pickup truck', SOON, { items: [one('Pickup')] }],
  ['a spaceship is the saucer', 'a spaceship', SOON, { items: [one('Saucer')] }],
  ['flying saucer and ufo', 'a flying saucer and a ufo', SOON, { items: [many('Saucer', 2)] }],
  ['t-rex', 'a t-rex', SOON, { items: [one('Dinosaur')] }],
  ['wolves and stairs', 'two wolves stairs and a door', SOON, { items: [many('Wolf', 2), one('Stairs'), one('Door')] }],
  ['the grown library, the brief', 'make me a scene with a dragon two actors and a burning car', SOON,
    { clear: true, items: [one('Dragon'), one('A'), one('B'), one('Car'), one('Fire')] }],
  ['a red truck and three trees', 'add a red truck and three trees', SOON,
    { items: [one('Truck', { colour: 'red' }), many('Tree', 3)] }],
  ['all the vehicles', 'remove the vehicles', SOON,
    { remove: ['Car', 'Van', 'Motorbike', ...COMING.Vehicles] }],
  ['an alias the caller gave', 'add the protagonist', OWN, { items: [one('Hero')] }],

  // Things there are none of.
  ['a thing no table knows', 'add a zeppelin', NOW, { unknown: ['zeppelin'] }],
  ['two words for one thing', 'add a grandfather clock', NOW, { unknown: ['grandfather clock'] }],
  ['a describing word is not a thing', 'add a rusty car', NOW, { items: [one('Car')] }],
  ['a lorry, with no truck', 'a lorry', NOW, { unknown: ['lorry'] }],
  ['a mis-heard name is reported by its real one', 'a dumpster and iraq', NOW, { unknown: ['dumpster', 'rock'] }],
  ['a burning thing there is none of adds no fire', 'a burning spaceship', NOW, { unknown: ['spaceship'] }],
  ['said twice, listed once', 'a dog and another dog', NOW, { unknown: ['dog'] }],

  // Talk about pieces already there adds nothing.
  ['move', 'move the car to the left', NOW, {}],
  ['make it red', 'make the car red', NOW, {}],
  ['make me one', 'make me a van', NOW, { items: [one('Van')] }],
  ['pick up is not a pickup', 'pick up the car', SOON, {}],
  ['on the table', 'put a car on the table', NOW, { items: [one('Car')] }],
];

let failed = 0;
for (const [name, text, vocab, parts] of CASES) {
  const expected = { clear: false, items: [], remove: [], unknown: [], ...parts };
  const actual = parseRequest(text, vocab);
  const ok = isDeepStrictEqual(actual, expected);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}: "${text}"`);
  if (!ok) {
    failed++;
    console.log(`     expected ${JSON.stringify(expected)}`);
    console.log(`     got      ${JSON.stringify(actual)}`);
  }
}

// Whatever comes in, an item is only ever a piece of the vocabulary that was named.
const labels = new Set(SOON.map((entry) => entry.label));
const noise = ['asdf qwer zxcv', 'the of and to in', 'la la la la', 'one two three four five six', 'red green blue', 'a an the some'];
for (const text of noise) {
  const { clear, items, remove } = parseRequest(text, SOON);
  const ok = !clear && items.length === 0 && remove.length === 0;
  console.log(`${ok ? 'ok  ' : 'FAIL'} noise makes nothing: "${text}"`);
  if (!ok) failed++;
}
for (const [, text, vocab] of CASES) {
  const known = new Set(vocab.map((entry) => entry.label));
  const { items, remove } = parseRequest(text, vocab);
  if (![...items.map((item) => item.label), ...remove].every((label) => known.has(label) && labels.size > 0)) {
    console.log(`FAIL a label outside the vocabulary came back for "${text}"`);
    failed++;
  }
}

// The list for a recogniser: the names it should hear, and none of the mis-hearings.
const list = speechWords(SOON);
const listed = (word) => list.includes(word);
const listChecks = [
  ['has the pieces', ['dragon', 'kraken', 'lamp post', 'actors', 'wolves'].every(listed)],
  ['has the numbers, colours and sizes', ['two', 'couple', 'grey', 'enormous'].every(listed)],
  ['has the things there are none of', listed('zombie') && speechWords(NOW).includes('spaceship')],
  ['leaves out the mis-hearings', !['iraq', 'crock', 'creates', 'seen'].some(listed)],
  ['leaves out short names of things there are none of', !listed('bear') && !speechWords(NOW).includes('tank') && listed('tank')],
  ['is plain lower-case words', list.every((entry) => /^[a-z]+( [a-z]+)*$/.test(entry))],
];
for (const [name, ok] of listChecks) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} word list ${name}`);
  if (!ok) failed++;
}

// Directing words: a blocking, not a list of pieces.
const { stagingFor, withoutStaging, asksToAim, stagingWords } = await load('src/scene-stagings.ts');
const SCENE_NAMES = [{ title: 'Dragon attack', lens: 24, camera: [0, 0, 0], pieces: [{ label: 'Dragon', x: 0, z: 0 }] }];
const stagedLabels = (text) => stagingFor(text, SCENE_NAMES)?.pieces.map((piece) => piece.label).join(',') ?? null;
const STANDOFF = 'i want like a mexican standoff where there was just a car chase and now they are pointing weapons at each other';
const stagings = [
  ['the sentence from the headset', stagedLabels(STANDOFF) === 'A,C,B,Car,Car 2,Smoke'],
  ['every figure in a standoff aims', stagingFor(STANDOFF, []).pieces.slice(0, 3).every((piece) => piece.pose === 4)],
  ['heard as two words', stagedLabels('a mexican stand off') === 'A,C,B'],
  ['a shootout in an alley', stagedLabels('a shootout in an alley') === 'A,B,Lamp post,Dumpster'],
  ['aiming at each other is a shootout', stagedLabels('they are aiming at each other') === 'A,B'],
  ['a library scene by name', stagedLabels('dragon attack') === 'Dragon'],
  ['a list of pieces is not a beat', stagedLabels('a dragon and two actors') === null],
  ['nothing said, nothing staged', stagedLabels('') === null],
  ['a chase on its own is not a standoff', stagedLabels('a car chase') === null],
  ['what else was named survives', parseRequest(withoutStaging('a hold up with a van'), NOW).items.some((item) => item.label === 'Van')],
  ['the words themselves are not missing pieces', parseRequest(withoutStaging(STANDOFF), NOW).unknown.length === 0],
  ['weapons alone ask for aim', asksToAim('give them guns') && !asksToAim('give them a dragon')],
  ['the list is plain lower-case words', stagingWords().every((entry) => /^[a-z]+( [a-z]+)*$/.test(entry))],
];
for (const [name, ok] of stagings) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} staging: ${name}`);
  if (!ok) failed++;
}

const total = CASES.length + noise.length + listChecks.length + stagings.length;
if (failed > 0) {
  console.error(`\n${failed} of ${total} checks failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} checks passed (${CASES.length} transcripts).`);
