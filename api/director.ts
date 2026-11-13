/**
 * The set designer: a Vercel function that takes what the director said and the set as it stands, asks
 * Claude for the set and the shot, and streams the reply back as it is written, so the headset can put
 * pieces down while the rest is still coming. The key stays here; the headset never sees it.
 *
 * Reply: one JSON object per line. {"t":"d","s":"..."} carries the next piece of the plan's text;
 * {"t":"end",...} closes it with how it went; {"t":"error","m":"..."} says why there is no plan.
 */
import Anthropic from '@anthropic-ai/sdk';
import { PLAN_SCHEMA } from '../src/director-plan.js';
import { directorSystem } from '../src/director-prompt.js';

declare const process: { env: Record<string, string | undefined> };

const MODEL = process.env.DIRECTOR_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.DIRECTOR_EFFORT || 'low') as 'low' | 'medium' | 'high';
/** Room for a full set with a few new pieces in it. */
const MAX_TOKENS = 8000;
/** The longest sentence and set description taken in, in characters. */
const LONGEST_SAID = 400;
const LONGEST_SET = 6000;
/** The camera's picture, when the designer is asked to look through the lens: a small JPEG, base64. */
const LARGEST_IMAGE = 400_000;
/** What the designer is asked when it is shown the camera's picture. */
const LOOK = `This picture is what the shot camera sees now, through its lens. Look at it as the director of photography, against what the director asked for.
- If the subject is cut off, too small, hidden behind something, or the angle does not match what was asked, set camera.keep to false and give a better camera. Move a piece only if it blocks the shot, and list only that piece.
- If the frame already works, set camera.keep to true and list no things.
- fresh is false. remove is empty.
- In says, name what you changed in the frame in a few words, or say the frame holds.`;
/** Per visitor: this many plans in this many minutes. A spend limit on the key is the real cap. */
const PER_VISITOR = 30;
const WINDOW_MS = 10 * 60 * 1000;
const ALLOWED = [
  /^https:\/\/setpiece\.jonathansolvesproblems\.com$/,
  /^https:\/\/setpiece(-[a-z0-9-]+)?\.vercel\.app$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  /^https:\/\/192\.168\.\d+\.\d+(:\d+)?$/,
];

const seen = new Map<string, number[]>();

function tooMany(visitor: string): boolean {
  const now = Date.now();
  const times = (seen.get(visitor) ?? []).filter((at) => now - at < WINDOW_MS);
  if (times.length >= PER_VISITOR) {
    seen.set(visitor, times);
    return true;
  }
  times.push(now);
  seen.set(visitor, times);
  if (seen.size > 5000) seen.clear();
  return false;
}

const refuse = (status: number, message: string): Response =>
  new Response(JSON.stringify({ t: 'error', m: message }) + '\n', { status, headers: { 'content-type': 'application/x-ndjson' } });

type Asked = { said?: unknown; heard?: unknown; set?: unknown; image?: unknown };

/** What the designer is asked: the set as it stands, then the words, with the recogniser's other guesses. */
function question(asked: Asked): string | null {
  const said = typeof asked.said === 'string' ? asked.said.trim().slice(0, LONGEST_SAID) : '';
  if (said === '') return null;
  const set = typeof asked.set === 'string' ? asked.set.slice(0, LONGEST_SET) : '';
  const others = Array.isArray(asked.heard)
    ? asked.heard.filter((guess): guess is string => typeof guess === 'string' && guess.trim() !== '' && guess.trim() !== said).slice(0, 3)
    : [];
  return [
    '<set>',
    set.trim() === '' ? 'The set is empty except for the camera.' : set.trim(),
    '</set>',
    '',
    `The director said: "${said}"`,
    others.length > 0 ? `The recogniser's other guesses: ${others.map((guess) => `"${guess.slice(0, LONGEST_SAID)}"`).join('; ')}` : '',
  ]
    .filter((line, i, all) => line !== '' || (i > 0 && all[i - 1] !== ''))
    .join('\n');
}

/** Whether the set designer can be asked here: the headset asks once, and uses the library's reader if not. */
export function GET(): Response {
  return new Response(JSON.stringify({ ready: Boolean(process.env.ANTHROPIC_API_KEY) }), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

export async function POST(request: Request): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  if (!ALLOWED.some((pattern) => pattern.test(origin))) return refuse(403, 'This set designer only works inside Setpiece.');
  if (!process.env.ANTHROPIC_API_KEY) return refuse(503, 'The set designer has no key on this server.');
  const visitor = (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'local';
  if (tooMany(visitor)) return refuse(429, 'That is a lot of sets in a few minutes. Give it a moment.');
  let asked: Asked;
  try {
    asked = (await request.json()) as Asked;
  } catch {
    return refuse(400, 'The request could not be read.');
  }
  const text = question(asked);
  if (text == null) return refuse(400, 'Nothing was said.');
  // Shown the camera's picture, the designer looks through the lens and keeps or fixes the frame.
  const image = typeof asked.image === 'string' && asked.image.length <= LARGEST_IMAGE && /^[A-Za-z0-9+/=]+$/.test(asked.image) ? asked.image : null;
  const content: Anthropic.Beta.BetaContentBlockParam[] | string =
    image == null
      ? text
      : [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
          { type: 'text', text: `${text}

${LOOK}` },
        ];

  const client = new Anthropic();
  const started = Date.now();
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Record<string, unknown>): void => controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'));
      let first = 0;
      try {
        const stream = client.beta.messages.stream({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          // A refused request is run again on the model the API picks for that kind of refusal.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          system: [{ type: 'text', text: directorSystem(), cache_control: { type: 'ephemeral', ttl: '1h' } }],
          messages: [{ role: 'user', content }],
          output_config: { effort: EFFORT, format: { type: 'json_schema', schema: PLAN_SCHEMA as unknown as Record<string, unknown> } },
        });
        stream.on('text', (delta) => {
          if (first === 0) first = Date.now() - started;
          send({ t: 'd', s: delta });
        });
        const message = await stream.finalMessage();
        send({
          t: 'end',
          stop: message.stop_reason,
          model: message.model,
          firstMs: first,
          ms: Date.now() - started,
          usage: {
            input: message.usage.input_tokens,
            cacheRead: message.usage.cache_read_input_tokens ?? 0,
            cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
            output: message.usage.output_tokens,
          },
        });
      } catch (error) {
        const status = error instanceof Anthropic.APIError ? error.status : undefined;
        const message =
          status === 429 || status === 529
            ? 'The set designer is busy. Try again in a moment.'
            : status === 401 || status === 403
              ? 'The set designer cannot sign in.'
              : 'The set designer could not be reached.';
        send({ t: 'error', m: message, status: status ?? null, detail: process.env.DIRECTOR_DEBUG ? String(error) : undefined });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, { headers: { 'content-type': 'application/x-ndjson', 'cache-control': 'no-store' } });
}
