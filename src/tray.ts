/**
 * The asset library at work on the set: what is on the slate, what was last
 * picked up, an actor's pose and look, a prop's paint, size and fittings, the
 * camera's format and rig. All of it is kept between visits. Effects, rotors
 * and the parts of a creature that move on their own are the only things here
 * that run by themselves, so this is also where their clock lives.
 */
import { createSystem, DepthOccludable, Entity, Mesh, MeshStandardMaterial, Object3D, OcclusionShadersMode, ShaderMaterial } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { CAMERAS, Rig, SENSORS } from './camera-formats.js';
import { assetByLabel, assetTitle, PAINTS, sparesOf, SIZES, STARTING_ASSETS } from './catalog.js';
import { Held, SetPiece, SetRole, ShotCamera } from './set-components.js';
import { SCENES } from './scenes.js';
import type { Scene } from './scenes.js';
import { AIM } from './scene-stagings.js';
import type { Spoken } from './scene-request.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';
import { withGrain } from './wood-grain.js';

export const LOOKS = [
  { name: 'Wood', top: 0, legs: 0, hair: false },
  { name: 'Dark suit', top: 0x30343f, legs: 0x262a33, hair: true },
  { name: 'Red jacket', top: 0xb3312a, legs: 0x35475f, hair: true },
  { name: 'White shirt', top: 0xe6e4da, legs: 0x2a2c31, hair: true },
  { name: 'Hi-vis', top: 0xd6e13c, legs: 0x2f3a45, hair: true },
] as const;
export const POSES = ['First pose', 'Second pose', 'Arms up', 'Running', 'Aim'] as const;
const WOOD_TOP = /^(Torso|Chest|Arm)/;
const WOOD_LEGS = /^Leg/;
const PAINTED = /^Body/;
const TRIPOD = /^(Base|Post|Leg\d|TripodHead)$/;
/** Where a drone hovers when it is first switched on, and the most a tripod stands. */
const DRONE_START = 0.45;
const TRIPOD_MAX = 0.45;
const ROTOR_SPEED = 60;
/** Where a piece new to the set is put down: the first of these that is clear, front and centre first. */
const SPOTS: [number, number][] = [];
for (const z of [0.08, -0.04, 0.16, -0.12]) for (const x of [0, 0.12, -0.12, 0.22, -0.22]) SPOTS.push([x, z]);
const DEFAULT_REACH = 0.05;
/** Where something big goes first: the back of the slate, behind where the actors stand. */
const BACK_SPOTS: [number, number][] = [[0, -0.08], [0.17, -0.1], [-0.17, -0.1], [0.1, 0.05], [-0.12, 0.05], ...SPOTS];
const BIG = 0.1;
const NAMED_AT_MOST = 5;
const BURNING = /\b(burning|on fire|in flames|ablaze)\b/;

/** Paint, size and fitting, each an index. */
/** Paint, size step, fitting, and a size set by two hands (0 or absent: the size step counts). */
type Finish = [number, number, number, number?];
/** The pointer events library reads this off any object: false, and it does not look inside. */
type Walked = Object3D & { intersectChildren?: boolean };
type Idle = { kind: 'flap' | 'spin' | 'sway'; axis: 'x' | 'y' | 'z'; amount: number; rate: number };
type Moving = { piece: Entity; part: Object3D; idle: Idle; rest: number; phase: number };
export type Dress = { cast: Record<string, [number, number]>; finish: Record<string, Finish> };
type Saved = { on: string[]; sensor: number; rig: string } & Partial<Dress>;
type Globals = {
  sceneRequest: Signal<Spoken | null>;
  sceneStart: Signal<number>;
  takeState: Signal<string>;
  takeLength: Signal<number>;
  takeClear: Signal<number>;
  layoutChanged: Signal<number>;
  cameraOn: Signal<string>;
  lensMm: Signal<number>;
  setupRecalled: Signal<number>;
  coachNote: Signal<string>;
  trayToggle: Signal<string>;
  trayOn: Signal<string[]>;
  setReady: Signal<boolean>;
  occlusion: Signal<string | null>;
  lastSpoken: Signal<string>;
  trayRestore: Signal<string[] | null>;
  trayDress: Signal<Dress>;
  trayDressRestore: Signal<Dress | null>;
  lifeSize: Signal<boolean>;
  effectsOn: Signal<number>;
  removeSelected: Signal<number>;
  clearSet: Signal<number>;
  selectedIsActor: Signal<boolean>;
  selectedPaint: Signal<number>;
  selectedLabel: Signal<string>;
  sizedByHand: Signal<{ label: string; scale: number } | null>;
  coachLine: Signal<string>;
  selectedCopies: Signal<boolean>;
  copyRequested: Signal<number>;
  trayPress: Signal<string>;
  selectedStyles: Signal<boolean>;
  poseRequested: Signal<number>;
  lookRequested: Signal<number>;
  paintPick: Signal<number>;
  sizeRequested: Signal<number>;
  styleRequested: Signal<number>;
  castLine: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  newBoardRequested: Signal<number>;
};

export class TraySystem extends createSystem({
  pieces: { required: [SetPiece] },
  held: { required: [SetPiece, Held] },
  cams: { required: [ShotCamera] },
}) {
  private managed: Entity[] = [];
  private effects: ShaderMaterial[] = [];
  private on = new Set<string>();
  private rotors: Object3D[] = [];
  private moving: Moving[] = [];
  /** Pieces with a part that moves by itself: the lens has to keep looking at them, as it does at an effect. */
  private restless = new Set<string>();
  private cast = new Map<string, [number, number]>();
  private finish = new Map<string, Finish>();
  private selected: Entity | null = null;
  private toldChanges = false;
  private ready = false;
  private seen = { pose: 0, look: 0, board: 0, remove: 0, clear: 0, size: 0, style: 0, copy: 0 };

  init(): void {
    const g = this.globals as Globals;
    const counter = (signal: Signal<number>, name: keyof TraySystem['seen'], run: () => void) =>
      signal.subscribe((n) => {
        if (n <= this.seen[name]) return;
        this.seen[name] = n;
        if (this.ready) run();
      });
    this.cleanupFuncs.push(
      g.trayToggle.subscribe((label) => {
        if (label === '') return;
        g.trayToggle.value = '';
        if (this.ready) this.toggle(label);
      }),
      // Pressing a piece on the shelf: off the set it goes on, on the set it is chosen, and chosen it comes off.
      g.trayPress.subscribe((label) => {
        if (label === '') return;
        g.trayPress.value = '';
        if (!this.ready) return;
        const piece = this.managed.find((entity) => this.key(entity) === label);
        if (this.on.has(label) && piece != null && piece !== this.selected) {
          this.selected = piece;
          this.publishSelected();
          return;
        }
        this.toggle(label);
      }),
      g.trayRestore.subscribe((list) => {
        if (list == null) return;
        g.trayRestore.value = null;
        if (this.ready) this.setOn(new Set(list));
      }),
      g.sceneRequest.subscribe((spoken) => {
        if (spoken == null) return;
        g.sceneRequest.value = null;
        if (this.ready) this.build(spoken);
      }),
      g.sceneStart.subscribe((index) => {
        if (index < 0) return;
        g.sceneStart.value = -1;
        if (this.ready) this.startScene(index);
      }),
      g.trayDressRestore.subscribe((dress) => {
        if (dress == null) return;
        g.trayDressRestore.value = null;
        if (this.ready) this.wear(dress);
      }),
      // Two hands pulled a piece bigger or pushed it smaller: that is its size now, kept like its paint.
      g.sizedByHand.subscribe((sized) => {
        if (sized == null) return;
        g.sizedByHand.value = null;
        if (this.ready) this.resize(sized.label, sized.scale);
      }),
      g.paintPick.subscribe((index) => {
        if (index < 0) return;
        g.paintPick.value = -1;
        if (this.ready) this.refinish(0, index);
      }),
      counter(g.poseRequested, 'pose', () => this.step(0, POSES.length)),
      counter(g.lookRequested, 'look', () => this.step(1, LOOKS.length)),
      counter(g.sizeRequested, 'size', () => this.refinish(1, -1)),
      counter(g.styleRequested, 'style', () => this.refinish(2, -1)),
      counter(g.copyRequested, 'copy', () => this.copy()),
      counter(g.removeSelected, 'remove', () => {
        if (this.selected != null) this.toggle(this.key(this.selected));
      }),
      counter(g.clearSet, 'clear', () => this.setOn(new Set())),
      counter(g.newBoardRequested, 'board', () => this.clear()),
      g.sensorIndex.subscribe(() => this.save()),
      g.cameraRig.subscribe((rig) => {
        this.applyRig(rig);
        this.save();
      }),
      this.queries.held.subscribe('qualify', (piece) => {
        this.selected = piece;
        this.publishSelected();
        this.sayWhereChangesAre(piece);
      }),
    );
  }

  update(delta: number, time: number): void {
    if (!this.ready) {
      this.ready = this.prepare();
      if (this.ready) (this.globals as Globals).setReady.value = true;
      return;
    }
    for (let i = 0; i < this.effects.length; i++) this.effects[i].uniforms.uTime.value = time;
    for (let i = 0; i < this.rotors.length; i++) this.rotors[i].rotation.y += ROTOR_SPEED * delta;
    for (let i = 0; i < this.moving.length; i++) {
      const moving = this.moving[i];
      if (moving.piece.object3D?.visible !== true) continue;
      const { idle, part } = moving;
      if (idle.kind === 'spin') part.rotation[idle.axis] += idle.rate * delta;
      else part.rotation[idle.axis] = moving.rest + Math.sin(time * idle.rate + moving.phase) * idle.amount;
    }
  }

  private key(piece: Entity): string {
    return String(piece.getValue(SetPiece, 'label'));
  }

  private prepare(): boolean {
    for (const piece of this.queries.pieces.entities) if (piece.object3D == null) return false;
    const saved = loadJson<Saved>(StoreKey.Tray);
    // What an older build saved may name pieces this one does not have.
    const kept = Array.isArray(saved?.on) ? saved.on.filter((label) => assetByLabel(label) != null) : STARTING_ASSETS;
    for (const label of kept) this.on.add(label);
    for (const [key, value] of Object.entries(saved?.cast ?? {})) this.cast.set(key, value);
    for (const [key, value] of Object.entries(saved?.finish ?? {})) this.finish.set(key, value);
    for (const piece of this.queries.pieces.entities) {
      if (assetByLabel(this.key(piece)) == null) continue;
      this.managed.push(piece);
      this.show(piece, this.on.has(this.key(piece)));
      // A camera's head tilts every frame, so a camera is left to work its own matrices out.
      if (!piece.hasComponent(ShotCamera)) this.freeze(piece);
      piece.object3D!.traverse((object) => {
        if (object instanceof Mesh && PAINTED.test(object.name)) withGrain(object.material as MeshStandardMaterial);
        if (object.name !== 'EffectParticles') return;
        this.effects.push((object as Mesh).material as ShaderMaterial);
        object.raycast = () => {};
      });
      const value = this.cast.get(this.key(piece));
      if (value && piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, value);
      const finish = this.finishOf(this.key(piece));
      if (finish[0] !== 0 || finish[1] !== 0 || finish[2] !== 0 || (finish[3] ?? 0) > 0) this.coat(piece, finish);
      this.closeHidden(piece);
    }
    const g = this.globals as Globals;
    if (saved != null && Number.isInteger(saved.sensor) && SENSORS[saved.sensor]) g.sensorIndex.value = saved.sensor;
    if (saved?.rig === Rig.Drone) g.cameraRig.value = Rig.Drone;
    else this.applyRig(g.cameraRig.peek());
    this.publish();
    this.occlude();
    return true;
  }

  /** On trial, see index.ts: solid pieces go behind the wearer's real hands. Effects draw their own way. */
  private occlude(): void {
    const mode = (this.globals as Globals).occlusion.peek();
    if (mode == null) return;
    for (const piece of this.managed) {
      if (assetByLabel(this.key(piece))?.shelf === 'Effects') continue;
      piece.addComponent(DepthOccludable, {
        mode: mode === 'soft' ? OcclusionShadersMode.SoftOcclusion : OcclusionShadersMode.HardOcclusion,
      });
    }
  }

  /**
   * A piece moves as one body, so its parts need their local matrix worked out
   * only once. A part that moves on its own keeps working its matrix out.
   */
  private freeze(piece: Entity): void {
    const root = piece.object3D!;
    root.traverse((part) => {
      if (part === root || part.name === 'HoverRing') return;
      const idle = part.userData.idle as Idle | undefined;
      if (idle != null) {
        // A pair of wings carries opposite amounts, so one clock beats both together.
        this.moving.push({ piece, part, idle, rest: part.rotation[idle.axis], phase: 0 });
        this.restless.add(this.key(piece));
        return;
      }
      part.updateMatrix();
      part.matrixAutoUpdate = false;
    });
  }

  /**
   * The poses and fittings that are not showing are closed to the pointers from the start. Pressing
   * Pose or the fitting button keeps this up to date; a piece nobody has changed yet needs it too.
   */
  private closeHidden(piece: Entity): void {
    piece.object3D!.traverse((part) => {
      if (/^(Pose|Style)\d$/.test(part.name)) (part as Walked).intersectChildren = part.visible;
    });
  }

  private show(piece: Entity, on: boolean): void {
    const object = piece.object3D!;
    object.visible = on;
    // A pointer walks every child of everything it may touch, seen or not: a piece on the shelf is closed to it.
    (object as Walked).intersectChildren = on;
    // At full size nothing is within reach; coming back to the table sets this from `visible`.
    if (!(this.globals as Globals).lifeSize.peek()) object.pointerEvents = on ? 'auto' : 'none';
  }

  private toggle(label: string): void {
    const next = new Set(this.on);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    const added = next.has(label);
    this.setOn(next);
    if (!added) return;
    this.clearSpot(label);
    this.layoutDone();
    // What was just added is what the panel offers to change.
    this.selected = this.managed.find((entity) => this.key(entity) === label) ?? this.selected;
    this.publishSelected();
  }

  private layoutDone(): void {
    const g = this.globals as Globals;
    g.layoutChanged.value = g.layoutChanged.peek() + 1;
  }

  /** A whole set cannot change under a hand or under a take. Says why not, and returns false. */
  private readyToRebuild(): boolean {
    const g = this.globals as Globals;
    if (g.takeState.peek() !== 'idle') {
      g.coachNote.value = 'STOP THE TAKE FIRST | A take is running. Stop it, then change the set.';
      return false;
    }
    if (this.queries.held.entities.size > 0) {
      g.coachNote.value = 'LET GO FIRST | Put down what you are holding, then change the set.';
      return false;
    }
    return true;
  }

  /** Spares of this piece that are off the set, next first. */
  private freeSpares(label: string): string[] {
    const base = assetByLabel(label)?.spareOf ?? label;
    return [base, ...sparesOf(base)].filter((name) => name !== label && !this.on.has(name) && assetByLabel(name) != null);
  }

  /** Another of the chosen piece, dressed the same. */
  private copy(): void {
    const piece = this.selected;
    if (piece == null) return;
    const label = this.key(piece);
    const spare = this.freeSpares(label)[0];
    if (spare == null) return;
    this.finish.set(spare, [...this.finishOf(label)]);
    const copy = this.managed.find((entity) => this.key(entity) === spare);
    if (copy != null) {
      this.coat(copy, this.finishOf(spare));
      copy.object3D?.quaternion.copy(piece.object3D!.quaternion);
      copy.object3D?.position.copy(piece.object3D!.position);
    }
    this.toggle(spare);
  }

  /** A piece put on the set from the shelf goes where nothing else is standing, or as near to that as there is. */
  private clearSpot(label: string): void {
    const piece = this.managed.find((entity) => this.key(entity) === label);
    const object = piece?.object3D;
    if (piece == null || object == null) return;
    const reach = (assetByLabel(label)?.grab?.[0] ?? DEFAULT_REACH) * object.scale.x;
    /** How much room is left at a spot once everything standing near it has had its share; below zero it overlaps. */
    const room = (x: number, z: number): number => {
      let least = Infinity;
      for (const other of this.queries.pieces.entities) {
        const there = other.object3D;
        if (other === piece || there == null || !there.visible || there.parent !== object.parent) continue;
        const needs = reach + (assetByLabel(this.key(other))?.grab?.[0] ?? DEFAULT_REACH) * there.scale.x * 0.7;
        least = Math.min(least, Math.hypot(there.position.x - x, there.position.z - z) - needs);
      }
      return least;
    };
    if (room(object.position.x, object.position.z) >= 0) return;
    let best: [number, number] | null = null;
    let bestRoom = -Infinity;
    for (const spot of reach >= BIG ? BACK_SPOTS : SPOTS) {
      const here = room(spot[0], spot[1]);
      if (here >= 0) {
        best = spot;
        break;
      }
      if (here > bestRoom) {
        bestRoom = here;
        best = spot;
      }
    }
    if (best != null) object.position.set(best[0], 0, best[1]);
  }

  /**
   * A set described in words: what was named goes on, where there is room,
   * painted and sized as asked. Only what is in the library can be named, and
   * what was named that is not there is said back.
   */
  private build(spoken: Spoken): void {
    const { request, text, staging, aim } = spoken;
    const g = this.globals as Globals;
    g.lastSpoken.value = text;
    if (!this.readyToRebuild()) return;
    if (staging != null) {
      this.stage(staging);
      // Anything else that was named goes on around the blocking.
      const taken = new Set(staging.pieces.map((placed) => placed.label.replace(/ \d$/, '')));
      // The beat decides who is in it, so "everyone" or "two actors" does not add more people.
      const extras = request.items.filter((item) => !taken.has(item.label) && assetByLabel(item.label)?.tape == null);
      if (extras.length > 0) this.build({ ...spoken, staging: null, aim: false, request: { clear: false, items: extras, remove: [], unknown: [] } });
      const also = extras.length > 0 ? ` Also on: ${extras.map((item) => assetTitle(item.label)).join(', ')}.` : '';
      // Around a beat that was understood, a stray unknown word is far more often a mishearing than a request.
      g.coachNote.value = `${staging.title.toUpperCase()} | ${staging.says}${also} Everything can be moved.`;
      return;
    }
    if (aim) {
      // "Two actors with guns and a car": the pieces go on first, then everyone takes aim.
      if (request.items.length > 0 || request.remove.length > 0 || request.clear) this.build({ ...spoken, aim: false });
      this.takeAim();
      return;
    }
    const next = request.clear ? new Set<string>() : new Set(this.on);
    // Starting over clears the dressing, not the camera department.
    if (request.clear) for (const label of this.on) if (assetByLabel(label)?.shelf === 'Kit') next.add(label);
    for (const label of request.remove) {
      next.delete(label);
      for (const spare of sparesOf(label)) next.delete(spare);
    }
    const placed: string[] = [];
    const refinished: string[] = [];
    let onlyOne = false;
    for (const item of request.items) {
      const asset = assetByLabel(item.label);
      if (asset == null || asset.shelf === 'Kit') continue;
      if (!this.on.has(item.label)) placed.push(item.label);
      next.add(item.label);
      // More than one: as many spares as the kit has.
      const spares = sparesOf(item.label).slice(0, item.count - 1);
      for (const spare of spares) {
        if (!this.on.has(spare)) placed.push(spare);
        next.add(spare);
      }
      if (item.count - 1 > spares.length) onlyOne = true;
      const finish: Finish = [...this.finishOf(item.label)];
      const paint = item.colour == null ? -1 : PAINTS.findIndex((p) => p.name.toLowerCase() === item.colour);
      const size = item.size == null ? -1 : SIZES.findIndex((s) => s.name.toLowerCase() === item.size);
      if (paint >= 0 && asset.paint === true) finish[0] = paint;
      if (size >= 0) {
        finish[1] = size;
        // A size asked for in words stands over whatever two hands made of the piece.
        finish[3] = 0;
      }
      if ((paint >= 0 && asset.paint === true) || size >= 0) {
        for (const name of [item.label, ...spares]) {
          this.finish.set(name, [...finish]);
          refinished.push(name);
        }
      }
    }
    for (const piece of this.managed) if (refinished.includes(this.key(piece))) this.coat(piece, this.finishOf(this.key(piece)));
    this.setOn(next);
    for (const label of placed) this.clearSpot(label);
    this.layoutDone();
    // A set started over is a new blocking: everyone on it is back on their feet.
    if (request.clear) g.setupRecalled.value = g.setupRecalled.peek() + 1;
    // "A burning car": the fire goes on the thing that was named before it.
    const fire = request.items.findIndex((item) => item.label === 'Fire');
    if (fire > 0 && BURNING.test(text)) {
      const on = this.managed.find((piece) => this.key(piece) === request.items[fire - 1].label)?.object3D;
      const flames = this.managed.find((piece) => this.key(piece) === 'Fire')?.object3D;
      if (on != null && flames != null) flames.position.set(on.position.x, 0, on.position.z);
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();

    // One line for each kind of thing, however many times it was named.
    const counted = new Map<string, number>();
    for (const item of request.items) counted.set(item.label, (counted.get(item.label) ?? 0) + item.count);
    const names = [...counted].map(([label, count]) => (count > 1 ? `${count} x ${assetTitle(label)}` : assetTitle(label)));
    const listed = names.length > NAMED_AT_MOST ? `${names.slice(0, NAMED_AT_MOST).join(', ')} and ${names.length - NAMED_AT_MOST} more` : names.join(', ');
    const parts: string[] = [];
    if (listed !== '') parts.push(`On the set: ${listed}.`);
    if (request.remove.length > 0) parts.push(`Off: ${request.remove.map((label) => assetTitle(label)).join(', ')}.`);
    if (onlyOne) parts.push('That is all the kit has of those.');
    if (request.unknown.length > 0) parts.push(`Not in the kit: ${request.unknown.join(', ')}.`);
    if (parts.length === 0 && request.clear) parts.push('The set is clear.');
    if (parts.length === 0) {
      g.coachNote.value = 'DID NOT CATCH THAT | Name pieces from the library: a dragon, two actors, a red car.';
      return;
    }
    const nothingDone = names.length === 0 && request.remove.length === 0 && !request.clear;
    g.coachNote.value = `${nothingDone ? 'NOT IN THE KIT' : 'SET FROM YOUR WORDS'} | ${parts.join(' ')}`;
  }

  /** A set from the library. */
  private startScene(index: number): void {
    const scene = SCENES[index];
    if (scene == null || !this.readyToRebuild()) return;
    this.stage(scene);
  }

  /** Every actor on the set takes aim at the next one. With nobody on the set, two come on to do it. */
  private takeAim(): void {
    const g = this.globals as Globals;
    const isActor = (label: string): boolean =>
      this.managed.some((piece) => this.key(piece) === label && piece.getValue(SetPiece, 'role') === SetRole.Actor);
    if (![...this.on].some(isActor)) {
      this.setOn(new Set([...this.on, 'A', 'B']));
      this.clearSpot('A');
      this.clearSpot('B');
    }
    const actors = this.managed.filter((piece) => this.on.has(this.key(piece)) && isActor(this.key(piece)));
    actors.forEach((piece, i) => {
      const key = this.key(piece);
      const value: [number, number] = [AIM, this.cast.get(key)?.[1] ?? 0];
      this.cast.set(key, value);
      this.dress(piece, value);
      const from = piece.object3D;
      const to = actors[(i + 1) % actors.length].object3D;
      if (from != null && to != null && actors.length > 1) {
        from.rotation.set(0, Math.atan2(to.position.x - from.position.x, to.position.z - from.position.z), 0);
      }
    });
    this.layoutDone();
    this.publishSelected();
    this.save();
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.coachNote.value = `AIM | ${actors.length === 1 ? 'Your actor takes aim.' : 'Each actor aiming at the next.'} Everything can be moved.`;
  }

  /** A whole set: every piece to its mark, dressed, and the camera where it should be. */
  private stage(scene: Scene): void {
    const g = this.globals as Globals;
    // A take belongs to the set it was shot on; left alone it would drag these pieces back.
    const hadTake = g.takeLength.peek() > 0;
    if (hadTake) g.takeClear.value = g.takeClear.peek() + 1;
    if (g.cameraOn.peek() !== CAMERAS[0]) g.cameraOn.value = CAMERAS[0];
    const keep = [...this.on].filter((label) => assetByLabel(label)?.shelf === 'Kit');
    this.cast.clear();
    this.finish.clear();
    for (const placed of scene.pieces) {
      this.finish.set(placed.label, [placed.paint ?? 0, placed.size ?? 0, placed.style ?? 0]);
      if (placed.pose != null || placed.look != null) this.cast.set(placed.label, [placed.pose ?? 0, placed.look ?? 0]);
    }
    this.wear({ cast: Object.fromEntries(this.cast), finish: Object.fromEntries(this.finish) });
    this.setOn(new Set([...keep, ...scene.pieces.map((placed) => placed.label)]));
    for (const placed of scene.pieces) {
      const object = this.managed.find((piece) => this.key(piece) === placed.label)?.object3D;
      if (object == null) continue;
      object.position.set(placed.x, 0, placed.z);
      object.rotation.set(0, ((placed.yaw ?? 0) * Math.PI) / 180, 0);
    }
    const camera = [...this.queries.cams.entities].find((cam) => this.key(cam) === CAMERAS[0]);
    if (camera?.object3D != null) {
      const [x, z, yaw] = scene.camera;
      camera.object3D.position.set(x, camera.object3D.position.y, z);
      camera.object3D.rotation.set(0, (yaw * Math.PI) / 180, 0);
      camera.setValue(ShotCamera, 'aimed', false);
    }
    g.lensMm.value = scene.lens;
    this.world.getSystem(ViewfinderSystem)?.refresh();
    g.setupRecalled.value = g.setupRecalled.peek() + 1;
    g.coachNote.value = `${scene.title.toUpperCase()} | ${hadTake ? 'The last take is cleared. ' : ''}Everything here can be moved. Pick up a piece, or look through the lens.`;
  }

  /** The set as it should stand: everything listed on it, everything else back on the shelf. */
  private setOn(next: Set<string>): void {
    this.on = next;
    for (const piece of this.managed) {
      const on = next.has(this.key(piece));
      this.show(piece, on);
      if (!on && piece === this.selected) this.selected = null;
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
    this.publish();
    this.save();
  }

  private publish(): void {
    const g = this.globals as Globals;
    g.trayOn.value = [...this.on];
    let live = 0;
    for (const label of this.on) if (assetByLabel(label)?.shelf === 'Effects' || this.restless.has(label)) live++;
    g.effectsOn.value = live;
    this.publishSelected();
  }

  private publishDress(): void {
    (this.globals as Globals).trayDress.value = {
      cast: Object.fromEntries(this.cast),
      finish: Object.fromEntries(this.finish),
    };
  }

  private step(field: 0 | 1, size: number): void {
    const actor = this.selected;
    if (actor == null || actor.getValue(SetPiece, 'role') !== SetRole.Actor) return;
    const key = this.key(actor);
    const value = this.cast.get(key) ?? [0, 0];
    value[field] = (value[field] + 1) % size;
    this.cast.set(key, value);
    this.dress(actor, value);
    this.publishSelected();
    this.save();
  }

  /**
   * The first piece picked up once the opening steps are done says where its changes are: on the
   * panel, whatever tab is open, and in the other hand. Said once a visit.
   */
  private sayWhereChangesAre(piece: Entity): void {
    const g = this.globals as Globals;
    const key = this.key(piece);
    const asset = assetByLabel(key);
    if (this.toldChanges || asset == null || asset.shelf === 'Kit' || /^\d OF \d/.test(g.coachLine.peek())) return;
    this.toldChanges = true;
    const actor = piece.getValue(SetPiece, 'role') === SetRole.Actor;
    const what = actor ? 'pose, look and size are' : asset.paint === true ? 'paint, size and fitting are' : 'size is';
    g.coachNote.value = `${assetTitle(key).toUpperCase()} | Its ${what} on the panel, on any tab. Pinch it with your other hand to stretch it.`;
  }

  private resize(label: string, scale: number): void {
    const piece = this.managed.find((entity) => this.key(entity) === label);
    // Taken off the set while it was being stretched: there is nothing to size, and nothing to select.
    if (piece == null || assetByLabel(label) == null || !this.on.has(label)) return;
    const value: Finish = [...this.finishOf(label)];
    value[3] = Math.round(scale * 100) / 100;
    this.finish.set(label, value);
    this.coat(piece, value);
    this.selected = piece;
    this.publishSelected();
    this.save();
  }

  /** How a piece is finished: what the wearer chose, or the paint it comes in. */
  private finishOf(key: string): Finish {
    return this.finish.get(key) ?? [0, 0, 0];
  }

  /** Paint is chosen; size and fitting step to the next. */
  private refinish(field: 0 | 1 | 2, pick: number): void {
    const piece = this.selected;
    if (piece == null) return;
    const key = this.key(piece);
    const asset = assetByLabel(key);
    if (asset == null) return;
    const value: Finish = [...this.finishOf(key)];
    if (asset.shelf === 'Kit') return;
    if (field === 0) {
      if (asset.paint !== true) return;
      value[0] = pick;
    } else if (field === 1) {
      value[1] = (value[1] + 1) % SIZES.length;
      // The Size button goes back to its own steps from whatever two hands made of it.
      value[3] = 0;
    } else {
      const count = asset.styles?.length ?? 0;
      if (count < 2) return;
      value[2] = (value[2] + 1) % count;
    }
    this.finish.set(key, value);
    this.coat(piece, value);
    this.publishSelected();
    this.save();
  }

  /** One pose shows; its clothes are the look, tinted over the figure's own wood. */
  private dress(actor: Entity, [pose, look]: [number, number]): void {
    const style = LOOKS[look] ?? LOOKS[0];
    for (const child of actor.object3D!.children) {
      const match = /^Pose(\d)$/.exec(child.name);
      if (match == null) continue;
      child.visible = Number(match[1]) === pose;
      (child as Walked).intersectChildren = child.visible;
      child.traverse((object) => {
        if (object.name === 'Hair') object.visible = style.hair;
        if (!(object instanceof Mesh)) return;
        const colour = WOOD_TOP.test(object.name) ? style.top : WOOD_LEGS.test(object.name) ? style.legs : -1;
        if (colour < 0) return;
        this.tint(object, colour);
      });
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
  }

  /** This one piece's own copy of a material, in this colour; zero is the colour it came in. */
  private tint(mesh: Mesh, colour: number): void {
    const material = mesh.material as MeshStandardMaterial;
    const key = 'ownColour';
    if (mesh.userData[key] == null) {
      const own = material.clone();
      // clone() leaves these behind, and the occlusion trial lives in them.
      own.onBeforeCompile = material.onBeforeCompile;
      own.customProgramCacheKey = material.customProgramCacheKey;
      if (PAINTED.test(mesh.name)) withGrain(own);
      mesh.material = own;
      mesh.userData[key] = material.color.getHex();
    }
    (mesh.material as MeshStandardMaterial).color.setHex(colour === 0 ? mesh.userData[key] : colour);
  }

  /** Paint on the body, the size of the whole piece, and which fitting shows. */
  private coat(piece: Entity, [paint, size, style, free]: Finish): void {
    const object = piece.object3D!;
    const asset = assetByLabel(this.key(piece));
    const scale = free != null && free > 0 ? free : (SIZES[size]?.scale ?? 1);
    object.scale.setScalar(scale);
    object.traverse((part) => {
      const fitting = /^Style(\d)$/.exec(part.name);
      if (fitting != null) {
        part.visible = Number(fitting[1]) === style;
        (part as Walked).intersectChildren = part.visible;
        return;
      }
      if (part.name === 'Horn') {
        part.visible = style === 1;
        return;
      }
      if (part.name === 'EffectParticles') {
        ((part as Mesh).material as ShaderMaterial).uniforms.uGrow.value = scale;
        return;
      }
      if (asset?.paint === true && part instanceof Mesh && PAINTED.test(part.name)) this.tint(part, PAINTS[paint]?.hex ?? 0);
    });
    this.world.getSystem(ViewfinderSystem)?.refresh();
  }

  /** A frame's own dressing, put back on: every actor and prop as it was when the frame was taken. */
  private wear(dress: Dress): void {
    this.cast = new Map(Object.entries(dress.cast ?? {}));
    this.finish = new Map(Object.entries(dress.finish ?? {}));
    for (const piece of this.managed) {
      const key = this.key(piece);
      if (piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, this.cast.get(key) ?? [0, 0]);
      this.coat(piece, this.finishOf(key));
    }
    this.publishSelected();
    this.save();
  }

  private publishSelected(): void {
    const g = this.globals as Globals;
    const piece = this.selected;
    const asset = piece == null ? undefined : assetByLabel(this.key(piece));
    this.publishDress();
    if (piece == null || asset == null) {
      g.castLine.value = '';
      g.selectedIsActor.value = false;
      g.selectedPaint.value = -1;
      g.selectedStyles.value = false;
      g.selectedCopies.value = false;
      g.selectedLabel.value = '';
      return;
    }
    const actor = piece.getValue(SetPiece, 'role') === SetRole.Actor;
    const key = this.key(piece);
    const [pose, look] = this.cast.get(key) ?? [0, 0];
    const [paint, size, style, free] = this.finishOf(key);
    const words: string[] = [];
    if (actor) words.push(POSES[pose] ?? POSES[0], (LOOKS[look] ?? LOOKS[0]).name);
    if (asset.paint === true && paint > 0 && PAINTS[paint]) words.push(PAINTS[paint].name);
    if (free != null && free > 0) words.push(`${Math.round(free * 100)} %`);
    else if (size > 0 && SIZES[size]) words.push(SIZES[size].name);
    if (style > 0 && asset.styles) words.push(asset.styles[style]);
    g.castLine.value = words.length > 0 ? `${assetTitle(key)}: ${words.join(', ')}` : assetTitle(key);
    g.selectedIsActor.value = actor;
    g.selectedPaint.value = asset.paint === true ? paint : -1;
    g.selectedStyles.value = (asset.styles?.length ?? 0) > 1;
    g.selectedCopies.value = this.freeSpares(key).length > 0;
    g.selectedLabel.value = key;
  }

  /** The same camera on legs or in the air. A flown camera goes up on its own; a landed one comes down. */
  private applyRig(rig: string): void {
    this.rotors.length = 0;
    for (const cam of this.queries.cams.entities) {
      const object = cam.object3D;
      if (object == null) continue;
      // Only the first camera flies; the second is always on legs.
      const first = this.key(cam) === CAMERAS[0];
      const drone = first && rig === Rig.Drone;
      for (const child of object.children) {
        if (TRIPOD.test(child.name)) child.visible = !drone;
        if (child.name !== 'DroneFrame') continue;
        child.visible = drone;
        if (drone) {
          for (const part of child.children) if (part.name.startsWith('DroneRotor')) this.rotors.push(part);
        }
      }
      if (!first) continue;
      if (drone) object.position.y = Math.max(object.position.y, DRONE_START);
      else object.position.y = Math.min(object.position.y, TRIPOD_MAX);
    }
  }

  private save(): void {
    if (!this.ready) return;
    const g = this.globals as Globals;
    saveJson(StoreKey.Tray, {
      on: [...this.on],
      cast: Object.fromEntries(this.cast),
      finish: Object.fromEntries(this.finish),
      sensor: g.sensorIndex.peek(),
      rig: g.cameraRig.peek(),
    } satisfies Saved);
  }

  /** A new board starts from the opening cast, in wood and primer. The camera kit stays as it is. */
  private clear(): void {
    this.wear({ cast: {}, finish: {} });
    clearKey(StoreKey.Tray);
    this.setOn(new Set(STARTING_ASSETS));
  }
}
