/**
 * The camera of a coverage shot is fitted to its subject by measure (fitShot in src/coverage-plan.ts). These are
 * the shots the designer planned for a night chase on Nov 16 that could not be read on the board (a car door
 * filling a 35 mm frame, the top of an actor's head on a 135 mm), and the cases around them.
 *
 *   node tools/test-coverage-fit.mjs
 */
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';

mkdirSync('tmp/fit', { recursive: true });
await build({ entryPoints: ['src/coverage-plan.ts'], bundle: true, platform: 'node', format: 'esm', outdir: 'tmp/fit', logLevel: 'error' });
const { fitShot } = await import(`../tmp/fit/coverage-plan.js?${Date.now()}`);

const LENSES = [18, 24, 35, 50, 85, 135];
const SENSOR = 20.25;
const STAGE = { x: 3.5, back: 2.4, front: 4 };
const camera = (x, z, height, lens) => ({ keep: false, x, z, height, lens, look_at: 'Subject', look_x: 0, look_y: 0, look_z: 0 });
const far = (shot, subject) => Math.hypot(shot.x - subject.x, shot.z - subject.z, shot.height - subject.y);
// The subject's height and width as shares of the frame's, from where the fitted camera stands.
const fills = (shot, subject) => {
  const frameHeight = (far(shot, subject) * SENSOR) / shot.lens;
  return [subject.up / frameHeight, subject.across / ((frameHeight * 16) / 9)];
};
const fits = (shot, subject) => fills(shot, subject).every((share) => share <= 0.8 + 1e-6);
const inside = (shot) => Math.abs(shot.x) <= STAGE.x + 1e-6 && shot.z <= STAGE.front + 1e-6 && shot.z >= -STAGE.back - 1e-6;

const car = { x: 0.6, y: 0.7, z: 0.2, across: 4.5, up: 1.4 };
const actor = { x: 1.6, y: 1.6, z: 0.9, across: 0.7, up: 0.9 };
const truck = { x: -1.4, y: 1.6, z: -0.9, across: 7.2, up: 3.2 };

let failed = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failed++;
};
const told = (shot, subject) => `${shot.lens} mm from ${far(shot, subject).toFixed(1)} m at x ${shot.x.toFixed(1)}, z ${shot.z.toFixed(1)}; fills ${fills(shot, subject).map((s) => Math.round(s * 100)).join('% and ')}%`;

{
  const asked = camera(0.6, 1.2, 1.0, 35);
  const shot = fitShot(asked, car, SENSOR, LENSES, STAGE);
  check('a car door filling a 35 mm frame from a metre away: the camera stands back and the whole car is in', fits(shot, car) && inside(shot) && shot.z > asked.z && shot.height === asked.height, told(shot, car));
  check('it stays on its own line from the car', Math.abs(shot.x - asked.x) < 1e-6);
}
{
  const asked = camera(1.6, 2.1, 1.6, 135);
  const shot = fitShot(asked, actor, SENSOR, LENSES, STAGE);
  check('an actor on a 135 mm from just over a metre: head to waist is in, from in front as planned', fits(shot, actor) && inside(shot) && shot.z >= asked.z && shot.lens <= 135, told(shot, actor));
}
{
  const asked = camera(1.6, 3.9, 1.6, 85);
  const shot = fitShot(asked, actor, SENSOR, LENSES, STAGE);
  check('a close-up that cannot step back far enough takes the longest lens that holds the actor, not the widest', fits(shot, actor) && shot.lens >= 35 && shot.lens < 85, told(shot, actor));
}
{
  const asked = camera(0, 3.5, 4.1, 18);
  const shot = fitShot(asked, car, SENSOR, LENSES, STAGE);
  check('a wide that already holds its subject is left exactly as planned', shot === asked);
}
{
  const asked = camera(-1.4, 1.0, 0.8, 24);
  const shot = fitShot(asked, truck, SENSOR, LENSES, STAGE);
  check('a low angle hard against a truck goes to the front of the stage and the widest lens: as much of it as the stage allows', inside(shot) && Math.abs(shot.z - STAGE.front) < 1e-6 && shot.lens === 18 && shot.height === 0.8, told(shot, truck));
}
{
  const asked = camera(car.x, car.z, 5, 85);
  const shot = fitShot(asked, car, SENSOR, LENSES, STAGE);
  check('a camera straight above cannot step back: it keeps its place and a lens that holds the car goes on', shot.x === asked.x && shot.z === asked.z && fits(shot, car) && shot.lens < 85, told(shot, car));
}
{
  const asked = camera(3.4, -2.3, 1.2, 85);
  const corner = { x: 2.6, y: 1.0, z: -1.6, across: 2.0, up: 2.0 };
  const shot = fitShot(asked, corner, SENSOR, LENSES, STAGE);
  check('a camera in the back corner never leaves the stage', inside(shot) && shot.lens <= 85, told(shot, corner));
}

{
  // As the app asks for an actor: head and shoulders, and a step back of at most half as far again.
  const face = { x: 1.6, y: 1.6, z: 0.9, across: 0.5, up: 0.6 };
  const asked = camera(1.6, 2.5, 1.6, 85);
  const shot = fitShot(asked, face, SENSOR, LENSES, STAGE, 1.5);
  const stepped = far(shot, face) / far(asked, face);
  check('a close-up stays a close-up: it steps back half as far again at most, then takes a 50 mm, not the far edge of the stage', stepped <= 1.5 + 1e-6 && shot.lens === 50 && shot.z < STAGE.front, told(shot, face));
  const held = fitShot(camera(1.6, 2.5 + 1.6, 1.6, 50), face, SENSOR, LENSES, STAGE, 1.5);
  check('and one that already holds head and shoulders is left as planned', held.lens === 50 && Math.abs(held.z - 4.1) < 1e-6 || held.z === 4);
}

console.log(failed === 0 ? '\nAll coverage fits hold.' : `\n${failed} failed.`);
process.exit(failed === 0 ? 0 : 1);
