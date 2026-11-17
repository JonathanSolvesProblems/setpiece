/**
 * Starting over as a newcomer: a new board, the opening set, the stage to be landed again, the studio light, and the
 * walkthrough from its first step. The page's Start over and the panel's "Start the walkthrough again" both do this,
 * so the next person in the headset gets what a first visitor gets without leaving the session.
 */
import type { Signal } from '@preact/signals-core';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

type Globals = {
  newBoardRequested: Signal<number>;
  setLight: Signal<string>;
  startOver: Signal<number>;
  setsBuilt: Signal<number>;
  resetStageRequested: Signal<number>;
};

export function startOver(globals: unknown, landAgain: boolean): void {
  const g = globals as Globals;
  g.newBoardRequested.value = g.newBoardRequested.peek() + 1;
  clearKey(StoreKey.Stage);
  clearKey(StoreKey.Coach);
  clearKey(StoreKey.Light);
  clearKey(StoreKey.Far);
  // The small panel is a newcomer's: Talk, Try a shot and Skip the walkthrough are on it.
  saveJson(StoreKey.Settings, { ...(loadJson<Record<string, unknown>>(StoreKey.Settings) ?? {}), more: false });
  g.setLight.value = 'studio';
  (g as unknown as { setFar: Signal<string> }).setFar.value = '';
  // No set of the designer's stands any more: the first one is built again as the set lands.
  g.setsBuilt.value = 0;
  g.startOver.value = g.startOver.peek() + 1;
  // In the headset the set comes up to be landed again, as it does for a first visitor.
  if (landAgain) g.resetStageRequested.value = g.resetStageRequested.peek() + 1;
}
