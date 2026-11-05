/**
 * Effects as a previs artist blocks them: fire, smoke and water that show where
 * the effect is and how big it reads in the frame. They are not simulations.
 * Each is one draw call of camera-facing quads moved in the vertex shader, so
 * they cost the headset almost nothing to keep running.
 */
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  Group,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  NormalBlending,
  PlaneGeometry,
  ShaderMaterial,
} from '@iwsdk/core';

type Motion = 'rise' | 'burst' | 'fall';
const MOTION: Record<Motion, number> = { rise: 0, burst: 1, fall: 2 };
type Spec = {
  count: number;
  radius: number;
  height: number;
  rate: [number, number];
  size: [number, number];
  low: number;
  mid: number;
  high: number;
  alpha: number;
  additive: boolean;
  motion: Motion;
};

const VERTEX = `
uniform float uTime;
uniform float uRadius;
uniform float uHeight;
uniform vec2 uSize;
uniform float uBurst;
attribute vec4 aSeed;
varying float vLife;
varying vec2 vUv;
void main() {
  float life = fract(uTime * aSeed.z + aSeed.w);
  vec3 centre;
  if (uBurst > 1.5) {
    float far = uRadius * sqrt(aSeed.y);
    centre = vec3(cos(aSeed.x) * far, uHeight * (1.0 - life), sin(aSeed.x) * far);
  } else if (uBurst > 0.5) {
    float reach = uRadius * life * (0.4 + aSeed.y);
    float rise = uHeight * 4.0 * life * (1.0 - life) * (0.45 + 0.55 * aSeed.y);
    centre = vec3(cos(aSeed.x) * reach, rise, sin(aSeed.x) * reach);
  } else {
    float sway = sin(uTime * 3.0 + aSeed.x * 7.0) * 0.012 * life;
    float spread = uRadius * aSeed.y * (0.4 + life);
    centre = vec3(cos(aSeed.x) * spread + sway, uHeight * life, sin(aSeed.x) * spread);
  }
  float size = mix(uSize.x, uSize.y, life);
  vec4 view = modelViewMatrix * vec4(centre, 1.0);
  view.xy += position.xy * size;
  gl_Position = projectionMatrix * view;
  vLife = life;
  vUv = uv;
}`;

const FRAGMENT = `
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uHigh;
uniform float uAlpha;
varying float vLife;
varying vec2 vUv;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float soft = smoothstep(1.0, 0.1, d);
  vec3 colour = vLife < 0.5 ? mix(uLow, uMid, vLife * 2.0) : mix(uMid, uHigh, vLife * 2.0 - 1.0);
  float fade = smoothstep(0.0, 0.12, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
  gl_FragColor = vec4(colour, soft * fade * uAlpha);
}`;

function effect(spec: Spec): Mesh {
  const quad = new PlaneGeometry(1, 1);
  const geometry = new InstancedBufferGeometry();
  geometry.index = quad.index;
  geometry.setAttribute('position', quad.getAttribute('position'));
  geometry.setAttribute('uv', quad.getAttribute('uv'));
  geometry.instanceCount = spec.count;
  // Seeded by index, so the asset is the same in the app and in the editor.
  const seeds = new Float32Array(spec.count * 4);
  for (let i = 0; i < spec.count; i++) {
    const a = (i * 2.399963) % (Math.PI * 2);
    const b = (i * 0.61803398875) % 1;
    const c = (i * 0.75487766625) % 1;
    seeds[i * 4] = a;
    seeds[i * 4 + 1] = b;
    seeds[i * 4 + 2] = spec.rate[0] + (spec.rate[1] - spec.rate[0]) * c;
    seeds[i * 4 + 3] = (i / spec.count + c) % 1;
  }
  geometry.setAttribute('aSeed', new InstancedBufferAttribute(seeds, 4));
  const material = new ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: spec.additive ? AdditiveBlending : NormalBlending,
    uniforms: {
      uTime: { value: 0 },
      uRadius: { value: spec.radius },
      uHeight: { value: spec.height },
      uSize: { value: spec.size },
      uBurst: { value: MOTION[spec.motion] },
      uLow: { value: new Color(spec.low) },
      uMid: { value: new Color(spec.mid) },
      uHigh: { value: new Color(spec.high) },
      uAlpha: { value: spec.alpha },
    },
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'EffectParticles';
  mesh.frustumCulled = false;
  mesh.userData.iwsdkPreviewBounds = 'exclude';
  return mesh;
}

function named(name: string, spec: Spec): Group {
  const g = new Group();
  g.name = name;
  g.add(effect(spec));
  return g;
}

export const fireEffect = named('Fire', {
  count: 70,
  radius: 0.045,
  height: 0.17,
  rate: [0.9, 1.5],
  size: [0.05, 0.012],
  low: 0xffe28a,
  mid: 0xff7a1a,
  high: 0x8a1c08,
  alpha: 0.75,
  additive: true,
  motion: 'rise',
});
export const smokeEffect = named('Smoke', {
  count: 42,
  radius: 0.08,
  height: 0.36,
  rate: [0.2, 0.34],
  size: [0.05, 0.13],
  low: 0x4e4f52,
  mid: 0x6f7073,
  high: 0x9a9b9d,
  alpha: 0.5,
  additive: false,
  motion: 'rise',
});
export const waterEffect = named('Water', {
  count: 90,
  radius: 0.13,
  height: 0.2,
  rate: [0.5, 0.85],
  size: [0.018, 0.009],
  low: 0xe6f6ff,
  mid: 0x8fcdf2,
  high: 0x3f93cf,
  alpha: 0.85,
  additive: false,
  motion: 'burst',
});
export const explosionEffect = named('Explosion', {
  count: 80,
  radius: 0.17,
  height: 0.2,
  rate: [0.4, 0.62],
  size: [0.1, 0.03],
  low: 0xfff0b0,
  mid: 0xff6a12,
  high: 0x35221c,
  alpha: 0.7,
  additive: true,
  motion: 'burst',
});
export const rainEffect = named('Rain', {
  count: 130,
  radius: 0.3,
  height: 0.5,
  rate: [1.1, 1.7],
  size: [0.006, 0.006],
  low: 0xdcecf7,
  mid: 0xc4dff0,
  high: 0xa7cde6,
  alpha: 0.8,
  additive: false,
  motion: 'fall',
});
export const sparksEffect = named('Sparks', {
  count: 60,
  radius: 0.12,
  height: 0.15,
  rate: [0.8, 1.3],
  size: [0.012, 0.004],
  low: 0xfffbe0,
  mid: 0xffc23a,
  high: 0xff6a12,
  alpha: 0.95,
  additive: true,
  motion: 'burst',
});
