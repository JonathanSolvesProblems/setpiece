/**
 * The set designer's voice. One short line the designer wrote (what it built, or what it changed through the lens)
 * is read aloud by ElevenLabs and sent back as audio, so the wearer hears the reply while the pieces go down.
 * Only the designer's reply is sent: never the wearer's voice, and never the transcript of what they said (the
 * reply describes the set they asked for, so it can name what they named). Two of ElevenLabs' own voices, hers by
 * default and his if the wearer asks for it.
 *
 * It reads nothing else: each line arrives with a pass the server signed as the designer wrote it (api/_voice.ts),
 * and words without their pass are refused, so the voice cannot be borrowed to read other text.
 *
 * Without a key, or once the account's allowance is spent, it answers { off: true } and the headset stays quiet,
 * with the reply still on the panel.
 */
import { passHolds, spokenText } from './_voice.js';

const KEY = (): string => process.env.ELEVENLABS_API_KEY ?? '';
/** ElevenLabs' premade voices: Sarah (calm, confident) and Eric (smooth, trustworthy). */
const VOICES: Record<string, string> = { her: 'EXAVITQu4vr4xnSDxMaL', him: 'cjVigY5qzO86Huf0OWal' };
/** The quickest of ElevenLabs' models to start speaking. */
const MODEL = 'eleven_flash_v2_5';
/** Per visitor, this many lines in this many minutes; across everyone this instance answers, this many a minute. */
const PER_VISITOR = 40;
const WINDOW_MS = 10 * 60 * 1000;
const PER_MINUTE = 30;
/** The site's own addresses. A development server on this machine or the home network is allowed only off production. */
const SITE = new Set(['https://setpiece.jonathansolvesproblems.com', 'https://setpiece-xr.vercel.app', 'https://setpiece-kohl.vercel.app']);
const DEVELOPMENT = [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/, /^https:\/\/192\.168\.\d+\.\d+(:\d+)?$/];
const allowed = (origin: string): boolean =>
  SITE.has(origin) || (process.env.VERCEL_ENV !== 'production' && DEVELOPMENT.some((pattern) => pattern.test(origin)));

const seen = new Map<string, number[]>();
const everyone: number[] = [];

function tooMany(visitor: string): boolean {
  const now = Date.now();
  while (everyone.length > 0 && now - everyone[0] > 60_000) everyone.shift();
  if (everyone.length >= PER_MINUTE) return true;
  const times = (seen.get(visitor) ?? []).filter((at) => now - at < WINDOW_MS);
  if (times.length >= PER_VISITOR) {
    seen.set(visitor, times);
    return true;
  }
  times.push(now);
  everyone.push(now);
  seen.set(visitor, times);
  if (seen.size > 5000) seen.clear();
  return false;
}

const quiet = (status: number, off: boolean): Response =>
  new Response(JSON.stringify({ off }), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

/** Whether the designer can speak here. */
export function GET(): Response {
  return new Response(JSON.stringify({ ready: Boolean(KEY()) }), { headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request.headers.get('origin') ?? '')) return quiet(403, true);
  if (!(request.headers.get('content-type') ?? '').startsWith('application/json')) return quiet(415, false);
  const key = KEY();
  if (!key) return quiet(503, true);
  const visitor =
    request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip')?.trim() ||
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() ||
    'local';
  let asked: { text?: unknown; voice?: unknown; pass?: unknown };
  try {
    asked = (await request.json()) as { text?: unknown; voice?: unknown; pass?: unknown };
  } catch {
    return quiet(400, false);
  }
  const text = spokenText(asked.text);
  if (text === '') return quiet(400, false);
  // Only a line the set designer wrote is read: it arrives with the pass the server signed it with (api/_voice.ts).
  // Checked before the turns are counted, so words without a pass cannot use up the turns of real wearers.
  if (!passHolds(asked.pass, text)) return quiet(403, false);
  if (tooMany(visitor)) return quiet(429, false);
  const voice = VOICES[typeof asked.voice === 'string' ? asked.voice : 'her'] ?? VOICES.her;
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      // A line the headset no longer wants (hushed, or a new sentence) is not read to the end.
      signal: request.signal,
    });
  } catch {
    return quiet(502, false);
  }
  if (!upstream.ok || upstream.body == null) {
    // A spent allowance or a refused key will not come right during this visit: the headset stops asking.
    const detail = await upstream.text().catch(() => '');
    // Too many at once (the free tier allows two) is only this line: the next one is asked as usual.
    const spent = upstream.status === 401 || upstream.status === 402 || /quota_exceeded|insufficient|exceeds your quota/i.test(detail);
    return quiet(spent ? 503 : 502, spent);
  }
  return new Response(upstream.body, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'no-store' } });
}
