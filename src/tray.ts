/**
 * The asset library at work on the set: what is on the slate, what was last
 * picked up, an actor's pose and look, the camera's format and rig. All of it
 * is kept between visits. Effects and rotors are the only things here that run
 * on their own, so this is also where their clock lives.
 */
import { createSystem, Entity, Grabbed, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Rig, SENSORS } from './camera-formats.js';
import { assetByLabel, assetTitle, STARTING_ASSETS } from './catalog.js';
import { SetPiece, SetRole, ShotCamera } from './set-components.js';
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
const TRIPOD = /^(Base|Post|Leg\d|TripodHead)$/;
/** Where a drone hovers when it is first switched on, and the most a tripod stands. */
const DRONE_START = 0.45;
const TRIPOD_MAX = 0.45;
const ROTOR_SPEED = 60;

type Saved = { on: string[]; cast: Record<string, [number, number]>; sensor: number; rig: string };
type Globals = {
  trayToggle: Signal<string>;
  trayOn: Signal<string[]>;
  trayRestore: Signal<string[] | null>;
  effectsOn: Signal<number>;
  removeSelected: Signal<number>;
  clearSet: Signal<number>;
  selectedIsActor: Signal<boolean>;
  poseRequested: Signal<number>;
  lookRequested: Signal<number>;
  castLine: Signal<string>;
  sensorIndex: Signal<number>;
  cameraRig: Signal<string>;
  newBoardRequested: Signal<number>;
};

export class TraySystem extends createSystem({
  pieces: { required: [SetPiece] },
  held: { required: [SetPiece, Grabbed] },
  cams: { required: [ShotCamera] },
}) {
  private managed: Entity[] = [];
  private effects: ShaderMaterial[] = [];
  /** Materials of the effects that are on the set, the ones whose clock runs. */
  private on = new Set<string>();
  private rotors: Object3D[] = [];
  private cast = new Map<string, [number, number]>();
  private selected: Entity | null = null;
  private ready = false;
  private seen = { pose: 0, look: 0, board: 0, remove: 0, clear: 0 };

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
      counter(g.poseRequested, 'pose', () => this.step(0, POSES.length)),
      counter(g.lookRequested, 'look', () => this.step(1, LOOKS.length)),
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
        if (piece.getValue(SetPiece, 'role') === SetRole.Stage) return;
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
  }

  private key(piece: Entity): string {
    return String(piece.getValue(SetPiece, 'label'));
  }

  private prepare(): boolean {
    for (const piece of this.queries.pieces.entities) if (piece.object3D == null) return false;
    const saved = loadJson<Saved>(StoreKey.Tray);
    for (const label of saved?.on ?? STARTING_ASSETS) this.on.add(label);
    for (const [key, value] of Object.entries(saved?.cast ?? {})) this.cast.set(key, value);
    for (const piece of this.queries.pieces.entities) {
      if (assetByLabel(this.key(piece)) == null) continue;
      this.managed.push(piece);
      this.show(piece, this.on.has(this.key(piece)));
      this.freeze(piece.object3D!);
      piece.object3D!.traverse((object) => {
        if (object.name !== 'EffectParticles') return;
        this.effects.push((object as Mesh).material as ShaderMaterial);
        object.raycast = () => {};
      });
      const value = this.cast.get(this.key(piece));
      if (value && piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, value);
    }
    const g = this.globals as Globals;
    if (saved != null && Number.isInteger(saved.sensor) && SENSORS[saved.sensor]) g.sensorIndex.value = saved.sensor;
    if (saved?.rig === Rig.Drone) g.cameraRig.value = Rig.Drone;
    else this.applyRig(g.cameraRig.peek());
    this.publish();
    return true;
  }

  /** A piece moves as one body, so its parts need their local matrix worked out only once. */
  private freeze(root: Object3D): void {
    root.traverse((part) => {
      if (part === root) return;
      part.updateMatrix();
      part.matrixAutoUpdate = false;
    });
  }

  private show(piece: Entity, on: boolean): void {
    const object = piece.object3D!;
    object.visible = on;
    (object as Object3D & { pointerEvents?: string }).pointerEvents = on ? 'auto' : 'none';
  }

  private toggle(label: string): void {
    const next = new Set(this.on);
    if (next.has(label)) next.delete(label);
    else next.add(label);
    this.setOn(next);
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
    for (const label of this.on) if (assetByLabel(label)?.shelf === 'Effects') live++;
    g.effectsOn.value = live;
    this.publishSelected();
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
        const material = object.material as MeshStandardMaterial;
        const key = 'woodColour';
        if (object.userData[key] == null) {
          object.material = material.clone();
          object.userData[key] = material.color.getHex();
        }
        (object.material as MeshStandardMaterial).color.setHex(colour === 0 ? object.userData[key] : colour);
      });
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
  }

  private publishSelected(): void {
    const g = this.globals as Globals;
    const piece = this.selected;
    const actor = piece != null && piece.getValue(SetPiece, 'role') === SetRole.Actor;
    if (piece == null || assetByLabel(this.key(piece)) == null) {
      g.castLine.value = '';
      g.selectedIsActor.value = false;
      return;
    }
    const [pose, look] = this.cast.get(this.key(piece)) ?? [0, 0];
    g.castLine.value = actor
      ? `${assetTitle(this.key(piece))}: ${POSES[pose]}, ${LOOKS[look].name}`
      : assetTitle(this.key(piece));
    g.selectedIsActor.value = actor;
  }

  /** The same camera on legs or in the air. A flown camera goes up on its own; a landed one comes down. */
  private applyRig(rig: string): void {
    const cam = this.queries.cams.entities.values().next().value as Entity | undefined;
    const object = cam?.object3D;
    if (object == null) return;
    const drone = rig === Rig.Drone;
    this.rotors.length = 0;
    for (const child of object.children) {
      if (TRIPOD.test(child.name)) child.visible = !drone;
      if (child.name !== 'DroneFrame') continue;
      child.visible = drone;
      if (drone) {
        for (const part of child.children) if (part.name.startsWith('DroneRotor')) this.rotors.push(part);
      }
    }
    if (drone) object.position.y = Math.max(object.position.y, DRONE_START);
    else object.position.y = Math.min(object.position.y, TRIPOD_MAX);
  }

  private save(): void {
    if (!this.ready) return;
    const g = this.globals as Globals;
    saveJson(StoreKey.Tray, {
      on: [...this.on],
      cast: Object.fromEntries(this.cast),
      sensor: g.sensorIndex.peek(),
      rig: g.cameraRig.peek(),
    } satisfies Saved);
  }

  /** A new board starts from the opening cast, in wood. The camera kit stays as it is. */
  private clear(): void {
    for (const piece of this.managed) {
      if (piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, [0, 0]);
    }
    this.cast.clear();
    clearKey(StoreKey.Tray);
    this.setOn(new Set(STARTING_ASSETS));
  }
}
