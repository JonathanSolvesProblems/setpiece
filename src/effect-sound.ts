/**
 * The effects on the set sound while they are on it: rain hisses, fire crackles, smoke, fog, dust and snow carry a
 * low wind, water burbles. Each sound comes from where its piece stands, fades in as the piece comes on and out as
 * it goes, and is heard at its own level within a short reach of the table (ten times farther once the set is full
 * size around the wearer). The sounds are made by tools/make-audio.mjs, so nothing is sampled or licensed.
 */
import { AudioSource, AudioUtils, createSystem } from '@iwsdk/core';
import type { Entity, Object3D } from '@iwsdk/core';
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
  /** What is on the set changed, or a sound is still loading: the sounds are put right on the next frame. */
  private dirty = true;
  private stage: Object3D | null = null;
  /** The stage's shown and size as last seen: a change of either puts the sounds right. */
  private stageShown = false;
  private stageScale = 1;

  init(): void {
    this.cleanupFuncs.push(
      (this.globals as Globals).trayOn.subscribe(() => {
        this.dirty = true;
      }),
    );
  }

  update(): void {
    this.stage ??= this.scene.getObjectByName('Stage') ?? null;
    const shown = this.stage?.visible === true;
    const scale = this.stage?.scale.x ?? 1;
    if (shown !== this.stageShown) {
      this.stageShown = shown;
      this.dirty = true;
    }
    // At full size the set is ten times farther away: a sound's reach grows with it, or it falls to a tenth.
    if (scale !== this.stageScale) {
      this.stageScale = scale;
      for (const piece of this.sounding) piece.setValue(AudioSource, 'refDistance', REACH * scale);
    }
    if (!this.dirty) return;
    this.dirty = false;
    const on = (this.globals as Globals).trayOn.peek();
    for (const piece of this.queries.pieces.entities) {
      const label = String(piece.getValue(SetPiece, 'label'));
      const sound = SOUNDS[label];
      if (sound == null) continue;
      // On the set, and the set shown: not while it is put away to be landed.
      const wanted = shown && on.includes(label) && piece.object3D?.visible === true;
      if (wanted && !this.sounding.has(piece)) {
        if (!piece.hasComponent(AudioSource)) {
          piece.addComponent(AudioSource, {
            src: sound.src,
            volume: sound.volume,
            loop: true,
            positional: true,
            refDistance: REACH * scale,
            rolloffFactor: 1.2,
            maxInstances: 1,
          });
        }
        // Asked to play only once it has loaded: a piece taken off while its sound loads must not start it later.
        if (piece.getValue(AudioSource, '_loaded') !== true) {
          this.dirty = true;
          continue;
        }
        piece.setValue(AudioSource, 'refDistance', REACH * scale);
        AudioUtils.play(piece, FADE);
        this.sounding.add(piece);
      } else if (!wanted && this.sounding.has(piece)) {
        AudioUtils.pause(piece, FADE);
        this.sounding.delete(piece);
      }
    }
  }
}
