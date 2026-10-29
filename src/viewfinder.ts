/**
 * Setpiece viewfinder. Renders the shot camera's view into a texture shown on a
 * monitor above the stage, draws actor-to-creature eyelines, and captures
 * storyboard frames on request. All distances reported to the panel are in
 * real set metres (stage scale is 1:10).
 */
import {
  AssetManager,
  AudioUtils,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  createSystem,
  Entity,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { SetPiece, SetRole, ShotCamera } from './set-components.js';

/** One miniature metre on the stage is ten real metres on set. */
export const SET_SCALE = 10;
/** Vertical sensor size of a 36 mm wide full-frame sensor cropped to 16:9. */
const SENSOR_HEIGHT_MM = 20.25;
const RT_WIDTH = 640;
const RT_HEIGHT = 360;
const MAX_FRAMES = 6;
const FRAME_WIDTH = 0.1;
const FRAME_GAP = 0.011;
const FRAME_COLUMNS = 3;
/** The storyboard card: three frames wide, two high, the width of the monitor. */
const CARD_WIDTH = FRAME_WIDTH * FRAME_COLUMNS + FRAME_GAP * (FRAME_COLUMNS + 1);
const CARD_HEIGHT = ((FRAME_WIDTH * 9) / 16) * 2 + FRAME_GAP * 3;

const MAX_ACTORS = 4;
const TEXT_EVERY_N_FRAMES = 12;
/** Monitor pose relative to the stage origin, so it travels with the stage. */
const MONITOR_LOCAL: [number, number, number] = [0, 0.37, -0.31];
const CARD_CENTER_Y = MONITOR_LOCAL[1] - 0.102 - CARD_HEIGHT / 2 - 0.008;
const OPTIC_YELLOW = 0xd6e13c;
const SLATE_SHADOW = 0x1e232b;
const TALLY_RED = 0xe0352b;
const MONITOR_GLOW = 0xdfe8ff;
/** The lens aims this far below the nearest actor's eyes, so the eyes sit high in frame. */
const AIM_BELOW_EYES = 0.012;
const MAX_TILT = 0.6;

export interface Shot {
  index: number;
  lensMm: number;
  cameraHeightM: number;
  distanceToCreatureM: number;
  eyelineDeg: number;
  dataUrl: string;
}

type Globals = {
  lensMm: Signal<number>;
  snapRequested: Signal<number>;
  eyelineText: Signal<string[]>;
  shotList: Signal<string[]>;
  shotFrames: Signal<Shot[]>;
};

type AsyncReader = WebGLRenderer & {
  readRenderTargetPixelsAsync?: (
    target: WebGLRenderTarget,
    x: number,
    y: number,
    width: number,
    height: number,
    buffer: Uint8Array,
  ) => Promise<Uint8Array>;
};

export class ViewfinderSystem extends createSystem({
  cams: { required: [ShotCamera] },
  pieces: { required: [SetPiece] },
}) {
  private target!: WebGLRenderTarget;
  private lensCamera!: PerspectiveCamera;
  private monitor: Mesh | null = null;
  private stageEntity: Entity | null = null;
  private tally: MeshStandardMaterial | null = null;
  private lines: Line[] = [];
  private frames: (Entity | null)[] = [];
  private shots: Shot[] = [];
  private actors: Entity[] = [];
  private rises = new Float32Array(MAX_ACTORS);
  private runs = new Float32Array(MAX_ACTORS);
  private frameCount = 0;
  private snapPending = false;
  private prevClear = new Color();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();

  init(): void {
    // The key light in the scene casts; the renderer has to be told to draw shadows.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.target = new WebGLRenderTarget(RT_WIDTH, RT_HEIGHT);
    this.target.texture.colorSpace = SRGBColorSpace;
    this.lensCamera = new PerspectiveCamera(40, RT_WIDTH / RT_HEIGHT, 0.02, 50);
    this.lensCamera.name = 'ShotLens';

    // The monitor is created once the stage entity exists; see ensureMonitor().

    const attach = (entity: Entity) => {
      entity.object3D?.add(this.lensCamera);
      // Just in front of the lens barrel, so the rig's own body is never in frame.
      this.lensCamera.position.set(0, 0.118, -0.06);
    };
    this.queries.cams.entities.forEach(attach);
    this.cleanupFuncs.push(
      this.queries.cams.subscribe('qualify', attach),
      this.queries.cams.subscribe('disqualify', () => this.lensCamera.removeFromParent()),
    );

    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      g.lensMm.subscribe((mm) => this.setLens(mm)),
      g.snapRequested.subscribe((n) => {
        if (n > 0) this.snapPending = true;
      }),
      () => this.target.dispose(),
    );
  }

  getShots(): readonly Shot[] {
    return this.shots;
  }

  /**
   * The storyboard card before any frame is snapped: six pencil frames on
   * paper, numbered in the stencil, so the card reads as a page and not a plank.
   */
  private drawCard(): CanvasTexture {
    const W = 1024;
    const H = Math.round((W * CARD_HEIGHT) / CARD_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const draw = (): void => {
      const ctx = canvas.getContext('2d');
      if (ctx == null) return;
      ctx.fillStyle = '#f5f6e5';
      ctx.fillRect(0, 0, W, H);
      const px = W / CARD_WIDTH;
      const frameW = FRAME_WIDTH * px;
      const frameH = ((FRAME_WIDTH * 9) / 16) * px;
      const gap = FRAME_GAP * px;
      ctx.strokeStyle = '#87877d';
      ctx.lineWidth = 3;
      ctx.fillStyle = '#585752';
      ctx.font = `700 ${Math.round(gap * 1.6)}px "Big Shoulders Stencil"`;
      ctx.textBaseline = 'top';
      for (let i = 0; i < MAX_FRAMES; i++) {
        const x = gap + (i % FRAME_COLUMNS) * (frameW + gap);
        const y = gap + Math.floor(i / FRAME_COLUMNS) * (frameH + gap);
        ctx.strokeRect(x + 1.5, y + 1.5, frameW - 3, frameH - 3);
        ctx.fillText(String(i + 1), x + 8, y + 5);
      }
      texture.needsUpdate = true;
    };
    draw();
    void document.fonts.load('700 24px "Big Shoulders Stencil"').then(draw);
    return texture;
  }

  /** The monitor is a child of the stage, so it travels wherever the stage is placed. */
  private ensureMonitor(): boolean {
    if (this.monitor != null) return true;
    const stage = this.findRole(SetRole.Stage);
    if (stage?.object3D == null) return false;
    this.stageEntity = stage;
    const monitor = new Mesh(
      new PlaneGeometry(0.32, 0.18),
      new MeshBasicMaterial({ map: this.target.texture, toneMapped: false }),
    );
    monitor.name = 'Viewfinder';
    this.world.createTransformEntity(monitor, { parent: stage });
    monitor.position.set(...MONITOR_LOCAL);
    monitor.rotation.x = -0.15;
    // A director's monitor: the one bordered object on the stage (charter law 9).
    const bezel = new Mesh(
      new BoxGeometry(0.344, 0.204, 0.01),
      new MeshStandardMaterial({ color: SLATE_SHADOW, roughness: 0.9 }),
    );
    bezel.name = 'Bezel';
    bezel.position.z = -0.0055;
    monitor.add(bezel);
    this.tally = new MeshStandardMaterial({ color: TALLY_RED, emissive: TALLY_RED, emissiveIntensity: 0.35 });
    const tally = new Mesh(new PlaneGeometry(0.006, 0.006), this.tally);
    tally.name = 'Tally';
    tally.position.set(0.164, 0.094, 0.0002);
    monitor.add(tally);
    // The monitor is a practical: a little cool light on whatever stands in front of it.
    const glow = new PointLight(MONITOR_GLOW, 0.3, 0.5, 2);
    glow.name = 'MonitorGlow';
    glow.position.set(0, -0.03, 0.06);
    monitor.add(glow);
    // The frames sit on a strip of camera-report paper under the monitor.
    const paper = AssetManager.getTexture('paper');
    if (paper) {
      paper.wrapS = RepeatWrapping;
      paper.wrapT = RepeatWrapping;
      paper.repeat.set(4, 1);
      paper.colorSpace = SRGBColorSpace;
    }
    void paper;
    const card = new Mesh(
      new PlaneGeometry(CARD_WIDTH, CARD_HEIGHT),
      new MeshStandardMaterial({ color: 0xffffff, map: this.drawCard(), roughness: 1 }),
    );
    card.name = 'StoryboardCard';
    this.world.createTransformEntity(card, { parent: stage });
    card.position.set(MONITOR_LOCAL[0], CARD_CENTER_Y, MONITOR_LOCAL[2] - 0.001);
    card.rotation.x = -0.15;
    // Chalk haze on the slate plate, cloned so the shared material stays clean.
    const plate = stage.object3D.getObjectByName('Plate') as Mesh | undefined;
    const haze = AssetManager.getTexture('chalk-haze');
    if (plate && haze) {
      haze.wrapS = RepeatWrapping;
      haze.wrapT = RepeatWrapping;
      haze.repeat.set(3, 2);
      haze.colorSpace = SRGBColorSpace;
      const material = (plate.material as MeshStandardMaterial).clone();
      material.map = haze;
      plate.material = material;
    }
    this.dressPieces();
    this.monitor = monitor;
    return true;
  }

  /** Wood grain on the lay figures and a seam on the tennis ball, drawn once. */
  private dressPieces(): void {
    const grain = document.createElement('canvas');
    grain.width = 256;
    grain.height = 256;
    const g = grain.getContext('2d');
    if (g) {
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 1) {
        const wobble = Math.sin(y * 0.09) * 6 + Math.sin(y * 0.31) * 2;
        const shade = 190 + Math.round(Math.sin(y * 0.45 + wobble * 0.2) * 28 + Math.sin(y * 1.7) * 10);
        g.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
        g.fillRect(0, y, 256, 1);
      }
    }
    const grainTexture = new CanvasTexture(grain);
    grainTexture.wrapS = RepeatWrapping;
    grainTexture.wrapT = RepeatWrapping;
    grainTexture.repeat.set(2, 3);
    const seam = document.createElement('canvas');
    seam.width = 512;
    seam.height = 256;
    const c = seam.getContext('2d');
    if (c) {
      c.fillStyle = '#d6e13c';
      c.fillRect(0, 0, 512, 256);
      c.strokeStyle = '#f6f7ef';
      c.lineWidth = 9;
      c.beginPath();
      for (let x = 0; x <= 512; x += 4) {
        const y = 128 + Math.sin((x / 512) * Math.PI * 2) * 78;
        if (x === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.stroke();
    }
    const seamTexture = new CanvasTexture(seam);
    seamTexture.colorSpace = SRGBColorSpace;
    for (const piece of this.queries.pieces.entities) {
      piece.object3D?.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        const material = object.material as MeshStandardMaterial;
        if (object.name === 'EyelineBall') {
          const felt = material.clone();
          felt.map = seamTexture;
          felt.color.set(0xffffff);
          object.material = felt;
        } else if (/^(Torso|Chest|Head|Leg|Arm|Hand)/.test(object.name)) {
          const wood = material.clone();
          wood.map = grainTexture;
          object.material = wood;
        }
        object.castShadow = true;
        object.receiveShadow = true;
      });
    }
  }

  private setLens(mm: number): void {
    this.lensCamera.fov = (2 * Math.atan(SENSOR_HEIGHT_MM / (2 * mm)) * 180) / Math.PI;
    this.lensCamera.updateProjectionMatrix();
    for (const cam of this.queries.cams.entities) cam.setValue(ShotCamera, 'lensMm', mm);
  }

  update(): void {
    const cam = this.queries.cams.entities.values().next().value as Entity | undefined;
    if (cam?.object3D == null || !this.ensureMonitor()) return;
    this.updateEyelines();
    this.aimLens();
    this.renderViewfinder();
    if (this.snapPending) {
      this.snapPending = false;
      void this.captureFrame(cam);
    }
  }

  private findRole(role: string): Entity | undefined {
    for (const piece of this.queries.pieces.entities) {
      if (piece.getValue(SetPiece, 'role') === role) return piece;
    }
    return undefined;
  }

  /** World-space eye point of a piece, honouring its rotation. */
  private eyePoint(piece: Entity, out: Vector3): Vector3 {
    const object = piece.object3D!;
    object.updateWorldMatrix(true, false);
    out.set(0, piece.getValue(SetPiece, 'eyeHeight') ?? 0, 0);
    return object.localToWorld(out);
  }

  private ensureLine(i: number): Line {
    let line = this.lines[i];
    if (line == null) {
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
      line = new Line(geometry, new LineBasicMaterial({ color: OPTIC_YELLOW }));
      line.name = `Eyeline${i + 1}`;
      line.frustumCulled = false;
      this.world.createTransformEntity(line);
      this.lines[i] = line;
    }
    return line;
  }

  private updateEyelines(): void {
    const creature = this.findRole(SetRole.Creature);
    this.actors.length = 0;
    for (const piece of this.queries.pieces.entities) {
      if (piece.getValue(SetPiece, 'role') === SetRole.Actor && this.actors.length < MAX_ACTORS) {
        this.actors.push(piece);
      }
    }
    if (creature?.object3D == null) return;
    this.eyePoint(creature, this.c);
    for (let i = 0; i < this.actors.length; i++) {
      const actor = this.actors[i];
      if (actor.object3D == null) continue;
      this.eyePoint(actor, this.a);
      const line = this.ensureLine(i);
      const position = line.geometry.getAttribute('position') as Float32BufferAttribute;
      position.setXYZ(0, this.a.x, this.a.y, this.a.z);
      position.setXYZ(1, this.c.x, this.c.y, this.c.z);
      position.needsUpdate = true;
      line.visible = true;
      this.rises[i] = this.c.y - this.a.y;
      this.runs[i] = Math.hypot(this.c.x - this.a.x, this.c.z - this.a.z);
    }
    for (let i = this.actors.length; i < this.lines.length; i++) this.lines[i].visible = false;
    if (this.frameCount++ % TEXT_EVERY_N_FRAMES === 0) this.publishEyelineText();
  }

  /**
   * The user aims the rig; the lens tilts on its own toward the nearest actor's
   * eyes, the way an operator keeps the subject's eyes in the upper part of the
   * frame. Yaw stays with the rig, so a long lens still lands on a face.
   */
  private aimLens(): void {
    this.lensCamera.getWorldPosition(this.b);
    let nearest = Infinity;
    let pitch = 0;
    for (const actor of this.actors) {
      if (actor.object3D == null) continue;
      this.eyePoint(actor, this.a);
      const run = Math.hypot(this.a.x - this.b.x, this.a.z - this.b.z);
      if (run < nearest) {
        nearest = run;
        pitch = Math.atan2(this.a.y - AIM_BELOW_EYES - this.b.y, run);
      }
    }
    this.lensCamera.rotation.x = Math.max(-MAX_TILT, Math.min(MAX_TILT, pitch));
  }

  private eyelineDeg(i: number): number {
    return (Math.atan2(this.rises[i], this.runs[i]) * 180) / Math.PI;
  }

  private publishEyelineText(): void {
    const lines: string[] = [];
    for (let i = 0; i < this.actors.length; i++) {
      const label = this.actors[i].getValue(SetPiece, 'label') || `Actor ${i + 1}`;
      const deg = this.eyelineDeg(i);
      const rise = this.rises[i] * SET_SCALE;
      const run = this.runs[i] * SET_SCALE;
      lines.push(
        `${label}: look ${deg >= 0 ? 'up' : 'down'} ${Math.abs(deg).toFixed(0)} deg, ` +
          `eye ${Math.abs(rise).toFixed(1)} m ${rise >= 0 ? 'above' : 'below'}, ${run.toFixed(1)} m away`,
      );
    }
    const g = this.globals as Globals;
    const current = g.eyelineText.value;
    if (current.length === lines.length && current.every((l, i) => l === lines[i])) return;
    g.eyelineText.value = lines;
  }

  /** Off-screen pass from the shot camera, inside the same XR frame. */
  private renderViewfinder(): void {
    const renderer = this.renderer;
    const xr = renderer.xr;
    const xrWasEnabled = xr.enabled;
    const prevTarget = renderer.getRenderTarget();
    const prevAutoClear = renderer.autoClear;
    renderer.getClearColor(this.prevClear);
    const prevAlpha = renderer.getClearAlpha();

    const monitor = this.monitor!;
    monitor.visible = false;
    xr.enabled = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x0f1114, 1);
    renderer.autoClear = true;
    renderer.render(this.scene, this.lensCamera);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.prevClear, prevAlpha);
    renderer.autoClear = prevAutoClear;
    xr.enabled = xrWasEnabled;
    monitor.visible = true;
  }

  private async captureFrame(cam: Entity): Promise<void> {
    const w = RT_WIDTH;
    const h = RT_HEIGHT;
    const pixels = new Uint8Array(w * h * 4);
    const renderer = this.renderer as AsyncReader;
    if (renderer.readRenderTargetPixelsAsync) {
      await renderer.readRenderTargetPixelsAsync(this.target, 0, 0, w, h, pixels);
    } else {
      renderer.readRenderTargetPixels(this.target, 0, 0, w, h, pixels);
    }
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      image.data.set(pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    }
    ctx.putImageData(image, 0, 0);

    const stage = this.findRole(SetRole.Stage);
    const creature = this.findRole(SetRole.Creature);
    this.lensCamera.getWorldPosition(this.a);
    const stageY = stage?.object3D ? stage.object3D.getWorldPosition(this.b).y : this.a.y;
    let distance = 0;
    if (creature?.object3D) {
      creature.object3D.getWorldPosition(this.b);
      distance = Math.hypot(this.b.x - this.a.x, this.b.z - this.a.z);
    }
    const g = this.globals as Globals;
    const shot: Shot = {
      index: this.shots.length + 1,
      lensMm: g.lensMm.peek(),
      cameraHeightM: (this.a.y - stageY) * SET_SCALE,
      distanceToCreatureM: distance * SET_SCALE,
      eyelineDeg: this.actors.length > 0 ? this.eyelineDeg(0) : 0,
      dataUrl: canvas.toDataURL('image/png'),
    };
    this.shots.push(shot);
    this.placeThumbnail(canvas, shot.index);
    AudioUtils.play(cam);
    if (this.tally) {
      this.tally.emissiveIntensity = 2.5;
      setTimeout(() => {
        if (this.tally) this.tally.emissiveIntensity = 0.35;
      }, 240);
    }
    g.shotList.value = this.shots
      .slice(-MAX_FRAMES)
      .map(
        (s) =>
          `${s.index}. ${s.lensMm} mm, cam ${s.cameraHeightM.toFixed(1)} m high, ` +
          `${s.distanceToCreatureM.toFixed(1)} m from creature`,
      );
    g.shotFrames.value = this.shots.slice(-MAX_FRAMES);
  }

  private placeThumbnail(canvas: HTMLCanvasElement, index: number): void {
    const slot = (index - 1) % MAX_FRAMES;
    this.frames[slot]?.dispose();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const mesh = new Mesh(
      new PlaneGeometry(FRAME_WIDTH, (FRAME_WIDTH * 9) / 16),
      new MeshBasicMaterial({ map: texture, toneMapped: false }),
    );
    mesh.name = `Frame${index}`;
    const entity = this.world.createTransformEntity(mesh, { parent: this.stageEntity ?? undefined });
    const column = slot % FRAME_COLUMNS;
    const row = Math.floor(slot / FRAME_COLUMNS);
    const frameHeight = (FRAME_WIDTH * 9) / 16;
    const x = -CARD_WIDTH / 2 + FRAME_GAP + FRAME_WIDTH / 2 + column * (FRAME_WIDTH + FRAME_GAP);
    const y = CARD_HEIGHT / 2 - FRAME_GAP - frameHeight / 2 - row * (frameHeight + FRAME_GAP);
    mesh.position.set(MONITOR_LOCAL[0] + x, CARD_CENTER_Y + y, MONITOR_LOCAL[2] + 0.0005);
    mesh.rotation.x = -0.15;
    this.frames[slot] = entity;
  }
}
