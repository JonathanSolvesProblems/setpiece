/**
 * The effects on the set sound while they are on it: rain hisses, fire crackles, smoke, fog, dust and snow carry a
 * low wind, water burbles. Each sound comes from where its piece stands, fades in as the piece comes on and out as
 * it goes, and is heard at its own level within a short reach of the table (ten times farther once the set is full
 * size around the wearer). The sounds are made by tools/make-audio.mjs, so nothing is sampled or licensed.
 */
import { AudioSource, AudioUtils, createSystem, Object3D as Object3DClass } from '@iwsdk/core';
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
/**
 * The air inside a set at full size, by its light: crickets after dark, a soft wind out of doors, and the room's own
 * quiet in a studio. Only at full size: on the table the set is a model in the wearer's own room.
 */
const AIR: Record<string, { src: string; volume: number } | undefined> = {
  night: { src: './audio/night.wav', volume: 0.22 },
  day: { src: './audio/wind.wav', volume: 0.1 },
  overcast: { src: './audio/wind.wav', volume: 0.16 },
  'golden hour': { src: './audio/wind.wav', volume: 0.1 },
};
/** Seconds the air takes to come up as the set grows around the wearer, and to go as they step out. */
const AIR_FADE = 1.5;
/** Within this many metres a sound is at its own level; it falls off beyond. */
const REACH = 0.4;
/** Seconds a sound takes to come up or die away. */
const FADE = 0.6;

type Globals = { trayOn: Signal<string[]>; lifeSize: Signal<boolean>; setLight: Signal<string> };

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
  /** One source for each light's air, made at the start so each has loaded before the wearer steps inside. */
  private airs = new Map<string, Entity>();
  /** The light whose air is sounding now, or '' for none. */
  private airOn = '';

  init(): void {
    for (const [light, sound] of Object.entries(AIR)) {
      if (sound == null) continue;
      const holder = new Object3DClass();
      holder.name = `Air ${light}`;
      const air = this.world.createTransformEntity(holder);
      air.addComponent(AudioSource, { src: sound.src, volume: sound.volume, loop: true, positional: false, maxInstances: 1 });
      this.airs.set(light, air);
    }
    this.cleanupFuncs.push(
      (this.globals as Globals).trayOn.subscribe(() => {
        this.dirty = true;
      }),
    );
  }

  /** The air of the set's light while the wearer is inside it; none on the table. */
  private air(shown: boolean): void {
    const g = this.globals as Globals;
    const light = shown && g.lifeSize.peek() ? g.setLight.peek() : '';
    const wanted = this.airs.has(light) ? light : '';
    if (wanted === this.airOn) return;
    // Asked to play only once it has loaded; tried again on the next frame until then.
    const next = this.airs.get(wanted);
    if (next != null && next.getValue(AudioSource, '_loaded') !== true) return;
    const was = this.airs.get(this.airOn);
    if (was != null) AudioUtils.pause(was, AIR_FADE);
    if (next != null) AudioUtils.play(next, AIR_FADE);
    this.airOn = wanted;
  }

  update(): void {
    this.stage ??= this.scene.getObjectByName('Stage') ?? null;
    const shown = this.stage?.visible === true;
    const scale = this.stage?.scale.x ?? 1;
    if (shown !== this.stageShown) {
      this.stageShown = shown;
      this.dirty = true;
    }
    this.air(shown);
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
