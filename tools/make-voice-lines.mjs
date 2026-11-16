/**
 * Records the set designer's fixed lines (src/spoken-lines.ts) in both of its voices, with the same ElevenLabs
 * voices, model and settings as its live replies (api/speak.ts), and writes
 *
 *   public/audio/voice/her/<key>.mp3, public/audio/voice/him/<key>.mp3
 *   public/audio/voice/lines.json     what was recorded, word for word
 *
 *   node tools/make-voice-lines.mjs           (needs ELEVENLABS_API_KEY in .env.local)
 *   node tools/make-voice-lines.mjs --all     records every line again, not only the changed ones
 *
 * A line is recorded again only when its words changed, so a second run costs nothing. tools/check-claims.mjs
 * fails when a line in the source has no recording of the same words.
 */
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

try {
  process.loadEnvFile('.env.local');
} catch {
  // The key may be in the shell instead.
}
const key = process.env.ELEVENLABS_API_KEY ?? '';
if (!key) {
  console.error('No ELEVENLABS_API_KEY in .env.local or the shell.');
  process.exit(1);
}

mkdirSync('tmp/voice-lines', { recursive: true });
await build({ entryPoints: ['src/spoken-lines.ts'], bundle: true, platform: 'node', format: 'esm', outdir: 'tmp/voice-lines', logLevel: 'error' });
const { LINES } = await import(`../tmp/voice-lines/spoken-lines.js?${Date.now()}`);

// The same as api/speak.ts.
const VOICES = { her: 'EXAVITQu4vr4xnSDxMaL', him: 'cjVigY5qzO86Huf0OWal' };
const MODEL = 'eleven_flash_v2_5';
const SETTINGS = { stability: 0.5, similarity_boost: 0.75 };

const ROOT = 'public/audio/voice';
const LIST = `${ROOT}/lines.json`;
const before = existsSync(LIST) ? JSON.parse(readFileSync(LIST, 'utf8')) : { lines: {} };
const all = process.argv.includes('--all');
let recorded = 0;
let characters = 0;

for (const [voice, id] of Object.entries(VOICES)) {
  mkdirSync(`${ROOT}/${voice}`, { recursive: true });
  for (const [name, text] of Object.entries(LINES)) {
    const file = `${ROOT}/${voice}/${name}.mp3`;
    if (!all && before.lines?.[name] === text && existsSync(file)) continue;
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${id}?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }),
    });
    if (!response.ok) {
      console.error(`${voice}/${name}: ${response.status} ${(await response.text()).slice(0, 200)}`);
      process.exit(1);
    }
    const audio = Buffer.from(await response.arrayBuffer());
    writeFileSync(file, audio);
    recorded++;
    characters += text.length;
    console.log(`${voice}/${name}.mp3  ${audio.length} bytes  "${text}"`);
  }
}
// A line taken out of the source takes its recordings with it.
for (const name of Object.keys(before.lines ?? {})) {
  if (name in LINES) continue;
  for (const voice of Object.keys(VOICES)) rmSync(`${ROOT}/${voice}/${name}.mp3`, { force: true });
  console.log(`removed ${name}`);
}
writeFileSync(LIST, JSON.stringify({ model: MODEL, voices: VOICES, settings: SETTINGS, lines: LINES }, null, 1) + '\n');
console.log(`${recorded} recorded (${characters} characters), ${Object.keys(LINES).length * 2 - recorded} kept.`);
