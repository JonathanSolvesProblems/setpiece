/**
 * Wood you can see. The lay figures carry a grain texture, but most props are
 * built from shapes with no usable texture coordinates, so their grain is drawn
 * in the shader from the piece's own coordinates: bands that wander a little,
 * as they do in a cut block. Paint goes over it, as paint does, so a painted body
 * shows only a trace of it. Every piece shares the one compiled program; how deep
 * the grain shows is each material's own.
 */
import { MeshStandardMaterial } from '@iwsdk/core';
import { addToon } from './toon.js';

const KEY = 'setpiece-wood-grain';
/** How deep the grain shows: bare wood in full, under a coat of enamel only faintly. */
export const BARE_GRAIN = 0.075;
export const PAINTED_GRAIN = 0.03;
/**
 * One more fade for every grained piece at once: the grain is drawn in the piece's own coordinates, so a set grown
 * to full size around the wearer would show its bands ten times as wide. src/set-light.ts sets it each frame.
 */
export const GRAIN_FADE = { value: 1 };

/** The grain's depth on one material, kept in its own userData so a clone carries its own. */
export function setGrain(material: MeshStandardMaterial, depth: number): void {
  const grain = (material.userData.grain ??= { value: depth }) as { value: number };
  grain.value = depth;
}

export function withGrain(material: MeshStandardMaterial): void {
  if (material.customProgramCacheKey() === KEY) return;
  material.onBeforeCompile = function (this: MeshStandardMaterial, shader) {
    shader.uniforms.grainDepth = (this.userData.grain ??= { value: BARE_GRAIN }) as { value: number };
    shader.uniforms.grainFade = GRAIN_FADE;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainAt = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;\nuniform float grainDepth;\nuniform float grainFade;')
      .replace(
        '#include <color_fragment>',
        // Straight-ish bands, unevenly spaced as in a cut board, faded where a band is thinner than about two pixels
        // so a small or distant piece does not shimmer.
        `#include <color_fragment>
        float grainAt = vGrainAt.y + sin(vGrainAt.z * 31.0) * 0.0035 + sin(vGrainAt.x * 57.0 + vGrainAt.z * 13.0) * 0.002;
        grainAt += sin(grainAt * 23.0 + vGrainAt.x * 7.0) * 0.004;
        float grainBands = grainAt * 390.0;
        // (A cartoon is flat colour: the grain is put away while the set is drawn as one.)
        float grainShown = grainDepth * grainFade * (1.0 - toonOn) * clamp(1.5 - fwidth(grainBands) * 0.75, 0.0, 1.0);
        diffuseColor.rgb *= 1.0 - grainShown + grainShown * sin(grainBands) * sin(grainAt * 83.0 + 1.7);`,
      );
    // And the cartoon switch every piece carries (src/toon.ts).
    addToon(shader);
  };
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
}
