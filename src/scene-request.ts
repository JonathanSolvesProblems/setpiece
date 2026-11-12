/**
 * A set asked for in words, spoken or typed. The words are read against the
 * asset library and nothing else: a request can only name what is in the kit,
 * and whatever it names that is not there is said back, not invented.
 */
import { assetTitle, SHELF_ASSETS } from './catalog.js';
import { namesIn, parseRequest, speechWords } from './scene-words.js';
import type { Request, Vocab } from './scene-words.js';
import { SCENES } from './scenes.js';
import { asksToAim, stagingFor, stagingWords, withoutStaging } from './scene-stagings.js';
import type { Staging } from './scene-stagings.js';
import { commandIn, commandWords } from './spoken-commands.js';
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

/** The control these words ask for, when they ask for one and not for a blocking: see spoken-commands.ts. */
export const commandFor = (text: string): Command | null => (stagingFor(text, SCENES) != null ? null : commandIn(text, namesIn(text, VOCAB)));

export const understand = (text: string): Spoken => {
  const staging = stagingFor(text, SCENES);
  const request = parseRequest(withoutStaging(text), VOCAB);
  return { request, text, staging, aim: staging == null && asksToAim(text) };
};
