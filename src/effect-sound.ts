/**
 * The effects on the set sound while they are on it: rain hisses, fire crackles, smoke, fog, dust and snow carry a
 * low wind, water burbles. Each sound comes from where its piece stands, fades in as the piece comes on and out as
 * it goes, and is heard at its own level within a short reach of the table (ten times farther once the set is full
 * size around the wearer). The sounds are made by tools/make-audio.mjs, so nothing is sampled or licensed.
 */
import { AudioSource, AudioUtils, createSystem } from '@iwsdk/core';
import type { Entity } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SetPiece } from './set-components.js';

const FIRE = { src: './audio/fire.wav', volume: 0.45 };
const WIND = { src: './audio/wind.wav', volume: 0.3 };
const SOUNDS: Record<string, { src: string; volume: number }> = {
  Fire: FIRE,
  Embers: FIRE,
  Sparks: FIRE,
  Explosion: FIRE,
  Rain: { src: './audio/rain.wav', volume: 0.45 },
  Smoke: WIND,
  Fog: WIND,
  Dust: WIND,
  Snow: WIND,
  Water: { src: './audio/water.wav', volume: 0.4 },
};
/** Within this many metres a sound is at its own level; it falls off beyond. */
const REACH = 0.4;
/** Seconds a sound takes to come up or die away. */
const FADE = 0.6;

type Globals = { trayOn: Signal<string[]> };

export class EffectSoundSystem extends createSystem({
  pieces: { required: [SetPiece] },
}) {
  /** The effect pieces sounding now. */
  private sounding = new Set<Entity>();
  /** What is on the set changed: the sounds are put right on the next frame. */
  private dirty = true;

  init(): void {
    this.cleanupFuncs.push(
      (this.globals as Globals).trayOn.subscribe(() => {
        this.dirty = true;
      }),
    );
  }

  update(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const on = (this.globals as Globals).trayOn.peek();
    for (const piece of this.queries.pieces.entities) {
      const label = String(piece.getValue(SetPiece, 'label'));
      const sound = SOUNDS[label];
      if (sound == null) continue;
      const wanted = on.includes(label) && piece.object3D?.visible === true;
      if (wanted && !this.sounding.has(piece)) {
        if (!piece.hasComponent(AudioSource)) {
          piece.addComponent(AudioSource, {
            src: sound.src,
            volume: sound.volume,
            loop: true,
            positional: true,
            refDistance: REACH,
            rolloffFactor: 1.2,
            maxInstances: 1,
          });
        }
        AudioUtils.play(piece, FADE);
        this.sounding.add(piece);
      } else if (!wanted && this.sounding.has(piece)) {
        AudioUtils.pause(piece, FADE);
        this.sounding.delete(piece);
      }
    }
  }
}
