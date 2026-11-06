/**
 * Writes public/voice/vosk-worker.js: the speech recogniser's worker.
 *
 * vosk-browser carries its worker (Vosk and Kaldi compiled to WebAssembly,
 * with the binary inside) as a base64 string in its bundle, and unpacks it on
 * the page's main thread. Setpiece starts it from a file instead, so the page
 * that draws the headset's frames never has to parse or decode five megabytes.
 * The code is taken out byte for byte; nothing in it is changed.
 *
 *   npm run voice:worker
 */
import { readFileSync, writeFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const version = JSON.parse(read('node_modules/vosk-browser/package.json')).version;
const bundle = read('node_modules/vosk-browser/dist/vosk.js');

const packed = /createBase64WorkerFactory\('([A-Za-z0-9+/=]+)'/.exec(bundle);
if (packed == null) {
  console.error('The worker is not where vosk-browser 0.0.8 keeps it. Check the version in package.json.');
  process.exit(1);
}
// The first line is the bundler's own marker comment, which the library drops too.
const unpacked = Buffer.from(packed[1], 'base64').toString('latin1');
const source = unpacked.slice(unpacked.indexOf('\n', 10) + 1);
if (!source.includes('class RecognizerWorker') || /SharedArrayBuffer|Atomics\./.test(source)) {
  console.error('The unpacked worker is not the single-threaded build this app relies on.');
  process.exit(1);
}

const header =
  `// Vosk speech recognition worker, from vosk-browser ${version} (Apache-2.0),\n` +
  '// https://github.com/ccoreilly/vosk-browser. Written by tools/make-voice-worker.mjs:\n' +
  '// do not edit by hand. Licence and notices: LICENSE.txt and NOTICE.txt beside this file.\n';
const target = new URL('../public/voice/vosk-worker.js', import.meta.url);
writeFileSync(target, header + source);
console.log(`public/voice/vosk-worker.js: ${header.length + source.length} bytes, from vosk-browser ${version}`);
