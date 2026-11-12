/**
 * A set asked for in words, spoken or typed. The words are read against the
 * asset library and nothing else: a request can only name what is in the kit,
 * and whatever it names that is not there is said back, not invented.
 */
import { assetTitle, SHELF_ASSETS } from './catalog.js';
import { namesIn, parseRequest, speechWords, wordsOf } from './scene-words.js';
import type { Request, Vocab } from './scene-words.js';
import { SCENES } from './scenes.js';
import { asksToAim, stagingFor, stagingWords, withoutStaging } from './scene-stagings.js';
import type { Staging } from './scene-stagings.js';
import { commandIn, commandWords, partsIn } from './spoken-commands.js';
import type { Command } from './spoken-commands.js';

export type Spoken = { request: Request; text: string; staging: Staging | null; aim: boolean };

const VOCAB: Vocab = SHELF_ASSETS.map((asset) => ({
  label: asset.label,
  title: assetTitle(asset.label),
  shelf: asset.shelf,
  aliases: asset.aliases,
}));

/** The words worth listening for: the library's own names and the few verbs, numbers, colours and sizes around them. */
export const wordsToHear = (): string[] => [
  ...new Set([...speechWords(VOCAB), ...stagingWords(), ...SCENES.map((scene) => scene.title.toLowerCase()), ...commandWords()]),
];

/** The control these words ask for, when they ask for one and nothing else: see spoken-commands.ts. */
const control = (words: string[]): Command | null => commandIn(words, namesIn(words, VOCAB));

/** One thing a sentence asks for: a control, or words left for the scene reader. */
export type Part = { text: string; command: Command | null };

/**
 * What a sentence asks for, in the order it was said: see partsIn in spoken-commands.ts. A
 * blocking named in the words is always one request, and a sentence with no control in it goes
 * to the scene reader exactly as it was said.
 */
export function partsOf(text: string): Part[] {
  if (stagingFor(text, SCENES) != null) return [{ text, command: null }];
  const parts = partsIn(wordsOf(text), control);
  if (parts.length === 1 && parts[0].command == null) return [{ text, command: null }];
  return parts.map((part) => ({ text: part.words.join(' '), command: part.command }));
}

export const understand = (text: string): Spoken => {
  const staging = stagingFor(text, SCENES);
  const request = parseRequest(withoutStaging(text), VOCAB);
  return { request, text, staging, aim: staging == null && asksToAim(text) };
};
