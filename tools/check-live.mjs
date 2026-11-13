// Checks the live site the way a judge meets it: no account, no key, no install
// beyond Node 20. Every check is an assertion against what the server sends.
//
//   node tools/check-live.mjs                 checks https://setpiece.jonathansolvesproblems.com
//   node tools/check-live.mjs https://host/   checks another deployment
//
// Writes devpost/checks/last-run.md and exits 1 if any check fails.
import { mkdirSync, writeFileSync } from 'node:fs';

const base = (process.argv[2] ?? 'https://setpiece.jonathansolvesproblems.com/').replace(/\/?$/, '/');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
};

async function get(path) {
  const t = performance.now();
  const response = await fetch(new URL(path, base), { redirect: 'manual', cache: 'no-store' });
  const body = await response.arrayBuffer();
  return { status: response.status, ms: Math.round(performance.now() - t), type: response.headers.get('content-type') ?? '', robotsTag: response.headers.get('x-robots-tag') ?? '', bytes: body.byteLength, text: () => new TextDecoder().decode(body) };
}

const page = await get('');
check('the page answers over HTTPS', page.status === 200, `${page.status}, ${page.ms} ms`);
const html = page.text();
check('it is Setpiece', /<title>Setpiece<\/title>/.test(html));
const robots = await get('robots.txt');
check(
  'search engines are allowed to index it',
  !/<meta[^>]*noindex/i.test(html) && !/noindex/i.test(page.robotsTag) && !(robots.status === 200 && /^Disallow:\s*\/\s*$/m.test(robots.text())),
  page.robotsTag || 'no X-Robots-Tag',
);
check('the loading card is in the page', /id="loader"/.test(html) && /id="loader-step"/.test(html));
check('the page controls start locked until the set is ready', /class="strip"[^>]*\binert\b/.test(html) && /id="enter-xr"[^>]*disabled/.test(html));
check('the page signs itself', /jonathansolvesproblems\.com/.test(html));
const script = /src="\.?\/?(assets\/index-[\w-]+\.js)"/.exec(html)?.[1];
check('the app script is named in the page', script != null, script ?? 'none');
// Vite splits shared code into chunks the page preloads; a claim about the code is checked against all of them.
const chunks = [...new Set([...html.matchAll(/(assets\/[\w-]+\.js)/g)].map((m) => m[1]))];

const version = await get('version.json');
check('version.json is served', version.status === 200 && /json/.test(version.type), `${version.status}`);
let build = null;
try {
  build = JSON.parse(version.text()).build;
} catch {
  // reported below
}
check('version.json names a build', typeof build === 'string' && build.length > 4, String(build));

if (script) {
  const bundle = await get(script);
  check('the app script is served', bundle.status === 200, `${bundle.status}, ${(bundle.bytes / 1e6).toFixed(2)} MB`);
  check('the app script is under 3 MB', bundle.bytes < 3_000_000, `${(bundle.bytes / 1e6).toFixed(2)} MB`);
  const source = bundle.text();
  check('the served script carries the same build as version.json', build != null && source.includes(`"${build}"`));
  let everything = source;
  for (const chunk of chunks) if (chunk !== script) everything += (await get(chunk)).text();
  check('the voice words include the directing words', /mexican standoff/.test(everything) && /shootout/.test(everything), `${chunks.length} chunks`);
  check('the icon library is not in any chunk', !/CircleAlertIcon|AlarmClockIcon/.test(everything));
}

const panel = await get('ui/controls.uikitml');
check('the headset panel is served', panel.status === 200);
const panelText = panel.text();
for (const id of ['btn-snap', 'btn-record', 'btn-voice', 'btn-life', 'tab-assets', 'btn-find-table', 'btn-more', 'btn-shelf-more', 'btn-undo', 'btn-inside']) {
  check(`the panel has ${id}`, panelText.includes(`id="${id}"`));
}
// A second element with the same id is never found, so its button does nothing.
const ids = [...panelText.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const twice = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
check('every panel element id is used once', twice.length === 0, twice.join(', '));

// The set designer: the page asks it, the server has its key, and other sites are refused.
check('the page has the Shot box and three shots to try', /id="page-ask"/.test(html) && (html.match(/class="shot-try"/g) ?? []).length === 3);
const designer = await get('api/director');
let ready = null;
try {
  ready = JSON.parse(designer.text()).ready;
} catch {
  // reported below
}
check('the set designer answers and has its key', designer.status === 200 && ready === true, `${designer.status}, ready ${ready}`);
const foreign = await fetch(new URL('api/director', base), {
  method: 'POST',
  headers: { origin: 'https://example.com', 'content-type': 'application/json' },
  body: JSON.stringify({ said: 'a horse in a field', set: '' }),
});
check('another site is refused by the set designer', foreign.status === 403, `${foreign.status}`);
// One real sentence, from the site's own address: the plan streams back. About 7 cents of the key's budget.
{
  const started = Date.now();
  const asked = await fetch(new URL('api/director', base), {
    method: 'POST',
    headers: { origin: new URL(base).origin, 'content-type': 'application/json' },
    body: JSON.stringify({ said: 'a horse in a field at dawn', set: 'Nothing is on the set.', heard: [] }),
  });
  const text = asked.status === 200 ? await asked.text() : '';
  const events = text.split('\n').filter((line) => line.trim() !== '').map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return {};
    }
  });
  const end = events.find((event) => event.t === 'end');
  let plan = null;
  try {
    plan = JSON.parse(events.filter((event) => event.t === 'd').map((event) => event.s).join(''));
  } catch {
    // reported below
  }
  check(
    'a sentence comes back as a set with a horse in it',
    asked.status === 200 && end?.stop === 'end_turn' && Array.isArray(plan?.things) && plan.things.some((thing) => thing.id === 'Horse'),
    `${asked.status}, ${end?.stop ?? 'no end'}, first piece of the reply at ${end?.firstMs ?? '?'} ms, whole ${Date.now() - started} ms`,
  );
}

for (const font of ['BigShoulders-Medium', 'BigShoulders-Bold', 'BigShouldersStencil-Bold', 'BigShouldersStencil-Black', 'SchibstedGrotesk-Medium', 'SchibstedGrotesk-SemiBold']) {
  const info = await get(`ui/fonts/baked/${font}.json`);
  let pages = [];
  try {
    pages = JSON.parse(info.text()).pages;
  } catch {
    // reported below
  }
  const png = pages[0] ? await get(`ui/fonts/baked/${pages[0]}`) : { status: 0 };
  check(`baked type ${font} is served with its page`, info.status === 200 && png.status === 200, `${info.status}/${png.status}`);
}

const scene = await get('scenes/main.iwsdk.scene.json');
check('the scene file is served', scene.status === 200 && scene.text().includes('"Camera'));

for (const [path, what] of [['voice/recogniser.js', 'the recogniser'], ['og.png', 'the preview image'], ['icon.svg', 'the icon'], ['art/figure.webp', 'the loading card drawing'], ['audio/clap.wav', 'the clap']]) {
  const r = await get(path);
  check(`${what} is served`, r.status === 200 && r.bytes > 100, `${r.status}, ${r.bytes} bytes`);
}
const model = await get('voice/vosk-model-small-en-us-0.15.bin');
check('the voice model is served, 40 to 45 MB', model.status === 200 && model.bytes > 40_000_000 && model.bytes < 45_000_000, `${model.status}, ${(model.bytes / 1e6).toFixed(1)} MB`);

const missing = await get('no-such-page');
check('a wrong address is a 404, not a soft 200', missing.status === 404, `${missing.status}`);

const passed = results.filter((r) => r.ok).length;
const lines = [
  '# Live site checks',
  '',
  `Run on ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC against ${base} by \`node tools/check-live.mjs\`. Build served: ${build ?? 'unknown'}.`,
  '',
  `**${passed} of ${results.length} passed.**`,
  '',
  '| Check | Result | Detail |',
  '|---|---|---|',
  ...results.map((r) => `| ${r.name} | ${r.ok ? 'pass' : 'FAIL'} | ${r.detail.replace(/\|/g, '/')} |`),
  '',
];
mkdirSync('devpost/checks', { recursive: true });
writeFileSync('devpost/checks/last-run.md', lines.join('\n'));
console.log(`\n${passed} of ${results.length} passed. Written to devpost/checks/last-run.md`);
if (passed !== results.length) process.exit(1);
