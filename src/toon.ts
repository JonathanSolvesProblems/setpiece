/**
 * The set itself, drawn as a cartoon: when the frames are in anime, the pieces on the table are too. Their light
 * falls in four flat steps where it shaded smoothly, their colour is a little stronger than life, and where a
 * surface turns away from the eye it goes to ink, so every round form has a dark edge. It is the pieces' own
 * shader with one switch in it, so turning it on or off compiles nothing and costs a few sums a pixel: no second
 * pass, no outline meshes, nothing more for a headset to draw.
 */
import type { MeshStandardMaterial } from '@iwsdk/core';

/** 1 while the set is drawn as a cartoon, 0 otherwise. Every patched material reads this one number. */
export const TOON = { value: 0 };

const KEY = 'setpiece-toon';

/** The switch, added to a standard material's shader as it is compiled. Other patches of the shader may call it too. */
export function addToon(shader: { uniforms: Record<string, unknown>; fragmentShader: string }): void {
  shader.uniforms.toonOn = TOON;
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float toonOn;')
    .replace(
      '#include <opaque_fragment>',
      `if (toonOn > 0.5) {
        // Light in four steps, stepped as the eye sees it and not as it is counted.
        float toonLight = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
        float toonSeen = sqrt(max(toonLight, 0.0));
        float toonStep = (floor(toonSeen * 4.0) + 0.5) / 4.0;
        outgoingLight *= (toonStep * toonStep) / max(toonLight, 0.0005);
        outgoingLight = mix(vec3(toonStep * toonStep), outgoingLight, 1.3);
        // Ink where the surface turns away from the eye.
        float toonEdge = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
        outgoingLight *= mix(1.0, 0.14, smoothstep(0.58, 0.78, toonEdge));
      }
      #include <opaque_fragment>`,
    );
}

/** A piece's plain material, given the switch. A material some other patch already owns is left to that patch. */
export function withToon(material: MeshStandardMaterial): void {
  // (A clone of a patched material carries its userData but not its patch, so the patch itself is what is asked after.)
  if (Object.prototype.hasOwnProperty.call(material, 'customProgramCacheKey')) return;
  material.onBeforeCompile = (shader) => addToon(shader);
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
}
