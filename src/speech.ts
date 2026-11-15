/**
 * The set designer's replies, read aloud (api/speak.ts): what it built, and what it changed through the lens, heard
 * while the pieces go down. Her voice by default; his, or none, from the panel's SPOKEN row or by asking. Lines
 * wait their turn and only the latest two are kept, so the voice never runs behind the set. If the server has no
 * voice (no key, the allowance spent) it stops asking for the rest of the visit; the panel says it all anyway.
 */
import { loadJson, saveJson, StoreKey } from './store.js';

export type Spoken = 'her' | 'him' | 'off';
export const SPOKEN: readonly Spoken[] = ['her', 'him', 'off'];

let unavailable = false;
let speaking = false;
let playing: HTMLAudioElement | null = null;
const waiting: string[] = [];

/** Whose voice the replies are in, as the wearer last chose. */
export function spokenChoice(): Spoken {
  const chosen = loadJson<{ spoken?: string }>(StoreKey.Settings)?.spoken;
  return chosen === 'him' || chosen === 'off' ? chosen : 'her';
}

export function chooseSpoken(choice: Spoken): void {
  saveJson(StoreKey.Settings, { ...(loadJson<Record<string, unknown>>(StoreKey.Settings) ?? {}), spoken: choice });
  if (choice === 'off') hush();
}

/** Say this line, after any being said now. */
export function speak(line: string): void {
  const text = line.trim();
  if (unavailable || text === '' || spokenChoice() === 'off') return;
  // The tests on this machine build hundreds of sets; they would spend the voice's monthly allowance in a day.
  if (location.hostname === 'localhost' && !location.search.includes('speak')) return;
  waiting.push(text);
  while (waiting.length > 2) waiting.shift();
  if (!speaking) void sayAll();
}

/** Stop talking and forget what was waiting. */
export function hush(): void {
  waiting.length = 0;
  playing?.pause();
}

async function sayAll(): Promise<void> {
  speaking = true;
  try {
    for (let text = waiting.shift(); text != null && !unavailable; text = waiting.shift()) {
      const voice = spokenChoice();
      if (voice === 'off') break;
      let response: Response;
      try {
        response = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, voice }) });
      } catch {
        continue;
      }
      if (!response.ok) {
        const answer = (await response.json().catch(() => ({}))) as { off?: boolean };
        if (answer.off === true) unavailable = true;
        continue;
      }
      const url = URL.createObjectURL(await response.blob());
      try {
        const audio = new Audio(url);
        playing = audio;
        await audio.play();
        await new Promise<void>((done) => {
          audio.onended = () => done();
          audio.onerror = () => done();
          audio.onpause = () => done();
        });
      } catch {
        // The browser would not play it (no gesture yet): the panel has the words.
      } finally {
        playing = null;
        URL.revokeObjectURL(url);
      }
    }
  } finally {
    speaking = false;
  }
}
