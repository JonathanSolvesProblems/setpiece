/**
 * Writes Setpiece's four sounds as 16-bit mono WAV files. Each is synthesised
 * here from sine partials and filtered noise, so nothing is sampled or licensed.
 *
 *   node tools/make-audio.mjs
 *
 * clap   the clapper sticks closing, on Snap
 * pick   a wooden piece lifted off the slate
 * place  a wooden piece set back down
 * land   the slate landing on the table
 */
import { mkdirSync, writeFileSync } from 'node:fs';

const RATE = 44100;

/** Deterministic noise, so the files do not change between runs. */
function noise(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x80000000 - 1;
  };
}

/** One-pole low-pass and high-pass, enough to shape a burst of noise. */
function lowpass(samples, hz) {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / RATE);
  let y = 0;
  return samples.map((x) => (y += a * (x - y)));
}
function highpass(samples, hz) {
  const low = lowpass(samples, hz);
  return samples.map((x, i) => x - low[i]);
}

function render(seconds, fn) {
  const n = Math.round(seconds * RATE);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / RATE, i);
  return out;
}

function mix(...tracks) {
  const n = Math.max(...tracks.map((t) => t.length));
  const out = new Array(n).fill(0);
  for (const t of tracks) for (let i = 0; i < t.length; i++) out[i] += t[i];
  return out;
}

function normalise(samples, peak) {
  const max = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1;
  return samples.map((x) => (x / max) * peak);
}

function write(name, samples) {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i])) * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(`public/audio/${name}.wav`, Buffer.concat([header, data]));
  console.log(`${name}.wav ${(samples.length / RATE).toFixed(2)} s ${44 + data.length} bytes`);
}

const partial = (hz, decay, gain) => (t) => Math.sin(2 * Math.PI * hz * t) * Math.exp(-t / decay) * gain;

mkdirSync('public/audio', { recursive: true });

// Two hardwood sticks: a crack of bright noise, then the wood ringing briefly.
{
  const rand = noise(7);
  const crack = highpass(
    lowpass(
      render(0.3, (t) => rand() * Math.exp(-t / 0.012)),
      5200,
    ),
    900,
  );
  const body = render(0.3, (t) => partial(410, 0.035, 0.9)(t) + partial(930, 0.022, 0.6)(t) + partial(1760, 0.012, 0.35)(t));
  const tail = lowpass(
    render(0.3, (t) => rand() * Math.exp(-t / 0.07) * 0.08),
    2400,
  );
  write('clap', normalise(mix(crack, body, tail), 0.9));
}

// A light wooden knock, higher when a piece comes up than when it goes down.
function knock(hz, seed) {
  const rand = noise(seed);
  const tap = lowpass(
    render(0.12, (t) => rand() * Math.exp(-t / 0.004)),
    3000,
  );
  const body = render(0.12, (t) => partial(hz, 0.018, 0.9)(t) + partial(hz * 2.4, 0.008, 0.3)(t));
  return normalise(mix(tap, body), 0.55);
}
write('pick', knock(1180, 11));
write('place', knock(760, 13));

// The slate landing: a low thump with a little slap of the plate on top.
{
  const rand = noise(17);
  const thump = render(0.45, (t) => Math.sin(2 * Math.PI * (72 + 60 * Math.exp(-t / 0.03)) * t) * Math.exp(-t / 0.09));
  const slap = lowpass(
    render(0.45, (t) => rand() * Math.exp(-t / 0.018) * 0.5),
    1400,
  );
  write('land', normalise(mix(thump, slap), 0.85));
}
