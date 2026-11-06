/**
 * Wood you can see. The lay figures carry a grain texture, but most props are
 * built from shapes with no usable texture coordinates, so their grain is drawn
 * in the shader from the piece's own coordinates: bands that wander a little,
 * as they do in a cut block. Paint goes over it, as paint does. Every piece
 * shares the one compiled program.
 */
import { MeshStandardMaterial } from '@iwsdk/core';

const KEY = 'setpiece-wood-grain';

export function withGrain(material: MeshStandardMaterial): void {
  if (material.customProgramCacheKey() === KEY) return;
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGrainAt = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGrainAt;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float grainAt = vGrainAt.y + sin(vGrainAt.z * 31.0) * 0.007 + sin(vGrainAt.x * 57.0 + vGrainAt.z * 13.0) * 0.003;
        diffuseColor.rgb *= 0.9 + 0.1 * sin(grainAt * 390.0) * sin(grainAt * 83.0 + 1.7);`,
      );
  };
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
}
