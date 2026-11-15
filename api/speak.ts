/**
 * The set designer's voice. One short line the designer wrote (what it built, or what it changed through the lens)
 * is read aloud by ElevenLabs and sent back as audio, so the wearer hears the reply while the pieces go down.
 * Only the designer's own words are sent: never the wearer's voice, never what they said. Two of ElevenLabs' own
 * voices, hers by default and his if the wearer asks for it.
 *
 * Without a key, or once the account's allowance is spent, it answers { off: true } and the headset stays quiet,
 * with the reply still on the panel.
 */
const KEY = (): string => process.env.ELEVENLABS_API_KEY ?? '';
/** ElevenLabs' premade voices: Sarah (calm, confident) and Eric (smooth, trustworthy). */
const VOICES: Record<string, string> = { her: 'EXAVITQu4vr4xnSDxMaL', him: 'cjVigY5qzO86Huf0OWal' };
/** The quickest of ElevenLabs' models to start speaking. */
const MODEL = 'eleven_flash_v2_5';
/** A designer's line is a sentence or two; anything longer is cut at a word. */
const LONGEST = 240;
/** Per visitor, this many lines in this many minutes; across everyone this instance answers, this many a minute. */
const PER_VISITOR = 40;
const WINDOW_MS = 10 * 60 * 1000;
const PER_MINUTE = 60;
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
  if (tooMany(visitor)) return quiet(429, false);
  let asked: { text?: unknown; voice?: unknown };
  try {
    asked = (await request.json()) as { text?: unknown; voice?: unknown };
  } catch {
    return quiet(400, false);
  }
  let text = typeof asked.text === 'string' ? asked.text.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (text.length > LONGEST) text = text.slice(0, text.lastIndexOf(' ', LONGEST) > 0 ? text.lastIndexOf(' ', LONGEST) : LONGEST);
  if (text === '') return quiet(400, false);
  const voice = VOICES[typeof asked.voice === 'string' ? asked.voice : 'her'] ?? VOICES.her;
  let upstream: Response;
  try {
    upstream = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/stream?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
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
