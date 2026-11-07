/**
 * A page left open in the headset keeps the build it loaded, so a test after a
 * deploy can run old code without anyone knowing. The deploy writes its id to
 * version.json; while nobody is in the session, the page looks for a newer one
 * and reloads to it. Nothing is lost: the set, board and take are all saved.
 */
declare const __BUILD__: string;

export const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';

const LOOK_EVERY_MS = 60_000;

/** Calls `stale` once when a newer build is live. */
export function watchForNewBuild(stale: () => void): void {
  if (BUILD === 'dev') return;
  let told = false;
  const look = (): void => {
    if (told || document.visibilityState !== 'visible') return;
    fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((live: { build?: string } | null) => {
        if (told || live?.build == null || live.build === BUILD) return;
        told = true;
        stale();
      })
      .catch(() => {
        // Offline is not stale.
      });
  };
  window.setInterval(look, LOOK_EVERY_MS);
  document.addEventListener('visibilitychange', look);
  look();
}
