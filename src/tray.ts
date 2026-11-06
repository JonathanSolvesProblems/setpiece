/**
 * The asset library at work on the set: what is on the slate, what was last
 * picked up, an actor's pose and look, a prop's paint, size and fittings, the
 * camera's format and rig. All of it is kept between visits. Effects, rotors
 * and the parts of a creature that move on their own are the only things here
 * that run by themselves, so this is also where their clock lives.
 */
import { createSystem, Entity, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { CAMERAS, Rig, SENSORS } from './camera-formats.js';
import { assetByLabel, assetTitle, PAINTS, SIZES, STARTING_ASSETS } from './catalog.js';
import { Held, SetPiece, SetRole, ShotCamera } from './set-components.js';
import type { Spoken } from './scene-request.js';
import { clearKey, loadJson, saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';

export const LOOKS = [
  { name: 'Wood', top: 0, legs: 0, hair: false },
  { name: 'Dark suit', top: 0x30343f, legs: 0x262a33, hair: true },
  { name: 'Red jacket', top: 0xb3312a, legs: 0x35475f, hair: true },
  { name: 'White shirt', top: 0xe6e4da, legs: 0x2a2c31, hair: true },
  { name: 'Hi-vis', top: 0xd6e13c, legs: 0x2f3a45, hair: true },
] as const;
export const POSES = ['First pose', 'Second pose', 'Arms up', 'Running'] as const;
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
type Finish = [number, number, number];
type Idle = { kind: 'flap' | 'spin' | 'sway'; axis: 'x' | 'y' | 'z'; amount: number; rate: number };
type Moving = { piece: Entity; part: Object3D; idle: Idle; rest: number; phase: number };
export type Dress = { cast: Record<string, [number, number]>; finish: Record<string, Finish> };
type Saved = { on: string[]; sensor: number; rig: string } & Partial<Dress>;
type Globals = {
  sceneRequest: Signal<Spoken | null>;
  coachNote: Signal<string>;
  trayToggle: Signal<string>;
  trayOn: Signal<string[]>;
  trayRestore: Signal<string[] | null>;
  trayDress: Signal<Dress>;
  trayDressRestore: Signal<Dress | null>;
  lifeSize: Signal<boolean>;
  effectsOn: Signal<number>;
  removeSelected: Signal<number>;
  clearSet: Signal<number>;
  selectedIsActor: Signal<boolean>;
  selectedPaint: Signal<number>;
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
  private ready = false;
  private seen = { pose: 0, look: 0, board: 0, remove: 0, clear: 0, size: 0, style: 0 };

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
      g.trayDressRestore.subscribe((dress) => {
        if (dress == null) return;
        g.trayDressRestore.value = null;
        if (this.ready) this.wear(dress);
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
      }),
    );
  }

  update(delta: number, time: number): void {
    if (!this.ready) {
      this.ready = this.prepare();
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
    for (const label of saved?.on ?? STARTING_ASSETS) this.on.add(label);
    for (const [key, value] of Object.entries(saved?.cast ?? {})) this.cast.set(key, value);
    for (const [key, value] of Object.entries(saved?.finish ?? {})) this.finish.set(key, value);
    for (const piece of this.queries.pieces.entities) {
      if (assetByLabel(this.key(piece)) == null) continue;
      this.managed.push(piece);
      this.show(piece, this.on.has(this.key(piece)));
      // A camera's head tilts every frame, so a camera is left to work its own matrices out.
      if (!piece.hasComponent(ShotCamera)) this.freeze(piece);
      piece.object3D!.traverse((object) => {
        if (object.name !== 'EffectParticles') return;
        this.effects.push((object as Mesh).material as ShaderMaterial);
        object.raycast = () => {};
      });
      const value = this.cast.get(this.key(piece));
      if (value && piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, value);
      const finish = this.finishOf(this.key(piece));
      if (finish[0] !== 0 || finish[1] !== 0 || finish[2] !== 0) this.coat(piece, finish);
    }
    const g = this.globals as Globals;
    if (saved != null && Number.isInteger(saved.sensor) && SENSORS[saved.sensor]) g.sensorIndex.value = saved.sensor;
    if (saved?.rig === Rig.Drone) g.cameraRig.value = Rig.Drone;
    else this.applyRig(g.cameraRig.peek());
    this.publish();
    return true;
  }

  /**
   * A piece moves as one body, so its parts need their local matrix worked out
   * only once. A part that moves on its own keeps working its matrix out.
   */
  private freeze(piece: Entity): void {
    const root = piece.object3D!;
    root.traverse((part) => {
      if (part === root) return;
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

  private show(piece: Entity, on: boolean): void {
    const object = piece.object3D!;
    object.visible = on;
    // At full size nothing is within reach; coming back to the table sets this from `visible`.
    if (!(this.globals as Globals).lifeSize.peek()) object.pointerEvents = on ? 'auto' : 'none';
  }

  private toggle(label: string): void {
    const next = new Set(this.on);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    const added = next.has(label);
    this.setOn(next);
    if (added) this.clearSpot(label);
  }

  /** A piece put on the set from the shelf goes where nothing else is standing. */
  private clearSpot(label: string): void {
    const piece = this.managed.find((entity) => this.key(entity) === label);
    const object = piece?.object3D;
    if (piece == null || object == null) return;
    const reach = (assetByLabel(label)?.grab?.[0] ?? DEFAULT_REACH) * object.scale.x;
    const clear = (x: number, z: number): boolean => {
      for (const other of this.queries.pieces.entities) {
        const there = other.object3D;
        if (other === piece || there == null || !there.visible || there.parent !== object.parent) continue;
        const room = reach + (assetByLabel(this.key(other))?.grab?.[0] ?? DEFAULT_REACH) * there.scale.x * 0.7;
        if (Math.hypot(there.position.x - x, there.position.z - z) < room) return false;
      }
      return true;
    };
    if (clear(object.position.x, object.position.z)) return;
    for (const [x, z] of reach >= BIG ? BACK_SPOTS : SPOTS) {
      if (!clear(x, z)) continue;
      object.position.set(x, 0, z);
      return;
    }
  }

  /**
   * A set described in words: what was named goes on, where there is room,
   * painted and sized as asked. Only what is in the library can be named, and
   * what was named that is not there is said back.
   */
  private build({ request, text }: Spoken): void {
    const g = this.globals as Globals;
    const next = request.clear ? new Set<string>() : new Set(this.on);
    // Starting over clears the dressing, not the camera department.
    if (request.clear) for (const label of this.on) if (assetByLabel(label)?.shelf === 'Kit') next.add(label);
    for (const label of request.remove) next.delete(label);
    const placed: string[] = [];
    const refinished: string[] = [];
    let onlyOne = false;
    for (const item of request.items) {
      const asset = assetByLabel(item.label);
      if (asset == null || asset.shelf === 'Kit') continue;
      if (!this.on.has(item.label)) placed.push(item.label);
      next.add(item.label);
      if (item.count > 1) onlyOne = true;
      const finish: Finish = [...this.finishOf(item.label)];
      const paint = item.colour == null ? -1 : PAINTS.findIndex((p) => p.name.toLowerCase() === item.colour);
      const size = item.size == null ? -1 : SIZES.findIndex((s) => s.name.toLowerCase() === item.size);
      if (paint >= 0 && asset.paint === true) finish[0] = paint;
      if (size >= 0) finish[1] = size;
      if ((paint >= 0 && asset.paint === true) || size >= 0) {
        this.finish.set(item.label, finish);
        refinished.push(item.label);
      }
    }
    for (const piece of this.managed) if (refinished.includes(this.key(piece))) this.coat(piece, this.finishOf(this.key(piece)));
    this.setOn(next);
    for (const label of placed) this.clearSpot(label);
    // "A burning car": the fire goes on the thing that was named before it.
    const fire = request.items.findIndex((item) => item.label === 'Fire');
    if (fire > 0 && BURNING.test(text)) {
      const on = this.managed.find((piece) => this.key(piece) === request.items[fire - 1].label)?.object3D;
      const flames = this.managed.find((piece) => this.key(piece) === 'Fire')?.object3D;
      if (on != null && flames != null) flames.position.set(on.position.x, 0, on.position.z);
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();

    const names = request.items.map((item) => assetTitle(item.label));
    const listed = names.length > NAMED_AT_MOST ? `${names.slice(0, NAMED_AT_MOST).join(', ')} and ${names.length - NAMED_AT_MOST} more` : names.join(', ');
    const parts: string[] = [];
    if (listed !== '') parts.push(`On the set: ${listed}.`);
    if (request.remove.length > 0) parts.push(`Off: ${request.remove.map((label) => assetTitle(label)).join(', ')}.`);
    if (onlyOne) parts.push('There is one of each in the kit.');
    if (request.unknown.length > 0) parts.push(`Not in the kit: ${request.unknown.join(', ')}.`);
    if (parts.length === 0 && request.clear) parts.push('The set is clear.');
    if (parts.length === 0) {
      g.coachNote.value = 'DID NOT CATCH THAT | Name pieces from the library: a dragon, two actors, a red car.';
      return;
    }
    const nothingDone = names.length === 0 && request.remove.length === 0 && !request.clear;
    g.coachNote.value = `${nothingDone ? 'NOT IN THE KIT' : 'SET FROM YOUR WORDS'} | ${parts.join(' ')}`;
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

  /** How a piece is finished: what the wearer chose, or the paint it comes in. */
  private finishOf(key: string): Finish {
    return this.finish.get(key) ?? [assetByLabel(key)?.coat ?? 0, 0, 0];
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
      mesh.material = material.clone();
      mesh.userData[key] = material.color.getHex();
    }
    (mesh.material as MeshStandardMaterial).color.setHex(colour === 0 ? mesh.userData[key] : colour);
  }

  /** Paint on the body, the size of the whole piece, and which fitting shows. */
  private coat(piece: Entity, [paint, size, style]: Finish): void {
    const object = piece.object3D!;
    const asset = assetByLabel(this.key(piece));
    const scale = SIZES[size]?.scale ?? 1;
    object.scale.setScalar(scale);
    object.traverse((part) => {
      const fitting = /^Style(\d)$/.exec(part.name);
      if (fitting != null) {
        part.visible = Number(fitting[1]) === style;
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
      return;
    }
    const actor = piece.getValue(SetPiece, 'role') === SetRole.Actor;
    const key = this.key(piece);
    const [pose, look] = this.cast.get(key) ?? [0, 0];
    const [paint, size, style] = this.finishOf(key);
    const words: string[] = [];
    if (actor) words.push(POSES[pose], LOOKS[look].name);
    if (asset.paint === true && paint > 0) words.push(PAINTS[paint].name);
    if (size > 0) words.push(SIZES[size].name);
    if (style > 0 && asset.styles) words.push(asset.styles[style]);
    g.castLine.value = words.length > 0 ? `${assetTitle(key)}: ${words.join(', ')}` : assetTitle(key);
    g.selectedIsActor.value = actor;
    g.selectedPaint.value = asset.paint === true ? paint : -1;
    g.selectedStyles.value = (asset.styles?.length ?? 0) > 1;
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
