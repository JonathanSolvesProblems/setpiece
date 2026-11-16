/**
 * The light the set is in: studio, day, golden hour, night or overcast, chosen by the set designer from the
 * sentence ("a night chase" is night) or kept from the set before. It sets the key light's colour and strength,
 * the room's fill, the sky behind the shot in the lens (and so in every frame on the board), and the world around
 * a set stepped inside: a sky and a ground in that light, through which the real room still shows faintly, so a
 * wearer walking the set at full size can still see where the furniture is.
 */
import {
  BackSide,
  CanvasTexture,
  CircleGeometry,
  createSystem,
  HemisphereLight,
  IBLGradient,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { isLight } from './director-plan.js';
import type { LightName } from './director-plan.js';
import { saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';
import { GRAIN_FADE } from './wood-grain.js';
import { LAMP_GLOW, LAMP_POOL, WINDOW_GLASS } from './scene-assets/lib/practicals.js';
import { paintSky } from './sky-paint.js';
import type { SkyArt } from './sky-paint.js';

/** The set is 1:10, so a light's output grows by a hundred and its reach by ten at full size. */
const LIFE_SCALE = 10;
/** How much of the world around a set stepped inside covers the room: the rest of the room shows through. */
const WORLD_COVER = 0.9;
const WORLD_RADIUS = 60;
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

type Globals = { setLight: Signal<string>; lifeSize: Signal<boolean> };

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
  private skyCanvas: HTMLCanvasElement | null = null;
  private groundCanvas: HTMLCanvasElement | null = null;
  /** The light last painted on the fill, the backdrop and the world. */
  private applied = '';
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

  update(): void {
    if (!this.find()) return;
    const g = this.globals as Globals;
    const light = this.current();
    const look = LOOKS[light];
    if (light !== this.applied) {
      this.applied = light;
      this.paint(look);
    }
    if (light !== this.reflected) this.reflect(light, look);
    // A light's output grows with the square of the set's size and its reach with the size, every frame, so the
    // set growing around a wearer stepping inside is lit as it will be at full size all the way up.
    const life = g.lifeSize.peek();
    if (this.worldDue > 0 && (life || --this.worldDue === 0)) this.paintWorld(look);
    const scale = life ? this.stage!.scale.x : 1;
    // The grain is drawn in each piece's own coordinates and grows with the set: at full size it is a third as deep.
    GRAIN_FADE.value = 1 / Math.sqrt(scale);
    const key = this.key!;
    key.intensity = this.keyIntensity * look.keyPower * scale * scale;
    key.distance = this.keyDistance * scale;
    this.placeWorld(life);
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
    const fill = this.fill!;
    fill.color.setHex(look.sky);
    fill.groundColor.setHex(look.ground);
    fill.intensity = look.fill;
    // The sky behind the shot: the backdrop's own canvas, painted again, with its sun where the key light stands.
    const map = (this.backdrop!.material as MeshBasicMaterial).map;
    if (map != null && map.image instanceof HTMLCanvasElement) {
      paintSky(map.image, look, look.art, look.keyAt);
      map.needsUpdate = true;
    }
    this.ensureWorld();
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
  private paintWorld(look: Look): void {
    this.worldDue = 0;
    if (this.skyCanvas == null || this.sky == null) return;
    paintSky(this.skyCanvas, look, look.art, look.keyAt);
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
    for (const mesh of [sky, ground]) {
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.raycast = () => {};
      mesh.renderOrder = -2;
      const entity = this.world.createTransformEntity(mesh);
      if (entity.object3D) entity.object3D.pointerEvents = 'none';
    }
    this.sky = sky;
    this.ground = ground;
    // The shot's own sky is the lens backdrop; the world around a wearer is not in the picture.
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    viewfinder?.hideFromLens(sky);
    viewfinder?.hideFromLens(ground);
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
    if (!show) return;
    const cover = WORLD_COVER * grown;
    (sky.material as MeshBasicMaterial).opacity = cover;
    (ground.material as MeshBasicMaterial).opacity = cover;
    this.player.head.getWorldPosition(this.head);
    this.stage!.getWorldPosition(this.floor);
    sky.position.set(this.head.x, this.floor.y, this.head.z);
    // Turned with the set, so its sun stands where the set's key light comes from.
    sky.quaternion.copy(this.stage!.getWorldQuaternion(this.stageTurn));
    ground.position.set(this.head.x, this.floor.y - 0.003, this.head.z);
  }
}
