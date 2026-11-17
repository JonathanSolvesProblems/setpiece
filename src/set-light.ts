/**
 * The light the set is in: studio, day, golden hour, night or overcast, chosen by the set designer from the
 * sentence ("a night chase" is night) or kept from the set before. It sets the key light's colour and strength,
 * the room's fill, the sky behind the shot in the lens (and so in every frame on the board), and the world around
 * a set stepped inside: a sky and a ground in that light, through which the real room still shows faintly, so a
 * wearer walking the set at full size can still see where the furniture is.
 */
import {
  BackSide,
  BufferAttribute,
  CanvasTexture,
  CircleGeometry,
  Color,
  createSystem,
  HemisphereLight,
  IBLGradient,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  Vector2,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { isFar, isLight } from './director-plan.js';
import type { LightName } from './director-plan.js';
import { saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';
import { GRAIN_FADE } from './wood-grain.js';
import { FIRE_LIGHT, LAMP_GLOW, LAMP_POOL, WINDOW_GLASS } from './scene-assets/lib/practicals.js';
import { lens as HEADLAMPS, tail as TAIL_LAMPS } from './scene-assets/lib/vehicle.js';
import { paintSky } from './sky-paint.js';
import type { SkyArt } from './sky-paint.js';

/** The set is 1:10, so a light's output grows by a hundred and its reach by ten at full size. */
const LIFE_SCALE = 10;
/** How much of the world around a set stepped inside covers the room: the rest of the room shows through. */
const WORLD_COVER = 0.9;
const WORLD_RADIUS = 60;
/**
 * The floor inside a set: a grid of one-metre squares out to this many metres, lying on the set's own floor and
 * moving with the set, so a wearer who walks sees the ground pass under them. Its lines take the key light's colour
 * and this much of the world's cover, and the stage's own 6 by 4 metres is drawn brighter in the middle of it.
 */
const GRID_REACH = 30;
const GRID_SHOWS = 0.2;
const STAGE_SHOWS = 0.7;

/** One square of the grid: a soft line along two edges, clear inside. */
function paintGridCell(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const n = canvas.width;
  g.clearRect(0, 0, n, n);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(0, 0, n, 3);
  g.fillRect(0, 0, 3, n);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.fillRect(0, 0, n, 1.5);
  g.fillRect(0, 0, 1.5, n);
}

/** The stage's edge as tape on the floor: its outline and a tick at each corner. */
function paintStageTape(canvas: HTMLCanvasElement): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const w = canvas.width;
  const h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 5;
  g.setLineDash([26, 14]);
  g.strokeRect(4, 4, w - 8, h - 8);
}
/**
 * The world behind a set on the table: a band of the same sky, curved round the set at this radius (metres, the
 * stage is 0.6 by 0.4) from the table up to this far above the horizon, solid up to CYC_SOLID and gone at its top
 * edge; the scene's ground meets its foot. Drawn from inside only, so the half nearer the wearer is never in the way: it is always behind the set.
 */
const CYC_RADIUS = 0.52;
const CYC_TOP = (62 * Math.PI) / 180;
const CYC_SOLID = (36 * Math.PI) / 180;
/** How much of the room it covers where it is solid, and how fast it comes and goes (per second). */
const CYC_COVER = 0.9;
const CYC_GROUND_UNDER = 0.0015;
const CYC_COMES = 2.2;
const CYC_GOES = 7;

/** The band, white in its vertices, with how solid it is at each height in their fourth number. */
function cycGeometry(): SphereGeometry {
  const band = new SphereGeometry(CYC_RADIUS, 72, 14, 0, Math.PI * 2, Math.PI / 2 - CYC_TOP, CYC_TOP);
  const at = band.getAttribute('position');
  const colours = new Float32Array(at.count * 4);
  const smooth = (from: number, to: number, x: number): number => {
    const t = Math.max(0, Math.min(1, (x - from) / (to - from)));
    return t * t * (3 - 2 * t);
  };
  // A part of a sphere carries the whole picture top to bottom; this band is only the sky from the horizon up, so
  // each of its rows is given the picture's own row for that height (the horizon is the picture's middle row).
  const uv = band.getAttribute('uv');
  for (let i = 0; i < at.count; i++) {
    const up = Math.asin(Math.max(-1, Math.min(1, at.getY(i) / CYC_RADIUS)));
    colours.set([1, 1, 1, 1 - smooth(CYC_SOLID, CYC_TOP, up)], i * 4);
    uv.setY(i, 0.5 + up / Math.PI);
  }
  band.setAttribute('color', new BufferAttribute(colours, 4));
  return band;
}

/**
 * The scene's ground from under the set back to the foot of that sky: a disc, solid on its far side (its own -Z,
 * which is kept turned away from the wearer) and clear on the near side, so nothing lies over the table in front.
 */
function cycGroundGeometry(): RingGeometry {
  const disc = new RingGeometry(0, CYC_RADIUS, 48, 6);
  disc.rotateX(-Math.PI / 2);
  const at = disc.getAttribute('position');
  const colours = new Float32Array(at.count * 4);
  for (let i = 0; i < at.count; i++) {
    const t = Math.max(0, Math.min(1, (-at.getZ(i) / CYC_RADIUS + 0.2) / 0.6));
    colours.set([1, 1, 1, t * t * (3 - 2 * t)], i * 4);
  }
  disc.setAttribute('color', new BufferAttribute(colours, 4));
  return disc;
}

/**
 * The band is solid on the side of the set away from the wearer and clear on the side toward them: its ends fade
 * rather than stop, and a wearer who leans in over the set is not wrapped in its near half. `toward` is the way from
 * the set to the wearer, flat, in the band's own frame; the fade runs from CYC_SIDE_SOLID to CYC_SIDE_CLEAR of the
 * way round toward them (as the cosine of the angle from that direction).
 */
const CYC_TOWARD = { value: new Vector2(0, 1) };
const CYC_SIDE_SOLID = -0.1;
const CYC_SIDE_CLEAR = 0.4;
function awayOnly(material: MeshBasicMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.cycToward = CYC_TOWARD;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vCycSide;\nuniform vec2 cycToward;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCycSide = dot(normalize(position.xz), cycToward);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCycSide;')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.a *= 1.0 - smoothstep(${CYC_SIDE_SOLID.toFixed(2)}, ${CYC_SIDE_CLEAR.toFixed(2)}, vCycSide);`);
  };
  material.customProgramCacheKey = () => 'setpiece-cyc';
}
/** Frames the band and its ground are drawn at nothing when they are made, so their shaders are ready before a set is. */
const CYC_WARM_FRAMES = 3;

/** Frames after a change of light before the world's sky is painted in it, unless the wearer steps inside first. */
const WORLD_PAINT_AFTER = 150;
const ORIGIN = new Vector3();

interface Look {
  /** The key light's colour, and its strength against the strength it was authored at. */
  key: number;
  keyPower: number;
  /** The room's fill: sky colour, ground colour, strength. */
  sky: number;
  ground: number;
  fill: number;
  /** The sky behind the set, top to bottom: high sky, just above the horizon, the horizon, the ground. */
  top: string;
  upper: string;
  horizon: string;
  floor: string;
  /** The light every surface reflects: above, at the horizon, below (0 to 1 each), and its strength. Brighter above
   * than below, so a surface shades as it turns away from the sky and a curve shows where it bends. */
  env: { sky: Rgb; equator: Rgb; ground: Rgb; power: number };
  /** Where the key light stands, on the stage (it was authored at studio's): high for day, low and to the side at
   * golden hour so the shadows run long, behind and above at night as the moon would. */
  keyAt: Rgb;
  /** How far the set's own lights are up, 0 to 1: lit windows and a burning street lamp at night. */
  practical: number;
  /** What is painted on the sky: a sun or moon, stars, clouds, a far skyline, haze. None on a stage. */
  art: SkyArt | null;
}
type Rgb = [number, number, number];

/** Studio is the look the set always had: a dark stage behind the lens, the authored key light. */
export const LOOKS: Record<LightName, Look> = {
  studio: { key: 0xffeed1, keyPower: 1, sky: 0xf6f7ef, ground: 0x64453e, fill: 0.45, top: '#140f0c', upper: '#1b1411', horizon: '#2a211c', floor: '#3a2d25', env: { sky: [0.95, 0.9, 0.82], equator: [0.42, 0.4, 0.38], ground: [0.12, 0.11, 0.1], power: 1 }, keyAt: [-0.45, 0.72, 0.42], practical: 0, art: null },
  day: { key: 0xfff6e8, keyPower: 1.15, sky: 0xd8e8ff, ground: 0x6e6252, fill: 0.6, top: '#3a73bb', upper: '#8fb6dc', horizon: '#cfdfec', floor: '#86807a', env: { sky: [0.78, 0.86, 1], equator: [0.55, 0.58, 0.6], ground: [0.2, 0.19, 0.17], power: 1 }, keyAt: [-0.3, 0.95, 0.3], practical: 0, art: { stars: 0, orb: { disc: '#fffbe8', glow: 'rgba(255,246,214,0.85)', size: 0.016, reach: 0.2 }, clouds: { count: 20, lit: '255,255,255', shade: '176,196,222', alpha: 0.85 }, far: 'hills', farColour: '#7f97ad', windows: null, haze: '226,236,246', hazeAlpha: 0.45 } },
  'golden hour': { key: 0xffb36b, keyPower: 1, sky: 0xffd2a3, ground: 0x5c3b2a, fill: 0.42, top: '#2f4a78', upper: '#c98a62', horizon: '#f2a65c', floor: '#68523f', env: { sky: [1, 0.72, 0.48], equator: [0.55, 0.4, 0.3], ground: [0.14, 0.1, 0.08], power: 1 }, keyAt: [-0.8, 0.22, 0.12], practical: 0.2, art: { stars: 0, orb: { disc: '#fff0c2', glow: 'rgba(255,170,84,0.9)', size: 0.022, reach: 0.34 }, clouds: { count: 13, lit: '255,190,132', shade: '132,84,100', alpha: 0.85 }, far: 'hills', farColour: '#4a3340', windows: null, haze: '255,176,104', hazeAlpha: 0.6 } },
  night: { key: 0x9fb4ff, keyPower: 0.5, sky: 0x2e3a68, ground: 0x100e14, fill: 0.18, top: '#02040a', upper: '#0b1222', horizon: '#1b2440', floor: '#111217', env: { sky: [0.2, 0.26, 0.45], equator: [0.07, 0.08, 0.13], ground: [0.02, 0.02, 0.03], power: 0.6 }, keyAt: [0.3, 0.8, -1.1], practical: 1, art: { stars: 520, orb: { disc: '#f2f4ff', glow: 'rgba(150,170,255,0.55)', size: 0.014, reach: 0.16 }, clouds: { count: 7, lit: '64,78,122', shade: '18,24,48', alpha: 0.55 }, far: 'city', farColour: '#070a14', windows: '#ffc878', haze: '52,66,120', hazeAlpha: 0.45 } },
  overcast: { key: 0xe2e7ee, keyPower: 0.85, sky: 0xc0c8d0, ground: 0x5e5e5a, fill: 0.6, top: '#737c87', upper: '#a3abb4', horizon: '#c5cbd1', floor: '#6a6a66', env: { sky: [0.75, 0.78, 0.82], equator: [0.5, 0.52, 0.54], ground: [0.2, 0.2, 0.19], power: 1 }, keyAt: [-0.2, 1, 0.2], practical: 0.08, art: { stars: 0, orb: null, clouds: { count: 44, lit: '196,202,210', shade: '120,128,138', alpha: 0.6 }, far: 'hills', farColour: '#7b838b', windows: null, haze: '200,206,212', hazeAlpha: 0.5 } },
  // One pool of light on a dark stage: a product shot, an interrogation, a solo.
  spotlight: { key: 0xfff4de, keyPower: 1.7, sky: 0x40404a, ground: 0x0a0a0c, fill: 0.07, top: '#020202', upper: '#040404', horizon: '#0a0908', floor: '#131110', env: { sky: [0.22, 0.21, 0.2], equator: [0.05, 0.05, 0.05], ground: [0.01, 0.01, 0.01], power: 0.45 }, keyAt: [0.05, 1.15, 0.12], practical: 0.3, art: null },
};

type Globals = { setLight: Signal<string>; lifeSize: Signal<boolean>; designing?: Signal<boolean>; worldOn?: Signal<boolean> };

/** The ground, its own colour under the wearer and the horizon's at its edge. */
function paintGround(canvas: HTMLCanvasElement, look: Look): void {
  const g = canvas.getContext('2d');
  if (g == null) return;
  const r = canvas.width / 2;
  const gradient = g.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, look.floor);
  gradient.addColorStop(0.55, look.floor);
  gradient.addColorStop(1, look.horizon);
  g.fillStyle = gradient;
  g.fillRect(0, 0, canvas.width, canvas.height);
}

export class SetLightSystem extends createSystem({ environment: { required: [IBLGradient] } }) {
  private key: PointLight | null = null;
  private keyIntensity = 0;
  private keyDistance = 0;
  private fill: HemisphereLight | null = null;
  private backdrop: Mesh | null = null;
  private stage: Object3D | null = null;
  private sky: Mesh | null = null;
  private ground: Mesh | null = null;
  /** The sky behind the set on the table, and how much of it is up (0 to CYC_COVER). */
  private cyc: Mesh | null = null;
  private cycGround: Mesh | null = null;
  private cycShown = 0;
  private cycWarm = CYC_WARM_FRAMES;
  private cycTurn = new Quaternion();
  private grid: Mesh | null = null;
  private tape: Mesh | null = null;
  private skyCanvas: HTMLCanvasElement | null = null;
  private groundCanvas: HTMLCanvasElement | null = null;
  /** The light last painted on the fill, the backdrop and the world. */
  private applied = '';
  private appliedFar = '';
  /** Frames until the world's sky is painted in the light last applied; 0 when it is. */
  private worldDue = 0;
  private stageTurn = new Quaternion();
  /** The light last given to the environment every surface reflects. */
  private reflected = '';
  private head = new Vector3();
  private floor = new Vector3();

  init(): void {
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      g.setLight.subscribe((light) => {
        if (isLight(light)) saveJson(StoreKey.Light, light);
      }),
      (g as unknown as { setFar: Signal<string> }).setFar.subscribe((far) => {
        if (isFar(far)) saveJson(StoreKey.Far, far);
      }),
      () => {
        (this.sky?.material as MeshBasicMaterial | undefined)?.map?.dispose();
        (this.ground?.material as MeshBasicMaterial | undefined)?.map?.dispose();
      },
    );
  }

  /** The light the set is in now. */
  current(): LightName {
    const light = (this.globals as Globals).setLight.peek();
    return isLight(light) ? light : 'studio';
  }

  update(delta: number, time: number): void {
    // A fire's light is never steady.
    FIRE_LIGHT.opacity = 0.52 + 0.16 * Math.sin(time * 11.3) + 0.1 * Math.sin(time * 23.9 + 1.3);
    if (!this.find()) return;
    const g = this.globals as Globals;
    const light = this.current();
    const look = LOOKS[light];
    // The light, or what stands on the horizon in it, changed: the set is lit and its skies painted again.
    const far = (g as unknown as { setFar: Signal<string> }).setFar.peek();
    if (light !== this.applied || far !== this.appliedFar) {
      this.applied = light;
      this.appliedFar = far;
      this.paint(look);
    }
    if (light !== this.reflected) this.reflect(light, look);
    // A light's output grows with the square of the set's size and its reach with the size, every frame, so the
    // set growing around a wearer stepping inside is lit as it will be at full size all the way up.
    const life = g.lifeSize.peek();
    // The world's sky waits its frames out, then for the designer to finish: never in a frame a piece lands in.
    if (this.worldDue > 1 && !life) this.worldDue--;
    else if (this.worldDue > 0 && (life || g.designing?.peek() !== true)) this.paintWorld(look);
    const scale = life ? this.stage!.scale.x : 1;
    // The grain is drawn in each piece's own coordinates and grows with the set: at full size it is a third as deep.
    GRAIN_FADE.value = 1 / Math.sqrt(scale);
    const key = this.key!;
    key.intensity = this.keyIntensity * look.keyPower * scale * scale;
    key.distance = this.keyDistance * scale;
    this.placeWorld(life);
    this.placeCyc(delta, look, life);
  }

  /** The key light, the fill, the lens backdrop and the stage, found once they exist. */
  private find(): boolean {
    if (this.key != null && this.fill != null && this.backdrop != null && this.stage != null) return true;
    this.stage ??= this.scene.getObjectByName('Stage') ?? null;
    if (this.key == null && this.stage != null) {
      let found: PointLight | null = null;
      this.stage.traverse((child) => {
        if (found == null && child instanceof PointLight && child.name !== 'MonitorGlow' && child.parent?.name !== 'Viewfinder') found = child;
      });
      const key = found as PointLight | null;
      if (key != null) {
        this.key = key;
        this.keyIntensity = key.intensity;
        this.keyDistance = key.distance;
      }
    }
    if (this.fill == null) {
      const fill = this.scene.getObjectByName('RoomFill');
      if (fill instanceof HemisphereLight) this.fill = fill;
    }
    if (this.backdrop == null) {
      const backdrop = this.scene.getObjectByName('LensBackdrop');
      if (backdrop instanceof Mesh) this.backdrop = backdrop;
    }
    return this.key != null && this.fill != null && this.backdrop != null && this.stage != null;
  }

  private paint(look: Look): void {
    this.key!.color.setHex(look.key);
    // The light sits in an object authored at studio's spot; it is moved within that, by the difference.
    const at = this.key!.parent?.position ?? ORIGIN;
    this.key!.position.set(look.keyAt[0] - at.x, look.keyAt[1] - at.y, look.keyAt[2] - at.z);
    // The set's own lights: windows lit from inside and the street lamp burning brighter as the light falls.
    WINDOW_GLASS.emissiveIntensity = 1.5 * look.practical;
    LAMP_GLOW.emissiveIntensity = 0.6 + 1.8 * look.practical;
    LAMP_POOL.opacity = 0.75 * look.practical;
    HEADLAMPS.emissiveIntensity = 1.25 * look.practical;
    TAIL_LAMPS.emissiveIntensity = 0.9 * look.practical;
    const fill = this.fill!;
    fill.color.setHex(look.sky);
    fill.groundColor.setHex(look.ground);
    fill.intensity = look.fill;
    // The sky behind the shot: the backdrop's own canvas, painted again, with its sun where the key light stands.
    const map = (this.backdrop!.material as MeshBasicMaterial).map;
    if (map != null && map.image instanceof HTMLCanvasElement) {
      paintSky(map.image, look, this.artOf(look), look.keyAt);
      map.needsUpdate = true;
    }
    this.ensureWorld();
    if (this.grid != null && this.tape != null) {
      ((this.grid.material as MeshBasicMaterial).color as Color).setHex(look.key);
      ((this.tape.material as MeshBasicMaterial).color as Color).setHex(look.key);
    }
    if (this.groundCanvas != null) {
      paintGround(this.groundCanvas, look);
      (this.ground!.material as MeshBasicMaterial).map!.needsUpdate = true;
    }
    // The world's own sky is four times the picture and seen only from inside the set: it is painted when the
    // wearer steps in, or a moment after the light changes, not in the frame the set's first pieces land in.
    this.worldDue = WORLD_PAINT_AFTER;
    // The monitor redraws with the new light.
    this.world.getSystem(ViewfinderSystem)?.refresh();
  }

  /** The sky around a wearer inside the set, painted in the set's light. */
  /** The light's sky with the scene's own horizon on it: a far city only lights its windows where the light has them lit. */
  private artOf(look: Look): SkyArt | null {
    const far = (this.globals as unknown as { setFar: Signal<string> }).setFar.peek();
    if (look.art == null || !isFar(far)) return look.art;
    return { ...look.art, far: far === 'open' ? null : far, windows: far === 'city' ? look.art.windows : null };
  }

  private paintWorld(look: Look): void {
    this.worldDue = 0;
    if (this.skyCanvas == null || this.sky == null) return;
    paintSky(this.skyCanvas, look, this.artOf(look), look.keyAt);
    (this.sky.material as MeshBasicMaterial).map!.needsUpdate = true;
  }

  /** The environment every surface reflects, in the set's light; the environment system rebuilds it once. */
  private reflect(light: LightName, look: Look): void {
    for (const entity of this.queries.environment.entities) {
      const { sky, equator, ground, power } = look.env;
      entity.getVectorView(IBLGradient, 'sky').set([...sky, 1]);
      entity.getVectorView(IBLGradient, 'equator').set([...equator, 1]);
      entity.getVectorView(IBLGradient, 'ground').set([...ground, 1]);
      entity.setValue(IBLGradient, 'intensity', power);
      entity.setValue(IBLGradient, '_needsUpdate', true);
      this.reflected = light;
      return;
    }
  }

  /** The sky and the ground around a set stepped inside, made once and hidden until then. */
  private ensureWorld(): void {
    if (this.sky != null) return;
    this.skyCanvas = document.createElement('canvas');
    this.skyCanvas.width = 2048;
    this.skyCanvas.height = 1024;
    const skyMap = new CanvasTexture(this.skyCanvas);
    skyMap.colorSpace = SRGBColorSpace;
    const sky = new Mesh(
      new SphereGeometry(WORLD_RADIUS, 32, 16),
      new MeshBasicMaterial({ map: skyMap, side: BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    sky.name = 'SetWorldSky';
    this.groundCanvas = document.createElement('canvas');
    this.groundCanvas.width = 128;
    this.groundCanvas.height = 128;
    const groundMap = new CanvasTexture(this.groundCanvas);
    groundMap.colorSpace = SRGBColorSpace;
    const ground = new Mesh(
      new CircleGeometry(WORLD_RADIUS, 48),
      new MeshBasicMaterial({ map: groundMap, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    ground.name = 'SetWorldGround';
    ground.rotation.x = -Math.PI / 2;
    // The same picture, behind the set on the table.
    const cyc = new Mesh(
      cycGeometry(),
      new MeshBasicMaterial({ map: skyMap, vertexColors: true, side: BackSide, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    cyc.name = 'SetCyc';
    awayOnly(cyc.material as MeshBasicMaterial);
    this.cyc = cyc;
    const cycGround = new Mesh(
      cycGroundGeometry(),
      new MeshBasicMaterial({ map: groundMap, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    cycGround.name = 'SetCycGround';
    this.cycGround = cycGround;
    for (const mesh of [sky, ground, cyc, cycGround]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.renderOrder = -2;
      const entity = this.world.createTransformEntity(mesh);
      if (entity.object3D) entity.object3D.pointerEvents = 'none';
    }
    this.sky = sky;
    this.ground = ground;
    const cell = document.createElement('canvas');
    cell.width = 64;
    cell.height = 64;
    paintGridCell(cell);
    const cells = new CanvasTexture(cell);
    cells.wrapS = RepeatWrapping;
    cells.wrapT = RepeatWrapping;
    cells.repeat.set(GRID_REACH * 2, GRID_REACH * 2);
    cells.anisotropy = 4;
    // In the stage's own units: a tenth of a metre there is a metre at full size.
    const grid = new Mesh(
      new CircleGeometry(GRID_REACH / LIFE_SCALE, 48),
      new MeshBasicMaterial({ map: cells, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    grid.name = 'SetFloorGrid';
    const strip = document.createElement('canvas');
    strip.width = 768;
    strip.height = 512;
    paintStageTape(strip);
    const tape = new Mesh(
      new PlaneGeometry(0.6, 0.4),
      new MeshBasicMaterial({ map: new CanvasTexture(strip), transparent: true, opacity: 0, depthWrite: false, toneMapped: false, fog: false }),
    );
    tape.name = 'SetFloorStage';
    for (const mesh of [grid, tape]) {
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.renderOrder = -1;
      (mesh as Mesh & { pointerEvents?: string }).pointerEvents = 'none';
    }
    grid.position.y = 0.0002;
    tape.position.y = 0.0003;
    this.grid = grid;
    this.tape = tape;
    // The shot's own sky is the lens backdrop; the world around a wearer is not in the picture.
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    viewfinder?.hideFromLens(sky);
    viewfinder?.hideFromLens(ground);
    viewfinder?.hideFromLens(cyc);
    viewfinder?.hideFromLens(cycGround);
    viewfinder?.hideFromLens(grid);
    viewfinder?.hideFromLens(tape);
  }

  /**
   * On the table the scene's sky stands behind the set, once it is painted: not on a bare stage (studio and the
   * spotlight have no sky), not while the set is being landed, and not once the wearer has stepped inside, where
   * the whole sky takes over. It goes where the set goes, turned with it, so its sun is where the key light is.
   */
  private placeCyc(delta: number, look: Look, life: boolean): void {
    const cyc = this.cyc;
    if (cyc == null) return;
    const g = this.globals as Globals;
    if (this.cycWarm > 0) {
      // Drawn at nothing for a few frames as the page loads: the renderer compiles a shader the first time it draws
      // with it, and that must not be the frame a set's first pieces land in.
      this.cycWarm--;
      cyc.visible = this.cycWarm > 0;
      this.cycGround!.visible = cyc.visible;
      (cyc.material as MeshBasicMaterial).opacity = 0;
      (this.cycGround!.material as MeshBasicMaterial).opacity = 0;
      cyc.position.copy(this.stage!.getWorldPosition(this.floor));
      this.cycGround!.position.copy(this.floor);
      return;
    }
    const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const want = inSession && !life && look.art != null && this.worldDue === 0 && this.stage!.visible && g.worldOn?.peek() !== false;
    this.cycShown += ((want ? CYC_COVER : 0) - this.cycShown) * Math.min(1, delta * (want ? CYC_COMES : CYC_GOES));
    const show = this.cycShown > 0.004;
    const ground = this.cycGround!;
    cyc.visible = show;
    ground.visible = show;
    if (!show) return;
    (cyc.material as MeshBasicMaterial).opacity = this.cycShown;
    (ground.material as MeshBasicMaterial).opacity = this.cycShown;
    cyc.position.copy(this.stage!.getWorldPosition(this.floor));
    cyc.quaternion.copy(this.stage!.getWorldQuaternion(this.stageTurn));
    // The ground lies a hair under the set's floor, its solid side away from the wearer.
    this.player.head.getWorldPosition(this.head);
    ground.position.set(this.floor.x, this.floor.y - CYC_GROUND_UNDER, this.floor.z);
    ground.rotation.y = Math.atan2(this.head.x - this.floor.x, this.head.z - this.floor.z);
    // The way to the wearer, flat, in the band's own frame.
    this.head.sub(this.floor).applyQuaternion(this.cycTurn.copy(this.stageTurn).invert());
    const flat = Math.hypot(this.head.x, this.head.z);
    if (flat > 1e-4) CYC_TOWARD.value.set(this.head.x / flat, this.head.z / flat);
  }

  /**
   * At full size the world is around the wearer, its ground on the set's floor, and it comes up as the set grows
   * (the step inside takes a second): at the table it is not there at all.
   */
  private placeWorld(life: boolean): void {
    const sky = this.sky;
    const ground = this.ground;
    if (sky == null || ground == null) return;
    const inSession = this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    // How far the set has grown, by eye: it grows evenly in proportion, ten times over.
    const grown = life && inSession ? Math.min(1, Math.log(Math.max(1, this.stage!.scale.x)) / Math.log(LIFE_SCALE)) : 0;
    const show = grown > 0.001;
    sky.visible = show;
    ground.visible = show;
    const grid = this.grid;
    const tape = this.tape;
    if (grid != null && tape != null) {
      // They lie on the stage, so they go where it goes.
      if (grid.parent !== this.stage) {
        this.stage!.add(grid);
        this.stage!.add(tape);
      }
      grid.visible = show;
      tape.visible = show;
    }
    if (!show) return;
    const cover = WORLD_COVER * grown;
    (sky.material as MeshBasicMaterial).opacity = cover;
    (ground.material as MeshBasicMaterial).opacity = cover;
    if (grid != null && tape != null) {
      (grid.material as MeshBasicMaterial).opacity = cover * GRID_SHOWS;
      (tape.material as MeshBasicMaterial).opacity = cover * STAGE_SHOWS;
    }
    this.player.head.getWorldPosition(this.head);
    this.stage!.getWorldPosition(this.floor);
    sky.position.set(this.head.x, this.floor.y, this.head.z);
    // Turned with the set, so its sun stands where the set's key light comes from.
    sky.quaternion.copy(this.stage!.getWorldQuaternion(this.stageTurn));
    ground.position.set(this.head.x, this.floor.y - 0.003, this.head.z);
  }
}
