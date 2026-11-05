/**
 * Setpiece viewfinder. Renders the shot camera's view into a texture shown on a
 * monitor above the stage, draws actor-to-creature eyelines, and captures
 * storyboard frames on request. All distances reported to the panel are in
 * real set metres (stage scale is 1:10).
 */
import {
  AssetManager,
  AudioUtils,
  BackSide,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  Color,
  createSystem,
  Entity,
  Group,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  RayInteractable,
  PointLight,
  RepeatWrapping,
  Sprite,
  SpriteMaterial,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  WebGLRenderTarget,
} from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { BRIEFS } from './briefs.js';
import type { Measure, PieceInFrame } from './briefs.js';
import { SENSORS } from './camera-formats.js';
import { CAMERA_TILT_LIMIT, SetPiece, SetRole, ShotCamera } from './set-components.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';

/** One miniature metre on the stage is ten real metres on set. */
export const SET_SCALE = 10;
const RT_WIDTH = 640;
const RT_HEIGHT = 360;
const MAX_FRAMES = 6;
const FRAME_WIDTH = 0.1;
const FRAME_HEIGHT = (FRAME_WIDTH * 9) / 16;
const FRAME_GAP = 0.011;
const FRAME_COLUMNS = 3;
/** Meshes other systems hang on the pieces to make them easy to pick up. */
const HELPER_NAMES = new Set(['GrabVolume', 'HoverRing', 'StageHandle', 'HandleGlow', 'HandleLabel', 'EffectParticles']);
/** Two lines under each frame: the lens and camera, then each actor's eyeline. */
const CAPTION_HEIGHT = 0.019;
/** The storyboard card: three frames wide, two high, the width of the monitor. */
const CARD_WIDTH = FRAME_WIDTH * FRAME_COLUMNS + FRAME_GAP * (FRAME_COLUMNS + 1);
const CARD_HEIGHT = (FRAME_HEIGHT + CAPTION_HEIGHT) * 2 + FRAME_GAP * 3;
const CARD_PIXELS = 2048;
/** Camera-report paper, toned down: a white card is the brightest thing in a dim room. */
const PAPER = '#dcdccb';
const PENCIL = '#87877d';
/** An empty slot is unexposed: slate, with its number and what fills it in chalk. */
const SLOT_EMPTY = '#3f4044';
const CHALK = '#f6f7ef';
const CHALK_DUST = '#c7c7b7';
const INK = '#1e232b';
const INK_SOFT = '#585752';

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
/** The camera head pivots at the top of the tripod; these parts of the rig ride it. */
const HEAD_PIVOT_Y = 0.112;
const HEAD_PARTS = /^(Body|Magazine|Lens|FocusRing|MatteBox|Eyepiece|Tally)/;
/** The studio the shot lens sees around the set: 25 m away at the set's scale. */
const BACKDROP_RADIUS = 2.5;
/**
 * Frames to keep drawing the shadows and the monitor after the set last
 * changed, and after the page or a session starts while textures arrive.
 */
const LIVE_AFTER_CHANGE = 3;
const LIVE_AT_START = 90;
const TAG_WIDTH = 0.07;
const TAG_LIFT = 0.028;

export interface Shot {
  index: number;
  lensMm: number;
  cameraHeightM: number;
  distanceToCreatureM: number;
  eyelineDeg: number;
  /** Every actor's eyeline when the frame was taken, as the crew reads it: "A up 30° · B up 35°". */
  eyelines: string;
  dataUrl: string;
  /** Where everything stood when the frame was taken, so the set can go back to it. */
  setup?: Setup;
  /** The brief this frame met, stamped on the board. */
  printed?: string;
  /** The format, when it is not full frame. */
  format?: string;
}

/** The blocking behind a frame: each piece's pose on the slate, the lens, and the camera head's tilt. */
export interface Setup {
  pieces: Record<string, number[]>;
  lensMm: number;
  tilt: number;
  aimed: boolean;
  sensor?: number;
  rig?: string;
  /** Which assets were on the set. */
  on?: string[];
}

/** The board as it is kept between visits: the frames on the card and how many were ever taken. */
type SavedBoard = { taken: number; shots: Shot[] };

type Globals = {
  lensMm: Signal<number>;
  snapRequested: Signal<number>;
  eyelineText: Signal<string[]>;
  shotList: Signal<string[]>;
  shotFrames: Signal<Shot[]>;
  newBoardRequested: Signal<number>;
  takeState: Signal<string>;
  setupRecalled: Signal<number>;
  coachNote: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  effectsOn: Signal<number>;
  trayOn: Signal<string[]>;
  trayRestore: Signal<string[] | null>;
  briefIndex: Signal<number>;
  briefPrinted: Signal<number>;
  briefSkip: Signal<number>;
};
type SavedBriefs = { index: number; printed: string[] };
/** While an effect runs, the monitor is redrawn on one frame in this many. */
const EFFECT_LENS_EVERY = 3;
/** What a pointer event on the card carries that is used here. */
type CardEvent = { point?: Vector3; stopPropagation?: () => void };
type CardTarget = { addEventListener(type: string, listener: (event: CardEvent) => void): void };
/** The monitor's tally at rest, and its two brightnesses while a take records. */
const TALLY_REST = 0.35;
const TALLY_ON = 2.6;
const TALLY_OFF = 0.1;

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
  private cameraHead: Group | null = null;
  private backdrop: Mesh | null = null;
  private stageEntity: Entity | null = null;
  private tally: MeshStandardMaterial | null = null;
  private lines: Line[] = [];
  /**
   * Name tags, eyelines, the storyboard card, the control panel and the user's
   * own hands are for the viewer, not the shot. They are hidden for the lens
   * pass rather than put on a render layer: in WebXR three.js gives the left and
   * right eye cameras only layers 0 to 2, and layers 1 and 2 are one eye each.
   */
  private overlays: Object3D[] = [];
  private panelHidden = false;
  /** Each overlay's visibility before the lens pass, reused every frame. */
  private overlayShown: boolean[] = [];
  /** The frames on the card, oldest first, six at most, and the picture drawn for each. */
  private shots: Shot[] = [];
  private thumbs: CanvasImageSource[] = [];
  /** How many frames this board has ever taken; a frame keeps its number when older ones drop off. */
  private taken = 0;
  private boardCanvas!: HTMLCanvasElement;
  private boardTexture!: CanvasTexture;
  private boardSeen = 0;
  private actors: Entity[] = [];
  private rises = new Float32Array(MAX_ACTORS);
  private runs = new Float32Array(MAX_ACTORS);
  private frameCount = 0;
  private snapPending = false;
  /**
   * The key light's shadow is six passes and the monitor is a second view of
   * the whole set. Neither changes while the set is still, so both are drawn
   * only on frames where a piece, the stage or the lens has moved.
   */
  private liveFrames = LIVE_AT_START;
  private lastSignature = Number.NaN;
  private shadowTick = false;
  private effectTick = 0;
  /** The briefs met so far, by title. */
  private printed: string[] = [];
  /** The frame the set stands at now: the one last snapped or sent back to, until something moves. */
  private recalledIndex = -1;
  private recalledSignature = Number.NaN;
  private tallyBlinking = false;
  private pixels: Uint8Array | null = null;
  private skipSeen = 0;
  /** The tally is held bright for a moment after a snap. */
  private snapFlash = false;
  /** How many times the monitor has been drawn; a test reads it to see the saving. */
  lensPasses = 0;
  private prevClear = new Color();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();

  init(): void {
    // The key light in the scene casts; the renderer has to be told to draw shadows.
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.target = new WebGLRenderTarget(RT_WIDTH, RT_HEIGHT);
    this.target.texture.colorSpace = SRGBColorSpace;
    this.lensCamera = new PerspectiveCamera(40, RT_WIDTH / RT_HEIGHT, 0.02, 50);
    this.lensCamera.name = 'ShotLens';

    // The monitor is created once the stage entity exists; see ensureMonitor().

    // The camera's head tilts on its tripod. The rig arrives as one flat group,
    // so the parts above the tripod head are gathered under a pivot here, on
    // this placed copy, and the lens rides the same pivot.
    const attach = (entity: Entity) => {
      const rig = entity.object3D;
      if (rig == null) return;
      const head = new Group();
      head.name = 'CameraHead';
      head.position.set(0, HEAD_PIVOT_Y, 0);
      rig.add(head);
      for (const part of [...rig.children]) {
        if (HEAD_PARTS.test(part.name)) {
          part.position.y -= HEAD_PIVOT_Y;
          head.add(part);
        }
      }
      head.add(this.lensCamera);
      // Just in front of the lens barrel, so the rig's own body is never in frame.
      this.lensCamera.position.set(0, 0.118 - HEAD_PIVOT_Y, -0.06);
      this.lensCamera.rotation.set(0, 0, 0);
      this.cameraHead = head;
    };
    this.queries.cams.entities.forEach(attach);
    this.cleanupFuncs.push(
      this.queries.cams.subscribe('qualify', attach),
      this.queries.cams.subscribe('disqualify', () => {
        this.lensCamera.removeFromParent();
        this.cameraHead = null;
      }),
    );

    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      g.lensMm.subscribe((mm) => this.setLens(mm)),
      g.snapRequested.subscribe((n) => {
        if (n > 0) this.snapPending = true;
      }),
      g.newBoardRequested.subscribe((n) => {
        if (n > this.boardSeen) {
          this.boardSeen = n;
          this.clearBoard();
        }
      }),
      this.world.visibilityState.subscribe(() => {
        this.liveFrames = LIVE_AT_START;
      }),
      () => this.target.dispose(),
      () => this.boardTexture.dispose(),
    );
    this.boardCanvas = document.createElement('canvas');
    this.boardCanvas.width = CARD_PIXELS;
    this.boardCanvas.height = Math.round((CARD_PIXELS * CARD_HEIGHT) / CARD_WIDTH);
    this.boardTexture = new CanvasTexture(this.boardCanvas);
    this.boardTexture.colorSpace = SRGBColorSpace;
    this.drawBoard();
    void document.fonts
      .load('700 24px "Big Shoulders Stencil"')
      .then(() => document.fonts.load('700 24px "Big Shoulders"'))
      .then(() => this.drawBoard());
    this.restoreBoard();
    const briefs = loadJson<SavedBriefs>(StoreKey.Briefs);
    if (briefs != null && Number.isInteger(briefs.index) && Array.isArray(briefs.printed)) {
      this.printed = briefs.printed.slice(0, BRIEFS.length);
      g.briefPrinted.value = this.printed.length;
      g.briefIndex.value = Math.min(briefs.index, BRIEFS.length);
    }
    this.cleanupFuncs.push(
      g.sensorIndex.subscribe(() => this.setLens(g.lensMm.peek())),
      g.briefSkip.subscribe((n) => {
        if (n <= this.skipSeen) return;
        this.skipSeen = n;
        this.setBrief((g.briefIndex.peek() + 1) % BRIEFS.length);
      }),
    );
  }

  getShots(): readonly Shot[] {
    return this.shots;
  }

  /** The whole storyboard, for saving. */
  boardPicture(): HTMLCanvasElement {
    return this.boardCanvas;
  }

  /** The monitor's picture as it stands, right way up, on a canvas. */
  copyMonitor(canvas: HTMLCanvasElement): void {
    const w = RT_WIDTH;
    const h = RT_HEIGHT;
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    this.pixels ??= new Uint8Array(w * h * 4);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, w, h, this.pixels);
    const image = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) image.data.set(this.pixels.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
    ctx.putImageData(image, 0, 0);
  }

  /** Something changed that the pose of a piece does not show: draw the monitor again. */
  refresh(): void {
    this.liveFrames = Math.max(this.liveFrames, LIVE_AFTER_CHANGE);
  }

  /** For the other systems: something the viewer sees and the shot lens must not. */
  hideFromLens(object: Object3D): void {
    this.overlays.push(object);
  }

  /**
   * The storyboard card: six frames on paper, numbered in the stencil. An empty
   * slot is a pencil outline; a taken frame carries its lens, camera height,
   * distance and every actor's eyeline underneath, so the card can be read on
   * its own in the headset.
   */
  private drawBoard(): void {
    const canvas = this.boardCanvas;
    const ctx = canvas.getContext('2d');
    if (ctx == null) return;
    const W = canvas.width;
    const H = canvas.height;
    const px = W / CARD_WIDTH;
    const frameW = FRAME_WIDTH * px;
    const frameH = FRAME_HEIGHT * px;
    const gap = FRAME_GAP * px;
    const caption = CAPTION_HEIGHT * px;
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = 'alphabetic';
    for (let i = 0; i < MAX_FRAMES; i++) {
      const x = gap + (i % FRAME_COLUMNS) * (frameW + gap);
      const y = gap + Math.floor(i / FRAME_COLUMNS) * (frameH + caption + gap);
      const shot = this.shots[i];
      const thumb = this.thumbs[i];
      if (shot == null || thumb == null) {
        // An empty slot says that it is empty, and the next one says how to fill it.
        ctx.fillStyle = SLOT_EMPTY;
        ctx.fillRect(x, y, frameW, frameH);
        ctx.textAlign = 'center';
        ctx.fillStyle = CHALK_DUST;
        ctx.font = `700 ${Math.round(frameH * 0.42)}px "Big Shoulders Stencil"`;
        ctx.fillText(String(this.taken - this.shots.length + i + 1), x + frameW / 2, y + frameH * 0.56);
        ctx.fillStyle = i === this.shots.length ? CHALK : CHALK_DUST;
        ctx.font = `700 ${Math.round(frameH * 0.15)}px "Big Shoulders"`;
        ctx.fillText(i === this.shots.length ? 'SNAP FRAME FILLS THIS' : 'EMPTY', x + frameW / 2, y + frameH * 0.82);
        ctx.textAlign = 'left';
        continue;
      }
      ctx.drawImage(thumb, x, y, frameW, frameH);
      // The frame the set was last sent back to wears the selected colour.
      const current = shot.index === this.recalledIndex;
      ctx.strokeStyle = current ? '#d6e13c' : INK;
      ctx.lineWidth = current ? 12 : 4;
      ctx.strokeRect(x + ctx.lineWidth / 2, y + ctx.lineWidth / 2, frameW - ctx.lineWidth, frameH - ctx.lineWidth);
      // The frame number on a slate tab, so it reads over any picture.
      const tab = Math.round(gap * 1.5);
      ctx.fillStyle = INK;
      ctx.fillRect(x, y, tab * 1.25, tab * 1.2);
      ctx.fillStyle = PAPER;
      ctx.font = `700 ${tab}px "Big Shoulders Stencil"`;
      ctx.textAlign = 'center';
      ctx.fillText(String(shot.index), x + tab * 0.62, y + tab * 0.98);
      ctx.textAlign = 'left';
      if (shot.printed) {
        // A printed take: the stamp a script supervisor puts on the good one.
        const stamp = Math.round(gap * 1.05);
        ctx.fillStyle = '#d6e13c';
        ctx.fillRect(x, y + frameH - stamp * 1.5, frameW, stamp * 1.5);
        this.fitText(ctx, `PRINT · ${shot.printed}`, x + 10, y + frameH - stamp * 0.4, frameW - 20, stamp, INK);
      }
      const line = Math.round(caption * 0.4);
      this.fitText(
        ctx,
        `${shot.lensMm} mm${shot.format ? ` ${shot.format}` : ''} · ${shot.cameraHeightM.toFixed(1)} m high · ${shot.distanceToCreatureM.toFixed(1)} m away`,
        x + 2,
        y + frameH + line * 1.05,
        frameW - 4,
        line,
        INK,
      );
      this.fitText(ctx, shot.eyelines, x + 2, y + frameH + line * 2.15, frameW - 4, line, INK_SOFT);
    }
    this.boardTexture.needsUpdate = true;
  }

  /** One caption line, shrunk until it fits the frame's width. */
  private fitText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    width: number,
    size: number,
    colour: string,
  ): void {
    let px = size;
    ctx.font = `700 ${px}px "Big Shoulders"`;
    while (px > size * 0.6 && ctx.measureText(text).width > width) {
      px -= 2;
      ctx.font = `700 ${px}px "Big Shoulders"`;
    }
    ctx.fillStyle = colour;
    ctx.fillText(text, x, y);
  }

  private publishBoard(): void {
    const g = this.globals as Globals;
    g.shotList.value = this.shots.map(
      (s) =>
        `${s.index}. ${s.lensMm} mm, cam ${s.cameraHeightM.toFixed(1)} m high, ` +
        `${s.distanceToCreatureM.toFixed(1)} m from creature`,
    );
    g.shotFrames.value = this.shots.slice();
  }

  /** The board from the last visit, if this browser kept one. */
  private restoreBoard(): void {
    const saved = loadJson<SavedBoard>(StoreKey.Board);
    if (saved == null || !Array.isArray(saved.shots) || saved.shots.length === 0) return;
    this.shots = saved.shots.slice(-MAX_FRAMES);
    this.taken = Math.max(saved.taken ?? 0, this.shots.length);
    this.thumbs = this.shots.map((shot) => {
      const image = new Image();
      image.onload = () => this.drawBoard();
      image.src = shot.dataUrl;
      return image;
    });
    this.publishBoard();
  }

  /** Which frame on the card is at this point, measured from the card's top left in metres. */
  private recallAt(u: number, v: number): void {
    for (let i = 0; i < this.shots.length; i++) {
      const x = FRAME_GAP + (i % FRAME_COLUMNS) * (FRAME_WIDTH + FRAME_GAP);
      const y = FRAME_GAP + Math.floor(i / FRAME_COLUMNS) * (FRAME_HEIGHT + CAPTION_HEIGHT + FRAME_GAP);
      if (u >= x && u <= x + FRAME_WIDTH && v >= y && v <= y + FRAME_HEIGHT + CAPTION_HEIGHT) {
        this.recall(this.shots[i]);
        return;
      }
    }
  }

  /**
   * Send the set back to how it stood for a frame: every piece to its mark,
   * the lens on, the camera head tilted as it was. Only what the frame itself
   * recorded is restored; a frame from before setups were kept does nothing.
   */
  recall(shot: Shot): boolean {
    const setup = shot.setup;
    const g = this.globals as Globals;
    if (setup == null || g.takeState.peek() !== 'idle') return false;
    if (setup.rig) g.cameraRig.value = setup.rig;
    if (setup.on) g.trayRestore.value = setup.on;
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      const pose = setup.pieces[`${piece.getValue(SetPiece, 'role')}:${piece.getValue(SetPiece, 'label')}`];
      if (object == null || !Array.isArray(pose) || pose.length !== 7) continue;
      object.position.fromArray(pose, 0);
      object.quaternion.fromArray(pose, 3);
    }
    for (const cam of this.queries.cams.entities) {
      cam.setValue(ShotCamera, 'tilt', setup.tilt);
      cam.setValue(ShotCamera, 'aimed', setup.aimed);
    }
    g.lensMm.value = setup.lensMm;
    if (setup.sensor != null) g.sensorIndex.value = setup.sensor;
    this.recalledIndex = shot.index;
    this.recalledSignature = Number.NaN;
    this.liveFrames = Math.max(this.liveFrames, LIVE_AFTER_CHANGE);
    this.drawBoard();
    g.coachNote.value = `BACK TO FRAME ${shot.index} | Pieces, camera and lens are as they were.`;
    g.setupRecalled.value = g.setupRecalled.peek() + 1;
    return true;
  }

  private readSetup(cam: Entity): Setup {
    const pieces: Record<string, number[]> = {};
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      if (object == null || piece.getValue(SetPiece, 'role') === SetRole.Stage) continue;
      pieces[`${piece.getValue(SetPiece, 'role')}:${piece.getValue(SetPiece, 'label')}`] = [
        ...object.position.toArray(),
        ...(object.quaternion.toArray() as number[]),
      ].map((n) => Math.round(n * 1e4) / 1e4);
    }
    return {
      pieces,
      lensMm: (this.globals as Globals).lensMm.peek(),
      tilt: cam.getValue(ShotCamera, 'tilt') ?? 0,
      aimed: cam.getValue(ShotCamera, 'aimed') === true,
      sensor: (this.globals as Globals).sensorIndex.peek(),
      rig: (this.globals as Globals).cameraRig.peek(),
      on: (this.globals as Globals).trayOn.peek(),
    };
  }

  /** Where this point falls in the frame, or null behind the lens. */
  private inFrame(world: Vector3, out: Vector3): Vector3 | null {
    out.copy(world).applyMatrix4(this.lensCamera.matrixWorldInverse);
    if (out.z >= 0) return null;
    return out.applyMatrix4(this.lensCamera.projectionMatrix);
  }

  /** What the lens saw, in the terms a brief is written in. */
  private measure(cam: Entity): Measure {
    const g = this.globals as Globals;
    const lens = this.lensCamera;
    lens.updateMatrixWorld(true);
    const at = lens.getWorldPosition(new Vector3());
    const stageY = this.stageEntity?.object3D?.getWorldPosition(new Vector3()).y ?? at.y;
    const p = new Vector3();
    const q = new Vector3();
    const inside = (v: Vector3 | null): boolean => v != null && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    const actors: PieceInFrame[] = [];
    for (const actor of this.actors) {
      if (actor.object3D == null) continue;
      this.eyePoint(actor, this.a);
      const eyes = this.inFrame(this.a, p);
      const eyeX = eyes ? eyes.x : 9;
      const eyeY = eyes ? eyes.y : 9;
      const eyesIn = inside(eyes);
      let headSize = 0;
      if (eyes != null) {
        const eyeNdcY = eyes.y;
        const top = this.inFrame(this.c.copy(this.a).setY(this.a.y + 0.016), q);
        if (top != null) headSize = Math.abs(top.y - eyeNdcY) * 1.6;
      }
      actor.object3D.getWorldPosition(this.b);
      const feet = inside(this.inFrame(this.b, q));
      actors.push({
        label: String(actor.getValue(SetPiece, 'label') ?? ''),
        whole: eyesIn && feet,
        eyesIn,
        eyeX,
        eyeY,
        headSize,
        distanceM: Math.hypot(this.a.x - at.x, this.a.z - at.z) * SET_SCALE,
        eyeAboveLensM: (this.a.y - at.y) * SET_SCALE,
      });
    }
    const creature = this.findRole(SetRole.Creature);
    let creatureIn = false;
    const creatureOnSet = creature?.object3D?.visible === true;
    if (creature != null && creatureOnSet) {
      this.eyePoint(creature, this.a);
      creatureIn = inside(this.inFrame(this.a, p));
    }
    return {
      lensMm: g.lensMm.peek(),
      rig: g.cameraRig.peek(),
      heightM: (at.y - stageY) * SET_SCALE,
      tiltDeg: ((this.cameraHead?.rotation.x ?? 0) * 180) / Math.PI,
      actors,
      creatureOnSet,
      creatureIn,
    };
  }

  /** The current brief, judged on this frame. A frame is kept either way; only a pass is stamped. */
  private judge(cam: Entity, shot: Shot): void {
    const g = this.globals as Globals;
    const index = g.briefIndex.peek();
    const brief = BRIEFS[index];
    if (brief == null) return;
    const reason = brief.test(this.measure(cam));
    if (reason != null) {
      g.coachNote.value = `NOT YET: ${brief.title.toUpperCase()} | ${reason}`;
      return;
    }
    shot.printed = brief.title;
    this.printed.push(brief.title);
    g.briefPrinted.value = this.printed.length;
    const next = BRIEFS[index + 1];
    g.coachNote.value = next
      ? `PRINT IT · ${this.printed.length} OF ${BRIEFS.length} | Next: ${next.title}. ${next.ask}`
      : `THAT'S A WRAP | All ${BRIEFS.length} shots printed. Your coverage is complete.`;
    this.setBrief(index + 1);
  }

  private setBrief(index: number): void {
    (this.globals as Globals).briefIndex.value = index;
    saveJson(StoreKey.Briefs, { index, printed: this.printed } satisfies SavedBriefs);
  }

  private clearBoard(): void {
    this.shots = [];
    this.thumbs = [];
    this.taken = 0;
    this.recalledIndex = -1;
    clearKey(StoreKey.Board);
    this.drawBoard();
    this.publishBoard();
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
      new MeshStandardMaterial({ color: 0xffffff, map: this.boardTexture, roughness: 1 }),
    );
    card.name = 'StoryboardCard';
    const cardEntity = this.world.createTransformEntity(card, { parent: stage });
    card.position.set(MONITOR_LOCAL[0], CARD_CENTER_Y, MONITOR_LOCAL[2] - 0.001);
    card.rotation.x = -0.15;
    // A frame on the card is a way back: pinch it and the set returns to that setup.
    cardEntity.addComponent(RayInteractable);
    (card as Mesh & { pointerEventsOrder?: number }).pointerEventsOrder = 5;
    const target = card as unknown as CardTarget;
    // The card stands on the slate; a pinch on it must not carry the slate away.
    target.addEventListener('pointerdown', (event) => event.stopPropagation?.());
    target.addEventListener('click', (event) => {
      event.stopPropagation?.();
      if (event.point == null) return;
      const local = card.worldToLocal(this.c.copy(event.point));
      this.recallAt(local.x + CARD_WIDTH / 2, CARD_HEIGHT / 2 - local.y);
    });
    this.overlays.push(card, this.player);
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
    this.backdrop = this.makeBackdrop();
    stage.object3D.add(this.backdrop);
    this.monitor = monitor;
    return true;
  }

  /**
   * In the headset the room is the camera feed, which the shot lens cannot see,
   * so a frame would be figures on flat black. The lens gets a studio instead: a
   * dark wall above the set's floor line and a warmer floor below it, drawn for
   * the lens pass only and never for the viewer.
   */
  private makeBackdrop(): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    const g = canvas.getContext('2d');
    if (g) {
      const gradient = g.createLinearGradient(0, 0, 0, 256);
      gradient.addColorStop(0, '#1a1d23');
      gradient.addColorStop(0.46, '#2a2d33');
      gradient.addColorStop(0.5, '#3a3936');
      gradient.addColorStop(1, '#45423f');
      g.fillStyle = gradient;
      g.fillRect(0, 0, 4, 256);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const backdrop = new Mesh(
      new SphereGeometry(BACKDROP_RADIUS, 24, 16),
      new MeshBasicMaterial({ map: texture, side: BackSide, toneMapped: false, depthWrite: false }),
    );
    backdrop.name = 'LensBackdrop';
    backdrop.renderOrder = -1;
    backdrop.visible = false;
    backdrop.raycast = () => {};
    return backdrop;
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
      this.tagPiece(piece);
      piece.object3D?.traverse((object) => {
        if (!(object instanceof Mesh)) return;
        // Grab volumes and hover marks are helpers, not set dressing.
        if (HELPER_NAMES.has(object.name)) return;
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

  /**
   * A chalk name tag over an actor or the creature, so "A looks up 30°" names
   * something you can see. Tags ride the piece and face the viewer.
   */
  private tagPiece(piece: Entity): void {
    const role = piece.getValue(SetPiece, 'role');
    const object = piece.object3D;
    if (object == null || (role !== SetRole.Actor && role !== SetRole.Creature)) return;
    const text = role === SetRole.Creature ? 'creature' : String(piece.getValue(SetPiece, 'label') ?? '');
    if (text === '') return;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const g = canvas.getContext('2d');
    if (g == null) return;
    g.font = '700 84px "Big Shoulders", "Arial Narrow", sans-serif';
    const width = Math.min(240, g.measureText(text).width + 56);
    g.fillStyle = 'rgba(30, 35, 43, 0.86)';
    g.beginPath();
    g.roundRect((256 - width) / 2, 8, width, 112, 10);
    g.fill();
    g.fillStyle = '#f6f7ef';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 66);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const tag = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
    tag.name = 'NameTag';
    tag.scale.set(TAG_WIDTH, TAG_WIDTH / 2, 1);
    const top = role === SetRole.Creature ? (piece.getValue(SetPiece, 'eyeHeight') ?? 0) + 0.014 : 0.19;
    tag.position.set(0, top + TAG_LIFT, 0);
    // A tag is a label, not a target: sprites throw inside the hand ray's raycast
    // (it never sets Raycaster.camera), and that would stop every frame in XR.
    tag.raycast = () => {};
    this.overlays.push(tag);
    object.add(tag);
  }

  private setLens(mm: number): void {
    const sensor = SENSORS[(this.globals as Globals).sensorIndex.peek()] ?? SENSORS[0];
    this.lensCamera.fov = (2 * Math.atan(sensor.heightMm / (2 * mm)) * 180) / Math.PI;
    this.lensCamera.updateProjectionMatrix();
    for (const cam of this.queries.cams.entities) cam.setValue(ShotCamera, 'lensMm', mm);
  }

  update(_delta: number, time: number): void {
    const cam = this.queries.cams.entities.values().next().value as Entity | undefined;
    if (cam?.object3D == null || !this.ensureMonitor()) return;
    // The tally blinks while a take records, as on a set.
    const recording = (this.globals as Globals).takeState.peek() === 'recording';
    if (recording !== this.tallyBlinking || recording) {
      this.tallyBlinking = recording;
      if (this.tally && !this.snapFlash) {
        this.tally.emissiveIntensity = !recording ? TALLY_REST : Math.floor(time * 2) % 2 === 0 ? TALLY_ON : TALLY_OFF;
      }
    }
    this.updateEyelines();
    const signature = this.signature();
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      this.liveFrames = Math.max(this.liveFrames, LIVE_AFTER_CHANGE);
    }
    // The set has moved on from the frame it stood at: the card stops marking it.
    if (this.recalledIndex >= 0) {
      if (Number.isNaN(this.recalledSignature)) this.recalledSignature = signature;
      else if (signature !== this.recalledSignature) {
        this.recalledIndex = -1;
        this.drawBoard();
      }
    }
    // An effect moves on its own, so the monitor keeps up with it, at a rate the headset can spare.
    this.effectTick = (this.effectTick + 1) % EFFECT_LENS_EVERY;
    if (this.liveFrames === 0 && !this.snapPending && this.effectTick === 0 && (this.globals as Globals).effectsOn.peek() > 0) {
      if (this.monitor?.visible === true) {
        this.aimLens(cam);
        this.renderViewfinder();
        this.lensPasses++;
      }
    }
    if (this.liveFrames > 0 || this.snapPending) {
      this.liveFrames = Math.max(0, this.liveFrames - 1);
      // Six passes for the key light's shadow is most of the cost of a moving
      // frame. While a piece is being carried it is redrawn every other frame,
      // 11 ms behind at worst; the last frame of a move and a snap always redraw it.
      this.shadowTick = !this.shadowTick;
      if (this.shadowTick || this.liveFrames === 0 || this.snapPending) this.renderer.shadowMap.needsUpdate = true;
      this.aimLens(cam);
      // With the monitor left on the table there is nobody to watch it.
      if (this.monitor?.visible === true || this.snapPending) {
        this.renderViewfinder();
        this.lensPasses++;
      }
    }
    if (this.snapPending) {
      this.snapPending = false;
      void this.captureFrame(cam);
    }
  }

  /**
   * One number that changes when anything the lens or the shadows depend on
   * changes: every piece's pose on the stage, the stage's own pose and scale,
   * and the lens. The stage's turn in the room is rounded, so the small
   * corrections a room anchor makes every frame do not count as movement.
   */
  private signature(): number {
    let s = this.lensCamera.fov * 17.3;
    for (const cam of this.queries.cams.entities) {
      // A tilt by hand changes the picture; the camera's own aim follows the pieces, which are counted below.
      if (cam.getValue(ShotCamera, 'aimed')) s += (cam.getValue(ShotCamera, 'tilt') ?? 0) * 31.7;
    }
    for (const piece of this.queries.pieces.entities) {
      const object = piece.object3D;
      if (object == null) continue;
      const p = object.position;
      const q = object.quaternion;
      s += p.x * 1.1 + p.y * 2.3 + p.z * 3.7 + q.x * 5.3 + q.y * 7.1 + q.z * 11.3 + q.w * 13.7 + object.scale.x * 19.1;
    }
    const stage = this.stageEntity?.object3D;
    if (stage) {
      const e = stage.matrixWorld.elements;
      s += Math.round(e[0] * 400) * 23.9 + Math.round(e[8] * 400) * 29.3;
    }
    return s;
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
      // The viewer sees the eyelines; the shot lens does not, so a frame shows the shot alone.
      this.overlays.push(line);
      this.world.createTransformEntity(line);
      this.lines[i] = line;
    }
    return line;
  }

  private updateEyelines(): void {
    const creature = this.findRole(SetRole.Creature);
    this.actors.length = 0;
    for (const piece of this.queries.pieces.entities) {
      // An actor taken off the set has no eyeline and is not in a brief.
      if (piece.getValue(SetPiece, 'role') !== SetRole.Actor || piece.object3D?.visible !== true) continue;
      if (this.actors.length < MAX_ACTORS) this.actors.push(piece);
    }
    if (creature?.object3D == null) return;
    if (!creature.object3D.visible) {
      for (let i = 0; i < this.lines.length; i++) this.lines[i].visible = false;
      if ((this.globals as Globals).eyelineText.peek().length > 0) (this.globals as Globals).eyelineText.value = [];
      return;
    }
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
      const size = this.stageEntity?.object3D?.scale.x ?? 1;
      this.rises[i] = (this.c.y - this.a.y) / size;
      this.runs[i] = Math.hypot(this.c.x - this.a.x, this.c.z - this.a.z) / size;
    }
    for (let i = this.actors.length; i < this.lines.length; i++) this.lines[i].visible = false;
    if (this.frameCount++ % TEXT_EVERY_N_FRAMES === 0) this.publishEyelineText();
  }

  /**
   * The user aims the rig; the lens tilts on its own toward the nearest actor's
   * eyes, the way an operator keeps the subject's eyes in the upper part of the
   * frame. Yaw stays with the rig, so a long lens still lands on a face.
   */
  private aimLens(cam: Entity): void {
    const head = this.cameraHead;
    if (head == null) return;
    // Tilted by hand: the hand's tilt stands.
    if (cam.getValue(ShotCamera, 'aimed')) {
      const tilt = cam.getValue(ShotCamera, 'tilt') ?? 0;
      head.rotation.x = Math.max(-CAMERA_TILT_LIMIT, Math.min(CAMERA_TILT_LIMIT, tilt));
      return;
    }
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
    pitch = Math.max(-MAX_TILT, Math.min(MAX_TILT, pitch));
    head.rotation.x = pitch;
    // Kept on the camera, so a hand that takes over starts from where the camera was looking.
    if (Math.abs((cam.getValue(ShotCamera, 'tilt') ?? 0) - pitch) > 1e-3) cam.setValue(ShotCamera, 'tilt', pitch);
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
    const monitorShown = monitor.visible;
    monitor.visible = false;
    if (this.backdrop) this.backdrop.visible = true;
    if (!this.panelHidden) {
      // The panel arrives with the level, after this system starts.
      const panel = this.scene.getObjectByName('Controls Panel');
      if (panel) {
        this.overlays.push(panel);
        this.panelHidden = true;
      }
    }
    const overlays = this.overlays;
    const shown = this.overlayShown;
    for (let i = 0; i < overlays.length; i++) {
      shown[i] = overlays[i].visible;
      overlays[i].visible = false;
    }
    xr.enabled = false;
    // The point light's shadow is six passes; the lens reuses the main view's shadow map.
    const shadowAutoUpdate = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x0f1114, 1);
    renderer.autoClear = true;
    renderer.render(this.scene, this.lensCamera);

    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(this.prevClear, prevAlpha);
    renderer.autoClear = prevAutoClear;
    renderer.shadowMap.autoUpdate = shadowAutoUpdate;
    xr.enabled = xrWasEnabled;
    monitor.visible = monitorShown;
    if (this.backdrop) this.backdrop.visible = false;
    for (let i = 0; i < overlays.length; i++) overlays[i].visible = shown[i];
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
    let eyelines = '';
    for (let i = 0; i < this.actors.length; i++) {
      const label = this.actors[i].getValue(SetPiece, 'label') || `Actor ${i + 1}`;
      const deg = this.eyelineDeg(i);
      eyelines += `${i > 0 ? ' · ' : ''}${label} ${deg >= 0 ? 'up' : 'down'} ${Math.abs(deg).toFixed(0)}°`;
    }
    this.taken += 1;
    const shot: Shot = {
      index: this.taken,
      lensMm: g.lensMm.peek(),
      cameraHeightM: (this.a.y - stageY) * SET_SCALE,
      distanceToCreatureM: distance * SET_SCALE,
      eyelineDeg: this.actors.length > 0 ? this.eyelineDeg(0) : 0,
      eyelines: eyelines || 'no actor on the set',
      dataUrl: canvas.toDataURL('image/jpeg', 0.86),
      setup: this.readSetup(cam),
    };
    const sensor = SENSORS[g.sensorIndex.peek()];
    if (sensor && g.sensorIndex.peek() !== 0) shot.format = sensor.short;
    this.judge(cam, shot);
    // A new frame is where the set is now.
    this.recalledIndex = shot.index;
    this.recalledSignature = Number.NaN;
    this.shots.push(shot);
    this.thumbs.push(canvas);
    if (this.shots.length > MAX_FRAMES) {
      this.shots.shift();
      this.thumbs.shift();
    }
    this.drawBoard();
    AudioUtils.play(cam);
    if (this.tally) {
      this.tally.emissiveIntensity = 2.5;
      this.snapFlash = true;
      setTimeout(() => {
        this.snapFlash = false;
        if (this.tally) this.tally.emissiveIntensity = TALLY_REST;
      }, 240);
    }
    // Kept for the next visit. A browser with no storage keeps it for this one only.
    saveJson(StoreKey.Board, { taken: this.taken, shots: this.shots } satisfies SavedBoard);
    this.publishBoard();
  }
}
