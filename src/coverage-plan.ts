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

/** How a shot is called aloud as the camera goes to it, as a first assistant director would. */
export const shotCall = (index: number, title: string): string => `Shot ${index + 1}. ${title}.`;

/** What the designer is asked, after the set and what the director said, instead of a plan. */
export const COVERAGE_ASK = `Do not change the set. Plan its coverage instead: the shots a director would shoot to cover this scene, in the order to shoot them, 4 to 6 of them. Start with a wide that establishes the place, then go closer to what the scene is about: a two-shot, a close-up, a reaction, a low or a high angle where it serves the action. No two shots alike in place, height and lens. For each shot:
- title: its name in three words or fewer ("Wide establishing", "Low on the dragon").
- says: one sentence on what the shot shows, under 80 characters.
- camera: as in a plan, with keep false and look_at the piece the shot is about (its id as the set lists it), placed by the same rules: lens and height for what the shot is about, the lens never inside a piece, nothing between it and the subject.
Reply with the shots only.`;
