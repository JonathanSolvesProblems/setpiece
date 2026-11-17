/**
 * What Setpiece keeps between visits, in the browser's own storage: where the
 * stage sits, where each piece stands on it, the board and the take. Every read and
 * write is guarded, because a private window has no storage and the app must
 * run the same without it.
 */

export const StoreKey = {
  Stage: 'setpiece.stage.pose.v1',
  Pieces: 'setpiece.pieces.v1',
  Board: 'setpiece.board.v1',
  /** The boards put away by New board, oldest first (src/viewfinder.ts). */
  Boards: 'setpiece.boards.v1',
  Coach: 'setpiece.coach.v1',
  Take: 'setpiece.take.v1',
  Camera: 'setpiece.camera.v1',
  Tray: 'setpiece.tray.v2',
  Settings: 'setpiece.settings.v1',
  Briefs: 'setpiece.briefs.v1',
  /** The pieces the set designer made, and which place on the set each is in. */
  Made: 'setpiece.made.v1',
  /** The light the set is in (src/set-light.ts). */
  Light: 'setpiece.light.v1',
  /** What stands on the horizon behind the set (src/set-light.ts). */
  Far: 'setpiece.far.v1',
  /** A visitor's own Anthropic key, if they gave one on the page (src/own-key.ts). */
  OwnKey: 'setpiece.ownkey.v1',
} as const;

type Key = (typeof StoreKey)[keyof typeof StoreKey];

export function loadJson<T>(key: Key): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the value could not be kept (no storage, or it is full). */
export function saveJson(key: Key, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function clearKey(key: Key): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing saved to clear.
  }
}
