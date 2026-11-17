/**
 * How the monitor's picture and the frames on the board are drawn: as the lens sees them (photo), as a pencil
 * storyboard (sketch), as flat colour with inked lines (anime), or in hard black and white (noir). A storyboard is
 * a drawing as often as a photograph, and the plan may be for an animation as easily as a film.
 *
 * It is a treatment of the lens's picture, never of the set: the pieces on the table are what they were. The
 * monitor's own material draws it live (one small quad), and a snapped frame is put through the same sums once, on
 * the frame's own pixels, so the board shows what the monitor showed.
 */
import type { MeshBasicMaterial } from '@iwsdk/core';

export const FRAME_STYLES = ['photo', 'sketch', 'anime', 'noir'] as const;
export type FrameStyle = (typeof FRAME_STYLES)[number];

export const isFrameStyle = (value: unknown): value is FrameStyle => typeof value === 'string' && (FRAME_STYLES as readonly string[]).includes(value);

/** The style named in a sentence about a scene ("an anime sword fight", "a noir alley"), if one is. */
export function styleNamedIn(text: string): FrameStyle | null {
  const said = ` ${text.toLowerCase().replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ')} `;
  // Only words that say how a picture is drawn: "an animated argument" and "a pencil on the desk" are not styles.
  if (/ (anime|manga|cartoon|cel shaded) /.test(said)) return 'anime';
  if (/ (noir|in black and white) /.test(said)) return 'noir';
  if (/ (pencil sketch|pencil drawing|storyboard sketch|storyboard drawing|hand drawn|line drawing|as a sketch|sketch style) /.test(said)) return 'sketch';
  return null;
}

/** Which style the monitor draws, as a number its shader reads: the place of the style in FRAME_STYLES. */
export const STYLE_NOW = { value: 0 };

const KEY = 'setpiece-frame-style';
/** How strong a line has to be to be drawn at all, and to be drawn in full. */
const LINE_FROM = 0.14;
const LINE_FULL = 0.42;

/**
 * The monitor's material, taught the styles. `texel` is one pixel of its picture as a share of its width and height.
 * The picture arrives in linear light; the sums are done as the eye sees it and handed back in linear light.
 */
export function withFrameStyles(material: MeshBasicMaterial, texel: readonly [number, number]): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.frameStyle = STYLE_NOW;
    shader.uniforms.frameTexel = { value: texel };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <map_pars_fragment>',
        `#include <map_pars_fragment>
        uniform float frameStyle;
        uniform vec2 frameTexel;
        float seenLuma(vec2 at) {
          vec3 c = pow(max(texture2D(map, at).rgb, vec3(0.0)), vec3(1.0 / 2.2));
          return dot(c, vec3(0.299, 0.587, 0.114));
        }`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        if (frameStyle > 0.5) {
          vec2 px = frameTexel;
          float tl = seenLuma(vMapUv + px * vec2(-1.0, 1.0));
          float tc = seenLuma(vMapUv + px * vec2(0.0, 1.0));
          float tr = seenLuma(vMapUv + px * vec2(1.0, 1.0));
          float ml = seenLuma(vMapUv + px * vec2(-1.0, 0.0));
          float mr = seenLuma(vMapUv + px * vec2(1.0, 0.0));
          float bl = seenLuma(vMapUv + px * vec2(-1.0, -1.0));
          float bc = seenLuma(vMapUv + px * vec2(0.0, -1.0));
          float br = seenLuma(vMapUv + px * vec2(1.0, -1.0));
          float gx = (tr + 2.0 * mr + br) - (tl + 2.0 * ml + bl);
          float gy = (tl + 2.0 * tc + tr) - (bl + 2.0 * bc + br);
          float line = smoothstep(${LINE_FROM.toFixed(2)}, ${LINE_FULL.toFixed(2)}, sqrt(gx * gx + gy * gy));
          vec3 seen = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.0 / 2.2));
          float luma = dot(seen, vec3(0.299, 0.587, 0.114));
          vec3 drawn;
          if (frameStyle < 1.5) {
            // Pencil on paper: light tone for what is lit, hatching where it is dark, a dark line at every edge.
            vec2 at = vMapUv / frameTexel;
            float hatch = step(0.6, fract((at.x + at.y) / 5.0));
            float tone = mix(0.7, 1.0, smoothstep(0.12, 0.62, luma)) - hatch * 0.16 * (1.0 - smoothstep(0.1, 0.42, luma));
            drawn = mix(vec3(0.96, 0.94, 0.88) * tone, vec3(0.16, 0.15, 0.17), line);
          } else if (frameStyle < 2.5) {
            // Flat colour: the light in five steps, the hue kept and a little stronger than life, with an inked line.
            float stepped = (floor(luma * 5.0) + 0.5) / 5.0;
            vec3 cel = seen * (stepped / max(luma, 0.02));
            cel = clamp(mix(vec3(stepped), cel, 1.3), 0.0, 1.0);
            drawn = mix(cel, vec3(0.05, 0.04, 0.09), line);
          } else {
            // Hard black and white: the middle tones pushed apart.
            float hard = smoothstep(0.12, 0.92, luma);
            drawn = vec3(hard * hard * (3.0 - 2.0 * hard));
          }
          diffuseColor.rgb = pow(drawn, vec3(2.2));
        }`,
      );
  };
  material.customProgramCacheKey = () => KEY;
  material.needsUpdate = true;
}

const smooth = (from: number, to: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/**
 * The same treatment on a frame's own pixels (RGBA, top row first), in place. Once a snap, on 640 by 360: a few
 * milliseconds. Photo leaves the frame alone.
 */
export function styleFrame(data: Uint8ClampedArray, width: number, height: number, style: FrameStyle): void {
  if (style === 'photo') return;
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) luma[i] = (data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114) / 255;
  const at = (x: number, y: number): number => luma[Math.max(0, Math.min(height - 1, y)) * width + Math.max(0, Math.min(width - 1, x))];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const p = i * 4;
      const l = luma[i];
      let line = 0;
      if (style !== 'noir') {
        const gx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
        const gy = at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1) - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
        line = smooth(LINE_FROM, LINE_FULL, Math.hypot(gx, gy));
      }
      let r: number;
      let g: number;
      let b: number;
      if (style === 'sketch') {
        const hatch = ((x + (height - 1 - y)) / 5) % 1 >= 0.6 ? 1 : 0;
        const tone = 0.7 + 0.3 * smooth(0.12, 0.62, l) - hatch * 0.16 * (1 - smooth(0.1, 0.42, l));
        r = 0.96 * tone + (0.16 - 0.96 * tone) * line;
        g = 0.94 * tone + (0.15 - 0.94 * tone) * line;
        b = 0.88 * tone + (0.17 - 0.88 * tone) * line;
      } else if (style === 'anime') {
        const stepped = (Math.floor(l * 5) + 0.5) / 5;
        const gain = stepped / Math.max(l, 0.02);
        const fr = Math.max(0, Math.min(1, stepped + ((data[p] / 255) * gain - stepped) * 1.3));
        const fg = Math.max(0, Math.min(1, stepped + ((data[p + 1] / 255) * gain - stepped) * 1.3));
        const fb = Math.max(0, Math.min(1, stepped + ((data[p + 2] / 255) * gain - stepped) * 1.3));
        r = fr + (0.05 - fr) * line;
        g = fg + (0.04 - fg) * line;
        b = fb + (0.09 - fb) * line;
      } else {
        const hard = smooth(0.12, 0.92, l);
        r = g = b = hard * hard * (3 - 2 * hard);
      }
      data[p] = r * 255;
      data[p + 1] = g * 255;
      data[p + 2] = b * 255;
    }
  }
}
