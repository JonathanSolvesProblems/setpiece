/**
 * Wood you can see. The lay figures carry a grain texture, but most props are
 * built from shapes with no usable texture coordinates, so their grain is drawn
 * in the shader from the piece's own coordinates: bands that wander a little,
 * as they do in a cut block. Paint goes over it, as paint does, so a painted body
 * shows only a trace of it. Every piece shares the one compiled program; how deep
 * the grain shows is each material's own.
 */
import { MeshStandardMaterial } from '@iwsdk/core';

const KEY = 'setpiece-wood-grain';
/** How deep the grain shows: bare wood in full, under a coat of enamel only faintly. */
export const BARE_GRAIN = 0.1;
export const PAINTED_GRAIN = 0.035;

/** The grain's depth on one material, kept in its own userData so a clone carries its own. */
export function setGrain(material: MeshStandardMaterial, depth: number): void {
  const grain = (material.userData.grain ??= { value: depth }) as { value: number };
  grain.value = depth;
}

export function withGrain(material: MeshStandardMaterial): void {
  if (material.customProgramCacheKey() === KEY) return;
  material.onBeforeCompile = function (this: MeshStandardMaterial, shader) {
    shader.uniforms.grainDepth = (this.userData.grain ??= { value: BARE_GRAIN }) as { value: number };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainAt = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;\nuniform float grainDepth;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float grainAt = vGrainAt.y + sin(vGrainAt.z * 31.0) * 0.007 + sin(vGrainAt.x * 57.0 + vGrainAt.z * 13.0) * 0.003;
        diffuseColor.rgb *= 1.0 - grainDepth + grainDepth * sin(grainAt * 390.0) * sin(grainAt * 83.0 + 1.7);`,
      );
  };
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
}
