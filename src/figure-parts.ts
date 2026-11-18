/**
 * What each pose of a lay figure can have in its hand (src/scene-assets/figures.scene-asset.ts builds twelve things
 * a pose), kept here once the tray has taken them off the figure: only the thing an actor holds is in the scene.
 * Left on, hidden, they were 2,072 of a set's 4,257 nodes on the headset (17 Nov), walked on every pass over the scene.
 * The tray puts one on and takes it off; the squirm reads the whole list, so an arm still carries what is put in it later.
 */
import type { Object3D } from '@iwsdk/core';

export const heldOf = new WeakMap<Object3D, Object3D[]>();
const HELD = /^Held(\d+)[LR]$/;

/** The things this pose can hold, taken off it the first time it is asked. */
export function heldThings(pose: Object3D): Object3D[] {
  let held = heldOf.get(pose);
  if (held == null) {
    held = pose.children.filter((part) => HELD.test(part.name));
    for (const thing of held) {
      pose.remove(thing);
      thing.visible = false;
    }
    heldOf.set(pose, held);
  }
  return held;
}

/** Puts thing number `holds` in the hand of this pose, if the pose is showing, and takes every other thing off it. */
export function hold(pose: Object3D, holds: number, showing: boolean): void {
  for (const thing of heldThings(pose)) {
    const want = showing && Number(HELD.exec(thing.name)?.[1] ?? 0) === holds;
    if (want && thing.parent !== pose) pose.add(thing);
    else if (!want && thing.parent === pose) pose.remove(thing);
    thing.visible = want;
  }
}
