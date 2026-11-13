/**
 * Times the set designer against the real model, from this machine, the way the headset asks it: for each
 * sentence, how long from the request until the first piece of the plan is complete, and until the whole
 * plan is in, with the token counts. Writes devpost/results/designer-latency.json.
 *
 *   node tools/measure-designer.mjs            (needs SETPIECE_ANTHROPIC_KEY in .env.local)
 *
 * What it does not measure: the headset's own share (its speech recogniser, the network from a Quest, and
 * drawing the pieces), which is measured on the device.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';

try {
  process.loadEnvFile('.env.local');
} catch {
  // The key may be in the shell instead.
}
mkdirSync('tmp/director', { recursive: true });
await build({
  entryPoints: ['api/director.ts', 'src/director-plan.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'tmp/director',
  external: ['@anthropic-ai/sdk'],
  logLevel: 'error',
});
const { POST } = await import(`../tmp/director/api/director.js?${Date.now()}`);
const { PlanReader, cleanThing } = await import(`../tmp/director/src/director-plan.js?${Date.now()}`);

const SENTENCES = [
  'a night chase, a red car racing past a burning truck, two actors running at camera, and a dragon on a rooftop',
  'a medieval castle gate with two guards and a horse, low angle',
  'a spaceship landing in a desert canyon, an astronaut walking toward it at sunset',
  'two people arguing across a cafe table',
  'a crowd running from a giant robot down a city street',
  'a car and a red dragon',
  'a wizard casting a spell on a bridge in the fog',
];

async function ask(said) {
  const started = Date.now();
  const response = await POST(
    new Request('http://localhost/api/director', {
      method: 'POST',
      headers: { origin: 'http://localhost:8081', 'content-type': 'application/json' },
      body: JSON.stringify({ said, set: '', heard: [] }),
    }),
  );
  let firstPieceMs = 0;
  const things = [];
  const reader = new PlanReader(
    () => {},
    (raw) => {
      if (firstPieceMs === 0) firstPieceMs = Date.now() - started;
      things.push(cleanThing(raw));
    },
  );
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
  const plan = JSON.parse(reader.whole);
  return {
    said,
    firstPieceMs,
    wholeMs: Date.now() - started,
    stop: end?.stop ?? end?.t,
    model: end?.model,
    usage: end?.usage,
    title: plan.title,
    says: plan.says,
    pieces: things.length,
    made: things.filter((thing) => thing?.id.startsWith('new:')).length,
    camera: { height: plan.camera?.height, lens: plan.camera?.lens },
  };
}

// The first request after the instructions change writes them to the cache; it is reported on its own.
const warm = await ask(SENTENCES[0]);
const runs = [];
for (const said of SENTENCES) {
  const run = await ask(said);
  runs.push(run);
  console.log(`${run.firstPieceMs} ms to the first piece, ${run.wholeMs} ms to the whole set: ${said}`);
}
const sorted = (values) => [...values].sort((a, b) => a - b);
const median = (values) => sorted(values)[Math.floor(values.length / 2)];
const first = runs.map((run) => run.firstPieceMs);
const whole = runs.map((run) => run.wholeMs);
const result = {
  measured: new Date().toISOString().slice(0, 10),
  what: 'Seconds from the request to the first piece of the plan being complete, and to the whole plan, for fresh sets, calling api/director.ts from a desktop on home broadband with the instructions cached. claude-opus-5-5, fast mode, low effort, structured output.',
  limit: "The headset's own share is not in this number: its speech recogniser, the Quest's network, and drawing the pieces.",
  summary: {
    sentences: runs.length,
    firstPieceMs: { median: median(first), lowest: Math.min(...first), highest: Math.max(...first) },
    wholeMs: { median: median(whole), lowest: Math.min(...whole), highest: Math.max(...whole) },
    cacheWriteRun: { firstPieceMs: warm.firstPieceMs, wholeMs: warm.wholeMs },
  },
  runs,
};
writeFileSync('devpost/results/designer-latency.json', JSON.stringify(result, null, 1));
console.log(JSON.stringify(result.summary));
