/**
 * Fails when the README says something the code no longer does. It reads the
 * numbers the README quotes straight from the source, and it fails if a retired
 * claim comes back.
 *
 *   npm run check:claims
 */
import { readdirSync, readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const readme = read('README.md');
const count = (text, pattern) => (text.match(pattern) ?? []).length;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const lenses = /LENSES = \[([^\]]+)\]/.exec(read('src/camera-formats.ts'))[1].split(',').map((n) => n.trim());
const formats = count(read('src/camera-formats.ts'), /\{ name: '/g);
const briefs = count(read('src/briefs.ts'), /^\s+title: '/gm);
const assets = count(read('src/catalog.ts'), /\{ label: '/g);
const takeSeconds = Number(/TAKE_MAX_SECONDS = (\d+)/.exec(read('src/take.ts'))[1]);
const sounds = readdirSync(new URL('../public/audio/', import.meta.url)).filter((name) => name.endsWith('.wav')).length;
const failures = [];

function expect(claim, ok) {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${claim}`);
  if (!ok) failures.push(claim);
}

expect(`README names all ${lenses.length} lenses`, lenses.every((mm) => readme.includes(`${mm},`) || readme.includes(`${mm} `)));
expect(`README says ${WORDS[briefs]} shots`, new RegExp(`\\b${WORDS[briefs]} shots\\b`, 'i').test(readme));
expect(`README says ${assets} assets in the library`, readme.includes(`${assets} assets`));
expect(`README says a take runs ${WORDS[takeSeconds]} seconds`, readme.includes(`${WORDS[takeSeconds]} seconds`));
expect(`README says ${WORDS[formats]} formats`, new RegExp(`\\b${WORDS[formats]} formats\\b`, 'i').test(readme) || formats === count(readme, /Full frame|full frame|Super 35|Super 16|65 mm/g));
expect(`README says ${WORDS[sounds]} sounds, as on disk`, readme.includes(`${WORDS[sounds]} sounds`));

// Things that used to be true and must not come back.
for (const retired of ['ray-and-pinch distance grab', 'lands where you carry it by the plate', 'gaze', 'sits on a QR', 'AI-generated video']) {
  expect(`retired claim stays out: "${retired}"`, !readme.toLowerCase().includes(retired.toLowerCase()));
}
// Effects are never to be sold as simulations; the README has to say what they are.
expect('README says effects are not simulations', /not simulations/.test(readme));
expect('app says effects are not simulations', /not simulations/.test(read('public/ui/controls.uikitml')));

if (failures.length > 0) {
  console.error(`\n${failures.length} claim(s) no longer match the code.`);
  process.exit(1);
}
console.log('\nEvery checked claim matches the code.');
