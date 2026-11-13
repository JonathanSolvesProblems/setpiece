/**
 * Grades the set designer's plans against rules that can be checked without looking: every piece is one the
 * library has, or a made piece whose parts all read; pieces stand inside the stage and do not sit inside one
 * another; everything is at true scale unless the sentence asked otherwise; the camera stands inside the stage
 * and a metre or more from what it looks at; nothing is named after a brand or a real person; an edit changes
 * only what it was asked to. Calls the real model, about 7 cents a sentence.
 *
 *   node tools/eval-designer.mjs [index ...]     writes tmp/director/eval.json
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
  entryPoints: ['api/director.ts', 'src/director-plan.ts', 'src/director-prompt.ts', 'src/catalog.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outdir: 'tmp/director',
  external: ['@anthropic-ai/sdk'],
  logLevel: 'error',
});
const stamp = Date.now();
const { POST } = await import(`../tmp/director/api/director.js?${stamp}`);
const { cleanThing, readPart } = await import(`../tmp/director/src/director-plan.js?${stamp}`);
const { ASSETS } = await import(`../tmp/director/src/catalog.js?${stamp}`);

/** Footprints of the library's pieces, in metres: width across x, length across z (src/director-prompt.ts). */
const SIZE = {
  A: [1, 0.8], B: [1, 0.5], C: [1, 0.4], D: [0.9, 0.4], Creature: [0.5, 0.5], Car: [1.9, 4.6], Van: [2, 5], Motorbike: [0.6, 2.7],
  Truck: [2.6, 6.3], Pickup: [2.1, 5.2], Bus: [2.8, 7.9], Helicopter: [5.8, 7.9], Boat: [1.8, 5.5], Saucer: [4.1, 4], Bicycle: [0.4, 1.8],
  Tank: [3, 6.6], Wall: [3.4, 0.4], 'Lamp post': [0.4, 1.1], Tree: [2.3, 1.8], Crate: [0.8, 0.8], Dragon: [3.1, 5.6], Troll: [3.8, 2.8],
  Dinosaur: [1.7, 5.1], Robot: [2.5, 1.9], Alien: [0.9, 0.8], Ghost: [1.4, 1.3], Spider: [2.9, 2.5], Kraken: [2.7, 2.7], Horse: [0.8, 2.8],
  Wolf: [0.4, 1.9], House: [5.3, 1.2], Fence: [4, 0.2], Stairs: [1.2, 3.8], Door: [1.1, 0.8], Pillar: [2.3, 1.6], Barrier: [3, 0.6],
  Bench: [1.8, 0.6], Cone: [0.4, 0.4], Dumpster: [2.1, 1.2], Rock: [2, 1.8],
};
const EFFECTS = new Set(ASSETS.filter((asset) => asset.shelf === 'Effects').map((asset) => asset.label));
const BRANDS = /\b(batman|joker|superman|spider-?man|marvel|dc comics|star wars|jedi|darth|vader|stormtrooper|jeep|ford|ferrari|lamborghini|porsche|tesla|coca|pepsi|nike|disney|pixar|harry potter|hogwarts|godzilla|king kong|transformers?|t-?rex jurassic|jurassic)\b/i;

const SET_STREET = [
  '- Truck: Truck; at x 0.2, z 1.2, facing 90',
  '- Car: Car; at x -1, z -0.6, facing 90; red',
  '- A: Actor A; at x 1.2, z -0.4, facing 0; pose First pose, look Wood',
  '- Smoke: Smoke; at x -1.5, z -1.4, facing 0',
  'Camera: at x 0, z 2.2, lens 1.6 m high, 35 mm, looking towards x 0, y 1.2, z -1.',
].join('\n');

const CASES = [
  { said: 'a western standoff at high noon, two gunslingers and a horse' },
  { said: 'a superhero landing in front of a burning building' },
  { said: 'batman fighting the joker on a rooftop', brandTest: true },
  { said: 'a quiet scene, a woman reading on a park bench under a tree' },
  { said: 'a horror scene, a ghost at the end of a dark corridor' },
  { said: 'close up on actor a looking scared', set: SET_STREET, edit: true, keepIds: ['Truck', 'Car', 'Smoke'] },
  { said: 'an aerial shot of a car chase', heightAtLeast: 4 },
  { said: 'a pirate ship attacked by a kraken' },
  { said: 'add rain and lose the smoke', set: SET_STREET, edit: true, mustRemove: ['Smoke'], keepIds: ['Truck', 'Car', 'A'] },
  { said: 'move the truck out of the shot', set: SET_STREET, edit: true, keepIds: ['Car', 'A', 'Smoke'] },
  { said: 'a dinosaur chasing a jeep through the jungle', brandTest: true },
  { said: 'two knights jousting' },
  { said: 'a wedding under an arch in a garden' },
  { said: 'make the dragon bigger', set: '- Dragon: Dragon; at x 0, z -0.8, facing 0\nCamera: at x 0, z 2.2, lens 1.6 m high, 35 mm, looking towards x 0, y 1.5, z -0.8.', edit: true, sizeOf: 'Dragon' },
  { said: 'a giant robot stepping over a bus', sizeAllowed: ['Robot'] },
];

async function ask(c) {
  const started = Date.now();
  const response = await POST(
    new Request('http://localhost/api/director', {
      method: 'POST',
      headers: { origin: 'http://localhost:8081', 'content-type': 'application/json' },
      body: JSON.stringify({ said: c.said, set: c.set ?? '', heard: [] }),
    }),
  );
  let text = '';
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
      if (event.t === 'd') text += event.s;
      else end = event;
    }
  }
  return { plan: JSON.parse(text), end, ms: Date.now() - started };
}

/** The four corners of a footprint, turned by its yaw, in metres. */
function corners(x, z, w, d, yaw) {
  const c = Math.cos((yaw * Math.PI) / 180);
  const s = Math.sin((yaw * Math.PI) / 180);
  return [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]].map(([px, pz]) => [x + px * c + pz * s, z - px * s + pz * c]);
}
/** How much of the smaller of two turned footprints lies inside the other, roughly: sampled on a grid. */
function overlap(a, b) {
  const inside = (poly, [px, pz]) => {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i];
      const [xj, zj] = poly[j];
      if (zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) hit = !hit;
    }
    return hit;
  };
  const [small, big] = a.area <= b.area ? [a, b] : [b, a];
  let n = 0;
  let hits = 0;
  for (let u = 0.05; u < 1; u += 0.1) {
    for (let v = 0.05; v < 1; v += 0.1) {
      const [p0, p1, , p3] = small.poly;
      const point = [p0[0] + (p1[0] - p0[0]) * u + (p3[0] - p0[0]) * v, p0[1] + (p1[1] - p0[1]) * u + (p3[1] - p0[1]) * v];
      n++;
      if (inside(big.poly, point)) hits++;
    }
  }
  return hits / n;
}

function grade(c, plan) {
  const problems = [];
  const things = (plan.things ?? []).map(cleanThing).filter(Boolean);
  const ids = new Set(ASSETS.map((asset) => asset.label));
  const footprints = [];
  for (const [i, raw] of (plan.things ?? []).entries()) {
    const thing = things[i];
    if (thing == null) continue;
    const id = thing.id;
    if (id.startsWith('new:')) {
      const read = thing.parts.map(readPart).filter(Boolean).length;
      if (thing.parts.length < 1) problems.push(`${id}: no parts`);
      if (read < thing.parts.length) problems.push(`${id}: ${thing.parts.length - read} part(s) unreadable`);
    } else if (!id.startsWith('copy:') && !ids.has(id)) problems.push(`unknown id ${id}`);
    if (Math.abs(raw.x) > 3.05 || Math.abs(raw.z) > 2.05) problems.push(`${id} outside the stage at ${raw.x}, ${raw.z}`);
    const asked = (c.sizeAllowed ?? []).includes(id) || c.sizeOf === id;
    if (thing.size !== 0 && Math.abs(thing.size - 1) > 0.01 && !asked) problems.push(`${id} at size ${thing.size} unasked`);
    const base = id.replace(/ \d$/, '');
    // A tree's or a lamp's footprint is its branches or its head, high above: things pass under it.
    if (SIZE[base] && !EFFECTS.has(base) && !['Tree', 'Lamp post'].includes(base) && thing.y < 0.1) {
      const scale = thing.size > 0 ? thing.size : 1;
      const [w, d] = SIZE[base];
      footprints.push({ id, poly: corners(thing.x, thing.z, w * scale, d * scale, thing.yaw), area: w * d * scale * scale });
    }
    if (BRANDS.test(`${thing.name} ${id}`)) problems.push(`brand or person in a name: ${thing.name}`);
  }
  for (let i = 0; i < footprints.length; i++) {
    for (let j = i + 1; j < footprints.length; j++) {
      const share = overlap(footprints[i], footprints[j]);
      if (share > 0.35) problems.push(`${footprints[i].id} and ${footprints[j].id} overlap ${Math.round(share * 100)}%`);
    }
  }
  if (BRANDS.test(`${plan.title} ${plan.says} ${plan.next}`)) problems.push(`brand or person in the words: ${plan.title} / ${plan.says}`);
  const cam = plan.camera ?? {};
  if (!cam.keep) {
    if (Math.abs(cam.x) > 3.05 || cam.z > 2.45 || cam.z < -2.05) problems.push(`camera outside the stage at ${cam.x}, ${cam.z}`);
    const target = things.find((thing) => thing.id === cam.look_at);
    const tx = target ? target.x : cam.look_x;
    const tz = target ? target.z : cam.look_z;
    const away = Math.hypot(cam.x - tx, cam.z - tz);
    if (away < 0.9) problems.push(`camera ${away.toFixed(1)} m from what it looks at`);
    if (c.heightAtLeast && cam.height < c.heightAtLeast) problems.push(`camera at ${cam.height} m for a high shot`);
  }
  if (c.edit) {
    if (plan.fresh) problems.push('an edit came back as a fresh set');
    for (const id of c.keepIds ?? []) if (things.some((thing) => thing.id === id) && !(plan.remove ?? []).includes(id)) problems.push(`${id} was changed though not named`);
    for (const id of c.mustRemove ?? []) if (!(plan.remove ?? []).includes(id)) problems.push(`${id} was not removed`);
    if (c.sizeOf) {
      const thing = things.find((t) => t.id === c.sizeOf);
      if (!thing || thing.size <= 1) problems.push(`${c.sizeOf} was not made bigger`);
    }
  } else if (!plan.fresh) problems.push('a new scene came back as an edit');
  return { problems, things: things.length, made: things.filter((t) => t.id.startsWith('new:')).length };
}

const picked = process.argv.slice(2).map(Number);
const cases = picked.length > 0 ? picked.map((i) => CASES[i]) : CASES;
const results = [];
let clean = 0;
for (const c of cases) {
  try {
    const { plan, end, ms } = await ask(c);
    const graded = grade(c, plan);
    if (graded.problems.length === 0) clean++;
    results.push({ said: c.said, ms, stop: end?.stop, title: plan.title, says: plan.says, camera: plan.camera, ...graded, plan });
    console.log(`${graded.problems.length === 0 ? 'ok  ' : 'FLAG'} ${(ms / 1000).toFixed(1)} s  ${c.said}  [${plan.title}: ${graded.things} things, ${graded.made} made; ${plan.camera?.lens} mm at ${plan.camera?.height} m]`);
    for (const problem of graded.problems) console.log(`       ${problem}`);
  } catch (error) {
    results.push({ said: c.said, error: String(error) });
    console.log(`FAIL ${c.said}: ${error}`);
  }
}
writeFileSync('tmp/director/eval.json', JSON.stringify(results, null, 1));
console.log(`\n${clean} of ${cases.length} plans with nothing to flag.`);
