/**
 * Fails when the README says something the code no longer does. It reads the
 * numbers the README quotes straight from the source, and it fails if a retired
 * claim comes back.
 *
 *   npm run check:claims
 */
import { readdirSync, readFileSync } from 'node:fs';

// A clone on Windows may carry CRLF endings; the checks read one line ending.
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const readme = read('README.md');
const count = (text, pattern) => (text.match(pattern) ?? []).length;
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];

const lenses = /LENSES = \[([^\]]+)\]/.exec(read('src/camera-formats.ts'))[1].split(',').map((n) => n.trim());
const formats = count(read('src/camera-formats.ts'), /\{ name: '/g);
const briefs = count(read('src/briefs.ts'), /^\s+title: '/gm);
// The second camera is kit, not something on a shelf.
const assets = count(read('src/catalog.ts'), /\{ label: '/g) - count(read('src/catalog.ts'), /shelf: 'Kit'/g);
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

// The submission form and the sources file, against the results they quote.
const submission = read('devpost/submission.md');
const sources = read('devpost/sources.md');
const tagline = /## Tagline\n\n```\n(.*)\n```/.exec(submission)[1];
expect(`the tagline is ${tagline.length} characters, 140 at most`, tagline.length <= 140);
expect('the tagline has no open value in it', !tagline.includes('[X'));
const frames = JSON.parse(read('devpost/results/quest-frame-rate.json'));
const fps = frames.samples.map((sample) => sample.fps).sort((a, b) => a - b);
const median = fps[Math.floor(fps.length / 2)];
expect(`the tagline's frame rate is the measured median, ${median}`, tagline.includes(`${median} frames`));
expect(`the submission says ${fps.length} one-second samples and a lowest of ${fps[0]}`, submission.includes(`${fps.length} one-second samples`) && submission.includes(`the lowest was ${fps[0]}`));
expect(`the submission says ${assets} pieces and ${lenses[0]} to ${lenses[lenses.length - 1]} mm`, submission.includes(`${assets} hand-built pieces`) && submission.includes(`${lenses[0]} to ${lenses[lenses.length - 1]} mm`));
for (const file of readdirSync(new URL('../devpost/results/', import.meta.url))) {
  expect(`sources.md names devpost/results/${file}`, sources.includes(file));
}
expect(`sources.md counts ${assets} pieces`, sources.includes(`${assets} pieces`));
const retiredAt = sources.indexOf('are retired');
expect('sources.md retires the two October rate cards and cites neither', retiredAt > 0 && !/Antoniou|StoryboardArt\.org/.test(sources.slice(retiredAt)));

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
