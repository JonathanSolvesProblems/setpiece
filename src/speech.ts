/**
 * The set designer's voice. Two kinds of line share one queue, so the voice never talks over itself:
 *
 * - what the designer wrote about a set it built or a frame it changed, read aloud by ElevenLabs as it arrives
 *   (api/speak.ts), heard while the pieces go down;
 * - the lines it says the same way every time (src/spoken-lines.ts): the call sheet's steps, once each for a
 *   newcomer. Those were recorded ahead of time and are plain files, so they need no server and no allowance.
 *
 * Her voice by default; his, or none, from the panel's SPOKEN row. Only the latest few lines are kept, and a
 * recorded line gives way first, so the voice never runs behind the set. A new sentence from the wearer hushes
 * whatever was being said about the last one. If the server has no voice (no key, the allowance spent) it stops
 * asking for the rest of the visit; the recorded lines still play, and the panel says it all anyway.
 */
import { loadJson, saveJson, StoreKey } from './store.js';
import type { LineKey } from './spoken-lines.js';

export type Spoken = 'her' | 'him' | 'off';
export const SPOKEN: readonly Spoken[] = ['her', 'him', 'off'];

type Waiting = { text: string; pass: string } | { line: LineKey };

/** Lines kept waiting behind the one being said. */
const MOST_WAITING = 3;
/** The room goes on ringing a moment after a line ends: the microphone is not reopened into it. */
const TAIL_MS = 450;

let unavailable = false;
let speaking = false;
let playing: HTMLAudioElement | null = null;
/** The line on its way from the server, so a hush stops it there too. */
let fetching: AbortController | null = null;
/** Counts hushes: a line fetched before one is not played after it. */
let hushes = 0;
let endedAt = -TAIL_MS;
const waiting: Waiting[] = [];
const saidOnce = new Set<LineKey>();
/** The microphone is open, or opening: nothing is said until it shuts. */
let listening = false;

/**
 * The microphone opens or shuts. While it is open the voice stops and takes no new line, so the designer is never
 * heard as part of the wearer's sentence; a line that arrives meanwhile is on the panel.
 */
export function micOpen(on: boolean): void {
  listening = on;
  if (on) hush();
}

/** Whose voice the replies are in, as the wearer last chose. */
export function spokenChoice(): Spoken {
  const chosen = loadJson<{ spoken?: string }>(StoreKey.Settings)?.spoken;
  return chosen === 'him' || chosen === 'off' ? chosen : 'her';
}

export function chooseSpoken(choice: Spoken): void {
  saveJson(StoreKey.Settings, { ...(loadJson<Record<string, unknown>>(StoreKey.Settings) ?? {}), spoken: choice });
  // Whatever was being said in the old voice stops; the new one starts clean.
  hush();
}

/** The voice is talking, about to, or only just stopped: not the moment to open the microphone. */
export function talking(): boolean {
  return speaking || waiting.length > 0 || performance.now() - endedAt < TAIL_MS;
}

/**
 * Say this line the designer wrote, after any being said now. The pass is the server's signature on the line
 * (it arrives with the reply): the voice reads nothing without one.
 */
export function speak(line: string, pass: string): void {
  const text = line.trim();
  if (unavailable || text === '' || pass === '' || spokenChoice() === 'off') return;
  // The tests on this machine build hundreds of sets; they would spend the voice's monthly allowance in a day.
  if (location.hostname === 'localhost' && !location.search.includes('speak')) return;
  queue({ text, pass });
}

/** Say one of the recorded lines, after any being said now. */
export function sayLine(line: LineKey): void {
  if (spokenChoice() === 'off') return;
  queue({ line });
}

/** Say a recorded line the first time it is asked for in this visit, and not again. */
export function sayLineOnce(line: LineKey): void {
  if (saidOnce.has(line)) return;
  saidOnce.add(line);
  sayLine(line);
}

function queue(item: Waiting): void {
  if (listening) return;
  waiting.push(item);
  // Too many waiting: a recorded line gives way before one the designer wrote; failing that, the oldest goes.
  while (waiting.length > MOST_WAITING) {
    const recorded = waiting.findIndex((other) => 'line' in other);
    waiting.splice(recorded >= 0 && recorded < waiting.length - 1 ? recorded : 0, 1);
  }
  if (!speaking) void sayAll();
}

/** Stop talking and forget what was waiting. */
export function hush(): void {
  hushes++;
  waiting.length = 0;
  fetching?.abort();
  playing?.pause();
}

async function sayAll(): Promise<void> {
  speaking = true;
  try {
    for (let item = waiting.shift(); item != null; item = waiting.shift()) {
      const voice = spokenChoice();
      if (voice === 'off') break;
      const turn = hushes;
      let url = '';
      let made = false;
      if ('line' in item) {
        url = `./audio/voice/${voice}/${item.line}.mp3`;
      } else {
        if (unavailable) continue;
        try {
          fetching = new AbortController();
          const response = await fetch('/api/speak', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ text: item.text, voice, pass: item.pass }),
            signal: fetching.signal,
          });
          if (!response.ok) {
            const answer = (await response.json().catch(() => ({}))) as { off?: boolean };
            if (answer.off === true) unavailable = true;
            continue;
          }
          url = URL.createObjectURL(await response.blob());
          made = true;
        } catch {
          // The line did not arrive whole, or was hushed on its way: the panel has the words.
          continue;
        } finally {
          fetching = null;
        }
      }
      // Hushed, or switched off, while it was on its way: it is not said after all.
      if (turn !== hushes || spokenChoice() === 'off') {
        if (made) URL.revokeObjectURL(url);
        continue;
      }
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
        // The browser would not play it (no gesture yet, or the file is missing): the panel has the words.
      } finally {
        playing = null;
        endedAt = performance.now();
        if (made) URL.revokeObjectURL(url);
      }
    }
  } finally {
    speaking = false;
  }
}
