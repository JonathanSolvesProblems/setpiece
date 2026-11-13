/**
 * The set designer, on the headset's side. It tells the designer (api/director.ts) what was said and how the
 * set stands, reads the reply as it is written, and puts each piece down the moment its line is complete, so
 * a set goes up piece by piece within seconds of the words. When the designer cannot be reached the words go
 * to the library's own reader instead, which builds what it can from the names it knows.
 */
import { createSystem, Entity, Object3D, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { assetByLabel, assetTitle, isMade, LOOKS, PAINTS, POSES, SIZES, sparesOf } from './catalog.js';
import { LENSES } from './camera-formats.js';
import { cleanCamera, cleanThing, plainLine, PlanReader } from './director-plan.js';
import type { CameraPlan, Thing } from './director-plan.js';
import { MadeSystem } from './made.js';
import type { MadeDef } from './made.js';
import { PiecesSystem } from './pieces.js';
import { understand } from './scene-request.js';
import type { Spoken } from './scene-request.js';
import { Held, SetPiece, SetRole } from './set-components.js';
import { TraySystem } from './tray.js';
import type { Finish } from './tray.js';
import { ViewfinderSystem } from './viewfinder.js';

type Globals = {
  coachNote: Signal<string>;
  noteSaid: Signal<string>;
  lensMm: Signal<number>;
  sceneRequest: Signal<Spoken | null>;
  lastSpoken: Signal<string>;
  designing: Signal<boolean>;
  setsBuilt: Signal<number>;
};

/** Real metres to the slate's, and back. */
const SLATE = 0.1;
const REAL = 10;
const DEG = Math.PI / 180;
/** A piece put down by the designer drops this far onto the slate, over this long. */
const DROP = 0.05;
const DROP_SECONDS = 0.28;
const MOST_DROPS = 64;
/** No word from the designer in this long and the words go to the library's reader instead. */
const FIRST_WORD_MS = 25000;
const WHOLE_MS = 90000;
const ENDPOINT = '/api/director';
/** Long enough after the camera stands for the monitor to show what it sees. */
const LOOK_AFTER_MS = 700;
/** The most looks through the lens a set gets. */
const MOST_LOOKS = 2;
/** A server that said it has no key is asked again after this long. */
const RECHECK_MS = 60000;

/** What came of a request: a set went up, the library's reader built instead, or a newer request took over. */
export type Outcome = 'built' | 'library' | 'superseded';

const one = (n: number): string => String(Math.round(n * 10) / 10);
const paintIndex = (name: string): number => PAINTS.findIndex((paint) => paint.name.toLowerCase() === name);

export class DirectorSystem extends createSystem({
  pieces: { required: [SetPiece] },
}) {
  /** Whether the designer answers: unknown until asked, then ready, or off when the server says it has no key. */
  private status: 'unknown' | 'ready' | 'off' = 'unknown';
  private checked = 0;
  private asking: AbortController | null = null;
  /** Pieces dropping onto the slate: each one's object, entity, where it lands and how far into the drop it is. */
  private dropObjects: (Object3D | null)[] = new Array(MOST_DROPS).fill(null);
  private dropEntities: (Entity | null)[] = new Array(MOST_DROPS).fill(null);
  private dropY = new Float32Array(MOST_DROPS);
  private dropT = new Float32Array(MOST_DROPS);
  private drops = 0;
  /** The camera the plan asked for, put in place once the pieces have landed. */
  private pendingCamera: CameraPlan | null = null;
  private pendingCameraLabels = new Map<string, string>();
  /** The new pieces' own keys ("new:tower" is "tower"), kept across replies, so a later one can ask for another. */
  private keys = new Map<string, MadeDef>();
  /** The words of the set just built, until its lens has been looked through; and when to look. */
  private lookFor = '';
  /** What the shot was framed on, kept through the looks: the plan's subject, or a point. */
  private subject = '';
  /** Looks taken at this set: a look that changed the frame is checked once more, never more than twice in all. */
  private looks = 0;
  private lookAt = 0;
  private lensCanvas: HTMLCanvasElement | null = null;
  private point = new Vector3();
  private lensAt = new Vector3();
  private lensWay = new Vector3();

  init(): void {
    void this.check();
  }

  /** Whether the designer can be asked. Until it is known, it is tried; a server with no key says so, and is asked again now and then. */
  available(): boolean {
    if (this.status === 'off' && performance.now() - this.checked > RECHECK_MS) void this.check();
    return this.status !== 'off';
  }

  /** Whether the designer is known to answer, as against only hoped to. */
  ready(): boolean {
    return this.status === 'ready';
  }

  private async check(): Promise<void> {
    this.checked = performance.now();
    try {
      const response = await fetch(ENDPOINT, { method: 'GET', cache: 'no-store' });
      const answer = (await response.json()) as { ready?: boolean };
      // Only a server that answers, and says it has no key, is taken as off; anything else is tried when asked.
      if (response.ok) this.status = answer.ready === true ? 'ready' : 'off';
    } catch {
      // Not known; the next request tries it.
    }
  }

  update(delta: number): void {
    for (let i = 0; i < this.drops; ) {
      const object = this.dropObjects[i]!;
      // A hand took it on the way down: it is the hand's now.
      if (this.dropEntities[i]!.hasComponent(Held)) this.dropT[i] = 1;
      else this.dropT[i] += delta / DROP_SECONDS;
      const t = Math.min(1, this.dropT[i]);
      const left = 1 - t;
      if (!this.dropEntities[i]!.hasComponent(Held)) object.position.y = this.dropY[i] + DROP * left * left * left;
      if (t < 1) {
        i++;
        continue;
      }
      const entity = this.dropEntities[i]!;
      if (!entity.hasComponent(Held)) this.world.getSystem(PiecesSystem)?.landed(entity);
      // The last one takes this one's place in the list.
      const last = --this.drops;
      this.dropObjects[i] = this.dropObjects[last];
      this.dropEntities[i] = this.dropEntities[last];
      this.dropY[i] = this.dropY[last];
      this.dropT[i] = this.dropT[last];
      this.dropObjects[last] = null;
      this.dropEntities[last] = null;
    }
    if (this.drops === 0 && this.pendingCamera != null) {
      const plan = this.pendingCamera;
      this.pendingCamera = null;
      this.frame(plan, this.pendingCameraLabels);
      // A set just built is looked at through its lens once the camera stands, and the frame put right.
      if (this.lookFor !== '') this.lookAt = performance.now() + LOOK_AFTER_MS;
    }
    if (this.lookAt > 0 && performance.now() >= this.lookAt) {
      this.lookAt = 0;
      const said = this.lookFor;
      this.lookFor = '';
      void this.look(said);
    }
  }

  /**
   * Asks the designer for a set from these words, and builds it as it arrives. Says what came of it: a set
   * went up, the words went to the library's reader instead, or a newer request took over.
   */
  async ask(said: string, heard: string[] = []): Promise<Outcome> {
    this.lookFor = '';
    this.lookAt = 0;
    this.looks = 0;
    return this.request(said, { said, heard, set: this.describe() }, false);
  }

  /**
   * The designer looks through the lens: it is shown what the shot camera sees, and keeps the frame or puts
   * it right. This is the second half of every new set, and it answers what the camera sees, not what it
   * planned.
   */
  private async look(said: string): Promise<void> {
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    if (viewfinder == null || this.asking != null) return;
    this.lensCanvas ??= document.createElement('canvas');
    viewfinder.copyMonitor(this.lensCanvas);
    const image = this.lensCanvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '';
    if (image === '') return;
    await this.request(said, { said, set: this.describe(), image, report: viewfinder.frameReport(), subject: this.subject }, true);
  }

  private async request(said: string, body: Record<string, unknown>, looking: boolean): Promise<Outcome> {
    const g = this.globals as unknown as Globals;
    this.asking?.abort();
    const asking = new AbortController();
    this.asking = asking;
    if (!looking) {
      g.lastSpoken.value = said;
      g.coachNote.value = 'DESIGNING THE SET | The pieces arrive in a moment.';
    }
    g.designing.value = true;
    let timer = window.setTimeout(() => asking.abort(), FIRST_WORD_MS);
    const whole = window.setTimeout(() => asking.abort(), WHOLE_MS);
    const build = new PlanBuild(this.world, (label) => this.entityOf(label), this.keys, looking);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: asking.signal,
      });
      if (response.body == null) throw new Error('no reply');
      // This server will not answer this page (no key, or not this site): the library's reader is used from now on.
      if (response.status === 403 || response.status === 503) this.status = 'off';
      const reader = new PlanReader(
        (key, value) => build.value(key, value),
        (thing) => build.thing(thing, (entity, object, y) => this.drop(entity, object, y)),
      );
      const stream = response.body.getReader();
      const decoder = new TextDecoder();
      let carry = '';
      let failed = '';
      for (;;) {
        const { value, done } = await stream.read();
        if (done) break;
        carry += decoder.decode(value, { stream: true });
        for (let nl = carry.indexOf('\n'); nl >= 0; nl = carry.indexOf('\n')) {
          const line = carry.slice(0, nl);
          carry = carry.slice(nl + 1);
          if (line.trim() === '') continue;
          const event = JSON.parse(line) as { t: string; s?: string; m?: string; stop?: string };
          if (event.t === 'd' && event.s != null) {
            if (timer !== 0) {
              window.clearTimeout(timer);
              timer = 0;
            }
            reader.push(event.s);
          } else if (event.t === 'error') {
            failed = event.m ?? 'The set designer could not be reached.';
          } else if (event.t === 'end' && event.stop === 'refusal') {
            failed = 'The set designer would not build that one.';
          } else if (event.t === 'end' && event.stop === 'max_tokens') {
            failed = 'The set designer ran out of room; part of the set is up. Ask for less at once.';
          }
        }
      }
      if (asking !== this.asking) {
        if (build.begun) this.world.getSystem(TraySystem)?.planEnd(build.fresh);
        return 'superseded';
      }
      // The set could not change (a hand is on a piece): the call sheet already says so.
      // Nothing went up, so what was said after it waits for the wearer to say it again.
      if (build.refused) return 'superseded';
      // Whatever arrived in pieces is checked against the whole reply once it is all in.
      build.finish(reader.whole);
      if (!build.begun) {
        if (looking) return 'built';
        this.status = failed !== '' && /no key|cannot sign in/.test(failed) ? 'off' : this.status;
        this.fallback(said, failed || 'The set designer sent nothing back.');
        return 'library';
      }
      this.pendingCamera = build.camera;
      this.pendingCameraLabels = build.labels;
      // A new set, or a new frame, is looked at once it stands; a look that changed the frame is looked at once more.
      const moved = build.camera != null && !build.camera.keep;
      // The first frame's subject is the shot's subject; a look keeps to it.
      if (!looking && moved) this.subject = build.camera!.look_at !== '' ? (build.labels.get(build.camera!.look_at) ?? build.camera!.look_at) : '';
      if (looking) this.looks++;
      if (moved && this.looks < MOST_LOOKS) this.lookFor = said;
      build.end(failed);
      return 'built';
    } catch {
      if (asking !== this.asking) {
        if (build.begun) this.world.getSystem(TraySystem)?.planEnd(build.fresh);
        return 'superseded';
      }
      if (build.begun) {
        build.end(looking ? '' : 'The set designer stopped partway; what arrived is on the set.');
        return 'built';
      }
      if (looking) return 'built';
      this.fallback(said, asking.signal.aborted ? 'The set designer took too long.' : 'The set designer could not be reached.');
      return 'library';
    } finally {
      window.clearTimeout(timer);
      window.clearTimeout(whole);
      if (asking === this.asking) {
        this.asking = null;
        g.designing.value = false;
      }
    }
  }

  /** The words go to the library's reader, which builds from the names it knows, and that is said. */
  private fallback(said: string, why: string): void {
    const g = this.globals as unknown as Globals;
    g.sceneRequest.value = understand(said);
    const [title = '', words = ''] = g.noteSaid.peek().split(' | ');
    g.coachNote.value = `${title || 'FROM THE LIBRARY'} | ${why} ${words}`.trim();
  }

  private drop(entity: Entity, object: Object3D, y: number): void {
    if (this.drops >= MOST_DROPS) {
      object.position.y = y;
      return;
    }
    // A piece already dropping starts again from where it is now.
    for (let i = 0; i < this.drops; i++) {
      if (this.dropObjects[i] !== object) continue;
      this.dropY[i] = y;
      this.dropT[i] = 0;
      return;
    }
    const i = this.drops++;
    this.dropObjects[i] = object;
    this.dropEntities[i] = entity;
    this.dropY[i] = y;
    this.dropT[i] = 0;
    object.position.y = y + DROP;
  }

  /** The camera where the plan asked, looking at what it asked, with its lens on. */
  private frame(plan: CameraPlan, labels: Map<string, string>): void {
    if (plan.keep) return;
    const g = this.globals as unknown as Globals;
    const pieces = this.world.getSystem(PiecesSystem);
    if (pieces == null) return;
    const label = plan.look_at === '' ? '' : (labels.get(plan.look_at) ?? plan.look_at);
    this.point.set(plan.look_x * SLATE, plan.look_y * SLATE, plan.look_z * SLATE);
    pieces.placeCamera(plan.x * SLATE, plan.z * SLATE, plan.height * SLATE, label, this.point);
    if ((LENSES as readonly number[]).includes(plan.lens)) g.lensMm.value = plan.lens;
  }

  /** The set as it stands, in the words and units the designer works in. */
  private describe(): string {
    const tray = this.world.getSystem(TraySystem);
    const made = this.world.getSystem(MadeSystem);
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    if (tray == null) return '';
    const lines: string[] = [];
    const on = tray.onSet();
    for (const label of on) {
      const asset = assetByLabel(label);
      if (asset == null || asset.shelf === 'Kit') continue;
      const object = this.objectOf(label);
      if (object == null) continue;
      const yaw = Math.round(Math.atan2(Math.sin(object.rotation.y), Math.cos(object.rotation.y)) / DEG);
      const { finish, cast } = tray.dressOf(label);
      const words = [`${label}: ${assetTitle(label)}`];
      if (isMade(label)) {
        const size = made?.footprintOf(label);
        words[0] += size ? ` (made earlier; ${one(size.w)} wide, ${one(size.d)} long, ${one(size.h)} high)` : ' (made earlier)';
      }
      words.push(`at x ${one(object.position.x * REAL)}, z ${one(object.position.z * REAL)}${object.position.y > 0.004 ? `, y ${one(object.position.y * REAL)}` : ''}, facing ${yaw}`);
      if (asset.paint === true && finish[0] > 0) words.push(PAINTS[finish[0]]?.name.toLowerCase() ?? '');
      const scale = (finish[3] ?? 0) > 0 ? finish[3]! : (SIZES[finish[1]]?.scale ?? 1);
      if (Math.abs(scale - 1) > 0.01) words.push(`size ${one(scale)}`);
      if (finish[2] > 0 && asset.styles?.[finish[2]]) words.push(`fitting ${asset.styles[finish[2]]}`);
      if (cast != null) words.push(`pose ${POSES[cast[0]] ?? POSES[0]}, look ${LOOKS[cast[1]]?.name ?? LOOKS[0].name}`);
      lines.push(`- ${words.filter((word) => word !== '').join('; ')}`);
    }
    if (lines.length === 0) lines.push('Nothing is on the set.');
    const offSet = made?.offSet(on) ?? [];
    if (offSet.length > 0) lines.push(`Made earlier and off the set: ${offSet.map(([label, def]) => `${def.name} (copy:${label} puts one back)`).join(', ')}.`);
    const cam = viewfinder?.liveCamera()?.object3D;
    const stage = cam?.parent;
    if (viewfinder != null && cam != null && stage != null) {
      viewfinder.lensPose(this.lensAt, this.lensWay);
      stage.worldToLocal(this.lensAt);
      const way = this.lensWay.clone().transformDirection(stage.matrixWorld.clone().invert());
      const ahead = this.lensAt.clone().addScaledVector(way.normalize(), 0.3);
      const g = this.globals as unknown as Globals;
      lines.push(
        `Camera: at x ${one(this.lensAt.x * REAL)}, z ${one(this.lensAt.z * REAL)}, lens ${one(this.lensAt.y * REAL)} m high, ${g.lensMm.peek()} mm, looking towards x ${one(ahead.x * REAL)}, y ${one(ahead.y * REAL)}, z ${one(ahead.z * REAL)}.`,
      );
    }
    const selected = tray.selectedLabel();
    if (selected !== '') lines.push(`Selected: ${selected} (${assetTitle(selected)}).`);
    return lines.join('\n');
  }

  private objectOf(label: string): Object3D | null {
    return this.entityOf(label)?.object3D ?? null;
  }

  private entityOf(label: string): Entity | null {
    for (const piece of this.queries.pieces.entities) if (String(piece.getValue(SetPiece, 'label')) === label) return piece;
    return null;
  }
}

/** One reply's worth of building: what has gone up, under which labels, and what is left to say. */
class PlanBuild {
  begun = false;
  /** The set could not change when the plan began; the reason is on the call sheet. */
  refused = false;
  fresh = false;
  title = '';
  says = '';
  next = '';
  camera: CameraPlan | null = null;
  /** The plan's own ids for what it put down ("new:tower", "copy:tower", "Car"), each to the label it went up as. */
  labels = new Map<string, string>();
  private placed = new Set<string>();
  /** What stood on the set before the plan began: a made piece there is not built over, and a copy there is not borrowed. */
  private before = new Set<string>();
  private removed: string[] = [];
  private things = 0;
  private skipped = 0;

  constructor(
    private world: World,
    private entityOf: (label: string) => Entity | null,
    private keys: Map<string, MadeDef>,
    /** A look through the lens: it changes the frame, and moves a piece only if one is in the way. */
    private looking = false,
  ) {}

  value(key: string, value: unknown): void {
    if (key === 'title') this.title = plainLine(value, 40);
    else if (key === 'says') this.says = plainLine(value, 160);
    else if (key === 'next') this.next = plainLine(value, 60);
    else if (key === 'fresh') this.begin(value === true && !this.looking);
    else if (key === 'remove' && Array.isArray(value) && !this.looking) {
      this.begin(this.fresh);
      const labels = value.filter((id): id is string => typeof id === 'string').map((id) => this.labels.get(id) ?? id);
      this.removed.push(...labels);
      if (!this.fresh) this.world.getSystem(TraySystem)?.planRemove(labels);
    } else if (key === 'camera') this.camera = cleanCamera(value);
  }

  private begin(fresh: boolean): void {
    if (this.begun || this.refused) return;
    const tray = this.world.getSystem(TraySystem);
    if (tray != null) for (const label of tray.onSet()) this.before.add(label);
    if (tray == null || !tray.planBegin(fresh)) {
      this.refused = true;
      return;
    }
    this.begun = true;
    this.fresh = fresh;
  }

  thing(raw: unknown, drop: (entity: Entity, object: Object3D, y: number) => void): void {
    this.begin(this.fresh);
    if (!this.begun) return;
    const thing = cleanThing(raw);
    if (thing == null) return;
    this.things++;
    const label = this.labelFor(thing);
    if (label == null) {
      this.skipped++;
      return;
    }
    const tray = this.world.getSystem(TraySystem);
    const entity = this.entityOf(label);
    if (tray == null || entity == null || entity.hasComponent(Held)) return;
    const was = entity.object3D?.visible === true;
    const { finish, cast } = this.dressFor(label, thing, tray);
    const object = tray.planPiece(label, thing.x * SLATE, thing.y * SLATE, thing.z * SLATE, thing.yaw * DEG, finish, cast);
    if (object == null) return;
    this.placed.add(label);
    this.labels.set(thing.id, label);
    // New to the set, it drops on; already there, it is moved where the plan wants it.
    if (!was || this.fresh) drop(entity, object, thing.y * SLATE);
  }

  /** The label a thing goes up as: a library piece (or a free copy of it), a made piece, or a new one made now. */
  private labelFor(thing: Thing): string | null {
    const made = this.world.getSystem(MadeSystem);
    const id = thing.id;
    // Places not to build into: those this plan has used, and made pieces that stood on the set before it.
    const taken = new Set(this.placed);
    for (const label of this.before) if (isMade(label)) taken.add(label);
    if (id.startsWith('new:') || id.startsWith('copy:')) {
      if (made == null) return null;
      const key = id.slice(id.indexOf(':') + 1);
      let def: MadeDef | null = null;
      // Parts written out are always what is built (the same parts again are the same piece); a made place is
      // read as it is now, never from memory; a key from an earlier reply stands for what it made then.
      if (thing.parts.length > 0) def = made.define(thing.name || key, thing.parts);
      else if (isMade(key)) def = made.defIn(key);
      else def = this.keys.get(key) ?? (thing.name !== '' ? made.find(thing.name) : null);
      if (def == null) return null;
      if (!isMade(key)) this.keys.set(key, def);
      // Another of a made piece that is off the set goes back into its own place.
      if (isMade(key) && !taken.has(key) && !this.placed.has(key) && made.defIn(key) === def) return key;
      return made.place(def, taken);
    }
    const asset = assetByLabel(id);
    if (asset == null || asset.shelf === 'Kit') return null;
    if (asset.shelf === 'Made') {
      if (made == null) return null;
      // A made place asked for with parts is that piece made again (a new colour, a new shape) in the same place.
      if (thing.parts.length > 0) {
        const def = made.define(thing.name || made.defIn(id)?.name || 'New piece', thing.parts);
        if (def == null) return null;
        made.refill(id, def);
        return id;
      }
      // An empty place is nothing to put on the set.
      return made.defIn(id) == null ? null : id;
    }
    // A label already put down by this plan: a free copy of the same piece instead, never one already standing.
    if (!this.placed.has(id)) return id;
    const base = asset.spareOf ?? id;
    const standing = this.fresh ? new Set<string>() : this.before;
    return [base, ...sparesOf(base)].find((label) => !this.placed.has(label) && !standing.has(label)) ?? null;
  }

  /** The finish and dress a thing asks for, keeping what it does not mention. */
  private dressFor(label: string, thing: Thing, tray: TraySystem): { finish: Finish; cast: [number, number] | null } {
    const now = tray.dressOf(label);
    const asset = assetByLabel(label);
    const finish: Finish = [...now.finish] as Finish;
    const paint = thing.paint === '' ? -1 : paintIndex(thing.paint);
    if (paint >= 0 && asset?.paint === true) finish[0] = paint;
    // Size 0 keeps the size the piece has; otherwise a kit size when it is near one, else a size of its own.
    const stop = SIZES.findIndex((size) => Math.abs(size.scale - thing.size) <= 0.05 * size.scale);
    if (thing.size > 0 && stop >= 0) {
      finish[1] = stop;
      finish[3] = 0;
    } else if (thing.size > 0) {
      finish[1] = 0;
      finish[3] = thing.size;
    }
    if (thing.fitting !== '' && asset?.styles) {
      const style = asset.styles.findIndex((name) => name.toLowerCase() === thing.fitting.toLowerCase());
      if (style >= 0) finish[2] = style;
    }
    let cast: [number, number] | null = null;
    if (this.entityOf(label)?.getValue(SetPiece, 'role') === SetRole.Actor) {
      const was = now.cast ?? [0, 0];
      const pose = POSES.indexOf(thing.pose as (typeof POSES)[number]);
      const look = LOOKS.findIndex((entry) => entry.name === thing.look);
      cast = [pose >= 0 ? pose : was[0], look >= 0 ? look : was[1]];
    }
    return { finish, cast };
  }

  /** The reply is all in: what was not read on the way (the words, the camera, whether the set was fresh) is read from the whole. */
  finish(whole: string): void {
    let plan: Record<string, unknown> | null = null;
    try {
      plan = JSON.parse(whole) as Record<string, unknown>;
    } catch {
      return;
    }
    if (this.title === '') this.value('title', plan.title);
    if (this.says === '') this.value('says', plan.says);
    if (this.next === '') this.value('next', plan.next);
    if (this.camera == null) this.value('camera', plan.camera);
    if (!this.begun && typeof plan.fresh === 'boolean') this.begin(plan.fresh);
  }

  /** Everything is down: the set is published, and what was built and what to try next is said. */
  end(problem: string): void {
    const g = this.world.globals as unknown as Globals;
    if (this.looking) {
      // A look that kept the frame says nothing; one that changed it says what it changed.
      const changed = this.placed.size > 0 || (this.camera != null && !this.camera.keep);
      if (!changed) return;
      if (this.placed.size > 0) this.world.getSystem(TraySystem)?.planEnd(false);
      g.coachNote.value = `THROUGH THE LENS | ${this.says || 'The frame is put right.'}`;
      return;
    }
    this.world.getSystem(TraySystem)?.planEnd(this.fresh);
    g.setsBuilt.value = g.setsBuilt.peek() + 1;
    const title = (this.title || 'THE SET').toUpperCase();
    const lost = this.skipped > 0 ? ` ${this.skipped} of ${this.things} could not be built.` : '';
    const next = this.next !== '' ? ` Try: "${this.next}".` : '';
    g.coachNote.value = problem !== '' ? `${title} | ${problem}${lost}` : `${title} | ${this.says || 'The set is up.'}${lost}${next}`;
  }
}
