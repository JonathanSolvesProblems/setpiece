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
 *
 * And, for the effects on the set and stepping inside, at half the rate (they are noise, and small that way):
 *
 * rain    a steady hiss with droplets, looped
 * fire    a low roar with crackles, looped (fire, embers, sparks, an explosion)
 * wind    a slow, swelling low wind, looped (smoke, fog, dust, snow)
 * water   a burble with bubbles, looped
 * arrive  a rising whoosh as the set grows around the wearer
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

function write(name, samples, rate = RATE) {
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
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  writeFileSync(`public/audio/${name}.wav`, Buffer.concat([header, data]));
  console.log(`${name}.wav ${(samples.length / rate).toFixed(2)} s ${44 + data.length} bytes`);
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

// The effects' loops, at half the rate. Each is made a little long and its end laid over its start, so it repeats
// without a seam.
const LOOP_RATE = 22050;
const lowpassAt = (samples, hz) => {
  const a = 1 - Math.exp((-2 * Math.PI * hz) / LOOP_RATE);
  let y = 0;
  return samples.map((x) => (y += a * (x - y)));
};
const highpassAt = (samples, hz) => {
  const low = lowpassAt(samples, hz);
  return samples.map((x, i) => x - low[i]);
};
const renderAt = (seconds, fn) => {
  const n = Math.round(seconds * LOOP_RATE);
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / LOOP_RATE, i);
  return out;
};
function loopify(samples, fadeSeconds) {
  const fade = Math.round(fadeSeconds * LOOP_RATE);
  const n = samples.length - fade;
  const out = samples.slice(0, n);
  for (let i = 0; i < fade; i++) out[i] = samples[i] * (i / fade) + samples[n + i] * (1 - i / fade);
  return out;
}
/** Short bursts at random moments: each a decaying click made by the given shaper. */
function bursts(seconds, perSecond, seed, make) {
  const rand = noise(seed);
  const out = new Array(Math.round(seconds * LOOP_RATE)).fill(0);
  for (let at = 0; at < out.length; ) {
    at += Math.round((-Math.log(1 - (rand() * 0.5 + 0.5) * 0.999) / perSecond) * LOOP_RATE);
    const click = make(rand);
    for (let i = 0; i < click.length && at + i < out.length; i++) out[at + i] += click[i];
  }
  return out;
}
const LOOP = 4.5;
{
  const rand = noise(23);
  const hiss = highpassAt(lowpassAt(renderAt(LOOP, () => rand() * 0.5), 6000), 500);
  const drops = bursts(LOOP, 45, 29, (r) => highpassAt(renderAt(0.012, (t) => r() * Math.exp(-t / 0.0025) * (0.3 + 0.7 * Math.abs(r()))), 1800));
  write('rain', normalise(loopify(mix(hiss, drops), 0.5), 0.5), LOOP_RATE);
}
{
  const rand = noise(31);
  const roar = lowpassAt(renderAt(LOOP, () => rand()), 260);
  const crackle = bursts(LOOP, 7, 37, (r) => highpassAt(lowpassAt(renderAt(0.03, (t) => r() * Math.exp(-t / (0.003 + 0.004 * Math.abs(r())))), 4200), 1200));
  write('fire', normalise(loopify(mix(normalise(roar, 0.45), normalise(crackle, 0.9)), 0.5), 0.6), LOOP_RATE);
}
{
  const rand = noise(41);
  const air = lowpassAt(renderAt(LOOP + 1, () => rand()), 420);
  const swell = air.map((x, i) => x * (0.6 + 0.4 * Math.sin((2 * Math.PI * i) / LOOP_RATE / (LOOP + 0.5) * 2)));
  write('wind', normalise(loopify(swell, 1), 0.4), LOOP_RATE);
}
{
  const rand = noise(43);
  const burble = lowpassAt(highpassAt(renderAt(LOOP, () => rand()), 120), 900);
  const bubbles = bursts(LOOP, 9, 47, (r) => {
    const hz = 300 + 500 * Math.abs(r());
    return renderAt(0.035, (t) => Math.sin(2 * Math.PI * hz * (1 + 6 * t) * t) * Math.exp(-t / 0.012) * 0.7);
  });
  write('water', normalise(loopify(mix(normalise(burble, 0.4), bubbles), 0.5), 0.5), LOOP_RATE);
}
// Stepping inside: air rushing past as the set grows around the wearer, rising and settling, with a low swell.
{
  const rand = noise(53);
  const seconds = 1.4;
  const raw = renderAt(seconds, () => rand());
  let y = 0;
  const swept = raw.map((x, i) => {
    const t = i / LOOP_RATE / seconds;
    const hz = 180 + 2600 * Math.sin(Math.PI * Math.min(1, t * 1.15));
    const a = 1 - Math.exp((-2 * Math.PI * hz) / LOOP_RATE);
    y += a * (x - y);
    return y * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 1.5;
  });
  const swell = renderAt(seconds, (t) => Math.sin(2 * Math.PI * (55 + 40 * t) * t) * Math.sin((Math.PI * t) / seconds) * 0.5);
  write('arrive', normalise(mix(swept, swell), 0.7), LOOP_RATE);
}
