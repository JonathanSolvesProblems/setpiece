/**
 * A set asked for in words, spoken or typed. The words are read against the
 * asset library and nothing else: a request can only name what is in the kit,
 * and whatever it names that is not there is said back, not invented.
 */
import { assetTitle, SHELF_ASSETS } from './catalog.js';
import { parseRequest, speechWords } from './scene-words.js';
import type { Request, Vocab } from './scene-words.js';

export type Spoken = { request: Request; text: string };

const VOCAB: Vocab = SHELF_ASSETS.map((asset) => ({
  label: asset.label,
  title: assetTitle(asset.label),
  shelf: asset.shelf,
  aliases: asset.aliases,
}));

/** The words worth listening for: the library's own names and the few verbs, numbers, colours and sizes around them. */
export const wordsToHear = (): string[] => speechWords(VOCAB);

export const understand = (text: string): Spoken => ({ request: parseRequest(text, VOCAB), text });
