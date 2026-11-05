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
  Coach: 'setpiece.coach.v1',
  Take: 'setpiece.take.v1',
  Camera: 'setpiece.camera.v1',
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
