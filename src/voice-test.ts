/**
 * The script behind public/voice-test.html: a bare page for trying the voice
 * outside the app. It listens, shows what was heard, and shows the request
 * that parseRequest makes of it. Nothing in the app loads this.
 *
 *   voice-test.html           listens for the library's words only
 *   voice-test.html?open      open dictation, no word list
 *   voice-test.html?coming    adds the pieces that are about to join the library
 */
import { ASSETS } from './catalog.js';
import { parseRequest, speechWords } from './scene-words.js';
import type { Request as SceneRequest, Vocab } from './scene-words.js';
import { Voice } from './voice.js';
import type { VoiceState } from './voice.js';

const COMING: Record<string, string[]> = {
  Cast: ['Dragon', 'Troll', 'Dinosaur', 'Robot', 'Alien', 'Ghost', 'Spider', 'Kraken', 'Horse', 'Wolf'],
  Vehicles: ['Truck', 'Pickup', 'Bus', 'Helicopter', 'Boat', 'Saucer', 'Bicycle', 'Tank'],
  Set: ['Barrier', 'House', 'Bench', 'Cone', 'Dumpster', 'Rock', 'Fence', 'Stairs', 'Door', 'Pillar'],
};

const params = new URLSearchParams(location.search);
const vocab: Vocab = ASSETS.map((asset) => ({ label: asset.label, title: asset.title ?? asset.label, shelf: asset.shelf }));
if (params.has('coming')) {
  for (const [shelf, labels] of Object.entries(COMING)) {
    for (const label of labels) vocab.push({ label, title: label, shelf });
  }
}
const open = params.has('open');

const element = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;
const stateText = element('state');
const progressBar = element('progress') as HTMLProgressElement;
const progressText = element('progress-text');
const heardText = element('heard');
const timingText = element('timing');
const requestText = element('request');

type Run = {
  text: string;
  request: SceneRequest;
  /** From pressing Start to listening: the microphone, and the model when it had to load. */
  readyMs: number;
  /** From the last loud sound at the microphone to the final text. */
  afterSpeechMs: number | null;
  /** How often the download reported, and the last share of the model it reported. */
  progressCalls: number;
  progress: number;
};
const runs: Run[] = [];
const states: VoiceState[] = [];
const errors: string[] = [];
// For a test that drives the page from outside.
(globalThis as Record<string, unknown>).voiceTest = { runs, states, errors };

let pressedAt = 0;
let readyMs = 0;
let progressCalls = 0;
let progress = 0;

const voice = new Voice({
  words: open ? undefined : speechWords(vocab),
  onState(state, detail) {
    states.push(state);
    stateText.textContent = detail ? `${state}: ${detail}` : state;
    if (state === 'error' && detail) errors.push(detail);
    if (state === 'listening') {
      readyMs = Math.round(performance.now() - pressedAt);
      timingText.textContent = `listening ${readyMs} ms after Start`;
    }
  },
  onProgress(fraction) {
    progressCalls++;
    progress = fraction;
    progressBar.value = fraction;
    progressText.textContent = `${Math.round(fraction * 100)} % of the model`;
  },
  onText(text, final) {
    heardText.textContent = text === '' && final ? '(nothing heard)' : text;
    if (!final) return;
    const afterSpeechMs = voice.lastSoundAt > 0 ? Math.round(performance.now() - voice.lastSoundAt) : null;
    const request = parseRequest(text, vocab);
    requestText.textContent = JSON.stringify(request, null, 2);
    timingText.textContent =
      `listening ${readyMs} ms after Start; ` +
      (afterSpeechMs == null ? 'no sound heard' : `final text ${afterSpeechMs} ms after the last sound`);
    runs.push({ text, request, readyMs, afterSpeechMs, progressCalls, progress });
  },
});

element('start').addEventListener('click', () => {
  pressedAt = performance.now();
  progressCalls = 0;
  void voice.start();
});
element('stop').addEventListener('click', () => voice.stop());

element('browser').textContent =
  `can listen: ${Voice.supported()}; cross-origin isolated: ${String(globalThis.crossOriginIsolated)}; ` +
  `SharedArrayBuffer: ${typeof SharedArrayBuffer}; words: ${open ? 'open dictation' : `${speechWords(vocab).length} listed`}`;
