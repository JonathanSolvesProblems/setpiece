/**
 * Coverage: the shots a set designer would shoot to cover a set as it stands, in the order to shoot them, for the app
 * to work through by itself (src/coverage.ts). Pure, so the server (api/director.ts) and the app share it. The
 * camera of each shot is the same object a plan's camera is, read by the same rules (src/director-plan.ts).
 */
import { PLAN_SCHEMA } from './director-plan.js';

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

/** What the designer is asked, after the set and what the director said, instead of a plan. */
export const COVERAGE_ASK = `Do not change the set. Plan its coverage instead: the shots a director would shoot to cover this scene, in the order to shoot them, 4 to 6 of them. Start with a wide that establishes the place, then go closer to what the scene is about: a two-shot, a close-up, a reaction, a low or a high angle where it serves the action. No two shots alike in place, height and lens. For each shot:
- title: its name in three words or fewer ("Wide establishing", "Low on the dragon").
- says: one sentence on what the shot shows, under 80 characters.
- camera: as in a plan, with keep false and look_at the piece the shot is about (its id as the set lists it), placed by the same rules: lens and height for what the shot is about, the lens never inside a piece, nothing between it and the subject.
Reply with the shots only.`;
