/**
 * A judge's first sentence after the designer has been quiet for over an hour, the way the page now asks it: the
 * warm request the page sends once it is ready, a gap while the judge enters the headset and lands the set, then
 * the night chase. Writes devpost/results/designer-first-request.json. Compare designer-latency.json's
 * cacheWriteRun, the same sentence with nothing warmed first (9.6 s).
 *
 *   node tools/measure-first-request.mjs      (needs SETPIECE_ANTHROPIC_KEY in .env.local and an hour of quiet)
 *
 * If the warm request reads the cache, the designer was not quiet long enough: it says so and writes nothing.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

try {
  process.loadEnvFile('.env.local');
} catch {
  // The key may be in the shell instead.
}
mkdirSync('tmp/director', { recursive: true });
await build({ entryPoints: ['api/director.ts', 'src/director-plan.ts'], bundle: true, platform: 'node', format: 'esm', outdir: 'tmp/director', external: ['@anthropic-ai/sdk'], logLevel: 'error' });
const { POST } = await import(`../tmp/director/api/director.js?${Date.now()}`);
const { PlanReader } = await import(`../tmp/director/src/director-plan.js?${Date.now()}`);

const SAID = 'a night chase, a red car racing past a burning truck, two actors running at camera, and a dragon on a rooftop';
const GAP_MS = 20000;
const post = (body) =>
  POST(new Request('http://localhost/api/director', { method: 'POST', headers: { origin: 'http://localhost:8081', 'content-type': 'application/json' }, body: JSON.stringify(body) }));

const warmStarted = Date.now();
const warm = await (await post({ warm: true })).json();
const warmMs = Date.now() - warmStarted;
console.log('warm', warmMs, 'ms', JSON.stringify(warm));
if (warm.warm !== true || warm.cacheRead > 0 || warm.cacheWrite === 0) {
  console.log('The cache was not cold (or the warm request failed): nothing written.');
  process.exit(2);
}
await new Promise((resolve) => setTimeout(resolve, GAP_MS));

const started = Date.now();
const response = await post({ said: SAID, set: '', heard: [] });
let firstPieceMs = 0;
const reader = new PlanReader(() => {}, () => { if (firstPieceMs === 0) firstPieceMs = Date.now() - started; });
let end = null;
let carry = '';
const decoder = new TextDecoder();
for await (const chunk of response.body) {
  carry += decoder.decode(chunk, { stream: true });
  for (let nl = carry.indexOf('\n'); nl >= 0; nl = carry.indexOf('\n')) {
    const line = carry.slice(0, nl);
    carry = carry.slice(nl + 1);
    if (line.trim() === '') continue;
    const event = JSON.parse(line);
    if (event.t === 'd') reader.push(event.s);
    else end = event;
  }
}
const run = { said: SAID, firstPieceMs, wholeMs: Date.now() - started, stop: end?.stop ?? end?.t, model: end?.model, usage: end?.usage };
const result = {
  measured: new Date().toISOString().slice(0, 10),
  what: "The first sentence after over an hour with no requests, sent 20 s after the page's warm request, from a desktop on home broadband. Seconds from the request to the first piece being complete, and to the whole plan. claude-opus-5-5, fast mode, low effort, structured output" + (process.env.DIRECTOR_HURRY === 'off' ? '.' : ', asked to begin its answer at once (api/director.ts, HURRY).'),
  limit: "One run. The headset's own share is not in this number: its speech recogniser, the Quest's network, and drawing the pieces.",
  warm: { ms: warmMs, cacheWrite: warm.cacheWrite, cacheRead: warm.cacheRead },
  gapMs: GAP_MS,
  run,
};
writeFileSync('devpost/results/designer-first-request.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify({ firstPieceMs, wholeMs: run.wholeMs, usage: run.usage }));
