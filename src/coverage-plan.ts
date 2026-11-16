/**
 * Coverage: the shots a set designer would shoot to cover a set as it stands, in the order to shoot them, for the app
 * to work through by itself (src/coverage.ts). Pure, so the server (api/director.ts) and the app share it. The
 * camera of each shot is the same object a plan's camera is, read by the same rules (src/director-plan.ts).
 */
import { cleanCamera, PLAN_SCHEMA } from './director-plan.js';
import type { CameraPlan } from './director-plan.js';

/** The most shots in one coverage: a board holds six frames. */
export const MOST_SHOTS = 6;

export const COVERAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shots'],
  properties: {
    shots: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'says', 'camera'],
        properties: {
          title: { type: 'string' },
          says: { type: 'string' },
          camera: PLAN_SCHEMA.properties.camera,
        },
      },
    },
  },
} as const;

export type CoverageShot = { title: string; says: string; camera: CameraPlan };

/** The shots of a reply, read by the plan's own rules: at most MOST_SHOTS, each with a camera that can be placed. */
export function coverageShots(reply: unknown): CoverageShot[] {
  const listed = (reply as { shots?: unknown } | null)?.shots;
  const shots: CoverageShot[] = [];
  for (const raw of Array.isArray(listed) ? listed.slice(0, MOST_SHOTS) : []) {
    const item = raw as { title?: unknown; says?: unknown; camera?: unknown };
    const camera = cleanCamera(item.camera);
    if (camera == null) continue;
    shots.push({
      title: typeof item.title === 'string' ? item.title.slice(0, 32) : 'Shot',
      says: typeof item.says === 'string' ? item.says.slice(0, 110) : '',
      camera: { ...camera, keep: false },
    });
  }
  return shots;
}

/** What a shot is of, in real metres: where its middle (an actor's eyes) is, and how much of it must be in frame. */
export type Subject = { x: number; y: number; z: number; across: number; up: number };

/** The subject takes at most this much of the frame's height or width. */
const FILL = 0.8;
/** The frame's width over its height. */
const ASPECT = 16 / 9;

/**
 * A coverage shot is not looked at through the lens the way a new set's frame is, so its framing is checked by
 * measure: the subject must fit the frame. The designer plans from a list of pieces, and stood close with a long
 * lens it filled a frame with a car door, or with the top of an actor's head. The camera keeps its direction and
 * its height. It steps back along its own line as far as the stage allows; if the subject still does not fit, the
 * longest lens that holds it goes on. A shot that already fits is returned as it was.
 */
export function fitShot(
  camera: CameraPlan,
  subject: Subject,
  sensorHeightMm: number,
  lenses: readonly number[],
  stage: { x: number; back: number; front: number },
): CameraPlan {
  // How far a lens must stand from the subject to hold it.
  const needed = (lens: number): number => Math.max((subject.up * lens) / (FILL * sensorHeightMm), (subject.across * lens) / (FILL * sensorHeightMm * ASPECT));
  const dx = camera.x - subject.x;
  const dz = camera.z - subject.z;
  const dy = camera.height - subject.y;
  const flat = Math.hypot(dx, dz);
  const need = needed(camera.lens);
  if (Math.hypot(flat, dy) >= need) return camera;
  let x = camera.x;
  let z = camera.z;
  if (flat > 1e-3 && need > Math.abs(dy)) {
    // Back along the line from the subject through the camera, no further than the stage lets a camera stand.
    let reach = Math.sqrt(need * need - dy * dy) / flat;
    if (dx > 0) reach = Math.min(reach, (stage.x - subject.x) / dx);
    if (dx < 0) reach = Math.min(reach, (-stage.x - subject.x) / dx);
    if (dz > 0) reach = Math.min(reach, (stage.front - subject.z) / dz);
    if (dz < 0) reach = Math.min(reach, (-stage.back - subject.z) / dz);
    reach = Math.max(1, reach);
    x = subject.x + dx * reach;
    z = subject.z + dz * reach;
  }
  const far = Math.hypot(Math.hypot(x - subject.x, z - subject.z), dy);
  // The longest lens, no longer than the one asked for, that holds the subject from there; the widest if none does.
  let lens = Math.min(...lenses);
  for (const mm of lenses) if (mm <= camera.lens && mm > lens && needed(mm) <= far) lens = mm;
  return { ...camera, x, z, lens };
}

/** How a shot is called aloud as the camera goes to it, as a first assistant director would. */
export const shotCall = (index: number, title: string): string => `Shot ${index + 1}. ${title}.`;

/** What the designer is asked, after the set and what the director said, instead of a plan. */
export const COVERAGE_ASK = `Do not change the set. Plan its coverage instead: the shots a director would shoot to cover this scene, in the order to shoot them, 4 to 6 of them. Start with a wide that establishes the place, then go closer to what the scene is about: a two-shot, a close-up, a reaction, a low or a high angle where it serves the action. No two shots alike in place, height and lens. For each shot:
- title: its name in three words or fewer ("Wide establishing", "Low on the dragon").
- says: one sentence on what the shot shows, under 80 characters.
- camera: as in a plan, with keep false and look_at the piece the shot is about (its id as the set lists it), placed by the same rules: lens and height for what the shot is about, the lens never inside a piece, nothing between it and the subject. Stand far enough back that the subject fits the frame: a close-up of an actor is head and shoulders from in front of them, never tighter; a vehicle, a creature or a made piece is seen whole.
Reply with the shots only.`;
