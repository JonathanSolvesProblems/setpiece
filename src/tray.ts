/**
 * What the director adds and changes on the set: props and effects from the
 * tray, an actor's pose and look, the camera's format and rig. All of it is kept
 * between visits. Effects and rotors are the only things here that run on their
 * own, so this is also where their clock lives.
 */
import { createSystem, Entity, Grabbed, Mesh, MeshStandardMaterial, Object3D, ShaderMaterial } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { Rig, SENSORS } from './camera-formats.js';
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
export const POSES = ['Blocking', 'Neutral', 'Arms up', 'Running'] as const;
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
  effectsOn: Signal<number>;
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
  private props: Entity[] = [];
  private effects: ShaderMaterial[] = [];
  private on = new Set<string>();
  private rotors: Object3D[] = [];
  private cast = new Map<string, [number, number]>();
  private actor: Entity | null = null;
  private ready = false;
  private seen = { pose: 0, look: 0, board: 0 };

  init(): void {
    const g = this.globals as Globals;
    this.cleanupFuncs.push(
      g.trayToggle.subscribe((label) => {
        if (label === '') return;
        g.trayToggle.value = '';
        if (this.ready) this.toggle(label);
      }),
      g.poseRequested.subscribe((n) => {
        if (n > this.seen.pose) {
          this.seen.pose = n;
          this.step(0, POSES.length);
        }
      }),
      g.lookRequested.subscribe((n) => {
        if (n > this.seen.look) {
          this.seen.look = n;
          this.step(1, LOOKS.length);
        }
      }),
      g.sensorIndex.subscribe(() => this.save()),
      g.cameraRig.subscribe((rig) => {
        this.applyRig(rig);
        this.save();
      }),
      g.newBoardRequested.subscribe((n) => {
        if (n > this.seen.board) {
          this.seen.board = n;
          this.clear();
        }
      }),
      // The actor last picked up is the one the panel changes.
      this.queries.held.subscribe('qualify', (piece) => {
        if (piece.getValue(SetPiece, 'role') !== SetRole.Actor) return;
        this.actor = piece;
        this.publishCast();
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
    for (const label of saved?.on ?? []) this.on.add(label);
    for (const [key, value] of Object.entries(saved?.cast ?? {})) this.cast.set(key, value);
    for (const piece of this.queries.pieces.entities) {
      const role = piece.getValue(SetPiece, 'role');
      if (role === SetRole.Prop) {
        this.props.push(piece);
        this.show(piece, this.on.has(this.key(piece)));
        piece.object3D!.traverse((object) => {
          if (object.name !== 'EffectParticles') return;
          this.effects.push((object as Mesh).material as ShaderMaterial);
          object.raycast = () => {};
        });
      } else if (role === SetRole.Actor) {
        this.actor ??= piece;
        const value = this.cast.get(this.key(piece));
        if (value) this.dress(piece, value);
      }
    }
    const g = this.globals as Globals;
    if (saved != null && Number.isInteger(saved.sensor) && SENSORS[saved.sensor]) g.sensorIndex.value = saved.sensor;
    if (saved?.rig === Rig.Drone) g.cameraRig.value = Rig.Drone;
    else this.applyRig(g.cameraRig.peek());
    this.publish();
    this.publishCast();
    return true;
  }

  private show(piece: Entity, on: boolean): void {
    const object = piece.object3D!;
    object.visible = on;
    (object as Object3D & { pointerEvents?: string }).pointerEvents = on ? undefined : 'none';
  }

  private toggle(label: string): void {
    for (const piece of this.props) {
      if (this.key(piece) !== label) continue;
      const on = !this.on.has(label);
      if (on) this.on.add(label);
      else this.on.delete(label);
      this.show(piece, on);
    }
    this.world.getSystem(ViewfinderSystem)?.refresh();
    this.publish();
    this.save();
  }

  private publish(): void {
    const g = this.globals as Globals;
    g.trayOn.value = [...this.on];
    let live = 0;
    for (const piece of this.props) {
      let effect = false;
      piece.object3D?.traverse((object) => {
        if (object.name === 'EffectParticles') effect = true;
      });
      if (effect && this.on.has(this.key(piece))) live++;
    }
    g.effectsOn.value = live;
  }

  private step(field: 0 | 1, size: number): void {
    const actor = this.actor;
    if (actor == null) return;
    const key = this.key(actor);
    const value = this.cast.get(key) ?? [0, 0];
    value[field] = (value[field] + 1) % size;
    this.cast.set(key, value);
    this.dress(actor, value);
    this.publishCast();
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

  private publishCast(): void {
    const actor = this.actor;
    if (actor == null) return;
    const [pose, look] = this.cast.get(this.key(actor)) ?? [0, 0];
    (this.globals as Globals).castLine.value = `${this.key(actor)}: ${POSES[pose]}, ${LOOKS[look].name}`;
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

  /** A new board keeps the camera kit and clears what was dressed onto the set. */
  private clear(): void {
    this.on.clear();
    for (const piece of this.props) this.show(piece, false);
    for (const piece of this.queries.pieces.entities) {
      if (piece.getValue(SetPiece, 'role') === SetRole.Actor) this.dress(piece, [0, 0]);
    }
    this.cast.clear();
    clearKey(StoreKey.Tray);
    this.publish();
    this.publishCast();
  }
}
