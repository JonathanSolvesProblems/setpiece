/**
 * A pass for the designer's voice. The voice (api/speak.ts) reads aloud only lines the set designer wrote: as the
 * designer's reply streams out (api/director.ts), the server signs the line that will be spoken and sends the pass
 * with it; the headset shows the pass with the line, and a line with no pass, an old pass or other words is not
 * read. So the voice cannot be used to read arbitrary text on this project's allowance, whatever page asks.
 *
 * Not a function of its own: the underscore keeps it out of the deployed routes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

/** A spoken line is a sentence or two; anything longer is cut at a word. */
export const LONGEST = 160;
/** A pass is good for this long: a line is spoken within seconds of being written, a coverage's calls within a minute. */
const VALID_MS = 5 * 60 * 1000;

/** The line as it is read and signed: printable ASCII, single spaces, cut at a word. */
export function spokenText(raw: unknown): string {
  let text = typeof raw === 'string' ? raw.replace(/[^\x20-\x7e]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (text.length > LONGEST) text = text.slice(0, text.lastIndexOf(' ', LONGEST) > 0 ? text.lastIndexOf(' ', LONGEST) : LONGEST);
  return text;
}

/** The secret is the voice's own key, which only the server holds: no voice here, no passes. */
const secret = (): string => process.env.ELEVENLABS_API_KEY ?? '';
const mac = (until: number, text: string): string => createHmac('sha256', `setpiece voice ${secret()}`).update(`${until}\n${text}`).digest('base64url');

/** A pass for this line, or '' when there is no voice here or nothing to say. */
export function passFor(raw: unknown): string {
  const text = spokenText(raw);
  if (secret() === '' || text === '') return '';
  const until = Date.now() + VALID_MS;
  return `${until}.${mac(until, text)}`;
}

/** Whether this pass was made here, for exactly these words, and is still good. */
export function passHolds(pass: unknown, text: string): boolean {
  if (typeof pass !== 'string' || secret() === '' || text === '') return false;
  const dot = pass.indexOf('.');
  const until = Number(pass.slice(0, dot));
  if (dot <= 0 || !Number.isFinite(until) || until < Date.now()) return false;
  const given = Buffer.from(pass.slice(dot + 1));
  const right = Buffer.from(mac(until, text));
  return given.length === right.length && timingSafeEqual(given, right);
}
