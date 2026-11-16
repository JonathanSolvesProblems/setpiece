/**
 * A visitor's own Anthropic key. The site's key answers by default, so nobody has to enter anything; someone who
 * wants to build past its limits can put their own key in on the page. It is kept in this browser only, sent with
 * their requests to this site's server function, which passes it to Anthropic for that request and does not store
 * or log it (api/director.ts).
 */
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

const SHAPE = /^sk-ant-[A-Za-z0-9_-]{20,240}$/;

export const ownKey = (): string => {
  const key = loadJson<string>(StoreKey.OwnKey);
  return typeof key === 'string' && SHAPE.test(key) ? key : '';
};

/** Keeps the key, or forgets it when given nothing. False when it is not the shape of a key. */
export function keepOwnKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed === '') {
    clearKey(StoreKey.OwnKey);
    return true;
  }
  if (!SHAPE.test(trimmed)) return false;
  saveJson(StoreKey.OwnKey, trimmed);
  return true;
}

/** The headers of a request to the set designer: the visitor's own key rides along when they gave one. */
export const designerHeaders = (): Record<string, string> => {
  const key = ownKey();
  return key === '' ? { 'content-type': 'application/json' } : { 'content-type': 'application/json', 'x-setpiece-key': key };
};
