/**
 * The pieces the set designer makes. A made piece is a list of parts with a name; it is built into one of the
 * set's empty places (the "Made" slots in the catalog), and from then on it is a piece like any other: it can
 * be picked up, turned, sized, stood on, struck and undone. Which piece is in which place is kept between
 * visits and in every frame's setup, so going back to a frame brings its made pieces back too.
 */
import { createSystem, Entity, Mesh, MeshStandardMaterial } from '@iwsdk/core';
import type { Box3, BufferGeometry } from '@iwsdk/core';
import type { Signal } from '@preact/signals-core';
import { ASSETS, isMade, MADE_PREFIX, MADE_SLOTS } from './catalog.js';
import { buildMade } from './made-shapes.js';
import type { Footprint } from './made-shapes.js';
import { PiecesSystem } from './pieces.js';
import { SetPiece } from './set-components.js';
import { loadJson, saveJson, StoreKey } from './store.js';
import { ViewfinderSystem } from './viewfinder.js';
import { withGrain } from './wood-grain.js';

export type MadeDef = { id: string; name: string; parts: string[] };
type Saved = { defs: MadeDef[]; slots: Record<string, string> };
type Globals = { setReady: Signal<boolean>; trayOn: Signal<string[]>; startOver: Signal<number> };

/** The most made pieces kept between visits: every one in a place, and the latest of the rest. */
const KEEP = 48;
/** Real metres to the slate's. */
const SCALE = 0.1;

export class MadeSystem extends createSystem({
  pieces: { required: [SetPiece] },
}) {
  private defs = new Map<string, MadeDef>();
  private built = new Map<string, { geometry: BufferGeometry; footprint: Footprint; surfaces: Box3[] }>();
  /** Which made piece is in each place. */
  private slots = new Map<string, string>();
  /** When each place was last given a piece, so the one left longest is taken first. */
  private touched = new Map<string, number>();
  private ready = false;
  private made = 0;

  init(): void {
    const g = this.globals as Globals;
    let started = g.startOver.peek();
    this.cleanupFuncs.push(
      // Start over: the made pieces kept off the set are let go, so the designer is no longer told of them.
      g.startOver.subscribe((n) => {
        if (n <= started) return;
        started = n;
        this.forgetOffSet();
      }),
    );
    const viewfinder = this.world.getSystem(ViewfinderSystem);
    if (viewfinder != null) {
      viewfinder.madeState = {
        // Only the places on the set: one off it changes nothing that can be seen, and must not make two sets differ.
        read: () => {
          const on = (this.globals as Globals).trayOn.peek();
          const out: Record<string, string> = {};
          for (const [label, id] of this.slots) if (on.includes(label)) out[label] = id;
          return out;
        },
        apply: (slots) => {
          for (const [label, id] of Object.entries(slots)) if (this.slots.get(label) !== id && this.defs.has(id)) this.fill(label, id);
        },
      };
    }
  }

  update(): void {
    if (this.ready) return;
    const g = this.globals as Globals;
    if (!g.setReady.peek()) return;
    const pieces = this.world.getSystem(PiecesSystem);
    if (pieces == null) return;
    this.ready = true;
    // Every place shares one material: bare wood's grain, under the colours each part is painted.
    const body = this.slotObject(`${MADE_PREFIX}1`)?.getObjectByName('MadeBody') as Mesh | undefined;
    if (body?.material instanceof MeshStandardMaterial) withGrain(body.material);
    const saved = loadJson<Saved>(StoreKey.Made);
    for (const def of Array.isArray(saved?.defs) ? saved.defs : []) {
      if (typeof def?.id !== 'string' || typeof def.name !== 'string' || !Array.isArray(def.parts)) continue;
      if (!def.parts.every((part: unknown) => typeof part === 'string')) continue;
      this.defs.set(def.id, def);
    }
    for (const [label, id] of Object.entries(saved?.slots ?? {})) if (isMade(label) && this.defs.has(id)) this.fill(label, id, false);
  }

  /** The made piece of that name, if one was made this visit or kept from the last: a new one asks for the same thing. */
  find(name: string): MadeDef | null {
    const wanted = name.trim().toLowerCase();
    let found: MadeDef | null = null;
    for (const def of this.defs.values()) if (def.name.toLowerCase() === wanted) found = def;
    return found;
  }

  /** The made piece now in this place. */
  defIn(label: string): MadeDef | null {
    const id = this.slots.get(label);
    return id == null ? null : (this.defs.get(id) ?? null);
  }

  /** How big the made piece in this place is, at full scale. */
  footprintOf(label: string): Footprint | null {
    const id = this.slots.get(label);
    return id == null ? null : (this.built.get(id)?.footprint ?? null);
  }

  /** Each part of the made piece in this place as a box in the piece's own frame, on the slate's scale. */
  surfacesOf(label: string): Box3[] | null {
    const id = this.slots.get(label);
    return id == null ? null : (this.built.get(id)?.surfaces ?? null);
  }

  /** Places holding a made piece that is not on the set, each with its piece. */
  offSet(on: string[]): [string, MadeDef][] {
    // One of each, the latest place first: the designer needs one way to put each back.
    const out: [string, MadeDef][] = [];
    const named = new Set<string>();
    const slots = [...this.slots].sort((a, b) => (this.touched.get(b[0]) ?? 0) - (this.touched.get(a[0]) ?? 0));
    for (const [label, id] of slots) {
      const def = this.defs.get(id);
      if (def == null || on.includes(label) || named.has(def.name.toLowerCase())) continue;
      named.add(def.name.toLowerCase());
      out.push([label, def]);
    }
    return out.slice(0, 8);
  }

  /** The piece in this place made again, as a new piece: a new colour or shape, in the same place on the set. */
  refill(label: string, def: MadeDef): void {
    if (isMade(label)) this.fill(label, def.id);
  }

  /** A new made piece from its parts. Returns null when none of the parts could be read. */
  define(name: string, parts: string[]): MadeDef | null {
    // The same piece asked for again is the same piece.
    const named = name.trim() || 'New piece';
    for (const def of this.defs.values()) {
      if (def.name === named && def.parts.length === parts.length && def.parts.every((part, i) => part === parts[i])) return def;
    }
    if (buildMade(parts) == null) return null;
    const def: MadeDef = { id: `m${Date.now().toString(36)}${(++this.made).toString(36)}`, name: named, parts };
    this.defs.set(def.id, def);
    return def;
  }

  /**
   * Puts a made piece in a free place and returns that place's label: one that already holds it and is off
   * the set if there is one, else the place left longest. Null when every place is on the set.
   */
  place(def: MadeDef, taken: Set<string>): string | null {
    const on = new Set((this.globals as Globals).trayOn.peek());
    let best: string | null = null;
    let oldest = Infinity;
    for (let n = 1; n <= MADE_SLOTS; n++) {
      const label = `${MADE_PREFIX}${n}`;
      if (on.has(label) || taken.has(label)) continue;
      if (this.slots.get(label) === def.id) {
        best = label;
        break;
      }
      const at = this.touched.get(label) ?? 0;
      if (at < oldest) {
        oldest = at;
        best = label;
      }
    }
    if (best == null) return null;
    if (this.slots.get(best) !== def.id) this.fill(best, def.id);
    this.touched.set(best, performance.now());
    return best;
  }

  /** Builds a made piece into a place: its shape, its name on the panel, its reach for a hand. */
  private fill(label: string, id: string, keep = true): void {
    const def = this.defs.get(id);
    const object = this.slotObject(label);
    const body = object?.getObjectByName('MadeBody') as Mesh | undefined;
    const piece = this.slotEntity(label);
    if (def == null || body == null || piece == null) return;
    let built = this.built.get(id);
    if (built == null) {
      const made = buildMade(def.parts);
      if (made == null) return;
      built = { geometry: made.geometry, footprint: made.footprint, surfaces: made.surfaces };
      this.built.set(id, built);
    }
    body.geometry = built.geometry;
    this.slots.set(label, id);
    this.touched.set(label, performance.now());
    const asset = ASSETS.find((entry) => entry.label === label);
    const radius = Math.max(0.03, Math.min(0.3, (Math.max(built.footprint.w, built.footprint.d) / 2) * SCALE));
    const height = Math.max(0.03, Math.min(1, built.footprint.h * SCALE));
    if (asset != null) {
      asset.title = def.name;
      asset.grab = [radius, height];
    }
    this.world.getSystem(PiecesSystem)?.reshape(piece, radius, height, built.surfaces);
    this.world.getSystem(ViewfinderSystem)?.refresh();
    this.forgetUnused();
    if (keep) this.save();
  }

  /** Every made piece not standing on the set, forgotten (Start over). */
  private forgetOffSet(): void {
    const on = (this.globals as Globals).trayOn.peek();
    const standing = new Set<string>();
    for (const [label, id] of this.slots) if (on.includes(label)) standing.add(id);
    for (const id of [...this.defs.keys()]) if (!standing.has(id)) this.defs.delete(id);
    // Their places are emptied too, so none is left pointing at a piece that is gone.
    for (const [label, id] of [...this.slots]) if (!standing.has(id)) this.slots.delete(label);
    this.save();
  }

  /** Shapes no place holds are let go once there are many of them; their parts are kept, to be built again. */
  private forgetUnused(): void {
    if (this.built.size <= MADE_SLOTS * 2) return;
    const held = new Set(this.slots.values());
    for (const [id, built] of this.built) {
      if (held.has(id)) continue;
      built.geometry.dispose();
      this.built.delete(id);
      if (this.built.size <= MADE_SLOTS) break;
    }
  }

  private save(): void {
    const held = new Set(this.slots.values());
    const defs = [...this.defs.values()];
    // Every piece in a place, then the newest of the rest, up to KEEP.
    const kept = [...defs.filter((def) => held.has(def.id)), ...defs.filter((def) => !held.has(def.id)).slice(-KEEP)].slice(0, KEEP + MADE_SLOTS);
    saveJson(StoreKey.Made, { defs: kept, slots: Object.fromEntries(this.slots) } satisfies Saved);
  }

  private slotEntity(label: string): Entity | null {
    for (const piece of this.queries.pieces.entities) if (String(piece.getValue(SetPiece, 'label')) === label) return piece;
    return null;
  }

  private slotObject(label: string) {
    return this.slotEntity(label)?.object3D ?? null;
  }
}
